# XR1F-L1 Production Watch-Only Allocator Binding Ceremony

Status: **deployment candidate only**.

This ceremony materializes the already-reviewed XR1F-L1 watch-only allocator identity in the existing production C3B SQLite store. It does **not** authorize real funds.

## Architecture

XR1F-L1 remains a one-shot operator ceremony, not a resident HTTP service.

The systemd unit is intentionally:

- `Type=oneshot`
- manually invoked only
- not enabled at boot
- `PrivateNetwork=true`
- limited to write access under `/srv/xolosramirez/xr1f`

XR1F-RO remains the resident production readiness service.

## Canonical anchors

xolosramirez deployment commit: set in `XR1F_L1_BUILD_SHA` for the exact reviewed deployment.

x402-XEC source commit:

`0f409dea2959b397ecc4bb84d71519ec6e3aec04`

The canonical core artifact is independently verified by the XR1F-L1 allocator loader before any binding operation.

## Required operator configuration

Use `/etc/xolosramirez/xr1f-l1.env`, based on `deploy/xr1f-l1.env.example`.

Required values:

- `NODE_ENV=production`
- `XR1F_L1_BIND_ENABLED=false` by default
- exact reviewed `XR1F_L1_BUILD_SHA`
- existing authoritative `XR1F_L1_C3B_DB_PATH`
- watch-only `XR1F_L1_MERCHANT_XPUB`
- SHA-256 of the trimmed xpub in `XR1F_L1_MERCHANT_XPUB_SHA256`
- canonical x402-XEC commit and module path

The xpub is public-key material and has no signing authority. It must never be replaced with xprv/tprv/seed/mnemonic/WIF material.

## Fail-closed preflight

Before opening a writable SQLite handle, the ceremony:

1. requires the explicit bind kill-switch;
2. validates the xpub fingerprint;
3. validates the x402-XEC commit pin;
4. requires canonical absolute regular-file paths;
5. runs the existing XR1F-RO C3B read-only probe;
6. verifies the canonical x402-XEC module graph in an isolated Worker;
7. constructs the authenticated watch-only allocator.

If any preflight fails, no L1 schema or binding is written.

## Database mutation

The ceremony may perform only these reviewed mutations:

1. create `main.xr1f_l1_allocator_binding` and its immutability triggers if absent;
2. insert the single canonical allocator binding if C3B has no prior invoice history;
3. return the existing binding idempotently if it already matches.

It must fail closed if:

- C3B has invoice history but no allocator binding;
- another allocator identity is already bound;
- the binding schema is malformed;
- a caller-owned transaction already exists;
- any canonical artifact or xpub validation fails.

The ceremony does not allocate an invoice derivation index and does not call C3B invoice issuance.

## Production procedure

1. Review and merge the deployment-candidate PR.
2. On the VPS, update `/opt/xolosramirez` with `git pull --ff-only origin main`.
3. Confirm the checkout exact SHA equals the reviewed deployment SHA.
4. Confirm the canonical x402-XEC checkout/build under `/opt/x402-xec` matches commit `0f409dea...`.
5. Create/update `/etc/xolosramirez/xr1f-l1.env` with mode `0600`.
6. Create the dedicated system account/group `xr1f-l1` if absent.
7. Grant that account only the minimum filesystem access needed to open the existing C3B file and its SQLite WAL/SHM sidecars during the ceremony.
8. Install `deploy/systemd/xr1f-l1.service` to `/etc/systemd/system/xr1f-l1.service`.
9. Run `systemctl daemon-reload`.
10. Keep `XR1F_L1_BIND_ENABLED=false` and invoke the unit once; confirm it returns `XR1F_L1_BIND_DISABLED`.
11. Set `XR1F_L1_BIND_ENABLED=true` only for the reviewed binding window.
12. Run `systemctl start xr1f-l1.service`.
13. Inspect `systemctl status` and journal output. Require `WATCH_ONLY_ALLOCATOR_BOUND` and `realFundsAuthorized:false`.
14. Set `XR1F_L1_BIND_ENABLED=false` immediately after successful binding.
15. Run the unit again only if needed to prove the disabled state; do not leave the switch true.

## Evidence to retain

- reviewed xolosramirez deployment SHA
- canonical x402-XEC commit
- canonical allocator artifact hashes
- merchant xpub SHA-256 fingerprint, not the xpub itself in public evidence
- C3B read-only probe success
- allocatorId
- binding row public fields
- first-bind versus idempotent status
- systemd journal excerpt without the xpub
- proof that the kill-switch was returned to false

Successful completion means:

`WATCH_ONLY_ALLOCATOR_BOUND`

It never means:

- `REAL_FUNDS_READY`
- invoice issuance enabled
- settlement enabled
- signing enabled
- broadcast enabled
- custody enabled
