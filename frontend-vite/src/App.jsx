import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  const [logoutOpen, setLogoutOpen] = useState(false);
  const appMode = useMemo(() => readAppMode(), []);

  const role = useMemo(() => readRole(token), [token]);
  const username = useMemo(() => readUsername(token), [token]);

  const handleLogin = (accessToken) => {
    localStorage.setItem("token", accessToken);
    setToken(accessToken);
  };

  const requestLogout = () => {
    setLogoutOpen(true);
  };

  const confirmLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh");
    setToken(null);
    setLogoutOpen(false);
  };

  const cancelLogout = () => setLogoutOpen(false);

  useEffect(() => {
    getApiStatus()
      .then((response) => {
        setApiMessage(response.data.message || "Backend connected");
      })
      .catch(() => {
        setApiMessage("Backend not reachable yet");
      });
  }, []);

  useEffect(() => {
    if (!logoutOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        cancelLogout();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [logoutOpen]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const previousOverflow = document.body.style.overflow;
    if (logoutOpen) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [logoutOpen]);

  if (!token) {
    return <Login onLogin={handleLogin} apiMessage={apiMessage} />;
  }

  // eslint-disable-next-line no-useless-assignment
  let activeView = null;

  if (role === "admin") {
    activeView = <AdminDashboard onLogout={requestLogout} role={role} />;
  } else if (role === "superadmin") {
    activeView = (
      <SuperAdminPanel onLogout={requestLogout} username={username} />
    );
  } else if (appMode === "relay-sender") {
    activeView = <CameraSender />;
  } else if (appMode === "relay-receiver") {
    activeView = <CameraReceiver />;
  } else if (role === "operator") {
    activeView = (
      <OperatorPanel
        onLogout={requestLogout}
        username={username}
        cameraOnly={appMode === "camera"}
      />
    );
  } else {
    activeView = <InspectorDashboard onLogout={requestLogout} />;
  }

  return (
    <>
      {activeView}
      <AnimatePresence>
        {logoutOpen ? (
          <motion.div
            className="logout-modal"
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={cancelLogout}
          >
            <motion.div
              className="logout-modal__panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="logout-modal-title"
              aria-describedby="logout-modal-description"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              onClick={(event) => event.stopPropagation()}
            >
              <h2 id="logout-modal-title">Log out of your session?</h2>
              <p id="logout-modal-description">
                You are signed in as {username || "User"}
                {role ? ` (${role})` : ""}.
              </p>

              <div className="logout-modal__actions">
                <button
                  className="logout-modal__button logout-modal__button--secondary"
                  type="button"
                  onClick={cancelLogout}
                >
                  Stay signed in
                </button>
                <button
                  className="logout-modal__button logout-modal__button--primary"
                  type="button"
                  onClick={confirmLogout}
                >
                  Sign out
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export default App;
