import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(
  resolve(__dirname, '../../src/x402-xr1d/migrations/001_entitlements.sql'),
  'utf8'
);

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const RESOURCE_HASH = '7de82337df5f68767c6c75206545cfe0e06eeaff6d15889547651eff972d930b';

function withDb(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'xr1d-'));
  const path = join(dir, 'entitlements.sqlite');
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = FULL;');
    db.exec('PRAGMA busy_timeout = 1000;');
    db.exec(MIGRATION);
    return fn({ db, path, dir });
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function insert(db, overrides = {}) {
  const row = {
    entitlementId: 'xr1-entitlement-a',
    invoiceHash: A,
    txid: B,
    resourceId: 'xolos:xilonen:verified-dossier:v1',
    resourceHash: RESOURCE_HASH,
    grantedAt: 1_797_000_000,
    expiresAt: 1_797_003_600,
    status: 'ACTIVE',
    ...overrides
  };
  db.prepare(
    `INSERT INTO xr1_entitlements (
      entitlement_id, invoice_hash, txid, resource_id, resource_hash,
      granted_at, expires_at, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.entitlementId,
    row.invoiceHash,
    row.txid,
    row.resourceId,
    row.resourceHash,
    row.grantedAt,
    row.expiresAt,
    row.status
  );
  return row;
}

function message(error) {
  return String(error?.message ?? error);
}

test('1. migration creates strict XR1D schema at user_version 1', () => {
  withDb(({ db }) => {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);
    const table = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='xr1_entitlements'"
    ).get();
    assert.match(table.sql, /STRICT/);
  });
});

test('2. valid ACTIVE entitlement persists canonical economic binding', () => {
  withDb(({ db }) => {
    insert(db);
    const row = db.prepare(
      'SELECT * FROM xr1_entitlements WHERE invoice_hash = ?'
    ).get(A);
    assert.equal(row.invoice_hash, A);
    assert.equal(row.txid, B);
    assert.equal(row.resource_hash, RESOURCE_HASH);
    assert.equal(row.status, 'ACTIVE');
  });
});

test('3. invoice_hash is independently UNIQUE', () => {
  withDb(({ db }) => {
    insert(db);
    assert.throws(
      () => insert(db, { entitlementId: 'xr1-entitlement-b', txid: C }),
      /UNIQUE constraint failed: xr1_entitlements\.invoice_hash/
    );
  });
});

test('4. txid is independently UNIQUE', () => {
  withDb(({ db }) => {
    insert(db);
    assert.throws(
      () => insert(db, { entitlementId: 'xr1-entitlement-b', invoiceHash: C }),
      /UNIQUE constraint failed: xr1_entitlements\.txid/
    );
  });
});

test('5. malformed hash fields fail closed at DB boundary', () => {
  withDb(({ db }) => {
    for (const [field, value] of [
      ['invoiceHash', 'ABC'],
      ['txid', 'B'.repeat(64)],
      ['resourceHash', 'z'.repeat(64)]
    ]) {
      assert.throws(
        () => insert(db, { [field]: value }),
        /CHECK constraint failed/
      );
    }
  });
});

test('6. grants must start ACTIVE', () => {
  withDb(({ db }) => {
    assert.throws(
      () => insert(db, { status: 'EXPIRED' }),
      /XR1D_INSERT_MUST_BE_ACTIVE/
    );
  });
});

test('7. economic binding and TTL evidence are immutable', () => {
  withDb(({ db }) => {
    insert(db);
    const mutations = [
      ['entitlement_id', 'xr1-other'],
      ['invoice_hash', C],
      ['txid', C],
      ['resource_id', 'xolos:other:v1'],
      ['resource_hash', C],
      ['granted_at', 1_797_000_001],
      ['expires_at', 1_797_003_601]
    ];
    for (const [column, value] of mutations) {
      assert.throws(
        () => db.prepare(
          `UPDATE xr1_entitlements SET ${column} = ? WHERE invoice_hash = ?`
        ).run(value, A),
        /XR1D_IMMUTABLE_BINDING/
      );
    }
  });
});

test('8. ACTIVE -> EXPIRED is the only state transition', () => {
  withDb(({ db }) => {
    insert(db);
    db.prepare(
      "UPDATE xr1_entitlements SET status = 'EXPIRED' WHERE invoice_hash = ?"
    ).run(A);
    assert.equal(
      db.prepare('SELECT status FROM xr1_entitlements WHERE invoice_hash = ?').get(A).status,
      'EXPIRED'
    );

    assert.throws(
      () => db.prepare(
        "UPDATE xr1_entitlements SET status = 'ACTIVE' WHERE invoice_hash = ?"
      ).run(A),
      /XR1D_INVALID_STATUS_TRANSITION/
    );
  });
});

test('9. no-op status update is harmless', () => {
  withDb(({ db }) => {
    insert(db);
    db.prepare(
      "UPDATE xr1_entitlements SET status = 'ACTIVE' WHERE invoice_hash = ?"
    ).run(A);
    assert.equal(
      db.prepare('SELECT status FROM xr1_entitlements WHERE invoice_hash = ?').get(A).status,
      'ACTIVE'
    );
  });
});

test('10. DELETE is forbidden to preserve audit/replay evidence', () => {
  withDb(({ db }) => {
    insert(db);
    assert.throws(
      () => db.prepare('DELETE FROM xr1_entitlements WHERE invoice_hash = ?').run(A),
      /XR1D_DELETE_FORBIDDEN/
    );
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM xr1_entitlements').get().count,
      1
    );
  });
});

test('11. expires_at must be strictly greater than granted_at', () => {
  withDb(({ db }) => {
    assert.throws(
      () => insert(db, { expiresAt: 1_797_000_000 }),
      /CHECK constraint failed/
    );
    assert.throws(
      () => insert(db, { expiresAt: 1_796_999_999 }),
      /CHECK constraint failed/
    );
  });
});

test('12. active-expiry index exists for authorizeAccess gate', () => {
  withDb(({ db }) => {
    const index = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='index' AND name='xr1_entitlements_active_expiry_idx'"
    ).get();
    assert.match(index.sql, /status, expires_at/);
  });
});

test('13. durable file survives close and reopen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xr1d-reopen-'));
  const path = join(dir, 'entitlements.sqlite');
  try {
    {
      const db = new DatabaseSync(path);
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec(MIGRATION);
      insert(db);
      db.close();
    }
    {
      const db = new DatabaseSync(path);
      const row = db.prepare(
        'SELECT invoice_hash, txid, status FROM xr1_entitlements WHERE invoice_hash = ?'
      ).get(A);
      assert.deepEqual(row, { invoice_hash: A, txid: B, status: 'ACTIVE' });
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('14. two independent connections cannot create competing bindings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xr1d-concurrency-'));
  const path = join(dir, 'entitlements.sqlite');
  const dbA = new DatabaseSync(path);
  const dbB = new DatabaseSync(path);
  try {
    for (const db of [dbA, dbB]) {
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec('PRAGMA busy_timeout = 1000;');
    }
    dbA.exec(MIGRATION);

    dbA.exec('BEGIN IMMEDIATE');
    insert(dbA);

    // Independent connection cannot obtain the writer lock while A owns it.
    assert.throws(
      () => dbB.exec('BEGIN IMMEDIATE'),
      error => /database is locked/i.test(message(error))
    );
    dbA.exec('COMMIT');

    // After the first commit, a competing binding is rejected by UNIQUE.
    dbB.exec('BEGIN IMMEDIATE');
    assert.throws(
      () => insert(dbB, { entitlementId: 'xr1-entitlement-b', txid: C }),
      /UNIQUE constraint failed: xr1_entitlements\.invoice_hash/
    );
    dbB.exec('ROLLBACK');

    assert.equal(
      dbA.prepare('SELECT COUNT(*) AS count FROM xr1_entitlements').get().count,
      1
    );
  } finally {
    try { dbA.exec('ROLLBACK'); } catch {}
    try { dbB.exec('ROLLBACK'); } catch {}
    dbA.close();
    dbB.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('15. schema contains no payment verification or wallet authority', () => {
  const forbidden = [
    'private_key',
    'mnemonic',
    'signatory',
    'raw_tx',
    'broadcast',
    'chronik'
  ];
  const lower = MIGRATION.toLowerCase();
  for (const token of forbidden) {
    assert.equal(lower.includes(token), false, `migration must not contain ${token}`);
  }
});

test('16. second distinct entitlement remains allowed when both unique bindings differ', () => {
  withDb(({ db }) => {
    insert(db);
    insert(db, {
      entitlementId: 'xr1-entitlement-b',
      invoiceHash: C,
      txid: D
    });
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM xr1_entitlements').get().count,
      2
    );
  });
});
