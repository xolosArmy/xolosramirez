import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  CANONICAL_X402_XEC_COMMIT,
  CANONICAL_X402_XEC_CORE_DIST_SHA256,
  CANONICAL_X402_XEC_CORE_INDEX_SHA256,
  XR1F_L1_ALLOCATOR_KIND,
  XR1F_L1_NETWORK,
  Xr1fL1AllocatorError,
  assertWatchOnlyAllocator,
  computeAllocatorId,
  createWatchOnlyAllocator,
  loadPinnedX402AllocatorImplementation,
} from '../../src/x402-xr1f-l1/allocator.mjs';

const XPUB =
  'xpub661MyMwAqRbcEtUEgdXRTY6dJQG9fRgs7C5QomqETKMYBJVtSGpRqyHSmhWy8snovPd5oWZgQ14zUquxbxu7Z1umuXbN5VDpUL1QobD5xUY';

const CANONICAL_MODULE =
  process.env.XR1F_L1_CANONICAL_MODULE_PATH?.trim() || null;

const canonicalTest = CANONICAL_MODULE ? test : test.skip;

function expectAllocatorError(fn, code) {
  assert.throws(
    fn,
    error =>
      error instanceof Xr1fL1AllocatorError &&
      error.code === code,
  );
}

async function expectAllocatorReject(promise, code) {
  await assert.rejects(
    promise,
    error =>
      error instanceof Xr1fL1AllocatorError &&
      error.code === code,
  );
}

test('1. allocatorId is deterministic and whitespace-normalized for a fully valid xpub', () => {
  const a = computeAllocatorId(XPUB);
  const b = computeAllocatorId(`  ${XPUB}  `);

  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, b);
});

test('2. malformed, testnet and private extended keys fail before identity creation', () => {
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

  expectAllocatorError(
    () => computeAllocatorId('xpub-not-a-key'),
    'XR1F_L1_XPUB_INVALID',
  );

  const checksumCorrupt =
    XPUB.slice(0, -1) + (XPUB.endsWith('1') ? '2' : '1');
  expectAllocatorError(
    () => computeAllocatorId(checksumCorrupt),
    'XR1F_L1_XPUB_INVALID',
  );
});

canonicalTest('3. canonical loader authenticates the reviewed core dist tree without caller-supplied hash', async () => {
  const implementation = await loadPinnedX402AllocatorImplementation({
    modulePath: CANONICAL_MODULE,
  });

  assert.equal(implementation.x402Commit, CANONICAL_X402_XEC_COMMIT);
  assert.equal(
    implementation.moduleSha256,
    CANONICAL_X402_XEC_CORE_DIST_SHA256,
  );
  assert.equal(
    implementation.indexSha256,
    CANONICAL_X402_XEC_CORE_INDEX_SHA256,
  );
  assert.equal(typeof implementation.createXpubPayToAllocator, 'function');
  assert.equal(typeof implementation.decodeCashAddress, 'function');
  assert.equal(Object.isFrozen(implementation), true);
});

