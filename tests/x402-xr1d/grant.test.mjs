import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Worker } from 'node:worker_threads';
import {
  SqliteXr1dEntitlementStore,
  Xr1dStoreError,
} from '../../src/x402-xr1d/durable-entitlement-store.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(
  resolve(__dirname, '../../src/x402-xr1d/migrations/001_entitlements.sql'),
  'utf8',
);

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const RESOURCE_HASH = '7de82337df5f68767c6c75206545cfe0e06eeaff6d15889547651eff972d930b';

const RESOURCE = Object.freeze({
  resourceId: 'xolos:xilonen:verified-dossier:v1',
  resourceHash: RESOURCE_HASH,
});

function settlement(overrides = {}) {
  return Object.freeze({
    version: 'x402-xr1/1',
    status: 'PAID',
    network: 'xec:mainnet',
    invoiceHash: A,
    txid: B,
    resourceHash: RESOURCE_HASH,
    settledAt: 1_797_000_000,
    ...overrides,
  });
}

function grantInput(overrides = {}) {
  return {
    settlement: overrides.settlement ?? settlement(),
    resource: overrides.resource ?? RESOURCE,
    expiresAt: overrides.expiresAt ?? 1_797_003_600,
  };
}

function createMigratedDb() {
  const dir = mkdtempSync(join(tmpdir(), 'xr1d-step2-'));
  const path = join(dir, 'entitlements.sqlite');
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = FULL;');
  db.exec(MIGRATION);
  db.close();
  return { dir, path };
}

function withStore(fn) {
  const { dir, path } = createMigratedDb();
  const store = new SqliteXr1dEntitlementStore({ path });
  try {
    return fn({ store, path, dir });
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function countRows(path) {
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA busy_timeout = 1000;');
    return db.prepare('SELECT COUNT(*) AS count FROM xr1_entitlements').get().count;
  } finally {
    db.close();
  }
}

function runWorker(workerData) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./grant-worker.mjs', import.meta.url),
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
        reject(new Error(`grant worker exited ${code}`));
        return;
      }
      if (!received) {
        reject(new Error('grant worker exited without result'));
        return;
      }
      resolve(result);
    });
  });
}

test('1. grant creates one durable ACTIVE entitlement from validated XR1 projection', () => {
  withStore(({ store, path }) => {
    const result = store.grant(grantInput());
    assert.equal(result.ok, true);
    assert.equal(result.outcome, 'CREATED');
    assert.equal(result.idempotent, false);
    assert.equal(result.entitlement.invoiceHash, A);
    assert.equal(result.entitlement.txid, B);
    assert.equal(result.entitlement.status, 'ACTIVE');
    assert.equal(countRows(path), 1);
  });
});

test('2. exact immutable retry is idempotent and returns same entitlementId', () => {
  withStore(({ store, path }) => {
    const first = store.grant(grantInput());
    const second = store.grant(grantInput());

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(second.outcome, 'IDEMPOTENT');
    assert.equal(second.idempotent, true);
    assert.equal(second.entitlement.entitlementId, first.entitlement.entitlementId);
    assert.equal(countRows(path), 1);
  });
});

test('3. same invoice with different txid is fail-closed conflict', () => {
  withStore(({ store, path }) => {
    assert.equal(store.grant(grantInput()).ok, true);

    const result = store.grant(grantInput({
      settlement: settlement({ txid: C }),
    }));

    assert.equal(result.ok, false);
    assert.equal(result.outcome, 'CONFLICT');
    assert.equal(result.code, 'XR1D_BINDING_CONFLICT');
    assert.equal(result.retryable, false);
    assert.equal(countRows(path), 1);
  });
});

test('4. same txid with different invoice is fail-closed conflict', () => {
  withStore(({ store, path }) => {
    assert.equal(store.grant(grantInput()).ok, true);

    const result = store.grant(grantInput({
      settlement: settlement({ invoiceHash: C }),
    }));

    assert.equal(result.ok, false);
    assert.equal(result.code, 'XR1D_BINDING_CONFLICT');
    assert.equal(countRows(path), 1);
  });
});

test('5. retry cannot extend expiresAt', () => {
  withStore(({ store, path }) => {
    const first = store.grant(grantInput());
    const result = store.grant(grantInput({ expiresAt: 1_797_007_200 }));

    assert.equal(first.ok, true);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'XR1D_BINDING_CONFLICT');
    assert.equal(countRows(path), 1);
  });
});

test('6. retry cannot rewrite grantedAt or resource binding', () => {
  withStore(({ store, path }) => {
    assert.equal(store.grant(grantInput()).ok, true);

    const differentGrantedAt = store.grant(grantInput({
      settlement: settlement({ settledAt: 1_797_000_001 }),
    }));
    assert.equal(differentGrantedAt.ok, false);
    assert.equal(differentGrantedAt.code, 'XR1D_BINDING_CONFLICT');

    const differentResource = store.grant(grantInput({
      settlement: settlement({ resourceHash: C }),
      resource: { resourceId: RESOURCE.resourceId, resourceHash: C },
    }));
    assert.equal(differentResource.ok, false);
    assert.equal(differentResource.code, 'XR1D_BINDING_CONFLICT');
    assert.equal(countRows(path), 1);
  });
});

