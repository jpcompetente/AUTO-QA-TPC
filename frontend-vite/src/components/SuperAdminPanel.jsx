function SuperAdminPanel({ onLogout }) {
  return (
    <div className="panel-page">
      <div className="panel-shell">
        <header className="panel-header">
          <div>
            <p className="eyebrow">Super admin</p>
            <h1>System oversight</h1>
            <p>
              Reserve this panel for platform-wide controls, audit visibility,
              and policy enforcement.
            </p>
          </div>
          <button className="ghost-button" onClick={onLogout} type="button">
            Logout
          </button>
        </header>

        <section className="metric-grid">
          <div className="metric-card">
            <span>Global policies</span>
            <strong>12</strong>
          </div>
          <div className="metric-card">
            <span>Teams</span>
            <strong>4</strong>
          </div>
          <div className="metric-card">
            <span>Active monitors</span>
            <strong>24</strong>
          </div>
          <div className="metric-card">
            <span>Alerts</span>
            <strong>3</strong>
          </div>
        </section>

        <section className="section-card">
          <div className="section-heading">
            <p className="eyebrow">Platform status</p>
            <h2>Global governance layer</h2>
          </div>
          <p className="lead-copy">
            Use this area for enterprise-wide configuration, security policy
            review, and fleet health monitoring.
          </p>
        </section>
      </div>
    </div>
  );
}

export default SuperAdminPanel;
