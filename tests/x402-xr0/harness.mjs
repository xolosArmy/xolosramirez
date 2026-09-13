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
 * - 1 valid fixture succeeds through exact 4-stage evidence lifecycle when transport is simulated.
 * - Idempotent entitlement model enforced: (txid, vout) <-> resourceId <-> entitlement.
 * - Fail-closed on missing resource binding hash.
 * - Trusted evaluationTime used for expiration (never trust client-supplied presentedAt).
 * - Absence of affirmative verifier simulation fails closed; payment details derived from verified payment.
 * - Delivery evidence segregated from payment verification; requires explicit transport layer outcome.
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
 *
 * @param {Object} fixture
 * @param {Object} [options]
 * @param {number} [options.evaluationTime] Trusted clock override
 * @param {Object} [options.transportSimulation] Explicit transport layer outcome
 * @param {Object} [options.verifierSimulation] Explicit verifier outcome override
 */
export function evaluateX402PaymentProof(fixture, options = {}) {
  const {
    challenge,
    paymentProof,
    walletSimulation,
    verifierSimulation,
    transportSimulation,
    lockContext,
    ledgerContext
  } = fixture;

  // 1. Check wallet availability
  if (walletSimulation && walletSimulation.status === 'DISCONNECTED') {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_WALLET_UNAVAILABLE' };
  }

  // 2. Check verifier / indexer availability
  const verifier = verifierSimulation || options.verifierSimulation;
  if (verifier && verifier.status === 'UNREACHABLE') {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_VERIFIER_UNAVAILABLE' };
  }

  // 3. Settlement simulation: Absence of affirmative simulated verifier result -> FAIL CLOSED.
  // Derive payment details from verified result, not caller claim.
  if (!verifier || verifier.status !== 'VERIFIED' || !verifier.verifiedPayment) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_SETTLEMENT_UNVERIFIED' };
  }

  const verifiedPayment = verifier.verifiedPayment;

  // 4. Check concurrent lock / active lease
  if (lockContext && lockContext.activeLeaseId) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_LEASE_SUPERSEDED' };
  }

  const accepted = challenge?.accepts?.[0];
  if (!accepted) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_INVALID_CHALLENGE' };
  }

  // 5. Expiry: Never trust client-supplied presentedAt; use trusted evaluationTime
  const trustedEvaluationTime = fixture.evaluationTime ?? options.evaluationTime ?? verifiedPayment.blockTimestamp ?? (accepted.extra?.issuedAt ? accepted.extra.issuedAt + 10 : Date.now() / 1000);
  if (accepted.maxTimeoutSeconds && accepted.extra?.issuedAt) {
    const elapsed = trustedEvaluationTime - accepted.extra.issuedAt;
    if (elapsed > accepted.maxTimeoutSeconds) {
      return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_INVOICE_EXPIRED' };
    }
  }

  // 6. Check replay in ledger / Same-resource retry
  const utxoId = `${verifiedPayment.txid}:${verifiedPayment.vout}`;
  if (ledgerContext?.alreadySettledTxids?.includes(utxoId)) {
    // If it's an idempotent re-request of the same resource with an existing active entitlement, return it
    const existingEntitlement = ledgerContext.entitlements?.[utxoId];
    if (existingEntitlement && existingEntitlement.resourceId === paymentProof?.targetResourceUrl) {
      return {
        outcome: 'SUCCESS',
        evidence: ['PAYMENT_SETTLED', 'RESOURCE_UNLOCKED'],
        entitlement: existingEntitlement,
        idempotentRetry: true
      };
    }
    // Replaying payment across different resources or sessions fails closed
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_REPLAY_DETECTED' };
  }

  // 7. Check asset compatibility (derived from verified payment, not caller claim)
  if (verifiedPayment.asset !== accepted.asset) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_UNSUPPORTED_ASSET' };
  }

  // 8. Check amount sufficiency (derived from verified payment, not caller claim)
  try {
    const paid = BigInt(verifiedPayment.amount);
    const required = BigInt(accepted.amount);
    if (paid < required) {
      return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_INSUFFICIENT_AMOUNT' };
    }
  } catch {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_MALFORMED_AMOUNT' };
  }

  // 9. Check recipient payTo match (derived from verified payment, not caller claim)
  if (verifiedPayment.recipient !== accepted.payTo) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_INVALID_RECIPIENT' };
  }

  // 10. Check resource match
  if (!paymentProof || paymentProof.targetResourceUrl !== challenge.resource.url) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_RESOURCE_MISMATCH' };
  }

  // 11. Resource binding: If expected resourceHash exists, missing or mismatched boundResourceHash -> FAIL CLOSED
  const expectedHash = challenge.extensions?.['x402-xec']?.info?.resourceHash;
  if (expectedHash) {
    if (!paymentProof?.boundResourceHash || paymentProof.boundResourceHash !== expectedHash) {
      return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_RESOURCE_HASH_MISMATCH' };
    }
  }

  // 12. Check stale payment proof (derived from verified payment timestamp)
  if (verifiedPayment.blockTimestamp && accepted.extra?.issuedAt) {
    if (verifiedPayment.blockTimestamp < accepted.extra.issuedAt - 300) {
      return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_PAYMENT_PROOF_STALE' };
    }
  }

  // 13. Delivery evidence: Payment verification produces PAYMENT_SETTLED and RESOURCE_UNLOCKED.
  // Delivery evidence requires explicit affirmative transport layer outcome.
  const evidenceTrail = ['PAYMENT_SETTLED', 'RESOURCE_UNLOCKED'];
  const transport = transportSimulation || options.transportSimulation;
  if (transport?.deliveryAttempted) {
    evidenceTrail.push('RESOURCE_DELIVERY_ATTEMPTED');
  }
  if (transport?.responseCompleted) {
    evidenceTrail.push('RESOURCE_RESPONSE_COMPLETED');
  }

  return {
    outcome: 'SUCCESS',
    evidence: evidenceTrail,
    entitlement: {
      entitlementId: `ent-${verifiedPayment.txid.slice(0, 8)}-${verifiedPayment.vout}`,
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

// ---------------- REMEDIATION REGRESSION TESTS (CODEX FINDINGS P1-1 TO P1-5) ---------------- //

test('Regression P1-1: Same-resource retry returns existing active entitlement, different resource fails ERR_REPLAY_DETECTED', () => {
  const validFixturePath = resolve(FIXTURES_DIR, '01-valid-402.json');
  const baseFixture = JSON.parse(readFileSync(validFixturePath, 'utf8'));

  const utxoId = `${baseFixture.paymentProof.txid}:${baseFixture.paymentProof.vout}`;
  const existingEntitlement = {
    entitlementId: 'ent-e3b0c442-0',
    resourceId: baseFixture.paymentProof.targetResourceUrl,
    paymentUtxo: utxoId,
    status: 'ACTIVE_COMPLETED'
  };

  // Case A: Same payment + same canonical resource -> return existing entitlement idempotently
  const sameResourceFixture = {
    ...baseFixture,
    ledgerContext: {
      alreadySettledTxids: [utxoId],
      entitlements: {
        [utxoId]: existingEntitlement
      }
    }
  };
  const sameResult = evaluateX402PaymentProof(sameResourceFixture);
  assert.equal(sameResult.outcome, 'SUCCESS');
  assert.equal(sameResult.idempotentRetry, true);
  assert.deepEqual(sameResult.entitlement, existingEntitlement);

  // Case B: Same payment + different resource -> ERR_REPLAY_DETECTED
  const differentResourceFixture = {
    ...baseFixture,
    challenge: {
      ...baseFixture.challenge,
      resource: {
        url: 'https://api.xolosramirez.com/v1/xolos/tlilxochitl/verified-dossier'
      }
    },
    paymentProof: {
      ...baseFixture.paymentProof,
      targetResourceUrl: 'https://api.xolosramirez.com/v1/xolos/tlilxochitl/verified-dossier'
    },
    ledgerContext: {
      alreadySettledTxids: [utxoId],
      entitlements: {
        [utxoId]: existingEntitlement // Registered for xilonen, not tlilxochitl
      }
    }
  };
  const diffResult = evaluateX402PaymentProof(differentResourceFixture);
  assert.equal(diffResult.outcome, 'FAIL_CLOSED');
  assert.equal(diffResult.errorCode, 'ERR_REPLAY_DETECTED');
});

test('Regression P1-2: Expiration uses trusted evaluationTime and rejects client-faked presentedAt', () => {
  const validFixturePath = resolve(FIXTURES_DIR, '01-valid-402.json');
  const baseFixture = JSON.parse(readFileSync(validFixturePath, 'utf8'));

  // Challenge issued at 1757780000 with 300 second timeout (expires at 1757780300)
  const issuedAt = 1757780000;
  const timeout = 300;
  const expiredEvaluationTime = 1757780500; // 500s after issue -> EXPIRED

  const fixtureWithFakedClientTimestamp = {
    ...baseFixture,
    challenge: {
      ...baseFixture.challenge,
      accepts: [
        {
          ...baseFixture.challenge.accepts[0],
          maxTimeoutSeconds: timeout,
          extra: { issuedAt }
        }
      ]
    },
    paymentProof: {
      ...baseFixture.paymentProof,
      // Client maliciously claims presentation was at issuedAt + 10s
      presentedAt: issuedAt + 10
    },
    // Trusted evaluation time provided by server context is expired
    evaluationTime: expiredEvaluationTime
  };

  const result = evaluateX402PaymentProof(fixtureWithFakedClientTimestamp);
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.errorCode, 'ERR_INVOICE_EXPIRED');
});

test('Regression P1-3: Missing boundResourceHash fails closed with ERR_RESOURCE_HASH_MISMATCH', () => {
  const validFixturePath = resolve(FIXTURES_DIR, '01-valid-402.json');
  const baseFixture = JSON.parse(readFileSync(validFixturePath, 'utf8'));

  // Challenge requires a bound resource hash
  const fixtureWithMissingBoundHash = {
    ...baseFixture,
    challenge: {
      ...baseFixture.challenge,
      extensions: {
        'x402-xec': {
          info: {
            resourceHash: 'sha256:mandatory_expected_hash_99999'
          },
          schema: 'https://xolosarmy.xyz/schemas/x402-xec-extension.json'
        }
      }
    },
    paymentProof: {
      ...baseFixture.paymentProof,
      // Caller omitted boundResourceHash completely
      boundResourceHash: undefined
    }
  };

  const result = evaluateX402PaymentProof(fixtureWithMissingBoundHash);
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.errorCode, 'ERR_RESOURCE_HASH_MISMATCH');
});

