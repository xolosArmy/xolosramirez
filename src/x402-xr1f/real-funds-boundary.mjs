export const XR1F_MODE = Object.freeze({
  CONTROLLED: 'CONTROLLED',
  REAL_FUNDS: 'REAL_FUNDS',
});

export class Xr1fBoundaryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'Xr1fBoundaryError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new Xr1fBoundaryError(code, message);
}

function assertObject(value, field) {
  if (!value || typeof value !== 'object') {
    fail('XR1F_INVALID_CONFIG', `${field} must be an object`);
  }
  return value;
}

function assertExplicitTrue(value, field) {
  if (value !== true) {
    fail('XR1F_NOT_AUTHORIZED', `${field} must be explicitly true`);
  }
}

export function assertRealFundsBoundary(config) {
  assertObject(config, 'config');

  if (config.mode !== XR1F_MODE.REAL_FUNDS) {
    fail(
      'XR1F_CONTROLLED_ONLY',
      'Real-funds wiring is blocked unless mode is explicitly REAL_FUNDS',
    );
  }

  assertExplicitTrue(
    config.authorization?.approved,
    'authorization.approved',
  );

  if (
    typeof config.authorization?.approvalId !== 'string' ||
    config.authorization.approvalId.trim() === ''
  ) {
    fail(
      'XR1F_NOT_AUTHORIZED',
      'authorization.approvalId is required for real-funds wiring',
    );
  }

  if (config.nodeEnv !== 'production') {
    fail(
      'XR1F_PRODUCTION_ENV_REQUIRED',
      'Real-funds wiring requires NODE_ENV=production',
    );
  }

  if (config.allowInsecureDevelopmentMode === true) {
    fail(
      'XR1F_INSECURE_MODE_FORBIDDEN',
      'allowInsecureDevelopmentMode must be false/absent for real funds',
    );
  }

  if (config.c3bStore?.isDurable !== true) {
    fail(
      'XR1F_DURABLE_C3B_STORE_REQUIRED',
      'Real funds require a durable authoritative C3B store',
    );
  }

  if (
    !config.payToAllocator ||
    typeof config.payToAllocator.allocate !== 'function'
  ) {
    fail(
      'XR1F_PAYTO_ALLOCATOR_REQUIRED',
      'Real funds require a watch-only unique payTo allocator',
    );
  }

  if (
    !config.txProvider ||
    !(
      typeof config.txProvider.getTx === 'function' ||
      typeof config.txProvider.tx === 'function'
    )
  ) {
    fail(
      'XR1F_SERVER_CHRONIK_REQUIRED',
      'Real funds require a server-owned Chronik transaction provider',
    );
  }

  if (config.addressToScript !== undefined) {
    fail(
      'XR1F_CUSTOM_SCRIPT_CONVERTER_FORBIDDEN',
      'Custom addressToScript hooks are forbidden for real funds',
    );
  }

  if (config.staticPayTo !== undefined) {
    fail(
      'XR1F_STATIC_PAYTO_FORBIDDEN',
      'Static payTo is forbidden for real funds',
    );
  }

  if (
    !config.xr1dStore ||
    config.xr1dStore.isDurable !== true ||
    typeof config.xr1dStore.grant !== 'function' ||
    typeof config.xr1dStore.authorizeAccess !== 'function'
  ) {
    fail(
      'XR1F_DURABLE_XR1D_REQUIRED',
      'Real funds require the durable XR1D entitlement store',
    );
  }

  if (
    typeof config.publicOrigin !== 'string' ||
    config.publicOrigin !== 'https://api.xolosramirez.com'
  ) {
    fail(
      'XR1F_CANONICAL_ORIGIN_REQUIRED',
      'Real funds require the frozen canonical api.xolosramirez.com origin',
    );
  }

  if (
    config.resource?.resourceId !== 'xolos:xilonen:verified-dossier:v1' ||
    config.resource?.resourceHash !==
      '7de82337df5f68767c6c75206545cfe0e06eeaff6d15889547651eff972d930b'
  ) {
    fail(
      'XR1F_CANONICAL_RESOURCE_REQUIRED',
      'Real funds require the frozen XR1 resource identity and hash',
    );
  }

  return Object.freeze({
    ok: true,
    mode: XR1F_MODE.REAL_FUNDS,
    approvalId: config.authorization.approvalId,
    production: true,
  });
}

export function assertControlledBoundary(config = {}) {
  if (config.mode === XR1F_MODE.REAL_FUNDS) {
    fail(
      'XR1F_REAL_FUNDS_REQUIRES_SEPARATE_ASSERTION',
      'Use assertRealFundsBoundary() for any REAL_FUNDS configuration',
    );
  }

  return Object.freeze({
    ok: true,
    mode: XR1F_MODE.CONTROLLED,
    realFundsAuthorized: false,
  });
}
