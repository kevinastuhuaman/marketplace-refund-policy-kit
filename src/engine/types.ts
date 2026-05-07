// Pure TypeScript types matching policy.yaml + the synthetic claim shape.
// No runtime deps. The Zod schema in `./schema.ts` mirrors these types and
// performs validation at the YAML/CSV boundary.

export type TierId = 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

export type Action =
  | 'auto_approve'
  | 'request_evidence'
  | 'manual_review'
  | 'deny'
  | 'deny_with_appeal';

export type EvidenceType =
  | 'photo_visual'
  | 'communication_log'
  | 'third_party_record'
  | 'none_provided';

export type RiskBand = 'low' | 'medium' | 'high' | 'critical';

export type PauseAction =
  | 'halt_auto_approve'
  | 'downshift_tier'
  | 'page_oncall'
  | 'freeze_rollout';

export type PredicateOp = 'gte' | 'lte' | 'eq' | 'in' | 'between';

export type PredicateValue = number | string | (number | string)[];

export interface Predicate {
  field: string;
  op: PredicateOp;
  value: PredicateValue;
}

export interface PathBack {
  condition: string;
  window_days: number;
}

export interface Tier {
  id: TierId;
  name: string;
  entry_conditions: Predicate[];
  action: Action;
  sla_hours: number;
  path_back: PathBack;
}

// Cell value can be a tier id or an escalation pair.
export type EvidenceCell =
  | TierId
  | { primary: TierId; escalate_to: TierId };

export interface EvidenceMatrix {
  evidence_types: EvidenceType[];
  risk_bands: RiskBand[];
  cells: Record<EvidenceType, Record<RiskBand, EvidenceCell>>;
}

export interface Guardrail {
  id: string;
  label: string;
  signal: string;
  threshold: string;
  owner: string;
  pause_action: PauseAction;
}

export interface RolloutCheckpoint {
  checkpoint: 'D30' | 'D60' | 'D90';
  target_metrics: string[];
  owner_teams: string[];
}

export interface PolicyMetadata {
  author: string;
  last_calibrated: string;
  notes: string;
}

export interface Policy {
  version: number;
  metadata: PolicyMetadata;
  tiers: Tier[];
  evidence_matrix: EvidenceMatrix;
  guardrails: Guardrail[];
  rollout: RolloutCheckpoint[];
}

// Claim is the row-level synthetic event the simulator + evaluator consume.
// All `entity_*` fields are SNAPSHOTS at claim creation time (anti-leakage).
export interface Claim {
  claim_id: string;
  entity_id: string;
  created_at: string;
  claim_value: number;
  claim_reason: string;
  evidence_type: EvidenceType;
  channel: string;
  entity_tenure_days: number;
  entity_total_activity_count: number;
  entity_prior_claim_count: number;
  entity_prior_claim_value: number;
  entity_prior_claim_rate: number;
  entity_expected_event_rate: number;
  entity_observed_event_rate: number;
  entity_rate_zscore: number;
  entity_velocity_30d: number;
  entity_distinct_counterparties_30d: number;
}

// Derived context the engine evaluates against. Computed from a Claim by
// `deriveContext()`. Fields here are EXACTLY the names allowed in
// policy.yaml predicate `field` slots; the schema validator rejects any
// predicate referencing a name outside this set.
export interface EvaluationContext {
  trust_score: number;
  cumulative_event_value_90d: number;
  claim_count_90d: number;
  risk_band: RiskBand;
}

export const ALLOWED_PREDICATE_FIELDS = [
  'trust_score',
  'cumulative_event_value_90d',
  'claim_count_90d',
  'risk_band',
] as const;
export type AllowedPredicateField = (typeof ALLOWED_PREDICATE_FIELDS)[number];

export interface GuardrailReading {
  id: string;
  label: string;
  value: number | null;
  threshold: string;
  tripped: boolean;
}

export interface RunResult {
  totalClaims: number;
  distribution: Record<TierId, number>;
  recoveryUSD: number;
  guardrails: GuardrailReading[];
}
