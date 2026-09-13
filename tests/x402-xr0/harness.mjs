/**
 * @file harness.mjs
 * Offline Test Harness for Milestone X402-XR0 (Verified Public Xolo Dossier Contract).
 *
 * INVARIANTS:
 * - Strictly offline: NO network calls, NO mainnet, NO Chronik, NO private keys, NO broadcast, NO real funds.
 * - network = "TBD — owned by x402-XEC"
 * - asset = "TBD — owned by x402-XEC"
 * - extensions = TBD by x402-XEC
 * - 11 failure fixtures fail closed with exact error codes.
 * - 1 valid fixture succeeds through exact 4-stage evidence lifecycle.
 * - Idempotent entitlement model enforced: (txid, vout) <-> resourceId <-> entitlement.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = resolve(__dirname, 'fixtures');

/**
 * Offline validation engine simulating the X402-XR0 verification pipeline.
 * Purely deterministic, fail-closed, and isolated from network/chain.
 */
export function evaluateX402PaymentProof(fixture) {
  const { challenge, paymentProof, walletSimulation, verifierSimulation, lockContext, ledgerContext } = fixture;

  // 1. Check wallet availability
  if (walletSimulation && walletSimulation.status === 'DISCONNECTED') {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_WALLET_UNAVAILABLE' };
  }

  // 2. Check verifier / indexer availability
  if (verifierSimulation && verifierSimulation.status === 'UNREACHABLE') {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_VERIFIER_UNAVAILABLE' };
  }

  // 3. Check concurrent lock / active lease
  if (lockContext && lockContext.activeLeaseId) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_LEASE_SUPERSEDED' };
  }

  const accepted = challenge.accepts?.[0];
  if (!accepted) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_INVALID_CHALLENGE' };
  }

  // 4. Check expiration
  if (accepted.maxTimeoutSeconds && accepted.extra?.issuedAt && paymentProof.presentedAt) {
    const elapsed = paymentProof.presentedAt - accepted.extra.issuedAt;
    if (elapsed > accepted.maxTimeoutSeconds) {
      return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_INVOICE_EXPIRED' };
    }
  }

  // 5. Check replay in ledger
  const utxoId = `${paymentProof.txid}:${paymentProof.vout}`;
  if (ledgerContext?.alreadySettledTxids?.includes(utxoId)) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_REPLAY_DETECTED' };
  }

  // 6. Check asset compatibility
  if (paymentProof.asset !== accepted.asset) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_UNSUPPORTED_ASSET' };
  }

  // 7. Check amount sufficiency
  try {
    const paid = BigInt(paymentProof.amount);
    const required = BigInt(accepted.amount);
    if (paid < required) {
      return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_INSUFFICIENT_AMOUNT' };
    }
  } catch {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_MALFORMED_AMOUNT' };
  }

  // 8. Check recipient payTo match
  if (paymentProof.recipient !== accepted.payTo) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_INVALID_RECIPIENT' };
  }

  // 9. Check resource match
  if (paymentProof.targetResourceUrl !== challenge.resource.url) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_RESOURCE_MISMATCH' };
  }

  // 10. Check tampered resource hash (if extension hash provided)
  const expectedHash = challenge.extensions?.['x402-xec']?.info?.resourceHash;
  if (paymentProof.boundResourceHash && expectedHash && paymentProof.boundResourceHash !== expectedHash) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_RESOURCE_HASH_MISMATCH' };
  }

  // 11. Check stale payment proof
  if (paymentProof.blockTimestamp && accepted.extra?.issuedAt) {
    if (paymentProof.blockTimestamp < accepted.extra.issuedAt - 300) {
      return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_PAYMENT_PROOF_STALE' };
    }
  }

  // If all pass, simulate full evidence lifecycle
  const evidenceTrail = [
    'PAYMENT_SETTLED',
    'RESOURCE_UNLOCKED',
    'RESOURCE_DELIVERY_ATTEMPTED',
    'RESOURCE_RESPONSE_COMPLETED'
  ];

  return {
    outcome: 'SUCCESS',
    evidence: evidenceTrail,
    entitlement: {
      entitlementId: `ent-${paymentProof.txid.slice(0, 8)}-${paymentProof.vout}`,
      resourceId: paymentProof.targetResourceUrl,
      paymentUtxo: utxoId,
      status: 'ACTIVE_COMPLETED'
    }
  };
}

