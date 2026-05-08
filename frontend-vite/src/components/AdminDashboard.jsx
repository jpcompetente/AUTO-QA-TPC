import { useEffect, useState, useRef } from "react";
import Webcam from "react-webcam";
import {
  createAdminSettings,
  deleteAdminSettings,
  getAdminSettings,
  getComponents,
  getModels,
  getOperators,
  updateAdminSettings,
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
  const [formError, setFormError] = useState("");
  // detection state (admin-only)
  const webcamRef = useRef(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [detLoading, setDetLoading] = useState(false);
  const [detError, setDetError] = useState("");
  const [detResult, setDetResult] = useState(null);
  const [activePage, setActivePage] = useState("home");
  const [editingSettingId, setEditingSettingId] = useState(null);
  const [form, setForm] = useState({
    product: "",
    model: "",
    threshold: 0.5,
    operator: "",
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
        product: currentForm.product || componentResponse.data[0]?.id || "",
        model: currentForm.model || modelResponse.data[0]?.id || "",
        operator: currentForm.operator || operatorResponse.data[0]?.id || "",
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
    if (!form.product || !form.model || !form.operator) {
      return;
    }

    setFormError("");

    const payload = {
      product: form.product,
      operator: form.operator,
      model: form.model,
      threshold: Number(form.threshold),
    };

    try {
      if (editingSettingId) {
        await updateAdminSettings(editingSettingId, payload);
      } else {
        await createAdminSettings(payload);
      }

      setEditingSettingId(null);
      fetchData();
    } catch (err) {
      const responseData = err.response?.data;
      const operatorError = responseData?.operator;
      const detailError = responseData?.detail;

      if (Array.isArray(operatorError) && operatorError.length > 0) {
        setFormError(operatorError[0]);
      } else if (typeof operatorError === 'string') {
        setFormError(operatorError);
      } else if (typeof detailError === 'string') {
        setFormError(detailError);
      } else {
        setFormError('Failed to save config. This user already has a configuration.');
      }

      setIsLoading(false);
    }
  };

  const handleEdit = (setting) => {
    const productId = String(setting.product ?? setting.product_id ?? "");
    const modelId = String(setting.model ?? setting.model_id ?? "");
    const operatorId = String(setting.operator ?? setting.operator_id ?? "");

    setEditingSettingId(setting.id);
    setFormError("");
    setForm({
      product: productId,
      model: modelId,
      threshold: setting.threshold ?? setting.confidence_threshold ?? 0.5,
      operator: operatorId,
    });
    setActivePage("settings");
  };

  const handleCancelEdit = () => {
    setEditingSettingId(null);
    setFormError("");
    setForm((currentForm) => ({
      ...currentForm,
      product: components[0]?.id ? String(components[0].id) : "",
      model: models[0]?.id ? String(models[0].id) : "",
      operator: operators[0]?.id ? String(operators[0].id) : "",
      threshold: 0.5,
    }));
  };

  // Get compatible models for selected product
  const getCompatibleModels = () => {
    if (!form.product) return [];
    const selectedProduct = parseInt(form.product);
    return models.filter(
      (model) =>
        model.compatible_component_ids &&
        model.compatible_component_ids.includes(selectedProduct)
    );
  };

  const compatibleModels = getCompatibleModels();

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
                <span>Active configurations</span>
                <strong>{settings.length}</strong>
              </div>
              <div>
                <span>Products</span>
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
                <span>Current product</span>
                <strong>
                  {currentSetting?.product_name || currentSetting?.component_name || "Awaiting config"}
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
                <h3>{editingSettingId ? "Edit config" : "Assign models and thresholds"}</h3>
              </div>
              <button
                className="primary-button"
                onClick={handleSubmit}
                disabled={isLoading}
                type="button"
              >
                {editingSettingId ? "Update config" : "Save config"}
              </button>
            </div>

            {formError ? <div className="notice notice--error">{formError}</div> : null}

            {editingSettingId ? (
              <div style={{ marginBottom: "12px" }}>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={handleCancelEdit}
                >
                  Cancel edit
                </button>
              </div>
            ) : null}

            <div className="form-grid form-grid--admin">
              <label className="field">
                <span>Product</span>
                <select
                  value={form.product}
                  onChange={(event) => {
                    const newProduct = event.target.value;
                    // Reset model to first compatible model when product changes
                    const compatible = models.filter(
                      (model) =>
                        model.compatible_component_ids &&
                        model.compatible_component_ids.includes(parseInt(newProduct))
                    );
                    setForm({
                      ...form,
                      product: newProduct,
                      model: compatible.length > 0 ? String(compatible[0].id) : "",
                    });
                  }}
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
                  {compatibleModels.length > 0 ? (
                    compatibleModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} ({model.version})
                      </option>
                    ))
                  ) : (
                    <option disabled>No compatible models</option>
                  )}
                </select>
              </label>

              <label className="field">
                <span>Operator</span>
                <select
                  value={form.operator}
                  onChange={(event) =>
                    setForm({ ...form, operator: event.target.value })
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
                    <th>Product</th>
                    <th>Model</th>
                    <th>Threshold</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.map((setting) => (
                    <tr key={setting.id}>
                      <td>{setting.operator_name}</td>
                      <td>{setting.product_name || setting.component_name}</td>
                      <td>{setting.model_name}</td>
                      <td>{Number(setting.threshold ?? setting.confidence_threshold).toFixed(2)}</td>
                      <td>
                        <button
                          className="ghost-button ghost-button--danger"
                          onClick={() => handleDelete(setting.id)}
                          type="button"
                        >
                          Delete
                        </button>
                        <button
                          className="ghost-button"
                          onClick={() => handleEdit(setting)}
                          type="button"
                          style={{ marginLeft: "8px" }}
                        >
                          Edit
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
