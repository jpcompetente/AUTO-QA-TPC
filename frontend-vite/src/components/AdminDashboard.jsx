import { useCallback, useEffect, useState, useRef, useMemo } from "react";
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
import "../styles/admin.css";

/* ─── Inline SVG icons ─── */
const Icon = {
  Grid: () => (
    <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
  ),
  Camera: () => (
    <svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
  ),
  List: () => (
    <svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
  ),
  Settings: () => (
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
  ),
  LogOut: () => (
    <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
  ),
  Shield: () => (
    <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
  ),
  Box: () => (
    <svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
  ),
  Cpu: () => (
    <svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>
  ),
  Users: () => (
    <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  ),
  Play: () => (
    <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
  ),
  Save: () => (
    <svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
  ),
  Edit: () => (
    <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  ),
  Trash: () => (
    <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
  ),
  X: () => (
    <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  ),
  CameraOff: () => (
    <svg viewBox="0 0 24 24"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56"/></svg>
  ),
};

const pages = [
  { id: "home",           label: "Overview",       IconC: Icon.Grid     },
  { id: "detection",      label: "Detection",      IconC: Icon.Camera   },
  { id: "detection-logs", label: "Detection Logs", IconC: Icon.List     },
  { id: "settings",       label: "Settings",       IconC: Icon.Settings },
];

function decisionClass(val) {
  if (!val) return "";
  const v = String(val).toLowerCase();
  if (v === "pass" || v === "ok" || v === "accepted") return "pass";
  if (v === "fail" || v === "reject" || v === "rejected") return "fail";
  return "";
}

