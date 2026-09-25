import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_X402_XEC_COMMIT,
  XR1F_L1_ALLOCATOR_KIND,
  XR1F_L1_NETWORK,
  Xr1fL1AllocatorError,
  assertWatchOnlyAllocator,
  computeAllocatorId,
  createWatchOnlyAllocator,
} from '../../src/x402-xr1f-l1/allocator.mjs';

const XPUB =
  'xpub661MyMwAqRbcEtUEgdXRTY6dJQG9fRgs7C5QomqETKMYBJVtSGpRqyHSmhWy8snovPd5oWZgQ14zUquxbxu7Z1umuXbN5VDpUL1QobD5xUY';

function fakeAddress(index) {
  return `ecash:q${String(index).padStart(41, '0')}`;
}

function factory(overrides = {}) {
  return () => ({
    deriveAddress(index) {
      return fakeAddress(index);
    },
    ...overrides,
  });
}

function expectAllocatorError(fn, code) {
  assert.throws(
    fn,
    error =>
      error instanceof Xr1fL1AllocatorError &&
      error.code === code,
  );
}

test('1. allocatorId is deterministic, domain-separated and whitespace-normalized', () => {
  const a = computeAllocatorId(XPUB);
  const b = computeAllocatorId(`  ${XPUB}  `);

  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, b);
  assert.notEqual(a, Buffer.from(XPUB).toString('hex').slice(0, 64));
});

test('2. only a mainnet watch-only xpub is accepted', () => {
  for (const value of [undefined, null, '', '   ']) {
    expectAllocatorError(
      () => computeAllocatorId(value),
      'XR1F_L1_XPUB_REQUIRED',
    );
  }

  for (const value of ['xprv-secret', 'tprv-secret']) {
    expectAllocatorError(
      () => computeAllocatorId(value),
      'XR1F_L1_PRIVATE_KEY_MATERIAL_FORBIDDEN',
    );
  }

  for (const value of ['tpub-public', 'pub-not-bip32']) {
    expectAllocatorError(
      () => computeAllocatorId(value),
      'XR1F_L1_MAINNET_XPUB_REQUIRED',
    );
  }
});

test('3. facade fixes canonical identity and exposes no merchant xpub', () => {
  const allocator = createWatchOnlyAllocator({
    merchantXpub: XPUB,
    createUpstreamAllocator: factory(),
  });

  assert.equal(allocator.kind, XR1F_L1_ALLOCATOR_KIND);
  assert.equal(allocator.isWatchOnly, true);
  assert.equal(allocator.network, XR1F_L1_NETWORK);
  assert.equal(allocator.x402Commit, CANONICAL_X402_XEC_COMMIT);
  assert.equal(allocator.allocatorId, computeAllocatorId(XPUB));
  assert.equal(Object.isFrozen(allocator), true);

  assert.equal('merchantXpub' in allocator, false);
  assert.equal('xpub' in allocator, false);
  assert.equal('privateKey' in allocator, false);
  assert.equal('seed' in allocator, false);
  assert.equal('mnemonic' in allocator, false);
});

test('4. canonical x402-XEC pin is mandatory', () => {
  expectAllocatorError(
    () =>
      createWatchOnlyAllocator({
        merchantXpub: XPUB,
        createUpstreamAllocator: factory(),
        x402Commit: '1'.repeat(40),
      }),
    'XR1F_L1_X402_PIN_MISMATCH',
  );
});

test('5. canonical upstream allocator factory is mandatory and fail-closed', () => {
  expectAllocatorError(
    () =>
      createWatchOnlyAllocator({
        merchantXpub: XPUB,
        createUpstreamAllocator: null,
      }),
    'XR1F_L1_UPSTREAM_FACTORY_REQUIRED',
  );

  expectAllocatorError(
    () =>
      createWatchOnlyAllocator({
        merchantXpub: XPUB,
        createUpstreamAllocator() {
          throw new Error('upstream rejected key');
        },
      }),
    'XR1F_L1_UPSTREAM_ALLOCATOR_REJECTED',
  );

  expectAllocatorError(
    () =>
      createWatchOnlyAllocator({
        merchantXpub: XPUB,
        createUpstreamAllocator: () => ({}),
      }),
    'XR1F_L1_UPSTREAM_DERIVER_INVALID',
  );
});

