import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from 'node:fs';
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
import {
  isCanonicalSettledTxidPartialIndexSql,
  probeC3bStoreReadOnly,
} from '../xr1f-ro/probes.mjs';

const MIGRATION = new URL(
  '../../src/x402-xr1f-l1/migrations/001_allocator_binding.sql',
  import.meta.url,
);
const REPO_ROOT = realpathSync(
  fileURLToPath(new URL('../../', import.meta.url)),
);
const GIT_BIN = '/usr/bin/git';

function runGit(repoRoot, gitBin, args) {
  return spawnSync(
    gitBin,
    [
      '-c',
      `safe.directory=${repoRoot}`,
      '-C',
      repoRoot,
      ...args,
    ],
    {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

export function resolveDeployedBuildSha({
  repoRoot = REPO_ROOT,
  gitBin = GIT_BIN,
} = {}) {
  const result = runGit(
    repoRoot,
    gitBin,
    ['rev-parse', '--verify', 'HEAD^{commit}'],
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

function gitBlobOid(bytes, algorithm) {
  const header = Buffer.from(`blob ${bytes.length}\\0`, 'utf8');
  const hash = createHash(algorithm);
  hash.update(header);
  hash.update(bytes);
  return hash.digest('hex');
}

function physicalTrackedBlobOid({
  repoRoot,
  path,
  mode,
  objectFormat,
}) {
  const root = resolve(repoRoot);
  const physicalPath = resolve(root, path);
  if (
    physicalPath === root ||
    !physicalPath.startsWith(`${root}/`)
  ) {
    throw new Error(
      'XR1F_L1_DEPLOYED_TREE_PATH_INVALID',
    );
  }

  let stat;
  try {
    stat = lstatSync(physicalPath);
  } catch {
    throw new Error(
      `XR1F_L1_DEPLOYED_PHYSICAL_FILE_MISSING_${path}`,
    );
  }

  let bytes;
  if (mode === '120000') {
    if (!stat.isSymbolicLink()) {
      throw new Error(
        `XR1F_L1_DEPLOYED_PHYSICAL_TYPE_MISMATCH_${path}`,
      );
    }
    bytes = readlinkSync(physicalPath, { encoding: 'buffer' });
  } else if (mode === '100644' || mode === '100755') {
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(
        `XR1F_L1_DEPLOYED_PHYSICAL_TYPE_MISMATCH_${path}`,
      );
    }

    const expectedExecutable = mode === '100755';
    const physicalExecutable = (stat.mode & 0o111) !== 0;
    if (physicalExecutable !== expectedExecutable) {
      throw new Error(
        `XR1F_L1_DEPLOYED_PHYSICAL_MODE_MISMATCH_${path}`,
      );
    }

    bytes = readFileSync(physicalPath);
  } else {
    throw new Error(
      `XR1F_L1_DEPLOYED_TREE_MODE_UNSUPPORTED_${mode}`,
    );
  }

  return gitBlobOid(bytes, objectFormat);
}

function assertPhysicalHeadIdentity(repoRoot, gitBin) {
  const formatResult = runGit(
    repoRoot,
    gitBin,
    ['rev-parse', '--show-object-format'],
  );
  if (formatResult.error || formatResult.status !== 0) {
    throw new Error(
      'XR1F_L1_DEPLOYED_CHECKOUT_ATTESTATION_FAILED',
    );
  }

  const objectFormat = String(formatResult.stdout ?? '')
    .trim()
    .toLowerCase();
  if (objectFormat !== 'sha1' && objectFormat !== 'sha256') {
    throw new Error(
      'XR1F_L1_DEPLOYED_OBJECT_FORMAT_UNSUPPORTED',
    );
  }

  const treeResult = runGit(
    repoRoot,
    gitBin,
    ['ls-tree', '-rz', '--full-tree', 'HEAD'],
  );
  if (treeResult.error || treeResult.status !== 0) {
    throw new Error(
      'XR1F_L1_DEPLOYED_CHECKOUT_ATTESTATION_FAILED',
    );
  }

  const rawTree = String(treeResult.stdout ?? '');
  if (!rawTree || !rawTree.endsWith('\0')) {
    throw new Error(
      'XR1F_L1_DEPLOYED_HEAD_TREE_INVALID',
    );
  }

  for (const record of rawTree.split('\0').filter(Boolean)) {
    const match = record.match(
      /^([0-7]{6}) (blob|commit) ([0-9a-f]{40,64})\t([\s\S]+)$/,
    );
    if (!match) {
      throw new Error(
        'XR1F_L1_DEPLOYED_HEAD_TREE_INVALID',
      );
    }

    const [, mode, type, expectedOid, path] = match;
    if (type !== 'blob') {
      throw new Error(
        `XR1F_L1_DEPLOYED_TREE_ENTRY_UNSUPPORTED_${path}`,
      );
    }

    const physicalOid = physicalTrackedBlobOid({
      repoRoot,
      path,
      mode,
      objectFormat,
    });

    if (physicalOid !== expectedOid) {
      throw new Error(
        `XR1F_L1_DEPLOYED_PHYSICAL_BLOB_MISMATCH_${path}`,
      );
    }
  }

  return true;
}

export function assertDeployedCheckoutClean({
  repoRoot = REPO_ROOT,
  gitBin = GIT_BIN,
} = {}) {
  assertPhysicalHeadIdentity(repoRoot, gitBin);

  const indexState = runGit(
    repoRoot,
    gitBin,
    ['ls-files', '-v', '-z', '--'],
  );

  if (indexState.error || indexState.status !== 0) {
    throw new Error(
      'XR1F_L1_DEPLOYED_CHECKOUT_ATTESTATION_FAILED',
    );
  }

  const manipulatedIndexEntry = String(indexState.stdout ?? '')
    .split('\0')
    .filter(Boolean)
    .find(entry => !entry.startsWith('H '));

  if (manipulatedIndexEntry) {
    throw new Error(
      'XR1F_L1_DEPLOYED_INDEX_FLAGS_FORBIDDEN',
    );
  }

  const porcelain = runGit(
    repoRoot,
    gitBin,
    [
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
      '--ignored=no',
      '--',
    ],
  );

  if (porcelain.error || porcelain.status !== 0) {
    throw new Error(
      'XR1F_L1_DEPLOYED_CHECKOUT_ATTESTATION_FAILED',
    );
  }

  if (String(porcelain.stdout ?? '').length !== 0) {
    throw new Error('XR1F_L1_DEPLOYED_CHECKOUT_DIRTY');
  }

  const checks = [
    ['diff', '--cached', '--quiet', '--no-ext-diff', 'HEAD', '--'],
    ['diff', '--quiet', '--no-ext-diff', '--'],
  ];

  for (const args of checks) {
    const result = runGit(repoRoot, gitBin, args);
    if (result.error || (result.status !== 0 && result.status !== 1)) {
      throw new Error(
        'XR1F_L1_DEPLOYED_CHECKOUT_ATTESTATION_FAILED',
      );
    }
    if (result.status === 1) {
      throw new Error('XR1F_L1_DEPLOYED_CHECKOUT_DIRTY');
    }
  }

  return true;
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

function canonicalSql(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

const CANONICAL_BINDING_TRIGGER_NAMES = Object.freeze([
  'xr1f_l1_allocator_binding_no_delete',
  'xr1f_l1_allocator_binding_no_update',
]);

let canonicalBindingIdentityCache = null;

function canonicalBindingIdentity() {
  if (canonicalBindingIdentityCache !== null) {
    return canonicalBindingIdentityCache;
  }

  const shadow = new DatabaseSync(':memory:');
  try {
    shadow.exec(migrationBody());

    const table = shadow.prepare(
      "SELECT sql FROM main.sqlite_master WHERE type='table' AND name='xr1f_l1_allocator_binding'",
    ).get();
    if (!table?.sql) {
      throw new Error(
        'XR1F_L1_CANONICAL_BINDING_SCHEMA_UNAVAILABLE',
      );
    }

    const triggerRows = shadow.prepare(
      "SELECT name, sql FROM main.sqlite_master WHERE type='trigger' AND tbl_name='xr1f_l1_allocator_binding' ORDER BY name",
    ).all();

    if (
      triggerRows.length !== CANONICAL_BINDING_TRIGGER_NAMES.length ||
      triggerRows.some(
        (row, index) =>
          row?.name !== CANONICAL_BINDING_TRIGGER_NAMES[index] ||
          !row?.sql,
      )
    ) {
      throw new Error(
        'XR1F_L1_CANONICAL_BINDING_TRIGGERS_UNAVAILABLE',
      );
    }

    canonicalBindingIdentityCache = Object.freeze({
      tableSql: canonicalSql(table.sql),
      triggerSql: Object.freeze(
        Object.fromEntries(
          triggerRows.map(row => [
            row.name,
            canonicalSql(row.sql),
          ]),
        ),
      ),
    });

    return canonicalBindingIdentityCache;
  } finally {
    shadow.close();
  }
}

function canonicalBindingTableSql() {
  return canonicalBindingIdentity().tableSql;
}

function canonicalBindingTriggerSql(triggerName) {
  const sql = canonicalBindingIdentity().triggerSql[triggerName];
  if (!sql) {
    throw new Error(
      `XR1F_L1_CANONICAL_TRIGGER_UNAVAILABLE_${triggerName}`,
    );
  }
  return sql;
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
    const terms = db.prepare(
      `PRAGMA main.index_info('${escaped}')`,
    ).all();

    // Every key term counts. Expression terms have name=null and must not
    // disappear during validation.
    if (
      terms.length !== 1 ||
      typeof terms[0]?.name !== 'string' ||
      terms[0].name.length === 0
    ) {
      continue;
    }

    const column = terms[0].name;
    const partial = Number(index.partial) === 1;

    if (partial) {
      if (column !== 'settled_txid') continue;

      const row = db.prepare(
        "SELECT sql FROM main.sqlite_master WHERE type='index' AND name=?",
      ).get(index.name);
      if (!isCanonicalSettledTxidPartialIndexSql(row?.sql)) {
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

function insertBindingValidationRow(db, overrides = {}) {
  const row = {
    bindingId: 1,
    schemaVersion: 1,
    allocatorKind: 'X402_XEC_XPUB_V1',
    allocatorId: '0'.repeat(64),
    network: 'xec:mainnet',
    x402Commit:
      '0f409dea2959b397ecc4bb84d71519ec6e3aec04',
    boundAt: 0,
    ...overrides,
  };

  db.prepare(
    'INSERT INTO main.xr1f_l1_allocator_binding (binding_id, schema_version, allocator_kind, allocator_id, network, x402_xec_commit, bound_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    row.bindingId,
    row.schemaVersion,
    row.allocatorKind,
    row.allocatorId,
    row.network,
    row.x402Commit,
    row.boundAt,
  );
}

function assertBindingChecksFunctional(tableSql) {
  const canonical = new DatabaseSync(':memory:');
  try {
    canonical.exec(tableSql);
    insertBindingValidationRow(canonical);
  } catch {
    try { canonical.close(); } catch {}
    throw new Error('XR1F_L1_BINDING_SCHEMA_CANONICAL_ROW_REJECTED');
  }
  canonical.close();

  const probes = [
    ['binding_id', { bindingId: 2 }],
    ['schema_version', { schemaVersion: 2 }],
    ['allocator_kind', { allocatorKind: 'NOT_CANONICAL' }],
    ['allocator_id_length', { allocatorId: '0'.repeat(63) }],
    ['allocator_id_lowercase', { allocatorId: 'A'.repeat(64) }],
    ['allocator_id_hex', { allocatorId: 'g'.repeat(64) }],
    ['network', { network: 'xec:testnet' }],
    ['x402_xec_commit', { x402Commit: '1'.repeat(40) }],
    ['bound_at_min', { boundAt: -1 }],
    ['bound_at_max', { boundAt: 9007199254740992 }],
  ];

  for (const [name, overrides] of probes) {
    const shadow = new DatabaseSync(':memory:');
    let rejected = false;
    try {
      shadow.exec(tableSql);
      insertBindingValidationRow(shadow, overrides);
    } catch (error) {
      rejected = /constraint failed/i.test(
        String(error?.message ?? error),
      );
    } finally {
      shadow.close();
    }

    if (!rejected) {
      throw new Error(
        `XR1F_L1_BINDING_SCHEMA_CONSTRAINT_NOT_ENFORCED_${name}`,
      );
    }
  }

  return Object.freeze({
    ok: true,
    component: 'allocatorBindingConstraints',
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

  const tableList = db.prepare(
    "PRAGMA main.table_list('xr1f_l1_allocator_binding')",
  ).get();
  if (
    tableList?.name !== 'xr1f_l1_allocator_binding' ||
    Number(tableList?.strict) !== 1
  ) {
    throw new Error('XR1F_L1_BINDING_SCHEMA_STRICT_REQUIRED');
  }

  if (canonicalSql(table.sql) !== canonicalBindingTableSql()) {
    throw new Error(
      'XR1F_L1_BINDING_SCHEMA_CANONICAL_SQL_MISMATCH',
    );
  }

  assertBindingChecksFunctional(table.sql);

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

  for (const trigger of triggers) {
    const liveSql = canonicalSql(trigger.sql);
    const canonicalTriggerSql =
      canonicalBindingTriggerSql(trigger.name);

    if (liveSql !== canonicalTriggerSql) {
      throw new Error(
        `XR1F_L1_BINDING_SCHEMA_CANONICAL_TRIGGER_MISMATCH_${trigger.name}`,
      );
    }
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

    const current = db.prepare(
      'SELECT binding_id, schema_version, allocator_kind, allocator_id, network, x402_xec_commit, bound_at FROM main.xr1f_l1_allocator_binding WHERE binding_id = 1',
    ).get();

    const alternateAllocatorId =
      current?.allocator_id === '0'.repeat(64)
        ? '1'.repeat(64)
        : '0'.repeat(64);
    const alternateBoundAt =
      Number(current?.bound_at) === 0 ? 1 : 0;

    const updateProbes = [
      ['allocator_id', 'allocator_id = ?', alternateAllocatorId],
      ['bound_at', 'bound_at = ?', alternateBoundAt],
      ['binding_id', 'binding_id = ?', 2],
      ['schema_version', 'schema_version = ?', 2],
      ['allocator_kind', 'allocator_kind = ?', 'NOT_CANONICAL'],
      ['network', 'network = ?', 'xec:testnet'],
      ['x402_xec_commit', 'x402_xec_commit = ?', '1'.repeat(40)],
    ];

    for (const [field, assignment, value] of updateProbes) {
      let updateBlocked = false;
      try {
        db.prepare(
          `UPDATE main.xr1f_l1_allocator_binding SET ${assignment} WHERE binding_id = 1`,
        ).run(value);
      } catch (error) {
        updateBlocked =
          /XR1F_L1_ALLOCATOR_BINDING_IMMUTABLE/.test(
            String(error?.message ?? error),
          );
      }

      if (!updateBlocked) {
        throw new Error(
          `XR1F_L1_BINDING_SCHEMA_UPDATE_TRIGGER_NOT_ENFORCED_${field}`,
        );
      }
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
  assertCheckoutClean = assertDeployedCheckoutClean,
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
  assertCheckoutClean();

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
