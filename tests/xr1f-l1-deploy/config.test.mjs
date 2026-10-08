import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  loadXr1fL1Config,
  XR1F_L1_X402_XEC_COMMIT,
} from '../../services/xr1f-l1/config.mjs';

const XPUB =
  'xpub661MyMwAqRbcEtUEgdXRTY6dJQG9fRgs7C5QomqETKMYBJVtSGpRqyHSmhWy8snovPd5oWZgQ14zUquxbxu7Z1umuXbN5VDpUL1QobD5xUY';

const XPUB_SHA = createHash('sha256').update(XPUB).digest('hex');

function env(overrides = {}) {
  return {
    NODE_ENV: 'production',
    XR1F_L1_BIND_ENABLED: 'false',
    XR1F_L1_BUILD_SHA: 'a'.repeat(40),
    XR1F_L1_C3B_DB_PATH: '/srv/xolosramirez/xr1f/c3b.sqlite',
    XR1F_L1_MERCHANT_XPUB: XPUB,
    XR1F_L1_MERCHANT_XPUB_SHA256: XPUB_SHA,
    XR1F_L1_X402_XEC_COMMIT: XR1F_L1_X402_XEC_COMMIT,
    XR1F_L1_X402_MODULE_PATH:
      '/opt/x402-xec/packages/x402-xec-core/dist/index.js',
    ...overrides,
  };
}

test('1. binding ceremony defaults fail-closed and never authorizes real funds', () => {
  const config = loadXr1fL1Config(env());

  assert.equal(config.enabled, false);
  assert.equal(config.gate, 'XR1F-L1');
  assert.equal(config.mode, 'WATCH_ONLY_ALLOCATOR_READY');
  assert.equal(config.realFundsAuthorized, false);
});

test('2. binding enable flag must be exactly true or false', () => {
  assert.throws(
    () => loadXr1fL1Config(env({ XR1F_L1_BIND_ENABLED: 'yes' })),
    /must be exactly true or false/,
  );
});

test('3. merchant xpub fingerprint mismatch fails closed', () => {
  assert.throws(
    () =>
      loadXr1fL1Config(
        env({ XR1F_L1_MERCHANT_XPUB_SHA256: '0'.repeat(64) }),
      ),
    /fingerprint mismatch/,
  );
});

test('4. x402-XEC commit pin is immutable', () => {
  assert.throws(
    () =>
      loadXr1fL1Config(
        env({ XR1F_L1_X402_XEC_COMMIT: 'b'.repeat(40) }),
      ),
    /commit pin mismatch/,
  );
});

test('5. build SHA and production paths are strictly validated', () => {
  assert.throws(
    () => loadXr1fL1Config(env({ XR1F_L1_BUILD_SHA: 'main' })),
    /40-char git SHA/,
  );

  assert.throws(
    () =>
      loadXr1fL1Config(
        env({ XR1F_L1_C3B_DB_PATH: 'relative/c3b.sqlite' }),
      ),
    /paths must be absolute/,
  );
});
