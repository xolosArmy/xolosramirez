import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Worker } from 'node:worker_threads';
import { SqliteXr1dEntitlementStore } from '../../src/x402-xr1d/durable-entitlement-store.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(
  resolve(__dirname, '../../src/x402-xr1d/migrations/001_entitlements.sql'),
  'utf8',
);

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const RESOURCE_HASH = '7de82337df5f68767c6c75206545cfe0e06eeaff6d15889547651eff972d930b';
const RESOURCE_ID = 'xolos:xilonen:verified-dossier:v1';
const GRANTED_AT = 1_797_000_000;
const EXPIRES_AT = 1_797_003_600;

function settlement() {
  return {
    version: 'x402-xr1/1',
    status: 'PAID',
    network: 'xec:mainnet',
    invoiceHash: A,
    txid: B,
    resourceHash: RESOURCE_HASH,
    settledAt: GRANTED_AT,
  };
}

function createMigratedDb() {
  const dir = mkdtempSync(join(tmpdir(), 'xr1d-step3-'));
  const path = join(dir, 'entitlements.sqlite');
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = FULL;');
  db.exec(MIGRATION);
  db.close();
  return { dir, path };
}

function seed(path) {
  const store = new SqliteXr1dEntitlementStore({ path });
  try {
    const grant = store.grant({
      settlement: settlement(),
      resource: {
        resourceId: RESOURCE_ID,
        resourceHash: RESOURCE_HASH,
      },
      expiresAt: EXPIRES_AT,
    });
    assert.equal(grant.ok, true);
    return grant.entitlement;
  } finally {
    store.close();
  }
}

function readRow(path) {
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA busy_timeout = 1000;');
    return db.prepare(
      `SELECT entitlement_id, invoice_hash, txid, resource_id, resource_hash,
              granted_at, expires_at, status
       FROM xr1_entitlements`
    ).get();
  } finally {
    db.close();
  }
}

function accessInput(entitlementId, overrides = {}) {
  return {
    entitlementId,
    resourceId: overrides.resourceId ?? RESOURCE_ID,
    resourceHash: overrides.resourceHash ?? RESOURCE_HASH,
    now: overrides.now ?? EXPIRES_AT - 1,
  };
}

function runWorker(workerData) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./authorize-worker.mjs', import.meta.url),
      { workerData },
    );
    let result;
    let received = false;
    worker.once('message', message => {
      result = message;
      received = true;
    });
    worker.once('error', reject);
    worker.once('exit', code => {
      if (code !== 0) {
        reject(new Error(`authorize worker exited ${code}`));
        return;
      }
      if (!received) {
        reject(new Error('authorize worker exited without result'));
        return;
      }
      resolve(result);
    });
  });
}