canonicalTest('4. caller cannot bless a modified implementation by choosing a matching hash', async () => {
  const sourceDist = dirname(CANONICAL_MODULE);
  const dir = mkdtempSync(join(tmpdir(), 'xr1f-l1-tampered-dist-'));
  const copiedDist = join(dir, 'dist');
  cpSync(sourceDist, copiedDist, { recursive: true });

  const copiedIndex = join(copiedDist, 'index.js');
  writeFileSync(
    copiedIndex,
    readFileSync(copiedIndex, 'utf8') + '\n// caller-controlled tamper\n',
  );

  try {
    await expectAllocatorReject(
      loadPinnedX402AllocatorImplementation({
        modulePath: copiedIndex,
        // Deliberately supplied legacy/hostile fields are ignored; there is
        // no API for the caller to choose the trusted digest.
        expectedSha256: '0'.repeat(64),
        x402Commit: '1'.repeat(40),
      }),
      'XR1F_L1_IMPLEMENTATION_INTEGRITY_MISMATCH',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

canonicalTest('5. tampering a transitive core module such as cashaddr.js invalidates the whole dist tree', async () => {
  const sourceDist = dirname(CANONICAL_MODULE);
  const dir = mkdtempSync(join(tmpdir(), 'xr1f-l1-tampered-cashaddr-'));
  const copiedDist = join(dir, 'dist');
  cpSync(sourceDist, copiedDist, { recursive: true });

  const cashaddr = join(copiedDist, 'cashaddr.js');
  writeFileSync(
    cashaddr,
    readFileSync(cashaddr, 'utf8') + '\n// forged decoder\n',
  );

  try {
    await expectAllocatorReject(
      loadPinnedX402AllocatorImplementation({
        modulePath: join(copiedDist, 'index.js'),
      }),
      'XR1F_L1_IMPLEMENTATION_INTEGRITY_MISMATCH',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

canonicalTest('6. module path must be canonical dist/index.js', async () => {
  await expectAllocatorReject(
    loadPinnedX402AllocatorImplementation({
      modulePath: join(dirname(CANONICAL_MODULE), 'cashaddr.js'),
    }),
    'XR1F_L1_IMPLEMENTATION_PATH_INVALID',
  );
});

canonicalTest('7. canonical facade exposes stable watch-only identity and no merchant xpub', async () => {
  const implementation = await loadPinnedX402AllocatorImplementation({
    modulePath: CANONICAL_MODULE,
  });
  const allocator = createWatchOnlyAllocator({
    merchantXpub: XPUB,
    pinnedImplementation: implementation,
  });

  assert.equal(allocator.kind, XR1F_L1_ALLOCATOR_KIND);
  assert.equal(allocator.isWatchOnly, true);
  assert.equal(allocator.network, XR1F_L1_NETWORK);
  assert.equal(allocator.x402Commit, CANONICAL_X402_XEC_COMMIT);
  assert.equal(
    allocator.implementationSha256,
    CANONICAL_X402_XEC_CORE_DIST_SHA256,
  );
  assert.equal(allocator.allocatorId, computeAllocatorId(XPUB));
  assert.equal(Object.isFrozen(allocator), true);

  for (const secretField of [
    'merchantXpub',
    'xpub',
    'privateKey',
    'seed',
    'mnemonic',
  ]) {
    assert.equal(secretField in allocator, false);
  }

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
    assert.equal(typeof allocator[capability], 'undefined');
  }
});

canonicalTest('8. canonical deriveAddress is deterministic and produces strict eCash P2PKH output', async () => {
  const implementation = await loadPinnedX402AllocatorImplementation({
    modulePath: CANONICAL_MODULE,
  });
  const allocator = createWatchOnlyAllocator({
    merchantXpub: XPUB,
    pinnedImplementation: implementation,
  });

  const a = allocator.deriveAddress(0);
  const b = allocator.deriveAddress(0);
  const c = allocator.deriveAddress(1);

  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^ecash:[a-z0-9]+$/);

  const decoded = implementation.decodeCashAddress(a);
  assert.equal(decoded.prefix, 'ecash');
  assert.equal(decoded.type, 0);
  assert.match(decoded.hash, /^[0-9a-f]{40}$/);
});

canonicalTest('9. hardened, fractional, negative and unsafe derivation indices fail closed', async () => {
  const allocator = createWatchOnlyAllocator({
    merchantXpub: XPUB,
    pinnedImplementation: await loadPinnedX402AllocatorImplementation({
      modulePath: CANONICAL_MODULE,
    }),
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

canonicalTest('10. forged facade objects cannot acquire trusted allocator provenance', async () => {
  const valid = createWatchOnlyAllocator({
    merchantXpub: XPUB,
    pinnedImplementation: await loadPinnedX402AllocatorImplementation({
      modulePath: CANONICAL_MODULE,
    }),
  });

  assert.equal(assertWatchOnlyAllocator(valid), valid);

  const forged = { ...valid };
  expectAllocatorError(
    () => assertWatchOnlyAllocator(forged),
    'XR1F_L1_ALLOCATOR_REQUIRED',
  );
});

canonicalTest('11. same xpub and canonical dist tree produce stable identity across restarts', async () => {
  const implementation = await loadPinnedX402AllocatorImplementation({
    modulePath: CANONICAL_MODULE,
  });
  const a = createWatchOnlyAllocator({
    merchantXpub: XPUB,
    pinnedImplementation: implementation,
  });
  const b = createWatchOnlyAllocator({
    merchantXpub: XPUB,
    pinnedImplementation: implementation,
  });

  assert.equal(a.allocatorId, b.allocatorId);
  assert.equal(a.implementationSha256, b.implementationSha256);
  assert.equal(a.deriveAddress(123), b.deriveAddress(123));
});
