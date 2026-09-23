import test from 'node:test';
import assert from 'node:assert/strict';
import {
  XR1_RESOURCE,
  InMemoryXr1EntitlementStore,
  projectC3BSettlement,
  unlockXr1Resource,
  assertProductionEntitlementStore,
  Xr1GateError
} from '../../src/x402-xr1/entitlement.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

function paidResult(overrides = {}) {
  const invoice = {
    invoiceHash: A,
    resourceHash: XR1_RESOURCE.resourceHash,
    network: 'xec:mainnet',
    scheme: 'exact',
    state: 'PAID',
    settledTxid: B,
    settledAt: 1_797_000_000,
    ...overrides.invoice
  };
  const proof = {
    x402Version: 1,
    network: 'xec:mainnet',
    invoiceHash: A,
    txid: B,
    ...overrides.proof
  };
  return {
    ok: true,
    status: 'UNLOCKED',
    invoice,
    proof,
    matchedOutputIndex: 2,
    transaction: { txid: B, outputs: [] },
    idempotent: false,
    ...overrides.root
  };
}

test('1. canonical C3B PAID result projects to narrow XR1 settlement view', () => {
  const view = projectC3BSettlement(paidResult());
  assert.deepEqual(view, {
    version: 'x402-xr1/1',
    status: 'PAID',
    network: 'xec:mainnet',
    invoiceHash: A,
    txid: B,
    resourceHash: XR1_RESOURCE.resourceHash,
    settledAt: 1_797_000_000
  });
  for (const forbidden of ['privateKey', 'rawTx', 'signatory', 'signature', 'payTo', 'amountSats', 'matchedOutputIndex', 'transaction']) {
    assert.equal(Object.hasOwn(view, forbidden), false, `must not expose ${forbidden}`);
  }
});

test('2. handler is unreachable before C3B UNLOCKED/PAID evidence', async () => {
  const store = new InMemoryXr1EntitlementStore();
  let calls = 0;
  const handler = async () => { calls++; return { dossier: true }; };

  for (const result of [
    null,
    { ok: false, status: 'DENIED' },
    paidResult({ root: { ok: false } }),
    paidResult({ root: { status: 'LOCKED' } }),
    paidResult({ invoice: { state: 'ISSUED' } })
  ]) {
    const response = await unlockXr1Resource({ c3bResult: result, store, handler });
    assert.equal(response.ok, false);
    assert.equal(calls, 0);
  }
});

