import axios from 'axios';

const TOKEN_KEY = 'ble_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const api = axios.create({ baseURL: '/api', timeout: 60000 });

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    // Blob requests (PDFs) return JSON errors as blobs – decode them.
    if (error.response?.data instanceof Blob && error.response.data.type?.includes('json')) {
      try {
        error.response.data = JSON.parse(await error.response.data.text());
      } catch { /* ignore */ }
    }
    if (error.response?.status === 401 && !error.config.url.includes('/auth/login')) {
      tokenStore.clear();
      window.dispatchEvent(new Event('ble:logout'));
    }
    return Promise.reject(error);
  },
);

export function errorMessage(err, fallback = 'Something went wrong') {
  if (!err.response) return 'Cannot reach the server. Check that the backend is running';
  return err.response.data?.message || fallback;
}

export const fieldErrors = (err) => err?.response?.data?.fields || {};

/** Permanent delete – the server requires the company delete code. */
export const deleteWithCode = (url, code) => api.delete(url, { headers: { 'X-Delete-Code': code } });

/** Convert a plain object to FormData (arrays → repeated keys, null/undefined skipped). */
export function toFormData(values, files = {}) {
  const fd = new FormData();
  Object.entries(values).forEach(([k, v]) => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) v.forEach((x) => fd.append(k, x));
    else fd.append(k, v);
  });
  Object.entries(files).forEach(([k, list]) => [].concat(list || []).forEach((f) => fd.append(k, f)));
  return fd;
}
