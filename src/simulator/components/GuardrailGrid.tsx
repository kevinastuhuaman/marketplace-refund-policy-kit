import type { GuardrailReading } from '../../engine';

export default function GuardrailGrid({ guardrails }: { guardrails: GuardrailReading[] }): JSX.Element {
  return (
    <div className="guardrails">
      <div className="guardrails-head">Guardrails (shadow mode)</div>
      <div className="guardrails-grid">
        {guardrails.map((g) => (
          <div key={g.id} className={`guardrail${g.tripped ? ' guardrail-trip' : ''}`}>
            <div className="guardrail-led" aria-hidden="true" />
            <div className="guardrail-meta">
              <div className="guardrail-label">{g.label}</div>
              <div className="guardrail-threshold">{g.threshold}</div>
              <div className="guardrail-value">
                Current: {g.value === null ? 'n/a' : g.value.toFixed(1)}
                <span className="guardrail-status">
                  {g.tripped ? 'TRIP' : 'clear'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
