function resolveApiBase() {
  // Dev must use same-origin `/api` (Vite proxy → Django) so HttpOnly refresh cookies are sent.
  // If VITE_API_URL pointed at :8001 here, requests would be cross-origin and cookies would not attach.
  if (import.meta.env.DEV) {
    return '/api';
  }
  const raw = (import.meta.env.VITE_API_URL || '').trim();
  if (raw) {
    try {
      const u = new URL(raw);
      if (u.hostname) return raw.replace(/\/+$/, '');
    } catch {
      // fall through
    }
  }
  const host = (typeof window !== 'undefined' && window.location?.hostname) ? window.location.hostname : 'localhost';
  return `http://${host}:8001/api`;
}

const API_BASE = resolveApiBase();
const DEFAULT_TIMEOUT_MS = 12000;

/** Short-lived access token (sessionStorage); refresh stays HttpOnly cookie. */
const ACCESS_STORAGE_KEY = 'equilo_access';

function getAccessToken() {
  try {
    return (
      sessionStorage.getItem(ACCESS_STORAGE_KEY) ||
      localStorage.getItem('access') ||
      null
    );
  } catch {
    return null;
  }
}

function setAccessToken(token) {
  try {
    sessionStorage.setItem(ACCESS_STORAGE_KEY, token);
    localStorage.removeItem('access');
  } catch {
    try {
      localStorage.setItem('access', token);
    } catch {
      /* empty */
    }
  }
}

function clearAccessToken() {
  try {
    sessionStorage.removeItem(ACCESS_STORAGE_KEY);
    localStorage.removeItem('access');
  } catch {
    /* empty */
  }
}

const defaultFetchOptions = { credentials: 'include' };

