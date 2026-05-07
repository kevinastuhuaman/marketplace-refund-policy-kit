import Papa from 'papaparse';
import type { Claim, Policy } from '../../engine';
import { parsePolicy } from '../../engine';

export async function loadPolicy(): Promise<Policy> {
  const res = await fetch('/policy.yaml', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`failed to fetch policy.yaml: HTTP ${res.status}`);
  }
  const text = await res.text();
  return parsePolicy(text);
}

export async function loadClaims(): Promise<Claim[]> {
  const res = await fetch('/example-data/claims.csv', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`failed to fetch example-data/claims.csv: HTTP ${res.status}`);
  }
  const text = await res.text();
  const parsed = Papa.parse<Claim>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0) {
    throw new Error(`CSV parse failed: ${parsed.errors[0].message}`);
  }
  return parsed.data;
}
