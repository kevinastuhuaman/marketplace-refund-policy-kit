import type { RunResult } from '../../engine';
import RecoveryHero from './RecoveryHero';
import TierDistribution from './TierDistribution';
import GuardrailGrid from './GuardrailGrid';

export default function ResultsPanel({ result }: { result: RunResult }): JSX.Element {
  return (
    <section className="panel results-panel" aria-label="Results">
      <h2 className="panel-h">Live results</h2>
      <p className="panel-sub">Recomputed on every threshold change.</p>
      <RecoveryHero result={result} />
      <TierDistribution distribution={result.distribution} total={result.totalClaims} />
      <GuardrailGrid guardrails={result.guardrails} />
    </section>
  );
}
