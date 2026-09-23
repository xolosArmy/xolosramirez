-- X402-XR1D v1 — Durable Entitlement Persistence
-- Scope: schema + database-enforced invariants only.
-- No payment verification, signing, broadcast, production wiring, or real funds.

PRAGMA foreign_keys = ON;
PRAGMA user_version = 1;

CREATE TABLE IF NOT EXISTS xr1_entitlements (
  entitlement_id TEXT PRIMARY KEY
    CHECK(length(entitlement_id) >= 8 AND length(entitlement_id) <= 128),

  invoice_hash TEXT NOT NULL UNIQUE
    CHECK(
      length(invoice_hash) = 64
      AND invoice_hash = lower(invoice_hash)
      AND invoice_hash NOT GLOB '*[^0-9a-f]*'
    ),

  txid TEXT NOT NULL UNIQUE
    CHECK(
      length(txid) = 64
      AND txid = lower(txid)
      AND txid NOT GLOB '*[^0-9a-f]*'
    ),

  resource_id TEXT NOT NULL
    CHECK(length(resource_id) >= 1 AND length(resource_id) <= 256),

  resource_hash TEXT NOT NULL
    CHECK(
      length(resource_hash) = 64
      AND resource_hash = lower(resource_hash)
      AND resource_hash NOT GLOB '*[^0-9a-f]*'
    ),

  granted_at INTEGER NOT NULL
    CHECK(granted_at >= 0),

  expires_at INTEGER NOT NULL
    CHECK(expires_at > granted_at),

  status TEXT NOT NULL
    CHECK(status IN ('ACTIVE', 'EXPIRED'))
) STRICT;

-- New grants always begin ACTIVE. Historical EXPIRED rows are reached only
-- through the single allowed lifecycle transition below.
CREATE TRIGGER IF NOT EXISTS xr1_entitlements_insert_active_only
BEFORE INSERT ON xr1_entitlements
FOR EACH ROW
WHEN NEW.status <> 'ACTIVE'
BEGIN
  SELECT RAISE(ABORT, 'XR1D_INSERT_MUST_BE_ACTIVE');
END;

-- Economic binding + grant/TTL evidence is immutable after insertion.
-- expires_at is immutable too: application code cannot extend/recycle access.
CREATE TRIGGER IF NOT EXISTS xr1_entitlements_immutable_binding
BEFORE UPDATE OF
  entitlement_id,
  invoice_hash,
  txid,
  resource_id,
  resource_hash,
  granted_at,
  expires_at
ON xr1_entitlements
FOR EACH ROW
WHEN
  NEW.entitlement_id IS NOT OLD.entitlement_id OR
  NEW.invoice_hash IS NOT OLD.invoice_hash OR
  NEW.txid IS NOT OLD.txid OR
  NEW.resource_id IS NOT OLD.resource_id OR
  NEW.resource_hash IS NOT OLD.resource_hash OR
  NEW.granted_at IS NOT OLD.granted_at OR
  NEW.expires_at IS NOT OLD.expires_at
BEGIN
  SELECT RAISE(ABORT, 'XR1D_IMMUTABLE_BINDING');
END;

-- Lifecycle is monotonic: ACTIVE -> EXPIRED only.
CREATE TRIGGER IF NOT EXISTS xr1_entitlements_status_transition
BEFORE UPDATE OF status ON xr1_entitlements
FOR EACH ROW
WHEN
  NEW.status IS NOT OLD.status
  AND NOT (OLD.status = 'ACTIVE' AND NEW.status = 'EXPIRED')
BEGIN
  SELECT RAISE(ABORT, 'XR1D_INVALID_STATUS_TRANSITION');
END;

-- Evidence rows are retained for audit/replay defense.
CREATE TRIGGER IF NOT EXISTS xr1_entitlements_no_delete
BEFORE DELETE ON xr1_entitlements
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'XR1D_DELETE_FORBIDDEN');
END;

CREATE INDEX IF NOT EXISTS xr1_entitlements_active_expiry_idx
ON xr1_entitlements(status, expires_at);
