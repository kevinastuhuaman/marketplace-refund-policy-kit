import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../..');

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  '.vite',
  '.vercel',
  '.cache',
  'coverage',
]);

const SKIP_FILES = new Set([
  'scrub.test.ts', // self-reference exempt
  'package-lock.json', // hash collisions
]);

const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.ico']);

const FORBIDDEN: { label: string; pattern: RegExp }[] = [
  { label: 'whatnot', pattern: /whatnot/i },
  { label: 'meg', pattern: /\bmeg\b/i },
  { label: 'foley', pattern: /\bfoley\b/i },
  { label: 'ashby', pattern: /\bashby\b/i },
  { label: 'commerce s&o', pattern: /commerce\s*s&o/i },
  { label: 'whatnot_refund', pattern: /whatnot_refund/i },
  { label: '22413', pattern: /\b22413\b/ },
  { label: '11697', pattern: /\b11697\b/ },
  { label: '10716', pattern: /\b10716\b/ },
  { label: '2697', pattern: /\b2697\b/ },
  { label: 'b_a_*', pattern: /\bb_a_\d/i },
  { label: 'refund-policy.kevinastuhuaman', pattern: /refund-policy\.kevinastuhuaman/i },
];

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = resolve(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (st.isFile()) {
      yield full;
    }
  }
}

describe.each(FORBIDDEN)('scrub: $label', ({ label, pattern }) => {
  it(`no file contains "${label}"`, () => {
    const hits: string[] = [];
    for (const file of walk(REPO_ROOT)) {
      const base = relative(REPO_ROOT, file);
      const fname = base.split('/').pop() ?? '';
      if (SKIP_FILES.has(fname)) continue;
      if (BINARY_EXT.has(extname(file))) continue;
      let text: string;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        if (pattern.test(lines[i])) {
          hits.push(`${base}:${i + 1}: ${lines[i].trim().slice(0, 100)}`);
        }
      }
    }
    expect(hits, `Forbidden pattern "${label}" found:\n${hits.slice(0, 10).join('\n')}`).toEqual([]);
  });
});
