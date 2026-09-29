import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  runBindingCeremony,
} from '../../services/xr1f-l1/bind-allocator.mjs';
import {
  readAllocatorBinding,
} from '../../src/x402-xr1f-l1/binding.mjs';

const XPUB =
  'xpub661MyMwAqRbcEtUEgdXRTY6dJQG9fRgs7C5QomqETKMYBJVtSGpRqyHSmhWy8snovPd5oWZgQ14zUquxbxu7Z1umuXbN5VDpUL1QobD5xUY';

const XPUB_SHA = createHash('sha256').update(XPUB).digest('hex');

const CANONICAL_MODULE =
  process.env.XR1F_L1_CANONICAL_MODULE_PATH?.trim() || null;

const canonicalTest = CANONICAL_MODULE ? test : test.skip;

function makeC3b() {
  const dir = mkdtempSync(join(tmpdir(), 'xr1f-l1-deploy-'));
  const path = join(dir, 'c3b.sqlite');
  const db = new DatabaseSync(path);

  db.exec(`
    PRAGMA journal_mode=WAL;
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
      settled_txid TEXT UNIQUE,
      settled_at INTEGER,
      derivation_index INTEGER NOT NULL UNIQUE
    );
  `);
  db.close();

  return {
    dir,
    path,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function env(path, enabled = true) {
  return {
    NODE_ENV: 'production',
    XR1F_L1_BIND_ENABLED: enabled ? 'true' : 'false',
    XR1F_L1_BUILD_SHA: 'c'.repeat(40),
    XR1F_L1_C3B_DB_PATH: path,
    XR1F_L1_MERCHANT_XPUB: XPUB,
    XR1F_L1_MERCHANT_XPUB_SHA256: XPUB_SHA,
    XR1F_L1_X402_XEC_COMMIT:
      '0f409dea2959b397ecc4bb84d71519ec6e3aec04',
    XR1F_L1_X402_MODULE_PATH: CANONICAL_MODULE || '/not-used/index.js',
  };
}

function logger() {
  const lines = [];
  return {
    lines,
    log(value) {
      lines.push(String(value));
    },
  };
}

test('1. disabled ceremony performs no filesystem or database access', async () => {
  const log = logger();
  const result = await runBindingCeremony({
    env: {
      ...env('/does/not/exist.sqlite', false),
      XR1F_L1_X402_MODULE_PATH: '/does/not/exist/index.js',
    },
    logger: log,
    probeC3b() {
      throw new Error('must not be called');
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'XR1F_L1_BIND_DISABLED');
  assert.equal(result.realFundsAuthorized, false);
});

canonicalTest('2. failed canonical C3B probe prevents migration and binding', async () => {
  const fx = makeC3b();
  try {
    await assert.rejects(
      () =>
        runBindingCeremony({
          env: env(fx.path),
          probeC3b() {
            throw new Error('XR1F_RO_C3B_QUICK_CHECK_FAILED');
          },
          logger: logger(),
        }),
      /XR1F_RO_C3B_QUICK_CHECK_FAILED/,
    );

    const db = new DatabaseSync(fx.path);
    const table = db.prepare(
      "SELECT name FROM main.sqlite_master WHERE type='table' AND name='xr1f_l1_allocator_binding'",
    ).get();
    db.close();
    assert.equal(table, undefined);
  } finally {
    fx.cleanup();
  }
});

canonicalTest('3. existing invoice history prevents even binding-schema creation', async () => {
  const fx = makeC3b();
  try {
    const db = new DatabaseSync(fx.path);
    db.prepare(`
      INSERT INTO main.invoices (
        invoice_hash, nonce, resource_hash, amount_sats, pay_to,
        network, scheme, issued_at, expires_at, state, derivation_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'a'.repeat(64),
      'history_nonce',
      'b'.repeat(64),
      '1000',
      'ecash:qqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyquz9y96w',
      'xec:mainnet',
      'exact',
      1,
      2,
      'ISSUED',
      0,
    );
    db.close();

    await assert.rejects(
      () =>
        runBindingCeremony({
          env: env(fx.path),
          probeC3b() {
            return Object.freeze({ ok: true, component: 'c3bStore' });
          },
          logger: logger(),
        }),
      /XR1F_L1_UNBOUND_HISTORY/,
    );

    const verify = new DatabaseSync(fx.path);
    const bindingTable = verify.prepare(
      "SELECT name FROM main.sqlite_master WHERE type='table' AND name='xr1f_l1_allocator_binding'",
    ).get();
    verify.close();
    assert.equal(bindingTable, undefined);
  } finally {
    fx.cleanup();
  }
});

canonicalTest('4. pre-existing degraded binding schema is rejected before reuse', async () => {
  const fx = makeC3b();
  try {
    const db = new DatabaseSync(fx.path);
    db.exec(`
      CREATE TABLE main.xr1f_l1_allocator_binding (
        binding_id INTEGER PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        allocator_kind TEXT NOT NULL,
        allocator_id TEXT NOT NULL UNIQUE,
        network TEXT NOT NULL,
        x402_xec_commit TEXT NOT NULL,
        bound_at INTEGER NOT NULL
      );
    `);
    db.close();

    await assert.rejects(
      () =>
        runBindingCeremony({
          env: env(fx.path),
          probeC3b() {
            return Object.freeze({ ok: true, component: 'c3bStore' });
          },
          logger: logger(),
        }),
      /XR1F_L1_BINDING_SCHEMA_CONSTRAINT_MISMATCH|XR1F_L1_BINDING_SCHEMA_TRIGGERS_MISMATCH/,
    );

    const verify = new DatabaseSync(fx.path);
    const count = verify.prepare(
      'SELECT COUNT(*) AS n FROM main.xr1f_l1_allocator_binding',
    ).get().n;
    verify.close();
    assert.equal(Number(count), 0);
  } finally {
    fx.cleanup();
  }
});

canonicalTest('5. live WAL schema divergence is rejected before binding', async () => {
  const fx = makeC3b();
  const writer = new DatabaseSync(fx.path);

  try {
    writer.exec('PRAGMA wal_autocheckpoint=0');
    writer.exec('BEGIN IMMEDIATE');
    writer.exec(
      'ALTER TABLE main.invoices RENAME COLUMN state TO state_diverged',
    );
    writer.exec('COMMIT');

    await assert.rejects(
      () =>
        runBindingCeremony({
          env: env(fx.path),
          // Model the stale immutable preflight as having succeeded. The
          // same writable/live handle used for binding must still catch the
          // uncheckpointed WAL-visible schema divergence.
          probeC3b() {
            return Object.freeze({ ok: true, component: 'c3bStore' });
          },
          logger: logger(),
        }),
      /XR1F_L1_C3B_LIVE_COLUMN_MISSING_state/,
    );

    const verify = new DatabaseSync(fx.path);
    const bindingTable = verify.prepare(
      "SELECT name FROM main.sqlite_master WHERE type='table' AND name='xr1f_l1_allocator_binding'",
    ).get();
    verify.close();
    assert.equal(bindingTable, undefined);
  } finally {
    try { writer.close(); } catch {}
    fx.cleanup();
  }
});

canonicalTest('6. conditional WHEN 0 immutability triggers are rejected functionally', async () => {
  const fx = makeC3b();

  try {
    const db = new DatabaseSync(fx.path);
    db.exec(`
      CREATE TABLE main.xr1f_l1_allocator_binding (
        binding_id INTEGER PRIMARY KEY CHECK(binding_id = 1),
        schema_version INTEGER NOT NULL CHECK(schema_version = 1),
        allocator_kind TEXT NOT NULL CHECK(allocator_kind = 'X402_XEC_XPUB_V1'),
        allocator_id TEXT NOT NULL UNIQUE CHECK(
          length(allocator_id) = 64
          AND allocator_id = lower(allocator_id)
          AND allocator_id NOT GLOB '*[^0-9a-f]*'
        ),
        network TEXT NOT NULL CHECK(network = 'xec:mainnet'),
        x402_xec_commit TEXT NOT NULL CHECK(
          x402_xec_commit = '0f409dea2959b397ecc4bb84d71519ec6e3aec04'
        ),
        bound_at INTEGER NOT NULL CHECK(
          bound_at >= 0 AND bound_at <= 9007199254740991
        )
      ) STRICT;

      CREATE TRIGGER main.xr1f_l1_allocator_binding_no_update
      BEFORE UPDATE ON main.xr1f_l1_allocator_binding
      FOR EACH ROW
      WHEN 0
      BEGIN
        SELECT RAISE(ABORT, 'XR1F_L1_ALLOCATOR_BINDING_IMMUTABLE');
      END;

      CREATE TRIGGER main.xr1f_l1_allocator_binding_no_delete
      BEFORE DELETE ON main.xr1f_l1_allocator_binding
      FOR EACH ROW
      WHEN 0
      BEGIN
        SELECT RAISE(ABORT, 'XR1F_L1_ALLOCATOR_BINDING_DELETE_FORBIDDEN');
      END;
    `);
    db.close();

    await assert.rejects(
      () =>
        runBindingCeremony({
          env: env(fx.path),
          probeC3b() {
            return Object.freeze({ ok: true, component: 'c3bStore' });
          },
          logger: logger(),
        }),
      /XR1F_L1_BINDING_SCHEMA_(UPDATE|DELETE)_TRIGGER_NOT_ENFORCED/,
    );

    const verify = new DatabaseSync(fx.path);
    const count = verify.prepare(
      'SELECT COUNT(*) AS n FROM main.xr1f_l1_allocator_binding',
    ).get().n;
    verify.close();
    assert.equal(Number(count), 0);
  } finally {
    fx.cleanup();
  }
});

canonicalTest('7. failure after schema creation rolls back the whole ceremony transaction', async () => {
  const fx = makeC3b();

  try {
    await assert.rejects(
      () =>
        runBindingCeremony({
          env: env(fx.path),
          now: () => -1,
          probeC3b() {
            return Object.freeze({ ok: true, component: 'c3bStore' });
          },
          logger: logger(),
        }),
      /XR1F_L1_BOUND_AT_INVALID/,
    );

    const verify = new DatabaseSync(fx.path);
    const bindingTable = verify.prepare(
      "SELECT name FROM main.sqlite_master WHERE type='table' AND name='xr1f_l1_allocator_binding'",
    ).get();
    verify.close();

    assert.equal(bindingTable, undefined);
  } finally {
    fx.cleanup();
  }
});

canonicalTest('8. canonical ceremony creates one durable immutable binding', async () => {
  const fx = makeC3b();
  const log = logger();

  try {
    const result = await runBindingCeremony({
      env: env(fx.path),
      now: () => 1_800_000_000,
      probeC3b() {
        return Object.freeze({ ok: true, component: 'c3bStore' });
      },
      logger: log,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'WATCH_ONLY_ALLOCATOR_BOUND');
    assert.equal(result.schemaCreated, true);
    assert.equal(result.previousStatus, 'UNBOUND');
    assert.equal(result.idempotent, false);
    assert.equal(result.binding.boundAt, 1_800_000_000);
    assert.equal(result.realFundsAuthorized, false);
    assert.equal(result.invoiceIssuanceAuthorized, false);
    assert.equal(result.signingAuthorized, false);
    assert.equal(result.broadcastAuthorized, false);

    const output = log.lines.join('\n');
    assert.equal(output.includes(XPUB), false);

    const db = new DatabaseSync(fx.path);
    const current = readAllocatorBinding(db);
    assert.equal(current.status, 'BOUND');
    assert.equal(current.binding.allocatorId, result.allocatorId);

    assert.throws(
      () =>
        db.prepare(
          'UPDATE main.xr1f_l1_allocator_binding SET bound_at=1 WHERE binding_id=1',
        ).run(),
      /XR1F_L1_ALLOCATOR_BINDING_IMMUTABLE/,
    );
    db.close();
  } finally {
    fx.cleanup();
  }
});

canonicalTest('9. repeated ceremony is idempotent and preserves original binding time', async () => {
  const fx = makeC3b();

  try {
    const options = {
      env: env(fx.path),
      probeC3b() {
        return Object.freeze({ ok: true, component: 'c3bStore' });
      },
      logger: logger(),
    };

    const first = await runBindingCeremony({
      ...options,
      now: () => 111,
    });
    const second = await runBindingCeremony({
      ...options,
      now: () => 999,
    });

    assert.equal(first.idempotent, false);
    assert.equal(second.idempotent, true);
    assert.equal(second.binding.boundAt, 111);
    assert.equal(second.allocatorId, first.allocatorId);
  } finally {
    fx.cleanup();
  }
});
