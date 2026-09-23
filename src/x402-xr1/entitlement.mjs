import { createHash } from 'node:crypto';

export const XR1_RESOURCE = Object.freeze({
  resourceId: 'xolos:xilonen:verified-dossier:v1',
  serverOrigin: 'https://api.xolosramirez.com',
  method: 'GET',
  path: '/v1/xolos/xilonen/verified-dossier',
  resourceHash: '7de82337df5f68767c6c75206545cfe0e06eeaff6d15889547651eff972d930b'
});

const HEX_64 = /^[0-9a-f]{64}$/;

export class Xr1GateError extends Error {
  constructor(code, message, httpStatus = 403) {
    super(message);
    this.name = 'Xr1GateError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function fail(code, message, httpStatus) {
  throw new Xr1GateError(code, message, httpStatus);
}

function assertHash(value, field) {
  if (typeof value !== 'string' || !HEX_64.test(value)) {
    fail('XR1_INVALID_C3B_EVIDENCE', `${field} must be lowercase 64-char hex`, 500);
  }
  return value;
}

function assertTimestamp(value, field) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail('XR1_INVALID_C3B_EVIDENCE', `${field} must be a non-negative safe integer`, 500);
  }
  return value;
}

/**
 * TRUST BOUNDARY: c3bResult MUST be the in-process result attached by the
 * canonical x402-XEC settlement middleware after verification. Never pass a
 * client-supplied body/header object into this function.
 *
 * Narrow projection from canonical x402-XEC Gate C3B success into the only
 * settlement evidence Xolos Ramírez needs to grant an XR1 entitlement.
 *
 * This intentionally drops transaction outputs, payTo, amount, vout and every
 * signing/broadcast detail. Xolos does not independently re-verify Chronik.
 */
export function projectC3BSettlement(c3bResult, expectedResource = XR1_RESOURCE) {
  if (!c3bResult || typeof c3bResult !== 'object') {
    fail('XR1_C3B_NOT_UNLOCKED', 'Missing C3B settlement result');
  }
  if (c3bResult.ok !== true || c3bResult.status !== 'UNLOCKED') {
    fail('XR1_C3B_NOT_UNLOCKED', 'C3B has not authorized resource unlock');
  }

  const invoice = c3bResult.invoice;
  const proof = c3bResult.proof;
  if (!invoice || typeof invoice !== 'object' || !proof || typeof proof !== 'object') {
    fail('XR1_INVALID_C3B_EVIDENCE', 'C3B success is missing invoice or proof', 500);
  }

  if (invoice.state !== 'PAID') {
    fail('XR1_INVOICE_NOT_PAID', 'C3B invoice is not in PAID state');
  }
  if (invoice.network !== 'xec:mainnet' || proof.network !== 'xec:mainnet') {
    fail('XR1_NETWORK_MISMATCH', 'XR1 accepts only canonical xec:mainnet C3B evidence');
  }
  if (invoice.scheme !== 'exact') {
    fail('XR1_SCHEME_MISMATCH', 'XR1 accepts only canonical exact settlement');
  }
  if (proof.x402Version !== 1) {
    fail('XR1_VERSION_MISMATCH', 'XR1 requires x402-XEC C3B x402Version 1');
  }

  const invoiceHash = assertHash(invoice.invoiceHash, 'invoice.invoiceHash');
  const proofInvoiceHash = assertHash(proof.invoiceHash, 'proof.invoiceHash');
  const settledTxid = assertHash(invoice.settledTxid, 'invoice.settledTxid');
  const proofTxid = assertHash(proof.txid, 'proof.txid');
  const resourceHash = assertHash(invoice.resourceHash, 'invoice.resourceHash');
  const settledAt = assertTimestamp(invoice.settledAt, 'invoice.settledAt');

  if (invoiceHash !== proofInvoiceHash) {
    fail('XR1_INVOICE_BINDING_MISMATCH', 'C3B proof does not bind to the paid invoice');
  }
  if (settledTxid !== proofTxid) {
    fail('XR1_TXID_BINDING_MISMATCH', 'C3B proof txid does not match the paid invoice');
  }
  if (resourceHash !== expectedResource.resourceHash) {
    fail('XR1_RESOURCE_MISMATCH', 'C3B invoice was paid for a different resource');
  }

  return Object.freeze({
    version: 'x402-xr1/1',
    status: 'PAID',
    network: 'xec:mainnet',
    invoiceHash,
    txid: proofTxid,
    resourceHash,
    settledAt
  });
}

