import {
  ECDH,
  createHash,
} from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const XR1F_L1_ALLOCATOR_KIND = 'X402_XEC_XPUB_V1';
export const XR1F_L1_NETWORK = 'xec:mainnet';
export const CANONICAL_X402_XEC_COMMIT =
  '0f409dea2959b397ecc4bb84d71519ec6e3aec04';

const ALLOCATOR_ID_DOMAIN = 'xr1f-l1/xpub/v1\0';
const MAX_NON_HARDENED_INDEX = 0x80000000;
const XPUB_MAINNET_VERSION = 0x0488b21e;
const PINNED_IMPLEMENTATION = Symbol('xr1f-l1-pinned-implementation');
const TRUSTED_ALLOCATOR = Symbol('xr1f-l1-trusted-allocator');

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

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest();
}

function decodeBase58(value) {
  const alphabet =
    '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const map = new Map([...alphabet].map((char, index) => [char, index]));

  if (typeof value !== 'string' || value.length === 0) {
    fail('XR1F_L1_XPUB_INVALID', 'Extended public key is invalid');
  }

  let n = 0n;
  for (const char of value) {
    const digit = map.get(char);
    if (digit === undefined) {
      fail('XR1F_L1_XPUB_INVALID', 'Extended public key is not valid Base58');
    }
    n = n * 58n + BigInt(digit);
  }

  let hex = n.toString(16);
  if (hex.length % 2 !== 0) hex = `0${hex}`;
  let body = hex === '00' && n === 0n ? Buffer.alloc(0) : Buffer.from(hex, 'hex');

  let leadingZeros = 0;
  while (leadingZeros < value.length && value[leadingZeros] === '1') {
    leadingZeros += 1;
  }
  if (leadingZeros > 0) {
    body = Buffer.concat([Buffer.alloc(leadingZeros), body]);
  }

  return body;
}

function parseMainnetXpub(value) {
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

  const decoded = decodeBase58(xpub);
  if (decoded.length !== 82) {
    fail(
      'XR1F_L1_XPUB_INVALID',
      'Extended public key must decode to 78-byte payload plus checksum',
    );
  }

  const payload = decoded.subarray(0, 78);
  const checksum = decoded.subarray(78);
  const expectedChecksum = sha256(sha256(payload)).subarray(0, 4);

  if (!checksum.equals(expectedChecksum)) {
    fail('XR1F_L1_XPUB_INVALID', 'Extended public key checksum is invalid');
  }

  if (payload.readUInt32BE(0) !== XPUB_MAINNET_VERSION) {
    fail(
      'XR1F_L1_MAINNET_XPUB_REQUIRED',
      'Extended public key version is not canonical mainnet xpub',
    );
  }

  const keyData = payload.subarray(45, 78);
  if (keyData.length !== 33 || (keyData[0] !== 0x02 && keyData[0] !== 0x03)) {
    fail(
      'XR1F_L1_XPUB_INVALID',
      'Extended public key payload must contain a compressed public key',
    );
  }

  try {
    ECDH.convertKey(keyData, 'secp256k1', undefined, undefined, 'compressed');
  } catch {
    fail(
      'XR1F_L1_XPUB_INVALID',
      'Extended public key contains an invalid secp256k1 public key',
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

function assertSha256Hex(value, code, message) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    fail(code, message);
  }
  return value;
}

function resolveRegularFile(path, code) {
  if (typeof path !== 'string' || path.trim() === '') {
    fail(code, 'Pinned implementation path is required');
  }

  const expected = resolve(path.trim());
  let stat;
  try {
    stat = lstatSync(expected);
  } catch {
    fail(code, 'Pinned implementation file does not exist');
  }

  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail(code, 'Pinned implementation must be a regular non-symlink file');
  }

  if (realpathSync(expected) !== expected) {
    fail(code, 'Pinned implementation path must resolve canonically');
  }

  return expected;
}

