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

  // 1. Challenge Resource Validation: Validate challenge existence and non-empty resource URL before any dereference
  if (!challenge || typeof challenge !== 'object') {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_INVALID_CHALLENGE' };
  }
  if (
    !challenge.resource ||
    typeof challenge.resource !== 'object' ||
    typeof challenge.resource.url !== 'string' ||
    challenge.resource.url.trim() === ''
  ) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_INVALID_CHALLENGE' };
  }

  // 2. Check wallet availability
  if (walletSimulation && walletSimulation.status === 'DISCONNECTED') {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_WALLET_UNAVAILABLE' };
  }

  // 3. Settlement simulation: Use explicit verifier override precedence (options ?? fixture)
  const verifier = options.verifierSimulation ?? fixture.verifierSimulation;
  if (verifier && verifier.status === 'UNREACHABLE') {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_VERIFIER_UNAVAILABLE' };
  }
  if (!verifier || verifier.status !== 'VERIFIED' || !verifier.verifiedPayment) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_SETTLEMENT_UNVERIFIED' };
  }

  const verifiedPayment = verifier.verifiedPayment;

  // 4. UTXO Identifier Binding: Canonical monetary identity must come from verifiedPayment.
  // If paymentProof declares txid or vout, they must match verifiedPayment exactly.
  if (
    paymentProof?.txid !== undefined &&
    paymentProof.txid !== verifiedPayment.txid
  ) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_UTXO_MISMATCH' };
  }
  if (
    paymentProof?.vout !== undefined &&
    Number(paymentProof.vout) !== Number(verifiedPayment.vout)
  ) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_UTXO_MISMATCH' };
  }

  // 5. Check concurrent lock / active lease
  if (lockContext && lockContext.activeLeaseId) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_LEASE_SUPERSEDED' };
  }

  const accepted = challenge?.accepts?.[0];
  if (!accepted) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_INVALID_CHALLENGE' };
  }

  // 6. Expiry: Never trust client-supplied presentedAt; do NOT use historical blockTimestamp or Date.now().
  // The harness must exclusively use options.evaluationTime ?? fixture.evaluationTime.
  // If neither exists when temporal validation is required: FAIL CLOSED.
  if (accepted.maxTimeoutSeconds && accepted.extra?.issuedAt) {
    const trustedEvaluationTime = options.evaluationTime ?? fixture.evaluationTime;
    if (
      trustedEvaluationTime === undefined ||
      trustedEvaluationTime === null ||
      typeof trustedEvaluationTime !== 'number' ||
      Number.isNaN(trustedEvaluationTime)
    ) {
      return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_EVALUATION_TIME_REQUIRED' };
    }
    const elapsed = trustedEvaluationTime - accepted.extra.issuedAt;
    if (elapsed > accepted.maxTimeoutSeconds) {
      return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_INVOICE_EXPIRED' };
    }
  }

  // 7. Check replay in ledger / Same-resource retry
  const utxoId = `${verifiedPayment.txid}:${verifiedPayment.vout}`;
  if (ledgerContext?.alreadySettledTxids?.includes(utxoId)) {
    const existingEntitlement = ledgerContext.entitlements?.[utxoId];
    const challengedResourceId = challenge.resource.url;
    const proofResourceId = paymentProof?.targetResourceUrl;

    // Idempotent retry: previous resourceId, challenged resourceId, and proof resourceId must all match
    if (
      existingEntitlement &&
      existingEntitlement.resourceId === challengedResourceId &&
      proofResourceId === challengedResourceId
    ) {
      // Evaluate new transport attempt independently.
      // Do NOT emit PAYMENT_SETTLED again; reuse existing entitlement.
      const transport = options.transportSimulation ?? fixture.transportSimulation;
      const retryEvidence = [];

      if (transport?.responseCompleted && !transport?.deliveryAttempted) {
        return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_DELIVERY_STAGE_INVALID' };
      }

      if (transport?.deliveryAttempted) {
        retryEvidence.push('RESOURCE_DELIVERY_ATTEMPTED');
      }
      if (transport?.responseCompleted) {
        retryEvidence.push('RESOURCE_RESPONSE_COMPLETED');
      }

      return {
        outcome: 'SUCCESS',
        evidence: retryEvidence,
        entitlement: existingEntitlement,
        idempotentRetry: true
      };
    }
    // Replaying payment across different resources, sessions, or mismatched proof targets fails closed
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_REPLAY_DETECTED' };
  }

  // 8. Check asset compatibility (derived from verified payment, not caller claim)
  if (verifiedPayment.asset !== accepted.asset) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_UNSUPPORTED_ASSET' };
  }

  // 9. Check amount sufficiency (derived from verified payment, not caller claim)
  try {
    const paid = BigInt(verifiedPayment.amount);
    const required = BigInt(accepted.amount);
    if (paid < required) {
      return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_INSUFFICIENT_AMOUNT' };
    }
  } catch {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_MALFORMED_AMOUNT' };
  }

  // 10. Check recipient payTo match (derived from verified payment, not caller claim)
  if (verifiedPayment.recipient !== accepted.payTo) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_INVALID_RECIPIENT' };
  }

  // 11. Check resource match
  if (!paymentProof || paymentProof.targetResourceUrl !== challenge.resource.url) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_RESOURCE_MISMATCH' };
  }

  // 12. Resource binding: If expected resourceHash exists, missing or mismatched boundResourceHash
  // must be validated against the authenticated output returned by the verifier simulation,
  // rejecting any value supplied solely by the client or not derived from the affirmative verification.
  const expectedHash = challenge.extensions?.['x402-xec']?.info?.resourceHash;
  if (expectedHash) {
    if (
      !verifiedPayment.boundResourceHash ||
      verifiedPayment.boundResourceHash !== expectedHash
    ) {
      return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_RESOURCE_HASH_MISMATCH' };
    }
    if (
      !paymentProof?.boundResourceHash ||
      paymentProof.boundResourceHash !== expectedHash
    ) {
      return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_RESOURCE_HASH_MISMATCH' };
    }
  }

  // 13. Check stale payment proof (derived from verified payment timestamp)
  if (verifiedPayment.blockTimestamp && accepted.extra?.issuedAt) {
    if (verifiedPayment.blockTimestamp < accepted.extra.issuedAt - 300) {
      return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_PAYMENT_PROOF_STALE' };
    }
  }

  // 14. Delivery evidence: Payment verification produces PAYMENT_SETTLED and RESOURCE_UNLOCKED.
  // Delivery evidence requires explicit affirmative transport layer outcome.
  // Formally enforce staged lifecycle: RESOURCE_DELIVERY_ATTEMPTED must be recorded
  // before allowing transition to the final RESOURCE_RESPONSE_COMPLETED state.
  // Completion without attempted delivery fails closed.
  const evidenceTrail = ['PAYMENT_SETTLED', 'RESOURCE_UNLOCKED'];
  const transport = options.transportSimulation ?? fixture.transportSimulation;
  if (transport?.responseCompleted && !transport?.deliveryAttempted) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_DELIVERY_STAGE_INVALID' };
  }
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

