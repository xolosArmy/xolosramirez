# X402-XR1: Controlled Verified Dossier Entitlement

**Milestone:** `X402-XR1 — Controlled Paid Resource / Entitlement Integration`  
**Status:** `ACTIVE / IMPLEMENTATION CANDIDATE`  
**Date activated:** 2026-09-23  
**Protected resource:** `Verified Public Xolo Dossier — Xilonen Ramírez`

## 1. Scope

XR1 converts the design-only XR0 dossier into one narrowly scoped, non-production entitlement flow.

Canonical resource identity:

- resourceId: `xolos:xilonen:verified-dossier:v1`
- origin: `https://api.xolosramirez.com`
- method: `GET`
- path: `/v1/xolos/xilonen/verified-dossier`
- C3B resourceHash: `7de82337df5f68767c6c75206545cfe0e06eeaff6d15889547651eff972d930b`

The resource remains a machine-readable verified dossier. Public profile information remains free.

## 2. Canonical upstream authority

XR1 consumes only canonical x402-XEC Gate C3B settlement results.

The accepted C3B proof contract is:

```json
{
  "x402Version": 1,
  "network": "xec:mainnet",
  "invoiceHash": "<64 lowercase hex>",
  "txid": "<64 lowercase hex>"
}
```

C3B is responsible for:

- issuing the authoritative invoice;
- exact resource binding;
- payment destination allocation;
- amount semantics;
- server-owned Chronik verification;
- finality/confirmation checks;
- replay protection at settlement;
- atomic transition to `PAID`.

XR1 does not duplicate those checks.

## 3. XR1 authority boundary

Xolos Ramírez receives no:

- private keys;
- mnemonic/WIF;
- Signatory;
- raw signed transaction;
- transaction builder;
- signing authority;
- broadcast authority.

Tonalli Wallet remains the signer/broadcaster. x402-XEC remains settlement verifier. XR1 only converts canonical `PAID` evidence into the scoped entitlement.

## 4. Narrow settlement projection

XR1 deliberately projects the larger C3B success object into:

```json
{
  "version": "x402-xr1/1",
  "status": "PAID",
  "network": "xec:mainnet",
  "invoiceHash": "<hash>",
  "txid": "<txid>",
  "resourceHash": "<hash>",
  "settledAt": 0
}
```

No amount, payTo, vout, outputs, raw transaction or signing material crosses the XR1 boundary.

## 5. Entitlement semantics

A successful grant binds:

```text
invoiceHash + txid + canonical resourceHash
        ↓
xolos:xilonen:verified-dossier:v1
        ↓
ACTIVE entitlement
```

Required behavior:

1. Same invoice + same txid + same resource is idempotent.
2. Same invoice + competing txid is rejected.
3. Same txid + different invoice is rejected.
4. Wrong resourceHash is rejected.
5. The protected handler is unreachable before C3B `UNLOCKED` and invoice `PAID`.
6. Delivery failure does not revoke payment or require repayment; the entitlement remains reusable.
7. Production requires a durable entitlement store.

## 6. Non-production restriction

The current `InMemoryXr1EntitlementStore` is test/development only and has `isDurable = false`.

No real-funds production deployment is authorized by this milestone. Production requires a separately reviewed durable store and deployment configuration.

The historical `500000` amount in XR0 fixtures remains test data only. XR1 does not set a commercial price or payment address; those are server-authoritative x402-XEC invoice concerns.

## 7. Acceptance gate

Before merge or any production authorization:

- XR1 suite passes;
- existing Xolos Ramírez tests pass;
- exact-HEAD independent review is clean;
- no signing/broadcast authority appears in XR1;
- no production deployment or real funds occur.
