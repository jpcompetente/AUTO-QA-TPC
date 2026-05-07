import React, { useRef, useState, useEffect } from 'react';
import Webcam from 'react-webcam';
import { jwtDecode } from 'jwt-decode';
import api, { refreshToken } from './api/backend';

// Components
import AdminDashboard from './components/AdminDashboard';
import OperatorPanel from './components/OperatorPanel';
import SuperAdminPanel from './components/SuperAdminPanel';
import Login from './components/Login';

function App() {
  const webcamRef = useRef(null);

  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [detectionResult, setDetectionResult] = useState(null);

  const [token, setToken] = useState(localStorage.getItem('token'));
  const [role, setRole] = useState(null);

  // ✅ Fetch test API (now using api instance with headers)
  useEffect(() => {
    api.get('/data/')
      .then(res => {
        setMessage(res.data.message);
        setLoading(false);
      })
      .catch(err => {
        console.error("Data fetch failed:", err.response?.data || err.message);
        setMessage('Failed to fetch data');
        setLoading(false);
      });
  }, []);

  // ✅ Decode token → role
  useEffect(() => {
    if (token) {
      try {
        const decoded = jwtDecode(token);
        const userRole = decoded.role || decoded.groups?.[0] || 'operator';
        setRole(userRole);
      } catch {
        handleLogout();
      }
    }
  }, [token]);

  // 🔑 Login
  const handleLogin = (accessToken) => {
    localStorage.setItem('token', accessToken);
    setToken(accessToken);
  };

  // 🔑 Logout
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh');
    setToken(null);
    setRole(null);
  };

  // 🔄 Manual refresh token (if needed)
  const renewToken = async () => {
    const refresh = localStorage.getItem('refresh');
    if (!refresh) return;
    try {
      const res = await refreshToken(refresh);
      localStorage.setItem('token', res.data.access);
      setToken(res.data.access);
    } catch {
      handleLogout();
    }
  };

  // 📂 Upload
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await api.post('/detect/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setDetectionResult(res.data);
    } catch (err) {
      console.error("Upload failed:", err.response?.data || err.message);
      setDetectionResult({ error: 'Detection failed' });
    }
  };

  // 🎥 Capture
  const capture = async () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (!imageSrc) return;

    try {
      const res = await api.post('/detect/', { image: imageSrc });
      setDetectionResult(res.data);
    } catch (err) {
      console.error("Capture failed:", err.response?.data || err.message);
      setDetectionResult({ error: 'Detection failed' });
    }
  };

  // 🔒 Not logged in
  if (!token) return <Login onLogin={handleLogin} />;

  // 🎯 Role routing
  if (role === 'admin') return <AdminDashboard onLogout={handleLogout} />;
  if (role === 'operator') return <OperatorPanel onLogout={handleLogout} />;
  if (role === 'superadmin') return <SuperAdminPanel onLogout={handleLogout} />;

  return <h2>Loading role...</h2>;
}

export default App;
