# XR1F-RO Production Read-Only Service

Status: **deployment candidate only**. This service does not authorize real funds.

## Purpose

XR1F-RO validates production infrastructure without crossing the XR1F real-funds boundary.

It exposes only:

- `GET /health`
- `HEAD /health`
- `GET /ready`
- `HEAD /ready`

It intentionally does **not** mount:

- invoice issuance
- payment proof verification
- protected dossier delivery
- signing
- transaction construction
- broadcast
- custody

## Canonical anchor

x402-XEC C3B source commit:

`0f409dea2959b397ecc4bb84d71519ec6e3aec04`

The production Chronik reader is loaded from a locally built module whose SHA-256 must exactly match `XR1F_RO_PROVIDER_SHA256`.

## Readiness contract

`/ready` returns HTTP 200 with `READ_ONLY_READY` only when:

1. `XR1F_RO_ENABLED=true`.
2. C3B SQLite opens read-only and passes `PRAGMA quick_check`.
3. C3B schema contains required invoice columns and unique indexes.
4. C3B DB is WAL.
5. XR1D SQLite opens read-only and passes `PRAGMA quick_check`.
6. XR1D `user_version=1`, STRICT table, canonical triggers and expiry index exist.
7. Chronik provider artifact matches the configured SHA-256.
8. Chronik reader exposes `getTx()` and no recognized write/broadcast methods.
9. A configured public mainnet transaction can be read within timeout and has canonical shape.

Any failure returns HTTP 503 and never falls back to a mock or writable mode.

## Deployment procedure

1. Checkout the reviewed exact deployment commit under `/opt/xolosramirez`.
2. Build the canonical x402-XEC provider from the pinned commit in an isolated build directory.
3. Copy only the read-only Chronik provider artifact and its runtime dependencies under `/opt/x402-xec`.
4. Compute SHA-256 of the provider module and put it in `/etc/xolosramirez/xr1f-ro.env`.
5. Set the two existing durable database paths. Do not create fresh production DBs with XR1F-RO.
6. Choose a known public mainnet txid for the read-only Chronik probe.
7. Install `deploy/systemd/xr1f-ro.service`.
8. Start with `XR1F_RO_ENABLED=false`.
9. Verify `/health` => 200 and `/ready` => 503 `XR1F_RO_DISABLED`.
10. Set `XR1F_RO_ENABLED=true` only for the reviewed read-only validation window.
11. Verify `/ready` => 200 `READ_ONLY_READY`.
12. Return the kill-switch to false if the validation window ends or any anomaly appears.

## Reverse proxy

The Node process must bind only to `127.0.0.1`. If exposed through a reverse proxy, restrict public access to the health/readiness paths or keep them operator-only.

## Rollback

Rollback does not touch either database.

1. Set `XR1F_RO_ENABLED=false`.
2. Restart `xr1f-ro.service`.
3. Confirm `/ready` => 503.
4. Stop/disable the service if needed.
5. Restore the previous application commit/artifact.
6. Preserve C3B and XR1D DB files unchanged.

## Required evidence for XR1F-RO closure

- exact deployment commit SHA
- provider artifact SHA-256
- C3B DB quick-check and schema probe
- XR1D DB quick-check and schema probe
- Chronik read-only probe result
- kill-switch test
- service restart test
- independent exact-head review

Successful XR1F-RO validation means **READ_ONLY_READY**, never `REAL_FUNDS_READY`.
