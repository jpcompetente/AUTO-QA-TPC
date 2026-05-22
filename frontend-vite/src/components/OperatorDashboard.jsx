import React, { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import { detectImage, getOperatorPreset } from "../api/backend";
import "../styles/operator-dashboard.css";

export default function OperatorDashboard() {
  const webcamRef = useRef(null);
  const intervalRef = useRef(null);
  const [status, setStatus] = useState("stopped"); // running | paused | stopped
  const [product, setProduct] = useState("");
  const [model, setModel] = useState("");
  const [batchId, setBatchId] = useState(null);
  const [confidence, setConfidence] = useState(100);
  const [defects, setDefects] = useState(0);
  const [alertVisible, setAlertVisible] = useState(false);

  useEffect(() => {
    // load preset on mount
    async function load() {
      try {
        const res = await getOperatorPreset();
        setProduct(res.data?.product_name || res.data?.product || "Product");
        setModel(res.data?.model_name || res.data?.model || "Model");
      } catch (e) {
        // ignore; keep defaults
      }
    }
    void load();
    return () => {
      stopLoop();
    };
  }, []);

  const createBatch = () => `batch_${Date.now()}`;

  const runDetectionOnce = async () => {
    if (!webcamRef.current) return;
    const img = webcamRef.current.getScreenshot();
    if (!img) return;
    try {
      const payload = { image: img, batch_id: batchId };
      const res = await detectImage(payload);
      // adapt to backend shape: prefer normalized 0..1 confidence
      const result = res?.data?.result || res?.data;
      const confRaw = result?.confidence ?? result?.confidence_score ?? 0;
      const confPct = confRaw > 1 ? Math.round(confRaw) : Math.round(confRaw * 100);
      const defectsCount = result?.defects_count ?? result?.defects ?? 0;

      setConfidence(confPct);
      setDefects(defectsCount);
      setAlertVisible(confPct < 75);
    } catch (err) {
      console.error("Detect error", err);
    }
  };

  const startLoop = () => {
    if (status === "running") return;
    if (!batchId) setBatchId(createBatch());
    setStatus("running");
    runDetectionOnce(); // immediate shot
    intervalRef.current = setInterval(runDetectionOnce, 1500);
  };

  const pauseLoop = () => {
    if (status !== "running") return;
    setStatus("paused");
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  };

  const stopLoop = () => {
    setStatus("stopped");
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    setBatchId(null);
    setConfidence(100);
    setDefects(0);
    setAlertVisible(false);
  };

  const confidenceColor = confidence > 90 ? "green" : confidence >= 75 ? "yellow" : "red";

  return (
    <div className="odash">
      <header className="odash__header">
        <div className="odash__title">
          <svg className="icon-camera" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path fill="currentColor" d="M12 5.5c-1.93 0-3.5 1.57-3.5 3.5s1.57 3.5 3.5 3.5 3.5-1.57 3.5-3.5S13.93 5.5 12 5.5zm8-1.5h-2.2l-1.6-1.6A1 1 0 0 0 15.9 2H8.1a1 1 0 0 0-.9.4L5.6 4H3a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zM12 18a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/>
          </svg>
          <span>Live Inspection</span>
        </div>
        <div className="odash__meta">
          <div className="meta-item">{product}</div>
          <div className="meta-item">Model: {model}</div>
          <div className="meta-item">Batch: {batchId || "-"}</div>
        </div>
      </header>

      <main className="odash__main">
        <section className="odash__camera">
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            className="odash__webcam"
          />
          <div className="odash__controls">
            <button className="btn start" onClick={startLoop} aria-pressed={status === "running"}>
              Start
            </button>
            <button className="btn pause" onClick={pauseLoop} aria-pressed={status === "paused"}>
              Pause
            </button>
            <button className="btn stop" onClick={stopLoop}>
              Stop
            </button>
          </div>
        </section>

        <aside className="odash__panel" aria-live="polite">
          <h3 className="panel-title">Inspection Info</h3>

          <div className="info-row">
            <div className="label">Product</div>
            <div className="value">{product}</div>
          </div>

          <div className="info-row">
            <div className="label">AI Model</div>
            <div className="value">{model}</div>
          </div>

          <div className="info-row">
            <div className="label">Status</div>
            <div className="value status-pill">{status}</div>
          </div>

          <div className="confidence-block">
            <div className="label">Confidence</div>
            <div className="confidence-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={confidence}>
              <div className={`confidence-fill ${confidenceColor}`} style={{ width: `${confidence}%` }} />
            </div>
            <div className="confidence-text">{confidence}%</div>
          </div>

          <div className="info-row">
            <div className="label">Batch</div>
            <div className="value">{batchId || "-"}</div>
          </div>

          {alertVisible && (
            <div className="odash__alert" role="alert" aria-live="assertive">
              <svg className="icon-alert" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                <path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
              </svg>
              <div>
                <strong>Low confidence:</strong> {confidence}% — attention required
              </div>
            </div>
          )}

          <div className="summary-box" aria-hidden={false}>
            <div className="summary-title">Quick Summary</div>
            <div className="summary-line">Defects detected: <strong>{defects}</strong></div>
            <div className="summary-line">Confidence: <strong>{confidence}%</strong></div>
            <div className="summary-line">Model: <strong>{model}</strong></div>
          </div>
        </aside>
      </main>
    </div>
  );
}