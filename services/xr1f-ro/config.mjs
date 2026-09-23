import { assertControlledBoundary } from '../../src/x402-xr1f/real-funds-boundary.mjs';

export const XR1F_RO_GATE = 'XR1F-RO';
export const XR1F_RO_MODE = 'READ_ONLY';
export const CANONICAL_X402_XEC_COMMIT =
  '0f409dea2959b397ecc4bb84d71519ec6e3aec04';

const HEX_64 = /^[0-9a-f]{64}$/;

function required(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} is required`);
  }
  return value.trim();
}

function parseBoolean(value, name) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new TypeError(`${name} must be exactly "true" or "false"`);
}

function parsePort(value) {
  const port = Number(value ?? 4021);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new TypeError('XR1F_RO_PORT must be an integer from 1 to 65535');
  }
  return port;
}

function parseTimeout(value) {
  const timeoutMs = Number(value ?? 4000);
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 30000
  ) {
    throw new TypeError(
      'XR1F_RO_CHRONIK_TIMEOUT_MS must be an integer from 100 to 30000',
    );
  }
  return timeoutMs;
}

function parseEndpoint(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new TypeError('XR1F_RO_CHRONIK_ENDPOINT must be an absolute HTTP(S) URL');
  }
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new TypeError('XR1F_RO_CHRONIK_ENDPOINT must use HTTP(S)');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TypeError(
      'XR1F_RO_CHRONIK_ENDPOINT must not contain credentials, query or fragment',
    );
  }
  if (url.href.endsWith('/')) {
    throw new TypeError('XR1F_RO_CHRONIK_ENDPOINT must not end with "/"');
  }
  return url.href;
}

export function loadXr1fRoConfig(env = process.env) {
  assertControlledBoundary({ mode: 'CONTROLLED' });

  if (env.NODE_ENV !== 'production') {
    throw new TypeError('XR1F-RO production service requires NODE_ENV=production');
  }

  if (required(env, 'XR1F_RO_MODE') !== XR1F_RO_MODE) {
    throw new TypeError('XR1F_RO_MODE must be exactly READ_ONLY');
  }

  const enabled = parseBoolean(
    required(env, 'XR1F_RO_ENABLED'),
    'XR1F_RO_ENABLED',
  );

  const x402Commit = required(env, 'XR1F_RO_X402_XEC_COMMIT');
  if (x402Commit !== CANONICAL_X402_XEC_COMMIT) {
    throw new TypeError(
      `XR1F_RO_X402_XEC_COMMIT must equal canonical ${CANONICAL_X402_XEC_COMMIT}`,
    );
  }

  const probeTxid = required(env, 'XR1F_RO_CHRONIK_PROBE_TXID').toLowerCase();
  if (!HEX_64.test(probeTxid)) {
    throw new TypeError(
      'XR1F_RO_CHRONIK_PROBE_TXID must be lowercase 64-character hex',
    );
  }

  const providerSha256 = required(
    env,
    'XR1F_RO_PROVIDER_SHA256',
  ).toLowerCase();
  if (!HEX_64.test(providerSha256)) {
    throw new TypeError(
      'XR1F_RO_PROVIDER_SHA256 must be lowercase 64-character hex',
    );
  }

  return Object.freeze({
    gate: XR1F_RO_GATE,
    mode: XR1F_RO_MODE,
    enabled,
    host: env.XR1F_RO_HOST?.trim() || '127.0.0.1',
    port: parsePort(env.XR1F_RO_PORT),
    c3bDbPath: required(env, 'XR1F_RO_C3B_DB_PATH'),
    xr1dDbPath: required(env, 'XR1F_RO_XR1D_DB_PATH'),
    chronikEndpoint: parseEndpoint(
      required(env, 'XR1F_RO_CHRONIK_ENDPOINT'),
    ),
    chronikProbeTxid: probeTxid,
    chronikTimeoutMs: parseTimeout(env.XR1F_RO_CHRONIK_TIMEOUT_MS),
    providerModulePath: required(env, 'XR1F_RO_PROVIDER_MODULE'),
    providerSha256,
    x402Commit,
    buildSha: env.XR1F_RO_BUILD_SHA?.trim() || 'unknown',
  });
}
