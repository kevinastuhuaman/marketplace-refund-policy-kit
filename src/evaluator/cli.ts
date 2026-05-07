// Shadow-mode evaluator CLI: read policy.yaml + claims.csv, run the engine,
// print tier distribution + guardrail readings + recovery $ estimate.

import { readFileSync, writeFileSync } from 'node:fs';
import Papa from 'papaparse';
import { parsePolicy, runPolicy } from '../engine';
import type { Claim } from '../engine';

interface Args {
  policy: string;
  claims: string;
  output: string | null;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    policy: 'policy.yaml',
    claims: 'example-data/claims.csv',
    output: null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--policy') a.policy = argv[++i];
    else if (arg === '--claims') a.claims = argv[++i];
    else if (arg === '--output') a.output = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: tsx src/evaluator/cli.ts [--policy policy.yaml] [--claims example-data/claims.csv] [--output results.json]',
      );
      process.exit(0);
    }
  }
  return a;
}

function loadClaims(path: string): Claim[] {
  const csv = readFileSync(path, 'utf8');
  const parsed = Papa.parse<Claim>(csv, { header: true, dynamicTyping: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    throw new Error(`Failed to parse claims CSV: ${parsed.errors[0].message}`);
  }
  return parsed.data;
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

function fmtUSD(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function main(): void {
  const args = parseArgs(process.argv);
  const policyYaml = readFileSync(args.policy, 'utf8');
  const policy = parsePolicy(policyYaml);
  const claims = loadClaims(args.claims);
  const result = runPolicy(claims, policy);

  console.log('');
  console.log(`Policy: ${args.policy}  (version ${policy.version}, calibrated ${policy.metadata.last_calibrated})`);
  console.log(`Claims: ${args.claims}  (${result.totalClaims} rows)`);
  console.log('');

  console.log('Tier distribution');
  console.log('─────────────────');
  for (const [tier, count] of Object.entries(result.distribution)) {
    const pct = result.totalClaims === 0 ? 0 : (count / result.totalClaims) * 100;
    const bar = '█'.repeat(Math.round(pct / 2));
    console.log(
      `${pad(tier, 4)} ${pad(`${count}`, 5)} ${pad(`${pct.toFixed(1)}%`, 7)} ${bar}`,
    );
  }
  console.log('');

  console.log('Guardrails (shadow mode)');
  console.log('────────────────────────');
  for (const g of result.guardrails) {
    const status = g.tripped ? '✗ TRIP' : '✓ clear';
    const valueStr = g.value === null ? 'n/a' : g.value.toFixed(2);
    console.log(`${pad(g.id, 4)} ${pad(g.label, 32)} ${pad(valueStr, 8)} ${status}  (threshold: ${g.threshold})`);
  }
  console.log('');

  console.log(`Recovery estimate (T3+T4+T5 claim value): ${fmtUSD(result.recoveryUSD)}`);
  console.log('');

  if (args.output !== null) {
    writeFileSync(args.output, JSON.stringify(result, null, 2));
    console.log(`Full result written to: ${args.output}`);
  }
}

main();
