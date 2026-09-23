# X402-XR1F — Real Funds Boundary

Status: **BLOCKED BY DEFAULT**

XR1F is a separate gate from XR1W. XR1W being CLEAN_MOCK_ENV does **not** authorize production or real funds.

## Purpose

XR1F defines the minimum server-side conditions that must all be true before the Xolos Ramírez x402 flow may use live eCash settlement evidence.

## Mandatory conditions

1. Explicit REAL_FUNDS mode.
2. Separate human/review authorization with an approval ID.
3. NODE_ENV=production.
4. allowInsecureDevelopmentMode disabled.
5. Durable authoritative C3B invoice store.
6. Watch-only unique payTo allocator; static payTo forbidden.
7. Server-owned Chronik transaction provider.
8. No custom addressToScript hook.
9. Durable XR1D store with grant() + authorizeAccess().
10. Canonical origin: https://api.xolosramirez.com.
11. Frozen resource identity:
    - xolos:xilonen:verified-dossier:v1
    - 7de82337df5f68767c6c75206545cfe0e06eeaff6d15889547651eff972d930b

## Explicitly out of scope

This gate does not contain or authorize:
- private keys
- seed phrases
- wallet signing
- transaction construction
- transaction broadcast
- custody

Tonalli Wallet / the user-controlled wallet remains responsible for signing and broadcast.

## Required future evidence before authorization

- pinned production dependency build for canonical x402-XEC C3B
- durable C3B store restart/recovery test
- unique payTo allocator collision/restart tests
- server-owned live Chronik read-only connectivity smoke test
- one deliberately bounded real-funds transaction approved for the gate
- exact-head review of deployment wiring
- rollback/disable procedure
- monitoring for invoice issuance, PAID commits, XR1D grants, access denials, BUSY/LOCKED and Chronik failures

Until all of the above are reviewed, XR1F remains **BLOCKED**.
