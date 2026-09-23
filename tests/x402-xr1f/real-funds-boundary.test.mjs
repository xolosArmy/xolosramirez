import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertControlledBoundary,
  assertRealFundsBoundary,
  XR1F_MODE,
  Xr1fBoundaryError,
} from '../../src/x402-xr1f/real-funds-boundary.mjs';

const RESOURCE = Object.freeze({
  resourceId: 'xolos:xilonen:verified-dossier:v1',
  resourceHash: '7de82337df5f68767c6c75206545cfe0e06eeaff6d15889547651eff972d930b',
});

function goodConfig(overrides = {}) {
  return {
    mode: XR1F_MODE.REAL_FUNDS,
    authorization: {
      approved: true,
      approvalId: 'xr1f-review-001',
    },
    nodeEnv: 'production',
    allowInsecureDevelopmentMode: false,
    c3bStore: { isDurable: true },
    payToAllocator: { allocate() {} },
    txProvider: { async getTx() {} },
    xr1dStore: {
      isDurable: true,
      grant() {},
      authorizeAccess() {},
    },
    publicOrigin: 'https://api.xolosramirez.com',
    resource: RESOURCE,
    ...overrides,
  };
}

test('1. controlled boundary is default and never authorizes real funds', () => {
  const result = assertControlledBoundary();
  assert.equal(result.ok, true);
  assert.equal(result.mode, XR1F_MODE.CONTROLLED);
  assert.equal(result.realFundsAuthorized, false);
});

test('2. REAL_FUNDS cannot pass through controlled assertion', () => {
  assert.throws(
    () => assertControlledBoundary({ mode: XR1F_MODE.REAL_FUNDS }),
    error =>
      error instanceof Xr1fBoundaryError &&
      error.code === 'XR1F_REAL_FUNDS_REQUIRES_SEPARATE_ASSERTION',
  );
});

test('3. real funds require explicit separate approval', () => {
  for (const authorization of [
    undefined,
    { approved: false, approvalId: 'x' },
    { approved: true, approvalId: '' },
  ]) {
    assert.throws(
      () => assertRealFundsBoundary(goodConfig({ authorization })),
      Xr1fBoundaryError,
    );
  }
});

test('4. real funds require production and forbid insecure development mode', () => {
  assert.throws(
    () => assertRealFundsBoundary(goodConfig({ nodeEnv: 'development' })),
    error =>
      error instanceof Xr1fBoundaryError &&
      error.code === 'XR1F_PRODUCTION_ENV_REQUIRED',
  );
  assert.throws(
    () => assertRealFundsBoundary(goodConfig({ allowInsecureDevelopmentMode: true })),
    error =>
      error instanceof Xr1fBoundaryError &&
      error.code === 'XR1F_INSECURE_MODE_FORBIDDEN',
  );
});

test('5. real funds require durable C3B and durable XR1D stores', () => {
  assert.throws(
    () => assertRealFundsBoundary(goodConfig({ c3bStore: { isDurable: false } })),
    error =>
      error instanceof Xr1fBoundaryError &&
      error.code === 'XR1F_DURABLE_C3B_STORE_REQUIRED',
  );

  assert.throws(
    () => assertRealFundsBoundary(goodConfig({ xr1dStore: { isDurable: false } })),
    error =>
      error instanceof Xr1fBoundaryError &&
      error.code === 'XR1F_DURABLE_XR1D_REQUIRED',
  );
});

test('6. real funds require unique watch-only payTo allocator', () => {
  assert.throws(
    () => assertRealFundsBoundary(goodConfig({ payToAllocator: null })),
    error =>
      error instanceof Xr1fBoundaryError &&
      error.code === 'XR1F_PAYTO_ALLOCATOR_REQUIRED',
  );
});

test('7. real funds require server-owned Chronik provider', () => {
  assert.throws(
    () => assertRealFundsBoundary(goodConfig({ txProvider: {} })),
    error =>
      error instanceof Xr1fBoundaryError &&
      error.code === 'XR1F_SERVER_CHRONIK_REQUIRED',
  );
});

test('8. static payTo and custom addressToScript are forbidden', () => {
  assert.throws(
    () => assertRealFundsBoundary(goodConfig({ staticPayTo: 'ecash:q...' })),
    error =>
      error instanceof Xr1fBoundaryError &&
      error.code === 'XR1F_STATIC_PAYTO_FORBIDDEN',
  );

  assert.throws(
    () => assertRealFundsBoundary(goodConfig({ addressToScript() {} })),
    error =>
      error instanceof Xr1fBoundaryError &&
      error.code === 'XR1F_CUSTOM_SCRIPT_CONVERTER_FORBIDDEN',
  );
});

test('9. canonical origin and frozen resource are mandatory', () => {
  assert.throws(
    () => assertRealFundsBoundary(goodConfig({ publicOrigin: 'https://example.com' })),
    error =>
      error instanceof Xr1fBoundaryError &&
      error.code === 'XR1F_CANONICAL_ORIGIN_REQUIRED',
  );

  assert.throws(
    () => assertRealFundsBoundary(goodConfig({
      resource: { ...RESOURCE, resourceHash: 'c'.repeat(64) },
    })),
    error =>
      error instanceof Xr1fBoundaryError &&
      error.code === 'XR1F_CANONICAL_RESOURCE_REQUIRED',
  );
});

test('10. fully explicit production configuration can cross the boundary', () => {
  const result = assertRealFundsBoundary(goodConfig());
  assert.equal(result.ok, true);
  assert.equal(result.mode, XR1F_MODE.REAL_FUNDS);
  assert.equal(result.production, true);
  assert.equal(result.approvalId, 'xr1f-review-001');
});

test('11. boundary module contains no signing, key or broadcast authority', async () => {
  const source = await import('node:fs').then(({ readFileSync }) =>
    readFileSync(
      new URL('../../src/x402-xr1f/real-funds-boundary.mjs', import.meta.url),
      'utf8',
    ).toLowerCase(),
  );

  for (const token of ['privatekey', 'mnemonic', 'broadcasttx', 'rawtransaction']) {
    assert.equal(source.includes(token), false, token);
  }
});
