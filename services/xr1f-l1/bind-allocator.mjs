import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  createWatchOnlyAllocator,
  loadPinnedX402AllocatorImplementation,
} from '../../src/x402-xr1f-l1/allocator.mjs';
import {
  bindAllocator,
  readAllocatorBinding,
} from '../../src/x402-xr1f-l1/binding.mjs';
import { loadXr1fL1Config } from './config.mjs';
import { probeC3bStoreReadOnly } from '../xr1f-ro/probes.mjs';

const MIGRATION = new URL(
  '../../src/x402-xr1f-l1/migrations/001_allocator_binding.sql',
  import.meta.url,
);

function canonicalRegularFile(path, label) {
  const expected = resolve(path);
  const stat = lstatSync(expected);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new TypeError(`${label} must be a regular non-symlink file`);
  }
  if (realpathSync(expected) !== expected) {
    throw new TypeError(`${label} path must resolve canonically`);
  }
  return expected;
}

function hasBindingSchema(db) {
  return Boolean(
    db.prepare(
      "SELECT name FROM main.sqlite_master WHERE type='table' AND name='xr1f_l1_allocator_binding'",
    ).get(),
  );
}

function invoiceHistoryCount(db) {
  const row = db.prepare(
    'SELECT COUNT(*) AS n FROM main.invoices',
  ).get();
  const count = Number(row?.n ?? 0);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('XR1F_L1_C3B_HISTORY_INVALID');
  }
  return count;
}

function ensureBindingSchema(db) {
  if (hasBindingSchema(db)) return false;
  db.exec(readFileSync(MIGRATION, 'utf8'));
  return true;
}

export async function runBindingCeremony({
  env = process.env,
  now = () => Math.floor(Date.now() / 1000),
  logger = console,
  probeC3b = probeC3bStoreReadOnly,
} = {}) {
  const config = loadXr1fL1Config(env);

  if (config.enabled !== true) {
    const result = Object.freeze({
      ok: false,
      status: 'XR1F_L1_BIND_DISABLED',
      gate: config.gate,
      mode: config.mode,
      realFundsAuthorized: false,
    });
    logger.log(JSON.stringify(result));
    return result;
  }

  const c3bDbPath = canonicalRegularFile(
    config.c3bDbPath,
    'XR1F-L1 C3B database',
  );
  const x402ModulePath = canonicalRegularFile(
    config.x402ModulePath,
    'XR1F-L1 canonical x402-XEC module',
  );

  // Fail closed before any writable SQLite handle is opened. This proves the
  // target is the existing canonical C3B store, not a fresh or unrelated DB.
  probeC3b(c3bDbPath);

  const implementation =
    await loadPinnedX402AllocatorImplementation({
      modulePath: x402ModulePath,
    });

  const allocator = createWatchOnlyAllocator({
    merchantXpub: config.merchantXpub,
    pinnedImplementation: implementation,
  });

  const db = new DatabaseSync(c3bDbPath);
  try {
    if (!hasBindingSchema(db) && invoiceHistoryCount(db) !== 0) {
      throw new Error('XR1F_L1_UNBOUND_HISTORY');
    }

    const schemaCreated = ensureBindingSchema(db);
    const before = readAllocatorBinding(db);

    const bound = bindAllocator({
      db,
      allocator,
      boundAt: now(),
    });

    const after = readAllocatorBinding(db);

    const result = Object.freeze({
      ok: true,
      status: 'WATCH_ONLY_ALLOCATOR_BOUND',
      gate: config.gate,
      mode: config.mode,
      buildSha: config.buildSha,
      x402Commit: config.x402Commit,
      allocatorId: allocator.allocatorId,
      implementationSha256: allocator.implementationSha256,
      schemaCreated,
      previousStatus: before.status,
      binding: after.binding,
      idempotent: bound.idempotent,
      realFundsAuthorized: false,
      invoiceIssuanceAuthorized: false,
      signingAuthorized: false,
      broadcastAuthorized: false,
    });

    logger.log(JSON.stringify(result));
    return result;
  } finally {
    db.close();
  }
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  runBindingCeremony().catch(error => {
    console.error(JSON.stringify({
      ok: false,
      status: 'XR1F_L1_BIND_FAILED',
      code: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
      realFundsAuthorized: false,
    }));
    process.exitCode = 1;
  });
}
