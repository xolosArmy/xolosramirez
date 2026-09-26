import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATION = new URL(
  '../../src/x402-xr1f-l1/migrations/001_allocator_binding.sql',
  import.meta.url,
);

const CANONICAL_X402_XEC_COMMIT =
  '0f409dea2959b397ecc4bb84d71519ec6e3aec04';

function withDb(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'xr1f-l1-migration-'));
  const path = join(dir, 'c3b.sqlite');
  const db = new DatabaseSync(path);
  try {
    db.exec(readFileSync(MIGRATION, 'utf8'));
    return fn(db, path);
  } finally {
    try { db.close(); } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
}

function insertBinding(db, overrides = {}) {
  const row = {
    bindingId: 1,
    schemaVersion: 1,
    allocatorKind: 'X402_XEC_XPUB_V1',
    allocatorId: 'a'.repeat(64),
    network: 'xec:mainnet',
    x402Commit: CANONICAL_X402_XEC_COMMIT,
    boundAt: 1_797_000_000,
    ...overrides,
  };

  db.prepare(`
    INSERT INTO xr1f_l1_allocator_binding (
      binding_id,
      schema_version,
      allocator_kind,
      allocator_id,
      network,
      x402_xec_commit,
      bound_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.bindingId,
    row.schemaVersion,
    row.allocatorKind,
    row.allocatorId,
    row.network,
    row.x402Commit,
    row.boundAt,
  );
}

test('1. migration creates one STRICT allocator-binding table and canonical triggers', () => {
  withDb(db => {
    const table = db.prepare(
      "SELECT sql FROM main.sqlite_master WHERE type='table' AND name='xr1f_l1_allocator_binding'",
    ).get();
    assert.ok(table?.sql);
    assert.match(table.sql, /\bSTRICT\b/i);

    const triggers = new Set(
      db.prepare(
        "SELECT name FROM main.sqlite_master WHERE type='trigger' AND tbl_name='xr1f_l1_allocator_binding'",
      ).all().map(row => row.name),
    );

    assert.deepEqual(
      triggers,
      new Set([
        'xr1f_l1_allocator_binding_no_update',
        'xr1f_l1_allocator_binding_no_delete',
      ]),
    );
  });
});

test('2. canonical watch-only binding can be inserted exactly once', () => {
  withDb(db => {
    insertBinding(db);

    const row = db.prepare(
      'SELECT * FROM main.xr1f_l1_allocator_binding WHERE binding_id = 1',
    ).get();

    assert.equal(row.schema_version, 1);
    assert.equal(row.allocator_kind, 'X402_XEC_XPUB_V1');
    assert.equal(row.allocator_id, 'a'.repeat(64));
    assert.equal(row.network, 'xec:mainnet');
    assert.equal(row.x402_xec_commit, CANONICAL_X402_XEC_COMMIT);

    assert.throws(() => insertBinding(db, { allocatorId: 'b'.repeat(64) }));
  });
});

test('3. binding rejects noncanonical commit, network and allocator identity', () => {
  withDb(db => {
    assert.throws(() =>
      insertBinding(db, { x402Commit: '1'.repeat(40) }),
    );
    assert.throws(() =>
      insertBinding(db, { network: 'xec:testnet' }),
    );
    assert.throws(() =>
      insertBinding(db, { allocatorId: 'not-a-sha256' }),
    );
  });
});

test('4. binding evidence is immutable and undeletable', () => {
  withDb(db => {
    insertBinding(db);

    assert.throws(() =>
      db.prepare(
        'UPDATE main.xr1f_l1_allocator_binding SET bound_at = ? WHERE binding_id = 1',
      ).run(1_797_000_001),
      /XR1F_L1_ALLOCATOR_BINDING_IMMUTABLE/,
    );

    assert.throws(() =>
      db.prepare(
        'DELETE FROM main.xr1f_l1_allocator_binding WHERE binding_id = 1',
      ).run(),
      /XR1F_L1_ALLOCATOR_BINDING_DELETE_FORBIDDEN/,
    );
  });
});

test('5. migration performs no allocator binding or invoice issuance by itself', () => {
  withDb(db => {
    const count = db.prepare(
      'SELECT COUNT(*) AS n FROM main.xr1f_l1_allocator_binding',
    ).get().n;

    assert.equal(Number(count), 0);

    const invoices = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='invoices'",
    ).get();

    assert.equal(invoices, undefined);
  });
});