function entitlementId(resourceId, invoiceHash, txid) {
  return 'xr1-' + createHash('sha256')
    .update(`${resourceId}\0${invoiceHash}\0${txid}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
}

export class InMemoryXr1EntitlementStore {
  readonly = undefined;
  isDurable = false;

  #byInvoice = new Map();
  #byTxid = new Map();
  #lock = Promise.resolve();

  async #withLock(fn) {
    const next = this.#lock.then(fn);
    this.#lock = next.then(() => undefined, () => undefined);
    return next;
  }

  async getByInvoiceHash(invoiceHash) {
    return this.#withLock(() => {
      const value = this.#byInvoice.get(invoiceHash);
      return value ? { ...value } : null;
    });
  }

  async grant(settlement, resource = XR1_RESOURCE) {
    return this.#withLock(() => {
      if (!settlement || settlement.version !== 'x402-xr1/1' || settlement.status !== 'PAID') {
        return { ok: false, code: 'XR1_INVALID_SETTLEMENT_VIEW' };
      }
      if (settlement.network !== 'xec:mainnet') {
        return { ok: false, code: 'XR1_NETWORK_MISMATCH' };
      }
      if (settlement.resourceHash !== resource.resourceHash) {
        return { ok: false, code: 'XR1_RESOURCE_MISMATCH' };
      }

      const existingForInvoice = this.#byInvoice.get(settlement.invoiceHash);
      if (existingForInvoice) {
        if (
          existingForInvoice.txid === settlement.txid &&
          existingForInvoice.resourceHash === settlement.resourceHash &&
          existingForInvoice.resourceId === resource.resourceId
        ) {
          return { ok: true, idempotent: true, entitlement: { ...existingForInvoice } };
        }
        return { ok: false, code: 'XR1_INVOICE_CONFLICT' };
      }

      const invoiceForTxid = this.#byTxid.get(settlement.txid);
      if (invoiceForTxid && invoiceForTxid !== settlement.invoiceHash) {
        return { ok: false, code: 'XR1_TXID_REPLAY' };
      }

      const record = Object.freeze({
        entitlementId: entitlementId(resource.resourceId, settlement.invoiceHash, settlement.txid),
        resourceId: resource.resourceId,
        resourceHash: settlement.resourceHash,
        invoiceHash: settlement.invoiceHash,
        txid: settlement.txid,
        grantedAt: settlement.settledAt,
        status: 'ACTIVE'
      });

      this.#byInvoice.set(settlement.invoiceHash, record);
      this.#byTxid.set(settlement.txid, settlement.invoiceHash);
      return { ok: true, idempotent: false, entitlement: { ...record } };
    });
  }
}

export function assertProductionEntitlementStore(store) {
  if (!store || store.isDurable !== true) {
    fail(
      'XR1_DURABLE_STORE_REQUIRED',
      'Production XR1 requires a durable entitlement store; the in-memory store is test/development only',
      500
    );
  }
}

/**
 * Gate wrapper: the protected handler is invoked only after C3B projection
 * succeeds and the entitlement is committed.
 */
export async function unlockXr1Resource({
  c3bResult,
  clientProof,
  store,
  handler,
  resource = XR1_RESOURCE
}) {
  // XR1 never accepts client payment evidence directly. The client proof must
  // first pass through canonical C3B middleware, which supplies c3bResult.
  if (clientProof !== undefined) {
    return { ok: false, code: 'XR1_DIRECT_CLIENT_PROOF_FORBIDDEN', httpStatus: 400 };
  }
  if (!store || typeof store.grant !== 'function') {
    return { ok: false, code: 'XR1_STORE_UNAVAILABLE', httpStatus: 500 };
  }
  if (typeof handler !== 'function') {
    return { ok: false, code: 'XR1_HANDLER_INVALID', httpStatus: 500 };
  }

  let settlement;
  try {
    settlement = projectC3BSettlement(c3bResult, resource);
  } catch (error) {
    if (error instanceof Xr1GateError) {
      return { ok: false, code: error.code, httpStatus: error.httpStatus };
    }
    return { ok: false, code: 'XR1_INTERNAL_ERROR', httpStatus: 500 };
  }

  const grant = await store.grant(settlement, resource);
  if (!grant.ok) {
    const status = grant.code === 'XR1_INVOICE_CONFLICT' || grant.code === 'XR1_TXID_REPLAY' ? 409 : 403;
    return { ok: false, code: grant.code, httpStatus: status };
  }

  try {
    const payload = await handler({ ...grant.entitlement });
    return {
      ok: true,
      status: 'UNLOCKED',
      idempotent: grant.idempotent,
      entitlement: grant.entitlement,
      payload
    };
  } catch {
    // Entitlement stays committed. A retry with the same paid invoice is
    // idempotent and does not require repayment.
    return {
      ok: false,
      code: 'XR1_DELIVERY_FAILED',
      httpStatus: 503,
      entitlement: grant.entitlement
    };
  }
}
