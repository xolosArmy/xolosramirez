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

function projectC3BSettlement(c3bResult, expectedResourceHash) {
  if (!c3bResult || typeof c3bResult !== 'object') {
    fail('XR1_C3B_NOT_UNLOCKED', 'Missing internal C3B settlement result');
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
  if (resourceHash !== expectedResourceHash) {
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

function requestResource(request) {
  if (!request || typeof request !== 'object') {
    fail('XR1_REQUEST_INVALID', 'XR1 requires a server request object', 500);
  }

  const method = typeof request.method === 'string' ? request.method.toUpperCase() : '';
  const rawUrl = request.originalUrl ?? request.url ?? request.path;
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
    fail('XR1_REQUEST_INVALID', 'XR1 request URL is unavailable', 500);
  }

  let url;
  try {
    url = new URL(rawUrl, XR1_RESOURCE.serverOrigin);
  } catch {
    fail('XR1_REQUEST_INVALID', 'XR1 request URL is malformed', 400);
  }

  if (method !== XR1_RESOURCE.method || url.pathname !== XR1_RESOURCE.path) {
    fail('XR1_RESOURCE_MISMATCH', 'Request does not target the frozen XR1 resource', 403);
  }
  if (url.search !== '' || url.hash !== '') {
    fail('XR1_RESOURCE_MISMATCH', 'XR1 v1 does not permit query or fragment variants', 403);
  }
  if (request.body !== undefined && request.body !== null) {
    fail('XR1_RESOURCE_MISMATCH', 'XR1 v1 GET resource does not permit a request body', 403);
  }

  return Object.freeze({
    serverOrigin: XR1_RESOURCE.serverOrigin,
    method: XR1_RESOURCE.method,
    path: XR1_RESOURCE.path
  });
}

/**
 * Creates the XR1 server-side gate that MUST be mounted after canonical
 * x402-XEC Gate C3B middleware.
 *
 * SECURITY BOUNDARY:
 * - Client headers/body are never accepted as settlement evidence.
 * - The only settlement authority is request.x402Settlement, an in-process
 *   server property attached by the upstream C3B middleware after PAID commit.
 * - Resource hashing is delegated to canonical x402-XEC computeResourceHash,
 *   injected as computeResourceHash. XR1 does not reimplement canonical hashing.
 */
export function createXr1EntitlementGate({
  store,
  handler,
  computeResourceHash,
  resource = XR1_RESOURCE
}) {
  if (!store || typeof store.grant !== 'function') {
    fail('XR1_STORE_UNAVAILABLE', 'XR1 entitlement store is unavailable', 500);
  }
  if (typeof handler !== 'function') {
    fail('XR1_HANDLER_INVALID', 'XR1 protected handler is invalid', 500);
  }
  if (typeof computeResourceHash !== 'function') {
    fail(
      'XR1_CANONICAL_HASHER_REQUIRED',
      'XR1 requires canonical x402-XEC computeResourceHash at runtime',
      500
    );
  }

  return async function xr1EntitlementGate(request) {
    let runtimeResourceHash;
    let settlement;
    try {
      const runtimeResource = requestResource(request);
      runtimeResourceHash = assertHash(
        computeResourceHash(runtimeResource),
        'runtimeResourceHash'
      );
      if (runtimeResourceHash !== resource.resourceHash) {
        fail('XR1_RESOURCE_MISMATCH', 'Runtime canonical resource hash does not match frozen XR1 resource');
      }

      // Deliberately read only the server-side property populated by C3B.
      // request.body, payment-proof headers, query params and client-provided
      // objects can never substitute for this value.
      settlement = projectC3BSettlement(request.x402Settlement, runtimeResourceHash);
    } catch (error) {
      if (error instanceof Xr1GateError) {
        return { ok: false, code: error.code, httpStatus: error.httpStatus };
      }
      return { ok: false, code: 'XR1_INTERNAL_ERROR', httpStatus: 500 };
    }

    const grant = await store.grant(settlement, resource);
    if (!grant.ok) {
      const status = grant.code === 'XR1_INVOICE_CONFLICT' || grant.code === 'XR1_TXID_REPLAY'
        ? 409
        : 403;
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
      // Entitlement remains committed. Same paid invoice can retry idempotently
      // without a second payment.
      return {
        ok: false,
        code: 'XR1_DELIVERY_FAILED',
        httpStatus: 503,
        entitlement: grant.entitlement
      };
    }
  };
}
