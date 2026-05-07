import axios from 'axios';

const API_BASE = "http://127.0.0.1:8000/api";

// ✅ Create axios instance
const api = axios.create({
  baseURL: API_BASE,
});

// ✅ Request interceptor → attach token automatically
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ Response interceptor → auto-refresh token if expired
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refresh = localStorage.getItem('refresh');
      if (refresh) {
        try {
          const res = await axios.post(`${API_BASE}/auth/refresh/`, { refresh });
          const newAccess = res.data.access;
          localStorage.setItem('token', newAccess);
          api.defaults.headers.Authorization = `Bearer ${newAccess}`;
          return api(originalRequest);
        } catch (err) {
          // 🔒 If refresh fails → force logout
          localStorage.removeItem('token');
          localStorage.removeItem('refresh');
          window.location.href = '/';
        }
      }
    }
    return Promise.reject(error);
  }
);

// 🔑 Auth
export const loginUser = async (credentials) =>
  api.post('/auth/login/', {
    username: credentials.username,
    password: credentials.password,
  });

export const refreshToken = async (refresh) =>
  api.post('/auth/refresh/', { refresh });

// ✅ Model Evaluations
export const getModelEvaluations = () => api.get('/model-evaluations/');

// ✅ Detection Logs
export const createDetectionLog = (data) => api.post('/detection-logs/', data);
export const getDetectionLogs = () => api.get('/detection-logs/');

// ✅ Test Data
export const getTestData = () => api.get('/data/');

// ✅ Components / Models / Operators
export const getComponents = () => api.get('/component-types/');
export const getModels = () => api.get('/ai-models/');
export const getOperators = () => api.get('/operators/');

// ✅ Admin Settings CRUD
export const getAdminSettings = () => api.get('/admin/settings/');
export const createAdminSettings = (data) => api.post('/admin/settings/', data);
export const updateAdminSettings = (id, data) => api.put(`/admin/settings/${id}/`, data);
export const deleteAdminSettings = (id) => api.delete(`/admin/settings/${id}/`);

export default api;
