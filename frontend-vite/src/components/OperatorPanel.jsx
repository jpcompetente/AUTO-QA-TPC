import { useEffect, useMemo, useRef, useState } from "react";
import Webcam from "react-webcam";
import {
  createDetectionLog,
  detectImage,
  getComponents,
  getDetectionLogs,
  getModels,
} from "../api/backend";

function OperatorPanel({ onLogout }) {
  const webcamRef = useRef(null);
  const [components, setComponents] = useState([]);
  const [models, setModels] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detectionResult, setDetectionResult] = useState(null);
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
            "Unable to load detection data.",
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

      await createDetectionLog({
        component: form.component,
        ai_model: form.model,
        result: result.result || "No defect detected",
      });

      await fetchLogs();
    } catch (requestError) {
      setError(
        requestError.response?.data?.error || "Detection request failed.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel-page">
      <div className="panel-shell">
        <header className="panel-header">
          <div>
            <p className="eyebrow">Operator console</p>
            <h1>Live inspection workflow</h1>
            <p>
              Capture a frame, run detection, and save the result against the
              selected configuration.
            </p>
          </div>
          <button className="ghost-button" onClick={onLogout} type="button">
            Logout
          </button>
        </header>

        <section className="content-grid content-grid--operator">
          <div className="section-card section-card--camera">
            <div className="section-heading">
              <p className="eyebrow">Camera feed</p>
              <h2>Prepare the frame</h2>
            </div>

            <div className="webcam-frame-wrap">
              <Webcam
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                audio={false}
                className="webcam-frame"
              />
            </div>

            <div className="form-grid form-grid--compact">
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

            {error ? <div className="notice notice--error">{error}</div> : null}

            <button
              className="primary-button"
              onClick={handleDetect}
              disabled={loading}
              type="button"
            >
              {loading ? "Processing..." : "Capture and detect"}
            </button>
          </div>

          <div className="section-card">
            <div className="section-heading">
              <p className="eyebrow">Detection result</p>
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
            <p className="eyebrow">Detection logs</p>
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

            {logs.length === 0 ? (
              <div className="empty-state">No logs yet.</div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

export default OperatorPanel;