test('Regression P1-1: Inter-resource isolation and same-resource retry in ledger replay', () => {
  const validFixturePath = resolve(FIXTURES_DIR, '01-valid-402.json');
  const baseFixture = JSON.parse(readFileSync(validFixturePath, 'utf8'));

  const utxoId = `${baseFixture.paymentProof.txid}:${baseFixture.paymentProof.vout}`;
  const existingEntitlement = {
    entitlementId: 'ent-e3b0c442-0',
    resourceId: baseFixture.paymentProof.targetResourceUrl,
    paymentUtxo: utxoId,
    status: 'ACTIVE_COMPLETED'
  };

  // Case A: Same payment + same canonical resource in challenge and proof -> return existing entitlement idempotently
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

  // Case B: Same payment + different resource in both challenge and proof -> ERR_REPLAY_DETECTED
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

  // Case C: Challenged resource is tlilxochitl, but proof retains old target xilonen -> ERR_REPLAY_DETECTED
  const retainedTargetFixture = {
    ...baseFixture,
    challenge: {
      ...baseFixture.challenge,
      resource: {
        url: 'https://api.xolosramirez.com/v1/xolos/tlilxochitl/verified-dossier'
      }
    },
    paymentProof: {
      ...baseFixture.paymentProof,
      targetResourceUrl: baseFixture.paymentProof.targetResourceUrl // Retains xilonen
    },
    ledgerContext: {
      alreadySettledTxids: [utxoId],
      entitlements: {
        [utxoId]: existingEntitlement // xilonen
      }
    }
  };
  const retainedResult = evaluateX402PaymentProof(retainedTargetFixture);
  assert.equal(retainedResult.outcome, 'FAIL_CLOSED');
  assert.equal(retainedResult.errorCode, 'ERR_REPLAY_DETECTED');

  // Case D: Challenge is xilonen, but proof points to tlilxochitl -> ERR_REPLAY_DETECTED
  const proofMismatchFixture = {
    ...baseFixture,
    paymentProof: {
      ...baseFixture.paymentProof,
      targetResourceUrl: 'https://api.xolosramirez.com/v1/xolos/tlilxochitl/verified-dossier'
    },
    ledgerContext: {
      alreadySettledTxids: [utxoId],
      entitlements: {
        [utxoId]: existingEntitlement
      }
    }
  };
  const proofMismatchResult = evaluateX402PaymentProof(proofMismatchFixture);
  assert.equal(proofMismatchResult.outcome, 'FAIL_CLOSED');
  assert.equal(proofMismatchResult.errorCode, 'ERR_REPLAY_DETECTED');
});

