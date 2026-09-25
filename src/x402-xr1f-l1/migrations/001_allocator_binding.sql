-- X402-XR1F-L1 v1 — Durable Watch-Only Allocator Binding
-- Scope: schema + database-enforced allocator identity invariants only.
--
-- This migration DOES NOT:
-- - insert or expose a merchant xpub
-- - allocate a derivation index
-- - issue an invoice
-- - verify or settle a payment
-- - sign or broadcast a transaction
-- - authorize real funds
--
-- The single binding row is created later by an explicit governed binding
-- ceremony after validating that the C3B history is safe to bind.

BEGIN IMMEDIATE;

CREATE TABLE xr1f_l1_allocator_binding (
  binding_id INTEGER PRIMARY KEY
    CHECK(binding_id = 1),

  schema_version INTEGER NOT NULL
    CHECK(schema_version = 1),

  allocator_kind TEXT NOT NULL
    CHECK(allocator_kind = 'X402_XEC_XPUB_V1'),

  allocator_id TEXT NOT NULL UNIQUE
    CHECK(
      length(allocator_id) = 64
      AND allocator_id = lower(allocator_id)
      AND allocator_id NOT GLOB '*[^0-9a-f]*'
    ),

  network TEXT NOT NULL
    CHECK(network = 'xec:mainnet'),

  x402_xec_commit TEXT NOT NULL
    CHECK(
      x402_xec_commit =
        '0f409dea2959b397ecc4bb84d71519ec6e3aec04'
    ),

  bound_at INTEGER NOT NULL
    CHECK(
      bound_at >= 0
      AND bound_at <= 9007199254740991
    )
) STRICT;

-- Once the production watch-only allocator identity is bound, it is immutable.
-- Rotation/replacement must use a separately reviewed future migration/gate.
CREATE TRIGGER xr1f_l1_allocator_binding_no_update
BEFORE UPDATE ON xr1f_l1_allocator_binding
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'XR1F_L1_ALLOCATOR_BINDING_IMMUTABLE');
END;

-- Binding evidence is retained permanently for audit/replay defense.
CREATE TRIGGER xr1f_l1_allocator_binding_no_delete
BEFORE DELETE ON xr1f_l1_allocator_binding
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'XR1F_L1_ALLOCATOR_BINDING_DELETE_FORBIDDEN');
END;

COMMIT;
