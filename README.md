# marketplace-refund-policy-kit 🛡️ · Ship a fair refund policy in days, not quarters.

<p align="center">
  <img src="assets/hero.png" alt="marketplace-refund-policy-kit hero" width="1100">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/Zod-3068B7?style=for-the-badge&logo=zod&logoColor=white" alt="Zod">
  <img src="https://img.shields.io/badge/MIT-License-FEE413?style=for-the-badge" alt="MIT">
</p>

<p align="center">
  <a href="https://marketplace-refund-policy-kit.vercel.app"><strong>Live demo</strong></a>
  &nbsp;·&nbsp;
  <a href="policy.yaml"><strong>policy.yaml</strong></a>
  &nbsp;·&nbsp;
  <a href="src/engine">engine source</a>
</p>

A forkable refund-policy framework for any peer-to-peer marketplace. Edit one `policy.yaml` (5-tier ladder, 4×4 evidence matrix, guardrails, 30/60/90 rollout) and the interactive simulator + Node shadow-mode evaluator both pick up the change. No proprietary tier engine, no closed-source SaaS, no model that needs labeled fraud data on day one. Designed for the moment a Commerce / Trust team has telemetry but not enforcement, and needs to ship something defensible by Monday.

## What it does

- Express your refund policy as a single `policy.yaml`: tiers, evidence matrix, guardrails, rollout. Validated by Zod with anti-leakage rules built in (no outcome-named predicate fields).
- Drag five sliders in the browser simulator (Vite + React + Zustand) and watch 500 synthetic claims re-route through your tier ladder in real time.
- Run the same engine in shadow mode from the Node CLI (`tsx src/evaluator/cli.ts`) over historical events, count tier trips and guardrail breaches, write the result to JSON.
- Generate fully synthetic, deterministic-by-seed claim data for demos and tests (`tsx src/generator/cli.ts`). Frozen-hash test in CI catches accidental drift in distributions.
- Refuse to consume any post-event outcome variable. The Zod schema rejects predicate fields matching `/(outcome|approved|denied|resolved|was_)/` so leakage fails at the YAML boundary, not silently in production.

## How it works

```
policy.yaml ──► parsePolicy() ─► Zod validation ─┐
                                                  │
example-data/claims.csv ──► papaparse ────────────┤
                                                  ▼
                                            runPolicy()
                                                  │
                            ┌─────────────────────┼─────────────────────┐
                            ▼                     ▼                     ▼
                     tier distribution    guardrail readings    recovery $ estimate
                            │                     │                     │
                            └─────────────────────┴─────────────────────┘
                                                  ▼
                            ┌─────────────────────┴─────────────────────┐
                            ▼                                           ▼
                     React simulator                            Node CLI evaluator
                  (drag sliders, live UI)                    (shadow-mode, write JSON)
```

Both surfaces import the same pure-TS engine in `src/engine/`. Single source of truth, single set of tests.

## Tech stack

- **Engine:** TypeScript (strict mode), Zod for schema validation, pure functions, zero side effects, runs identically in Node and in the browser.
- **Simulator UI:** Vite + React 18 + Zustand for state. No charting library, no Tailwind. Five sliders, three preset buttons, a results panel that recomputes via `useMemo` on every change.
- **Synthetic data:** Custom seeded mulberry32 PRNG, log-normal claim values, Zipf-style entity concentration. 175 entities, 500 claims, deterministic to the byte for a fixed seed.
- **CLI tools:** `tsx` for instant TypeScript execution. Two commands: `generate` writes a synthetic claims CSV, `evaluate` runs the engine in shadow mode and prints a tier distribution, guardrail status, and recovery dollar estimate.
- **Tests:** Vitest with a frozen-hash determinism test, an anti-leakage test that rejects forged outcome columns, schema validation tests against the real `policy.yaml`, and a repository-wide scrub scan that fails CI on any leak of platform-specific vocabulary.

## What I learned

- The forkable artifact is the policy spec, not the model. Most published fraud tooling ships a scorer and assumes the team will write their own policy on top. Inverting that and shipping a YAML schema with 5 tiers, an evidence matrix, and guardrails turned out to be the part most worth open-sourcing. The simulator is just a UI on top of the schema.
- Anti-leakage belongs at the schema boundary, not in the model. Adding a Zod refinement that rejects predicate field names matching `/(outcome|approved|denied|resolved|was_)/` caught more bugs in 30 minutes than any unit test would in a quarter, because it catches the failure mode before the engine ever runs.
- Determinism is the cheapest way to turn a portfolio repo into a credible artifact. Freezing a SHA-256 hash of the default 500-claim CSV gives every demo, screenshot, and test a stable contract. When pandas, NumPy, or my own generator drifts, the hash fails first and explains itself, instead of leaving a reviewer to wonder whether their environment is wrong.
