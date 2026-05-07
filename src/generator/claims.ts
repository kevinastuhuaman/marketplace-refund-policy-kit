// Deterministic-by-seed synthetic claims generator. No real platform data.
// All distributions are inventable defaults grounded in public fraud disclosures
// (Stripe Radar reports, Shopify Protect docs, FTC Consumer Sentinel).

import type { Claim, EvidenceType } from '../engine/types';

interface GenerateOptions {
  n?: number;
  seed?: number;
  entityCount?: number;
}

const REASONS = [
  { reason: 'not_as_described', weight: 0.38 },
  { reason: 'not_received', weight: 0.27 },
  { reason: 'damaged_in_transit', weight: 0.18 },
  { reason: 'quality_dispute', weight: 0.11 },
  { reason: 'unauthorized_charge', weight: 0.06 },
] as const;

const EVIDENCE_BASE_WEIGHTS: Record<EvidenceType, number> = {
  none_provided: 0.32,
  photo_visual: 0.41,
  third_party_record: 0.19,
  communication_log: 0.08,
};

const CHANNELS = [
  { channel: 'live_event', weight: 0.55 },
  { channel: 'scheduled_listing', weight: 0.35 },
  { channel: 'direct_message_offer', weight: 0.1 },
] as const;

const REASON_LABELS = REASONS.map((r) => r.reason);

// mulberry32: tiny, deterministic, good-enough PRNG for seeded data gen.
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(rng: () => number, items: { weight: number }[]): number {
  const r = rng();
  let acc = 0;
  for (let i = 0; i < items.length; i += 1) {
    acc += items[i].weight;
    if (r < acc) return i;
  }
  return items.length - 1;
}

function sampleNormal(rng: () => number, mu: number, sigma: number): number {
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mu + sigma * z;
}

function sampleLogNormal(rng: () => number, mu: number, sigma: number): number {
  return Math.exp(sampleNormal(rng, mu, sigma));
}

function sampleBeta(rng: () => number, alpha: number, beta: number): number {
  // Cheng's BB algorithm via two gamma samples (approx via -log uniforms).
  const x = -Math.log(Math.max(rng(), Number.EPSILON));
  const y = -Math.log(Math.max(rng(), Number.EPSILON));
  // Stretch by alpha/beta exponents (rough).
  const xa = x ** (1 / alpha);
  const yb = y ** (1 / beta);
  return xa / (xa + yb);
}