test('7. invalid or non-XR1 settlement projection is rejected before DB write', () => {
  withStore(({ store, path }) => {
    const invalidCases = [
      grantInput({ settlement: { ...settlement(), status: 'UNLOCKED' } }),
      grantInput({ settlement: { ...settlement(), version: 'other' } }),
      grantInput({ settlement: { ...settlement(), network: 'xec:testnet' } }),
      grantInput({ settlement: { ...settlement(), invoiceHash: 'bad' } }),
      grantInput({ expiresAt: settlement().settledAt }),
    ];

    for (const input of invalidCases) {
      const result = store.grant(input);
      assert.equal(result.ok, false);
      assert.equal(result.outcome, 'INVALID');
      assert.equal(result.code, 'XR1D_INVALID_GRANT');
    }
    assert.equal(countRows(path), 0);
  });
});

test('8. store rejects memory DB and schema version mismatch', () => {
  assert.throws(
    () => new SqliteXr1dEntitlementStore({ path: ':memory:' }),
    error => error instanceof Xr1dStoreError && error.code === 'XR1D_DURABLE_PATH_REQUIRED',
  );

  const dir = mkdtempSync(join(tmpdir(), 'xr1d-step2-version-'));
  const path = join(dir, 'unmigrated.sqlite');
  try {
    assert.throws(
      () => new SqliteXr1dEntitlementStore({ path }),
      error => error instanceof Xr1dStoreError && error.code === 'XR1D_SCHEMA_VERSION_MISMATCH',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('9. durable idempotency survives close and reopen', () => {
  const { dir, path } = createMigratedDb();
  try {
    let entitlementId;
    {
      const store = new SqliteXr1dEntitlementStore({ path });
      const first = store.grant(grantInput());
      assert.equal(first.ok, true);
      entitlementId = first.entitlement.entitlementId;
      store.close();
    }

    {
      const store = new SqliteXr1dEntitlementStore({ path });
      const retry = store.grant(grantInput());
      assert.equal(retry.ok, true);
      assert.equal(retry.outcome, 'IDEMPOTENT');
      assert.equal(retry.entitlement.entitlementId, entitlementId);
      store.close();
    }

    assert.equal(countRows(path), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('10. writer contention maps SQLITE_BUSY/LOCKED to retryable fail-closed result', () => {
  const { dir, path } = createMigratedDb();
  const locker = new DatabaseSync(path);
  const store = new SqliteXr1dEntitlementStore({ path });
  try {
    locker.exec('PRAGMA busy_timeout = 0;');
    locker.exec('BEGIN IMMEDIATE');

    const result = store.grant(grantInput());
    assert.equal(result.ok, false);
    assert.equal(result.outcome, 'RETRYABLE');
    assert.equal(result.code, 'XR1D_STORAGE_BUSY');
    assert.equal(result.retryable, true);

    locker.exec('ROLLBACK');
    assert.equal(countRows(path), 0);
  } finally {
    try { locker.exec('ROLLBACK'); } catch {}
    store.close();
    locker.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('11. corrupted/non-database file fails closed on store construction', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xr1d-step2-corrupt-'));
  const path = join(dir, 'entitlements.sqlite');
  writeFileSync(path, 'definitely not sqlite');
  try {
    assert.throws(
      () => new SqliteXr1dEntitlementStore({ path }),
      error =>
        error instanceof Xr1dStoreError &&
        ['XR1D_STORAGE_CORRUPT', 'XR1D_STORAGE_FAILURE'].includes(error.code),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('12. two independent stores converge to one durable entitlement after first commit', () => {
  const { dir, path } = createMigratedDb();
  const storeA = new SqliteXr1dEntitlementStore({ path });
  const storeB = new SqliteXr1dEntitlementStore({ path });
  try {
    const a = storeA.grant(grantInput());
    const b = storeB.grant(grantInput());

    assert.equal(a.ok, true);
    assert.equal(a.outcome, 'CREATED');
    assert.equal(b.ok, true);
    assert.equal(b.outcome, 'IDEMPOTENT');
    assert.equal(a.entitlement.entitlementId, b.entitlement.entitlementId);
    assert.equal(countRows(path), 1);
  } finally {
    storeA.close();
    storeB.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('13. simultaneous worker grants produce one row; retries converge idempotently', async () => {
  const { dir, path } = createMigratedDb();
  try {
    const input = grantInput();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => runWorker({ path, input })),
    );

    const created = results.filter(result => result.ok && result.outcome === 'CREATED');
    const idempotent = results.filter(result => result.ok && result.outcome === 'IDEMPOTENT');
    const retryable = results.filter(result => !result.ok && result.outcome === 'RETRYABLE');

    assert.equal(created.length, 1);
    assert.equal(created.length + idempotent.length + retryable.length, 4);
    assert.equal(countRows(path), 1);

    const store = new SqliteXr1dEntitlementStore({ path });
    try {
      for (let index = 0; index < retryable.length; index++) {
        const retry = store.grant(input);
        assert.equal(retry.ok, true);
        assert.equal(retry.outcome, 'IDEMPOTENT');
        assert.equal(retry.entitlement.entitlementId, created[0].entitlement.entitlementId);
      }
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('14. source forbids silent conflict-masking SQL and wallet authority', () => {
  const source = readFileSync(
    resolve(__dirname, '../../src/x402-xr1d/durable-entitlement-store.mjs'),
    'utf8',
  ).toLowerCase();

  for (const token of [
    'insert or ignore',
    'insert or replace',
    'on conflict',
    'privatekey',
    'mnemonic',
    'signatory',
    'broadcasttx',
    'chronik',
  ]) {
    assert.equal(source.includes(token), false, `Step 2 source must not contain ${token}`);
  }

  assert.match(source, /insert into xr1_entitlements/);
  assert.match(source, /begin immediate/);
});
