import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const HEX_64 = /^[0-9a-f]{64}$/;
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

const SQLITE_BUSY = 5;
const SQLITE_LOCKED = 6;
const SQLITE_READONLY = 8;
const SQLITE_IOERR = 10;
const SQLITE_CORRUPT = 11;
const SQLITE_FULL = 13;
const SQLITE_CANTOPEN = 14;
const SQLITE_CONSTRAINT = 19;
const SQLITE_NOTADB = 26;
const SQLITE_CONSTRAINT_PRIMARYKEY = 1555;
const SQLITE_CONSTRAINT_UNIQUE = 2067;

export class Xr1dStoreError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'Xr1dStoreError';
    this.code = code;
    this.retryable = options.retryable === true;
    this.cause = options.cause;
  }
}

function primarySqliteCode(errcode) {
  return Number.isInteger(errcode) ? (errcode & 0xff) : null;
}

function isUniqueConstraint(error) {
  const errcode = error?.errcode;
  if (errcode === SQLITE_CONSTRAINT_UNIQUE || errcode === SQLITE_CONSTRAINT_PRIMARYKEY) {
    return true;
  }
  return (
    primarySqliteCode(errcode) === SQLITE_CONSTRAINT &&
    /(?:UNIQUE constraint failed|PRIMARY KEY|SQLITE_CONSTRAINT_UNIQUE|SQLITE_CONSTRAINT_PRIMARYKEY)/i.test(
      String(error?.message ?? ''),
    )
  );
}

function classifySqliteError(error) {
  const primary = primarySqliteCode(error?.errcode);

  if (primary === SQLITE_BUSY || primary === SQLITE_LOCKED) {
    return {
      code: 'XR1D_STORAGE_BUSY',
      retryable: true,
      kind: 'retryable',
    };
  }

  if (primary === SQLITE_CORRUPT || primary === SQLITE_NOTADB) {
    return {
      code: 'XR1D_STORAGE_CORRUPT',
      retryable: false,
      kind: 'storage-failure',
    };
  }

  if (
    primary === SQLITE_IOERR ||
    primary === SQLITE_READONLY ||
    primary === SQLITE_FULL ||
    primary === SQLITE_CANTOPEN
  ) {
    return {
      code: 'XR1D_STORAGE_IO_FAILURE',
      retryable: false,
      kind: 'storage-failure',
    };
  }

  return {
    code: 'XR1D_STORAGE_FAILURE',
    retryable: false,
    kind: 'storage-failure',
  };
}

function validateHash(value, field) {
  if (typeof value !== 'string' || !HEX_64.test(value)) {
    throw new Xr1dStoreError(
      'XR1D_INVALID_GRANT',
      `${field} must be lowercase 64-character hex`,
    );
  }
  return value;
}

function validateTimestamp(value, field) {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_SAFE_INTEGER
  ) {
    throw new Xr1dStoreError(
      'XR1D_INVALID_GRANT',
      `${field} must be a non-negative safe integer`,
    );
  }
  return value;
}

function normalizeGrantInput(input) {
  if (!input || typeof input !== 'object') {
    throw new Xr1dStoreError('XR1D_INVALID_GRANT', 'grant input must be an object');
  }

  const { settlement, resource, expiresAt } = input;

  if (
    !settlement ||
    typeof settlement !== 'object' ||
    settlement.version !== 'x402-xr1/1' ||
    settlement.status !== 'PAID' ||
    settlement.network !== 'xec:mainnet'
  ) {
    throw new Xr1dStoreError(
      'XR1D_INVALID_GRANT',
      'grant requires a validated XR1 PAID settlement projection',
    );
  }

  if (
    !resource ||
    typeof resource !== 'object' ||
    typeof resource.resourceId !== 'string' ||
    resource.resourceId.length < 1 ||
    resource.resourceId.length > 256
  ) {
    throw new Xr1dStoreError('XR1D_INVALID_GRANT', 'resourceId is invalid');
  }

  const invoiceHash = validateHash(settlement.invoiceHash, 'settlement.invoiceHash');
  const txid = validateHash(settlement.txid, 'settlement.txid');
  const settlementResourceHash = validateHash(
    settlement.resourceHash,
    'settlement.resourceHash',
  );
  const resourceHash = validateHash(resource.resourceHash, 'resource.resourceHash');
  const grantedAt = validateTimestamp(settlement.settledAt, 'settlement.settledAt');
  const normalizedExpiresAt = validateTimestamp(expiresAt, 'expiresAt');

  if (settlementResourceHash !== resourceHash) {
    throw new Xr1dStoreError(
      'XR1D_INVALID_GRANT',
      'resourceHash must match the validated XR1 settlement projection',
    );
  }

  if (normalizedExpiresAt <= grantedAt) {
    throw new Xr1dStoreError(
      'XR1D_INVALID_GRANT',
      'expiresAt must be strictly greater than grantedAt',
    );
  }

  const entitlementId =
    'xr1-' +
    createHash('sha256')
      .update(
        `${resource.resourceId}\0${invoiceHash}\0${txid}`,
        'utf8',
      )
      .digest('hex')
      .slice(0, 32);

  return Object.freeze({
    entitlementId,
    invoiceHash,
    txid,
    resourceId: resource.resourceId,
    resourceHash,
    grantedAt,
    expiresAt: normalizedExpiresAt,
  });
}