function AdminDashboard({ onLogout }) {
  const [components, setComponents]     = useState([]);
  const [models, setModels]             = useState([]);
  const [operators, setOperators]       = useState([]);
  const [settings, setSettings]         = useState([]);
  const [detectionLogs, setDetectionLogs] = useState([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [formError, setFormError]       = useState("");
  const webcamRef                       = useRef(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [detLoading, setDetLoading]     = useState(false);
  const [detError, setDetError]         = useState("");
  const [detResult, setDetResult]       = useState(null);
  const [activePage, setActivePage]     = useState("home");
  const [editingSettingId, setEditingSettingId] = useState(null);
  const [form, setForm] = useState({
    product: "", model: "", threshold: 0.5, operator: "",
  });
  const [detectionLogsLimit, setDetectionLogsLimit] = useState(20);
  const [logsSortField, setLogsSortField] = useState("timestamp");
  const [logsSortOrder, setLogsSortOrder] = useState("desc");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [compRes, modelRes, opRes, settingsRes, logsRes] = await Promise.all([
        getComponents(), getModels(), getOperators(), getAdminSettings(), getDetectionLogs(),
      ]);
      setComponents(compRes.data);
      setModels(modelRes.data);
      setOperators(opRes.data);
      setSettings(settingsRes.data);
      setDetectionLogs(logsRes.data);
      setForm((f) => ({
        ...f,
        product:  f.product  || String(compRes.data[0]?.id  || ""),
        model:    f.model    || String(modelRes.data[0]?.id || ""),
        operator: f.operator || String(opRes.data[0]?.id    || ""),
      }));
      setDetResult(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await fetchData();
    })();
  }, [fetchData]);

  // Sort detection logs
  const sortedDetectionLogs = useMemo(() => {
    const sorted = [...detectionLogs];
    sorted.sort((a, b) => {
      let aVal, bVal;
      
      switch (logsSortField) {
        case "operator":
          aVal = (a.operator_name || a.operator || "").toLowerCase();
          bVal = (b.operator_name || b.operator || "").toLowerCase();
          break;
        case "component":
          aVal = (a.component_name || a.component || "").toLowerCase();
          bVal = (b.component_name || b.component || "").toLowerCase();
          break;
        case "model":
          aVal = (a.model_name || a.model_used || "").toLowerCase();
          bVal = (b.model_name || b.model_used || "").toLowerCase();
          break;
        case "decision":
          aVal = (a.final_decision || a.system_decision || "").toLowerCase();
          bVal = (b.final_decision || b.system_decision || "").toLowerCase();
          break;
        case "status":
          aVal = (a.status || "").toLowerCase();
          bVal = (b.status || "").toLowerCase();
          break;
        case "timestamp":
        default:
          aVal = new Date(a.timestamp || a.created_at).getTime();
          bVal = new Date(b.timestamp || b.created_at).getTime();
      }
      
      if (aVal < bVal) return logsSortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return logsSortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [detectionLogs, logsSortField, logsSortOrder]);

  const getCompatibleModels = () => {
    if (!form.product) return [];
    const pid = parseInt(form.product);
    return models.filter(m => m.compatible_component_ids?.includes(pid));
  };

  const compatibleModels = getCompatibleModels();

  const handleSubmit = async () => {
    if (!form.product || !form.model || !form.operator) return;
    setFormError("");
    const payload = {
      product: form.product, operator: form.operator,
      model: form.model, threshold: Number(form.threshold),
    };
    try {
      if (editingSettingId) await updateAdminSettings(editingSettingId, payload);
      else await createAdminSettings(payload);
      setEditingSettingId(null);
      fetchData();
    } catch (err) {
      const rd = err.response?.data;
      const opErr = rd?.operator;
      if (Array.isArray(opErr) && opErr.length > 0) setFormError(opErr[0]);
      else if (typeof opErr === "string") setFormError(opErr);
      else if (typeof rd?.detail === "string") setFormError(rd.detail);
      else setFormError("Failed to save config. This user may already have a configuration.");
      setIsLoading(false);
    }
  };

  const handleEdit = (setting) => {
    setEditingSettingId(setting.id);
    setFormError("");
    setForm({
      product:   String(setting.product   ?? setting.product_id   ?? ""),
      model:     String(setting.model     ?? setting.model_id     ?? ""),
      operator:  String(setting.operator  ?? setting.operator_id  ?? ""),
      threshold: setting.threshold ?? setting.confidence_threshold ?? 0.5,
    });
    setActivePage("settings");
  };

  const handleCancelEdit = () => {
    setEditingSettingId(null);
    setFormError("");
    setForm((f) => ({
      ...f,
      product:   components[0]?.id ? String(components[0].id) : "",
      model:     models[0]?.id     ? String(models[0].id)     : "",
      operator:  operators[0]?.id  ? String(operators[0].id)  : "",
      threshold: 0.5,
    }));
  };

  const handleDelete = async (id) => { await deleteAdminSettings(id); fetchData(); };

  const currentSetting = settings[0];

  const pageTitles = {
    "home":           ["Overview",       "Admin portal"],
    "detection":      ["Detection",      "Run inspections"],
    "detection-logs": ["Detection logs", "Audit trail"],
    "settings":       ["Settings",       "Configuration"],
  };

  const [pageTitle, pageEyebrow] = pageTitles[activePage] || ["Dashboard", "Admin portal"];

  return (
    <div className="adash">
      {/* Sidebar */}
      <aside className="adash__sidebar">
        <div className="adash__brand">
          <div className="adash__brand-icon">
            <Icon.Shield />
          </div>
          <div className="adash__brand-text">
            <span className="adash__brand-label">Admin</span>
            <span className="adash__brand-name">Control Room</span>
          </div>
        </div>

        <nav className="adash__nav" aria-label="Admin pages">
          <div className="adash__nav-section">Navigation</div>
          {pages.map(({ id, label, IconC }) => (
            <button
              key={id}
              type="button"
              className={`adash__nav-btn${activePage === id ? " is-active" : ""}`}
              onClick={() => setActivePage(id)}
            >
              <IconC />
              {label}
            </button>
          ))}
        </nav>

        <div className="adash__sidebar-footer">
          <button className="adash__logout-btn" onClick={onLogout} type="button">
            <Icon.LogOut />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="adash__main">
        {/* Topbar */}
        <header className="adash__topbar">
          <div className="adash__page-title">
            <span className="adash__eyebrow">{pageEyebrow}</span>
            <h2>{pageTitle}</h2>
          </div>
          <div className="adash__meta-pills">
            <span className="adash__pill"><span className="adash__pill-dot" />{components.length} components</span>
            <span className="adash__pill"><span className="adash__pill-dot" />{models.length} models</span>
            <span className="adash__pill"><span className="adash__pill-dot" />{operators.length} operators</span>
          </div>
        </header>

        <div className="adash__content">

          {/* ── Home ── */}
          {activePage === "home" && (
            <>
              <div className="adash__stats">
                <div className="adash__stat">
                  <div className="adash__stat-icon"><Icon.Settings /></div>
                  <div className="adash__stat-label">Active configs</div>
                  <div className="adash__stat-value">{settings.length}</div>
                </div>
                <div className="adash__stat">
                  <div className="adash__stat-icon"><Icon.Box /></div>
                  <div className="adash__stat-label">Products</div>
                  <div className="adash__stat-value">{components.length}</div>
                </div>
                <div className="adash__stat">
                  <div className="adash__stat-icon"><Icon.Cpu /></div>
                  <div className="adash__stat-label">Models</div>
                  <div className="adash__stat-value">{models.length}</div>
                </div>
                <div className="adash__stat">
                  <div className="adash__stat-icon"><Icon.Users /></div>
                  <div className="adash__stat-label">Operators</div>
                  <div className="adash__stat-value">{operators.length}</div>
                </div>
              </div>

              <div className="adash__card-grid">
                <div className="adash__card">
                  <div className="adash__card-label">Active routing</div>
                  <div className={`adash__card-value${!currentSetting?.operator_name ? " adash__card-value--muted" : ""}`}>
                    {currentSetting?.operator_name || "No assignment yet"}
                  </div>
                </div>
                <div className="adash__card">
                  <div className="adash__card-label">Current product</div>
                  <div className={`adash__card-value${!(currentSetting?.product_name || currentSetting?.component_name) ? " adash__card-value--muted" : ""}`}>
                    {currentSetting?.product_name || currentSetting?.component_name || "Awaiting config"}
                  </div>
                </div>
                <div className="adash__card">
                  <div className="adash__card-label">Current model</div>
                  <div className={`adash__card-value${!currentSetting?.model_name ? " adash__card-value--muted" : ""}`}>
                    {currentSetting?.model_name || "Awaiting config"}
                  </div>
                </div>
                <div className="adash__card">
                  <div className="adash__card-label">Threshold</div>
                  <div className="adash__card-value">
                    {currentSetting ? Number(currentSetting.threshold).toFixed(2) : "0.50"}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Detection ── */}
          {activePage === "detection" && (
            <>
              <div className="adash__section-header">
                <h3>Single inspection</h3>
                <span className="adash__section-badge">Admin only</span>
              </div>

              <div className="adash__camera-area">
                {isCameraOpen ? (
                  <Webcam
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    audio={false}
                    className="adash__webcam"
                  />
                ) : (
                  <div className="adash__camera-empty">
                    <Icon.CameraOff />
                    <span>Open the camera to begin</span>
                  </div>
                )}
              </div>

              <div className="adash__detection-actions">
                <button
                  className="adash__btn adash__btn--ghost"
                  type="button"
                  onClick={() => setIsCameraOpen((v) => !v)}
                >
                  <Icon.Camera />
                  {isCameraOpen ? "Close camera" : "Open camera"}
                </button>

                <button
                  className="adash__btn adash__btn--primary"
                  type="button"
                  disabled={detLoading || !isCameraOpen}
                  onClick={async () => {
                    const imageSrc = webcamRef.current?.getScreenshot();
                    if (!imageSrc) { setDetError("Open the camera first"); return; }
                    setDetLoading(true); setDetError("");
                    try {
                      const response = await detectImage({ image: imageSrc });
                      setDetResult(response.data);
                    } catch (err) {
                      setDetError(err.response?.data?.error || "Detection failed");
                    } finally {
                      setDetLoading(false);
                    }
                  }}
                >
                  <Icon.Play />
                  {detLoading ? "Processing…" : "Capture & detect"}
                </button>
              </div>

              {detError && <div className="adash__notice adash__notice--error">{detError}</div>}

              {detResult && (
                <div className="adash__result">
                  <pre>{JSON.stringify(detResult, null, 2)}</pre>
                </div>
              )}
            </>
          )}

          {/* ── Detection Logs ── */}
          {activePage === "detection-logs" && (
            <>
              <div className="adash__section-header">
                <h3>Detection records</h3>
                <span className="adash__section-badge">{detectionLogs.length} rows</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <label style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>Sort by:</label>
                    <select 
                      value={logsSortField}
                      onChange={(e) => setLogsSortField(e.target.value)}
                      style={{padding: '6px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid #ccc'}}
                    >
                      <option value="timestamp">Time (latest)</option>
                      <option value="decision">Decision</option>
                      <option value="status">Status</option>
                      <option value="model">Model</option>
                      <option value="operator">Operator</option>
                      <option value="component">Component</option>
                    </select>
                    <button 
                      onClick={() => setLogsSortOrder(logsSortOrder === 'asc' ? 'desc' : 'asc')}
                      style={{
                        padding: '6px 10px', 
                        fontSize: '12px', 
                        borderRadius: '4px', 
                        border: '1px solid #ccc',
                        background: '#f0f0f0',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {logsSortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <label style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>Show:</label>
                    <select 
                      value={detectionLogsLimit} 
                      onChange={(e) => setDetectionLogsLimit(Number(e.target.value))}
                      style={{padding: '6px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid #ccc'}}
                    >
                      <option value={20}>20 logs</option>
                      <option value={50}>50 logs</option>
                      <option value={detectionLogs.length}>All logs</option>
                    </select>
                    {detectionLogs.length > detectionLogsLimit && (
                      <span style={{fontSize: '11px', color: '#666'}}>
                        Showing {Math.min(detectionLogsLimit, detectionLogs.length)} of {detectionLogs.length}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="adash__table-wrap">
                <table className="adash__table">
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
                    {sortedDetectionLogs.slice(0, detectionLogsLimit).map((log) => (
                      <tr key={log.id}>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-3)" }}>#{log.id}</td>
                        <td>{log.operator_name || log.operator}</td>
                        <td>{log.component_name || log.component}</td>
                        <td>{log.model_name || log.model_used}</td>
                        <td>
                          <span className={`adash__decision-badge ${decisionClass(log.final_decision || log.system_decision)}`}>
                            {log.final_decision || log.system_decision || "—"}
                          </span>
                        </td>
                        <td>{log.status}</td>
                        <td style={{ color: "var(--text-3)", fontSize: "12px", whiteSpace: "nowrap" }}>
                          {new Date(log.timestamp || log.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {detectionLogs.length === 0 && (
                      <tr><td colSpan={7} className="adash__table-empty">No detection logs yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Settings ── */}
          {activePage === "settings" && (
            <>
              <div className="adash__section-header">
                <h3>{editingSettingId ? "Edit configuration" : "Assign models & thresholds"}</h3>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {editingSettingId && (
                    <button className="adash__btn adash__btn--ghost" type="button" onClick={handleCancelEdit}>
                      <Icon.X />
                      Cancel
                    </button>
                  )}
                  <button className="adash__btn adash__btn--primary" onClick={handleSubmit} disabled={isLoading} type="button">
                    <Icon.Save />
                    {editingSettingId ? "Update config" : "Save config"}
                  </button>
                </div>
              </div>

              {formError && <div className="adash__notice adash__notice--error">{formError}</div>}

              <div className="adash__form-grid">
                <div className="adash__field">
                  <label>Product</label>
                  <select
                    value={form.product}
                    onChange={(e) => {
                      const np = e.target.value;
                      const compat = models.filter(m => m.compatible_component_ids?.includes(parseInt(np)));
                      setForm({ ...form, product: np, model: compat.length > 0 ? String(compat[0].id) : "" });
                    }}
                  >
                    {components.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div className="adash__field">
                  <label>Model</label>
                  <select value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}>
                    {compatibleModels.length > 0
                      ? compatibleModels.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.version})</option>)
                      : <option disabled>No compatible models</option>}
                  </select>
                </div>

                <div className="adash__field">
                  <label>Operator</label>
                  <select value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })}>
                    {operators.map((op) => <option key={op.id} value={op.id}>{op.username}</option>)}
                  </select>
                </div>

                <div className="adash__field">
                  <label>Threshold</label>
                  <input
                    type="number"
                    min="0" max="1" step="0.05"
                    value={form.threshold}
                    onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                  />
                </div>
              </div>

              <div className="adash__table-wrap">
                <table className="adash__table">
                  <thead>
                    <tr>
                      <th>Operator</th>
                      <th>Product</th>
                      <th>Model</th>
                      <th>Threshold</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settings.map((setting) => (
                      <tr key={setting.id}>
                        <td style={{ fontWeight: 500 }}>{setting.operator_name}</td>
                        <td>{setting.product_name || setting.component_name}</td>
                        <td>{setting.model_name}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "13px" }}>
                          {Number(setting.threshold ?? setting.confidence_threshold).toFixed(2)}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button className="adash__btn adash__btn--ghost" onClick={() => handleEdit(setting)} type="button" style={{ height: "30px", padding: "0 12px", fontSize: "12px" }}>
                              <Icon.Edit />
                              Edit
                            </button>
                            <button className="adash__btn adash__btn--danger" onClick={() => handleDelete(setting.id)} type="button" style={{ height: "30px", padding: "0 12px", fontSize: "12px" }}>
                              <Icon.Trash />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {settings.length === 0 && (
                      <tr><td colSpan={5} className="adash__table-empty">No configurations yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

        </div>
      </main>
    </div>
  );
}

export default AdminDashboard;