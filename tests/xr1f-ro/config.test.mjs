import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_X402_XEC_COMMIT,
  loadXr1fRoConfig,
} from '../../services/xr1f-ro/config.mjs';

function env(overrides = {}) {
  return {
    NODE_ENV: 'production',
    XR1F_RO_MODE: 'READ_ONLY',
    XR1F_RO_ENABLED: 'true',
    XR1F_RO_C3B_DB_PATH: '/srv/xr1f/c3b.sqlite',
    XR1F_RO_XR1D_DB_PATH: '/srv/xr1f/xr1d.sqlite',
    XR1F_RO_CHRONIK_ENDPOINT: 'https://chronik.example.com',
    XR1F_RO_CHRONIK_PROBE_TXID: 'a'.repeat(64),
    XR1F_RO_PROVIDER_MODULE: '/opt/x402-xec/real-chronik-tx-provider.js',
    XR1F_RO_PROVIDER_SHA256: 'b'.repeat(64),
    XR1F_RO_X402_XEC_COMMIT: CANONICAL_X402_XEC_COMMIT,
    ...overrides,
  };
}

test('1. production read-only config loads with canonical pin', () => {
  const result = loadXr1fRoConfig(env());
  assert.equal(result.mode, 'READ_ONLY');
  assert.equal(result.enabled, true);
  assert.equal(result.x402Commit, CANONICAL_X402_XEC_COMMIT);
});

test('2. non-production environment is rejected', () => {
  assert.throws(
    () => loadXr1fRoConfig(env({ NODE_ENV: 'development' })),
    /NODE_ENV=production/,
  );
});

test('3. REAL_FUNDS mode is impossible in XR1F-RO config', () => {
  assert.throws(
    () => loadXr1fRoConfig(env({ XR1F_RO_MODE: 'REAL_FUNDS' })),
    /READ_ONLY/,
  );
});

test('4. canonical x402-XEC commit pin is mandatory', () => {
  assert.throws(
    () => loadXr1fRoConfig(env({ XR1F_RO_X402_XEC_COMMIT: 'c'.repeat(40) })),
    /canonical/,
  );
});

test('5. provider sha256 and probe txid must be exact lowercase hex', () => {
  assert.throws(
    () => loadXr1fRoConfig(env({ XR1F_RO_PROVIDER_SHA256: 'bad' })),
    /PROVIDER_SHA256/,
  );
  assert.throws(
    () => loadXr1fRoConfig(env({ XR1F_RO_CHRONIK_PROBE_TXID: 'bad' })),
    /PROBE_TXID/,
  );
});

test('6. kill-switch must be explicit boolean text', () => {
  assert.throws(
    () => loadXr1fRoConfig(env({ XR1F_RO_ENABLED: '1' })),
    /exactly "true" or "false"/,
  );
});
