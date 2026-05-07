import { useEffect, useState, useRef } from "react";
import Webcam from "react-webcam";
import {
  createAdminSettings,
  deleteAdminSettings,
  getAdminSettings,
  getComponents,
  getModels,
  getOperators,
  detectImage,
  getDetectionLogs,
} from "../api/backend";

function AdminDashboard({ onLogout }) {
  const [components, setComponents] = useState([]);
  const [models, setModels] = useState([]);
  const [operators, setOperators] = useState([]);
  const [settings, setSettings] = useState([]);
  const [detectionLogs, setDetectionLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // detection state (admin-only)
  const webcamRef = useRef(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [detLoading, setDetLoading] = useState(false);
  const [detError, setDetError] = useState("");
  const [detResult, setDetResult] = useState(null);
  const [activePage, setActivePage] = useState("home");
  const [form, setForm] = useState({
    component: "",
    model: "",
    threshold: 0.5,
    assigned_operator: "",
  });

  const fetchData = async () => {
    setIsLoading(true);

    try {
      const [
        componentResponse,
        modelResponse,
        operatorResponse,
        settingsResponse,
        logsResponse,
      ] = await Promise.all([
        getComponents(),
        getModels(),
        getOperators(),
        getAdminSettings(),
        getDetectionLogs(),
      ]);

      setComponents(componentResponse.data);
      setModels(modelResponse.data);
      setOperators(operatorResponse.data);
      setSettings(settingsResponse.data);
      setDetectionLogs(logsResponse.data);

      setForm((currentForm) => ({
        ...currentForm,
        component: currentForm.component || componentResponse.data[0]?.id || "",
        model: currentForm.model || modelResponse.data[0]?.id || "",
        assigned_operator:
          currentForm.assigned_operator || operatorResponse.data[0]?.id || "",
      }));
      setDetResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await fetchData();
    };

    void loadData();
  }, []);

  const handleSubmit = async () => {
    if (!form.component || !form.model || !form.assigned_operator) {
      return;
    }

    await createAdminSettings({
      ...form,
      confidence_threshold: Number(form.threshold),
    });

    fetchData();
  };

  const handleDelete = async (id) => {
    await deleteAdminSettings(id);
    fetchData();
  };

  const pages = [
    { id: "home", label: "Home" },
    { id: "detection", label: "Detection" },
    { id: "detection-logs", label: "Detection Logs" },
    { id: "settings", label: "Settings" },
  ];

  const currentSetting = settings[0];

  return (
    <div className="dashboard-shell dashboard-shell--admin">
      <aside className="dashboard-sidebar">
        <div>
          <p className="eyebrow">Admin dashboard</p>
          <h1>Admin control room</h1>
        </div>

        <nav className="page-nav" aria-label="Admin pages">
          {pages.map((page) => (
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
            <p className="eyebrow">Admin portal</p>
            <h2>Admin dashboard</h2>
          </div>
          <div className="dashboard-header__meta">
            <span>{components.length} components</span>
            <span>{models.length} models</span>
            <span>{operators.length} operators</span>
          </div>
        </header>

        {activePage === "home" ? (
          <section className="dashboard-section dashboard-section--overview">
            <div className="stat-line">
              <div>
                <span>Configurations</span>
                <strong>{settings.length}</strong>
              </div>
              <div>
                <span>Components</span>
                <strong>{components.length}</strong>
              </div>
              <div>
                <span>Models</span>
                <strong>{models.length}</strong>
              </div>
              <div>
                <span>Operators</span>
                <strong>{operators.length}</strong>
              </div>
            </div>

            <div className="timeline">
              <div className="timeline__item">
                <span>Active routing</span>
                <strong>
                  {currentSetting?.operator_name || "No assignment yet"}
                </strong>
              </div>
              <div className="timeline__item">
                <span>Current component</span>
                <strong>
                  {currentSetting?.component_name || "Awaiting config"}
                </strong>
              </div>
              <div className="timeline__item">
                <span>Current model</span>
                <strong>
                  {currentSetting?.model_name || "Awaiting config"}
                </strong>
              </div>
              <div className="timeline__item">
                <span>Threshold</span>
                <strong>
                  {currentSetting
                    ? Number(currentSetting.threshold).toFixed(2)
                    : "0.50"}
                </strong>
              </div>
            </div>
          </section>
        ) : null}

        {activePage === "detection" ? (
          <section className="dashboard-section dashboard-section--camera">
            <div className="dashboard-section__header">
              <div>
                <p className="eyebrow">Detection</p>
                <h3>Run a single inspection</h3>
              </div>
              <span className="section-note">Admin-only action</span>
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
              <div className="webcam-frame-wrap">
                <Webcam
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  audio={false}
                  className="webcam-frame"
                />
              </div>
            ) : (
              <div className="empty-state empty-state--bordered">
                Open the camera to capture a detection frame.
              </div>
            )}

            {detError ? <div className="notice notice--error">{detError}</div> : null}

            <button
              className="primary-button"
              onClick={async () => {
                const imageSrc = webcamRef.current?.getScreenshot();
                if (!imageSrc) {
                  setDetError("Open the camera before running detection");
                  return;
                }

                setDetLoading(true);
                setDetError("");

                try {
                  const response = await detectImage({ image: imageSrc });
                  setDetResult(response.data);
                } catch (err) {
                  setDetError(err.response?.data?.error || "Detection failed");
                } finally {
                  setDetLoading(false);
                }
              }}
              type="button"
              disabled={detLoading || !isCameraOpen}
            >
              {detLoading ? "Processing..." : "Capture and detect"}
            </button>

            {detResult ? <pre>{JSON.stringify(detResult, null, 2)}</pre> : null}
          </section>
        ) : null}

        {activePage === "detection-logs" ? (
          <section className="dashboard-section dashboard-section--table">
            <div className="dashboard-section__header">
              <div>
                <p className="eyebrow">Detection logs</p>
                <h3>Latest detection records</h3>
              </div>
              <span className="section-note">{detectionLogs.length} rows</span>
            </div>

            <div className="table-wrap dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Operator</th>
                    <th>Component</th>
                    <th>Model</th>
                    <th>Decision</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {detectionLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{log.id}</td>
                      <td>{log.operator_name || log.operator}</td>
                      <td>{log.component_name || log.component}</td>
                      <td>{log.model_name || log.model_used}</td>
                      <td>{log.final_decision || log.system_decision}</td>
                      <td>{log.status}</td>
                      <td>
                        {new Date(log.timestamp || log.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {detectionLogs.length === 0 ? (
                <div className="empty-state">No detection logs available.</div>
              ) : null}
            </div>
          </section>
        ) : null}

        {activePage === "settings" ? (
          <section className="dashboard-section dashboard-section--form">
            <div className="dashboard-section__header">
              <div>
                <p className="eyebrow">Settings</p>
                <h3>Assign models and thresholds</h3>
              </div>
              <button
                className="primary-button"
                onClick={handleSubmit}
                disabled={isLoading}
                type="button"
              >
                Save config
              </button>
            </div>

            <div className="form-grid form-grid--admin">
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

              <label className="field">
                <span>Operator</span>
                <select
                  value={form.assigned_operator}
                  onChange={(event) =>
                    setForm({ ...form, assigned_operator: event.target.value })
                  }
                >
                  {operators.map((operator) => (
                    <option key={operator.id} value={operator.id}>
                      {operator.username}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Threshold</span>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={form.threshold}
                  onChange={(event) =>
                    setForm({ ...form, threshold: event.target.value })
                  }
                />
              </label>
            </div>

            <div className="table-wrap dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Operator</th>
                    <th>Component</th>
                    <th>Model</th>
                    <th>Threshold</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.map((setting) => (
                    <tr key={setting.id}>
                      <td>{setting.operator_name}</td>
                      <td>{setting.component_name}</td>
                      <td>{setting.model_name}</td>
                      <td>{Number(setting.confidence_threshold).toFixed(2)}</td>
                      <td>
                        <button
                          className="ghost-button ghost-button--danger"
                          onClick={() => handleDelete(setting.id)}
                          type="button"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {settings.length === 0 ? (
                <div className="empty-state">No configs created yet.</div>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default AdminDashboard;
