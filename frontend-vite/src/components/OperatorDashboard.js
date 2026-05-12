import { useRef, useEffect, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import axios from 'axios';
import '../styles/operator.css';

const OperatorDashboard = ({ onLogout }) => {
  const webcamRef = useRef(null);
  const [inference, setInference] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() => `operator_${Date.now()}`);
  const [sessionActive, setSessionActive] = useState(false);
  const [wsConnection, setWsConnection] = useState(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);
  const [detectionHistory, setDetectionHistory] = useState([]);

  /* ── WebSocket ─────────────────────────────────────────────── */
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws/metrics/');

    ws.onopen    = () => setWsConnection(ws);
    ws.onerror   = (e) => console.error('WebSocket error:', e);
    ws.onmessage = (e) => console.log('Real-time metrics:', JSON.parse(e.data));
    ws.onclose   = () => setWsConnection(null);

    return () => { if (ws.readyState === WebSocket.OPEN) ws.close(); };
  }, []);

  /* ── Capture & detect ──────────────────────────────────────── */
  const captureFrame = useCallback(async () => {
    if (!webcamRef.current) return;
    try {
      setLoading(true);
      const imageSrc = webcamRef.current.getScreenshot();

      const response = await axios.post(
        'http://localhost:8000/api/core/inference/detect/',
        { image: imageSrc },
      );

      const result = response.data;
      setInference({ ...result, timestamp: new Date(), image: imageSrc });

      setDetectionHistory((prev) => [
        { ...result, id: Date.now(), timestamp: new Date() },
        ...prev.slice(0, 19),
      ]);

      if (wsConnection?.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify({
          type:            'inference_update',
          operator_id:     sessionId,
          bounding_boxes:  result.detections || [],
          confidence:      result.confidence,
          latency_ms:      result.latency_ms,
          system_decision: result.system_decision,
          timestamp:       new Date().toISOString(),
        }));
      }
    } catch (err) {
      console.error('Error capturing frame:', err);
      alert('Error during inference');
    } finally {
      setLoading(false);
    }
  }, [sessionId, wsConnection]);

  /* ── Operator decision ─────────────────────────────────────── */
  const handleOperatorDecision = async (finalDecision) => {
    if (!inference) return;
    try {
      const response = await axios.post(
        `http://localhost:8000/api/core/inference-logs/${inference.id}/operator_override/`,
        {
          final_decision: finalDecision,
          comment: `Operator ${finalDecision === 'PASS' ? 'Approved' : 'Rejected'}`,
        },
      );
      console.log('Decision saved:', response.data);
      setInference(null);
    } catch (err) {
      console.error('Error saving decision:', err);
      alert('Error saving decision');
    }
  };

  /* ── Session helpers ───────────────────────────────────────── */
  const startSession = () => {
    setSessionActive(true);
    setSessionId(`operator_${Date.now()}`);
  };
  const pauseSession = () => setSessionActive(false);

  /* ── Render ────────────────────────────────────────────────── */
  const passRate =
    detectionHistory.length > 0
      ? (
          (detectionHistory.filter((d) => d.system_decision === 'PASS').length /
            detectionHistory.length) *
          100
        ).toFixed(1)
      : '0.0';

  return (
    <div className="operator-dashboard">

      {/* ── Header ── */}
      <header className="dashboard-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'var(--blue)', flexShrink: 0,
          }} />
          <h1>Operator Panel — Live Defect Detection</h1>
        </div>
        <button className="ghost-button" onClick={onLogout} type="button">
          Log out
        </button>
      </header>

      {/* ── Main grid ── */}
      <div className="dashboard-layout">

        {/* ── Left: webcam ── */}
        <div className="webcam-container">
          <div className="section-heading">
            <p className="eyebrow">Camera feed</p>
            <h2>Live view</h2>
          </div>

          <div className="webcam-wrapper">
            <Webcam
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              width={640}
              height={480}
              className="webcam-feed"
            />
            {inference?.detections?.length > 0 && (
              <div className="detection-overlay">
                <p className="detection-alert">⚠ Defect detected</p>
              </div>
            )}
          </div>

          {/* System decision */}
          {inference && (
            <div className={`system-decision ${inference.system_decision?.toLowerCase()}`}>
              <h3>System decision: {inference.system_decision}</h3>
              <p>Confidence: {(inference.confidence * 100).toFixed(2)}%</p>
              <p>Latency: {inference.latency_ms?.toFixed(2)} ms</p>
              <p>Detections: {inference.num_detections}</p>
            </div>
          )}

          {/* Approve / Reject */}
          {inference && (
            <div className="decision-buttons">
              <button
                className="primary-button"
                onClick={() => handleOperatorDecision('PASS')}
                disabled={loading}
                type="button"
              >
                ✓ Approve
              </button>
              <button
                className="btn-reject"
                onClick={() => handleOperatorDecision('FAIL')}
                disabled={loading}
                type="button"
              >
                ✗ Reject
              </button>
            </div>
          )}
        </div>

        {/* ── Right: controls ── */}
        <div className="controls-panel">

          {/* Session controls */}
          <div className="auto-detect-panel">
            <div>
              <span>Session status</span>
              <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={`session-dot ${sessionActive ? 'session-dot--active' : ''}`} />
                {sessionActive ? `Active · ${sessionId}` : 'Stopped'}
              </strong>
            </div>
            <button
              className={sessionActive ? 'ghost-button' : 'primary-button'}
              onClick={sessionActive ? pauseSession : startSession}
              type="button"
            >
              {sessionActive ? 'Pause' : 'Start Session'}
            </button>
            <button
              className="primary-button"
              onClick={captureFrame}
              disabled={loading}
              type="button"
            >
              {loading ? 'Capturing…' : 'Capture & Detect'}
            </button>
          </div>

          {/* Confidence slider */}
          <div className="settings-panel">
            <label>
              Confidence threshold: <strong style={{ color: 'var(--text)' }}>
                {Math.round(confidenceThreshold * 100)}%
              </strong>
            </label>
            <input
              type="range"
              min="0" max="1" step="0.05"
              value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
            />
          </div>

          {/* Detection history */}
          <div className="history-panel">
            <h3>Recent detections</h3>
            <div className="history-list">
              {detectionHistory.length === 0 && (
                <div className="empty-state" style={{ padding: '20px 0' }}>
                  No detections yet
                </div>
              )}
              {detectionHistory.map((item) => (
                <div
                  key={item.id}
                  className={`history-item ${item.system_decision?.toLowerCase()}`}
                >
                  <span className="time">
                    {item.timestamp.toLocaleTimeString()}
                  </span>
                  <span className="confidence">
                    {(item.confidence * 100).toFixed(1)}%
                  </span>
                  <span className="decision">{item.system_decision}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="stats-panel">
            <h3>Session stats</h3>
            <p>Total detections<br /><strong>{detectionHistory.length}</strong></p>
            <p>Pass rate<br /><strong>{passRate}%</strong></p>
          </div>
        </div>
      </div>

      {loading && <div className="loading-spinner">Processing…</div>}
    </div>
  );
};

export default OperatorDashboard;