export async function loadPinnedX402AllocatorImplementation({
  modulePath,
  expectedSha256,
  x402Commit = CANONICAL_X402_XEC_COMMIT,
}) {
  if (x402Commit !== CANONICAL_X402_XEC_COMMIT) {
    fail('XR1F_L1_X402_PIN_MISMATCH', 'x402-XEC commit is not canonical');
  }

  const expectedHash = assertSha256Hex(
    expectedSha256,
    'XR1F_L1_IMPLEMENTATION_SHA256_INVALID',
    'Pinned implementation SHA-256 is invalid',
  );

  const resolvedPath = resolveRegularFile(
    modulePath,
    'XR1F_L1_IMPLEMENTATION_PATH_INVALID',
  );
  const bytes = readFileSync(resolvedPath);
  const actualHash = createHash('sha256').update(bytes).digest('hex');

  if (actualHash !== expectedHash) {
    fail(
      'XR1F_L1_IMPLEMENTATION_INTEGRITY_MISMATCH',
      'Pinned x402-XEC allocator implementation failed SHA-256 verification',
    );
  }

  let module;
  try {
    module = await import(
      `${pathToFileURL(resolvedPath).href}?sha256=${actualHash}`
    );
  } catch {
    fail(
      'XR1F_L1_IMPLEMENTATION_IMPORT_FAILED',
      'Pinned x402-XEC allocator implementation could not be imported',
    );
  }

  if (
    typeof module.createXpubPayToAllocator !== 'function' ||
    typeof module.decodeCashAddress !== 'function'
  ) {
    fail(
      'XR1F_L1_IMPLEMENTATION_EXPORTS_INVALID',
      'Pinned implementation is missing canonical allocator/CashAddr exports',
    );
  }

  const implementation = {
    x402Commit: CANONICAL_X402_XEC_COMMIT,
    moduleSha256: actualHash,
    createXpubPayToAllocator: module.createXpubPayToAllocator,
    decodeCashAddress: module.decodeCashAddress,
  };

  Object.defineProperty(implementation, PINNED_IMPLEMENTATION, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  return Object.freeze(implementation);
}

function assertPinnedImplementation(implementation) {
  if (
    !implementation ||
    typeof implementation !== 'object' ||
    implementation[PINNED_IMPLEMENTATION] !== true ||
    implementation.x402Commit !== CANONICAL_X402_XEC_COMMIT ||
    typeof implementation.createXpubPayToAllocator !== 'function' ||
    typeof implementation.decodeCashAddress !== 'function' ||
    typeof implementation.moduleSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(implementation.moduleSha256)
  ) {
    fail(
      'XR1F_L1_PINNED_IMPLEMENTATION_REQUIRED',
      'Allocator creation requires a verified pinned x402-XEC implementation',
    );
  }

  return implementation;
}

function validateDerivedAddress(address, implementation) {
  let decoded;
  try {
    decoded = implementation.decodeCashAddress(address);
  } catch {
    fail(
      'XR1F_L1_DERIVED_ADDRESS_INVALID',
      'Upstream allocator returned a non-canonical eCash mainnet address',
    );
  }

  if (
    typeof address !== 'string' ||
    address !== address.toLowerCase() ||
    !address.startsWith('ecash:') ||
    decoded?.prefix !== 'ecash' ||
    decoded?.type !== 0 ||
    typeof decoded?.hash !== 'string' ||
    !/^[0-9a-f]{40}$/.test(decoded.hash)
  ) {
    fail(
      'XR1F_L1_DERIVED_ADDRESS_INVALID',
      'Upstream allocator returned a non-canonical P2PKH eCash mainnet address',
    );
  }

  return address;
}

export function computeAllocatorId(merchantXpub) {
  const xpub = parseMainnetXpub(merchantXpub);
  return createHash('sha256')
    .update(ALLOCATOR_ID_DOMAIN, 'utf8')
    .update(xpub, 'utf8')
    .digest('hex');
}

export function assertWatchOnlyAllocator(allocator) {
  if (
    !allocator ||
    typeof allocator !== 'object' ||
    allocator[TRUSTED_ALLOCATOR] !== true
  ) {
    fail(
      'XR1F_L1_ALLOCATOR_REQUIRED',
      'Trusted watch-only allocator is required',
    );
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
  if (
    typeof allocator.implementationSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(allocator.implementationSha256)
  ) {
    fail(
      'XR1F_L1_IMPLEMENTATION_SHA256_INVALID',
      'Allocator implementation identity is invalid',
    );
  }
  if (typeof allocator.deriveAddress !== 'function') {
    fail('XR1F_L1_DERIVER_REQUIRED', 'Allocator must expose deriveAddress(index)');
  }

  assertNoSpendCapability(allocator);
  return allocator;
}

export function createWatchOnlyAllocator({
  merchantXpub,
  pinnedImplementation,
}) {
  const implementation = assertPinnedImplementation(pinnedImplementation);
  const xpub = parseMainnetXpub(merchantXpub);
  const allocatorId = computeAllocatorId(xpub);

  let upstream;
  try {
    upstream = implementation.createXpubPayToAllocator(xpub);
  } catch {
    fail(
      'XR1F_L1_UPSTREAM_ALLOCATOR_REJECTED',
      'Pinned canonical allocator rejected the watch-only key',
    );
  }

  if (!upstream || typeof upstream.deriveAddress !== 'function') {
    fail(
      'XR1F_L1_UPSTREAM_DERIVER_INVALID',
      'Pinned canonical allocator does not expose deriveAddress(index)',
    );
  }

  assertNoSpendCapability(upstream);

  const facade = {
    kind: XR1F_L1_ALLOCATOR_KIND,
    isWatchOnly: true,
    network: XR1F_L1_NETWORK,
    x402Commit: CANONICAL_X402_XEC_COMMIT,
    implementationSha256: implementation.moduleSha256,
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

      return validateDerivedAddress(address, implementation);
    },
  };

  Object.defineProperty(facade, TRUSTED_ALLOCATOR, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  return Object.freeze(facade);
}
