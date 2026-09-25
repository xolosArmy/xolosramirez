import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  Xr1fL1AllocatorError,
  createWatchOnlyAllocator,
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

const XPUB_B =
  'xpub661MyMwAqRbcFdifferentWatchOnlyPublicIdentityForBindingMismatch123456789ABCDEFG';

function fakeFactory() {
  return {
    deriveAddress(index) {
      return `ecash:q${String(index).padStart(41, '0')}`;
    },
  };
}

function allocator(xpub = XPUB_A) {
  return createWatchOnlyAllocator({
    merchantXpub: xpub,
    createUpstreamAllocator: fakeFactory,
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

test('4. different allocator identity cannot replace an existing binding', () => {
  withDb(db => {
    const a = allocator(XPUB_A);
    const b = allocator(XPUB_B);

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
        'ecash:qhistorical0000000000000000000000000000000',
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

test('11. binding write failure rolls back and leaves store UNBOUND', () => {
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

    assert.equal(readAllocatorBinding(db).status, 'UNBOUND');
  });
});

test('12. durable binding survives database close and reopen', () => {
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

test('13. database triggers prevent post-binding mutation and deletion', () => {
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

test('14. binding rejects allocator objects carrying spend authority', () => {
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
        error.code === 'XR1F_L1_SPEND_CAPABILITY_FORBIDDEN',
    );

    assert.equal(readAllocatorBinding(db).status, 'UNBOUND');
  });
});

test('15. binding ceremony does not derive addresses or issue invoices', () => {
  withDb(
    db => {
      let derivations = 0;
      const a = createWatchOnlyAllocator({
        merchantXpub: XPUB_A,
        createUpstreamAllocator: () => ({
          deriveAddress(index) {
            derivations += 1;
            return `ecash:q${String(index).padStart(41, '0')}`;
          },
        }),
      });

      bindAllocator({
        db,
        allocator: a,
        boundAt: 1,
      });

      assert.equal(derivations, 0);

      const invoices = db.prepare(
        'SELECT COUNT(*) AS n FROM invoices',
      ).get().n;
      assert.equal(Number(invoices), 0);
    },
    { invoices: true },
  );
});
