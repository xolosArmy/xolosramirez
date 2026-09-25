import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  Xr1fL1AllocatorError,
  createWatchOnlyAllocator,
  loadPinnedX402AllocatorImplementation,
} from '../../src/x402-xr1f-l1/allocator.mjs';
import {
  Xr1fL1BindingError,
  assertAllocatorBinding,
  bindAllocator,
  readAllocatorBinding,
} from '../../src/x402-xr1f-l1/binding.mjs';

const MIGRATION = new URL(
  '../../src/x402-xr1f-l1/migrations/001_allocator_binding.sql',
  import.meta.url,
);

const XPUB_A =
  'xpub661MyMwAqRbcEtUEgdXRTY6dJQG9fRgs7C5QomqETKMYBJVtSGpRqyHSmhWy8snovPd5oWZgQ14zUquxbxu7Z1umuXbN5VDpUL1QobD5xUY';

const VALID_ADDRESS =
  'ecash:qqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyquz9y96w';

const BASE58 =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(value) {
  const map = new Map([...BASE58].map((char, index) => [char, index]));
  let n = 0n;
  for (const char of value) {
    n = n * 58n + BigInt(map.get(char));
  }
  let hex = n.toString(16);
  if (hex.length % 2 !== 0) hex = `0${hex}`;
  let bytes = Buffer.from(hex, 'hex');
  let leading = 0;
  while (leading < value.length && value[leading] === '1') leading += 1;
  if (leading) bytes = Buffer.concat([Buffer.alloc(leading), bytes]);
  return bytes;
}

function base58Encode(bytes) {
  let n = BigInt(`0x${bytes.toString('hex') || '0'}`);
  let out = '';
  while (n > 0n) {
    const mod = Number(n % 58n);
    out = BASE58[mod] + out;
    n /= 58n;
  }
  let leading = 0;
  while (leading < bytes.length && bytes[leading] === 0) leading += 1;
  return '1'.repeat(leading) + out;
}

function secondValidXpub() {
  const decoded = base58Decode(XPUB_A);
  const payload = Buffer.from(decoded.subarray(0, 78));

  // Change only chain code; public key and mainnet xpub version remain valid.
  payload[13] ^= 0x01;

  const checksum = createHash('sha256')
    .update(
      createHash('sha256').update(payload).digest(),
    )
    .digest()
    .subarray(0, 4);

  return base58Encode(Buffer.concat([payload, checksum]));
}

const XPUB_B = secondValidXpub();

const moduleDir = mkdtempSync(join(tmpdir(), 'xr1f-l1-binding-module-'));
const modulePath = join(moduleDir, 'index.mjs');
writeFileSync(
  modulePath,
  `
    export function createXpubPayToAllocator(xpub) {
      if (typeof xpub !== 'string' || !xpub.startsWith('xpub')) {
        throw new TypeError('bad xpub');
      }
      return {
        deriveAddress() {
          return '${VALID_ADDRESS}';
        }
      };
    }

    export function decodeCashAddress(address) {
      if (address !== '${VALID_ADDRESS}') throw new TypeError('invalid');
      return { prefix: 'ecash', type: 0, hash: '11'.repeat(20) };
    }
  `,
);
const moduleSha256 = createHash('sha256')
  .update(readFileSync(modulePath))
  .digest('hex');

const PINNED_IMPLEMENTATION =
  await loadPinnedX402AllocatorImplementation({
    modulePath,
    expectedSha256: moduleSha256,
  });

test.after(() => {
  rmSync(moduleDir, { recursive: true, force: true });
});

function allocator(xpub = XPUB_A) {
  return createWatchOnlyAllocator({
    merchantXpub: xpub,
    pinnedImplementation: PINNED_IMPLEMENTATION,
  });
}

function withDb(fn, { migrate = true, invoices = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'xr1f-l1-binding-'));
  const path = join(dir, 'c3b.sqlite');
  const db = new DatabaseSync(path);

  try {
    if (migrate) {
      db.exec(readFileSync(MIGRATION, 'utf8'));
    }
    if (invoices) {
      db.exec(`
        CREATE TABLE invoices (
          invoice_hash TEXT PRIMARY KEY,
          nonce TEXT NOT NULL UNIQUE,
          resource_hash TEXT NOT NULL,
          amount_sats TEXT NOT NULL,
          pay_to TEXT NOT NULL UNIQUE,
          network TEXT NOT NULL,
          scheme TEXT NOT NULL,
          issued_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          state TEXT NOT NULL,
          settled_txid TEXT,
          settled_at INTEGER,
          derivation_index INTEGER NOT NULL UNIQUE
        );
      `);
    }
    return fn(db, path);
  } finally {
    try { db.close(); } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
}

function expectBindingError(fn, code) {
  assert.throws(
    fn,
    error =>
      error instanceof Xr1fL1BindingError &&
      error.code === code,
  );
}

