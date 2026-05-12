import { useEffect, useMemo, useState } from "react";
import { jwtDecode } from "jwt-decode";
import { getApiStatus } from "./api/backend";
import AdminDashboard from "./components/AdminDashboard";
import Login from "./components/Login";
import InspectorDashboard from "./components/InspectorDashboard";
import OperatorPanel from "./components/OperatorPanel";
import SuperAdminPanel from "./components/SuperAdminPanel";
import "./App.css";

function normalizeRole(role) {
  if (!role) {
    return null;
  }

  const normalized = role.toLowerCase().replace(/_/g, "");

  // Map backend roles to frontend role identifiers
  if (normalized === "superadmin") {
    return "superadmin";
  }
  if (normalized === "admin") {
    return "admin";
  }
  if (normalized === "operator") {
    return "operator";
  }
  if (normalized === "inspector") {
    return "inspector";
  }

  return normalized;
}

function readRole(token) {
  if (!token) {
    return null;
  }

  try {
    const decoded = jwtDecode(token);
    return normalizeRole(decoded.role || decoded.groups?.[0] || "operator");
  } catch {
    return null;
  }
}

function readStoredToken() {
  const storedToken = localStorage.getItem("token");

  if (!storedToken) {
    return null;
  }

  if (!readRole(storedToken)) {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh");
    return null;
  }

  return storedToken;
}

function App() {
  const [token, setToken] = useState(() => readStoredToken());
  const [apiMessage, setApiMessage] = useState("Connecting to backend...");

  const role = useMemo(() => readRole(token), [token]);

  const handleLogin = (accessToken) => {
    localStorage.setItem("token", accessToken);
    setToken(accessToken);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh");
    setToken(null);
  };

  useEffect(() => {
    getApiStatus()
      .then((response) => {
        setApiMessage(response.data.message || "Backend connected");
      })
      .catch(() => {
        setApiMessage("Backend not reachable yet");
      });
  }, []);

  if (!token) {
    return <Login onLogin={handleLogin} apiMessage={apiMessage} />;
  }

  if (role === "admin") {
    return <AdminDashboard onLogout={handleLogout} role={role} />;
  }

  if (role === "superadmin") {
    return <SuperAdminPanel onLogout={handleLogout} />;
  }

  if (role === "operator") {
    return <OperatorPanel onLogout={handleLogout} />;
  }

  if (role === "inspector") {
    return <InspectorDashboard onLogout={handleLogout} />;
  }

  // Default to inspector for unknown roles
  return <InspectorDashboard onLogout={handleLogout} />;
}

export default App;
