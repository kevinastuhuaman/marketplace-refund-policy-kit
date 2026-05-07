import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import Papa from 'papaparse';
import { generateClaims } from '../../src/generator/claims';

// Captured on first deterministic run. If you change the generator, regenerate
// via: node --import tsx -e "import('./src/generator/claims').then(m=>console.log(require('crypto').createHash('sha256').update(require('papaparse').unparse(m.generateClaims({n:500,seed:42}),{header:true})+'\\n').digest('hex')))"
const FROZEN_HASH_N500_SEED42 = 'fdf37ae416bfb1a6b36d9497ba4baf189e74bb01393b5917b6997bc49b9cd793';

function csvOf(rows: object[]): string {
  return `${Papa.unparse(rows, { header: true })}\n`;
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

describe('generateClaims', () => {
  it('produces n rows', () => {
    const claims = generateClaims({ n: 500, seed: 42 });
    expect(claims).toHaveLength(500);
  });

  it('is deterministic by seed', () => {
    const a = csvOf(generateClaims({ n: 200, seed: 42 }));
    const b = csvOf(generateClaims({ n: 200, seed: 42 }));
    expect(sha256(a)).toBe(sha256(b));
  });

  it('produces different output for different seeds', () => {
    const a = csvOf(generateClaims({ n: 200, seed: 1 }));
    const b = csvOf(generateClaims({ n: 200, seed: 2 }));
    expect(sha256(a)).not.toBe(sha256(b));
  });

  it('matches the frozen SHA-256 hash for (n=500, seed=42)', () => {
    const csv = csvOf(generateClaims({ n: 500, seed: 42 }));
    expect(sha256(csv)).toBe(FROZEN_HASH_N500_SEED42);
  });

  it('contains no outcome-leaking column names', () => {
    const claims = generateClaims({ n: 50, seed: 7 });
    const cols = Object.keys(claims[0]);
    const leaky = cols.filter((c) => /(outcome|approved|denied|resolved|was_)/i.test(c));
    expect(leaky).toEqual([]);
  });

  it('claim_id is unique and ascending', () => {
    const claims = generateClaims({ n: 300, seed: 11 });
    const ids = claims.map((c) => c.claim_id);
    expect(new Set(ids).size).toBe(claims.length);
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  it('top 20% of entities account for ≥40% of claims (concentration)', () => {
    const claims = generateClaims({ n: 500, seed: 42 });
    const counts = new Map<string, number>();
    for (const c of claims) counts.set(c.entity_id, (counts.get(c.entity_id) ?? 0) + 1);
    const arr = [...counts.values()].sort((a, b) => b - a);
    const top20 = arr.slice(0, Math.max(1, Math.floor(arr.length * 0.2)));
    const top20Sum = top20.reduce((s, n) => s + n, 0);
    expect(top20Sum / claims.length).toBeGreaterThanOrEqual(0.4);
  });

  it('exercises every (reason × evidence) cell with at least one row', () => {
    const claims = generateClaims({ n: 500, seed: 42 });
    const seen = new Set<string>();
    for (const c of claims) {
      seen.add(`${c.claim_reason}::${c.evidence_type}`);
    }
    expect(seen.size).toBeGreaterThanOrEqual(15);
  });
});
