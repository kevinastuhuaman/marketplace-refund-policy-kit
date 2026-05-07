// Zod schema mirroring policy.yaml. Validates rectangularity, tier completeness,
// guardrail count, rollout checkpoints, and the anti-leakage rule on predicate
// field names. Loader fails fast with the offending path + remediation hint.

import { z } from 'zod';
import yaml from 'js-yaml';
import type { Policy } from './types';
import { ALLOWED_PREDICATE_FIELDS } from './types';

const TIER_IDS = ['T1', 'T2', 'T3', 'T4', 'T5'] as const;
const ACTIONS = [
  'auto_approve',
  'request_evidence',
  'manual_review',
  'deny',
  'deny_with_appeal',
] as const;
const EVIDENCE_TYPES = [
  'photo_visual',
  'communication_log',
  'third_party_record',
  'none_provided',
] as const;
const RISK_BANDS = ['low', 'medium', 'high', 'critical'] as const;
const PAUSE_ACTIONS = [
  'halt_auto_approve',
  'downshift_tier',
  'page_oncall',
  'freeze_rollout',
] as const;
const PREDICATE_OPS = ['gte', 'lte', 'eq', 'in', 'between'] as const;
const CHECKPOINTS = ['D30', 'D60', 'D90'] as const;

// Block any field name that looks like a post-event outcome variable.
const LEAKAGE_REGEX = /(outcome|approved|denied|resolved|was_)/i;

const predicateValueSchema = z.union([
  z.number(),
  z.string(),
  z.array(z.union([z.number(), z.string()])),
]);

const predicateSchema = z
  .object({
    field: z.string(),
    op: z.enum(PREDICATE_OPS),
    value: predicateValueSchema,
  })
  .superRefine((p, ctx) => {
    if (LEAKAGE_REGEX.test(p.field)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Predicate field "${p.field}" looks like a post-event outcome variable (matches /(outcome|approved|denied|resolved|was_)/). The anti-leakage rule rejects it.`,
      });
    }
    if (!ALLOWED_PREDICATE_FIELDS.includes(p.field as never)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Predicate field "${p.field}" is not in ALLOWED_PREDICATE_FIELDS. Allowed: ${ALLOWED_PREDICATE_FIELDS.join(', ')}.`,
      });
    }
    if (p.op === 'between' && (!Array.isArray(p.value) || p.value.length !== 2)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'between operator requires a 2-element array',
      });
    }
    if (p.op === 'in' && !Array.isArray(p.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'in operator requires an array value',
      });
    }
  });

const pathBackSchema = z.object({
  condition: z.string().min(1),
  window_days: z.number().int().nonnegative(),
});

const tierSchema = z.object({
  id: z.enum(TIER_IDS),
  name: z.string().min(1),
  entry_conditions: z.array(predicateSchema).min(1),
  action: z.enum(ACTIONS),
  sla_hours: z.number().int().nonnegative(),
  path_back: pathBackSchema,
});

// Cell can be a bare tier id ("T3") or an escalation arrow ("T4 -> T5").
const cellSchema = z.string().transform((raw, ctx) => {
  const arrow = raw.split('->').map((s) => s.trim());
  if (arrow.length === 1) {
    if (!(TIER_IDS as readonly string[]).includes(arrow[0])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Cell value "${raw}" is not a valid tier id`,
      });
      return z.NEVER;
    }
    return arrow[0] as Policy['tiers'][number]['id'];
  }
  if (arrow.length === 2) {
    const [primary, escalate_to] = arrow;
    if (
      !(TIER_IDS as readonly string[]).includes(primary) ||
      !(TIER_IDS as readonly string[]).includes(escalate_to)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Escalation cell "${raw}" references unknown tier`,
      });
      return z.NEVER;
    }
    if (primary === escalate_to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Escalation must move to a different tier (got "${raw}")`,
      });
      return z.NEVER;
    }
    return {
      primary: primary as Policy['tiers'][number]['id'],
      escalate_to: escalate_to as Policy['tiers'][number]['id'],
    };
  }
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: `Malformed cell value "${raw}"`,
  });
  return z.NEVER;
});

const evidenceMatrixSchema = z
  .object({
    evidence_types: z
      .array(z.enum(EVIDENCE_TYPES))
      .length(4, 'evidence_types must have exactly 4 entries'),
    risk_bands: z
      .array(z.enum(RISK_BANDS))
      .length(4, 'risk_bands must have exactly 4 entries'),
    cells: z.record(z.string(), z.record(z.string(), cellSchema)),
  })
  .superRefine((m, ctx) => {
    for (const et of m.evidence_types) {
      const row = m.cells[et];
      if (!row) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Missing evidence_matrix row "${et}"`,
        });
        continue;
      }
      for (const rb of m.risk_bands) {
        if (!(rb in row)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `evidence_matrix["${et}"] missing risk band "${rb}"`,
          });
        }
      }
    }
  });

const guardrailSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  signal: z.string().min(1),
  threshold: z.string().min(1),
  owner: z.string().min(1),
  pause_action: z.enum(PAUSE_ACTIONS),
});

const rolloutCheckpointSchema = z.object({
  checkpoint: z.enum(CHECKPOINTS),
  target_metrics: z.array(z.string().min(1)).min(1),
  owner_teams: z.array(z.string().min(1)).min(1),
});

export const policySchema = z
  .object({
    version: z.number().int().positive(),
    metadata: z.object({
      author: z.string().min(1),
      last_calibrated: z.string().min(1),
      notes: z.string().min(1),
    }),
    tiers: z.array(tierSchema),
    evidence_matrix: evidenceMatrixSchema,
    guardrails: z.array(guardrailSchema),
    rollout: z.array(rolloutCheckpointSchema),
  })
  .superRefine((p, ctx) => {
    // Tier completeness: exactly 5 tiers with ids T1..T5.
    const ids = p.tiers.map((t) => t.id);
    for (const required of TIER_IDS) {
      if (!ids.includes(required)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Missing required tier "${required}"`,
        });
      }
    }
    if (p.tiers.length !== TIER_IDS.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `tiers must have exactly 5 entries, got ${p.tiers.length}`,
      });
    }
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'tier ids must be unique',
      });
    }

    // Guardrails: 5 to 6.
    if (p.guardrails.length < 5 || p.guardrails.length > 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `guardrails count must be 5 or 6, got ${p.guardrails.length}`,
      });
    }
    const guardrailIds = p.guardrails.map((g) => g.id);
    if (new Set(guardrailIds).size !== guardrailIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'guardrail ids must be unique',
      });
    }

    // Rollout: exactly D30, D60, D90 in order.
    const checkpoints = p.rollout.map((r) => r.checkpoint);
    if (
      checkpoints.length !== 3 ||
      checkpoints[0] !== 'D30' ||
      checkpoints[1] !== 'D60' ||
      checkpoints[2] !== 'D90'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `rollout must contain D30, D60, D90 in order, got [${checkpoints.join(', ')}]`,
      });
    }
  });

export function parsePolicy(yamlString: string): Policy {
  const raw = yaml.load(yamlString);
  const parsed = policySchema.parse(raw);
  return parsed as unknown as Policy;
}
