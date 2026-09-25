import { createHash } from 'node:crypto';

export const XR1F_L1_ALLOCATOR_KIND = 'X402_XEC_XPUB_V1';
export const XR1F_L1_NETWORK = 'xec:mainnet';
export const CANONICAL_X402_XEC_COMMIT =
  '0f409dea2959b397ecc4bb84d71519ec6e3aec04';

const ALLOCATOR_ID_DOMAIN = 'xr1f-l1/xpub/v1\0';
const MAX_NON_HARDENED_INDEX = 0x80000000;

const FORBIDDEN_CAPABILITIES = Object.freeze([
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
]);

export class Xr1fL1AllocatorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'Xr1fL1AllocatorError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new Xr1fL1AllocatorError(code, message);
}

function normalizeMainnetXpub(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail('XR1F_L1_XPUB_REQUIRED', 'A non-empty merchant watch-only xpub is required');
  }

  const xpub = value.trim();

  if (xpub.startsWith('xprv') || xpub.startsWith('tprv')) {
    fail(
      'XR1F_L1_PRIVATE_KEY_MATERIAL_FORBIDDEN',
      'Private extended key material is forbidden',
    );
  }

  if (xpub.startsWith('tpub')) {
    fail(
      'XR1F_L1_MAINNET_XPUB_REQUIRED',
      'XR1F-L1 requires a mainnet xpub',
    );
  }

  if (!xpub.startsWith('xpub')) {
    fail(
      'XR1F_L1_MAINNET_XPUB_REQUIRED',
      'XR1F-L1 requires a standard mainnet xpub',
    );
  }

  return xpub;
}

function assertDerivationIndex(index) {
  if (
    typeof index !== 'number' ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index >= MAX_NON_HARDENED_INDEX
  ) {
    fail(
      'XR1F_L1_DERIVATION_INDEX_INVALID',
      'Derivation index must be a non-hardened safe integer',
    );
  }
}

function assertNoSpendCapability(value) {
  for (const capability of FORBIDDEN_CAPABILITIES) {
    if (typeof value?.[capability] === 'function') {
      fail(
        'XR1F_L1_SPEND_CAPABILITY_FORBIDDEN',
        'Watch-only allocator exposes a forbidden spend capability',
      );
    }
  }
}

function validateDerivedAddress(address) {
  if (
    typeof address !== 'string' ||
    address.length < 10 ||
    address !== address.toLowerCase() ||
    !address.startsWith('ecash:')
  ) {
    fail(
      'XR1F_L1_DERIVED_ADDRESS_INVALID',
      'Upstream allocator returned a non-canonical eCash mainnet address',
    );
  }
  return address;
}

export function computeAllocatorId(merchantXpub) {
  const xpub = normalizeMainnetXpub(merchantXpub);
  return createHash('sha256')
    .update(ALLOCATOR_ID_DOMAIN, 'utf8')
    .update(xpub, 'utf8')
    .digest('hex');
}

export function assertWatchOnlyAllocator(allocator) {
  if (!allocator || typeof allocator !== 'object') {
    fail('XR1F_L1_ALLOCATOR_REQUIRED', 'Watch-only allocator is required');
  }
  if (allocator.kind !== XR1F_L1_ALLOCATOR_KIND) {
    fail('XR1F_L1_ALLOCATOR_KIND_MISMATCH', 'Allocator kind is not canonical');
  }
  if (allocator.isWatchOnly !== true) {
    fail('XR1F_L1_WATCH_ONLY_REQUIRED', 'Allocator must be explicitly watch-only');
  }
  if (allocator.network !== XR1F_L1_NETWORK) {
    fail('XR1F_L1_NETWORK_MISMATCH', 'Allocator must target eCash mainnet');
  }
  if (allocator.x402Commit !== CANONICAL_X402_XEC_COMMIT) {
    fail('XR1F_L1_X402_PIN_MISMATCH', 'Allocator x402-XEC pin is not canonical');
  }
  if (
    typeof allocator.allocatorId !== 'string' ||
    !/^[0-9a-f]{64}$/.test(allocator.allocatorId)
  ) {
    fail('XR1F_L1_ALLOCATOR_ID_INVALID', 'Allocator identity is invalid');
  }
  if (typeof allocator.deriveAddress !== 'function') {
    fail('XR1F_L1_DERIVER_REQUIRED', 'Allocator must expose deriveAddress(index)');
  }

  assertNoSpendCapability(allocator);
  return allocator;
}

export function createWatchOnlyAllocator({
  merchantXpub,
  createUpstreamAllocator,
  x402Commit = CANONICAL_X402_XEC_COMMIT,
}) {
  if (x402Commit !== CANONICAL_X402_XEC_COMMIT) {
    fail('XR1F_L1_X402_PIN_MISMATCH', 'x402-XEC commit is not canonical');
  }
  if (typeof createUpstreamAllocator !== 'function') {
    fail(
      'XR1F_L1_UPSTREAM_FACTORY_REQUIRED',
      'Canonical upstream allocator factory is required',
    );
  }

  const xpub = normalizeMainnetXpub(merchantXpub);
  const allocatorId = computeAllocatorId(xpub);

  let upstream;
  try {
    upstream = createUpstreamAllocator(xpub);
  } catch {
    fail(
      'XR1F_L1_UPSTREAM_ALLOCATOR_REJECTED',
      'Canonical upstream allocator rejected the watch-only key',
    );
  }

  if (!upstream || typeof upstream.deriveAddress !== 'function') {
    fail(
      'XR1F_L1_UPSTREAM_DERIVER_INVALID',
      'Canonical upstream allocator does not expose deriveAddress(index)',
    );
  }

  assertNoSpendCapability(upstream);

  const facade = {
    kind: XR1F_L1_ALLOCATOR_KIND,
    isWatchOnly: true,
    network: XR1F_L1_NETWORK,
    x402Commit: CANONICAL_X402_XEC_COMMIT,
    allocatorId,

    deriveAddress(index) {
      assertDerivationIndex(index);

      let address;
      try {
        address = upstream.deriveAddress(index);
      } catch {
        fail(
          'XR1F_L1_DERIVATION_FAILED',
          'Watch-only address derivation failed',
        );
      }

      return validateDerivedAddress(address);
    },
  };

  return Object.freeze(facade);
}
