import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHash,
} from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CANONICAL_X402_XEC_COMMIT,
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

const VALID_ADDRESS =
  'ecash:qqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyquz9y96w';

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

function makePinnedModule({
  deriveBody = `return '${VALID_ADDRESS}';`,
  decodeBody = `
    if (address !== '${VALID_ADDRESS}') throw new TypeError('invalid');
    return { prefix: 'ecash', type: 0, hash: '11'.repeat(20) };
  `,
  extras = '',
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'xr1f-l1-module-'));
  const path = join(dir, 'index.mjs');
  const source = `
    export function createXpubPayToAllocator(xpub) {
      if (typeof xpub !== 'string' || !xpub.startsWith('xpub')) {
        throw new TypeError('bad xpub');
      }
      return {
        deriveAddress(index) {
          ${deriveBody}
        },
        ${extras}
      };
    }

    export function decodeCashAddress(address) {
      ${decodeBody}
    }
  `;
  writeFileSync(path, source);
  const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex');

  return {
    dir,
    path,
    sha256,
    async load() {
      return loadPinnedX402AllocatorImplementation({
        modulePath: path,
        expectedSha256: sha256,
      });
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
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

test('3. loader pins a real regular module file by SHA-256', async () => {
  const fx = makePinnedModule();
  try {
    const implementation = await fx.load();

    assert.equal(implementation.x402Commit, CANONICAL_X402_XEC_COMMIT);
    assert.equal(implementation.moduleSha256, fx.sha256);
    assert.equal(typeof implementation.createXpubPayToAllocator, 'function');
    assert.equal(typeof implementation.decodeCashAddress, 'function');
    assert.equal(Object.isFrozen(implementation), true);
  } finally {
    fx.cleanup();
  }
});

test('4. stale or tampered implementation cannot be stamped canonical', async () => {
  const fx = makePinnedModule();
  try {
    await expectAllocatorReject(
      loadPinnedX402AllocatorImplementation({
        modulePath: fx.path,
        expectedSha256: '0'.repeat(64),
      }),
      'XR1F_L1_IMPLEMENTATION_INTEGRITY_MISMATCH',
    );

    const before = fx.sha256;
    writeFileSync(
      fx.path,
      readFileSync(fx.path, 'utf8') + '\n// tampered\n',
    );

    await expectAllocatorReject(
      loadPinnedX402AllocatorImplementation({
        modulePath: fx.path,
        expectedSha256: before,
      }),
      'XR1F_L1_IMPLEMENTATION_INTEGRITY_MISMATCH',
    );
  } finally {
    fx.cleanup();
  }
});

test('5. loader rejects wrong x402 pin and incomplete exports', async () => {
  const fx = makePinnedModule();
  try {
    await expectAllocatorReject(
      loadPinnedX402AllocatorImplementation({
        modulePath: fx.path,
        expectedSha256: fx.sha256,
        x402Commit: '1'.repeat(40),
      }),
      'XR1F_L1_X402_PIN_MISMATCH',
    );
  } finally {
    fx.cleanup();
  }

  const dir = mkdtempSync(join(tmpdir(), 'xr1f-l1-bad-module-'));
  const path = join(dir, 'index.mjs');
  writeFileSync(path, 'export const nope = true;\n');
  const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex');

  try {
    await expectAllocatorReject(
      loadPinnedX402AllocatorImplementation({
        modulePath: path,
        expectedSha256: sha256,
      }),
      'XR1F_L1_IMPLEMENTATION_EXPORTS_INVALID',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('6. allocator facade can only be created from a loader-authenticated implementation', async () => {
  expectAllocatorError(
    () =>
      createWatchOnlyAllocator({
        merchantXpub: XPUB,
        pinnedImplementation: {
          x402Commit: CANONICAL_X402_XEC_COMMIT,
          moduleSha256: 'a'.repeat(64),
          createXpubPayToAllocator() {},
          decodeCashAddress() {},
        },
      }),
    'XR1F_L1_PINNED_IMPLEMENTATION_REQUIRED',
  );

  const fx = makePinnedModule();
  try {
    const implementation = await fx.load();
    const allocator = createWatchOnlyAllocator({
      merchantXpub: XPUB,
      pinnedImplementation: implementation,
    });

    assert.equal(allocator.kind, XR1F_L1_ALLOCATOR_KIND);
    assert.equal(allocator.isWatchOnly, true);
    assert.equal(allocator.network, XR1F_L1_NETWORK);
    assert.equal(allocator.x402Commit, CANONICAL_X402_XEC_COMMIT);
    assert.equal(allocator.implementationSha256, fx.sha256);
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
  } finally {
    fx.cleanup();
  }
});

test('7. upstream spend authority is rejected even when module hash is pinned', async () => {
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
    const fx = makePinnedModule({
      extras: `${capability}() {},`,
    });

    try {
      const implementation = await fx.load();

      expectAllocatorError(
        () =>
          createWatchOnlyAllocator({
            merchantXpub: XPUB,
            pinnedImplementation: implementation,
          }),
        'XR1F_L1_SPEND_CAPABILITY_FORBIDDEN',
      );
    } finally {
      fx.cleanup();
    }
  }
});

test('8. deriveAddress accepts the full non-hardened range and rejects invalid indices', async () => {
  const fx = makePinnedModule();
  try {
    const allocator = createWatchOnlyAllocator({
      merchantXpub: XPUB,
      pinnedImplementation: await fx.load(),
    });

    for (const index of [0, 1, 42, 0x7fffffff]) {
      assert.equal(allocator.deriveAddress(index), VALID_ADDRESS);
    }

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
  } finally {
    fx.cleanup();
  }
});

test('9. corrupted CashAddr is rejected by the pinned canonical decoder', async () => {
  const fx = makePinnedModule({
    deriveBody: "return 'ecash:not-a-valid-address';",
  });
  try {
    const allocator = createWatchOnlyAllocator({
      merchantXpub: XPUB,
      pinnedImplementation: await fx.load(),
    });

    expectAllocatorError(
      () => allocator.deriveAddress(0),
      'XR1F_L1_DERIVED_ADDRESS_INVALID',
    );
  } finally {
    fx.cleanup();
  }
});

test('10. P2SH output is rejected even if the decoder considers it valid CashAddr', async () => {
  const fx = makePinnedModule({
    decodeBody: `
      if (address !== '${VALID_ADDRESS}') throw new TypeError('invalid');
      return { prefix: 'ecash', type: 1, hash: '11'.repeat(20) };
    `,
  });

  try {
    const allocator = createWatchOnlyAllocator({
      merchantXpub: XPUB,
      pinnedImplementation: await fx.load(),
    });

    expectAllocatorError(
      () => allocator.deriveAddress(0),
      'XR1F_L1_DERIVED_ADDRESS_INVALID',
    );
  } finally {
    fx.cleanup();
  }
});

test('11. assertWatchOnlyAllocator rejects forged objects without internal trust provenance', async () => {
  const fx = makePinnedModule();
  try {
    const valid = createWatchOnlyAllocator({
      merchantXpub: XPUB,
      pinnedImplementation: await fx.load(),
    });

    assert.equal(assertWatchOnlyAllocator(valid), valid);

    const forged = { ...valid };
    expectAllocatorError(
      () => assertWatchOnlyAllocator(forged),
      'XR1F_L1_ALLOCATOR_REQUIRED',
    );
  } finally {
    fx.cleanup();
  }
});

test('12. same xpub plus same pinned implementation gives stable public identity', async () => {
  const fx = makePinnedModule();
  try {
    const implementation = await fx.load();
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
  } finally {
    fx.cleanup();
  }
});