async function fetchWithTimeout(input, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...defaultFetchOptions, ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function api(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let res;
  try {
    res = await fetchWithTimeout(`${API_BASE}${url}`, { ...options, headers });
  } catch (e) {
    if (e?.name === 'AbortError') throw { status: 0, message: 'Request timed out' };
    throw e;
  }
  if (res.status === 401) {
    const isLoginOrRegister = url === '/auth/token/' || url.startsWith('/auth/register');
    if (!isLoginOrRegister) {
      let r;
      try {
        r = await fetchWithTimeout(`${API_BASE}/auth/token/refresh/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      } catch (e) {
        if (e?.name === 'AbortError') throw { status: 0, message: 'Request timed out' };
        throw e;
      }
      if (r.ok) {
        const data = await r.json();
        if (data.access) setAccessToken(data.access);
        return api(url, options);
      }
    }
    clearAccessToken();
    try {
      localStorage.removeItem('user');
    } catch {
      /* empty */
    }
    if (!isLoginOrRegister) {
      window.location.href = '/login';
    }
    const data = await res.json().catch(() => ({}));
    throw { status: 401, ...data };
  }
  const data = res.ok ? await res.json().catch(() => ({})) : await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

export async function apiWithFormData(url, formData, method = 'PATCH') {
  const token = getAccessToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let res;
  try {
    res = await fetchWithTimeout(`${API_BASE}${url}`, { method, headers, body: formData });
  } catch (e) {
    if (e?.name === 'AbortError') throw { status: 0, message: 'Request timed out' };
    throw e;
  }
  if (res.status === 401) {
    let r;
    try {
      r = await fetchWithTimeout(`${API_BASE}/auth/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch (e) {
      if (e?.name === 'AbortError') throw { status: 0, message: 'Request timed out' };
      throw e;
    }
    if (r.ok) {
      const data = await r.json();
      if (data.access) setAccessToken(data.access);
      return apiWithFormData(url, formData, method);
    }
    clearAccessToken();
    try {
      localStorage.removeItem('user');
    } catch {
      /* empty */
    }
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  const data = res.ok ? await res.json().catch(() => ({})) : await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

export const auth = {
  me: () => api('/auth/me/'),
  updateProfile: (data) =>
    api('/auth/me/', { method: 'PATCH', body: JSON.stringify(data) }),
  updateProfileWithPhoto: (formData) =>
    apiWithFormData('/auth/me/', formData),
  changePassword: (currentPassword, newPassword) =>
    api('/auth/password/change/', { method: 'POST', body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) }),
  deleteAccount: (password) =>
    api('/auth/account/delete/', { method: 'POST', body: JSON.stringify({ password }) }),
  register: (username, email, password) =>
    api('/auth/register/', { method: 'POST', body: JSON.stringify({ username, email, password }) }),
  login: (username, password) =>
    api('/auth/token/', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () =>
    fetchWithTimeout(`${API_BASE}/auth/logout/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).then((r) => {
      clearAccessToken();
      try {
        localStorage.removeItem('user');
      } catch {
        /* empty */
      }
      return r.json().catch(() => ({}));
    }),
  sessions: {
    list: () => api('/auth/sessions/'),
    register: () =>
      api('/auth/sessions/register/', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    revoke: (jti) =>
      api(`/auth/sessions/${encodeURIComponent(jti)}/revoke/`, { method: 'POST' }),
    revokeAll: () =>
      api('/auth/sessions/revoke_all/', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
  },
};

/** @internal Used by AuthContext after login/register to store access token */
export function persistAccessToken(access) {
  if (access) setAccessToken(access);
}

export { getAccessToken, clearAccessToken };

/** Public stats for landing page. Returns { place_count } or null on error. */
export async function getPlaceCount() {
  try {
    const data = await api('/stats/');
    return typeof data?.place_count === 'number' ? data.place_count : null;
  } catch {
    return null;
  }
}

export const dashboard = () => api('/dashboard/');

export const activity = (limit = 50) =>
  api(`/activity/?limit=${encodeURIComponent(String(limit))}`);

export const places = {
  list: () => api('/places/'),
  get: (id) => api(`/places/${id}/`),
  create: (name) => api('/places/', { method: 'POST', body: JSON.stringify({ name }) }),
  update: (id, body) => api(`/places/${id}/`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id) => api(`/places/${id}/`, { method: 'DELETE' }),
  requestPayment: (placeId, userId) =>
    api(`/places/${placeId}/request_payment/`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    }),
  leave: (placeId) =>
    api(`/places/${placeId}/leave/`, { method: 'POST' }),
};

export const placeMembers = (placeId) => ({
  list: () => api(`/places/${placeId}/members/`),
  remove: (userId) =>
    api(`/places/${placeId}/members/remove/`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    }),
});

export const categories = (placeId) => ({
  list: () => api(`/places/${placeId}/categories/`),
  create: (name, categoryType = 'variable') =>
    api(`/places/${placeId}/categories/`, {
      method: 'POST',
      body: JSON.stringify({ name, category_type: categoryType }),
    }),
});

export const cycles = (placeId) => ({
  list: () => api(`/places/${placeId}/cycles/`),
  create: (body) =>
    api(`/places/${placeId}/cycles/`, { method: 'POST', body: JSON.stringify(body) }),
  resolve: (cycleId) => api(`/places/${placeId}/cycles/${cycleId}/resolve/`, { method: 'POST' }),
  reopen: (cycleId) => api(`/places/${placeId}/cycles/${cycleId}/reopen/`, { method: 'POST' }),
});

export const expenses = (placeId) => ({
  list: (params = {}) => {
    const sp = new URLSearchParams();
    if (params.page != null) sp.set('page', String(params.page));
    if (params.page_size != null) sp.set('page_size', String(params.page_size));
    if (params.cycle_id != null) sp.set('cycle_id', String(params.cycle_id));
    const qs = sp.toString();
    return api(`/places/${placeId}/expenses/${qs ? `?${qs}` : ''}`);
  },
  get: (id) => api(`/places/${placeId}/expenses/${id}/`),
  create: (body) =>
    api(`/places/${placeId}/expenses/`, { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) =>
    api(`/places/${placeId}/expenses/${id}/`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id) => api(`/places/${placeId}/expenses/${id}/`, { method: 'DELETE' }),
});

export const invites = (placeId) => ({
  list: () => api(`/places/${placeId}/invites/`),
  create: (email = '') =>
    api(`/places/${placeId}/invites/`, { method: 'POST', body: JSON.stringify({ email: email || '' }) }),
  delete: (id) => api(`/places/${placeId}/invites/${id}/`, { method: 'DELETE' }),
});

export const summary = (placeId, params = {}) => {
  const sp = new URLSearchParams();
  if (params.cycle_id != null) {
    sp.set('cycle_id', String(params.cycle_id));
  } else {
    sp.set('period', params.period ?? 'weekly');
    if (params.from) sp.set('from', params.from);
    if (params.weekStart === 'sunday' || params.weekStart === 'monday') sp.set('week_start', params.weekStart);
  }
  return api(`/places/${placeId}/summary/?${sp.toString()}`);
};

export const settlements = (placeId) => ({
  list: () => api(`/places/${placeId}/settlements/`),
});
export const settlementCreate = (body) =>
  api('/settlements/', { method: 'POST', body: JSON.stringify(body) });

export const inviteByToken = (token) => api(`/invite/${token}/`);
export const joinPlace = (token) => api(`/join/${token}/`, { method: 'POST' });

export const notifications = {
  list: (limit = 8) => api(`/notifications/?limit=${encodeURIComponent(String(limit))}`),
  markAllRead: () => api('/notifications/mark_all_read/', { method: 'POST' }),
  markRead: (id) => api(`/notifications/${id}/read/`, { method: 'POST' }),
};