test('Regression P1-2: Expiration uses trusted evaluationTime and rejects client-faked presentedAt or historical blockTimestamp', () => {
  const validFixturePath = resolve(FIXTURES_DIR, '01-valid-402.json');
  const baseFixture = JSON.parse(readFileSync(validFixturePath, 'utf8'));

  // Challenge issued at 1757780000 with 300 second timeout (expires at 1757780300)
  const issuedAt = 1757780000;
  const timeout = 300;
  const expiredEvaluationTime = 1757780500; // 500s after issue -> EXPIRED

  // Subtest A: Client maliciously claims presentation was within window, but trusted evaluationTime is expired
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
      presentedAt: issuedAt + 10
    },
    evaluationTime: expiredEvaluationTime
  };
  const fakedResult = evaluateX402PaymentProof(fixtureWithFakedClientTimestamp);
  assert.equal(fakedResult.outcome, 'FAIL_CLOSED');
  assert.equal(fakedResult.errorCode, 'ERR_INVOICE_EXPIRED');

  // Subtest B: Server override options.evaluationTime takes precedence over fixture.evaluationTime
  const fixtureWithValidTime = {
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
    evaluationTime: issuedAt + 10 // Inside window at fixture level
  };
  const overrideResult = evaluateX402PaymentProof(fixtureWithValidTime, { evaluationTime: expiredEvaluationTime });
  assert.equal(overrideResult.outcome, 'FAIL_CLOSED');
  assert.equal(overrideResult.errorCode, 'ERR_INVOICE_EXPIRED');

  // Subtest C: Historical blockTimestamp inside the window does NOT pass an expired invoice
  const expiredWithHistoricalBlock = {
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
    verifierSimulation: {
      ...baseFixture.verifierSimulation,
      verifiedPayment: {
        ...baseFixture.verifierSimulation.verifiedPayment,
        blockTimestamp: issuedAt + 10 // Block was mined inside window
      }
    },
    evaluationTime: expiredEvaluationTime // Evaluation occurs after expiration
  };
  const blockTimeResult = evaluateX402PaymentProof(expiredWithHistoricalBlock);
  assert.equal(blockTimeResult.outcome, 'FAIL_CLOSED');
  assert.equal(blockTimeResult.errorCode, 'ERR_INVOICE_EXPIRED');
});

