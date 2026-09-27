import { assertWatchOnlyAllocator } from '../x402-xr1f-l1/allocator.mjs';
import { assertAllocatorBinding } from '../x402-xr1f-l1/binding.mjs';
import { resolve } from 'node:path';

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

function authoritativeC3bDb(store) {
  if (
    !store?.db ||
    typeof store.db.prepare !== 'function' ||
    typeof store.db.exec !== 'function'
  ) {
    fail(
      'XR1F_C3B_DB_REQUIRED',
      'Durable C3B store must expose its authoritative SQLite handle',
    );
  }

  if (
    typeof store.databasePath !== 'string' ||
    store.databasePath.trim() === ''
  ) {
    fail(
      'XR1F_C3B_STORE_IDENTITY_REQUIRED',
      'Durable C3B store must expose its authoritative databasePath',
    );
  }

  let rows;
  try {
    rows = store.db.prepare('PRAGMA database_list').all();
  } catch {
    fail(
      'XR1F_C3B_STORE_IDENTITY_MISMATCH',
      'Unable to verify durable C3B database identity',
    );
  }

  const main = rows.find(row => row?.name === 'main');
  if (
    !main ||
    typeof main.file !== 'string' ||
    main.file.trim() === '' ||
    resolve(main.file) !== resolve(store.databasePath)
  ) {
    fail(
      'XR1F_C3B_STORE_IDENTITY_MISMATCH',
      'Durable C3B store handle does not match its authoritative databasePath',
    );
  }

  return store.db;
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

  try {
    assertWatchOnlyAllocator(config.payToAllocator);
  } catch {
    fail(
      'XR1F_PAYTO_ALLOCATOR_REQUIRED',
      'Real-funds boundary requires an authenticated XR1F-L1 watch-only allocator',
    );
  }

  if (config.c3bDb !== undefined) {
    fail(
      'XR1F_DETACHED_C3B_DB_FORBIDDEN',
      'Detached config.c3bDb is forbidden; binding verification must use c3bStore.db',
    );
  }

  const c3bDb = authoritativeC3bDb(config.c3bStore);

  try {
    assertAllocatorBinding(c3bDb, config.payToAllocator);
  } catch {
    fail(
      'XR1F_PAYTO_BINDING_REQUIRED',
      'Real-funds boundary requires the authenticated allocator to match the durable C3B binding',
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
    allocatorAuthenticated: true,
    allocatorBindingVerified: true,
    realFundsAuthorized: false,
    invoiceIssuanceAuthorized: false,
    signingAuthorized: false,
    broadcastAuthorized: false,
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
