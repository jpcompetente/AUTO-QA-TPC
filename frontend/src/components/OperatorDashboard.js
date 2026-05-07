import React, { useRef, useEffect, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import axios from 'axios';
import '../styles/OperatorDashboard.css';

const OperatorDashboard = ({ onLogout }) => {
  const webcamRef = useRef(null);
  const [inference, setInference] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [wsConnection, setWsConnection] = useState(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);
  const [detectionHistory, setDetectionHistory] = useState([]);

  // WebSocket connection for real-time metrics
  useEffect(() => {
    const sessionId = `operator_${Date.now()}`;
    setSessionId(sessionId);

    const wsUrl = `ws://localhost:8000/ws/metrics/`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setWsConnection(ws);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('Real-time metrics:', data);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setWsConnection(null);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  // Capture and detect defects
  const captureFrame = useCallback(async () => {
    if (!webcamRef.current) return;

    try {
      setLoading(true);
      const imageSrc = webcamRef.current.getScreenshot();

      // Send to backend for inference
      const response = await axios.post('http://localhost:8000/api/core/inference/detect/', {
        image: imageSrc,
      });

      const result = response.data;

      setInference({
        ...result,
        timestamp: new Date(),
        image: imageSrc,
      });

      // Add to history
      setDetectionHistory([
        {
          ...result,
          id: Date.now(),
          timestamp: new Date(),
        },
        ...detectionHistory.slice(0, 19), // Keep last 20
      ]);

      // Broadcast to Super Admin via WebSocket
      if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify({
          type: 'inference_update',
          operator_id: sessionId,
          bounding_boxes: result.detections || [],
          confidence: result.confidence,
          latency_ms: result.latency_ms,
          system_decision: result.system_decision,
          timestamp: new Date().toISOString(),
        }));
      }
    } catch (error) {
      console.error('Error capturing frame:', error);
      alert('Error during inference');
    } finally {
      setLoading(false);
    }
  }, [sessionId, wsConnection, detectionHistory]);

  // Auto-capture frames at 2 FPS
  useEffect(() => {
    const interval = setInterval(() => {
      captureFrame();
    }, 500); // 500ms = 2 FPS

    return () => clearInterval(interval);
  }, [captureFrame]);

  // Handle operator decision
  const handleOperatorDecision = async (finalDecision) => {
    if (!inference) return;

    try {
      // Save operator override to backend
      const response = await axios.post(
        `http://localhost:8000/api/core/inference-logs/${inference.id}/operator_override/`,
        {
          final_decision: finalDecision,
          comment: `Operator ${finalDecision === 'PASS' ? 'Approved' : 'Rejected'}`,
        }
      );

      console.log('Decision saved:', response.data);

      // If rejected (False Positive), it's automatically queued for retraining
      if (finalDecision === 'PASS' && inference.system_decision === 'FAIL') {
        console.log('Sample queued for retraining (False Positive)');
      }

      // Reset for next detection
      setInference(null);
    } catch (error) {
      console.error('Error saving decision:', error);
      alert('Error saving decision');
    }
  };

  return (
    <div className="operator-dashboard">
      <div className="dashboard-header">
        <h1>Operator Panel - Live Defect Detection</h1>
        <button onClick={onLogout} className="logout-btn">Logout</button>
      </div>

      <div className="dashboard-layout">
        {/* Left: Webcam Feed */}
        <div className="webcam-container">
          <div className="webcam-wrapper">
            <Webcam
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              width={640}
              height={480}
              className="webcam-feed"
            />
            {inference && inference.detections && inference.detections.length > 0 && (
              <div className="detection-overlay">
                <p className="detection-alert">⚠️ DEFECT DETECTED</p>
              </div>
            )}
          </div>

          {/* System Decision */}
          {inference && (
            <div className={`system-decision ${inference.system_decision.toLowerCase()}`}>
              <h3>System Decision: {inference.system_decision}</h3>
              <p>Confidence: {(inference.confidence * 100).toFixed(2)}%</p>
              <p>Latency: {inference.latency_ms.toFixed(2)}ms</p>
              <p>Detections: {inference.num_detections}</p>
            </div>
          )}
        </div>

        {/* Right: Controls & Info */}
        <div className="controls-panel">
          {/* Big Approve/Reject Buttons */}
          {inference && (
            <div className="decision-buttons">
              <button
                className="btn-approve"
                onClick={() => handleOperatorDecision('PASS')}
                disabled={loading}
              >
                ✓ APPROVE
              </button>
              <button
                className="btn-reject"
                onClick={() => handleOperatorDecision('FAIL')}
                disabled={loading}
              >
                ✗ REJECT
              </button>
            </div>
          )}

          {/* Confidence Threshold Slider */}
          <div className="settings-panel">
            <label>Confidence Threshold: {(confidenceThreshold * 100).toFixed(0)}%</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
            />
          </div>

          {/* Detection History */}
          <div className="history-panel">
            <h3>Recent Detections</h3>
            <div className="history-list">
              {detectionHistory.map((item) => (
                <div key={item.id} className={`history-item ${item.system_decision.toLowerCase()}`}>
                  <div className="time">{item.timestamp.toLocaleTimeString()}</div>
                  <div className="confidence">
                    Confidence: {(item.confidence * 100).toFixed(1)}%
                  </div>
                  <div className="decision">{item.system_decision}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="stats-panel">
            <h3>Session Stats</h3>
            <p>Total Detections: {detectionHistory.length}</p>
            <p>
              Pass Rate:{' '}
              {(
                (detectionHistory.filter((d) => d.system_decision === 'PASS').length /
                  detectionHistory.length) *
                100
              ).toFixed(1)}
              %
            </p>
          </div>
        </div>
      </div>

      {loading && <div className="loading-spinner">Processing...</div>}
    </div>
  );
};

export default OperatorDashboard;
