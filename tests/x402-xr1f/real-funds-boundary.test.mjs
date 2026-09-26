import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  createWatchOnlyAllocator,
  loadPinnedX402AllocatorImplementation,
} from '../../src/x402-xr1f-l1/allocator.mjs';
import {
  bindAllocator,
} from '../../src/x402-xr1f-l1/binding.mjs';
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

const XPUB =
  'xpub661MyMwAqRbcEtUEgdXRTY6dJQG9fRgs7C5QomqETKMYBJVtSGpRqyHSmhWy8snovPd5oWZgQ14zUquxbxu7Z1umuXbN5VDpUL1QobD5xUY';

const MIGRATION = new URL(
  '../../src/x402-xr1f-l1/migrations/001_allocator_binding.sql',
  import.meta.url,
);

const CANONICAL_MODULE =
  process.env.XR1F_L1_CANONICAL_MODULE_PATH?.trim() || null;

const canonicalTest = CANONICAL_MODULE ? test : test.skip;

let canonicalImplementation = null;
if (CANONICAL_MODULE) {
  canonicalImplementation =
    await loadPinnedX402AllocatorImplementation({
      modulePath: CANONICAL_MODULE,
    });
}

function baseConfig(overrides = {}) {
  return {
    mode: XR1F_MODE.REAL_FUNDS,
    authorization: {
      approved: true,
      approvalId: 'xr1f-review-001',
    },
    nodeEnv: 'production',
    allowInsecureDevelopmentMode: false,
    c3bStore: { isDurable: true },
    payToAllocator: null,
    c3bDb: null,
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

function withCanonicalConfig(fn, overrides = {}) {
  if (!canonicalImplementation) {
    throw new Error('canonical XR1F-L1 implementation unavailable');
  }

  const dir = mkdtempSync(join(tmpdir(), 'xr1f-boundary-'));
  const dbPath = join(dir, 'c3b.sqlite');
  const c3bDb = new DatabaseSync(dbPath);

  try {
    c3bDb.exec(readFileSync(MIGRATION, 'utf8'));

    const payToAllocator = createWatchOnlyAllocator({
      merchantXpub: XPUB,
      pinnedImplementation: canonicalImplementation,
    });

    bindAllocator({
      db: c3bDb,
      allocator: payToAllocator,
      boundAt: 1_797_000_000,
    });

    const config = baseConfig({
      payToAllocator,
      c3bDb,
      ...overrides,
    });

    return fn(config, { c3bDb, payToAllocator });
  } finally {
    try { c3bDb.close(); } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
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
      () => assertRealFundsBoundary(baseConfig({ authorization })),
      Xr1fBoundaryError,
    );
  }
});

test('4. real funds require production and forbid insecure development mode', () => {
  assert.throws(
    () => assertRealFundsBoundary(baseConfig({ nodeEnv: 'development' })),
    error =>
      error instanceof Xr1fBoundaryError &&
      error.code === 'XR1F_PRODUCTION_ENV_REQUIRED',
  );
  assert.throws(
    () => assertRealFundsBoundary(baseConfig({ allowInsecureDevelopmentMode: true })),
    error =>
      error instanceof Xr1fBoundaryError &&
      error.code === 'XR1F_INSECURE_MODE_FORBIDDEN',
  );
});

test('5. real funds require durable C3B and durable XR1D stores', () => {
  assert.throws(
    () => assertRealFundsBoundary(baseConfig({ c3bStore: { isDurable: false } })),
    error =>
      error instanceof Xr1fBoundaryError &&
      error.code === 'XR1F_DURABLE_C3B_STORE_REQUIRED',
  );

  canonicalTest('5b. durable XR1D remains mandatory after L1 allocator verification', () => {
    withCanonicalConfig(config => {
      assert.throws(
        () =>
          assertRealFundsBoundary({
            ...config,
            xr1dStore: { isDurable: false },
          }),
        error =>
          error instanceof Xr1fBoundaryError &&
          error.code === 'XR1F_DURABLE_XR1D_REQUIRED',
      );
    });
  });
});

