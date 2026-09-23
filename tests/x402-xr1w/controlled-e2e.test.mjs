import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { XR1_RESOURCE } from '../../src/x402-xr1/entitlement.mjs';
import { SqliteXr1dEntitlementStore } from '../../src/x402-xr1d/durable-entitlement-store.mjs';
import {
  clearInternalX402Authority,
  createXr1wControlledGate,
} from '../../src/x402-xr1w/controlled-wiring.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(
  resolve(__dirname, '../../src/x402-xr1d/migrations/001_entitlements.sql'),
  'utf8',
);

const INVOICE = 'a'.repeat(64);
const TXID = 'b'.repeat(64);
const OTHER_HASH = 'c'.repeat(64);
const SETTLED_AT = 1_797_000_000;
const ACCESS_TTL_SECONDS = 300;

function createDb() {
  const dir = mkdtempSync(join(tmpdir(), 'xr1w-e2e-'));
  const path = join(dir, 'entitlements.sqlite');
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = FULL;');
  db.exec(MIGRATION);
  db.close();
  return { dir, path };
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

function readRow(path) {
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA busy_timeout = 1000;');
    return db.prepare('SELECT * FROM xr1_entitlements').get() ?? null;
  } finally {
    db.close();
  }
}

function canonicalHasher(resource) {
  assert.deepEqual(resource, {
    serverOrigin: XR1_RESOURCE.serverOrigin,
    method: XR1_RESOURCE.method,
    path: XR1_RESOURCE.path,
  });
  return XR1_RESOURCE.resourceHash;
}

function c3bSuccess(overrides = {}) {
  const invoiceHash = overrides.invoiceHash ?? INVOICE;
  const txid = overrides.txid ?? TXID;
  const resourceHash = overrides.resourceHash ?? XR1_RESOURCE.resourceHash;
  const settledAt = overrides.settledAt ?? SETTLED_AT;

  return {
    ok: true,
    status: 'UNLOCKED',
    invoice: {
      state: 'PAID',
      network: 'xec:mainnet',
      scheme: 'exact',
      invoiceHash,
      settledTxid: txid,
      resourceHash,
      settledAt,
    },
    proof: {
      x402Version: 1,
      network: 'xec:mainnet',
      invoiceHash,
      txid,
    },
    idempotent: overrides.idempotent === true,
  };
}

function proofToSettlement(header) {
  switch (header) {
    case 'valid':
      return c3bSuccess();
    case 'valid-idempotent':
      return c3bSuccess({ idempotent: true });
    case 'wrong-resource':
      return c3bSuccess({ resourceHash: OTHER_HASH });
    case 'different-tx':
      return c3bSuccess({ txid: OTHER_HASH });
    default:
      return null;
  }
}

async function startControlledServer({
  dbPath,
  clock,
  handler,
  beforeGate,
}) {
  const store = new SqliteXr1dEntitlementStore({ path: dbPath });
  const gate = createXr1wControlledGate({
    store,
    computeResourceHash: canonicalHasher,
    handler,
    now: () => clock.value,
    accessTtlSeconds: ACCESS_TTL_SECONDS,
  });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', XR1_RESOURCE.serverOrigin);
      const request = {
        method: req.method,
        originalUrl: req.url,
        url: req.url,
        path: url.pathname,
        headers: req.headers,
        body: null,
        x402Settlement: { forged: true },
        x402: { forged: true },
      };

      clearInternalX402Authority(request);
      await beforeGate?.({ req, request, store });

      const proof = req.headers['x-xr1w-test-proof'];
      if (typeof proof !== 'string') {
        res.statusCode = 402;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({
          error: 'PAYMENT_REQUIRED',
          invoiceId: INVOICE,
        }));
        return;
      }

      const settlement = proofToSettlement(proof);
      if (!settlement) {
        res.statusCode = 400;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'MALFORMED_PROOF' }));
        return;
      }

      request.x402Settlement = settlement;

      const result = await gate(request);
      res.statusCode = result.httpStatus;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(result));
    } catch {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'XR1W_TEST_SERVER_FAILURE' }));
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;

  return {
    origin,
    store,
    async close() {
      await new Promise(resolve => server.close(resolve));
      store.close();
    },
  };
}

