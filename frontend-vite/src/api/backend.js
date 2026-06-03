import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      const refresh = localStorage.getItem("refresh");

      if (refresh) {
        try {
          const response = await axios.post(`${API_BASE}/auth/refresh/`, {
            refresh,
          });
          const newAccess = response.data.access;

          localStorage.setItem("token", newAccess);
          api.defaults.headers.Authorization = `Bearer ${newAccess}`;

          return api(originalRequest);
        } catch {
          localStorage.removeItem("token");
          localStorage.removeItem("refresh");
          window.location.reload();
        }
      }
    }

    return Promise.reject(error);
  },
);

export const loginUser = (credentials) =>
  api.post("/auth/login/", {
    username: credentials.username,
    password: credentials.password,
  });

export const getApiStatus = () => api.get("/dashboard/stats/");
export const detectImage = (payload) => api.post("/inference/detect/", payload);
export const getComponents = () => api.get("/component-types/");
export const getModels = () => api.get("/ai-models/");
export const getOperators = () => api.get("/operators/");
export const getOperatorPreset = () => api.get("/operator/preset/");
export const getAdminSettings = () => api.get("/admin/settings/");
export const createAdminSettings = (data) => api.post("/admin/settings/", data);
export const updateAdminSettings = (id, data) =>
  api.patch(`/admin/settings/${id}/`, data);
export const deleteAdminSettings = (id) => api.delete(`/admin/settings/${id}/`);
export const getDetectionLogs = (params = {}) => api.get("/inference-logs/", { params });
export const createDetectionLog = (data) => api.post("/inference-logs/", data);
export const reviewInferenceLog = (id, data) =>
  api.post(`/inference-logs/${id}/review/`, data);
export const autoApproveInferenceLog = (id) =>
  api.post(`/inference-logs/${id}/auto_approve/`);

export const buildWebSocketUrl = (path) => {
  const configuredBase = import.meta.env.VITE_WS_BASE_URL;

  if (configuredBase) {
    let wsUrl = configuredBase;
    if (window.location.protocol === "https:") {
      wsUrl = wsUrl.replace(/^ws:\/\//i, "wss://").replace(/^http:\/\//i, "wss://");
    } else {
      wsUrl = wsUrl.replace(/^wss:\/\//i, "ws://").replace(/^https:\/\//i, "ws://");
    }
    const wsBase = wsUrl.replace(/\/$/, "");
    const normalizedPath = String(path || "").startsWith("/")
      ? String(path)
      : `/${String(path || "")}`;
    return `${wsBase}${normalizedPath}`;
  }

  // ← No base URL set: use same host/port as the page (goes through Vite proxy)
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host; // includes port, e.g. 10.0.2.132:5173
  const normalizedPath = String(path || "").startsWith("/")
    ? String(path)
    : `/${String(path || "")}`;
  return `${protocol}://${host}${normalizedPath}`;
};

export const buildInferenceStreamUrl = (token) => {
  const encodedToken = encodeURIComponent(token || "");
  return `${buildWebSocketUrl("/ws/inference-stream/")}?token=${encodedToken}`;
};

export default api;
