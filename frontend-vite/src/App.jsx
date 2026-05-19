import { useEffect, useMemo, useState } from "react";
import { jwtDecode } from "jwt-decode";
import { getApiStatus } from "./api/backend";
import AdminDashboard from "./components/AdminDashboard";
import Login from "./components/Login";
import InspectorDashboard from "./components/InspectorDashboard";
import OperatorPanel from "./components/OperatorPanel";
import SuperAdminPanel from "./components/SuperAdminPanel";
import CameraSender from "./components/CameraSender";
import CameraReceiver from "./components/CameraReceiver";
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

function readUsername(token) {
  if (!token) {
    return null;
  }

  try {
    const decoded = jwtDecode(token);
    return decoded.username || decoded.sub || "User";
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

function readAppMode() {
  if (typeof window === "undefined") {
    return "standard";
  }

  const mode = new URLSearchParams(window.location.search).get("mode");
  if (!mode) return "standard";
  if (mode === "camera") return "camera";
  if (mode === "relay-sender") return "relay-sender";
  if (mode === "relay-receiver") return "relay-receiver";
  return "standard";
}

function App() {
  const [token, setToken] = useState(() => readStoredToken());
  const [apiMessage, setApiMessage] = useState("Connecting to backend...");
  const appMode = useMemo(() => readAppMode(), []);

  const role = useMemo(() => readRole(token), [token]);
  const username = useMemo(() => readUsername(token), [token]);

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
    return <SuperAdminPanel onLogout={handleLogout} username={username} />;
  }

  if (appMode === "relay-sender") {
    return <CameraSender />;
  }

  if (appMode === "relay-receiver") {
    return <CameraReceiver />;
  }

  if (role === "operator") {
    return (
      <OperatorPanel
        onLogout={handleLogout}
        username={username}
        cameraOnly={appMode === "camera"}
      />
    );
  }

  if (role === "inspector") {
    return <InspectorDashboard onLogout={handleLogout} />;
  }

  // Default to inspector for unknown roles
  return <InspectorDashboard onLogout={handleLogout} />;
}

export default App;