test('3. valid C3B result grants entitlement before delivery', async () => {
  const store = new InMemoryXr1EntitlementStore();
  let observed;
  const result = await unlockXr1Resource({
    c3bResult: paidResult(),
    store,
    handler: async entitlement => {
      observed = await store.getByInvoiceHash(A);
      return { resourceId: entitlement.resourceId };
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'UNLOCKED');
  assert.equal(result.idempotent, false);
  assert.equal(observed?.status, 'ACTIVE');
  assert.equal(result.payload.resourceId, XR1_RESOURCE.resourceId);
});

test('4. same invoice + same txid retry is idempotent and never creates a second entitlement', async () => {
  const store = new InMemoryXr1EntitlementStore();
  const first = await unlockXr1Resource({ c3bResult: paidResult(), store, handler: async () => 'first' });
  const second = await unlockXr1Resource({ c3bResult: paidResult(), store, handler: async () => 'second' });
  assert.equal(first.ok, true);
  assert.equal(first.idempotent, false);
  assert.equal(second.ok, true);
  assert.equal(second.idempotent, true);
  assert.equal(second.entitlement.entitlementId, first.entitlement.entitlementId);
});

test('5. same invoice cannot switch to a competing txid', async () => {
  const store = new InMemoryXr1EntitlementStore();
  assert.equal((await unlockXr1Resource({ c3bResult: paidResult(), store, handler: async () => true })).ok, true);
  const competing = paidResult({
    invoice: { settledTxid: C },
    proof: { txid: C }
  });
  const response = await unlockXr1Resource({ c3bResult: competing, store, handler: async () => true });
  assert.deepEqual({ ok: response.ok, code: response.code, httpStatus: response.httpStatus }, {
    ok: false, code: 'XR1_INVOICE_CONFLICT', httpStatus: 409
  });
});

test('6. same txid cannot be replayed for a different invoice', async () => {
  const store = new InMemoryXr1EntitlementStore();
  await unlockXr1Resource({ c3bResult: paidResult(), store, handler: async () => true });
  const other = paidResult({
    invoice: { invoiceHash: C },
    proof: { invoiceHash: C }
  });
  const response = await unlockXr1Resource({ c3bResult: other, store, handler: async () => true });
  assert.equal(response.ok, false);
  assert.equal(response.code, 'XR1_TXID_REPLAY');
  assert.equal(response.httpStatus, 409);
});

test('7. invoiceHash mismatch fails closed', async () => {
  const response = await unlockXr1Resource({
    c3bResult: paidResult({ proof: { invoiceHash: C } }),
    store: new InMemoryXr1EntitlementStore(),
    handler: async () => true
  });
  assert.equal(response.ok, false);
  assert.equal(response.code, 'XR1_INVOICE_BINDING_MISMATCH');
});

test('8. settled txid mismatch fails closed', async () => {
  const response = await unlockXr1Resource({
    c3bResult: paidResult({ proof: { txid: C } }),
    store: new InMemoryXr1EntitlementStore(),
    handler: async () => true
  });
  assert.equal(response.ok, false);
  assert.equal(response.code, 'XR1_TXID_BINDING_MISMATCH');
});

test('9. wrong resource hash fails closed', async () => {
  const response = await unlockXr1Resource({
    c3bResult: paidResult({ invoice: { resourceHash: C } }),
    store: new InMemoryXr1EntitlementStore(),
    handler: async () => true
  });
  assert.equal(response.ok, false);
  assert.equal(response.code, 'XR1_RESOURCE_MISMATCH');
});

test('10. wrong network, scheme or x402 version fail closed', async () => {
  const cases = [
    [paidResult({ invoice: { network: 'xec:testnet' } }), 'XR1_NETWORK_MISMATCH'],
    [paidResult({ invoice: { scheme: 'other' } }), 'XR1_SCHEME_MISMATCH'],
    [paidResult({ proof: { x402Version: 2 } }), 'XR1_VERSION_MISMATCH']
  ];
  for (const [c3bResult, code] of cases) {
    const response = await unlockXr1Resource({
      c3bResult,
      store: new InMemoryXr1EntitlementStore(),
      handler: async () => true
    });
    assert.equal(response.ok, false);
    assert.equal(response.code, code);
  }
});

test('11. malformed canonical evidence fails closed without handler execution', async () => {
  let calls = 0;
  const cases = [
    paidResult({ invoice: { invoiceHash: 'ABC' } }),
    paidResult({ invoice: { settledTxid: null } }),
    paidResult({ proof: { txid: 'not-a-txid' } }),
    paidResult({ invoice: { settledAt: 'now' } })
  ];
  for (const c3bResult of cases) {
    const response = await unlockXr1Resource({
      c3bResult,
      store: new InMemoryXr1EntitlementStore(),
      handler: async () => { calls++; }
    });
    assert.equal(response.ok, false);
  }
  assert.equal(calls, 0);
});

test('12. delivery failure preserves entitlement for idempotent retry without repayment', async () => {
  const store = new InMemoryXr1EntitlementStore();
  const failed = await unlockXr1Resource({
    c3bResult: paidResult(),
    store,
    handler: async () => { throw new Error('socket drop'); }
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.code, 'XR1_DELIVERY_FAILED');
  assert.equal((await store.getByInvoiceHash(A))?.status, 'ACTIVE');

  const retry = await unlockXr1Resource({
    c3bResult: paidResult(),
    store,
    handler: async entitlement => ({ entitlementId: entitlement.entitlementId })
  });
  assert.equal(retry.ok, true);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.payload.entitlementId, failed.entitlement.entitlementId);
});

test('13. in-memory entitlement store is explicitly rejected for production', () => {
  const store = new InMemoryXr1EntitlementStore();
  assert.equal(store.isDurable, false);
  assert.throws(() => assertProductionEntitlementStore(store), error =>
    error instanceof Xr1GateError && error.code === 'XR1_DURABLE_STORE_REQUIRED'
  );
});

test('14. XR1 source contains no signing, raw transaction or broadcast authority', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../src/x402-xr1/entitlement.mjs', import.meta.url), 'utf8');
  const forbiddenCalls = [
    'broadcastTx(',
    'broadcast(',
    'signPreparedTransaction(',
    'signatoryForUtxo(',
    'P2PKHSignatory(',
    'TxBuilder('
  ];
  for (const token of forbiddenCalls) {
    assert.equal(source.includes(token), false, `XR1 must not contain authority token ${token}`);
  }
});

test('15. parallel identical grants converge on one entitlement', async () => {
  const store = new InMemoryXr1EntitlementStore();
  const settlement = projectC3BSettlement(paidResult());
  const [a, b] = await Promise.all([
    store.grant(settlement),
    store.grant(settlement)
  ]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.deepEqual([a.idempotent, b.idempotent].sort(), [false, true]);
  assert.equal(a.entitlement.entitlementId, b.entitlement.entitlementId);
});

test('16. direct client payment proof is rejected before any entitlement logic', async () => {
  let calls = 0;
  const response = await unlockXr1Resource({
    clientProof: { x402Version: 1, network: 'xec:mainnet', invoiceHash: A, txid: B },
    c3bResult: paidResult(),
    store: new InMemoryXr1EntitlementStore(),
    handler: async () => { calls++; }
  });
  assert.equal(response.ok, false);
  assert.equal(response.code, 'XR1_DIRECT_CLIENT_PROOF_FORBIDDEN');
  assert.equal(response.httpStatus, 400);
  assert.equal(calls, 0);
});

test('17. protected resource identity is frozen to Xilonen verified dossier v1', () => {
  assert.deepEqual(XR1_RESOURCE, {
    resourceId: 'xolos:xilonen:verified-dossier:v1',
    serverOrigin: 'https://api.xolosramirez.com',
    method: 'GET',
    path: '/v1/xolos/xilonen/verified-dossier',
    resourceHash: '7de82337df5f68767c6c75206545cfe0e06eeaff6d15889547651eff972d930b'
  });
});