test('Regression P1-3: Cryptographic resource binding derived from affirmative verifier output', () => {
  const validFixturePath = resolve(FIXTURES_DIR, '01-valid-402.json');
  const baseFixture = JSON.parse(readFileSync(validFixturePath, 'utf8'));

  const expectedHash = 'sha256:mandatory_expected_hash_99999';
  const bindingChallenge = {
    ...baseFixture.challenge,
    extensions: {
      'x402-xec': {
        info: {
          resourceHash: expectedHash
        },
        schema: 'https://xolosarmy.xyz/schemas/x402-xec-extension.json'
      }
    }
  };

  // Subtest A: Caller supplies expectedHash in paymentProof, but verifier output lacks boundResourceHash -> FAIL CLOSED
  const verifierLacksBinding = {
    ...baseFixture,
    challenge: bindingChallenge,
    paymentProof: {
      ...baseFixture.paymentProof,
      boundResourceHash: expectedHash
    },
    verifierSimulation: {
      status: 'VERIFIED',
      verifiedPayment: {
        ...baseFixture.verifierSimulation.verifiedPayment,
        boundResourceHash: undefined // Verifier did not attest to the hash
      }
    }
  };
  const lacksResult = evaluateX402PaymentProof(verifierLacksBinding);
  assert.equal(lacksResult.outcome, 'FAIL_CLOSED');
  assert.equal(lacksResult.errorCode, 'ERR_RESOURCE_HASH_MISMATCH');

  // Subtest B: Verifier output has different hash than expected -> FAIL CLOSED
  const verifierMismatch = {
    ...baseFixture,
    challenge: bindingChallenge,
    paymentProof: {
      ...baseFixture.paymentProof,
      boundResourceHash: expectedHash
    },
    verifierSimulation: {
      status: 'VERIFIED',
      verifiedPayment: {
        ...baseFixture.verifierSimulation.verifiedPayment,
        boundResourceHash: 'sha256:different_onchain_binding'
      }
    }
  };
  const mismatchResult = evaluateX402PaymentProof(verifierMismatch);
  assert.equal(mismatchResult.outcome, 'FAIL_CLOSED');
  assert.equal(mismatchResult.errorCode, 'ERR_RESOURCE_HASH_MISMATCH');

  // Subtest C: Caller omits boundResourceHash completely -> FAIL CLOSED
  const clientOmittedBinding = {
    ...baseFixture,
    challenge: bindingChallenge,
    paymentProof: {
      ...baseFixture.paymentProof,
      boundResourceHash: undefined
    },
    verifierSimulation: {
      status: 'VERIFIED',
      verifiedPayment: {
        ...baseFixture.verifierSimulation.verifiedPayment,
        boundResourceHash: expectedHash
      }
    }
  };
  const omittedResult = evaluateX402PaymentProof(clientOmittedBinding);
  assert.equal(omittedResult.outcome, 'FAIL_CLOSED');
  assert.equal(omittedResult.errorCode, 'ERR_RESOURCE_HASH_MISMATCH');

  // Subtest D: Affirmative verifier and client proof both carry matching authenticated hash -> SUCCESS
  const validBinding = {
    ...baseFixture,
    challenge: bindingChallenge,
    paymentProof: {
      ...baseFixture.paymentProof,
      boundResourceHash: expectedHash
    },
    verifierSimulation: {
      status: 'VERIFIED',
      verifiedPayment: {
        ...baseFixture.verifierSimulation.verifiedPayment,
        boundResourceHash: expectedHash
      }
    }
  };
  const validResult = evaluateX402PaymentProof(validBinding);
  assert.equal(validResult.outcome, 'SUCCESS');
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

  // Case C: Explicit transport response completed produces all 4 evidence items in exact order
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

  // Case D: Staged lifecycle — responseCompleted without deliveryAttempted FAILS CLOSED
  const invalidAttemptFixture = {
    ...baseFixture,
    transportSimulation: {
      responseCompleted: true // deliveryAttempted omitted
    }
  };
  const invalidResult = evaluateX402PaymentProof(invalidAttemptFixture);
  assert.equal(invalidResult.outcome, 'FAIL_CLOSED');
  assert.equal(invalidResult.errorCode, 'ERR_DELIVERY_STAGE_INVALID');
});

// ---------------- PASS 2 HARDENING REGRESSION TESTS ---------------- //