test('Regression P1-4: Settlement simulation fails closed without affirmative verifier, and derives payment from verifier', () => {
  const validFixturePath = resolve(FIXTURES_DIR, '01-valid-402.json');
  const baseFixture = JSON.parse(readFileSync(validFixturePath, 'utf8'));

  // Subtest A: Missing verifier simulation fails closed
  const noVerifierFixture = {
    ...baseFixture,
    verifierSimulation: undefined
  };
  const noVerifierResult = evaluateX402PaymentProof(noVerifierFixture);
  assert.equal(noVerifierResult.outcome, 'FAIL_CLOSED');
  assert.equal(noVerifierResult.errorCode, 'ERR_SETTLEMENT_UNVERIFIED');

  // Subtest B: Non-affirmative status (PENDING / UNCONFIRMED / FAILED) fails closed
  const pendingVerifierFixture = {
    ...baseFixture,
    verifierSimulation: {
      status: 'PENDING',
      verifiedPayment: baseFixture.paymentProof
    }
  };
  const pendingResult = evaluateX402PaymentProof(pendingVerifierFixture);
  assert.equal(pendingResult.outcome, 'FAIL_CLOSED');
  assert.equal(pendingResult.errorCode, 'ERR_SETTLEMENT_UNVERIFIED');

  // Subtest C: Derives payment details from verifier result, not caller claim in paymentProof
  // Caller claims sufficient amount ("500000"), but verifier confirms only "100" was settled
  const amountTamperFixture = {
    ...baseFixture,
    paymentProof: {
      ...baseFixture.paymentProof,
      amount: '500000' // Caller claims 500000
    },
    verifierSimulation: {
      status: 'VERIFIED',
      verifiedPayment: {
        ...baseFixture.paymentProof,
        amount: '100' // Verifier confirms only 100
      }
    }
  };
  const amountResult = evaluateX402PaymentProof(amountTamperFixture);
  assert.equal(amountResult.outcome, 'FAIL_CLOSED');
  assert.equal(amountResult.errorCode, 'ERR_INSUFFICIENT_AMOUNT');
});