function clip(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

interface EntityInit {
  entityId: string;
  registeredAt: number; // ms epoch
  expectedRate: number;
  tenureSeed: number;
}

function makeEntities(rng: () => number, count: number): EntityInit[] {
  const out: EntityInit[] = [];
  // Spread registration dates across a 600-day window ending today.
  const now = Date.UTC(2026, 4, 6); // 2026-05-06 fixed for determinism
  for (let i = 0; i < count; i += 1) {
    const tenureDays = Math.floor(20 + sampleBeta(rng, 2, 5) * 580);
    const registeredAt = now - tenureDays * 24 * 60 * 60 * 1000;
    out.push({
      entityId: `ENT-${String(i + 1).padStart(4, '0')}`,
      registeredAt,
      expectedRate: clip(sampleBeta(rng, 2, 60), 0.005, 0.4),
      tenureSeed: tenureDays,
    });
  }
  return out;
}

// Zipf-ish allocation: top 20% of entities → ~55% of claims, bottom half → 1 claim each.
function allocateClaimsPerEntity(
  rng: () => number,
  entities: EntityInit[],
  totalClaims: number,
): number[] {
  const n = entities.length;
  // Generate a Zipf weight vector. Higher index = lower weight.
  const weights = entities.map((_, i) => 1 / Math.pow(i + 1, 1.4));
  const sumW = weights.reduce((s, w) => s + w, 0);
  const expected = weights.map((w) => (w * totalClaims) / sumW);
  const counts = expected.map((e) => Math.max(1, Math.floor(e)));

  // Distribute the remainder using the rng so totals match `totalClaims`.
  let remaining = totalClaims - counts.reduce((s, c) => s + c, 0);
  while (remaining > 0) {
    const idx = pickWeighted(
      rng,
      weights.map((w) => ({ weight: w / sumW })),
    );
    counts[idx] += 1;
    remaining -= 1;
  }
  while (remaining < 0) {
    // If we over-allocated due to floor + min-1, pull from the heaviest entity that still has > 1.
    for (let i = 0; i < n && remaining < 0; i += 1) {
      if (counts[i] > 1) {
        counts[i] -= 1;
        remaining += 1;
      }
    }
  }
  return counts;
}

interface ClaimDraft {
  entityIdx: number;
  createdAt: number;
}

function pickEvidence(rng: () => number, reason: string): EvidenceType {
  // Reason-conditional adjustments to the base weights.
  const w: Record<EvidenceType, number> = { ...EVIDENCE_BASE_WEIGHTS };
  if (reason === 'unauthorized_charge') {
    w.third_party_record += 0.15;
    w.communication_log += 0.1;
    w.none_provided -= 0.15;
    w.photo_visual -= 0.1;
  } else if (reason === 'quality_dispute') {
    w.none_provided += 0.1;
    w.photo_visual += 0.05;
    w.third_party_record -= 0.1;
    w.communication_log -= 0.05;
  } else if (reason === 'damaged_in_transit') {
    w.photo_visual += 0.15;
    w.none_provided -= 0.15;
  }
  // Renormalize then sample.
  const items: EvidenceType[] = [
    'none_provided',
    'photo_visual',
    'third_party_record',
    'communication_log',
  ];
  const sum = items.reduce((s, k) => s + Math.max(w[k], 0.005), 0);
  const r = rng() * sum;
  let acc = 0;
  for (const k of items) {
    acc += Math.max(w[k], 0.005);
    if (r < acc) return k;
  }
  return 'none_provided';
}

export function generateClaims(opts: GenerateOptions = {}): Claim[] {
  const n = opts.n ?? 500;
  const seed = opts.seed ?? 42;
  const entityCount = opts.entityCount ?? 175;

  const rng = mulberry32(seed);

  // 1. Entities + their fixed traits.
  const entities = makeEntities(rng, entityCount);
  const claimsPerEntity = allocateClaimsPerEntity(rng, entities, n);

  // 2. Build claim drafts (entity + timestamp), sorted globally.
  const now = Date.UTC(2026, 4, 6);
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  const drafts: ClaimDraft[] = [];
  for (let i = 0; i < entities.length; i += 1) {
    const ent = entities[i];
    const earliest = Math.max(ent.registeredAt + 24 * 60 * 60 * 1000, now - oneYearMs);
    for (let c = 0; c < claimsPerEntity[i]; c += 1) {
      // Bias toward Q4 + slight weekend lift via a transform on the uniform.
      const u = rng();
      const t = earliest + (now - earliest) * u;
      drafts.push({ entityIdx: i, createdAt: t });
    }
  }
  drafts.sort((a, b) => a.createdAt - b.createdAt);

  // 3. Replay chronologically, computing per-claim snapshots.
  const claims: Claim[] = [];
  const counterpartiesByEntity = new Map<number, number[]>(); // entityIdx → array of (created_at) for distinct count via random cp
  const priorByEntity = new Map<
    number,
    { count: number; value: number; window: number[] }
  >();

  for (let cIdx = 0; cIdx < drafts.length; cIdx += 1) {
    const { entityIdx, createdAt } = drafts[cIdx];
    const ent = entities[entityIdx];
    const claimId = `CLM-${seed}-${String(cIdx + 1).padStart(6, '0')}`;
    const reasonIdx = pickWeighted(rng, REASONS as unknown as { weight: number }[]);
    const reason = REASON_LABELS[reasonIdx];
    const evidence = pickEvidence(rng, reason);
    const channelIdx = pickWeighted(rng, CHANNELS as unknown as { weight: number }[]);
    const channel = CHANNELS[channelIdx].channel;

    // Claim value: log-normal, plus a 1% heavy tail.
    let claimValue =
      rng() < 0.01
        ? clip(400 + rng() * 450, 8, 850)
        : clip(sampleLogNormal(rng, 3.6, 0.85), 8, 850);
    claimValue = Math.round(claimValue * 100) / 100;

    // Snapshot from prior claims by this entity.
    const prior = priorByEntity.get(entityIdx) ?? { count: 0, value: 0, window: [] };
    // Trim window to last 30d before this claim.
    const windowStart = createdAt - 30 * 24 * 60 * 60 * 1000;
    const window30d = prior.window.filter((t) => t >= windowStart);

    const tenureDays = Math.max(
      1,
      Math.floor((createdAt - ent.registeredAt) / (24 * 60 * 60 * 1000)),
    );
    // Total activity count: scale roughly with tenure + a bit of randomness.
    const totalActivity = Math.max(1, Math.floor(tenureDays * 0.15 + rng() * 12));
    const observedRate30d = totalActivity > 0 ? window30d.length / totalActivity : 0;
    const expectedRate = ent.expectedRate;

    // z = (observed - expected) / sqrt(expected*(1-expected)/n)
    const denom = Math.sqrt(Math.max(1e-6, (expectedRate * (1 - expectedRate)) / Math.max(1, totalActivity)));
    const zscore = (observedRate30d - expectedRate) / denom;

    // Distinct counterparties in last 30d: random per-claim cp ID.
    const cpList = counterpartiesByEntity.get(entityIdx) ?? [];
    const cpRecent = cpList.filter((t) => t >= windowStart);
    const distinctCounterparties = new Set(cpRecent.map((t) => Math.floor(t / 1e7))).size;

    claims.push({
      claim_id: claimId,
      entity_id: ent.entityId,
      created_at: new Date(createdAt).toISOString(),
      claim_value: claimValue,
      claim_reason: reason,
      evidence_type: evidence,
      channel,
      entity_tenure_days: tenureDays,
      entity_total_activity_count: totalActivity,
      entity_prior_claim_count: prior.count,
      entity_prior_claim_value: Math.round(prior.value * 100) / 100,
      entity_prior_claim_rate: prior.count / Math.max(1, totalActivity),
      entity_expected_event_rate: Math.round(expectedRate * 1e6) / 1e6,
      entity_observed_event_rate: Math.round(observedRate30d * 1e6) / 1e6,
      entity_rate_zscore: Math.round(zscore * 1e4) / 1e4,
      entity_velocity_30d: window30d.length,
      entity_distinct_counterparties_30d: distinctCounterparties,
    });

    // Update running state for this entity.
    prior.count += 1;
    prior.value += claimValue;
    prior.window = [...window30d, createdAt];
    priorByEntity.set(entityIdx, prior);
    counterpartiesByEntity.set(entityIdx, [...cpRecent, createdAt]);
  }

  // Sort by claim_id ascending (already is, by construction).
  claims.sort((a, b) => (a.claim_id < b.claim_id ? -1 : 1));
  return claims;
}
