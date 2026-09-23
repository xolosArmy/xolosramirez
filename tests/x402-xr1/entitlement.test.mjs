import test from 'node:test';
import assert from 'node:assert/strict';
import {
  XR1_RESOURCE,
  InMemoryXr1EntitlementStore,
  createXr1EntitlementGate,
  assertProductionEntitlementStore,
  Xr1GateError
} from '../../src/x402-xr1/entitlement.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

function paidResult(overrides = {}) {
  return {
    ok: true,
    status: 'UNLOCKED',
    invoice: {
      invoiceHash: A,
      resourceHash: XR1_RESOURCE.resourceHash,
      network: 'xec:mainnet',
      scheme: 'exact',
      state: 'PAID',
      settledTxid: B,
      settledAt: 1_797_000_000,
      ...overrides.invoice
    },
    proof: {
      x402Version: 1,
      network: 'xec:mainnet',
      invoiceHash: A,
      txid: B,
      ...overrides.proof
    },
    ...overrides.root
  };
}

function request(overrides = {}) {
  return {
    method: 'GET',
    originalUrl: XR1_RESOURCE.path,
    x402Settlement: paidResult(),
    ...overrides
  };
}

function canonicalHasher(resource) {
  assert.deepEqual(resource, {
    serverOrigin: XR1_RESOURCE.serverOrigin,
    method: 'GET',
    path: XR1_RESOURCE.path
  });
  return XR1_RESOURCE.resourceHash;
}

function gate({ store = new InMemoryXr1EntitlementStore(), handler = async entitlement => entitlement, hasher = canonicalHasher } = {}) {
  return createXr1EntitlementGate({ store, handler, computeResourceHash: hasher });
}

test('1. valid internal C3B settlement unlocks frozen XR1 resource', async () => {
  const run = gate();
  const result = await run(request());
  assert.equal(result.ok, true);
  assert.equal(result.status, 'UNLOCKED');
  assert.equal(result.idempotent, false);
  assert.equal(result.entitlement.resourceId, XR1_RESOURCE.resourceId);
});

