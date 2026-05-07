import React, { useEffect, useState } from 'react';
import axios from 'axios';
import '../styles/AnalyticsDashboard.css';

const AnalyticsDashboard = ({ onLogout }) => {
  const [stats, setStats] = useState(null);
  const [latencyTrends, setLatencyTrends] = useState([]);
  const [operatorPerformance, setOperatorPerformance] = useState([]);
  const [modelPerformance, setModelPerformance] = useState([]);
  const [retrainingQueue, setRetrainingQueue] = useState([]);
  const [trainingJobs, setTrainingJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wsConnection, setWsConnection] = useState(null);

  // WebSocket for real-time metrics
  useEffect(() => {
    const wsUrl = `ws://localhost:8000/ws/metrics/`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Analytics WebSocket connected');
      setWsConnection(ws);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'initial_metrics') {
        setStats(data.data);
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  // Fetch analytics data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const headers = { Authorization: `Bearer ${localStorage.getItem('access_token')}` };

        // Dashboard stats
        const statsRes = await axios.get(
          'http://localhost:8000/api/core/analytics/dashboard/',
          { headers }
        );
        setStats(statsRes.data);

        // Latency trends
        const trendsRes = await axios.get(
          'http://localhost:8000/api/core/analytics/latency-trends/?days=7',
          { headers }
        );
        setLatencyTrends(trendsRes.data.trends || []);

        // Operator performance
        const opRes = await axios.get(
          'http://localhost:8000/api/core/analytics/operator-performance/',
          { headers }
        );
        setOperatorPerformance(opRes.data.operators || []);

        // Model performance
        const modelRes = await axios.get(
          'http://localhost:8000/api/core/analytics/model-performance/',
          { headers }
        );
        setModelPerformance(modelRes.data.models || []);

        // Retraining queue
        const queueRes = await axios.get(
          'http://localhost:8000/api/core/retraining-queue/',
          { headers }
        );
        setRetrainingQueue(queueRes.data || []);

        // Training jobs
        const jobsRes = await axios.get(
          'http://localhost:8000/api/core/training-jobs/',
          { headers }
        );
        setTrainingJobs(jobsRes.data || []);

        setLoading(false);
      } catch (error) {
        console.error('Error fetching analytics:', error);
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="loading">Loading analytics...</div>;

  return (
    <div className="analytics-dashboard">
      <div className="dashboard-header">
        <h1>Super Admin - Manufacturing AI Analytics</h1>
        <button onClick={onLogout} className="logout-btn">
          Logout
        </button>
      </div>

      {/* Key Metrics */}
      <div className="metrics-grid">
        <div className="metric-card">
          <h3>Detection Accuracy</h3>
          <div className="metric-value">{stats?.detection_accuracy || 0}%</div>
        </div>
        <div className="metric-card">
          <h3>False Reject Rate (FRR)</h3>
          <div className="metric-value">{stats?.false_reject_rate || 0}%</div>
        </div>
        <div className="metric-card">
          <h3>Avg Latency</h3>
          <div className="metric-value">{stats?.avg_inference_latency || 0}ms</div>
        </div>
        <div className="metric-card">
          <h3>Total Inspections</h3>
          <div className="metric-value">{stats?.total_inspections || 0}</div>
        </div>
      </div>

      {/* Latency Trends Chart */}
      <div className="section">
        <h2>Inference Latency Trends (7 Days)</h2>
        <div className="chart-container">
          <table className="trends-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Avg Latency (ms)</th>
                <th>Sample Count</th>
              </tr>
            </thead>
            <tbody>
              {latencyTrends.map((trend) => (
                <tr key={trend.date}>
                  <td>{trend.date}</td>
                  <td>{trend.avg_latency_ms}</td>
                  <td>{trend.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Operator Performance */}
      <div className="section">
        <h2>Operator Performance</h2>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Operator</th>
                <th>Accuracy</th>
                <th>FRR</th>
                <th>Inspections</th>
                <th>Avg Latency</th>
              </tr>
            </thead>
            <tbody>
              {operatorPerformance.map((op) => (
                <tr key={op.operator_id}>
                  <td>{op.operator_name}</td>
                  <td>{op.accuracy}%</td>
                  <td>{op.false_reject_rate}%</td>
                  <td>{op.total_inspections}</td>
                  <td>{op.avg_latency_ms}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Model Performance */}
      <div className="section">
        <h2>Model Performance Comparison</h2>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Version</th>
                <th>Active</th>
                <th>mAP</th>
                <th>Avg Speed</th>
                <th>Production Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {modelPerformance.map((model) => (
                <tr key={model.model_id}>
                  <td>{model.model_name}</td>
                  <td>{model.version}</td>
                  <td>{model.is_active ? '✓' : '-'}</td>
                  <td>{model.mAP}</td>
                  <td>{model.avg_speed_ms}ms</td>
                  <td>{model.accuracy_on_production}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Retraining Queue */}
      <div className="section">
        <h2>Retraining Queue - Samples Pending Labeling</h2>
        <p className="queue-info">
          Total: {retrainingQueue.length} samples | Training threshold: 100 samples
        </p>
        <div className="queue-progress">
          <div
            className="progress-bar"
            style={{ width: `${(retrainingQueue.length / 100) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Training Jobs */}
      <div className="section">
        <h2>Training Jobs</h2>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Base Model</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Epochs</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {trainingJobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.id}</td>
                  <td>{job.base_model_name}</td>
                  <td>
                    <span className={`status-badge ${job.status.toLowerCase()}`}>
                      {job.status}
                    </span>
                  </td>
                  <td>
                    {job.current_epoch} / {job.epochs}
                  </td>
                  <td>{job.epochs}</td>
                  <td>
                    {job.status === 'COMPLETED' && (
                      <button className="btn-deploy">Deploy</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
