import { useStore } from '../store';

const PRESETS = [
  { id: 'conservative', label: 'Conservative', desc: 'lenient · minimize friction' },
  { id: 'moderate', label: 'Moderate', desc: 'balanced · default' },
  { id: 'aggressive', label: 'Aggressive', desc: 'strict · maximize recovery' },
] as const;

export default function PresetBar(): JSX.Element {
  const preset = useStore((s) => s.preset);
  const applyPreset = useStore((s) => s.applyPreset);

  return (
    <div className="preset-bar">
      <span className="preset-label">Pilot aggressiveness</span>
      <div className="preset-buttons">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`preset-btn${preset === p.id ? ' preset-active' : ''}`}
            onClick={() => applyPreset(p.id)}
          >
            <span className="preset-name">{p.label}</span>
            <span className="preset-desc">{p.desc}</span>
          </button>
        ))}
      </div>
      {preset === 'custom' && <span className="preset-custom">Custom</span>}
    </div>
  );
}
