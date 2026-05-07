export default function Header(): JSX.Element {
  return (
    <header className="header">
      <div className="header-brand">
        <span className="header-dot" aria-hidden="true" />
        <span className="header-title">marketplace-refund-policy-kit</span>
        <span className="header-tag">simulator</span>
      </div>
      <nav className="header-nav">
        <a href="https://github.com/kevinastuhuaman/marketplace-refund-policy-kit" target="_blank" rel="noreferrer">
          GitHub
        </a>
        <a href="/policy.yaml" download className="header-cta">
          Fork policy.yaml
        </a>
      </nav>
    </header>
  );
}
