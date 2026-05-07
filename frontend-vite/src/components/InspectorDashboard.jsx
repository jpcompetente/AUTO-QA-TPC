import { useEffect, useMemo, useRef, useState } from "react";
import Webcam from "react-webcam";
import {
  detectImage,
  getComponents,
  getDetectionLogs,
  getModels,
} from "../api/backend";

const PAGES = [
  { id: "live", label: "Live View" },
  { id: "logs", label: "Inspection Log" },
  { id: "session", label: "Session Summary" },
];

function InspectorDashboard({ onLogout }) {
  const webcamRef = useRef(null);
  const [components, setComponents] = useState([]);
  const [models, setModels] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detectionResult, setDetectionResult] = useState(null);
  const [activePage, setActivePage] = useState("live");
  const [form, setForm] = useState({ component: "", model: "" });

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
    setForm((currentForm) => ({
      component: currentForm.component || componentResponse.data[0]?.id || "",
      model: currentForm.model || modelResponse.data[0]?.id || "",
    }));
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
        setError(
          requestError.response?.data?.detail ||
            "Unable to load inspection data.",
        );
      }
    };

    void loadPanelData();
  }, []);

  const handleDetect = async () => {
    const imageSrc = webcamRef.current?.getScreenshot();

    if (!imageSrc || !form.component || !form.model) {
      setError("Camera capture, component, and model are required.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const detectResponse = await detectImage({ image: imageSrc });
      const result = detectResponse.data;

      setDetectionResult(result);
      setActivePage("logs");

      await fetchLogs();
    } catch (requestError) {
      setError(
        requestError.response?.data?.error || "Detection request failed.",
      );
    } finally {
      setLoading(false);
    }
  };

  const totalPasses = logs.filter(
    (log) =>
      (log.final_decision || log.system_decision || log.status) === "PASS",
  ).length;

  const passRate = logs.length
    ? Math.round((totalPasses / logs.length) * 100)
    : 0;

  return (
    <div className="dashboard-shell dashboard-shell--inspector">
      <aside className="dashboard-sidebar">
        <div>
          <p className="eyebrow">Inspector viewer</p>
          <h1>Live review desk</h1>
          <p className="sidebar-copy">
            Capture frames, inspect results, and review historical detections in
            a single screen.
          </p>
        </div>

        <nav className="page-nav" aria-label="Inspector pages">
          {PAGES.map((page) => (
            <button
              key={page.id}
              type="button"
              className={
                activePage === page.id
                  ? "page-nav__button is-active"
                  : "page-nav__button"
              }
              onClick={() => setActivePage(page.id)}
            >
              {page.label}
            </button>
          ))}
        </nav>

        <button
          className="ghost-button ghost-button--sidebar"
          onClick={onLogout}
          type="button"
        >
          Logout
        </button>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Inspector portal</p>
            <h2>Full-screen inspection workspace</h2>
            <p>
              Review the live feed, run detection, and inspect the recent log
              stream without leaving the page.
            </p>
          </div>
          <div className="dashboard-header__meta">
            <span>{components.length} components</span>
            <span>{models.length} models</span>
            <span>{logs.length} inspections</span>
          </div>
        </header>

        {activePage === "live" ? (
          <section className="dashboard-grid dashboard-grid--inspector">
            <div className="dashboard-section dashboard-section--camera">
              <div className="dashboard-section__header">
                <div>
                  <p className="eyebrow">Camera feed</p>
                  <h3>Prepare the frame</h3>
                </div>
                <span className="section-note">Selected model ready</span>
              </div>

              <div className="webcam-frame-wrap webcam-frame-wrap--inspector">
                <Webcam
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  audio={false}
                  className="webcam-frame"
                />
              </div>

              <div className="form-grid form-grid--admin form-grid--inspector">
                <label className="field">
                  <span>Component</span>
                  <select
                    value={form.component}
                    onChange={(event) =>
                      setForm({ ...form, component: event.target.value })
                    }
                  >
                    {components.map((component) => (
                      <option key={component.id} value={component.id}>
                        {component.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Model</span>
                  <select
                    value={form.model}
                    onChange={(event) =>
                      setForm({ ...form, model: event.target.value })
                    }
                  >
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} ({model.version})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {error ? (
                <div className="notice notice--error">{error}</div>
              ) : null}

              <button
                className="primary-button"
                onClick={handleDetect}
                disabled={loading}
                type="button"
              >
                {loading ? "Processing..." : "Capture and detect"}
              </button>
            </div>

            <div className="dashboard-section dashboard-section--result">
              <div className="dashboard-section__header">
                <div>
                  <p className="eyebrow">Detection result</p>
                  <h3>Latest AI output</h3>
                </div>
                <span className="section-note">Live response panel</span>
              </div>

              {detectionResult ? (
                <div className="result-panel">
                  <div className="result-panel__status">
                    {detectionResult.result || detectionResult.error || "Ready"}
                  </div>
                  <dl className="result-panel__facts">
                    <div>
                      <dt>Size</dt>
                      <dd>{detectionResult.size || "-"}</dd>
                    </div>
                    <div>
                      <dt>Format</dt>
                      <dd>{detectionResult.format || "-"}</dd>
                    </div>
                  </dl>
                  <pre>{JSON.stringify(detectionResult, null, 2)}</pre>
                </div>
              ) : (
                <div className="empty-state empty-state--bordered">
                  Capture a frame to view the result here.
                </div>
              )}
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
              </div>
              <span className="section-note">Read-only status</span>
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
                <strong>
                  {componentMap[String(form.component)] || "Not selected"}
                </strong>
              </div>
              <div className="audit-list__row">
                <span>Current model</span>
                <strong>
                  {modelMap[String(form.model)] || "Not selected"}
                </strong>
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default InspectorDashboard;
