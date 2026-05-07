import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePolicy, policySchema } from '../../src/engine/schema';

const REPO_ROOT = resolve(__dirname, '../..');
const POLICY_PATH = resolve(REPO_ROOT, 'policy.yaml');

describe('policySchema', () => {
  it('parses the canonical policy.yaml', () => {
    const yaml = readFileSync(POLICY_PATH, 'utf8');
    const policy = parsePolicy(yaml);
    expect(policy.version).toBe(1);
    expect(policy.tiers).toHaveLength(5);
    expect(policy.tiers.map((t) => t.id).sort()).toEqual(['T1', 'T2', 'T3', 'T4', 'T5']);
    expect(policy.evidence_matrix.evidence_types).toHaveLength(4);
    expect(policy.evidence_matrix.risk_bands).toHaveLength(4);
    expect(policy.guardrails.length).toBeGreaterThanOrEqual(5);
    expect(policy.guardrails.length).toBeLessThanOrEqual(6);
    expect(policy.rollout.map((r) => r.checkpoint)).toEqual(['D30', 'D60', 'D90']);
  });

  it('rejects a policy missing T5', () => {
    const yaml = readFileSync(POLICY_PATH, 'utf8');
    const broken = yaml.replace(/- id: T5[\s\S]*?window_days: 120\n/, '');
    expect(() => parsePolicy(broken)).toThrow();
  });

  it('rejects a non-rectangular evidence matrix', () => {
    const yaml = readFileSync(POLICY_PATH, 'utf8');
    // Drop the "critical" key from one row.
    const broken = yaml.replace(/      critical: T4 -> T5\n/, '');
    expect(() => parsePolicy(broken)).toThrow();
  });

  it('rejects a predicate field name that looks like an outcome variable', () => {
    const leaky = {
      version: 1,
      metadata: {
        author: 'x',
        last_calibrated: '2026-01-01',
        notes: 'leaky',
      },
      tiers: [
        {
          id: 'T1',
          name: 'auto_approve',
          entry_conditions: [{ field: 'is_approved', op: 'eq', value: 1 }],
          action: 'auto_approve',
          sla_hours: 0,
          path_back: { condition: 'x', window_days: 1 },
        },
      ],
      evidence_matrix: {
        evidence_types: ['photo_visual', 'communication_log', 'third_party_record', 'none_provided'],
        risk_bands: ['low', 'medium', 'high', 'critical'],
        cells: {
          photo_visual: { low: 'T1', medium: 'T1', high: 'T1', critical: 'T1' },
          communication_log: { low: 'T1', medium: 'T1', high: 'T1', critical: 'T1' },
          third_party_record: { low: 'T1', medium: 'T1', high: 'T1', critical: 'T1' },
          none_provided: { low: 'T1', medium: 'T1', high: 'T1', critical: 'T1' },
        },
      },
      guardrails: [],
      rollout: [],
    };
    const result = policySchema.safeParse(leaky);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(' | ');
      expect(messages.toLowerCase()).toMatch(/leakage|allowed_predicate_fields|approved/);
    }
  });
});