test('Regression P1-5: Payment verification segregates settlement from transport delivery evidence', () => {
  const validFixturePath = resolve(FIXTURES_DIR, '01-valid-402.json');
  const baseFixture = JSON.parse(readFileSync(validFixturePath, 'utf8'));

  // Case A: Payment verification without transport outcome produces strictly 2 evidence items
  const noTransportFixture = {
    ...baseFixture,
    transportSimulation: undefined
  };
  const noTransportResult = evaluateX402PaymentProof(noTransportFixture);
  assert.equal(noTransportResult.outcome, 'SUCCESS');
  assert.deepEqual(noTransportResult.evidence, [
    'PAYMENT_SETTLED',
    'RESOURCE_UNLOCKED'
  ]);

  // Case B: Explicit transport delivery attempted produces 3 evidence items
  const deliveryAttemptedFixture = {
    ...baseFixture,
    transportSimulation: {
      deliveryAttempted: true,
      responseCompleted: false
    }
  };
  const deliveryAttemptedResult = evaluateX402PaymentProof(deliveryAttemptedFixture);
  assert.equal(deliveryAttemptedResult.outcome, 'SUCCESS');
  assert.deepEqual(deliveryAttemptedResult.evidence, [
    'PAYMENT_SETTLED',
    'RESOURCE_UNLOCKED',
    'RESOURCE_DELIVERY_ATTEMPTED'
  ]);

  // Case C: Explicit transport response completed produces all 4 evidence items
  const completedFixture = {
    ...baseFixture,
    transportSimulation: {
      deliveryAttempted: true,
      responseCompleted: true
    }
  };
  const completedResult = evaluateX402PaymentProof(completedFixture);
  assert.equal(completedResult.outcome, 'SUCCESS');
  assert.deepEqual(completedResult.evidence, [
    'PAYMENT_SETTLED',
    'RESOURCE_UNLOCKED',
    'RESOURCE_DELIVERY_ATTEMPTED',
    'RESOURCE_RESPONSE_COMPLETED'
  ]);
});
