import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Webcam from "react-webcam";
import { getComponents, getDetectionLogs, getModels } from "../api/backend";

const PAGES = [
  { id: "live", label: "Viewer Mode" },
  { id: "logs", label: "Inspection Log" },
  { id: "session", label: "Session Summary" },
];

function InspectorDashboard({ onLogout }) {
  const [components, setComponents] = useState([]);
  const [models, setModels] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activePage, setActivePage] = useState("live");
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const componentMap = useMemo(
    () =>
      Object.fromEntries(
        components.map((item) => [String(item.id), item.name]),
      ),
    [components],
  );

  const modelMap = useMemo(
    () =>
      Object.fromEntries(
        models.map((item) => [
          String(item.id),
          `${item.name} (${item.version})`,
        ]),
      ),
    [models],
  );

  const fetchOptions = async () => {
    const [componentResponse, modelResponse] = await Promise.all([
      getComponents(),
      getModels(),
    ]);

    setComponents(componentResponse.data);
    setModels(modelResponse.data);
  };

  const fetchLogs = async () => {
    const response = await getDetectionLogs();
    setLogs(response.data);
  };

  useEffect(() => {
    const loadPanelData = async () => {
      try {
        await fetchOptions();
        await fetchLogs();
      } catch (requestError) {
        // keep the viewer page usable even if metadata cannot load
        console.error(requestError);
      }
    };

    void loadPanelData();
  }, []);

  const totalPasses = logs.filter(
    (log) =>
      (log.final_decision || log.system_decision || log.status) === "PASS",
  ).length;

  const passRate = logs.length
    ? Math.round((totalPasses / logs.length) * 100)
    : 0;

  return (
    <motion.div
      className="dashboard-shell dashboard-shell--inspector"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <motion.aside
        className="dashboard-sidebar"
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <div>
          <p className="eyebrow">Inspector viewer</p>
          <h1>Inspector viewer mode</h1>
        </div>

        <nav className="page-nav" aria-label="Inspector pages">
          {PAGES.map((page) => (
            <motion.button
              key={page.id}
              type="button"
              className={
                activePage === page.id
                  ? "page-nav__button is-active"
                  : "page-nav__button"
              }
              onClick={() => setActivePage(page.id)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
            >
              {page.label}
            </motion.button>
          ))}
        </nav>

        <motion.button
          className="ghost-button ghost-button--sidebar"
          onClick={onLogout}
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.98 }}
        >
          Logout
        </motion.button>
      </motion.aside>

      <motion.main
        className="dashboard-main"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <motion.header
          className="dashboard-header"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div>
            <p className="eyebrow">Inspector portal</p>
            <h2>QA Inspection Workspace</h2>
          </div>
          <div className="dashboard-header__meta">
            <span>{components.length} components</span>
            <span>{models.length} models</span>
            <span>{logs.length} inspections</span>
          </div>
        </motion.header>

        {activePage === "live" ? (
          <section className="dashboard-grid dashboard-grid--inspector">
            <div className="dashboard-section dashboard-section--camera">
              <div className="dashboard-section__header">
                <div>
                  <p className="eyebrow">Viewer mode</p>
                  <h3>Live camera preview</h3>
                </div>
              </div>

              <div className="camera-toolbar">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => setIsCameraOpen((current) => !current)}
                >
                  {isCameraOpen ? "Close camera" : "Open camera"}
                </button>
              </div>

              {isCameraOpen ? (
                <div className="webcam-frame-wrap webcam-frame-wrap--inspector">
                  <Webcam
                    screenshotFormat="image/jpeg"
                    audio={false}
                    className="webcam-frame"
                  />
                </div>
              ) : (
                <div className="empty-state empty-state--bordered">
                  Open the camera to view the live feed.
                </div>
              )}

              <div className="notice notice--info">
                Inspector accounts are view-only and cannot run detections.
              </div>
            </div>

            <div className="dashboard-section dashboard-section--result">
              <div className="dashboard-section__header">
                <div>
                  <p className="eyebrow">Viewer summary</p>
                </div>
                <span className="section-note">No detection actions</span>
              </div>

              <div className="result-panel">
                <div className="result-panel__status">Viewer mode active</div>
                <dl className="result-panel__facts">
                  <div>
                    <dt>Components</dt>
                    <dd>{components.length}</dd>
                  </div>
                  <div>
                    <dt>Models</dt>
                    <dd>{models.length}</dd>
                  </div>
                </dl>
                <div className="empty-state empty-state--bordered">
                  Detection is disabled for inspector accounts.
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {activePage === "logs" ? (
          <section className="dashboard-section dashboard-section--table">
            <div className="dashboard-section__header">
              <div>
                <p className="eyebrow">Inspection log</p>
                <h3>Recent inspections</h3>
              </div>
              <span className="section-note">{logs.length} rows</span>
            </div>

            <div className="table-wrap dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Component</th>
                    <th>Model</th>
                    <th>Result</th>
                    <th>Detected at</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td>{log.id}</td>
                      <td>
                        {log.component_name ||
                          componentMap[String(log.component)] ||
                          log.component}
                      </td>
                      <td>
                        {log.model_name ||
                          modelMap[String(log.model_used)] ||
                          log.model_used}
                      </td>
                      <td>
                        {log.final_decision ||
                          log.system_decision ||
                          log.status}
                      </td>
                      <td>
                        {new Date(
                          log.timestamp || log.created_at,
                        ).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {logs.length === 0 ? (
                <div className="empty-state">No logs yet.</div>
              ) : null}
            </div>
          </section>
        ) : null}

        {activePage === "session" ? (
          <section className="dashboard-section dashboard-section--audit">
            <div className="dashboard-section__header">
              <div>
                <p className="eyebrow">Session</p>
                <h3>Current inspection summary</h3>
              </div>{" "}
            </div>

            <div className="audit-list">
              <div className="audit-list__row">
                <span>Total inspections</span>
                <strong>{logs.length}</strong>
              </div>
              <div className="audit-list__row">
                <span>Pass rate</span>
                <strong>{passRate}%</strong>
              </div>
              <div className="audit-list__row">
                <span>Current component</span>
                <strong>{components[0]?.name || "Not selected"}</strong>
              </div>
              <div className="audit-list__row">
                <span>Current model</span>
                <strong>
                  {models[0]
                    ? `${models[0].name} (${models[0].version})`
                    : "Not selected"}
                </strong>
              </div>
            </div>
          </section>
        ) : null}
      </motion.main>
    </motion.div>
  );
}

export default InspectorDashboard;
