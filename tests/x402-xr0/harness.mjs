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

  // 1. Validate challenge structure
  if (!challenge || typeof challenge !== 'object') {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_INVALID_CHALLENGE' };
  }

  // 2. Validate x402 protocol version (must be strictly integer 2)
  if (challenge.x402Version !== 2) {
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

  const accepted = challenge.accepts?.[0];
  if (!accepted || typeof accepted !== 'object') {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_INVALID_CHALLENGE' };
  }

  // 3. Validate trusted evaluationTime (no Date.now() fallback; fail closed if absent)
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

  // Check wallet simulation / lease status
  if (walletSimulation && walletSimulation.status === 'DISCONNECTED') {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_WALLET_UNAVAILABLE' };
  }
  if (lockContext && lockContext.activeLeaseId) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_LEASE_SUPERSEDED' };
  }

  // 4. Require affirmative verifier result (precedence: options ?? fixture)
  const verifier = options.verifierSimulation ?? fixture.verifierSimulation;
  if (verifier && verifier.status === 'UNREACHABLE') {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_VERIFIER_UNAVAILABLE' };
  }
  if (!verifier || verifier.status !== 'VERIFIED' || !verifier.verifiedPayment || typeof verifier.verifiedPayment !== 'object') {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_SETTLEMENT_UNVERIFIED' };
  }

  // 5. Validate verifiedPayment shape defensively before any dereference
  const verifiedPayment = verifier.verifiedPayment;
  if (
    typeof verifiedPayment.txid !== 'string' ||
    verifiedPayment.txid.trim() === '' ||
    verifiedPayment.vout === undefined ||
    verifiedPayment.vout === null ||
    typeof verifiedPayment.vout !== 'number' ||
    !Number.isInteger(verifiedPayment.vout) ||
    verifiedPayment.vout < 0 ||
    typeof verifiedPayment.amount !== 'string' ||
    verifiedPayment.amount.trim() === '' ||
    typeof verifiedPayment.asset !== 'string' ||
    verifiedPayment.asset.trim() === '' ||
    typeof verifiedPayment.recipient !== 'string' ||
    verifiedPayment.recipient.trim() === ''
  ) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_SETTLEMENT_UNVERIFIED' };
  }

  try {
    const parsedAmount = BigInt(verifiedPayment.amount);
    if (parsedAmount < 0n) {
      return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_SETTLEMENT_UNVERIFIED' };
    }
  } catch {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_SETTLEMENT_UNVERIFIED' };
  }

  // 6. Validate submitted paymentProof identity (both txid and vout are strictly required)
  if (
    !paymentProof ||
    typeof paymentProof !== 'object' ||
    typeof paymentProof.txid !== 'string' ||
    paymentProof.txid.trim() === ''
  ) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_UTXO_MISMATCH' };
  }
  if (
    paymentProof.vout === undefined ||
    paymentProof.vout === null ||
    typeof paymentProof.vout !== 'number' ||
    !Number.isInteger(paymentProof.vout) ||
    paymentProof.vout < 0
  ) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_UTXO_MISMATCH' };
  }

  // 7. Bind verified UTXO: Submitted payment proof must match authentic verifier output
  if (paymentProof.txid !== verifiedPayment.txid) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_UTXO_MISMATCH' };
  }
  if (paymentProof.vout !== verifiedPayment.vout) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_UTXO_MISMATCH' };
  }

  // 8. Verify amount, asset, recipient, resourceHash, and freshness
  if (verifiedPayment.asset !== accepted.asset) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_UNSUPPORTED_ASSET' };
  }

  const paid = BigInt(verifiedPayment.amount);
  const required = BigInt(accepted.amount);
  if (paid < required) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_INSUFFICIENT_AMOUNT' };
  }

  if (verifiedPayment.recipient !== accepted.payTo) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_INVALID_RECIPIENT' };
  }

  const expectedHash = challenge.extensions?.['x402-xec']?.info?.resourceHash;
  if (expectedHash) {
    if (
      !verifiedPayment.boundResourceHash ||
      typeof verifiedPayment.boundResourceHash !== 'string' ||
      verifiedPayment.boundResourceHash !== expectedHash
    ) {
      return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_RESOURCE_HASH_MISMATCH' };
    }
    if (
      !paymentProof?.boundResourceHash ||
      typeof paymentProof.boundResourceHash !== 'string' ||
      paymentProof.boundResourceHash !== expectedHash
    ) {
      return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_RESOURCE_HASH_MISMATCH' };
    }
  }

  if (verifiedPayment.blockTimestamp && accepted.extra?.issuedAt) {
    if (verifiedPayment.blockTimestamp < accepted.extra.issuedAt - 300) {
      return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_PAYMENT_PROOF_STALE' };
    }
  }

  // 9. Replay / Entitlement evaluation using canonical verifiedPayment identity
  const utxoId = `${verifiedPayment.txid}:${verifiedPayment.vout}`;
  if (ledgerContext?.alreadySettledTxids?.includes(utxoId)) {
    const existingEntitlement = ledgerContext.entitlements?.[utxoId];
    const challengedResourceId = challenge.resource.url;
    const proofResourceId = paymentProof?.targetResourceUrl;

    if (
      existingEntitlement &&
      existingEntitlement.resourceId === challengedResourceId &&
      proofResourceId === challengedResourceId
    ) {
      // Evaluate new transport attempt independently.
      // Reuses entitlement without re-emitting PAYMENT_SETTLED.
      const transport = options.transportSimulation ?? fixture.transportSimulation;
      const retryEvidence = [];

      if (transport) {
        if ((transport.responseCompleted || transport.deliveryFailed) && !transport.deliveryAttempted) {
          return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_DELIVERY_STAGE_INVALID' };
        }
        if (transport.responseCompleted && transport.deliveryFailed) {
          return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_DELIVERY_STAGE_INVALID' };
        }

        if (transport.deliveryAttempted) {
          retryEvidence.push('RESOURCE_DELIVERY_ATTEMPTED');
        }
        if (transport.deliveryFailed) {
          retryEvidence.push('RESOURCE_DELIVERY_FAILED');
        } else if (transport.responseCompleted) {
          retryEvidence.push('RESOURCE_RESPONSE_COMPLETED');
        }
      }

      return {
        outcome: 'SUCCESS',
        evidence: retryEvidence,
        entitlement: existingEntitlement,
        idempotentRetry: true
      };
    }
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_REPLAY_DETECTED' };
  }

  // If not previously settled, target resource URL in proof must match challenged resource URL
  if (paymentProof.targetResourceUrl !== challenge.resource.url) {
    return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_RESOURCE_MISMATCH' };
  }

  // 10. Settlement evidence: Fresh settlement generates PAYMENT_SETTLED and RESOURCE_UNLOCKED
  const evidenceTrail = ['PAYMENT_SETTLED', 'RESOURCE_UNLOCKED'];

  // 11. Transport evidence: Evaluated independently with delivery failure branch
  const transport = options.transportSimulation ?? fixture.transportSimulation;
  if (transport) {
    if ((transport.responseCompleted || transport.deliveryFailed) && !transport.deliveryAttempted) {
      return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_DELIVERY_STAGE_INVALID' };
    }
    if (transport.responseCompleted && transport.deliveryFailed) {
      return { outcome: 'FAIL_CLOSED', errorCode: 'ERR_DELIVERY_STAGE_INVALID' };
    }

    if (transport.deliveryAttempted) {
      evidenceTrail.push('RESOURCE_DELIVERY_ATTEMPTED');
    }
    if (transport.deliveryFailed) {
      evidenceTrail.push('RESOURCE_DELIVERY_FAILED');
    } else if (transport.responseCompleted) {
      evidenceTrail.push('RESOURCE_RESPONSE_COMPLETED');
    }
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

// ---------------- PASS 3 HARDENING REGRESSION TESTS ---------------- //

test('Regression Pass 3 (P2-1): Strict UTXO identifiers in submitted paymentProof', () => {
  const validFixturePath = resolve(FIXTURES_DIR, '01-valid-402.json');
  const baseFixture = JSON.parse(readFileSync(validFixturePath, 'utf8'));

  // Condition 1: Matching txid and vout -> continue to SUCCESS
  const matchingResult = evaluateX402PaymentProof(baseFixture);
  assert.equal(matchingResult.outcome, 'SUCCESS');
  assert.equal(matchingResult.entitlement.paymentUtxo, `${baseFixture.verifierSimulation.verifiedPayment.txid}:${baseFixture.verifierSimulation.verifiedPayment.vout}`);

  // Condition 2: Missing txid -> ERR_UTXO_MISMATCH
  const missingTxidFixture = {
    ...baseFixture,
    paymentProof: {
      ...baseFixture.paymentProof,
      txid: undefined
    }
  };
  const missingTxidResult = evaluateX402PaymentProof(missingTxidFixture);
  assert.equal(missingTxidResult.outcome, 'FAIL_CLOSED');
  assert.equal(missingTxidResult.errorCode, 'ERR_UTXO_MISMATCH');

  // Condition 2b: Empty txid -> ERR_UTXO_MISMATCH
  const emptyTxidFixture = {
    ...baseFixture,
    paymentProof: {
      ...baseFixture.paymentProof,
      txid: '   '
    }
  };
  const emptyTxidResult = evaluateX402PaymentProof(emptyTxidFixture);
  assert.equal(emptyTxidResult.outcome, 'FAIL_CLOSED');
  assert.equal(emptyTxidResult.errorCode, 'ERR_UTXO_MISMATCH');

  // Condition 3: Missing vout -> ERR_UTXO_MISMATCH
  const missingVoutFixture = {
    ...baseFixture,
    paymentProof: {
      ...baseFixture.paymentProof,
      vout: undefined
    }
  };
  const missingVoutResult = evaluateX402PaymentProof(missingVoutFixture);
  assert.equal(missingVoutResult.outcome, 'FAIL_CLOSED');
  assert.equal(missingVoutResult.errorCode, 'ERR_UTXO_MISMATCH');

  // Condition 3b: Non-integer / negative vout -> ERR_UTXO_MISMATCH
  const negativeVoutFixture = {
    ...baseFixture,
    paymentProof: {
      ...baseFixture.paymentProof,
      vout: -1
    }
  };
  assert.equal(evaluateX402PaymentProof(negativeVoutFixture).errorCode, 'ERR_UTXO_MISMATCH');

  const nonIntegerVoutFixture = {
    ...baseFixture,
    paymentProof: {
      ...baseFixture.paymentProof,
      vout: 1.5
    }
  };
  assert.equal(evaluateX402PaymentProof(nonIntegerVoutFixture).errorCode, 'ERR_UTXO_MISMATCH');

  // Condition 4: Mismatched txid -> ERR_UTXO_MISMATCH
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

  // Condition 5: Mismatched vout -> ERR_UTXO_MISMATCH
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

  // Condition 6: Forged client txid/vout with valid affirmative verifier output -> rejects with ERR_UTXO_MISMATCH
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

test('Regression Pass 3 (P2-2): Validate x402 protocol version strictly integer 2', () => {
  const validFixturePath = resolve(FIXTURES_DIR, '01-valid-402.json');
  const baseFixture = JSON.parse(readFileSync(validFixturePath, 'utf8'));

  // Subtest A: Missing x402Version -> ERR_INVALID_CHALLENGE
  const missingVersionFixture = {
    ...baseFixture,
    challenge: {
      ...baseFixture.challenge,
      x402Version: undefined
    }
  };
  assert.equal(evaluateX402PaymentProof(missingVersionFixture).errorCode, 'ERR_INVALID_CHALLENGE');

  // Subtest B: x402Version = 1 -> ERR_INVALID_CHALLENGE
  const v1Fixture = {
    ...baseFixture,
    challenge: {
      ...baseFixture.challenge,
      x402Version: 1
    }
  };
  assert.equal(evaluateX402PaymentProof(v1Fixture).errorCode, 'ERR_INVALID_CHALLENGE');

  // Subtest C: x402Version = 3 -> ERR_INVALID_CHALLENGE
  const v3Fixture = {
    ...baseFixture,
    challenge: {
      ...baseFixture.challenge,
      x402Version: 3
    }
  };
  assert.equal(evaluateX402PaymentProof(v3Fixture).errorCode, 'ERR_INVALID_CHALLENGE');

  // Subtest D: x402Version = "2" (string, no coercion) -> ERR_INVALID_CHALLENGE
  const stringV2Fixture = {
    ...baseFixture,
    challenge: {
      ...baseFixture.challenge,
      x402Version: '2'
    }
  };
  assert.equal(evaluateX402PaymentProof(stringV2Fixture).errorCode, 'ERR_INVALID_CHALLENGE');

  // Subtest E: arbitrary value -> ERR_INVALID_CHALLENGE
  const arbitraryFixture = {
    ...baseFixture,
    challenge: {
      ...baseFixture.challenge,
      x402Version: 'custom-draft'
    }
  };
  assert.equal(evaluateX402PaymentProof(arbitraryFixture).errorCode, 'ERR_INVALID_CHALLENGE');
});

test('Regression Pass 3 (P2-3): Explicit failed-delivery evidence and invalid transport transitions', () => {
  const validFixturePath = resolve(FIXTURES_DIR, '01-valid-402.json');
  const baseFixture = JSON.parse(readFileSync(validFixturePath, 'utf8'));

  // Case A: attempted + failed -> ATTEMPTED, FAILED (no RESOURCE_RESPONSE_COMPLETED)
  const failedDeliveryFixture = {
    ...baseFixture,
    transportSimulation: {
      deliveryAttempted: true,
      deliveryFailed: true,
      responseCompleted: false
    }
  };
  const failedResult = evaluateX402PaymentProof(failedDeliveryFixture);
  assert.equal(failedResult.outcome, 'SUCCESS');
  assert.deepEqual(failedResult.evidence, [
    'PAYMENT_SETTLED',
    'RESOURCE_UNLOCKED',
    'RESOURCE_DELIVERY_ATTEMPTED',
    'RESOURCE_DELIVERY_FAILED'
  ]);
  assert.equal(failedResult.evidence.includes('RESOURCE_RESPONSE_COMPLETED'), false);
  assert.equal(failedResult.entitlement.status, 'ACTIVE_COMPLETED');

  // Case B: attempted + failed + responseCompleted -> FAIL CLOSED invalid transition
  const conflictingTransportFixture = {
    ...baseFixture,
    transportSimulation: {
      deliveryAttempted: true,
      deliveryFailed: true,
      responseCompleted: true
    }
  };
  const conflictingResult = evaluateX402PaymentProof(conflictingTransportFixture);
  assert.equal(conflictingResult.outcome, 'FAIL_CLOSED');
  assert.equal(conflictingResult.errorCode, 'ERR_DELIVERY_STAGE_INVALID');

  // Case C: failed without attempted -> FAIL CLOSED
  const failedWithoutAttemptFixture = {
    ...baseFixture,
    transportSimulation: {
      deliveryAttempted: false,
      deliveryFailed: true,
      responseCompleted: false
    }
  };
  const failedWithoutAttemptResult = evaluateX402PaymentProof(failedWithoutAttemptFixture);
  assert.equal(failedWithoutAttemptResult.outcome, 'FAIL_CLOSED');
  assert.equal(failedWithoutAttemptResult.errorCode, 'ERR_DELIVERY_STAGE_INVALID');

  // Case D: Idempotent retry with deliveryFailed -> ATTEMPTED, FAILED
  const utxoId = `${baseFixture.paymentProof.txid}:${baseFixture.paymentProof.vout}`;
  const existingEntitlement = {
    entitlementId: 'ent-e3b0c442-0',
    resourceId: baseFixture.paymentProof.targetResourceUrl,
    paymentUtxo: utxoId,
    status: 'ACTIVE_COMPLETED'
  };
  const retryFailedResult = evaluateX402PaymentProof(
    {
      ...baseFixture,
      ledgerContext: {
        alreadySettledTxids: [utxoId],
        entitlements: { [utxoId]: existingEntitlement }
      }
    },
    {
      transportSimulation: {
        deliveryAttempted: true,
        deliveryFailed: true,
        responseCompleted: false
      }
    }
  );
  assert.equal(retryFailedResult.outcome, 'SUCCESS');
  assert.equal(retryFailedResult.idempotentRetry, true);
  assert.deepEqual(retryFailedResult.evidence, [
    'RESOURCE_DELIVERY_ATTEMPTED',
    'RESOURCE_DELIVERY_FAILED'
  ]);
  assert.deepEqual(retryFailedResult.entitlement, existingEntitlement);
});

test('Regression Pass 3 (P2-4): Defensive verifiedPayment shape validation fails closed without TypeError', () => {
  const validFixturePath = resolve(FIXTURES_DIR, '01-valid-402.json');
  const baseFixture = JSON.parse(readFileSync(validFixturePath, 'utf8'));

  // Case A: VERIFIED + missing txid -> FAIL CLOSED (ERR_SETTLEMENT_UNVERIFIED)
  const noTxid = {
    ...baseFixture,
    verifierSimulation: {
      status: 'VERIFIED',
      verifiedPayment: {
        ...baseFixture.verifierSimulation.verifiedPayment,
        txid: undefined
      }
    }
  };
  assert.doesNotThrow(() => {
    const res = evaluateX402PaymentProof(noTxid);
    assert.equal(res.outcome, 'FAIL_CLOSED');
    assert.equal(res.errorCode, 'ERR_SETTLEMENT_UNVERIFIED');
  });

  // Case B: VERIFIED + empty txid -> FAIL CLOSED
  const emptyTxid = {
    ...baseFixture,
    verifierSimulation: {
      status: 'VERIFIED',
      verifiedPayment: {
        ...baseFixture.verifierSimulation.verifiedPayment,
        txid: '   '
      }
    }
  };
  assert.equal(evaluateX402PaymentProof(emptyTxid).errorCode, 'ERR_SETTLEMENT_UNVERIFIED');

  // Case C: VERIFIED + missing vout -> FAIL CLOSED
  const noVout = {
    ...baseFixture,
    verifierSimulation: {
      status: 'VERIFIED',
      verifiedPayment: {
        ...baseFixture.verifierSimulation.verifiedPayment,
        vout: undefined
      }
    }
  };
  assert.equal(evaluateX402PaymentProof(noVout).errorCode, 'ERR_SETTLEMENT_UNVERIFIED');

  // Case D: VERIFIED + negative/non-integer vout -> FAIL CLOSED
  const negVout = {
    ...baseFixture,
    verifierSimulation: {
      status: 'VERIFIED',
      verifiedPayment: {
        ...baseFixture.verifierSimulation.verifiedPayment,
        vout: -1
      }
    }
  };
  assert.equal(evaluateX402PaymentProof(negVout).errorCode, 'ERR_SETTLEMENT_UNVERIFIED');

  const floatVout = {
    ...baseFixture,
    verifierSimulation: {
      status: 'VERIFIED',
      verifiedPayment: {
        ...baseFixture.verifierSimulation.verifiedPayment,
        vout: 0.5
      }
    }
  };
  assert.equal(evaluateX402PaymentProof(floatVout).errorCode, 'ERR_SETTLEMENT_UNVERIFIED');

  // Case E: VERIFIED + missing recipient -> FAIL CLOSED
  const noRecipient = {
    ...baseFixture,
    verifierSimulation: {
      status: 'VERIFIED',
      verifiedPayment: {
        ...baseFixture.verifierSimulation.verifiedPayment,
        recipient: ''
      }
    }
  };
  assert.equal(evaluateX402PaymentProof(noRecipient).errorCode, 'ERR_SETTLEMENT_UNVERIFIED');

  // Case F: VERIFIED + missing asset -> FAIL CLOSED
  const noAsset = {
    ...baseFixture,
    verifierSimulation: {
      status: 'VERIFIED',
      verifiedPayment: {
        ...baseFixture.verifierSimulation.verifiedPayment,
        asset: ''
      }
    }
  };
  assert.equal(evaluateX402PaymentProof(noAsset).errorCode, 'ERR_SETTLEMENT_UNVERIFIED');

  // Case G: VERIFIED + missing amount -> FAIL CLOSED
  const noAmount = {
    ...baseFixture,
    verifierSimulation: {
      status: 'VERIFIED',
      verifiedPayment: {
        ...baseFixture.verifierSimulation.verifiedPayment,
        amount: undefined
      }
    }
  };
  assert.equal(evaluateX402PaymentProof(noAmount).errorCode, 'ERR_SETTLEMENT_UNVERIFIED');

  // Case H: VERIFIED + non-parsable amount -> FAIL CLOSED
  const invalidAmount = {
    ...baseFixture,
    verifierSimulation: {
      status: 'VERIFIED',
      verifiedPayment: {
        ...baseFixture.verifierSimulation.verifiedPayment,
        amount: 'invalid-not-a-number'
      }
    }
  };
  assert.equal(evaluateX402PaymentProof(invalidAmount).errorCode, 'ERR_SETTLEMENT_UNVERIFIED');
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

