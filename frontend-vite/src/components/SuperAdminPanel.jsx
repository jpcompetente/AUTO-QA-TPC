import { useEffect, useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  getComponents,
  getOperators,
  getAdminSettings,
  getDetectionLogs,
} from "../api/backend";

function SuperAdminPanel({ onLogout, username = "superadmin" }) {
  const [components, setComponents] = useState([]);
  const [operators, setOperators] = useState([]);
  const [adminSettings, setAdminSettings] = useState([]);
  const [logs, setLogs] = useState([]);
  const pollRef = useRef(null);
  const initRef = useRef(false);

  const fetchData = useCallback(async () => {
    try {
      const [compRes, opRes, settingsRes, logsRes] = await Promise.all([
        getComponents(),
        getOperators(),
        getAdminSettings(),
        getDetectionLogs(),
      ]);

      setComponents(compRes?.data || []);
      setOperators(opRes?.data || []);
      setAdminSettings(settingsRes?.data || []);
      setLogs(logsRes?.data || []);
    } catch (err) {
      console.error("Failed to load superadmin data", err);
    }
  }, []);

  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      fetchData();
    }
    pollRef.current = setInterval(() => {
      fetchData();
    }, 15000);

    return () => clearInterval(pollRef.current);
  }, [fetchData]);

  const handleDrill = (name) => {
    // placeholder drill handler — integrate routing or modal in next step
    console.log("Drill into", name);
  };

  const policiesCount = adminSettings.length || 0;
  const teamsCount = operators.length || 0;
  const monitorsCount = components.length || 0;
  const alertsCount = logs.filter(
    (l) => (l.final_decision || l.system_decision) === "FAIL",
  ).length;
  const healthScore = (() => {
    if (!logs.length) return 100;
    const failures = logs.filter(
      (l) => (l.final_decision || l.system_decision) === "FAIL",
    ).length;
    const rate = failures / logs.length;
    return Math.max(60, Math.round((1 - rate) * 100));
  })();

  const recentFeed = logs.slice(0, 8).map((l) => ({
    actor: l.operator_name || l.operator || "system",
    action: l.final_decision || l.system_decision || l.status,
    when: l.timestamp || l.created_at,
    text: l.detection_results?.detections
      ? `${l.detection_results.detections.length} detections`
      : l.component_name || l.component || "",
  }));

  return (
    <motion.div
      className="panel-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <motion.div
        className="panel-shell superadmin-shell"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        <motion.header
          className="super-header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="super-header__title">
            <p className="eyebrow">Super admin</p>
            <h1>System oversight</h1>
            <p className="super-header__subtitle">
              Connected to detection and admin systems — governance, audit, and
              operational controls.
            </p>
            <div className="filter-bar">
              <div className="filter-group">
                <select defaultValue="24h">
                  <option value="24h">24h</option>
                  <option value="7d">7d</option>
                  <option value="30d">30d</option>
                </select>
              </div>
              <div className="filter-group">
                <select defaultValue="prod">
                  <option value="prod">Prod</option>
                  <option value="staging">Staging</option>
                </select>
              </div>
              <div className="status-chips">
                <span className="chip chip-healthy">Healthy</span>
                <span className="chip">Last sync 2m ago</span>
                <span className="chip chip-warning">
                  {Math.max(
                    0,
                    logs.filter((l) => l.status === "PENDING").length,
                  )}{" "}
                  escalations
                </span>
              </div>
            </div>
          </div>
          <div className="super-header__actions">
            <div className="profile">{username}</div>
            <button className="ghost-button" onClick={onLogout} type="button">
              Logout
            </button>
          </div>
        </motion.header>

        <motion.section
          className="kpi-row"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <motion.button
            className="kpi-card"
            onClick={() => handleDrill("policies")}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="kpi-icon kpi-icon--policies">P</div>
            <div className="kpi-body">
              <span className="kpi-label">Global Policies</span>
              <strong className="kpi-value">{policiesCount}</strong>
              <div className="kpi-trend">
                trend: {adminSettings.length ? "active" : "—"}
              </div>
            </div>
          </motion.button>

          <motion.button
            className="kpi-card"
            onClick={() => handleDrill("teams")}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="kpi-icon kpi-icon--teams">T</div>
            <div className="kpi-body">
              <span className="kpi-label">Teams Managed</span>
              <strong className="kpi-value">{teamsCount}</strong>
              <div className="kpi-trend">operators</div>
            </div>
          </motion.button>

          <motion.button
            className="kpi-card"
            onClick={() => handleDrill("monitors")}
          >
            <div className="kpi-icon kpi-icon--monitors">M</div>
            <div className="kpi-body">
              <span className="kpi-label">Active Monitors</span>
              <strong className="kpi-value">{monitorsCount}</strong>
              <div className="kpi-trend">components</div>
            </div>
          </motion.button>

          <motion.button
            className="kpi-card"
            onClick={() => handleDrill("alerts")}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="kpi-icon kpi-icon--alerts">A</div>
            <div className="kpi-body">
              <span className="kpi-label">Alerts</span>
              <strong className="kpi-value">{alertsCount}</strong>
              <div className="kpi-trend">
                critical:{" "}
                {logs.filter((l) => l.final_decision === "FAIL").length}
              </div>
            </div>
          </motion.button>

          <motion.button
            className="kpi-card"
            onClick={() => handleDrill("health")}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="kpi-icon kpi-icon--health">H</div>
            <div className="kpi-body">
              <span className="kpi-label">System Health</span>
              <strong className="kpi-value">{healthScore}%</strong>
              <div className="kpi-trend">uptime est.</div>
            </div>
          </motion.button>
        </motion.section>

        <section className="grid-main">
          <div className="left-column">
            <section className="section-card governance-panel">
              <div className="section-heading">
                <p className="eyebrow">Governance layer</p>
                <h2>Policy & access posture</h2>
              </div>

              <div className="governance-grid">
                <div className="gov-card">
                  <span>Security Posture</span>
                  <strong>Hardened</strong>
                  <p>Access controls and audit trails are active.</p>
                </div>

                <div className="gov-card">
                  <span>Approval Flow</span>
                  <strong>3-step review</strong>
                  <p>Policy → Ops → Executive review pipeline.</p>
                </div>

                <div className="gov-card">
                  <span>Escalation Status</span>
                  <strong>
                    {Math.max(
                      0,
                      logs.filter((l) => l.status === "PENDING").length,
                    )}
                  </strong>
                  <p>Pending issues awaiting review.</p>
                </div>

                <div className="gov-card">
                  <span>Access Model</span>
                  <strong>Privileged & Audited</strong>
                  <p>Time-bound approvals enforced for changes.</p>
                </div>
              </div>
            </section>

            <section className="section-card action-center">
              <div className="section-heading">
                <p className="eyebrow">Action center</p>
                <h2>Prioritized tasks</h2>
              </div>

              <div className="task-list">
                <div className="task">
                  <div>
                    <strong>Review pending policy changes</strong>
                    <div className="task-meta">Priority: High • Due: 2d</div>
                  </div>
                  <div>
                    <button className="primary-button">Review</button>
                  </div>
                </div>

                <div className="task">
                  <div>
                    <strong>Confirm role assignments</strong>
                    <div className="task-meta">Priority: Medium • Due: 5d</div>
                  </div>
                  <div>
                    <button className="primary-button">Open</button>
                  </div>
                </div>

                <div className="task">
                  <div>
                    <strong>Investigate escalated alerts</strong>
                    <div className="task-meta">
                      Priority: Critical • Due: now
                    </div>
                  </div>
                  <div>
                    <button className="primary-button primary-danger">
                      Resolve
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <aside className="right-column">
            <section className="section-card live-ops">
              <div className="section-heading">
                <p className="eyebrow">Live operations</p>
                <h2>Alerts & system snapshot</h2>
              </div>

              <div className="alerts">
                <div className="alerts-header">
                  <strong>Active alerts</strong>
                  <div className="alerts-controls">
                    <button className="ghost-button">Acknowledge all</button>
                  </div>
                </div>

                <ul className="alerts-list">
                  {logs.slice(0, 6).map((l) => (
                    <li
                      key={l.id}
                      className={`alert ${
                        (l.final_decision || l.system_decision) === "FAIL"
                          ? "alert-critical"
                          : "alert-warning"
                      }`}
                    >
                      <div className="alert-body">
                        <div className="alert-title">
                          {l.component_name || l.component || "Detection"}
                        </div>
                        <div className="alert-meta">
                          {new Date(
                            l.timestamp || l.created_at,
                          ).toLocaleString()}
                        </div>
                      </div>
                      <div className="alert-actions">
                        <button className="ghost-button">Assign</button>
                        <button className="primary-button">Resolve</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="system-snapshot">
                <div className="snap-row">
                  <div>API latency</div>
                  <strong>
                    est.{" "}
                    {Math.round(
                      logs.reduce((s, r) => s + (r.latency_ms || 0), 0) /
                        Math.max(1, logs.length),
                    )}
                    ms
                  </strong>
                </div>
                <div className="snap-row">
                  <div>Error rate</div>
                  <strong>
                    {(
                      (logs.filter(
                        (l) =>
                          (l.final_decision || l.system_decision) === "FAIL",
                      ).length /
                        Math.max(1, logs.length)) *
                      100
                    ).toFixed(2)}
                    %
                  </strong>
                </div>
                <div className="snap-row">
                  <div>DB</div>
                  <strong>OK</strong>
                </div>
              </div>
            </section>

            <section className="section-card activity-feed">
              <div className="section-heading">
                <p className="eyebrow">Audit stream</p>
                <h2>Recent events</h2>
              </div>

              <ul className="feed-list">
                {recentFeed.map((f, i) => (
                  <li key={i}>
                    <div className="feed-item">
                      <div className="feed-meta">
                        {f.actor} • {f.action} •{" "}
                        {new Date(f.when).toLocaleString()}
                      </div>
                      <div className="feed-text">{f.text}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </section>
      </motion.div>
    </motion.div>
  );
}

export default SuperAdminPanel;
