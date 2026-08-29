import axios from 'axios';
import { navigate } from './router.jsx';

/**
 * The single axios instance every screen talks through.
 *
 * Two things happen here so no component has to think about them: the bearer token is attached on
 * the way out, and every failure is turned into an `ApiError`-shaped object with a message that is
 * already safe to show a user. A 401 clears the session and bounces to the login page.
 */

const TOKEN_KEY = 'routeledger.token';
const SESSION_KEY = 'routeledger.session';

export const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 25000,
  headers: { 'Content-Type': 'application/json' },
});

export const tokenStore = {
  read() {
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  write(token) {
    try {
      if (token) window.localStorage.setItem(TOKEN_KEY, token);
      else window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode - the app still works for the length of the tab */
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
    this.write(null);
    this.writeSession(null);
  },
};

client.interceptors.request.use((config) => {
  const token = tokenStore.read();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(normalise(error)),
);

/** Turns any axios failure into `{ status, message, fieldErrors, raw }`. Never throws itself. */
function normalise(error) {
  if (error.response) {
    const { status, data } = error.response;
    const fieldErrors = Array.isArray(data?.fieldErrors) ? data.fieldErrors : [];
    let message = data?.message || data?.error || `Request failed (${status}).`;
    if (status === 401) {
      tokenStore.clear();
      if (!window.location.pathname.startsWith('/login')) {
        navigate('/login?expired=1', { replace: true });
      }
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

const unwrap = (promise) => promise.then((response) => response.data);

/** Drops null/undefined/'' so we never send `?routeId=` and confuse the binder. */
function params(input = {}) {
  const out = {};
  Object.entries(input).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      out[key] = value;
    }
  });
  return out;
}

export const api = {
  ping: () => unwrap(client.get('/public/ping')),

  auth: {
    login: (body) => unwrap(client.post('/auth/login', body)),
    register: (body) => unwrap(client.post('/auth/register', body)),
    me: () => unwrap(client.get('/auth/me')),
    changePassword: (body) => unwrap(client.post('/auth/change-password', body)),
  },

  dashboard: {
    overview: (from, to) => unwrap(client.get('/dashboard', { params: params({ from, to }) })),
  },

  routes: {
    list: (activeOnly) => unwrap(client.get('/routes', { params: params({ activeOnly }) })),
    staff: () => unwrap(client.get('/routes/staff')),
    get: (id) => unwrap(client.get(`/routes/${id}`)),
    create: (body) => unwrap(client.post('/routes', body)),
    update: (id, body) => unwrap(client.put(`/routes/${id}`, body)),
    setActive: (id, active) => unwrap(client.patch(`/routes/${id}/active`, null, { params: { active } })),
  },

  products: {
    page: (page, size) => unwrap(client.get('/products', { params: params({ page, size }) })),
    active: () => unwrap(client.get('/products/active')),
    create: (body) => unwrap(client.post('/products', body)),
    update: (id, body) => unwrap(client.put(`/products/${id}`, body)),
    setActive: (id, active) =>
      unwrap(client.patch(`/products/${id}/active`, null, { params: { active } })),
  },

  customers: {
    page: (query) => unwrap(client.get('/customers', { params: params(query) })),
    search: (q, limit) => unwrap(client.get('/customers/search', { params: params({ q, limit }) })),
    beats: (query) => unwrap(client.get('/customers/beats', { params: params(query) })),
    get: (id) => unwrap(client.get(`/customers/${id}`)),
    create: (body) => unwrap(client.post('/customers', body)),
    update: (id, body) => unwrap(client.put(`/customers/${id}`, body)),
    setActive: (id, active) =>
      unwrap(client.patch(`/customers/${id}/active`, null, { params: { active } })),
  },

  subscriptions: {
    forCustomer: (customerId) => unwrap(client.get('/subscriptions', { params: { customerId } })),
    create: (body) => unwrap(client.post('/subscriptions', body)),
    update: (id, body) => unwrap(client.put(`/subscriptions/${id}`, body)),
    setActive: (id, active) =>
      unwrap(client.patch(`/subscriptions/${id}/active`, null, { params: { active } })),
  },

  pauses: {
    forCustomer: (customerId) => unwrap(client.get('/pauses', { params: { customerId } })),
    calendar: (from, to) => unwrap(client.get('/pauses/calendar', { params: params({ from, to }) })),
    create: (body) => unwrap(client.post('/pauses', body)),
    remove: (id) => unwrap(client.delete(`/pauses/${id}`)),
  },

  runs: {
    generate: (body) => unwrap(client.post('/runs/generate', body)),
    page: (page, size) => unwrap(client.get('/runs', { params: params({ page, size }) })),
    byDate: (date) => unwrap(client.get('/runs/by-date', { params: params({ date }) })),
    mine: (date) => unwrap(client.get('/runs/mine', { params: params({ date }) })),
    detail: (id) => unwrap(client.get(`/runs/${id}`)),
    updateStop: (stopId, body) => unwrap(client.patch(`/runs/stops/${stopId}`, body)),
  },

  invoices: {
    generate: (body) => unwrap(client.post('/invoices/generate', body)),
    page: (query) => unwrap(client.get('/invoices', { params: params(query) })),
    forCustomer: (customerId) => unwrap(client.get(`/invoices/by-customer/${customerId}`)),
    get: (id) => unwrap(client.get(`/invoices/${id}`)),
    payments: (id) => unwrap(client.get(`/invoices/${id}/payments`)),
    adjust: (id, body) => unwrap(client.patch(`/invoices/${id}/adjust`, body)),
    cancel: (id) => unwrap(client.patch(`/invoices/${id}/cancel`)),
  },

  payments: {
    record: (body) => unwrap(client.post('/payments', body)),
    page: (query) => unwrap(client.get('/payments', { params: params(query) })),
    forCustomer: (customerId) => unwrap(client.get(`/payments/by-customer/${customerId}`)),
  },

  collections: {
    dues: (limit) => unwrap(client.get('/collections/dues', { params: params({ limit }) })),
  },
};
