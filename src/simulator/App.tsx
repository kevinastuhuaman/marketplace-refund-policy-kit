import { useEffect } from 'react';
import { useStore, evaluate } from './store';
import { loadClaims, loadPolicy } from './lib/loadAssets';
import Header from './components/Header';
import PresetBar from './components/PresetBar';
import SliderPanel from './components/SliderPanel';
import ResultsPanel from './components/ResultsPanel';

export default function App(): JSX.Element {
  const { status, errorMessage } = useStore((s) => ({
    status: s.status,
    errorMessage: s.errorMessage,
  }));
  const setPolicy = useStore((s) => s.setPolicy);
  const setClaims = useStore((s) => s.setClaims);
  const setError = useStore((s) => s.setError);
  const policy = useStore((s) => s.policy);
  const claims = useStore((s) => s.claims);
  const thresholds = useStore((s) => s.thresholds);

  useEffect(() => {
    Promise.all([loadPolicy(), loadClaims()])
      .then(([p, c]) => {
        setPolicy(p);
        setClaims(c);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to load assets: ${msg}`);
      });
  }, [setPolicy, setClaims, setError]);

  const result = evaluate(policy, claims, thresholds);

  return (
    <div className="app">
      <Header />
      <main className="main">
        {status === 'loading' && (
          <div className="state">Loading policy + claims…</div>
        )}
        {status === 'error' && (
          <div className="state state-error">{errorMessage ?? 'Unknown error'}</div>
        )}
        {status === 'ready' && policy !== null && claims !== null && result !== null && (
          <>
            <PresetBar />
            <div className="layout">
              <SliderPanel />
              <ResultsPanel result={result} />
            </div>
          </>
        )}
      </main>
      <footer className="footer">
        Synthetic claims data only. Not from any real platform. Fork
        {' '}<a href="/policy.yaml">policy.yaml</a> to edit thresholds.
      </footer>
    </div>
  );
}
