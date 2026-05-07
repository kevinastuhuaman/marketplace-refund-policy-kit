import { create } from 'zustand';
import type { Claim, Policy, RunResult } from '../engine';
import { runPolicy } from '../engine';

export type PresetName = 'conservative' | 'moderate' | 'aggressive' | 'custom';

export interface ThresholdMap {
  t1_trust_score_min: number;
  t2_claim_count_max: number;
  t3_claim_count_max: number;
  t4_claim_count_min: number;
  t5_cumulative_value_min: number;
}

const DEFAULTS: ThresholdMap = {
  t1_trust_score_min: 0.85,
  t2_claim_count_max: 1,
  t3_claim_count_max: 4,
  t4_claim_count_min: 5,
  t5_cumulative_value_min: 1000,
};

const PRESETS: Record<Exclude<PresetName, 'custom'>, ThresholdMap> = {
  conservative: {
    t1_trust_score_min: 0.75,
    t2_claim_count_max: 2,
    t3_claim_count_max: 5,
    t4_claim_count_min: 6,
    t5_cumulative_value_min: 2000,
  },
  moderate: { ...DEFAULTS },
  aggressive: {
    t1_trust_score_min: 0.92,
    t2_claim_count_max: 1,
    t3_claim_count_max: 3,
    t4_claim_count_min: 4,
    t5_cumulative_value_min: 500,
  },
};

interface SimulatorStore {
  policy: Policy | null;
  claims: Claim[] | null;
  thresholds: ThresholdMap;
  preset: PresetName;
  status: 'loading' | 'ready' | 'error';
  errorMessage: string | null;
  baselineResult: RunResult | null;

  setPolicy(p: Policy): void;
  setClaims(c: Claim[]): void;
  setThreshold<K extends keyof ThresholdMap>(key: K, v: ThresholdMap[K]): void;
  applyPreset(name: Exclude<PresetName, 'custom'>): void;
  setError(msg: string): void;
}

function thresholdsEqual(a: ThresholdMap, b: ThresholdMap): boolean {
  return (Object.keys(a) as (keyof ThresholdMap)[]).every((k) => a[k] === b[k]);
}

function detectPreset(t: ThresholdMap): PresetName {
  for (const name of ['moderate', 'conservative', 'aggressive'] as const) {
    if (thresholdsEqual(t, PRESETS[name])) return name;
  }
  return 'custom';
}

// Apply slider values to a deep-cloned policy. Override the relevant predicate
// `value` slots so the engine sees a modified policy without mutating state.
export function applyThresholds(policy: Policy, t: ThresholdMap): Policy {
  const next: Policy = JSON.parse(JSON.stringify(policy));
  for (const tier of next.tiers) {
    for (const cond of tier.entry_conditions) {
      if (tier.id === 'T1' && cond.field === 'trust_score' && cond.op === 'gte') {
        cond.value = t.t1_trust_score_min;
      }
      if (tier.id === 'T2' && cond.field === 'claim_count_90d' && cond.op === 'lte') {
        cond.value = t.t2_claim_count_max;
      }
      if (tier.id === 'T3' && cond.field === 'claim_count_90d' && cond.op === 'between') {
        const [lo] = cond.value as [number, number];
        cond.value = [lo, t.t3_claim_count_max];
      }
      if (tier.id === 'T4' && cond.field === 'claim_count_90d' && cond.op === 'gte') {
        cond.value = t.t4_claim_count_min;
      }
      if (tier.id === 'T5' && cond.field === 'cumulative_event_value_90d' && cond.op === 'gte') {
        cond.value = t.t5_cumulative_value_min;
      }
    }
  }
  return next;
}

export function evaluate(
  policy: Policy | null,
  claims: Claim[] | null,
  thresholds: ThresholdMap,
): RunResult | null {
  if (policy === null || claims === null) return null;
  const adjusted = applyThresholds(policy, thresholds);
  return runPolicy(claims, adjusted);
}

export const useStore = create<SimulatorStore>((set) => ({
  policy: null,
  claims: null,
  thresholds: { ...DEFAULTS },
  preset: 'moderate',
  status: 'loading',
  errorMessage: null,
  baselineResult: null,

  setPolicy(p) {
    set({ policy: p });
  },
  setClaims(claims) {
    set((s) => {
      const baseline =
        s.policy !== null ? runPolicy(claims, s.policy) : null;
      return {
        claims,
        baselineResult: baseline,
        status: s.policy !== null && claims !== null ? 'ready' : s.status,
      };
    });
  },
  setThreshold(key, v) {
    set((s) => {
      const next = { ...s.thresholds, [key]: v };
      return { thresholds: next, preset: detectPreset(next) };
    });
  },
  applyPreset(name) {
    set({ thresholds: { ...PRESETS[name] }, preset: name });
  },
  setError(msg) {
    set({ status: 'error', errorMessage: msg });
  },
}));

export { DEFAULTS, PRESETS };
