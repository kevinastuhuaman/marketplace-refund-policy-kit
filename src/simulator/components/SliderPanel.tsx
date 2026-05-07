import { useStore } from '../store';
import type { ThresholdMap } from '../store';

interface SliderConfig {
  key: keyof ThresholdMap;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  fmt: (n: number) => string;
}

const fmtUSD = (n: number): string =>
  `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const fmtFloat = (n: number): string => n.toFixed(2);
const fmtInt = (n: number): string => `${Math.round(n)}`;

const SLIDERS: SliderConfig[] = [
  {
    key: 't1_trust_score_min',
    label: 'T1 trust score floor',
    description: 'Auto-approve threshold. Higher = fewer claims auto-approved.',
    min: 0.5,
    max: 1.0,
    step: 0.01,
    fmt: fmtFloat,
  },
  {
    key: 't2_claim_count_max',
    label: 'T2 max prior claims',
    description: 'Standard tier accepts up to this many prior claims.',
    min: 0,
    max: 10,
    step: 1,
    fmt: fmtInt,
  },
  {
    key: 't3_claim_count_max',
    label: 'T3 evidence band ceiling',
    description: 'Evidence-required range upper bound (claim count).',
    min: 1,
    max: 15,
    step: 1,
    fmt: fmtInt,
  },
  {
    key: 't4_claim_count_min',
    label: 'T4 manual review floor',
    description: 'Minimum prior claims to send to human reviewer.',
    min: 1,
    max: 20,
    step: 1,
    fmt: fmtInt,
  },
  {
    key: 't5_cumulative_value_min',
    label: 'T5 cumulative value floor',
    description: 'Critical-band entities denied above this cumulative value.',
    min: 100,
    max: 5000,
    step: 100,
    fmt: fmtUSD,
  },
];

export default function SliderPanel(): JSX.Element {
  const thresholds = useStore((s) => s.thresholds);
  const setThreshold = useStore((s) => s.setThreshold);

  return (
    <section className="panel slider-panel" aria-label="Thresholds">
      <h2 className="panel-h">Thresholds</h2>
      <p className="panel-sub">Drag any slider. The right side recomputes.</p>
      <div className="sliders">
        {SLIDERS.map((s) => {
          const value = thresholds[s.key];
          return (
            <div key={s.key} className="slider-row">
              <div className="slider-head">
                <label htmlFor={s.key} className="slider-label">
                  {s.label}
                </label>
                <span className="slider-value">{s.fmt(value)}</span>
              </div>
              <input
                id={s.key}
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={value}
                onChange={(e) => setThreshold(s.key, Number(e.target.value))}
                className="slider-input"
              />
              <div className="slider-meta">
                <span>{s.fmt(s.min)}</span>
                <span className="slider-desc">{s.description}</span>
                <span>{s.fmt(s.max)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
