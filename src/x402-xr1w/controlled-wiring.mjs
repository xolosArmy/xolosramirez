import {
  createXr1EntitlementGate,
  XR1_RESOURCE,
} from '../x402-xr1/entitlement.mjs';

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

function safeExpiresAt(settledAt, accessTtlSeconds) {
  if (
    typeof settledAt !== 'number' ||
    !Number.isSafeInteger(settledAt) ||
    settledAt < 0
  ) {
    return null;
  }
  if (
    typeof accessTtlSeconds !== 'number' ||
    !Number.isSafeInteger(accessTtlSeconds) ||
    accessTtlSeconds <= 0
  ) {
    return null;
  }
  if (settledAt > MAX_SAFE_INTEGER - accessTtlSeconds) {
    return null;
  }
  return settledAt + accessTtlSeconds;
}

function mapGrantFailure(result) {
  switch (result?.code) {
    case 'XR1D_BINDING_CONFLICT':
      return { ok: false, code: 'XR1W_BINDING_CONFLICT' };
    case 'XR1D_STORAGE_BUSY':
      return { ok: false, code: 'XR1W_STORAGE_BUSY' };
    case 'XR1D_STORAGE_CORRUPT':
    case 'XR1D_STORAGE_IO_FAILURE':
    case 'XR1D_STORAGE_FAILURE':
      return { ok: false, code: 'XR1W_STORAGE_FAILURE' };
    default:
      return { ok: false, code: 'XR1W_GRANT_REJECTED' };
  }
}

function mapAccessFailure(result) {
  switch (result?.code) {
    case 'XR1D_ACCESS_EXPIRED':
    case 'XR1D_ACCESS_NOT_FOUND_OR_MISMATCH':
      return { ok: false, code: 'XR1W_ACCESS_DENIED' };
    case 'XR1D_STORAGE_BUSY':
      return { ok: false, code: 'XR1W_STORAGE_BUSY' };
    case 'XR1D_STORAGE_CORRUPT':
    case 'XR1D_STORAGE_IO_FAILURE':
    case 'XR1D_STORAGE_FAILURE':
      return { ok: false, code: 'XR1W_STORAGE_FAILURE' };
    default:
      return { ok: false, code: 'XR1W_ACCESS_CHECK_FAILED' };
  }
}

function mapHttpStatus(code, inherited = 403) {
  switch (code) {
    case 'XR1W_BINDING_CONFLICT':
      return 409;
    case 'XR1W_STORAGE_BUSY':
    case 'XR1_DELIVERY_FAILED':
      return 503;
    case 'XR1W_STORAGE_FAILURE':
    case 'XR1W_INVALID_TTL':
    case 'XR1W_INVALID_SERVER_TIME':
    case 'XR1W_GRANT_REJECTED':
    case 'XR1W_ACCESS_CHECK_FAILED':
      return 500;
    case 'XR1W_ACCESS_DENIED':
      return 403;
    default:
      return inherited;
  }
}

function publicEntitlement(entitlement) {
  return Object.freeze({
    entitlementId: entitlement.entitlementId,
    resourceId: entitlement.resourceId,
    expiresAt: entitlement.expiresAt,
    status: entitlement.status,
  });
}

export function createXr1wControlledGate({
  store,
  computeResourceHash,
  handler,
  now,
  accessTtlSeconds,
  resource = XR1_RESOURCE,
}) {
  if (!store || store.isDurable !== true) {
    throw new TypeError('XR1W requires the durable XR1D entitlement store');
  }
  if (
    typeof store.grant !== 'function' ||
    typeof store.authorizeAccess !== 'function'
  ) {
    throw new TypeError('XR1W requires grant() and authorizeAccess()');
  }
  if (typeof computeResourceHash !== 'function') {
    throw new TypeError('XR1W requires canonical computeResourceHash');
  }
  if (typeof handler !== 'function') {
    throw new TypeError('XR1W requires a protected resource handler');
  }
  if (typeof now !== 'function') {
    throw new TypeError('XR1W requires an injected server clock');
  }
  if (
    typeof accessTtlSeconds !== 'number' ||
    !Number.isSafeInteger(accessTtlSeconds) ||
    accessTtlSeconds <= 0
  ) {
    throw new TypeError('XR1W accessTtlSeconds must be a positive safe integer');
  }

  const adapter = {
    isDurable: true,

    async grant(settlement, xr1Resource) {
      const expiresAt = safeExpiresAt(
        settlement?.settledAt,
        accessTtlSeconds,
      );
      if (expiresAt === null) {
        return { ok: false, code: 'XR1W_INVALID_TTL' };
      }

      const grant = store.grant({
        settlement,
        resource: xr1Resource,
        expiresAt,
      });
      if (!grant.ok) {
        return mapGrantFailure(grant);
      }

      let currentNow;
      try {
        currentNow = now();
      } catch {
        return { ok: false, code: 'XR1W_INVALID_SERVER_TIME' };
      }
      if (
        typeof currentNow !== 'number' ||
        !Number.isSafeInteger(currentNow) ||
        currentNow < 0
      ) {
        return { ok: false, code: 'XR1W_INVALID_SERVER_TIME' };
      }

      const access = store.authorizeAccess({
        entitlementId: grant.entitlement.entitlementId,
        resourceId: xr1Resource.resourceId,
        resourceHash: xr1Resource.resourceHash,
        now: currentNow,
      });
      if (!access.ok) {
        return mapAccessFailure(access);
      }

      return {
        ok: true,
        idempotent: grant.idempotent === true || grant.outcome === 'IDEMPOTENT',
        entitlement: access.entitlement,
      };
    },
  };

  const xr1Gate = createXr1EntitlementGate({
    store: adapter,
    computeResourceHash,
    resource,
    handler: async (entitlement) =>
      handler(publicEntitlement(entitlement)),
  });

  return async function xr1wControlledGate(request) {
    const result = await xr1Gate(request);

    if (!result.ok) {
      return {
        ok: false,
        code: result.code,
        httpStatus: mapHttpStatus(result.code, result.httpStatus),
      };
    }

    return {
      ok: true,
      status: 'UNLOCKED',
      httpStatus: 200,
      idempotent: result.idempotent,
      entitlement: publicEntitlement(result.entitlement),
      payload: result.payload,
    };
  };
}

export function clearInternalX402Authority(request) {
  if (!request || typeof request !== 'object') {
    throw new TypeError('XR1W requires a request object');
  }
  delete request.x402;
  delete request.x402Settlement;
  return request;
}