test('Regression P1: UTXO identifier binding rejects mismatched or forged client txid/vout', () => {
  const validFixturePath = resolve(FIXTURES_DIR, '01-valid-402.json');
  const baseFixture = JSON.parse(readFileSync(validFixturePath, 'utf8'));

  // Case A: Matching txid and vout continues to SUCCESS
  const matchingResult = evaluateX402PaymentProof(baseFixture);
  assert.equal(matchingResult.outcome, 'SUCCESS');

  // Case B: Mismatched txid rejects with ERR_UTXO_MISMATCH
  const mismatchedTxidFixture = {
    ...baseFixture,
    paymentProof: {
      ...baseFixture.paymentProof,
      txid: '0000000000000000000000000000000000000000000000000000000000mismatch'
    }
  };
  const mismatchedTxidResult = evaluateX402PaymentProof(mismatchedTxidFixture);
  assert.equal(mismatchedTxidResult.outcome, 'FAIL_CLOSED');
  assert.equal(mismatchedTxidResult.errorCode, 'ERR_UTXO_MISMATCH');

  // Case C: Mismatched vout rejects with ERR_UTXO_MISMATCH
  const mismatchedVoutFixture = {
    ...baseFixture,
    paymentProof: {
      ...baseFixture.paymentProof,
      vout: 1 // Base verifier confirmed vout 0
    }
  };
  const mismatchedVoutResult = evaluateX402PaymentProof(mismatchedVoutFixture);
  assert.equal(mismatchedVoutResult.outcome, 'FAIL_CLOSED');
  assert.equal(mismatchedVoutResult.errorCode, 'ERR_UTXO_MISMATCH');

  // Case D: Forged client txid/vout with affirmative verifier output rejects with ERR_UTXO_MISMATCH
  const forgedClientFixture = {
    ...baseFixture,
    paymentProof: {
      ...baseFixture.paymentProof,
      txid: 'forged_utxo_txid_from_client_claim_99999999999999999999999999999999',
      vout: 2
    },
    verifierSimulation: {
      status: 'VERIFIED',
      verifiedPayment: {
        ...baseFixture.verifierSimulation.verifiedPayment,
        txid: baseFixture.paymentProof.txid,
        vout: 0
      }
    }
  };
  const forgedResult = evaluateX402PaymentProof(forgedClientFixture);
  assert.equal(forgedResult.outcome, 'FAIL_CLOSED');
  assert.equal(forgedResult.errorCode, 'ERR_UTXO_MISMATCH');
});

test('Regression P2: Verifier simulation override precedence over fixture', () => {
  const validFixturePath = resolve(FIXTURES_DIR, '01-valid-402.json');
  const baseFixture = JSON.parse(readFileSync(validFixturePath, 'utf8'));

  // Fixture has VERIFIED status, but options override passes UNREACHABLE
  const overrideResult = evaluateX402PaymentProof(baseFixture, {
    verifierSimulation: { status: 'UNREACHABLE' }
  });
  assert.equal(overrideResult.outcome, 'FAIL_CLOSED');
  assert.equal(overrideResult.errorCode, 'ERR_VERIFIER_UNAVAILABLE');

  // Override passes non-affirmative status -> ERR_SETTLEMENT_UNVERIFIED
  const unverifiedResult = evaluateX402PaymentProof(baseFixture, {
    verifierSimulation: { status: 'FAILED' }
  });
  assert.equal(unverifiedResult.outcome, 'FAIL_CLOSED');
  assert.equal(unverifiedResult.errorCode, 'ERR_SETTLEMENT_UNVERIFIED');
});

test('Regression P2: Challenge Resource Validation fails closed on missing or empty resource URL without TypeError', () => {
  const validFixturePath = resolve(FIXTURES_DIR, '01-valid-402.json');
  const baseFixture = JSON.parse(readFileSync(validFixturePath, 'utf8'));

  // Case A: Missing resource object in challenge
  const missingResourceFixture = {
    ...baseFixture,
    challenge: {
      ...baseFixture.challenge,
      resource: undefined
    }
  };
  const missingResourceResult = evaluateX402PaymentProof(missingResourceFixture);
  assert.equal(missingResourceResult.outcome, 'FAIL_CLOSED');
  assert.equal(missingResourceResult.errorCode, 'ERR_INVALID_CHALLENGE');

  // Case B: Missing resource.url in challenge
  const missingUrlFixture = {
    ...baseFixture,
    challenge: {
      ...baseFixture.challenge,
      resource: {
        description: 'No URL present'
      }
    }
  };
  const missingUrlResult = evaluateX402PaymentProof(missingUrlFixture);
  assert.equal(missingUrlResult.outcome, 'FAIL_CLOSED');
  assert.equal(missingUrlResult.errorCode, 'ERR_INVALID_CHALLENGE');

  // Case C: Empty resource.url in challenge
  const emptyUrlFixture = {
    ...baseFixture,
    challenge: {
      ...baseFixture.challenge,
      resource: {
        url: '   '
      }
    }
  };
  const emptyUrlResult = evaluateX402PaymentProof(emptyUrlFixture);
  assert.equal(emptyUrlResult.outcome, 'FAIL_CLOSED');
  assert.equal(emptyUrlResult.errorCode, 'ERR_INVALID_CHALLENGE');

  // Case D: Missing challenge object altogether
  const noChallengeFixture = {
    ...baseFixture,
    challenge: undefined
  };
  const noChallengeResult = evaluateX402PaymentProof(noChallengeFixture);
  assert.equal(noChallengeResult.outcome, 'FAIL_CLOSED');
  assert.equal(noChallengeResult.errorCode, 'ERR_INVALID_CHALLENGE');
});

