import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const HEX_64 = /^[0-9a-f]{64}$/;
const DEFAULT_SQLITE3_BIN = '/usr/bin/sqlite3';
const FORBIDDEN_READER_METHODS = [
  'broadcastTx',
  'broadcast',
  'sendRawTransaction',
  'submitTx',
  'sendTx',
  'broadcastRawTx',
];

function validateDurablePath(path, name) {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new Error(`${name}_PATH_REQUIRED`);
  }
  const trimmed = path.trim();
  const lower = trimmed.toLowerCase();
  if (
    !trimmed.startsWith('/') ||
    lower.startsWith('file:') ||
    lower === ':memory:' ||
    lower.includes(':memory:') ||
    lower.includes('mode=memory') ||
    lower.includes('vfs=memdb')
  ) {
    throw new Error(`${name}_DURABLE_ABSOLUTE_PATH_REQUIRED`);
  }

  const expected = resolve(trimmed);
  let stat;
  try {
    stat = lstatSync(expected);
  } catch {
    throw new Error(`${name}_DATABASE_NOT_FOUND`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${name}_REGULAR_FILE_REQUIRED`);
  }
  if (realpathSync(expected) !== expected) {
    throw new Error(`${name}_DATABASE_FILE_MISMATCH`);
  }
  return expected;
}

export function immutableSqliteQuery(
  path,
  sql,
  { sqlite3Bin = DEFAULT_SQLITE3_BIN, timeoutMs = 5000 } = {},
) {
  const expected = validateDurablePath(path, 'XR1F_RO_SQLITE');
  const uri = `${pathToFileURL(expected).href}?mode=ro&immutable=1`;

  const result = spawnSync(
    sqlite3Bin,
    ['-readonly', '-json', uri, sql],
    {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      throw new Error('XR1F_RO_SQLITE3_UNAVAILABLE');
    }
    if (result.error.code === 'ETIMEDOUT') {
      throw new Error('XR1F_RO_SQLITE3_TIMEOUT');
    }
    throw new Error('XR1F_RO_SQLITE_QUERY_FAILED');
  }
  if (result.status !== 0) {
    throw new Error('XR1F_RO_SQLITE_QUERY_FAILED');
  }

  const stdout = String(result.stdout ?? '').trim();
  if (stdout === '') return [];

  try {
    const rows = JSON.parse(stdout);
    if (!Array.isArray(rows)) {
      throw new TypeError('rows');
    }
    return rows;
  } catch {
    throw new Error('XR1F_RO_SQLITE_JSON_INVALID');
  }
}

function runQuery(path, sql, options) {
  const query = options?.query ?? immutableSqliteQuery;
  return query(path, sql);
}

function requireQuickCheck(path, name, options) {
  const result = runQuery(path, 'PRAGMA quick_check', options)[0];
  if (result?.quick_check !== 'ok') {
    throw new Error(`${name}_QUICK_CHECK_FAILED`);
  }
}

function requireWalHeader(path, name) {
  const header = readFileSync(path, { encoding: null, flag: 'r' });
  if (
    header.length < 20 ||
    header.subarray(0, 16).toString('ascii') !== 'SQLite format 3\0' ||
    header[18] !== 2 ||
    header[19] !== 2
  ) {
    throw new Error(`${name}_WAL_REQUIRED`);
  }
}

function tableColumns(path, table, options) {
  return new Set(
    runQuery(path, `PRAGMA table_info('${table}')`, options)
      .map(row => row.name),
  );
}

function requireColumns(actual, required, name) {
  for (const column of required) {
    if (!actual.has(column)) {
      throw new Error(`${name}_COLUMN_MISSING_${column}`);
    }
  }
}

function uniqueIndexedColumns(path, table, options) {
  const result = new Set();
  for (const index of runQuery(path, `PRAGMA index_list('${table}')`, options)) {
    if (Number(index.unique) !== 1) continue;
    const columns = runQuery(
      path,
      `PRAGMA index_info('${String(index.name).replaceAll("'", "''")}')`,
      options,
    )
      .map(row => row.name)
      .filter(Boolean);
    if (columns.length === 1) result.add(columns[0]);
  }
  return result;
}

export function probeC3bStoreReadOnly(path, options = {}) {
  const expected = validateDurablePath(path, 'XR1F_RO_C3B');

  requireQuickCheck(expected, 'XR1F_RO_C3B', options);

  const table = runQuery(
    expected,
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='invoices'",
    options,
  )[0];
  if (!table?.sql) throw new Error('XR1F_RO_C3B_INVOICES_TABLE_MISSING');

  requireColumns(
    tableColumns(expected, 'invoices', options),
    [
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
    ],
    'XR1F_RO_C3B',
  );

  const unique = uniqueIndexedColumns(expected, 'invoices', options);
  for (const column of [
    'invoice_hash',
    'nonce',
    'pay_to',
    'derivation_index',
    'settled_txid',
  ]) {
    if (!unique.has(column)) {
      throw new Error(`XR1F_RO_C3B_UNIQUE_INDEX_MISSING_${column}`);
    }
  }

  requireWalHeader(expected, 'XR1F_RO_C3B');

  return Object.freeze({ ok: true, component: 'c3bStore' });
}

