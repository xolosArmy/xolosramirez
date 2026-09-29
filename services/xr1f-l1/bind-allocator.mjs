import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import {
  createWatchOnlyAllocator,
  loadPinnedX402AllocatorImplementation,
} from '../../src/x402-xr1f-l1/allocator.mjs';
import {
  bindAllocatorInTransaction,
  readAllocatorBinding,
} from '../../src/x402-xr1f-l1/binding.mjs';
import { loadXr1fL1Config } from './config.mjs';
import { probeC3bStoreReadOnly } from '../xr1f-ro/probes.mjs';

const MIGRATION = new URL(
  '../../src/x402-xr1f-l1/migrations/001_allocator_binding.sql',
  import.meta.url,
);
const REPO_ROOT = realpathSync(
  fileURLToPath(new URL('../../', import.meta.url)),
);
const GIT_BIN = '/usr/bin/git';

export function resolveDeployedBuildSha() {
  const result = spawnSync(
    GIT_BIN,
    [
      '-c',
      `safe.directory=${REPO_ROOT}`,
      '-C',
      REPO_ROOT,
      'rev-parse',
      '--verify',
      'HEAD^{commit}',
    ],
    {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  if (result.error || result.status !== 0) {
    throw new Error('XR1F_L1_DEPLOYED_BUILD_SHA_UNAVAILABLE');
  }

  const sha = String(result.stdout ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error('XR1F_L1_DEPLOYED_BUILD_SHA_INVALID');
  }

  return sha;
}

function assertDeployedBuildSha(expectedSha, getDeployedBuildSha) {
  const actualSha = getDeployedBuildSha();
  if (actualSha !== expectedSha) {
    throw new Error('XR1F_L1_BUILD_SHA_MISMATCH');
  }
  return actualSha;
}

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

const REQUIRED_C3B_COLUMNS = Object.freeze([
  'invoice_hash',
  'nonce',
  'resource_hash',
  'amount_sats',
  'pay_to',
  'network',
  'scheme',
  'issued_at',
  'expires_at',
  'state',
  'settled_txid',
  'settled_at',
  'derivation_index',
]);

const REQUIRED_C3B_UNIQUE_COLUMNS = Object.freeze([
  'invoice_hash',
  'nonce',
  'pay_to',
  'derivation_index',
  'settled_txid',
]);

function normalizeSql(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function hasBindingSchema(db) {
  return Boolean(
    db.prepare(
      "SELECT name FROM main.sqlite_master WHERE type='table' AND name='xr1f_l1_allocator_binding'",
    ).get(),
  );
}

function tableColumns(db, table) {
  return db.prepare(`PRAGMA main.table_info('${table}')`).all();
}

function uniqueIndexedColumns(db, table) {
  const result = new Set();

  for (const index of db.prepare(
    `PRAGMA main.index_list('${table}')`,
  ).all()) {
    if (Number(index.unique) !== 1) continue;

    const escaped = String(index.name).replaceAll("'", "''");
    const columns = db.prepare(
      `PRAGMA main.index_info('${escaped}')`,
    ).all()
      .map(row => row.name)
      .filter(Boolean);

    if (columns.length !== 1) continue;

    const column = columns[0];
    const partial = Number(index.partial) === 1;

    if (partial) {
      if (column !== 'settled_txid') continue;

      const row = db.prepare(
        "SELECT sql FROM main.sqlite_master WHERE type='index' AND name=?",
      ).get(index.name);
      const sql = normalizeSql(row?.sql);
      if (!/\bwhere settled_txid is not null\s*$/.test(sql)) {
        continue;
      }
    }

    result.add(column);
  }

  return result;
}

function assertLiveCanonicalC3b(db) {
  const quick = db.prepare('PRAGMA quick_check').get();
  if (quick?.quick_check !== 'ok') {
    throw new Error('XR1F_L1_C3B_LIVE_QUICK_CHECK_FAILED');
  }

  const journal = db.prepare('PRAGMA journal_mode').get();
  if (String(journal?.journal_mode ?? '').toLowerCase() !== 'wal') {
    throw new Error('XR1F_L1_C3B_LIVE_WAL_REQUIRED');
  }

  const table = db.prepare(
    "SELECT sql FROM main.sqlite_master WHERE type='table' AND name='invoices'",
  ).get();
  if (!table?.sql) {
    throw new Error('XR1F_L1_C3B_LIVE_INVOICES_TABLE_MISSING');
  }

  const columns = new Set(
    tableColumns(db, 'invoices').map(row => row.name),
  );
  for (const column of REQUIRED_C3B_COLUMNS) {
    if (!columns.has(column)) {
      throw new Error(
        `XR1F_L1_C3B_LIVE_COLUMN_MISSING_${column}`,
      );
    }
  }

  const unique = uniqueIndexedColumns(db, 'invoices');
  for (const column of REQUIRED_C3B_UNIQUE_COLUMNS) {
    if (!unique.has(column)) {
      throw new Error(
        `XR1F_L1_C3B_LIVE_UNIQUE_INDEX_MISSING_${column}`,
      );
    }
  }

  return Object.freeze({
    ok: true,
    component: 'c3bStoreLive',
  });
}

function assertCanonicalBindingSchema(db) {
  const table = db.prepare(
    "SELECT sql FROM main.sqlite_master WHERE type='table' AND name='xr1f_l1_allocator_binding'",
  ).get();

  if (!table?.sql) {
    throw new Error('XR1F_L1_BINDING_SCHEMA_MISSING');
  }

  const columns = tableColumns(db, 'xr1f_l1_allocator_binding');
  const expectedColumns = [
    ['binding_id', 'INTEGER', 0, 1],
    ['schema_version', 'INTEGER', 1, 0],
    ['allocator_kind', 'TEXT', 1, 0],
    ['allocator_id', 'TEXT', 1, 0],
    ['network', 'TEXT', 1, 0],
    ['x402_xec_commit', 'TEXT', 1, 0],
    ['bound_at', 'INTEGER', 1, 0],
  ];

  if (columns.length !== expectedColumns.length) {
    throw new Error('XR1F_L1_BINDING_SCHEMA_COLUMNS_MISMATCH');
  }

  for (let i = 0; i < expectedColumns.length; i += 1) {
    const [name, type, notnull, pk] = expectedColumns[i];
    const actual = columns[i];
    if (
      actual?.name !== name ||
      String(actual?.type ?? '').toUpperCase() !== type ||
      Number(actual?.notnull) !== notnull ||
      Number(actual?.pk) !== pk
    ) {
      throw new Error(
        `XR1F_L1_BINDING_SCHEMA_COLUMN_MISMATCH_${name}`,
      );
    }
  }

  const sql = normalizeSql(table.sql);
  const requiredSqlFragments = [
    ') strict',
    'check(binding_id = 1)',
    'check(schema_version = 1)',
    "check(allocator_kind = 'x402_xec_xpub_v1')",
    'length(allocator_id) = 64',
    'allocator_id = lower(allocator_id)',
    "allocator_id not glob '*[^0-9a-f]*'",
    "check(network = 'xec:mainnet')",
    "x402_xec_commit = '0f409dea2959b397ecc4bb84d71519ec6e3aec04'",
    'bound_at >= 0',
    'bound_at <= 9007199254740991',
  ];

  for (const fragment of requiredSqlFragments) {
    if (!sql.includes(fragment)) {
      throw new Error('XR1F_L1_BINDING_SCHEMA_CONSTRAINT_MISMATCH');
    }
  }

  const unique = uniqueIndexedColumns(
    db,
    'xr1f_l1_allocator_binding',
  );
  if (!unique.has('allocator_id')) {
    throw new Error(
      'XR1F_L1_BINDING_SCHEMA_ALLOCATOR_ID_UNIQUE_REQUIRED',
    );
  }

  const triggers = db.prepare(
    "SELECT name, sql FROM main.sqlite_master WHERE type='trigger' AND tbl_name='xr1f_l1_allocator_binding' ORDER BY name",
  ).all();

  if (
    triggers.length !== 2 ||
    triggers[0]?.name !==
      'xr1f_l1_allocator_binding_no_delete' ||
    triggers[1]?.name !==
      'xr1f_l1_allocator_binding_no_update'
  ) {
    throw new Error('XR1F_L1_BINDING_SCHEMA_TRIGGERS_MISMATCH');
  }

  const deleteSql = String(triggers[0].sql ?? '');
  const updateSql = String(triggers[1].sql ?? '');

  if (
    !/\bbefore\s+delete\s+on\s+(?:main\.)?xr1f_l1_allocator_binding\b/i.test(
      deleteSql,
    ) ||
    !/raise\s*\(\s*abort\s*,\s*['"]XR1F_L1_ALLOCATOR_BINDING_DELETE_FORBIDDEN['"]\s*\)/i.test(
      deleteSql,
    )
  ) {
    throw new Error(
      'XR1F_L1_BINDING_SCHEMA_DELETE_TRIGGER_MISMATCH',
    );
  }

  if (
    !/\bbefore\s+update\s+on\s+(?:main\.)?xr1f_l1_allocator_binding\b/i.test(
      updateSql,
    ) ||
    !/raise\s*\(\s*abort\s*,\s*['"]XR1F_L1_ALLOCATOR_BINDING_IMMUTABLE['"]\s*\)/i.test(
      updateSql,
    )
  ) {
    throw new Error(
      'XR1F_L1_BINDING_SCHEMA_UPDATE_TRIGGER_MISMATCH',
    );
  }

  return Object.freeze({
    ok: true,
    component: 'allocatorBindingSchema',
  });
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

function migrationBody() {
  return readFileSync(MIGRATION, 'utf8')
    .replace(/^\s*BEGIN IMMEDIATE;\s*/m, '')
    .replace(/\s*COMMIT;\s*$/m, '');
}

function ensureBindingSchema(db) {
  if (hasBindingSchema(db)) {
    assertCanonicalBindingSchema(db);
    return false;
  }

  db.exec(migrationBody());
  assertCanonicalBindingSchema(db);
  return true;
}

function assertImmutabilityTriggersFunctional(db) {
  const existing = db.prepare(
    'SELECT binding_id FROM main.xr1f_l1_allocator_binding WHERE binding_id = 1',
  ).get();

  db.exec('SAVEPOINT xr1f_l1_trigger_probe');
  try {
    if (!existing) {
      db.prepare(
        'INSERT INTO main.xr1f_l1_allocator_binding (binding_id, schema_version, allocator_kind, allocator_id, network, x402_xec_commit, bound_at) VALUES (1, 1, ?, ?, ?, ?, ?)',
      ).run(
        'X402_XEC_XPUB_V1',
        '0'.repeat(64),
        'xec:mainnet',
        '0f409dea2959b397ecc4bb84d71519ec6e3aec04',
        0,
      );
    }

    let updateBlocked = false;
    try {
      db.prepare(
        'UPDATE main.xr1f_l1_allocator_binding SET bound_at = bound_at WHERE binding_id = 1',
      ).run();
    } catch (error) {
      updateBlocked = /XR1F_L1_ALLOCATOR_BINDING_IMMUTABLE/.test(
        String(error?.message ?? error),
      );
    }
    if (!updateBlocked) {
      throw new Error(
        'XR1F_L1_BINDING_SCHEMA_UPDATE_TRIGGER_NOT_ENFORCED',
      );
    }

    let deleteBlocked = false;
    try {
      db.prepare(
        'DELETE FROM main.xr1f_l1_allocator_binding WHERE binding_id = 1',
      ).run();
    } catch (error) {
      deleteBlocked =
        /XR1F_L1_ALLOCATOR_BINDING_DELETE_FORBIDDEN/.test(
          String(error?.message ?? error),
        );
    }
    if (!deleteBlocked) {
      throw new Error(
        'XR1F_L1_BINDING_SCHEMA_DELETE_TRIGGER_NOT_ENFORCED',
      );
    }
  } finally {
    db.exec('ROLLBACK TO xr1f_l1_trigger_probe');
    db.exec('RELEASE xr1f_l1_trigger_probe');
  }

  return Object.freeze({
    ok: true,
    component: 'allocatorBindingTriggers',
  });
}

export async function runBindingCeremony({
  env = process.env,
  now = () => Math.floor(Date.now() / 1000),
  logger = console,
  probeC3b = probeC3bStoreReadOnly,
  getDeployedBuildSha = resolveDeployedBuildSha,
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

  // Bind evidence must describe the exact checkout executing this ceremony.
  // Verify before opening or probing the production database.
  assertDeployedBuildSha(
    config.buildSha,
    getDeployedBuildSha,
  );

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
  let transactionOwned = false;

  try {
    // One write transaction owns the complete mutable ceremony. BEGIN
    // IMMEDIATE prevents another writer from changing invoice/schema state
    // between validation, migration and binding.
    db.exec('BEGIN IMMEDIATE');
    transactionOwned = true;

    assertLiveCanonicalC3b(db);

    if (!hasBindingSchema(db) && invoiceHistoryCount(db) !== 0) {
      throw new Error('XR1F_L1_UNBOUND_HISTORY');
    }

    const schemaCreated = ensureBindingSchema(db);
    assertCanonicalBindingSchema(db);
    assertImmutabilityTriggersFunctional(db);

    const before = readAllocatorBinding(db);

    const bound = bindAllocatorInTransaction({
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

    db.exec('COMMIT');
    transactionOwned = false;

    logger.log(JSON.stringify(result));
    return result;
  } catch (error) {
    if (transactionOwned) {
      try { db.exec('ROLLBACK'); } catch {}
    }
    throw error;
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
