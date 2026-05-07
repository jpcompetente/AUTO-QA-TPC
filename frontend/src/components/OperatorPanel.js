import React, { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import {
  createDetectionLog,
  getComponents,
  getModels,
  getDetectionLogs,
} from "../api/backend";
import api from "../api/backend";

const OperatorPanel = ({ onLogout }) => {
  const webcamRef = useRef(null);

  const [components, setComponents] = useState([]);
  const [models, setModels] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detectionResult, setDetectionResult] = useState(null);
  const [form, setForm] = useState({ component: "", model: "" });

  const componentMap = Object.fromEntries(
    components.map((item) => [String(item.id), item.name]),
  );
  const modelMap = Object.fromEntries(
    models.map((item) => [String(item.id), `${item.name} (${item.version})`]),
  );

  const fetchOptions = async () => {
    const [componentRes, modelRes] = await Promise.all([
      getComponents(),
      getModels(),
    ]);

    setComponents(componentRes.data);
    setModels(modelRes.data);
    setForm((prev) => ({
      component: prev.component || componentRes.data[0]?.id || "",
      model: prev.model || modelRes.data[0]?.id || "",
    }));
  };

  // 🔄 Load logs
  const fetchLogs = async () => {
    try {
      const res = await getDetectionLogs();
      setLogs(res.data);
    } catch (err) {
      console.error("Error fetching logs:", err.response?.data);
    }
  };

  useEffect(() => {
    fetchOptions();
    fetchLogs();
  }, []);

  // 🎥 Capture → Detect → Save Log
  const handleDetect = async () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (!imageSrc || !form.component || !form.model) return;

    setLoading(true);

    try {
      const detectRes = await api.post("/detect/", { image: imageSrc });

      const result = detectRes.data.result;
      setDetectionResult(detectRes.data);

      await createDetectionLog({
        component: form.component,
        ai_model: form.model,
        result: result,
      });

      fetchLogs();
    } catch (err) {
      console.error("Detection error:", err.response?.data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel-page">
      <div className="panel-shell">
        <header className="panel-header">
          <div>
            <span className="eyebrow">Operator console</span>
            <h1>Live inspection workflow</h1>
            <p>
              Capture a frame, run detection, and save the result against the
              selected configuration.
            </p>
          </div>
          <button className="ghost-button" onClick={onLogout}>
            Logout
          </button>
        </header>

        <section className="content-grid content-grid--operator">
          <div className="section-card section-card--camera">
            <div className="section-heading">
              <span className="eyebrow">Camera feed</span>
              <h2>Prepare the frame</h2>
            </div>

            <Webcam
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              audio={false}
              className="webcam-frame"
            />

            <div className="form-grid form-grid--compact">
              <label className="field">
                <span>Component</span>
                <select
                  value={form.component}
                  onChange={(e) =>
                    setForm({ ...form, component: e.target.value })
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
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} ({model.version})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              className="primary-button"
              onClick={handleDetect}
              disabled={loading}
            >
              {loading ? "Processing..." : "Capture and detect"}
            </button>
          </div>

          <div className="section-card">
            <div className="section-heading">
              <span className="eyebrow">Detection result</span>
              <h2>Latest AI output</h2>
            </div>

            {detectionResult ? (
              <div className="result-card">
                <div className="result-card__status">
                  {detectionResult.result || detectionResult.error || "Ready"}
                </div>
                <dl>
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
              <div className="empty-state">
                Capture a frame to view the result here.
              </div>
            )}
          </div>
        </section>

        <section className="section-card section-card--wide">
          <div className="section-heading">
            <span className="eyebrow">Detection logs</span>
            <h2>Recent inspections</h2>
          </div>

          <div className="table-wrap">
            <table>
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
                      {componentMap[String(log.component)] || log.component}
                    </td>
                    <td>{modelMap[String(log.ai_model)] || log.ai_model}</td>
                    <td>{log.result}</td>
                    <td>
                      {new Date(
                        log.timestamp || log.created_at,
                      ).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {logs.length === 0 && (
              <div className="empty-state">No logs yet.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default OperatorPanel;
