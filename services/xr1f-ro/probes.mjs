import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const HEX_64 = /^[0-9a-f]{64}$/;
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
  return resolve(trimmed);
}

function openReadOnly(path, name) {
  const expected = validateDurablePath(path, name);
  const db = new DatabaseSync(expected, { readOnly: true });
  const rows = db.prepare('PRAGMA database_list').all();
  const main = rows.find(row => row?.name === 'main');
  if (!main || typeof main.file !== 'string' || resolve(main.file) !== expected) {
    db.close();
    throw new Error(`${name}_DATABASE_FILE_MISMATCH`);
  }
  return db;
}

function requireQuickCheck(db, name) {
  const result = db.prepare('PRAGMA quick_check').get();
  if (result?.quick_check !== 'ok') {
    throw new Error(`${name}_QUICK_CHECK_FAILED`);
  }
}

function tableColumns(db, table) {
  return new Set(
    db.prepare(`PRAGMA table_info('${table}')`).all().map(row => row.name),
  );
}

function requireColumns(actual, required, name) {
  for (const column of required) {
    if (!actual.has(column)) {
      throw new Error(`${name}_COLUMN_MISSING_${column}`);
    }
  }
}

function uniqueIndexedColumns(db, table) {
  const result = new Set();
  for (const index of db.prepare(`PRAGMA index_list('${table}')`).all()) {
    if (Number(index.unique) !== 1) continue;
    const columns = db
      .prepare(`PRAGMA index_info('${index.name}')`)
      .all()
      .map(row => row.name)
      .filter(Boolean);
    if (columns.length === 1) result.add(columns[0]);
  }
  return result;
}

export function probeC3bStoreReadOnly(path) {
  const db = openReadOnly(path, 'XR1F_RO_C3B');
  try {
    requireQuickCheck(db, 'XR1F_RO_C3B');

    const table = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='invoices'",
    ).get();
    if (!table?.sql) throw new Error('XR1F_RO_C3B_INVOICES_TABLE_MISSING');

    requireColumns(
      tableColumns(db, 'invoices'),
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

    const unique = uniqueIndexedColumns(db, 'invoices');
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

    const journal = db.prepare('PRAGMA journal_mode').get()?.journal_mode;
    if (String(journal).toLowerCase() !== 'wal') {
      throw new Error('XR1F_RO_C3B_WAL_REQUIRED');
    }

    return Object.freeze({ ok: true, component: 'c3bStore' });
  } finally {
    db.close();
  }
}

export function probeXr1dStoreReadOnly(path) {
  const db = openReadOnly(path, 'XR1F_RO_XR1D');
  try {
    requireQuickCheck(db, 'XR1F_RO_XR1D');

    const version = db.prepare('PRAGMA user_version').get()?.user_version;
    if (version !== 1) throw new Error('XR1F_RO_XR1D_SCHEMA_VERSION_MISMATCH');

    const table = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='xr1_entitlements'",
    ).get();
    if (!table?.sql || !/\bSTRICT\b/i.test(table.sql)) {
      throw new Error('XR1F_RO_XR1D_STRICT_TABLE_REQUIRED');
    }

    requireColumns(
      tableColumns(db, 'xr1_entitlements'),
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
      db.prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='xr1_entitlements'",
      ).all().map(row => row.name),
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

    const expiryIndex = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='index' AND name='xr1_entitlements_active_expiry_idx'",
    ).get();
    if (!expiryIndex?.sql) {
      throw new Error('XR1F_RO_XR1D_ACTIVE_EXPIRY_INDEX_MISSING');
    }

    return Object.freeze({ ok: true, component: 'xr1dStore' });
  } finally {
    db.close();
  }
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
