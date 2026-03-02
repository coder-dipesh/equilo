function resolveApiBase() {
  const raw = (import.meta.env.VITE_API_URL || '').trim();
  if (raw) {
    try {
      const u = new URL(raw);
      // Guard against `http://:8001/api` (empty hostname)
      if (u.hostname) return raw.replace(/\/+$/, '');
    } catch {
      // fall through
    }
  }
  // Sensible dev default: same host as frontend, Django on 8001
  const host = (typeof window !== 'undefined' && window.location?.hostname) ? window.location.hostname : 'localhost';
  return `http://${host}:8001/api`;
}

const API_BASE = resolveApiBase();
const DEFAULT_TIMEOUT_MS = 12000;

async function fetchWithTimeout(input, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function getToken() {
  return localStorage.getItem('access');
}

export async function api(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let res;
  try {
    res = await fetchWithTimeout(`${API_BASE}${url}`, { ...options, headers });
  } catch (e) {
    if (e?.name === 'AbortError') throw { status: 0, message: 'Request timed out' };
    throw e;
  }
  if (res.status === 401) {
    const refresh = localStorage.getItem('refresh');
    if (refresh) {
      let r;
      try {
        r = await fetchWithTimeout(`${API_BASE}/auth/token/refresh/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh }),
        });
      } catch (e) {
        if (e?.name === 'AbortError') throw { status: 0, message: 'Request timed out' };
        throw e;
      }
      if (r.ok) {
        const data = await r.json();
        localStorage.setItem('access', data.access);
        return api(url, options);
      }
    }
    localStorage.removeItem('access');
    localStorage.removeItem('refresh');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  const data = res.ok ? await res.json().catch(() => ({})) : await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

export async function apiWithFormData(url, formData, method = 'PATCH') {
  const token = getToken();
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
    const refresh = localStorage.getItem('refresh');
    if (refresh) {
      let r;
      try {
        r = await fetchWithTimeout(`${API_BASE}/auth/token/refresh/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh }),
        });
      } catch (e) {
        if (e?.name === 'AbortError') throw { status: 0, message: 'Request timed out' };
        throw e;
      }
      if (r.ok) {
        const data = await r.json();
        localStorage.setItem('access', data.access);
        return apiWithFormData(url, formData, method);
      }
    }
    localStorage.removeItem('access');
    localStorage.removeItem('refresh');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  const data = res.ok ? await res.json().catch(() => ({})) : await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

/** Decode JWT payload (base64) to get jti. Returns null if invalid. */
export function getJtiFromRefreshToken() {
  try {
    const refresh = localStorage.getItem('refresh');
    if (!refresh) return null;
    const parts = refresh.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.jti || null;
  } catch {
    return null;
  }
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
  sessions: {
    list: (currentJti) =>
      api(currentJti ? `/auth/sessions/?current_jti=${encodeURIComponent(currentJti)}` : '/auth/sessions/'),
    register: (refreshToken) =>
      api('/auth/sessions/register/', {
        method: 'POST',
        body: JSON.stringify({ refresh: refreshToken }),
      }),
    revoke: (jti) =>
      api(`/auth/sessions/${encodeURIComponent(jti)}/revoke/`, { method: 'POST' }),
    revokeAll: (refreshToken) =>
      api('/auth/sessions/revoke_all/', {
        method: 'POST',
        body: JSON.stringify({ refresh: refreshToken }),
      }),
  },
};

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
};

export const placeMembers = (placeId) => ({
  list: () => api(`/places/${placeId}/members/`),
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
  create: (body) => api(`/places/${placeId}/cycles/`, { method: 'POST', body: JSON.stringify(body) }),
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
  create: (body) => api(`/places/${placeId}/expenses/`, { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/places/${placeId}/expenses/${id}/`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id) => api(`/places/${placeId}/expenses/${id}/`, { method: 'DELETE' }),
});

export const invites = (placeId) => ({
  list: () => api(`/places/${placeId}/invites/`),
  create: (email = '') => api(`/places/${placeId}/invites/`, { method: 'POST', body: JSON.stringify({ email: email || '' }) }),
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
