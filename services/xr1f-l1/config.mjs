import { createHash } from 'node:crypto';

export const XR1F_L1_GATE = 'XR1F-L1';
export const XR1F_L1_MODE = 'WATCH_ONLY_ALLOCATOR_READY';
export const XR1F_L1_X402_XEC_COMMIT =
  '0f409dea2959b397ecc4bb84d71519ec6e3aec04';

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) {
    throw new TypeError(`${name} is required`);
  }
  return value;
}

function parseEnabled(value) {
  if (value === 'true') return true;
  if (value === 'false' || value === undefined) return false;
  throw new TypeError('XR1F_L1_BIND_ENABLED must be exactly true or false');
}

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function loadXr1fL1Config(env = process.env) {
  if (env.NODE_ENV !== 'production') {
    throw new TypeError('XR1F-L1 binding ceremony requires NODE_ENV=production');
  }

  const enabled = parseEnabled(env.XR1F_L1_BIND_ENABLED);
  const merchantXpub = required(env, 'XR1F_L1_MERCHANT_XPUB');
  const merchantXpubSha256 = required(env, 'XR1F_L1_MERCHANT_XPUB_SHA256');

  if (!/^[0-9a-f]{64}$/.test(merchantXpubSha256)) {
    throw new TypeError('XR1F_L1_MERCHANT_XPUB_SHA256 must be lowercase 64-char hex');
  }

  const normalizedXpub = merchantXpub.trim();
  if (sha256Hex(normalizedXpub) !== merchantXpubSha256) {
    throw new TypeError('XR1F-L1 merchant xpub fingerprint mismatch');
  }

  const x402Commit = required(env, 'XR1F_L1_X402_XEC_COMMIT');
  if (x402Commit !== XR1F_L1_X402_XEC_COMMIT) {
    throw new TypeError('XR1F-L1 x402-XEC commit pin mismatch');
  }

  return Object.freeze({
    gate: XR1F_L1_GATE,
    mode: XR1F_L1_MODE,
    enabled,
    buildSha: required(env, 'XR1F_L1_BUILD_SHA'),
    c3bDbPath: required(env, 'XR1F_L1_C3B_DB_PATH'),
    x402ModulePath: required(env, 'XR1F_L1_X402_MODULE_PATH'),
    x402Commit,
    merchantXpub: normalizedXpub,
    merchantXpubSha256,
    realFundsAuthorized: false,
  });
}