export function probeXr1dStoreReadOnly(path, options = {}) {
  const expected = validateDurablePath(path, 'XR1F_RO_XR1D');

  requireQuickCheck(expected, 'XR1F_RO_XR1D', options);

  const version = runQuery(expected, 'PRAGMA user_version', options)[0]?.user_version;
  if (version !== 1) throw new Error('XR1F_RO_XR1D_SCHEMA_VERSION_MISMATCH');

  const table = runQuery(
    expected,
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='xr1_entitlements'",
    options,
  )[0];
  if (!table?.sql || !/\bSTRICT\b/i.test(table.sql)) {
    throw new Error('XR1F_RO_XR1D_STRICT_TABLE_REQUIRED');
  }

  requireColumns(
    tableColumns(expected, 'xr1_entitlements', options),
    [
      'entitlement_id',
      'invoice_hash',
      'txid',
      'resource_id',
      'resource_hash',
      'granted_at',
      'expires_at',
      'status',
    ],
    'XR1F_RO_XR1D',
  );

  const triggerNames = new Set(
    runQuery(
      expected,
      "SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='xr1_entitlements'",
      options,
    ).map(row => row.name),
  );
  for (const trigger of [
    'xr1_entitlements_insert_active_only',
    'xr1_entitlements_immutable_binding',
    'xr1_entitlements_status_transition',
    'xr1_entitlements_no_delete',
  ]) {
    if (!triggerNames.has(trigger)) {
      throw new Error(`XR1F_RO_XR1D_TRIGGER_MISSING_${trigger}`);
    }
  }

  const expiryIndex = runQuery(
    expected,
    "SELECT sql FROM sqlite_master WHERE type='index' AND name='xr1_entitlements_active_expiry_idx'",
    options,
  )[0];
  if (!expiryIndex?.sql) {
    throw new Error('XR1F_RO_XR1D_ACTIVE_EXPIRY_INDEX_MISSING');
  }

  return Object.freeze({ ok: true, component: 'xr1dStore' });
}

function validateChronikTx(tx, expectedTxid) {
  if (!tx || typeof tx !== 'object') {
    throw new Error('XR1F_RO_CHRONIK_MALFORMED_TX');
  }
  if (
    typeof tx.txid !== 'string' ||
    tx.txid.toLowerCase() !== expectedTxid
  ) {
    throw new Error('XR1F_RO_CHRONIK_TXID_MISMATCH');
  }
  if (!Array.isArray(tx.outputs)) {
    throw new Error('XR1F_RO_CHRONIK_OUTPUTS_INVALID');
  }
  if (typeof tx.isFinal !== 'boolean') {
    throw new Error('XR1F_RO_CHRONIK_FINALITY_INVALID');
  }
  if (
    typeof tx.timeFirstSeen !== 'number' ||
    !Number.isSafeInteger(tx.timeFirstSeen) ||
    tx.timeFirstSeen < 0
  ) {
    throw new Error('XR1F_RO_CHRONIK_TIME_INVALID');
  }

  for (const output of tx.outputs) {
    if (
      !output ||
      typeof output.outputScript !== 'string' ||
      !/^[0-9a-f]*$/i.test(output.outputScript) ||
      typeof output.sats !== 'bigint' ||
      output.sats < 0n
    ) {
      throw new Error('XR1F_RO_CHRONIK_OUTPUT_INVALID');
    }
  }

  if (tx.block !== undefined) {
    if (
      !tx.block ||
      !Number.isSafeInteger(tx.block.height) ||
      tx.block.height < 0 ||
      typeof tx.block.hash !== 'string' ||
      !HEX_64.test(tx.block.hash.toLowerCase()) ||
      !Number.isSafeInteger(tx.block.timestamp) ||
      tx.block.timestamp < 0
    ) {
      throw new Error('XR1F_RO_CHRONIK_BLOCK_INVALID');
    }
  }

  return Object.freeze({
    ok: true,
    component: 'chronik',
    confirmed: tx.block !== undefined,
    avalancheFinal: tx.isFinal,
    outputCount: tx.outputs.length,
  });
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('XR1F_RO_CHRONIK_TIMEOUT')),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function probeChronikReadOnly({
  reader,
  txid,
  timeoutMs,
}) {
  if (!reader || typeof reader.getTx !== 'function') {
    throw new Error('XR1F_RO_CHRONIK_READER_INVALID');
  }
  for (const method of FORBIDDEN_READER_METHODS) {
    if (typeof reader[method] === 'function') {
      throw new Error(`XR1F_RO_CHRONIK_WRITE_CAPABILITY_${method}`);
    }
  }
  if (typeof txid !== 'string' || !HEX_64.test(txid)) {
    throw new Error('XR1F_RO_CHRONIK_PROBE_TXID_INVALID');
  }

  const tx = await withTimeout(reader.getTx(txid), timeoutMs);
  return validateChronikTx(tx, txid);
}