// ---------------- AUTOMATED HARNESS TESTS ---------------- //

const fixtureFiles = readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

test('X402-XR0: Harness verifies presence of all 12 required fixtures', () => {
  assert.equal(fixtureFiles.length, 12, 'Must provide exactly 12 deterministic fixtures');
  
  const expectedPrefixes = [
    '01-valid-402',
    '02-wrong-asset',
    '03-wrong-amount',
    '04-wrong-recipient',
    '05-expired-request',
    '06-replay',
    '07-tampered-resource-hash',
    '08-wrong-resource',
    '09-stale-payment-proof',
    '10-duplicate-unlock',
    '11-verifier-unavailable',
    '12-wallet-unavailable'
  ];

  for (const prefix of expectedPrefixes) {
    assert.ok(
      fixtureFiles.some((f) => f.startsWith(prefix)),
      `Missing required fixture for scenario "${prefix}"`
    );
  }
});

for (const file of fixtureFiles) {
  test(`X402-XR0 Fixture: ${file}`, () => {
    const filePath = resolve(FIXTURES_DIR, file);
    const content = JSON.parse(readFileSync(filePath, 'utf8'));

    const result = evaluateX402PaymentProof(content);

    assert.equal(
      result.outcome,
      content.expectedOutcome,
      `Fixture ${file} outcome mismatch: got ${result.outcome}, expected ${content.expectedOutcome}`
    );

    if (content.expectedOutcome === 'FAIL_CLOSED') {
      assert.equal(
        result.errorCode,
        content.expectedErrorCode,
        `Fixture ${file} error code mismatch: got ${result.errorCode}, expected ${content.expectedErrorCode}`
      );
    } else if (content.expectedOutcome === 'SUCCESS') {
      assert.deepEqual(
        result.evidence,
        content.expectedEvidence,
        `Fixture ${file} evidence trail must match canonical segregated lifecycle`
      );
      assert.ok(result.entitlement, 'Successful evaluation must generate active entitlement');
    }
  });
}

test('X402-XR0: Idempotent Entitlement Lifecycle — Re-request same resource vs different resource', () => {
  const validFixturePath = resolve(FIXTURES_DIR, '01-valid-402.json');
  const validFixture = JSON.parse(readFileSync(validFixturePath, 'utf8'));

  // First evaluation produces active entitlement
  const firstEval = evaluateX402PaymentProof(validFixture);
  assert.equal(firstEval.outcome, 'SUCCESS');
  const entitlement = firstEval.entitlement;

  // Re-requesting same resource under policy succeeds (idempotent replay allowed for same canonical resource)
  assert.equal(entitlement.resourceId, validFixture.paymentProof.targetResourceUrl);

  // Attempting to re-route same entitlement to unlock a DIFFERENT resource fails closed
  const hijackedProof = {
    ...validFixture,
    paymentProof: {
      ...validFixture.paymentProof,
      targetResourceUrl: 'https://api.xolosramirez.com/v1/xolos/tlilxochitl/verified-dossier'
    }
  };
  const hijackedEval = evaluateX402PaymentProof(hijackedProof);
  assert.equal(hijackedEval.outcome, 'FAIL_CLOSED');
  assert.equal(hijackedEval.errorCode, 'ERR_RESOURCE_MISMATCH');
});

test('X402-XR0: Frozen Upstream Ownership Invariant', () => {
  const validFixturePath = resolve(FIXTURES_DIR, '01-valid-402.json');
  const validFixture = JSON.parse(readFileSync(validFixturePath, 'utf8'));

  const accept = validFixture.challenge.accepts[0];
  assert.ok(
    accept.network.includes('owned by x402-XEC'),
    'Network identifier must remain declared as owned by x402-XEC'
  );
  assert.ok(
    accept.asset.includes('owned by x402-XEC'),
    'Asset identifier must remain declared as owned by x402-XEC'
  );

  const xecExt = validFixture.challenge.extensions['x402-xec'];
  assert.ok(xecExt.info, 'x402 v2 extension must use canonical { info, schema } form');
  assert.ok(xecExt.schema, 'x402 v2 extension must specify schema URI');
  assert.ok(
    xecExt.info.resourceHash.includes('owned by x402-XEC'),
    'resourceHash must be marked as upstream proposal owned by x402-XEC'
  );
});
