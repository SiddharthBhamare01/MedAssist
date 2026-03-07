import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 120000, // 2 min — agents can take time
});

// Attach JWT to every request if available
api.interceptors.request.use((config) => {
  // Token stored in AuthContext — passed via custom header by callers
  return config;
});

// Global error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error || 'Something went wrong. Please try again.';
    return Promise.reject(new Error(message));
  }
);

export default api;
