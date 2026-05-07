import type { TierId } from '../../engine';

interface Props {
  distribution: Record<TierId, number>;
  total: number;
}

const TIERS: { id: TierId; label: string; sub: string }[] = [
  { id: 'T1', label: 'T1', sub: 'auto-approve' },
  { id: 'T2', label: 'T2', sub: 'standard' },
  { id: 'T3', label: 'T3', sub: 'evidence required' },
  { id: 'T4', label: 'T4', sub: 'manual review' },
  { id: 'T5', label: 'T5', sub: 'deny + appeal' },
];

export default function TierDistribution({ distribution, total }: Props): JSX.Element {
  return (
    <div className="dist">
      <div className="dist-head">
        <span>Tier distribution</span>
        <span className="dist-total">{total} claims</span>
      </div>
      <div className="dist-rows">
        {TIERS.map((t) => {
          const count = distribution[t.id];
          const pct = total === 0 ? 0 : (count / total) * 100;
          return (
            <div key={t.id} className={`dist-row dist-${t.id.toLowerCase()}`}>
              <div className="dist-label">
                <span className="dist-id">{t.label}</span>
                <span className="dist-sub">{t.sub}</span>
              </div>
              <div className="dist-bar-wrap">
                <div
                  className="dist-bar"
                  style={{ width: `${Math.max(pct, 1)}%` }}
                  aria-hidden="true"
                />
              </div>
              <div className="dist-numbers">
                <span className="dist-pct">{pct.toFixed(1)}%</span>
                <span className="dist-count">{count}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
