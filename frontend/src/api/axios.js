import axios from "axios";

const API_BASE_URL =
  import.meta.env?.VITE_API_URL ||
  (typeof process !== "undefined" && process.env?.VITE_API_URL) ||
  "http://localhost:5050/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json"
  }
});

// Request interceptor: inject JWT from localStorage
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 unauthorized
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear auth tokens
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      // Trigger a custom event so React AuthContext can react if needed
      window.dispatchEvent(new Event("medichain_auth_unauthorized"));
    }
    return Promise.reject(error);
  }
);

/**
 * Extracts a user-friendly error message from an axios error
 */
export function getErrorMessage(error) {
  if (error.response?.data?.errors && Array.isArray(error.response.data.errors) && error.response.data.errors.length > 0) {
    return error.response.data.errors.map((e) => e.message || e.msg || JSON.stringify(e)).join(". ");
  }
  if (error.response?.data?.message) {
    return error.response.data.message;
  }
  if (error.response?.data?.error) {
    return error.response.data.error;
  }
  return error.message || "An unexpected error occurred.";
}

export default api;
