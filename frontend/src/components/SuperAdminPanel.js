import React from "react";

const SuperAdminPanel = ({ onLogout }) => {
  return (
    <div className="panel-page">
      <div className="panel-shell">
        <header className="panel-header">
          <div>
            <span className="eyebrow">Super admin</span>
            <h1>System oversight</h1>
            <p>
              Use this space for platform-wide controls, policy enforcement, and
              audit visibility.
            </p>
          </div>
          <button className="ghost-button" onClick={onLogout}>
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
            <span className="eyebrow">Platform status</span>
            <h2>Global governance layer</h2>
          </div>
          <p className="lead-copy">
            Reserve this panel for enterprise-wide configuration, security
            policy review, and fleet health monitoring.
          </p>
        </section>
      </div>
    </div>
  );
};

export default SuperAdminPanel;