test('1. ACTIVE entitlement is allowed strictly before expiresAt without mutation', () => {
  const { dir, path } = createMigratedDb();
  try {
    const entitlement = seed(path);
    const store = new SqliteXr1dEntitlementStore({ path });
    try {
      const result = store.authorizeAccess(accessInput(entitlement.entitlementId));
      assert.equal(result.ok, true);
      assert.equal(result.outcome, 'ALLOWED');
      assert.equal(result.entitlement.status, 'ACTIVE');
      assert.equal(result.entitlement.expiresAt, EXPIRES_AT);
    } finally {
      store.close();
    }

    assert.equal(readRow(path).status, 'ACTIVE');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('2. exact expiry boundary denies and atomically transitions ACTIVE -> EXPIRED', () => {
  const { dir, path } = createMigratedDb();
  try {
    const entitlement = seed(path);
    const store = new SqliteXr1dEntitlementStore({ path });
    try {
      const result = store.authorizeAccess(
        accessInput(entitlement.entitlementId, { now: EXPIRES_AT }),
      );
      assert.equal(result.ok, false);
      assert.equal(result.outcome, 'DENIED');
      assert.equal(result.code, 'XR1D_ACCESS_EXPIRED');
      assert.equal(result.transitioned, true);
      assert.equal(result.entitlement.status, 'EXPIRED');
    } finally {
      store.close();
    }

    assert.equal(readRow(path).status, 'EXPIRED');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('3. after expiry boundary denies and persists EXPIRED', () => {
  const { dir, path } = createMigratedDb();
  try {
    const entitlement = seed(path);
    const store = new SqliteXr1dEntitlementStore({ path });
    try {
      const result = store.authorizeAccess(
        accessInput(entitlement.entitlementId, { now: EXPIRES_AT + 10 }),
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, 'XR1D_ACCESS_EXPIRED');
    } finally {
      store.close();
    }
    assert.equal(readRow(path).status, 'EXPIRED');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('4. EXPIRED is terminal and never returns to ACTIVE', () => {
  const { dir, path } = createMigratedDb();
  try {
    const entitlement = seed(path);
    const store = new SqliteXr1dEntitlementStore({ path });
    try {
      const first = store.authorizeAccess(
        accessInput(entitlement.entitlementId, { now: EXPIRES_AT }),
      );
      assert.equal(first.code, 'XR1D_ACCESS_EXPIRED');

      const second = store.authorizeAccess(
        accessInput(entitlement.entitlementId, { now: EXPIRES_AT - 100 }),
      );
      assert.equal(second.ok, false);
      assert.equal(second.code, 'XR1D_ACCESS_EXPIRED');
      assert.equal(second.entitlement.status, 'EXPIRED');
    } finally {
      store.close();
    }
    assert.equal(readRow(path).status, 'EXPIRED');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('5. wrong resourceId or resourceHash denies without revealing binding', () => {
  const { dir, path } = createMigratedDb();
  try {
    const entitlement = seed(path);
    const store = new SqliteXr1dEntitlementStore({ path });
    try {
      for (const input of [
        accessInput(entitlement.entitlementId, { resourceId: 'xolos:other:v1' }),
        accessInput(entitlement.entitlementId, { resourceHash: 'c'.repeat(64) }),
      ]) {
        const result = store.authorizeAccess(input);
        assert.equal(result.ok, false);
        assert.equal(result.outcome, 'DENIED');
        assert.equal(result.code, 'XR1D_ACCESS_NOT_FOUND_OR_MISMATCH');
        assert.equal('entitlement' in result, false);
      }
    } finally {
      store.close();
    }
    assert.equal(readRow(path).status, 'ACTIVE');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('6. unknown entitlement denies with same non-enumerating result', () => {
  const { dir, path } = createMigratedDb();
  try {
    seed(path);
    const store = new SqliteXr1dEntitlementStore({ path });
    try {
      const result = store.authorizeAccess(
        accessInput('xr1-00000000000000000000000000000000'),
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, 'XR1D_ACCESS_NOT_FOUND_OR_MISMATCH');
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('7. invalid time and malformed access inputs fail before state mutation', () => {
  const { dir, path } = createMigratedDb();
  try {
    const entitlement = seed(path);
    const store = new SqliteXr1dEntitlementStore({ path });
    try {
      const cases = [
        null,
        { ...accessInput(entitlement.entitlementId), now: -1 },
        { ...accessInput(entitlement.entitlementId), now: 1.5 },
        { ...accessInput(entitlement.entitlementId), now: Number.MAX_SAFE_INTEGER + 1 },
        { ...accessInput(entitlement.entitlementId), resourceHash: 'bad' },
        { ...accessInput(entitlement.entitlementId), entitlementId: '' },
        { ...accessInput(entitlement.entitlementId), resourceId: '' },
      ];

      for (const input of cases) {
        const result = store.authorizeAccess(input);
        assert.equal(result.ok, false);
        assert.equal(result.outcome, 'INVALID');
        assert.equal(result.retryable, false);
      }
    } finally {
      store.close();
    }

    assert.equal(readRow(path).status, 'ACTIVE');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('8. expiration preserves all immutable economic evidence', () => {
  const { dir, path } = createMigratedDb();
  try {
    const entitlement = seed(path);
    const before = readRow(path);

    const store = new SqliteXr1dEntitlementStore({ path });
    try {
      store.authorizeAccess(
        accessInput(entitlement.entitlementId, { now: EXPIRES_AT }),
      );
    } finally {
      store.close();
    }

    const after = readRow(path);
    for (const key of [
      'entitlement_id',
      'invoice_hash',
      'txid',
      'resource_id',
      'resource_hash',
      'granted_at',
      'expires_at',
    ]) {
      assert.equal(after[key], before[key], key);
    }
    assert.equal(after.status, 'EXPIRED');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('9. EXPIRED state survives close/reopen and remains denied', () => {
  const { dir, path } = createMigratedDb();
  try {
    const entitlement = seed(path);

    {
      const store = new SqliteXr1dEntitlementStore({ path });
      const result = store.authorizeAccess(
        accessInput(entitlement.entitlementId, { now: EXPIRES_AT }),
      );
      assert.equal(result.code, 'XR1D_ACCESS_EXPIRED');
      store.close();
    }

    {
      const store = new SqliteXr1dEntitlementStore({ path });
      const result = store.authorizeAccess(
        accessInput(entitlement.entitlementId, { now: EXPIRES_AT - 1 }),
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, 'XR1D_ACCESS_EXPIRED');
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('10. writer contention fails closed as retryable and does not mutate state', () => {
  const { dir, path } = createMigratedDb();
  const entitlement = seed(path);
  const locker = new DatabaseSync(path);
  const store = new SqliteXr1dEntitlementStore({ path });
  try {
    locker.exec('PRAGMA busy_timeout = 0;');
    locker.exec('BEGIN IMMEDIATE');

    const result = store.authorizeAccess(
      accessInput(entitlement.entitlementId, { now: EXPIRES_AT }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.outcome, 'RETRYABLE');
    assert.equal(result.code, 'XR1D_STORAGE_BUSY');
    assert.equal(result.retryable, true);

    locker.exec('ROLLBACK');
    assert.equal(readRow(path).status, 'ACTIVE');
  } finally {
    try { locker.exec('ROLLBACK'); } catch {}
    store.close();
    locker.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('11. two independent stores observe one monotonic expiration transition', () => {
  const { dir, path } = createMigratedDb();
  const entitlement = seed(path);
  const storeA = new SqliteXr1dEntitlementStore({ path });
  const storeB = new SqliteXr1dEntitlementStore({ path });
  try {
    const a = storeA.authorizeAccess(
      accessInput(entitlement.entitlementId, { now: EXPIRES_AT }),
    );
    const b = storeB.authorizeAccess(
      accessInput(entitlement.entitlementId, { now: EXPIRES_AT }),
    );

    assert.equal(a.ok, false);
    assert.equal(b.ok, false);
    assert.equal(a.code, 'XR1D_ACCESS_EXPIRED');
    assert.equal(b.code, 'XR1D_ACCESS_EXPIRED');
    assert.equal(readRow(path).status, 'EXPIRED');
  } finally {
    storeA.close();
    storeB.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('12. simultaneous worker expiry checks converge on one EXPIRED row', async () => {
  const { dir, path } = createMigratedDb();
  try {
    const entitlement = seed(path);
    const input = accessInput(entitlement.entitlementId, { now: EXPIRES_AT });
    const results = await Promise.all(
      Array.from({ length: 4 }, () => runWorker({ path, input })),
    );

    for (const result of results) {
      assert.equal(result.ok, false);
      assert.ok(
        result.code === 'XR1D_ACCESS_EXPIRED' ||
        result.code === 'XR1D_STORAGE_BUSY',
      );
    }

    assert.equal(readRow(path).status, 'EXPIRED');

    const store = new SqliteXr1dEntitlementStore({ path });
    try {
      for (const result of results.filter(result => result.code === 'XR1D_STORAGE_BUSY')) {
        const retry = store.authorizeAccess(input);
        assert.equal(retry.code, 'XR1D_ACCESS_EXPIRED');
      }
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('13. one second before expiry is allowed; exact boundary is denied', () => {
  const { dir, path } = createMigratedDb();
  try {
    const entitlement = seed(path);
    const store = new SqliteXr1dEntitlementStore({ path });
    try {
      const before = store.authorizeAccess(
        accessInput(entitlement.entitlementId, { now: EXPIRES_AT - 1 }),
      );
      assert.equal(before.ok, true);
      assert.equal(before.outcome, 'ALLOWED');

      const boundary = store.authorizeAccess(
        accessInput(entitlement.entitlementId, { now: EXPIRES_AT }),
      );
      assert.equal(boundary.ok, false);
      assert.equal(boundary.code, 'XR1D_ACCESS_EXPIRED');
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('14. Step 3 source contains no payment verification, wallet authority, or row deletion', () => {
  const source = readFileSync(
    resolve(__dirname, '../../src/x402-xr1d/durable-entitlement-store.mjs'),
    'utf8',
  ).toLowerCase();

  for (const token of [
    'delete from xr1_entitlements',
    'privatekey',
    'mnemonic',
    'broadcasttx',
    'chronik',
  ]) {
    assert.equal(source.includes(token), false, `Step 3 source must not contain ${token}`);
  }

  assert.match(source, /authorizeaccess\(input\)/);
  assert.match(source, /expires_at <= \?/);
  assert.match(source, /set status = 'expired'/);
});