async function getJson(url, options = {}) {
  const response = await fetch(url, options);
  return {
    status: response.status,
    body: await response.json(),
  };
}

test('1. no proof -> 402 and no XR1D grant', async () => {
  const { dir, path } = createDb();
  const clock = { value: SETTLED_AT + 1 };
  const server = await startControlledServer({
    dbPath: path,
    clock,
    handler: async () => ({ dossier: 'xilonen' }),
  });

  try {
    const response = await getJson(
      server.origin + XR1_RESOURCE.path,
    );
    assert.equal(response.status, 402);
    assert.equal(response.body.error, 'PAYMENT_REQUIRED');
    assert.equal(countRows(path), 0);
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('2. forged client authority cannot substitute for missing C3B proof', async () => {
  const { dir, path } = createDb();
  const clock = { value: SETTLED_AT + 1 };
  const server = await startControlledServer({
    dbPath: path,
    clock,
    handler: async () => ({ dossier: 'xilonen' }),
  });

  try {
    const response = await getJson(
      server.origin + XR1_RESOURCE.path,
      {
        headers: {
          'x402-settlement': JSON.stringify(c3bSuccess()),
          'payment-proof': JSON.stringify(c3bSuccess()),
        },
      },
    );
    assert.equal(response.status, 402);
    assert.equal(countRows(path), 0);
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('3. valid C3B proof -> one durable grant -> access allowed -> handler payload', async () => {
  const { dir, path } = createDb();
  const clock = { value: SETTLED_AT + 1 };
  const server = await startControlledServer({
    dbPath: path,
    clock,
    handler: async entitlement => ({
      dossier: 'xilonen',
      resourceId: entitlement.resourceId,
    }),
  });

  try {
    const response = await getJson(
      server.origin + XR1_RESOURCE.path,
      { headers: { 'x-xr1w-test-proof': 'valid' } },
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.status, 'UNLOCKED');
    assert.equal(response.body.payload.dossier, 'xilonen');
    assert.equal(response.body.entitlement.status, 'ACTIVE');
    assert.equal(countRows(path), 1);
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('4. exact retry reuses same durable entitlement without duplicate row', async () => {
  const { dir, path } = createDb();
  const clock = { value: SETTLED_AT + 1 };
  const server = await startControlledServer({
    dbPath: path,
    clock,
    handler: async () => ({ dossier: 'xilonen' }),
  });

  try {
    const first = await getJson(
      server.origin + XR1_RESOURCE.path,
      { headers: { 'x-xr1w-test-proof': 'valid' } },
    );
    const second = await getJson(
      server.origin + XR1_RESOURCE.path,
      { headers: { 'x-xr1w-test-proof': 'valid-idempotent' } },
    );

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(second.body.idempotent, true);
    assert.equal(
      second.body.entitlement.entitlementId,
      first.body.entitlement.entitlementId,
    );
    assert.equal(countRows(path), 1);
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('5. same paid invoice with competing txid is rejected and handler is unreachable', async () => {
  const { dir, path } = createDb();
  const clock = { value: SETTLED_AT + 1 };
  let handlerCalls = 0;
  const server = await startControlledServer({
    dbPath: path,
    clock,
    handler: async () => {
      handlerCalls += 1;
      return { dossier: 'xilonen' };
    },
  });

  try {
    const first = await getJson(
      server.origin + XR1_RESOURCE.path,
      { headers: { 'x-xr1w-test-proof': 'valid' } },
    );
    assert.equal(first.status, 200);

    const conflict = await getJson(
      server.origin + XR1_RESOURCE.path,
      { headers: { 'x-xr1w-test-proof': 'different-tx' } },
    );
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.code, 'XR1W_BINDING_CONFLICT');
    assert.equal(handlerCalls, 1);
    assert.equal(countRows(path), 1);
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('6. wrong C3B resource binding is rejected before XR1D grant', async () => {
  const { dir, path } = createDb();
  const clock = { value: SETTLED_AT + 1 };
  const server = await startControlledServer({
    dbPath: path,
    clock,
    handler: async () => ({ dossier: 'xilonen' }),
  });

  try {
    const response = await getJson(
      server.origin + XR1_RESOURCE.path,
      { headers: { 'x-xr1w-test-proof': 'wrong-resource' } },
    );
    assert.equal(response.status, 403);
    assert.equal(response.body.code, 'XR1_RESOURCE_MISMATCH');
    assert.equal(countRows(path), 0);
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('7. query and method variants cannot reuse the paid entitlement', async () => {
  const { dir, path } = createDb();
  const clock = { value: SETTLED_AT + 1 };
  const server = await startControlledServer({
    dbPath: path,
    clock,
    handler: async () => ({ dossier: 'xilonen' }),
  });

  try {
    const query = await getJson(
      server.origin + XR1_RESOURCE.path + '?variant=1',
      { headers: { 'x-xr1w-test-proof': 'valid' } },
    );
    assert.equal(query.status, 403);
    assert.equal(query.body.code, 'XR1_RESOURCE_MISMATCH');

    const post = await getJson(
      server.origin + XR1_RESOURCE.path,
      {
        method: 'POST',
        headers: { 'x-xr1w-test-proof': 'valid' },
      },
    );
    assert.equal(post.status, 403);
    assert.equal(post.body.code, 'XR1_RESOURCE_MISMATCH');
    assert.equal(countRows(path), 0);
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('8. handler failure preserves durable entitlement for retry without repayment', async () => {
  const { dir, path } = createDb();
  const clock = { value: SETTLED_AT + 1 };
  let fail = true;
  const server = await startControlledServer({
    dbPath: path,
    clock,
    handler: async () => {
      if (fail) throw new Error('delivery failed');
      return { dossier: 'xilonen' };
    },
  });

  try {
    const first = await getJson(
      server.origin + XR1_RESOURCE.path,
      { headers: { 'x-xr1w-test-proof': 'valid' } },
    );
    assert.equal(first.status, 503);
    assert.equal(first.body.code, 'XR1_DELIVERY_FAILED');
    assert.equal(countRows(path), 1);

    fail = false;
    const second = await getJson(
      server.origin + XR1_RESOURCE.path,
      { headers: { 'x-xr1w-test-proof': 'valid-idempotent' } },
    );
    assert.equal(second.status, 200);
    assert.equal(second.body.payload.dossier, 'xilonen');
    assert.equal(countRows(path), 1);
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('9. restart after grant preserves entitlement and allows idempotent retry', async () => {
  const { dir, path } = createDb();
  const clock = { value: SETTLED_AT + 1 };

  let server = await startControlledServer({
    dbPath: path,
    clock,
    handler: async () => ({ dossier: 'xilonen' }),
  });

  try {
    const first = await getJson(
      server.origin + XR1_RESOURCE.path,
      { headers: { 'x-xr1w-test-proof': 'valid' } },
    );
    assert.equal(first.status, 200);
    const entitlementId = first.body.entitlement.entitlementId;
    await server.close();

    server = await startControlledServer({
      dbPath: path,
      clock,
      handler: async () => ({ dossier: 'xilonen' }),
    });

    const second = await getJson(
      server.origin + XR1_RESOURCE.path,
      { headers: { 'x-xr1w-test-proof': 'valid-idempotent' } },
    );
    assert.equal(second.status, 200);
    assert.equal(second.body.entitlement.entitlementId, entitlementId);
    assert.equal(countRows(path), 1);
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('10. PAID remains idempotent after access TTL but XR1D denies and persists EXPIRED', async () => {
  const { dir, path } = createDb();
  const clock = { value: SETTLED_AT + 1 };
  const server = await startControlledServer({
    dbPath: path,
    clock,
    handler: async () => ({ dossier: 'xilonen' }),
  });

  try {
    const first = await getJson(
      server.origin + XR1_RESOURCE.path,
      { headers: { 'x-xr1w-test-proof': 'valid' } },
    );
    assert.equal(first.status, 200);

    clock.value = SETTLED_AT + ACCESS_TTL_SECONDS;

    const expired = await getJson(
      server.origin + XR1_RESOURCE.path,
      { headers: { 'x-xr1w-test-proof': 'valid-idempotent' } },
    );
    assert.equal(expired.status, 403);
    assert.equal(expired.body.code, 'XR1W_ACCESS_DENIED');

    const row = readRow(path);
    assert.equal(row.status, 'EXPIRED');
    assert.equal(row.invoice_hash, INVOICE);
    assert.equal(row.txid, TXID);
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('11. one second before TTL allows; exact boundary denies', async () => {
  const { dir, path } = createDb();
  const clock = { value: SETTLED_AT + ACCESS_TTL_SECONDS - 1 };
  const server = await startControlledServer({
    dbPath: path,
    clock,
    handler: async () => ({ dossier: 'xilonen' }),
  });

  try {
    const before = await getJson(
      server.origin + XR1_RESOURCE.path,
      { headers: { 'x-xr1w-test-proof': 'valid' } },
    );
    assert.equal(before.status, 200);

    clock.value = SETTLED_AT + ACCESS_TTL_SECONDS;
    const boundary = await getJson(
      server.origin + XR1_RESOURCE.path,
      { headers: { 'x-xr1w-test-proof': 'valid-idempotent' } },
    );
    assert.equal(boundary.status, 403);
    assert.equal(boundary.body.code, 'XR1W_ACCESS_DENIED');
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('12. SQLite writer contention maps to 503 and handler is unreachable', async () => {
  const { dir, path } = createDb();
  const clock = { value: SETTLED_AT + 1 };
  let handlerCalls = 0;
  const locker = new DatabaseSync(path);
  const server = await startControlledServer({
    dbPath: path,
    clock,
    handler: async () => {
      handlerCalls += 1;
      return { dossier: 'xilonen' };
    },
  });

  try {
    locker.exec('PRAGMA busy_timeout = 0;');
    locker.exec('BEGIN IMMEDIATE');

    const response = await getJson(
      server.origin + XR1_RESOURCE.path,
      { headers: { 'x-xr1w-test-proof': 'valid' } },
    );
    assert.equal(response.status, 503);
    assert.equal(response.body.code, 'XR1W_STORAGE_BUSY');
    assert.equal(handlerCalls, 0);
    assert.equal(countRows(path), 0);
  } finally {
    try { locker.exec('ROLLBACK'); } catch {}
    locker.close();
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('13. existing entitlement + locked DB prevents access check and never reaches handler', async () => {
  const { dir, path } = createDb();
  const clock = { value: SETTLED_AT + 1 };
  let handlerCalls = 0;

  let server = await startControlledServer({
    dbPath: path,
    clock,
    handler: async () => ({ dossier: 'xilonen' }),
  });
  try {
    const first = await getJson(
      server.origin + XR1_RESOURCE.path,
      { headers: { 'x-xr1w-test-proof': 'valid' } },
    );
    assert.equal(first.status, 200);
    await server.close();

    const locker = new DatabaseSync(path);
    locker.exec('PRAGMA busy_timeout = 0;');
    locker.exec('BEGIN IMMEDIATE');

    server = await startControlledServer({
      dbPath: path,
      clock,
      handler: async () => {
        handlerCalls += 1;
        return { dossier: 'xilonen' };
      },
    });

    const retry = await getJson(
      server.origin + XR1_RESOURCE.path,
      { headers: { 'x-xr1w-test-proof': 'valid-idempotent' } },
    );
    assert.equal(retry.status, 503);
    assert.equal(retry.body.code, 'XR1W_STORAGE_BUSY');
    assert.equal(handlerCalls, 0);

    locker.exec('ROLLBACK');
    locker.close();
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('14. source keeps wallet/payment authority outside XR1W', () => {
  const source = readFileSync(
    resolve(__dirname, '../../src/x402-xr1w/controlled-wiring.mjs'),
    'utf8',
  ).toLowerCase();

  for (const token of [
    'privatekey',
    'mnemonic',
    'broadcasttx',
    'chronik',
    'rawtransaction',
  ]) {
    assert.equal(source.includes(token), false, `XR1W source must not contain ${token}`);
  }

  assert.equal(source.includes('payment-proof'), false);
  assert.match(source, /createxr1entitlementgate/);
  assert.match(source, /authorizeaccess/);
});