test('6. generic allocate() object is rejected; authenticated L1 allocator is required', () => {
  assert.throws(
    () =>
      assertRealFundsBoundary(
        baseConfig({
          payToAllocator: { allocate() {} },
          c3bDb: {
            prepare() {},
            exec() {},
          },
        }),
      ),
    error =>
      error instanceof Xr1fBoundaryError &&
      error.code === 'XR1F_PAYTO_ALLOCATOR_REQUIRED',
  );
});

canonicalTest('7. authenticated allocator must be durably bound to the authoritative C3B database', () => {
  withCanonicalConfig((config, { payToAllocator }) => {
    const otherDir = mkdtempSync(join(tmpdir(), 'xr1f-boundary-unbound-'));
    const otherPath = join(otherDir, 'c3b.sqlite');
    const otherDb = new DatabaseSync(otherPath);

    try {
      otherDb.exec(readFileSync(MIGRATION, 'utf8'));

      assert.throws(
        () =>
          assertRealFundsBoundary({
            ...config,
            payToAllocator,
            c3bDb: otherDb,
          }),
        error =>
          error instanceof Xr1fBoundaryError &&
          error.code === 'XR1F_PAYTO_BINDING_REQUIRED',
      );
    } finally {
      try { otherDb.close(); } catch {}
      rmSync(otherDir, { recursive: true, force: true });
    }
  });
});

canonicalTest('8. authoritative C3B SQLite handle is mandatory', () => {
  withCanonicalConfig(config => {
    assert.throws(
      () =>
        assertRealFundsBoundary({
          ...config,
          c3bDb: null,
        }),
      error =>
        error instanceof Xr1fBoundaryError &&
        error.code === 'XR1F_C3B_DB_REQUIRED',
    );
  });
});

canonicalTest('9. real funds require server-owned Chronik provider', () => {
  withCanonicalConfig(config => {
    assert.throws(
      () => assertRealFundsBoundary({ ...config, txProvider: {} }),
      error =>
        error instanceof Xr1fBoundaryError &&
        error.code === 'XR1F_SERVER_CHRONIK_REQUIRED',
    );
  });
});

canonicalTest('10. static payTo and custom addressToScript are forbidden', () => {
  withCanonicalConfig(config => {
    assert.throws(
      () => assertRealFundsBoundary({ ...config, staticPayTo: 'ecash:q...' }),
      error =>
        error instanceof Xr1fBoundaryError &&
        error.code === 'XR1F_STATIC_PAYTO_FORBIDDEN',
    );

    assert.throws(
      () => assertRealFundsBoundary({ ...config, addressToScript() {} }),
      error =>
        error instanceof Xr1fBoundaryError &&
        error.code === 'XR1F_CUSTOM_SCRIPT_CONVERTER_FORBIDDEN',
    );
  });
});

canonicalTest('11. canonical origin and frozen resource are mandatory', () => {
  withCanonicalConfig(config => {
    assert.throws(
      () => assertRealFundsBoundary({ ...config, publicOrigin: 'https://example.com' }),
      error =>
        error instanceof Xr1fBoundaryError &&
        error.code === 'XR1F_CANONICAL_ORIGIN_REQUIRED',
    );

    assert.throws(
      () => assertRealFundsBoundary({
        ...config,
        resource: { ...RESOURCE, resourceHash: 'c'.repeat(64) },
      }),
      error =>
        error instanceof Xr1fBoundaryError &&
        error.code === 'XR1F_CANONICAL_RESOURCE_REQUIRED',
    );
  });
});

canonicalTest('12. fully explicit production configuration verifies L1 provenance and binding but authorizes no funds', () => {
  withCanonicalConfig(config => {
    const result = assertRealFundsBoundary(config);
    assert.equal(result.ok, true);
    assert.equal(result.mode, XR1F_MODE.REAL_FUNDS);
    assert.equal(result.production, true);
    assert.equal(result.approvalId, 'xr1f-review-001');
    assert.equal(result.allocatorAuthenticated, true);
    assert.equal(result.allocatorBindingVerified, true);
    assert.equal(result.realFundsAuthorized, false);
    assert.equal(result.invoiceIssuanceAuthorized, false);
    assert.equal(result.signingAuthorized, false);
    assert.equal(result.broadcastAuthorized, false);
  });
});

test('13. boundary module contains no signing, key or broadcast authority', async () => {
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
