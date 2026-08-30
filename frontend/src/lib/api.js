// @ts-check
import axios from 'axios';
import { navigate } from './router.jsx';

/**
 * The single axios instance every screen talks through.
 *
 * Short-lived access tokens are stored in memory only (never written to localStorage/sessionStorage).
 * The rotating refresh token is stored in localStorage to preserve the user's session across tab reloads.
 * On 401 Unauthorized, an automatic silent token refresh is attempted before forcing logout.
 */

const REFRESH_TOKEN_KEY = 'routeledger.refresh_token';
const SESSION_KEY = 'routeledger.session';

let inMemoryAccessToken = null;
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

export const tokenStore = {
  getAccessToken() {
    return inMemoryAccessToken;
  },
  setAccessToken(token) {
    inMemoryAccessToken = token || null;
  },
  getRefreshToken() {
    try {
      return window.localStorage.getItem(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  },
  setRefreshToken(refreshToken) {
    try {
      if (refreshToken) {
        window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      } else {
        window.localStorage.removeItem(REFRESH_TOKEN_KEY);
      }
    } catch {
      /* private mode */
    }
  },
  readSession() {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  writeSession(session) {
    try {
      if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else window.localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  },
  clear() {
    inMemoryAccessToken = null;
    this.setRefreshToken(null);
    this.writeSession(null);
  },
};

export const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 25000,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use((config) => {
  const token = tokenStore.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't loop on refresh/logout endpoints
      const url = originalRequest.url || '';
      if (url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/logout')) {
        tokenStore.clear();
        return Promise.reject(normalise(error));
      }

      const refreshToken = tokenStore.getRefreshToken();
      if (!refreshToken) {
        tokenStore.clear();
        if (!window.location.pathname.startsWith('/login')) {
          navigate('/login?expired=1', { replace: true });
        }
        return Promise.reject(normalise(error));
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((newToken) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return client(originalRequest);
          })
          .catch((err) => Promise.reject(normalise(err)));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshResponse = await axios.post(
          `${client.defaults.baseURL}/auth/refresh`,
          { refreshToken },
          { headers: { 'Content-Type': 'application/json' } },
        );
        const { token: newAccessToken, refreshToken: newRefreshToken } = refreshResponse.data;
        tokenStore.setAccessToken(newAccessToken);
        if (newRefreshToken) {
          tokenStore.setRefreshToken(newRefreshToken);
        }
        client.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        processQueue(null, newAccessToken);
        return client(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        tokenStore.clear();
        if (!window.location.pathname.startsWith('/login')) {
          navigate('/login?expired=1', { replace: true });
        }
        return Promise.reject(normalise(refreshError));
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(normalise(error));
  },
);

/** Turns any axios failure into `{ status, message, fieldErrors, raw }`. Never throws itself. */
export function normalise(error) {
  if (error.response) {
    const { status, data } = error.response;
    const fieldErrors = Array.isArray(data?.fieldErrors) ? data.fieldErrors : [];
    let message = data?.message || data?.error || `Request failed (${status}).`;
    if (status === 401) {
      message = 'Your session has expired. Please sign in again.';
    }
    if (status === 403) {
      message = data?.message || 'Your role does not allow that action.';
    }
    if (status >= 500) {
      message = 'The server had a problem completing that. Nothing was changed.';
    }
    return { status, message, fieldErrors, raw: data };
  }
  if (error.code === 'ECONNABORTED') {
    return { status: 0, message: 'That took too long. Check your connection and retry.', fieldErrors: [] };
  }
  return {
    status: 0,
    message: 'Cannot reach the RouteLedger API. It may still be starting up.',
    fieldErrors: [],
  };
}

export const api = {
  auth: {
    login: (body) => client.post('/auth/login', body).then((r) => r.data),
    register: (body) => client.post('/auth/register', body).then((r) => r.data),
    refresh: (body) => client.post('/auth/refresh', body).then((r) => r.data),
    logout: (body) => client.post('/auth/logout', body).then((r) => r.data),
    verifyEmail: (token) => client.post(`/auth/verify?token=${encodeURIComponent(token)}`).then((r) => r.data),
    me: () => client.get('/auth/me').then((r) => r.data),
    changePassword: (body) => client.post('/auth/password', body).then((r) => r.data),
  },

  dashboard: {
    /** GET /dashboard?from=&to= — the single aggregated read the home screen needs. */
    overview: (from, to) => client.get('/dashboard', { params: { from, to } }).then((r) => r.data),
  },

  customers: {
    page: (params) => client.get('/customers', { params }).then((r) => r.data),
    search: (q, limit = 10) => client.get('/customers/search', { params: { q, limit } }).then((r) => r.data),
    get: (id) => client.get(`/customers/${id}`).then((r) => r.data),
    create: (body) => client.post('/customers', body).then((r) => r.data),
    update: (id, body) => client.put(`/customers/${id}`, body).then((r) => r.data),
    setActive: (id, active) => client.patch(`/customers/${id}/active`, null, { params: { active } }).then((r) => r.data),
    beats: (params) => client.get('/customers/beats', { params }).then((r) => r.data),
  },

  products: {
    page: (params) => client.get('/products', { params }).then((r) => r.data),
    active: () => client.get('/products/active').then((r) => r.data),
    get: (id) => client.get(`/products/${id}`).then((r) => r.data),
    create: (body) => client.post('/products', body).then((r) => r.data),
    update: (id, body) => client.put(`/products/${id}`, body).then((r) => r.data),
    setActive: (id, active) => client.patch(`/products/${id}/active`, null, { params: { active } }).then((r) => r.data),
  },

  routes: {
    list: (activeOnly = false) => client.get('/routes', { params: { activeOnly } }).then((r) => r.data),
    /** Everyone on the payroll, for assigning a beat to an agent. */
    staff: () => client.get('/routes/staff').then((r) => r.data),
    get: (id) => client.get(`/routes/${id}`).then((r) => r.data),
    create: (body) => client.post('/routes', body).then((r) => r.data),
    update: (id, body) => client.put(`/routes/${id}`, body).then((r) => r.data),
    setActive: (id, active) => client.patch(`/routes/${id}/active`, null, { params: { active } }).then((r) => r.data),
  },

  subscriptions: {
    forCustomer: (customerId) => client.get('/subscriptions', { params: { customerId } }).then((r) => r.data),
    get: (id) => client.get(`/subscriptions/${id}`).then((r) => r.data),
    create: (body) => client.post('/subscriptions', body).then((r) => r.data),
    advanceSubscribe: (body) => client.post('/subscriptions/advance-subscribe', body).then((r) => r.data),
    pendingApprovals: () => client.get('/subscriptions/pending-approvals').then((r) => r.data),
    approve: (id) => client.patch(`/subscriptions/${id}/approve`).then((r) => r.data),
    reject: (id) => client.patch(`/subscriptions/${id}/reject`).then((r) => r.data),
    update: (id, body) => client.put(`/subscriptions/${id}`, body).then((r) => r.data),
    setActive: (id, active) => client.patch(`/subscriptions/${id}/active`, null, { params: { active } }).then((r) => r.data),
  },

  pauses: {
    forCustomer: (customerId) => client.get('/pauses', { params: { customerId } }).then((r) => r.data),
    calendar: (from, to) => client.get('/pauses/calendar', { params: { from, to } }).then((r) => r.data),
    create: (body) => client.post('/pauses', body).then((r) => r.data),
    quickSkipTomorrow: (customerId, reason) =>
      client.post('/pauses/quick-skip-tomorrow', null, { params: { customerId, reason } }).then((r) => r.data),
    delete: (id) => client.delete(`/pauses/${id}`).then((r) => r.data),
  },

  runs: {
    page: (params) => client.get('/runs', { params }).then((r) => r.data),
    byDate: (date) => client.get('/runs/by-date', { params: { date } }).then((r) => r.data),
    mine: (date) => client.get('/runs/mine', { params: { date } }).then((r) => r.data),
    detail: (id) => client.get(`/runs/${id}`).then((r) => r.data),
    generate: (body) => client.post('/runs/generate', body).then((r) => r.data),
    updateStop: (stopId, body) => client.patch(`/runs/stops/${stopId}`, body).then((r) => r.data),
  },

  invoices: {
    page: (params) => client.get('/invoices', { params }).then((r) => r.data),
    forCustomer: (customerId) => client.get(`/invoices/by-customer/${customerId}`).then((r) => r.data),
    get: (id) => client.get(`/invoices/${id}`).then((r) => r.data),
    payments: (id) => client.get(`/invoices/${id}/payments`).then((r) => r.data),
    generate: (body) => client.post('/invoices/generate', body).then((r) => r.data),
    adjust: (id, body) => client.patch(`/invoices/${id}/adjust`, body).then((r) => r.data),
    cancel: (id) => client.patch(`/invoices/${id}/cancel`).then((r) => r.data),
  },

  payments: {
    page: (params) => client.get('/payments', { params }).then((r) => r.data),
    forCustomer: (customerId) => client.get(`/payments/by-customer/${customerId}`).then((r) => r.data),
    record: (body) => client.post('/payments', body).then((r) => r.data),
  },

  collections: {
    dues: (limit = 50) => client.get('/collections/dues', { params: { limit } }).then((r) => r.data),
  },

  marketplace: {
    vendors: () => client.get('/marketplace/vendors').then((r) => r.data),
    subscribe: (body) => client.post('/marketplace/subscribe', body).then((r) => r.data),
    mySubscriptions: (phone) => client.get('/marketplace/my-subscriptions', { params: { phone } }).then((r) => r.data),
    quickSkipTomorrow: (phone, subscriptionId) =>
      client.post('/marketplace/quick-skip-tomorrow', null, { params: { phone, subscriptionId } }).then((r) => r.data),
  },
};
