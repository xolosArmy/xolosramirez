import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { createXr1fRoService } from '../../services/xr1f-ro/service.mjs';
import {
  probeC3bStoreReadOnly,
  probeChronikReadOnly,
  probeXr1dStoreReadOnly,
} from '../../services/xr1f-ro/probes.mjs';

const RESOURCE_HASH =
  '7de82337df5f68767c6c75206545cfe0e06eeaff6d15889547651eff972d930b';
const TXID = 'a'.repeat(64);

function createC3bDb(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
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
    CREATE UNIQUE INDEX idx_invoices_settled_txid
    ON invoices(settled_txid) WHERE settled_txid IS NOT NULL;
  `);
  db.close();
}

function createXr1dDb(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    BEGIN IMMEDIATE;
    CREATE TABLE xr1_entitlements (
      entitlement_id TEXT PRIMARY KEY,
      invoice_hash TEXT NOT NULL UNIQUE,
      txid TEXT NOT NULL UNIQUE,
      resource_id TEXT NOT NULL,
      resource_hash TEXT NOT NULL,
      granted_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      status TEXT NOT NULL
    ) STRICT;
    CREATE TRIGGER xr1_entitlements_insert_active_only
    BEFORE INSERT ON xr1_entitlements
    FOR EACH ROW
    WHEN NEW.status <> 'ACTIVE'
    BEGIN
      SELECT RAISE(ABORT, 'XR1D_INSERT_MUST_BE_ACTIVE');
    END;
    CREATE TRIGGER xr1_entitlements_immutable_binding
    BEFORE UPDATE OF entitlement_id, invoice_hash, txid, resource_id, resource_hash, granted_at, expires_at
    ON xr1_entitlements
    FOR EACH ROW
    WHEN NEW.entitlement_id IS NOT OLD.entitlement_id
      OR NEW.invoice_hash IS NOT OLD.invoice_hash
      OR NEW.txid IS NOT OLD.txid
      OR NEW.resource_id IS NOT OLD.resource_id
      OR NEW.resource_hash IS NOT OLD.resource_hash
      OR NEW.granted_at IS NOT OLD.granted_at
      OR NEW.expires_at IS NOT OLD.expires_at
    BEGIN
      SELECT RAISE(ABORT, 'XR1D_IMMUTABLE_BINDING');
    END;
    CREATE TRIGGER xr1_entitlements_status_transition
    BEFORE UPDATE OF status ON xr1_entitlements
    FOR EACH ROW
    WHEN NEW.status IS NOT OLD.status
      AND NOT (OLD.status = 'ACTIVE' AND NEW.status = 'EXPIRED')
    BEGIN
      SELECT RAISE(ABORT, 'XR1D_INVALID_STATUS_TRANSITION');
    END;
    CREATE TRIGGER xr1_entitlements_no_delete
    BEFORE DELETE ON xr1_entitlements
    FOR EACH ROW
    BEGIN
      SELECT RAISE(ABORT, 'XR1D_DELETE_FORBIDDEN');
    END;
    CREATE INDEX xr1_entitlements_active_expiry_idx
    ON xr1_entitlements(status, expires_at);
    PRAGMA user_version = 1;
    COMMIT;
  `);
  db.close();
}

function goodChronikReader() {
  return {
    async getTx(txid) {
      return {
        txid,
        outputs: [
          {
            sats: 546n,
            outputScript: '76a914' + '11'.repeat(20) + '88ac',
          },
        ],
        block: {
          height: 100,
          hash: 'b'.repeat(64),
          timestamp: 1_797_000_000,
        },
        isFinal: true,
        timeFirstSeen: 1_796_999_999,
      };
    },
  };
}

function config({ c3bDbPath, xr1dDbPath, enabled = true } = {}) {
  return {
    gate: 'XR1F-RO',
    mode: 'READ_ONLY',
    enabled,
    host: '127.0.0.1',
    port: 0,
    c3bDbPath,
    xr1dDbPath,
    chronikEndpoint: 'https://chronik.example.invalid',
    chronikProbeTxid: TXID,
    chronikTimeoutMs: 100,
    providerModulePath: '/tmp/provider.mjs',
    providerSha256: 'c'.repeat(64),
    x402Commit: '0f409dea2959b397ecc4bb84d71519ec6e3aec04',
    buildSha: 'test-build',
  };
}

function createFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'xr1f-ro-'));
  const c3b = join(dir, 'c3b.sqlite');
  const xr1d = join(dir, 'xr1d.sqlite');
  createC3bDb(c3b);
  createXr1dDb(xr1d);
  return { dir, c3b, xr1d };
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  return { status: response.status, body: await response.json() };
}

