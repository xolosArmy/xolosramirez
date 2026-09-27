import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';

function die(message) {
  throw new Error(message);
}

function computeDistTreeDigest(distDir) {
  const entries = readdirSync(distDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => entry.name)
    .sort();

  if (entries.length === 0) {
    die('XR1F-L1 worker found no JavaScript artifacts');
  }

  const lines = [];
  for (const name of entries) {
    const path = resolve(distDir, name);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path) {
      die('XR1F-L1 worker requires regular canonical dist artifacts');
    }

    const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
    lines.push(`${digest}  ./${name}\n`);
  }

  const manifest = lines.join('');
  return {
    digest: createHash('sha256').update(manifest, 'utf8').digest('hex'),
    manifest,
  };
}

const modulePath = resolve(workerData.modulePath);
if (basename(modulePath) !== 'index.js') {
  die('XR1F-L1 worker requires canonical dist/index.js');
}

const stat = lstatSync(modulePath);
if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(modulePath) !== modulePath) {
  die('XR1F-L1 worker requires a regular canonical index artifact');
}

const distDir = dirname(modulePath);
const before = computeDistTreeDigest(distDir);
if (before.digest !== workerData.expectedDistSha256) {
  die('XR1F-L1 worker dist tree failed canonical digest verification');
}

const indexHash = createHash('sha256').update(readFileSync(modulePath)).digest('hex');
if (indexHash !== workerData.expectedIndexSha256) {
  die('XR1F-L1 worker index artifact failed canonical digest verification');
}

// Worker threads have an independent ESM module cache. Importing the verified
// graph here prevents a poisoned cache entry in the parent isolate from being
// reused for relative x402-XEC dependencies.
const canonicalModule = await import(
  `${pathToFileURL(modulePath).href}?xr1fWorkerTree=${before.digest}`
);

const after = computeDistTreeDigest(distDir);
if (after.digest !== before.digest) {
  die('XR1F-L1 worker dist tree changed during module loading');
}

if (
  typeof canonicalModule.createXpubPayToAllocator !== 'function' ||
  typeof canonicalModule.decodeCashAddress !== 'function'
) {
  die('XR1F-L1 worker canonical exports are unavailable');
}

const allocators = new Map();
let nextHandle = 1;
const rpcPort = workerData.rpcPort;

function serializeError(error) {
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
  };
}

rpcPort.on('message', request => {
  const signal = new Int32Array(request.signal);

  try {
    let result;

    switch (request.op) {
      case 'createAllocator': {
        const allocator = canonicalModule.createXpubPayToAllocator(request.args[0]);
        const handle = nextHandle++;
        allocators.set(handle, allocator);
        result = handle;
        break;
      }

      case 'deriveAddress': {
        const allocator = allocators.get(request.args[0]);
        if (!allocator) die('Unknown XR1F-L1 worker allocator handle');
        result = allocator.deriveAddress(request.args[1]);
        break;
      }

      case 'decodeCashAddress': {
        result = canonicalModule.decodeCashAddress(request.args[0]);
        break;
      }

      default:
        die('Unsupported XR1F-L1 worker RPC operation');
    }

    rpcPort.postMessage({
      id: request.id,
      ok: true,
      result,
    });
  } catch (error) {
    rpcPort.postMessage({
      id: request.id,
      ok: false,
      error: serializeError(error),
    });
  } finally {
    Atomics.store(signal, 0, 1);
    Atomics.notify(signal, 0, 1);
  }
});

parentPort.postMessage({
  ok: true,
  status: 'XR1F_L1_WORKER_READY',
  distSha256: before.digest,
  indexSha256: indexHash,
});
