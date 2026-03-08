import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 120000, // 2 min — agents can take time
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  try {
    const stored = localStorage.getItem('medassist_auth');
    if (stored) {
      const { token } = JSON.parse(stored);
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
  } catch { /* ignore */ }
  return config;
});

// Global response error handler — toast on server/network errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status  = error.response?.status;
    const message = error.response?.data?.error || error.message || 'Something went wrong.';

    // 401 — silently pass through (handled by individual pages / auth redirect)
    if (status === 401) {
      return Promise.reject(Object.assign(new Error(message), { status, _silent: true }));
    }

    // 429 — rate limit
    if (status === 429) {
      toast.error('Too many requests — please wait a moment before trying again.', { id: 'rate-limit' });
    }
    // 500+ — server error
    else if (status >= 500) {
      toast.error(`Server error (${status}): ${message}`, { id: `server-${status}` });
    }
    // Network / timeout error (no response)
    else if (!error.response) {
      toast.error('Network error — check your connection or try again.', { id: 'network-error' });
    }

    return Promise.reject(Object.assign(new Error(message), { status }));
  }
);

export default api;
