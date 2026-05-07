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
  api.post("/auth/token/", {
    username: credentials.username,
    password: credentials.password,
  });

export const getApiStatus = () => api.get("/dashboard/stats/");
export const detectImage = (payload) => api.post("/detect/", payload);
export const getComponents = () => api.get("/component-types/");
export const getModels = () => api.get("/ai-models/");
export const getOperators = () => api.get("/operators/");
export const getAdminSettings = () => api.get("/admin/settings/");
export const createAdminSettings = (data) => api.post("/admin/settings/", data);
export const deleteAdminSettings = (id) => api.delete(`/admin/settings/${id}/`);
export const getDetectionLogs = () => api.get("/inference-logs/");
export const createDetectionLog = (data) => api.post("/inference-logs/", data);

export default api;