test('1. C3B production schema opens and validates in read-only mode', () => {
  const fx = createFixture();
  try {
    const result = probeC3bStoreReadOnly(fx.c3b);
    assert.deepEqual(result, { ok: true, component: 'c3bStore' });
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test('2. XR1D canonical schema opens and validates in read-only mode', () => {
  const fx = createFixture();
  try {
    const result = probeXr1dStoreReadOnly(fx.xr1d);
    assert.deepEqual(result, { ok: true, component: 'xr1dStore' });
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test('3. malformed C3B schema fails closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xr1f-ro-bad-c3b-'));
  const path = join(dir, 'bad.sqlite');
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE invoices (invoice_hash TEXT PRIMARY KEY);');
  db.close();
  try {
    assert.throws(
      () => probeC3bStoreReadOnly(path),
      /XR1F_RO_C3B_COLUMN_MISSING_/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('4. malformed XR1D schema version fails closed', () => {
  const fx = createFixture();
  try {
    const db = new DatabaseSync(fx.xr1d);
    db.exec('PRAGMA user_version = 0;');
    db.close();
    assert.throws(
      () => probeXr1dStoreReadOnly(fx.xr1d),
      /XR1F_RO_XR1D_SCHEMA_VERSION_MISMATCH/,
    );
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test('5. Chronik reader accepts valid read-only transaction shape', async () => {
  const result = await probeChronikReadOnly({
    reader: goodChronikReader(),
    txid: TXID,
    timeoutMs: 100,
  });
  assert.equal(result.ok, true);
  assert.equal(result.component, 'chronik');
  assert.equal(result.confirmed, true);
});

test('6. Chronik reader with broadcast capability is rejected', async () => {
  const reader = {
    ...goodChronikReader(),
    async broadcastTx() {},
  };
  await assert.rejects(
    () =>
      probeChronikReadOnly({
        reader,
        txid: TXID,
        timeoutMs: 100,
      }),
    /XR1F_RO_CHRONIK_WRITE_CAPABILITY_broadcastTx/,
  );
});

test('7. Chronik timeout fails closed', async () => {
  const reader = {
    async getTx() {
      return new Promise(() => {});
    },
  };
  await assert.rejects(
    () =>
      probeChronikReadOnly({
        reader,
        txid: TXID,
        timeoutMs: 25,
      }),
    /XR1F_RO_CHRONIK_TIMEOUT/,
  );
});

test('8. Chronik malformed response fails closed', async () => {
  const reader = {
    async getTx() {
      return { txid: TXID, outputs: [], isFinal: 'yes', timeFirstSeen: 1 };
    },
  };
  await assert.rejects(
    () =>
      probeChronikReadOnly({
        reader,
        txid: TXID,
        timeoutMs: 100,
      }),
    /XR1F_RO_CHRONIK_FINALITY_INVALID/,
  );
});

test('9. readiness reports READ_ONLY_READY only when all probes pass', async () => {
  const fx = createFixture();
  try {
    const service = createXr1fRoService({
      config: config({
        c3bDbPath: fx.c3b,
        xr1dDbPath: fx.xr1d,
      }),
      chronikReader: goodChronikReader(),
      logger: { error() {} },
    });
    const result = await service.readiness();
    assert.equal(result.ok, true);
    assert.equal(result.status, 'READ_ONLY_READY');
    assert.equal(result.realFundsAuthorized, false);
    assert.deepEqual(result.checks, {
      x402Pin: 'ok',
      c3bStore: 'ok',
      xr1dStore: 'ok',
      chronik: 'ok',
    });
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test('10. kill-switch disabled makes readiness fail closed', async () => {
  const fx = createFixture();
  try {
    const service = createXr1fRoService({
      config: config({
        c3bDbPath: fx.c3b,
        xr1dDbPath: fx.xr1d,
        enabled: false,
      }),
      chronikReader: goodChronikReader(),
      logger: { error() {} },
    });
    const result = await service.readiness();
    assert.deepEqual(result, {
      ok: false,
      code: 'XR1F_RO_DISABLED',
    });
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test('11. /health is alive even if readiness is disabled, and never authorizes funds', async () => {
  const fx = createFixture();
  const service = createXr1fRoService({
    config: config({
      c3bDbPath: fx.c3b,
      xr1dDbPath: fx.xr1d,
      enabled: false,
    }),
    chronikReader: goodChronikReader(),
    logger: { error() {} },
  });
  try {
    const address = await service.listen();
    const origin = `http://127.0.0.1:${address.port}`;
    const health = await fetchJson(origin + '/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.status, 'alive');
    assert.equal(health.body.realFundsAuthorized, false);

    const ready = await fetchJson(origin + '/ready');
    assert.equal(ready.status, 503);
    assert.equal(ready.body.code, 'XR1F_RO_DISABLED');
    assert.equal(ready.body.realFundsAuthorized, false);
  } finally {
    await service.close();
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test('12. service exposes no payment, invoice or protected-resource route', async () => {
  const fx = createFixture();
  const service = createXr1fRoService({
    config: config({
      c3bDbPath: fx.c3b,
      xr1dDbPath: fx.xr1d,
    }),
    chronikReader: goodChronikReader(),
    logger: { error() {} },
  });
  try {
    const address = await service.listen();
    const origin = `http://127.0.0.1:${address.port}`;
    for (const path of [
      '/v1/xolos/xilonen/verified-dossier',
      '/invoice',
      '/pay',
      '/broadcast',
    ]) {
      const result = await fetchJson(origin + path);
      assert.equal(result.status, 404, path);
      assert.equal(result.body.error, 'NOT_FOUND');
    }
  } finally {
    await service.close();
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test('13. readiness failure never leaks filesystem paths', async () => {
  const fx = createFixture();
  try {
    const service = createXr1fRoService({
      config: config({
        c3bDbPath: '/definitely/missing/c3b.sqlite',
        xr1dDbPath: fx.xr1d,
      }),
      chronikReader: goodChronikReader(),
      logger: { error() {} },
    });
    const result = await service.readiness();
    assert.equal(result.ok, false);
    assert.equal(typeof result.code, 'string');
    assert.equal(JSON.stringify(result).includes('/definitely/missing'), false);
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});