test('1. fresh migrated store starts UNBOUND without side effects', () => {
  withDb(db => {
    const before = readAllocatorBinding(db);
    assert.deepEqual(before, {
      ok: true,
      status: 'UNBOUND',
      binding: null,
    });

    const count = db.prepare(
      'SELECT COUNT(*) AS n FROM xr1f_l1_allocator_binding',
    ).get().n;
    assert.equal(Number(count), 0);
  });
});

test('2. first governed binding persists canonical public identity', () => {
  withDb(db => {
    const a = allocator();
    const result = bindAllocator({
      db,
      allocator: a,
      boundAt: 1_797_000_000,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'BOUND');
    assert.equal(result.idempotent, false);
    assert.equal(result.binding.bindingId, 1);
    assert.equal(result.binding.schemaVersion, 1);
    assert.equal(result.binding.allocatorId, a.allocatorId);
    assert.equal(result.binding.network, 'xec:mainnet');
    assert.equal(
      result.binding.x402Commit,
      '0f409dea2959b397ecc4bb84d71519ec6e3aec04',
    );
    assert.equal(result.binding.boundAt, 1_797_000_000);

    assert.equal('xpub' in result.binding, false);
    assert.equal('merchantXpub' in result.binding, false);
  });
});

test('3. same allocator binding is idempotent and preserves original boundAt', () => {
  withDb(db => {
    const a = allocator();

    const first = bindAllocator({
      db,
      allocator: a,
      boundAt: 1_797_000_000,
    });
    const second = bindAllocator({
      db,
      allocator: a,
      boundAt: 1_797_999_999,
    });

    assert.equal(first.idempotent, false);
    assert.equal(second.idempotent, true);
    assert.equal(second.binding.boundAt, 1_797_000_000);

    const count = db.prepare(
      'SELECT COUNT(*) AS n FROM xr1f_l1_allocator_binding',
    ).get().n;
    assert.equal(Number(count), 1);
  });
});

test('4. different valid allocator identity cannot replace an existing binding', () => {
  withDb(db => {
    const a = allocator(XPUB_A);
    const b = allocator(XPUB_B);

    assert.notEqual(a.allocatorId, b.allocatorId);
    bindAllocator({ db, allocator: a, boundAt: 1 });

    expectBindingError(
      () => bindAllocator({ db, allocator: b, boundAt: 2 }),
      'XR1F_L1_ALLOCATOR_BINDING_MISMATCH',
    );

    const current = readAllocatorBinding(db);
    assert.equal(current.binding.allocatorId, a.allocatorId);
  });
});

test('5. assertAllocatorBinding fails closed while unbound and passes when bound', () => {
  withDb(db => {
    const a = allocator();

    expectBindingError(
      () => assertAllocatorBinding(db, a),
      'XR1F_L1_ALLOCATOR_UNBOUND',
    );

    bindAllocator({ db, allocator: a, boundAt: 100 });

    const result = assertAllocatorBinding(db, a);
    assert.equal(result.ok, true);
    assert.equal(result.status, 'BOUND');
    assert.equal(result.idempotent, true);
    assert.equal(result.binding.allocatorId, a.allocatorId);
  });
});

test('6. assertAllocatorBinding rejects a different live allocator', () => {
  withDb(db => {
    const a = allocator(XPUB_A);
    const b = allocator(XPUB_B);

    bindAllocator({ db, allocator: a, boundAt: 100 });

    expectBindingError(
      () => assertAllocatorBinding(db, b),
      'XR1F_L1_ALLOCATOR_BINDING_MISMATCH',
    );
  });
});

test('7. pre-existing invoice history without binding is never adopted automatically', () => {
  withDb(
    db => {
      db.prepare(`
        INSERT INTO invoices (
          invoice_hash, nonce, resource_hash, amount_sats, pay_to,
          network, scheme, issued_at, expires_at, state, derivation_index
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'a'.repeat(64),
        'historical_nonce',
        'b'.repeat(64),
        '1000',
        VALID_ADDRESS,
        'xec:mainnet',
        'exact',
        100,
        200,
        'ISSUED',
        0,
      );

      expectBindingError(
        () =>
          bindAllocator({
            db,
            allocator: allocator(),
            boundAt: 300,
          }),
        'XR1F_L1_UNBOUND_HISTORY',
      );

      assert.equal(readAllocatorBinding(db).status, 'UNBOUND');
    },
    { invoices: true },
  );
});

test('8. an empty canonical invoices table may be bound safely', () => {
  withDb(
    db => {
      const result = bindAllocator({
        db,
        allocator: allocator(),
        boundAt: 300,
      });

      assert.equal(result.ok, true);
      assert.equal(result.idempotent, false);
      assert.equal(result.status, 'BOUND');
    },
    { invoices: true },
  );
});

test('9. missing migration schema fails closed for reads and writes', () => {
  withDb(
    db => {
      expectBindingError(
        () => readAllocatorBinding(db),
        'XR1F_L1_BINDING_SCHEMA_MISSING',
      );

      expectBindingError(
        () =>
          bindAllocator({
            db,
            allocator: allocator(),
            boundAt: 1,
          }),
        'XR1F_L1_BINDING_SCHEMA_MISSING',
      );
    },
    { migrate: false },
  );
});

test('10. invalid boundAt values never create binding evidence', () => {
  withDb(db => {
    for (const boundAt of [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expectBindingError(
        () =>
          bindAllocator({
            db,
            allocator: allocator(),
            boundAt,
          }),
        'XR1F_L1_BOUND_AT_INVALID',
      );
    }

    assert.equal(readAllocatorBinding(db).status, 'UNBOUND');
  });
});

test('11. allocator-owned write failure rolls back its own transaction only', () => {
  withDb(db => {
    db.exec(`
      CREATE TRIGGER xr1f_l1_test_abort_insert
      BEFORE INSERT ON xr1f_l1_allocator_binding
      BEGIN
        SELECT RAISE(ABORT, 'TEST_ABORT_BINDING');
      END;
    `);

    expectBindingError(
      () =>
        bindAllocator({
          db,
          allocator: allocator(),
          boundAt: 1,
        }),
      'XR1F_L1_BINDING_WRITE_FAILED',
    );

    assert.equal(db.isTransaction, false);
    assert.equal(readAllocatorBinding(db).status, 'UNBOUND');
  });
});

test('12. caller-owned transaction is never rolled back by bindAllocator', () => {
  withDb(db => {
    db.exec('CREATE TABLE caller_state (value TEXT NOT NULL)');
    db.exec('BEGIN IMMEDIATE');
    db.prepare('INSERT INTO caller_state(value) VALUES (?)').run('keep-me');

    assert.equal(db.isTransaction, true);

    expectBindingError(
      () =>
        bindAllocator({
          db,
          allocator: allocator(),
          boundAt: 1,
        }),
      'XR1F_L1_BINDING_WRITE_FAILED',
    );

    assert.equal(db.isTransaction, true);
    const row = db.prepare('SELECT value FROM caller_state').get();
    assert.equal(row.value, 'keep-me');

    db.exec('ROLLBACK');
    assert.equal(db.isTransaction, false);
  });
});

test('13. durable binding survives database close and reopen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xr1f-l1-binding-restart-'));
  const path = join(dir, 'c3b.sqlite');
  const a = allocator();

  try {
    const first = new DatabaseSync(path);
    first.exec(readFileSync(MIGRATION, 'utf8'));
    bindAllocator({ db: first, allocator: a, boundAt: 77 });
    first.close();

    const second = new DatabaseSync(path);
    const current = readAllocatorBinding(second);
    assert.equal(current.status, 'BOUND');
    assert.equal(current.binding.allocatorId, a.allocatorId);
    assert.equal(current.binding.boundAt, 77);

    const asserted = assertAllocatorBinding(second, a);
    assert.equal(asserted.ok, true);
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('14. database triggers prevent post-binding mutation and deletion', () => {
  withDb(db => {
    bindAllocator({
      db,
      allocator: allocator(),
      boundAt: 10,
    });

    assert.throws(
      () =>
        db.prepare(
          'UPDATE xr1f_l1_allocator_binding SET bound_at = 11 WHERE binding_id = 1',
        ).run(),
      /XR1F_L1_ALLOCATOR_BINDING_IMMUTABLE/,
    );

    assert.throws(
      () =>
        db.prepare(
          'DELETE FROM xr1f_l1_allocator_binding WHERE binding_id = 1',
        ).run(),
      /XR1F_L1_ALLOCATOR_BINDING_DELETE_FORBIDDEN/,
    );
  });
});

test('15. forged allocator object carrying spend authority cannot reach binding', () => {
  withDb(db => {
    const valid = allocator();
    const forged = {
      ...valid,
      sign() {},
    };

    assert.throws(
      () =>
        bindAllocator({
          db,
          allocator: forged,
          boundAt: 1,
        }),
      error =>
        error instanceof Xr1fL1AllocatorError &&
        error.code === 'XR1F_L1_ALLOCATOR_REQUIRED',
    );

    assert.equal(readAllocatorBinding(db).status, 'UNBOUND');
  });
});

test('16. binding ceremony does not derive addresses or issue invoices', () => {
  withDb(
    db => {
      const a = allocator();

      bindAllocator({
        db,
        allocator: a,
        boundAt: 1,
      });

      const invoices = db.prepare(
        'SELECT COUNT(*) AS n FROM invoices',
      ).get().n;
      assert.equal(Number(invoices), 0);
    },
    { invoices: true },
  );
});
