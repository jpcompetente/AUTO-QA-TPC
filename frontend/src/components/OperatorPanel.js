import React, { useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import {
  createDetectionLog,
  getDetectionLogs
} from '../api/backend';
import axios from 'axios';

const OperatorPanel = ({ onLogout }) => {
  const webcamRef = useRef(null);

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detectionResult, setDetectionResult] = useState(null);

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
    fetchLogs();
  }, []);

  // 🎥 Capture → Detect → Save Log
  const handleDetect = async () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (!imageSrc) return;

    setLoading(true);

    try {
      // 1️⃣ Detect image
      const detectRes = await axios.post(
        'http://127.0.0.1:8000/api/detect/',
        { image: imageSrc }
      );

      const result = detectRes.data.result;
      setDetectionResult(detectRes.data);

      // 2️⃣ Auto save log (NO operator field)
      await createDetectionLog({
        component_type: "Resistor",
        ai_model: "AI_Model_v1",
        result: result
      });

      // 3️⃣ Refresh logs
      fetchLogs();

    } catch (err) {
      console.error("Detection error:", err.response?.data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Operator Panel</h2>

      {/* 🔑 Logout */}
      <button onClick={onLogout} style={{ marginBottom: '20px' }}>
        Logout
      </button>

      {/* 🎥 Camera */}
      <Webcam
        ref={webcamRef}
        screenshotFormat="image/jpeg"
        width={400}
      />

      <br /><br />

      <button onClick={handleDetect} disabled={loading}>
        {loading ? "Processing..." : "Capture & Detect"}
      </button>

      {/* 🧠 Detection Result */}
      {detectionResult && (
        <div style={{ marginTop: '20px' }}>
          <h3>Detection Result</h3>
          <pre>{JSON.stringify(detectionResult, null, 2)}</pre>
        </div>
      )}

      {/* 📊 Logs Table */}
      <div style={{ marginTop: '30px' }}>
        <h3>Detection Logs</h3>

        <table border="1" cellPadding="10">
          <thead>
            <tr>
              <th>ID</th>
              <th>Component</th>
              <th>Model</th>
              <th>Result</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id}>
                <td>{log.id}</td>
                <td>{log.component_type}</td>
                <td>{log.ai_model}</td>
                <td>{log.result}</td>
                <td>{new Date(log.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {logs.length === 0 && <p>No logs yet.</p>}
      </div>
    </div>
  );
};

export default OperatorPanel;