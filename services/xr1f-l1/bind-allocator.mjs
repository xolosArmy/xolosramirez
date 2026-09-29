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

    if (columns.length === 1) result.add(columns[0]);
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

  const deleteSql = normalizeSql(triggers[0].sql);
  const updateSql = normalizeSql(triggers[1].sql);

  if (
    !deleteSql.includes(
      'before delete on xr1f_l1_allocator_binding',
    ) ||
    !deleteSql.includes(
      "raise(abort, 'xr1f_l1_allocator_binding_delete_forbidden')",
    )
  ) {
    throw new Error(
      'XR1F_L1_BINDING_SCHEMA_DELETE_TRIGGER_MISMATCH',
    );
  }

  if (
    !updateSql.includes(
      'before update on xr1f_l1_allocator_binding',
    ) ||
    !updateSql.includes(
      "raise(abort, 'xr1f_l1_allocator_binding_immutable')",
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

function ensureBindingSchema(db) {
  if (hasBindingSchema(db)) {
    assertCanonicalBindingSchema(db);
    return false;
  }

  db.exec(readFileSync(MIGRATION, 'utf8'));
  assertCanonicalBindingSchema(db);
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
    // Revalidate the exact live database state, including uncheckpointed WAL,
    // on the same handle that would later persist the allocator binding.
    assertLiveCanonicalC3b(db);

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
