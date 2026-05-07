import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePolicy } from '../../src/engine/schema';
import { evaluateTier, runPolicy, deriveContext, deriveRiskBand } from '../../src/engine/evaluate';
import type { Claim } from '../../src/engine/types';

const POLICY = parsePolicy(readFileSync(resolve(__dirname, '../../policy.yaml'), 'utf8'));

function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    claim_id: 'CLM-test-000001',
    entity_id: 'ENT-0001',
    created_at: '2026-04-01T00:00:00Z',
    claim_value: 50,
    claim_reason: 'not_as_described',
    evidence_type: 'photo_visual',
    channel: 'live_event',
    entity_tenure_days: 200,
    entity_total_activity_count: 30,
    entity_prior_claim_count: 0,
    entity_prior_claim_value: 0,
    entity_prior_claim_rate: 0,
    entity_expected_event_rate: 0.05,
    entity_observed_event_rate: 0.03,
    entity_rate_zscore: 0,
    entity_velocity_30d: 0,
    entity_distinct_counterparties_30d: 0,
    ...overrides,
  };
}

describe('deriveRiskBand', () => {
  it('maps z-scores into bands', () => {
    expect(deriveRiskBand(makeClaim({ entity_rate_zscore: 0 }))).toBe('low');
    expect(deriveRiskBand(makeClaim({ entity_rate_zscore: 1.5 }))).toBe('medium');
    expect(deriveRiskBand(makeClaim({ entity_rate_zscore: 3 }))).toBe('high');
    expect(deriveRiskBand(makeClaim({ entity_rate_zscore: 6 }))).toBe('critical');
  });
});

describe('evaluateTier', () => {
  it('routes a clean low-risk claim to T1', () => {
    const claim = makeClaim({
      entity_rate_zscore: -0.5,
      entity_prior_claim_value: 10,
      entity_velocity_30d: 0,
      entity_prior_claim_count: 0,
    });
    expect(evaluateTier(claim, POLICY)).toBe('T1');
  });

  it('routes a critical-band high-cumulative claim to T5', () => {
    const claim = makeClaim({
      entity_rate_zscore: 6,
      entity_prior_claim_value: 2000,
      entity_velocity_30d: 4,
      entity_prior_claim_count: 5,
    });
    expect(evaluateTier(claim, POLICY)).toBe('T5');
  });

  it('respects predicate ordering (T1 wins over T2 on overlap)', () => {
    const claim = makeClaim({
      entity_rate_zscore: -1,
      entity_prior_claim_value: 50,
      entity_velocity_30d: 0,
    });
    expect(evaluateTier(claim, POLICY)).toBe('T1');
  });
});

describe('runPolicy', () => {
  it('returns a distribution that sums to total claim count', () => {
    const claims: Claim[] = [
      makeClaim({ claim_id: 'C1', entity_rate_zscore: 0 }),
      makeClaim({ claim_id: 'C2', entity_rate_zscore: 5, entity_prior_claim_value: 1500, entity_prior_claim_count: 6 }),
      makeClaim({ claim_id: 'C3', entity_rate_zscore: 1.5, entity_velocity_30d: 1 }),
    ];
    const result = runPolicy(claims, POLICY);
    const total = Object.values(result.distribution).reduce((s, n) => s + n, 0);
    expect(total).toBe(claims.length);
    expect(result.totalClaims).toBe(claims.length);
  });

  it('only counts T3/T4/T5 claim values toward recoveryUSD', () => {
    const t1Claim = makeClaim({ claim_id: 'L', claim_value: 200, entity_rate_zscore: -1, entity_prior_claim_value: 5 });
    const t5Claim = makeClaim({
      claim_id: 'H',
      claim_value: 300,
      entity_rate_zscore: 6,
      entity_prior_claim_value: 2000,
      entity_prior_claim_count: 6,
    });
    const result = runPolicy([t1Claim, t5Claim], POLICY);
    expect(result.distribution.T1).toBeGreaterThanOrEqual(1);
    expect(result.distribution.T5).toBeGreaterThanOrEqual(1);
    expect(result.recoveryUSD).toBeCloseTo(300, 2);
  });
});

describe('deriveContext anti-leakage', () => {
  it('throws if a Claim is forged with an outcome-named field', () => {
    const claim = makeClaim();
    const leaky = { ...claim, was_approved: true } as unknown as Claim;
    expect(() => evaluateTier(leaky, POLICY)).toThrow(/outcome/i);
  });

  it('returns a stable context for a stable claim', () => {
    const claim = makeClaim({ entity_rate_zscore: 1.2, entity_prior_claim_value: 75 });
    const a = deriveContext(claim);
    const b = deriveContext(claim);
    expect(a).toEqual(b);
  });
});