test('6. upstream or facade spend authority is rejected', () => {
  for (const capability of [
    'sign',
    'signTransaction',
    'signTx',
    'broadcast',
    'broadcastTx',
    'send',
    'sendTransaction',
    'sendRawTransaction',
    'buildTransaction',
    'createTransaction',
  ]) {
    expectAllocatorError(
      () =>
        createWatchOnlyAllocator({
          merchantXpub: XPUB,
          createUpstreamAllocator: factory({
            [capability]() {},
          }),
        }),
      'XR1F_L1_SPEND_CAPABILITY_FORBIDDEN',
    );
  }

  const valid = createWatchOnlyAllocator({
    merchantXpub: XPUB,
    createUpstreamAllocator: factory(),
  });

  const forged = {
    ...valid,
    sign() {},
  };

  expectAllocatorError(
    () => assertWatchOnlyAllocator(forged),
    'XR1F_L1_SPEND_CAPABILITY_FORBIDDEN',
  );
});

test('7. deriveAddress delegates deterministically for valid non-hardened indices', () => {
  const seen = [];
  const allocator = createWatchOnlyAllocator({
    merchantXpub: XPUB,
    createUpstreamAllocator: () => ({
      deriveAddress(index) {
        seen.push(index);
        return fakeAddress(index);
      },
    }),
  });

  for (const index of [0, 1, 42, 0x7fffffff]) {
    assert.equal(allocator.deriveAddress(index), fakeAddress(index));
  }

  assert.deepEqual(seen, [0, 1, 42, 0x7fffffff]);
  assert.equal(allocator.deriveAddress(42), fakeAddress(42));
});

test('8. hardened, fractional, negative and unsafe derivation indices fail closed', () => {
  const allocator = createWatchOnlyAllocator({
    merchantXpub: XPUB,
    createUpstreamAllocator: factory(),
  });

  for (const index of [
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER,
    0x80000000,
  ]) {
    expectAllocatorError(
      () => allocator.deriveAddress(index),
      'XR1F_L1_DERIVATION_INDEX_INVALID',
    );
  }
});

test('9. upstream derivation failures are normalized without leaking internals', () => {
  const allocator = createWatchOnlyAllocator({
    merchantXpub: XPUB,
    createUpstreamAllocator: () => ({
      deriveAddress() {
        throw new Error('sensitive upstream detail');
      },
    }),
  });

  expectAllocatorError(
    () => allocator.deriveAddress(0),
    'XR1F_L1_DERIVATION_FAILED',
  );
});

test('10. derived address must be lowercase canonical eCash mainnet shape', () => {
  for (const badAddress of [
    undefined,
    null,
    '',
    'ecash:q1',
    'ECASH:q00000000000000000000000000000000000000000',
    'bitcoincash:q00000000000000000000000000000000000000000',
    'ecash:Q00000000000000000000000000000000000000000',
  ]) {
    const allocator = createWatchOnlyAllocator({
      merchantXpub: XPUB,
      createUpstreamAllocator: () => ({
        deriveAddress() {
          return badAddress;
        },
      }),
    });

    expectAllocatorError(
      () => allocator.deriveAddress(0),
      'XR1F_L1_DERIVED_ADDRESS_INVALID',
    );
  }
});

test('11. assertWatchOnlyAllocator rejects forged identity and contract drift', () => {
  const valid = createWatchOnlyAllocator({
    merchantXpub: XPUB,
    createUpstreamAllocator: factory(),
  });

  const cases = [
    [{ ...valid, kind: 'OTHER' }, 'XR1F_L1_ALLOCATOR_KIND_MISMATCH'],
    [{ ...valid, isWatchOnly: false }, 'XR1F_L1_WATCH_ONLY_REQUIRED'],
    [{ ...valid, network: 'xec:testnet' }, 'XR1F_L1_NETWORK_MISMATCH'],
    [{ ...valid, x402Commit: '1'.repeat(40) }, 'XR1F_L1_X402_PIN_MISMATCH'],
    [{ ...valid, allocatorId: 'bad' }, 'XR1F_L1_ALLOCATOR_ID_INVALID'],
    [{ ...valid, deriveAddress: null }, 'XR1F_L1_DERIVER_REQUIRED'],
  ];

  for (const [candidate, code] of cases) {
    expectAllocatorError(
      () => assertWatchOnlyAllocator(candidate),
      code,
    );
  }
});

test('12. same xpub creates same public allocator identity across restarts', () => {
  const a = createWatchOnlyAllocator({
    merchantXpub: XPUB,
    createUpstreamAllocator: factory(),
  });
  const b = createWatchOnlyAllocator({
    merchantXpub: XPUB,
    createUpstreamAllocator: factory(),
  });

  assert.equal(a.allocatorId, b.allocatorId);
  assert.equal(a.deriveAddress(123), b.deriveAddress(123));
});
