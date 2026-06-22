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

// Retraining / training (admin-only endpoints)
export const getRetrainingQueue = (params = {}) =>
  api.get("/retraining-queue/", { params });

export const labelRetrainingQueueItem = (id, labelData) =>
  api.post(`/retraining-queue/${id}/label/`, { label_data: labelData });

export const triggerTraining = (
  sampleIds,
  { epochs = 10, batchSize = 32, learningRate = 0.001 } = {},
) =>
  api.post("/retraining-queue/batch_trigger_training/", {
    sample_ids: sampleIds,
    epochs,
    batch_size: batchSize,
    learning_rate: learningRate,
  });

export const getTrainingJobs = (params = {}) =>
  api.get("/training-jobs/", { params });

export const deleteTrainingJob = (jobId) =>
  api.delete(`/training-jobs/${jobId}/`);

export const markRetrainingInvalid = (sampleId) =>
  api.post(`/retraining-queue/${sampleId}/mark_invalid/`);

export const deployTrainingJob = (jobId, modelName) =>
  api.post(`/training-jobs/${jobId}/deploy/`, {
    model_name: modelName,
  });

export const exportToLabelStudio = (sampleIds = []) =>
  api.post("/retraining-queue/export_to_label_studio/", {
    sample_ids: sampleIds,
  });

export const importFromLabelStudio = (sampleIds = []) =>
  api.post("/retraining-queue/import_from_label_studio/", {
    sample_ids: sampleIds,
  });

export const buildWebSocketUrl = (path) => {
  const configuredBase = import.meta.env.VITE_WS_BASE_URL;
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const defaultBase = `${protocol}://${window.location.host}`;
  const wsBase = (configuredBase || defaultBase).replace(/\/$/, "");
  const normalizedPath = String(path || "").startsWith("/")
    ? String(path)
    : `/${String(path || "")}`;
  return `${wsBase}${normalizedPath}`;
};

export const buildInferenceStreamUrl = (token) => {
  const encodedToken = encodeURIComponent(token || "");
  return `wss://10.0.2.134/ws/inference-stream/?token=${encodedToken}`;
};

export default api;

