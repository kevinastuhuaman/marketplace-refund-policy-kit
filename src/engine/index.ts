// Public engine API. Single source of truth for tier evaluation, guardrails,
// and policy-shape validation.

export type {
  TierId,
  Action,
  EvidenceType,
  RiskBand,
  PauseAction,
  PredicateOp,
  PredicateValue,
  Predicate,
  PathBack,
  Tier,
  EvidenceCell,
  EvidenceMatrix,
  Guardrail,
  RolloutCheckpoint,
  PolicyMetadata,
  Policy,
  Claim,
  EvaluationContext,
  AllowedPredicateField,
  GuardrailReading,
  RunResult,
} from './types';

export { ALLOWED_PREDICATE_FIELDS } from './types';
export { policySchema, parsePolicy } from './schema';
export {
  deriveContext,
  deriveTrustScore,
  deriveRiskBand,
  evaluatePredicate,
  evaluateTier,
  runPolicy,
} from './evaluate';
