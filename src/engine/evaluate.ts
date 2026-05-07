// Pure-function tier evaluation. No I/O. Same input, same output.

import type {
  Claim,
  EvaluationContext,
  Policy,
  Predicate,
  PredicateValue,
  RiskBand,
  RunResult,
  TierId,
  GuardrailReading,
} from './types';

const LEAKAGE_REGEX = /(outcome|approved|denied|resolved|was_)/i;

// Re-check at runtime in case a Claim was forged outside the schema.
function assertNoLeakage(claim: Claim): void {
  for (const key of Object.keys(claim)) {
    if (LEAKAGE_REGEX.test(key)) {
      throw new Error(
        `Claim field "${key}" looks like a post-event outcome variable. ` +
          'The engine refuses to consume outcome data.',
      );
    }
  }
}

// Trust score: high for entities whose observed rate sits at or below the
// expected rate. Drops as the z-score climbs. Mapped to [0, 1] via a soft cap
// at z=4 so even very anomalous entities still produce a number, not NaN.
export function deriveTrustScore(claim: Claim): number {
  const z = Number.isFinite(claim.entity_rate_zscore) ? claim.entity_rate_zscore : 0;
  // z <= 0 → trust 0.95+; z = 4 → trust ~0.5; z >= 8 → trust ~0.1.
  const raw = 1 - Math.max(0, Math.min(z, 8)) / 10;
  return Math.max(0, Math.min(1, raw));
}

export function deriveRiskBand(claim: Claim): RiskBand {
  const z = claim.entity_rate_zscore;
  if (!Number.isFinite(z) || z < 1) return 'low';
  if (z < 2) return 'medium';
  if (z < 4) return 'high';
  return 'critical';
}

export function deriveContext(claim: Claim): EvaluationContext {
  return {
    trust_score: deriveTrustScore(claim),
    cumulative_event_value_90d: claim.entity_prior_claim_value,
    // velocity_30d × 3 ≈ a 90d rate proxy for predicates that compare windows.
    claim_count_90d: claim.entity_velocity_30d * 3 + claim.entity_prior_claim_count,
    risk_band: deriveRiskBand(claim),
  };
}

export function evaluatePredicate(
  context: EvaluationContext,
  predicate: Predicate,
): boolean {
  const value = (context as unknown as Record<string, unknown>)[predicate.field];
  const expected = predicate.value;

  switch (predicate.op) {
    case 'gte':
      return typeof value === 'number' && typeof expected === 'number' && value >= expected;
    case 'lte':
      return typeof value === 'number' && typeof expected === 'number' && value <= expected;
    case 'eq':
      return value === expected;
    case 'in':
      return Array.isArray(expected) && (expected as PredicateValue[]).includes(
        value as never,
      );
    case 'between': {
      if (
        !Array.isArray(expected) ||
        expected.length !== 2 ||
        typeof value !== 'number'
      )
        return false;
      const [lo, hi] = expected as [number, number];
      return value >= lo && value <= hi;
    }
  }
}

export function evaluateTier(claim: Claim, policy: Policy): TierId {
  assertNoLeakage(claim);
  const context = deriveContext(claim);

  // Walk tiers in declared order. Return first whose entry_conditions all pass.
  // T1 first → most permissive wins. T5 last → only critical+high-value fall here.
  // If nothing matches, fall back to T2 (standard). That is the safe default.
  for (const tier of policy.tiers) {
    const allPass = tier.entry_conditions.every((p) => evaluatePredicate(context, p));
    if (allPass) return tier.id;
  }
  return 'T2';
}

function emptyDistribution(): Record<TierId, number> {
  return { T1: 0, T2: 0, T3: 0, T4: 0, T5: 0 };
}

// Synthesize a guardrail signal from the run distribution. Shadow-mode only.
// The threshold strings are matched as substrings; not a real arithmetic
// comparison engine. This is portfolio-grade visibility, not production
// alerting infra.
function readGuardrails(
  policy: Policy,
  distribution: Record<TierId, number>,
  totalClaims: number,
): GuardrailReading[] {
  const t5Pct = totalClaims === 0 ? 0 : (distribution.T5 / totalClaims) * 100;
  const t4Pct = totalClaims === 0 ? 0 : (distribution.T4 / totalClaims) * 100;
  const evidenceLoadPct =
    totalClaims === 0
      ? 0
      : ((distribution.T3 + distribution.T4 + distribution.T5) / totalClaims) * 100;

  return policy.guardrails.map((g) => {
    let value: number | null = null;
    let tripped = false;

    if (g.id === 'G1') {
      value = t5Pct;
      tripped = t5Pct > 20;
    } else if (g.id === 'G2') {
      value = Math.max(0, t5Pct - 1.5);
      tripped = t5Pct > 1.5 && t5Pct < 5;
    } else if (g.id === 'G3') {
      // Cold-start denial share proxy: T5 share when total claims include short-tenure entities.
      value = t5Pct * 0.45;
      tripped = value > 15;
    } else if (g.id === 'G4') {
      // Manual review p90 proxy: scales with T4 share.
      value = 24 + t4Pct * 4;
      tripped = value > 72;
    } else if (g.id === 'G5') {
      // CSAT drop proxy: rises with evidence-load %.
      value = evidenceLoadPct * 0.08;
      tripped = value > 5;
    }

    return {
      id: g.id,
      label: g.label,
      value,
      threshold: g.threshold,
      tripped,
    };
  });
}

export function runPolicy(claims: Claim[], policy: Policy): RunResult {
  const distribution = emptyDistribution();
  let recoveryUSD = 0;

  for (const claim of claims) {
    const tier = evaluateTier(claim, policy);
    distribution[tier] += 1;
    // Recovery = claim value sitting in T3 / T4 / T5.
    if (tier === 'T3' || tier === 'T4' || tier === 'T5') {
      recoveryUSD += claim.claim_value;
    }
  }

  return {
    totalClaims: claims.length,
    distribution,
    recoveryUSD: Math.round(recoveryUSD * 100) / 100,
    guardrails: readGuardrails(policy, distribution, claims.length),
  };
}
