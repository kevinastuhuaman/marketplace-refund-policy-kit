// Generator CLI: writes example-data/claims.csv (deterministic-by-seed).

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Papa from 'papaparse';
import { generateClaims } from './claims';

interface Args {
  output: string;
  n: number;
  seed: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { output: 'example-data/claims.csv', n: 500, seed: 42 };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--n') args.n = Number(argv[++i]);
    else if (a === '--seed') args.seed = Number(argv[++i]);
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: tsx src/generator/cli.ts [output-path] [--n 500] [--seed 42]',
      );
      process.exit(0);
    } else if (!a.startsWith('--')) args.output = a;
  }
  return args;
}

function main(): void {
  const args = parseArgs(process.argv);
  const claims = generateClaims({ n: args.n, seed: args.seed });
  const csv = Papa.unparse(claims, { header: true });
  mkdirSync(dirname(args.output), { recursive: true });
  writeFileSync(args.output, `${csv}\n`, 'utf8');
  console.log(`Generated ${claims.length} claims → ${args.output}`);
}

main();