test('Regression P2: Transport evidence on idempotent retries evaluated independently', () => {
  const validFixturePath = resolve(FIXTURES_DIR, '01-valid-402.json');
  const baseFixture = JSON.parse(readFileSync(validFixturePath, 'utf8'));

  const utxoId = `${baseFixture.paymentProof.txid}:${baseFixture.paymentProof.vout}`;
  const existingEntitlement = {
    entitlementId: 'ent-e3b0c442-0',
    resourceId: baseFixture.paymentProof.targetResourceUrl,
    paymentUtxo: utxoId,
    status: 'ACTIVE_COMPLETED'
  };

  const baseRetryFixture = {
    ...baseFixture,
    transportSimulation: undefined,
    ledgerContext: {
      alreadySettledTxids: [utxoId],
      entitlements: {
        [utxoId]: existingEntitlement
      }
    }
  };

  // Case A: idempotent retry + no transport -> no new transport evidence
  const noTransportRetry = evaluateX402PaymentProof(baseRetryFixture);
  assert.equal(noTransportRetry.outcome, 'SUCCESS');
  assert.equal(noTransportRetry.idempotentRetry, true);
  assert.deepEqual(noTransportRetry.evidence, []);
  assert.deepEqual(noTransportRetry.entitlement, existingEntitlement);

  // Case B: idempotent retry + attempted -> DELIVERY_ATTEMPTED
  const attemptedRetry = evaluateX402PaymentProof(baseRetryFixture, {
    transportSimulation: { deliveryAttempted: true, responseCompleted: false }
  });
  assert.equal(attemptedRetry.outcome, 'SUCCESS');
  assert.equal(attemptedRetry.idempotentRetry, true);
  assert.deepEqual(attemptedRetry.evidence, ['RESOURCE_DELIVERY_ATTEMPTED']);
  assert.deepEqual(attemptedRetry.entitlement, existingEntitlement);

  // Case C: idempotent retry + completed -> ATTEMPTED → RESPONSE_COMPLETED
  const completedRetry = evaluateX402PaymentProof(baseRetryFixture, {
    transportSimulation: { deliveryAttempted: true, responseCompleted: true }
  });
  assert.equal(completedRetry.outcome, 'SUCCESS');
  assert.equal(completedRetry.idempotentRetry, true);
  assert.deepEqual(completedRetry.evidence, [
    'RESOURCE_DELIVERY_ATTEMPTED',
    'RESOURCE_RESPONSE_COMPLETED'
  ]);
  assert.deepEqual(completedRetry.entitlement, existingEntitlement);

  // Case D: retry completion without attempted -> FAIL CLOSED (ERR_DELIVERY_STAGE_INVALID)
  const invalidRetry = evaluateX402PaymentProof(baseRetryFixture, {
    transportSimulation: { responseCompleted: true } // deliveryAttempted omitted / false
  });
  assert.equal(invalidRetry.outcome, 'FAIL_CLOSED');
  assert.equal(invalidRetry.errorCode, 'ERR_DELIVERY_STAGE_INVALID');
  // Original entitlement remains unchanged
  assert.equal(existingEntitlement.status, 'ACTIVE_COMPLETED');
});

test('Regression Hardening: Deterministic evaluationTime requires options or fixture clock, fails closed without fallback', () => {
  const validFixturePath = resolve(FIXTURES_DIR, '01-valid-402.json');
  const baseFixture = JSON.parse(readFileSync(validFixturePath, 'utf8'));

  // Fixture requires expiration validation (has maxTimeoutSeconds and extra.issuedAt)
  // Omitting both options.evaluationTime and fixture.evaluationTime MUST fail closed
  const noClockFixture = {
    ...baseFixture,
    evaluationTime: undefined
  };
  const noClockResult = evaluateX402PaymentProof(noClockFixture, { evaluationTime: undefined });
  assert.equal(noClockResult.outcome, 'FAIL_CLOSED');
  assert.equal(noClockResult.errorCode, 'ERR_EVALUATION_TIME_REQUIRED');
});

