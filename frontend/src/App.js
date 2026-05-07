import React, { useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode";
import api from "./api/backend";

// Components
import AdminDashboard from "./components/AdminDashboard";
import OperatorPanel from "./components/OperatorPanel";
import SuperAdminPanel from "./components/SuperAdminPanel";
import Login from "./components/Login";

function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [role, setRole] = useState(null);
  const [apiMessage, setApiMessage] = useState("");

  const normalizeRole = (rawRole) => {
    if (!rawRole) return null;
    const value = String(rawRole).trim().toLowerCase();
    if (value === "super_admin" || value === "superadmin") return "superadmin";
    if (value === "admin") return "admin";
    if (value === "operator") return "operator";
    return value;
  };

  useEffect(() => {
    api
      .get("/data/")
      .then((res) => {
        setApiMessage(res.data.message);
      })
      .catch((err) => {
        console.error("Data fetch failed:", err.response?.data || err.message);
        setApiMessage("Connected to the dashboard shell");
      });
  }, []);

  useEffect(() => {
    if (token) {
      try {
        const decoded = jwtDecode(token);
        const rawRole = decoded.role || decoded.groups?.[0] || "operator";
        setRole(normalizeRole(rawRole));
      } catch {
        handleLogout();
      }
    }
  }, [token]);

  const handleLogin = (accessToken) => {
    localStorage.setItem("token", accessToken);
    setToken(accessToken);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh");
    setToken(null);
    setRole(null);
  };

  if (!token) return <Login onLogin={handleLogin} apiMessage={apiMessage} />;

  if (role === "admin") return <AdminDashboard onLogout={handleLogout} />;
  if (role === "operator") return <OperatorPanel onLogout={handleLogout} />;
  if (role === "superadmin") return <SuperAdminPanel onLogout={handleLogout} />;

  return (
    <div className="app-loader">
      <div className="app-loader__card">
        <span className="eyebrow">AUTO-QA TPC</span>
        <h2>Reading role permissions</h2>
        <p>{apiMessage || "Preparing your session..."}</p>
      </div>
    </div>
  );
}

export default App;
