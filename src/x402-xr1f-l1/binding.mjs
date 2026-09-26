import {
  CANONICAL_X402_XEC_COMMIT,
  XR1F_L1_ALLOCATOR_KIND,
  XR1F_L1_NETWORK,
  assertWatchOnlyAllocator,
} from './allocator.mjs';

export class Xr1fL1BindingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'Xr1fL1BindingError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new Xr1fL1BindingError(code, message);
}

function assertDb(db) {
  if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') {
    fail('XR1F_L1_DB_REQUIRED', 'SQLite binding database handle is required');
  }
}

function assertBoundAt(boundAt) {
  if (
    typeof boundAt !== 'number' ||
    !Number.isSafeInteger(boundAt) ||
    boundAt < 0
  ) {
    fail(
      'XR1F_L1_BOUND_AT_INVALID',
      'boundAt must be a non-negative safe integer',
    );
  }
}

function getExistingBinding(db) {
  return db.prepare(
    'SELECT binding_id, schema_version, allocator_kind, allocator_id, network, x402_xec_commit, bound_at FROM main.xr1f_l1_allocator_binding WHERE binding_id = 1',
  ).get();
}

function countInvoiceHistory(db) {
  const invoicesTable = db.prepare(
    "SELECT name FROM main.sqlite_master WHERE type = 'table' AND name = 'invoices'",
  ).get();

  if (!invoicesTable) return 0;

  const row = db.prepare('SELECT COUNT(*) AS n FROM main.invoices').get();
  const count = Number(row?.n ?? 0);
  if (!Number.isSafeInteger(count) || count < 0) {
    fail(
      'XR1F_L1_C3B_HISTORY_INVALID',
      'Unable to determine authoritative invoice history safely',
    );
  }
  return count;
}

function bindingMatches(row, allocator) {
  return (
    Number(row?.binding_id) === 1 &&
    Number(row?.schema_version) === 1 &&
    row?.allocator_kind === XR1F_L1_ALLOCATOR_KIND &&
    row?.allocator_id === allocator.allocatorId &&
    row?.network === XR1F_L1_NETWORK &&
    row?.x402_xec_commit === CANONICAL_X402_XEC_COMMIT
  );
}

function publicBinding(row) {
  return Object.freeze({
    bindingId: Number(row.binding_id),
    schemaVersion: Number(row.schema_version),
    allocatorKind: row.allocator_kind,
    allocatorId: row.allocator_id,
    network: row.network,
    x402Commit: row.x402_xec_commit,
    boundAt: Number(row.bound_at),
  });
}

export function readAllocatorBinding(db) {
  assertDb(db);

  let row;
  try {
    row = getExistingBinding(db);
  } catch {
    fail(
      'XR1F_L1_BINDING_SCHEMA_MISSING',
      'Allocator binding schema is unavailable',
    );
  }

  if (!row) {
    return Object.freeze({
      ok: true,
      status: 'UNBOUND',
      binding: null,
    });
  }

  return Object.freeze({
    ok: true,
    status: 'BOUND',
    binding: publicBinding(row),
  });
}

export function assertAllocatorBinding(db, allocator) {
  assertDb(db);
  assertWatchOnlyAllocator(allocator);

  const current = readAllocatorBinding(db);
  if (current.status !== 'BOUND') {
    fail(
      'XR1F_L1_ALLOCATOR_UNBOUND',
      'Watch-only allocator is not durably bound to this C3B store',
    );
  }

  const row = {
    binding_id: current.binding.bindingId,
    schema_version: current.binding.schemaVersion,
    allocator_kind: current.binding.allocatorKind,
    allocator_id: current.binding.allocatorId,
    network: current.binding.network,
    x402_xec_commit: current.binding.x402Commit,
  };

  if (!bindingMatches(row, allocator)) {
    fail(
      'XR1F_L1_ALLOCATOR_BINDING_MISMATCH',
      'Watch-only allocator identity does not match durable C3B binding',
    );
  }

  return Object.freeze({
    ok: true,
    status: 'BOUND',
    idempotent: true,
    binding: current.binding,
  });
}

export function bindAllocator({ db, allocator, boundAt }) {
  assertDb(db);
  assertWatchOnlyAllocator(allocator);
  assertBoundAt(boundAt);

  let existing;
  try {
    existing = getExistingBinding(db);
  } catch {
    fail(
      'XR1F_L1_BINDING_SCHEMA_MISSING',
      'Allocator binding schema is unavailable',
    );
  }

  if (existing) {
    if (!bindingMatches(existing, allocator)) {
      fail(
        'XR1F_L1_ALLOCATOR_BINDING_MISMATCH',
        'A different allocator identity is already bound to this C3B store',
      );
    }

    return Object.freeze({
      ok: true,
      status: 'BOUND',
      idempotent: true,
      binding: publicBinding(existing),
    });
  }

  if (countInvoiceHistory(db) !== 0) {
    fail(
      'XR1F_L1_UNBOUND_HISTORY',
      'C3B contains invoice history but no allocator binding evidence',
    );
  }

  let transactionOwned = false;

  try {
    db.exec('BEGIN IMMEDIATE');
    transactionOwned = true;

    const raced = getExistingBinding(db);
    if (raced) {
      if (!bindingMatches(raced, allocator)) {
        throw new Xr1fL1BindingError(
          'XR1F_L1_ALLOCATOR_BINDING_MISMATCH',
          'A different allocator identity was bound concurrently',
        );
      }

      db.exec('COMMIT');
      transactionOwned = false;
      return Object.freeze({
        ok: true,
        status: 'BOUND',
        idempotent: true,
        binding: publicBinding(raced),
      });
    }

    if (countInvoiceHistory(db) !== 0) {
      throw new Xr1fL1BindingError(
        'XR1F_L1_UNBOUND_HISTORY',
        'C3B gained invoice history before allocator binding',
      );
    }

    db.prepare(
      'INSERT INTO main.xr1f_l1_allocator_binding (binding_id, schema_version, allocator_kind, allocator_id, network, x402_xec_commit, bound_at) VALUES (1, 1, ?, ?, ?, ?, ?)',
    ).run(
      XR1F_L1_ALLOCATOR_KIND,
      allocator.allocatorId,
      XR1F_L1_NETWORK,
      CANONICAL_X402_XEC_COMMIT,
      boundAt,
    );

    db.exec('COMMIT');
    transactionOwned = false;

    return Object.freeze({
      ok: true,
      status: 'BOUND',
      idempotent: false,
      binding: Object.freeze({
        bindingId: 1,
        schemaVersion: 1,
        allocatorKind: XR1F_L1_ALLOCATOR_KIND,
        allocatorId: allocator.allocatorId,
        network: XR1F_L1_NETWORK,
        x402Commit: CANONICAL_X402_XEC_COMMIT,
        boundAt,
      }),
    });
  } catch (error) {
    if (transactionOwned === true) {
      try { db.exec('ROLLBACK'); } catch {}
    }

    if (error instanceof Xr1fL1BindingError) throw error;

    fail(
      'XR1F_L1_BINDING_WRITE_FAILED',
      'Failed to persist allocator binding safely',
    );
  }
}