function rowToEntitlement(row) {
  if (!row) return null;
  return Object.freeze({
    entitlementId: row.entitlement_id,
    invoiceHash: row.invoice_hash,
    txid: row.txid,
    resourceId: row.resource_id,
    resourceHash: row.resource_hash,
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
    status: row.status,
  });
}

function sameImmutableGrant(existing, candidate) {
  return (
    existing.entitlementId === candidate.entitlementId &&
    existing.invoiceHash === candidate.invoiceHash &&
    existing.txid === candidate.txid &&
    existing.resourceId === candidate.resourceId &&
    existing.resourceHash === candidate.resourceHash &&
    existing.grantedAt === candidate.grantedAt &&
    existing.expiresAt === candidate.expiresAt
  );
}

export class SqliteXr1dEntitlementStore {
  isDurable = true;

  #db;
  #insert;
  #findCollisions;
  #findByEntitlementId;
  #expireIfDue;
  #closed = false;

  constructor({ path }) {
    if (
      typeof path !== 'string' ||
      path.trim() === '' ||
      path === ':memory:' ||
      path.startsWith('file::memory:')
    ) {
      throw new Xr1dStoreError(
        'XR1D_DURABLE_PATH_REQUIRED',
        'XR1D Step 2 requires an explicit durable SQLite file path',
      );
    }

    let db;
    try {
      db = new DatabaseSync(path);
      db.exec('PRAGMA foreign_keys = ON;');
      db.exec('PRAGMA busy_timeout = 0;');

      const version = db.prepare('PRAGMA user_version').get()?.user_version;
      if (version !== 1) {
        throw new Xr1dStoreError(
          'XR1D_SCHEMA_VERSION_MISMATCH',
          `XR1D schema version 1 required; found ${String(version)}`,
        );
      }

      this.#insert = db.prepare(
        `INSERT INTO xr1_entitlements (
          entitlement_id,
          invoice_hash,
          txid,
          resource_id,
          resource_hash,
          granted_at,
          expires_at,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      );

      this.#findCollisions = db.prepare(
        `SELECT
          entitlement_id,
          invoice_hash,
          txid,
          resource_id,
          resource_hash,
          granted_at,
          expires_at,
          status
        FROM xr1_entitlements
        WHERE entitlement_id = ? OR invoice_hash = ? OR txid = ?`,
      );

      this.#findByEntitlementId = db.prepare(
        `SELECT
          entitlement_id,
          invoice_hash,
          txid,
          resource_id,
          resource_hash,
          granted_at,
          expires_at,
          status
        FROM xr1_entitlements
        WHERE entitlement_id = ?`,
      );

      this.#expireIfDue = db.prepare(
        `UPDATE xr1_entitlements
        SET status = 'EXPIRED'
        WHERE entitlement_id = ?
          AND status = 'ACTIVE'
          AND expires_at <= ?`,
      );

      this.#db = db;
    } catch (error) {
      try {
        db?.close();
      } catch {}

      if (error instanceof Xr1dStoreError) {
        throw error;
      }

      const classified = classifySqliteError(error);
      throw new Xr1dStoreError(
        classified.code,
        'Failed to open or validate XR1D durable store',
        {
          retryable: classified.retryable,
          cause: error,
        },
      );
    }
  }

  close() {
    if (!this.#closed) {
      this.#db.close();
      this.#closed = true;
    }
  }

  grant(input) {
    let candidate;
    try {
      candidate = normalizeGrantInput(input);
    } catch (error) {
      if (error instanceof Xr1dStoreError) {
        return {
          ok: false,
          outcome: 'INVALID',
          code: error.code,
          retryable: false,
        };
      }
      return {
        ok: false,
        outcome: 'STORAGE_FAILURE',
        code: 'XR1D_STORAGE_FAILURE',
        retryable: false,
      };
    }

    let transactionStarted = false;

    try {
      this.#db.exec('BEGIN IMMEDIATE');
      transactionStarted = true;

      this.#insert.run(
        candidate.entitlementId,
        candidate.invoiceHash,
        candidate.txid,
        candidate.resourceId,
        candidate.resourceHash,
        candidate.grantedAt,
        candidate.expiresAt,
      );

      this.#db.exec('COMMIT');
      transactionStarted = false;

      return {
        ok: true,
        outcome: 'CREATED',
        idempotent: false,
        entitlement: Object.freeze({
          ...candidate,
          status: 'ACTIVE',
        }),
      };
    } catch (error) {
      if (transactionStarted) {
        try {
          this.#db.exec('ROLLBACK');
        } catch {}
      }

      if (isUniqueConstraint(error)) {
        return this.#resolveConstraintCollision(candidate);
      }

      const classified = classifySqliteError(error);
      return {
        ok: false,
        outcome:
          classified.kind === 'retryable' ? 'RETRYABLE' : 'STORAGE_FAILURE',
        code: classified.code,
        retryable: classified.retryable,
      };
    }
  }


  authorizeAccess(input) {
    let entitlementId;
    let resourceId;
    let resourceHash;
    let now;

    try {
      if (!input || typeof input !== 'object') {
        throw new Xr1dStoreError(
          'XR1D_INVALID_ACCESS_CHECK',
          'authorizeAccess input must be an object',
        );
      }

      entitlementId = input.entitlementId;
      resourceId = input.resourceId;
      resourceHash = validateHash(input.resourceHash, 'resourceHash');
      now = validateTimestamp(input.now, 'now');

      if (
        typeof entitlementId !== 'string' ||
        entitlementId.length < 8 ||
        entitlementId.length > 128
      ) {
        throw new Xr1dStoreError(
          'XR1D_INVALID_ACCESS_CHECK',
          'entitlementId is invalid',
        );
      }

      if (
        typeof resourceId !== 'string' ||
        resourceId.length < 1 ||
        resourceId.length > 256
      ) {
        throw new Xr1dStoreError(
          'XR1D_INVALID_ACCESS_CHECK',
          'resourceId is invalid',
        );
      }
    } catch (error) {
      return {
        ok: false,
        outcome: 'INVALID',
        code:
          error instanceof Xr1dStoreError
            ? error.code
            : 'XR1D_INVALID_ACCESS_CHECK',
        retryable: false,
      };
    }

    let transactionStarted = false;

    try {
      this.#db.exec('BEGIN IMMEDIATE');
      transactionStarted = true;

      let existing = rowToEntitlement(
        this.#findByEntitlementId.get(entitlementId),
      );

      if (
        !existing ||
        existing.resourceId !== resourceId ||
        existing.resourceHash !== resourceHash
      ) {
        this.#db.exec('COMMIT');
        transactionStarted = false;
        return {
          ok: false,
          outcome: 'DENIED',
          code: 'XR1D_ACCESS_NOT_FOUND_OR_MISMATCH',
          retryable: false,
        };
      }

      if (existing.status === 'EXPIRED') {
        this.#db.exec('COMMIT');
        transactionStarted = false;
        return {
          ok: false,
          outcome: 'DENIED',
          code: 'XR1D_ACCESS_EXPIRED',
          retryable: false,
          entitlement: existing,
        };
      }

      if (existing.status !== 'ACTIVE') {
        this.#db.exec('ROLLBACK');
        transactionStarted = false;
        return {
          ok: false,
          outcome: 'STORAGE_FAILURE',
          code: 'XR1D_STORAGE_FAILURE',
          retryable: false,
        };
      }

      if (existing.expiresAt > now) {
        this.#db.exec('COMMIT');
        transactionStarted = false;
        return {
          ok: true,
          outcome: 'ALLOWED',
          retryable: false,
          entitlement: existing,
        };
      }

      this.#expireIfDue.run(entitlementId, now);

      existing = rowToEntitlement(
        this.#findByEntitlementId.get(entitlementId),
      );

      if (!existing || existing.status !== 'EXPIRED') {
        this.#db.exec('ROLLBACK');
        transactionStarted = false;
        return {
          ok: false,
          outcome: 'STORAGE_FAILURE',
          code: 'XR1D_STORAGE_FAILURE',
          retryable: false,
        };
      }

      this.#db.exec('COMMIT');
      transactionStarted = false;

      return {
        ok: false,
        outcome: 'DENIED',
        code: 'XR1D_ACCESS_EXPIRED',
        retryable: false,
        transitioned: true,
        entitlement: existing,
      };
    } catch (error) {
      if (transactionStarted) {
        try {
          this.#db.exec('ROLLBACK');
        } catch {}
      }

      const classified = classifySqliteError(error);
      return {
        ok: false,
        outcome:
          classified.kind === 'retryable' ? 'RETRYABLE' : 'STORAGE_FAILURE',
        code: classified.code,
        retryable: classified.retryable,
      };
    }
  }

  #resolveConstraintCollision(candidate) {
    try {
      const rows = this.#findCollisions.all(
        candidate.entitlementId,
        candidate.invoiceHash,
        candidate.txid,
      );

      if (rows.length !== 1) {
        return {
          ok: false,
          outcome: 'CONFLICT',
          code: 'XR1D_BINDING_CONFLICT',
          retryable: false,
        };
      }

      const existing = rowToEntitlement(rows[0]);
      if (!sameImmutableGrant(existing, candidate)) {
        return {
          ok: false,
          outcome: 'CONFLICT',
          code: 'XR1D_BINDING_CONFLICT',
          retryable: false,
        };
      }

      return {
        ok: true,
        outcome: 'IDEMPOTENT',
        idempotent: true,
        entitlement: existing,
      };
    } catch (error) {
      const classified = classifySqliteError(error);
      return {
        ok: false,
        outcome:
          classified.kind === 'retryable' ? 'RETRYABLE' : 'STORAGE_FAILURE',
        code: classified.code,
        retryable: classified.retryable,
      };
    }
  }
}
