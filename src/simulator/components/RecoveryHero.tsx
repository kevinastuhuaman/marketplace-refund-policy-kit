import { useStore } from '../store';
import type { RunResult } from '../../engine';

const fmtUSD = (n: number): string =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function RecoveryHero({ result }: { result: RunResult }): JSX.Element {
  const baseline = useStore((s) => s.baselineResult);
  const baselineRecovery = baseline?.recoveryUSD ?? result.recoveryUSD;
  const delta = result.recoveryUSD - baselineRecovery;
  const deltaPct =
    baselineRecovery === 0 ? 0 : (delta / baselineRecovery) * 100;
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  const absDelta = Math.abs(delta);
  const absPct = Math.abs(deltaPct).toFixed(1);

  return (
    <div className="hero">
      <div className="hero-label">Recoverable refund $ (T3 + T4 + T5)</div>
      <div className="hero-value">{fmtUSD(result.recoveryUSD)}</div>
      <div className={`hero-delta delta-${delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}`}>
        vs. baseline {sign}
        {fmtUSD(absDelta)} ({sign}
        {absPct}%)
      </div>
    </div>
  );
}