test('2. handler is unreachable without request.x402Settlement', async () => {
  let calls = 0;
  const run = gate({ handler: async () => { calls++; } });
  const result = await run(request({ x402Settlement: undefined }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'XR1_C3B_NOT_UNLOCKED');
  assert.equal(calls, 0);
});

test('3. client body cannot substitute for internal C3B settlement', async () => {
  let calls = 0;
  const forged = paidResult();
  const run = gate({ handler: async () => { calls++; } });
  const result = await run({
    method: 'GET',
    originalUrl: XR1_RESOURCE.path,
    body: forged,
    x402Settlement: undefined
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'XR1_RESOURCE_MISMATCH');
  assert.equal(calls, 0);
});

test('4. client payment-proof-like headers cannot substitute for internal C3B settlement', async () => {
  let calls = 0;
  const run = gate({ handler: async () => { calls++; } });
  const result = await run({
    method: 'GET',
    originalUrl: XR1_RESOURCE.path,
    headers: { 'payment-proof': JSON.stringify({ x402Version: 1, network: 'xec:mainnet', invoiceHash: A, txid: B }) }
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'XR1_C3B_NOT_UNLOCKED');
  assert.equal(calls, 0);
});

test('5. canonical resource hash is recomputed at runtime', async () => {
  let calls = 0;
  const run = gate({
    hasher: () => C,
    handler: async () => { calls++; }
  });
  const result = await run(request());
  assert.equal(result.ok, false);
  assert.equal(result.code, 'XR1_RESOURCE_MISMATCH');
  assert.equal(calls, 0);
});

test('6. missing canonical x402-XEC hasher fails closed at gate construction', () => {
  assert.throws(
    () => createXr1EntitlementGate({
      store: new InMemoryXr1EntitlementStore(),
      handler: async () => true
    }),
    error => error instanceof Xr1GateError && error.code === 'XR1_CANONICAL_HASHER_REQUIRED'
  );
});

test('7. same invoice + same txid retry is idempotent', async () => {
  const store = new InMemoryXr1EntitlementStore();
  const run = gate({ store });
  const first = await run(request());
  const second = await run(request());
  assert.equal(first.ok, true);
  assert.equal(first.idempotent, false);
  assert.equal(second.ok, true);
  assert.equal(second.idempotent, true);
  assert.equal(first.entitlement.entitlementId, second.entitlement.entitlementId);
});

test('8. same invoice cannot switch to competing txid', async () => {
  const store = new InMemoryXr1EntitlementStore();
  const run = gate({ store });
  assert.equal((await run(request())).ok, true);
  const competing = request({
    x402Settlement: paidResult({
      invoice: { settledTxid: C },
      proof: { txid: C }
    })
  });
  const result = await run(competing);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'XR1_INVOICE_CONFLICT');
  assert.equal(result.httpStatus, 409);
});

test('9. same txid cannot be replayed for another invoice', async () => {
  const store = new InMemoryXr1EntitlementStore();
  const run = gate({ store });
  await run(request());
  const result = await run(request({
    x402Settlement: paidResult({
      invoice: { invoiceHash: C },
      proof: { invoiceHash: C }
    })
  }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'XR1_TXID_REPLAY');
  assert.equal(result.httpStatus, 409);
});

test('10. invoiceHash mismatch fails closed', async () => {
  const result = await gate()(request({
    x402Settlement: paidResult({ proof: { invoiceHash: C } })
  }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'XR1_INVOICE_BINDING_MISMATCH');
});

test('11. settled txid mismatch fails closed', async () => {
  const result = await gate()(request({
    x402Settlement: paidResult({ proof: { txid: C } })
  }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'XR1_TXID_BINDING_MISMATCH');
});

test('12. paid invoice for different resource fails closed', async () => {
  const result = await gate()(request({
    x402Settlement: paidResult({ invoice: { resourceHash: C } })
  }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'XR1_RESOURCE_MISMATCH');
});

test('13. wrong network, scheme or x402 version fail closed', async () => {
  const cases = [
    [paidResult({ invoice: { network: 'xec:testnet' } }), 'XR1_NETWORK_MISMATCH'],
    [paidResult({ invoice: { scheme: 'other' } }), 'XR1_SCHEME_MISMATCH'],
    [paidResult({ proof: { x402Version: 2 } }), 'XR1_VERSION_MISMATCH']
  ];
  for (const [x402Settlement, code] of cases) {
    const result = await gate()(request({ x402Settlement }));
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
  }
});

test('14. query/path/method variants cannot reuse the entitlement', async () => {
  for (const req of [
    request({ method: 'POST' }),
    request({ originalUrl: XR1_RESOURCE.path + '?x=1' }),
    request({ originalUrl: '/v1/xolos/tlilxochitl/verified-dossier' })
  ]) {
    const result = await gate()(req);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'XR1_RESOURCE_MISMATCH');
  }
});

test('15. handler observes entitlement already committed', async () => {
  const store = new InMemoryXr1EntitlementStore();
  let observed;
  const run = gate({
    store,
    handler: async entitlement => {
      observed = await store.getByInvoiceHash(A);
      return entitlement.entitlementId;
    }
  });
  const result = await run(request());
  assert.equal(result.ok, true);
  assert.equal(observed?.status, 'ACTIVE');
  assert.equal(result.payload, result.entitlement.entitlementId);
});

test('16. delivery failure preserves entitlement for idempotent retry', async () => {
  const store = new InMemoryXr1EntitlementStore();
  const failRun = gate({ store, handler: async () => { throw new Error('socket drop'); } });
  const failed = await failRun(request());
  assert.equal(failed.ok, false);
  assert.equal(failed.code, 'XR1_DELIVERY_FAILED');
  assert.equal((await store.getByInvoiceHash(A))?.status, 'ACTIVE');

  const retryRun = gate({ store });
  const retry = await retryRun(request());
  assert.equal(retry.ok, true);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.entitlement.entitlementId, failed.entitlement.entitlementId);
});

test('17. parallel identical requests converge on one entitlement', async () => {
  const store = new InMemoryXr1EntitlementStore();
  const run = gate({ store });
  const [a, b] = await Promise.all([run(request()), run(request())]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.deepEqual([a.idempotent, b.idempotent].sort(), [false, true]);
  assert.equal(a.entitlement.entitlementId, b.entitlement.entitlementId);
});

test('18. in-memory store is forbidden for production', () => {
  const store = new InMemoryXr1EntitlementStore();
  assert.equal(store.isDurable, false);
  assert.throws(
    () => assertProductionEntitlementStore(store),
    error => error instanceof Xr1GateError && error.code === 'XR1_DURABLE_STORE_REQUIRED'
  );
});

test('19. XR1 source contains no signing, tx parsing or broadcast authority', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../src/x402-xr1/entitlement.mjs', import.meta.url), 'utf8');
  for (const token of [
    'broadcastTx(',
    'broadcast(',
    'signPreparedTransaction(',
    'signatoryForUtxo(',
    'P2PKHSignatory(',
    'TxBuilder(',
    'parseTransaction(',
    'deserializeTransaction('
  ]) {
    assert.equal(source.includes(token), false, `XR1 must not contain authority token ${token}`);
  }
});

test('20. frozen resource identity matches canonical C3B hash', () => {
  assert.deepEqual(XR1_RESOURCE, {
    resourceId: 'xolos:xilonen:verified-dossier:v1',
    serverOrigin: 'https://api.xolosramirez.com',
    method: 'GET',
    path: '/v1/xolos/xilonen/verified-dossier',
    resourceHash: '7de82337df5f68767c6c75206545cfe0e06eeaff6d15889547651eff972d930b'
  });
});
