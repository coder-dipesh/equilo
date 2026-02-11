const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001/api';

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
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  if (res.status === 401) {
    const refresh = localStorage.getItem('refresh');
    if (refresh) {
      const r = await fetch(`${API_BASE}/auth/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      });
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
  const res = await fetch(`${API_BASE}${url}`, { method, headers, body: formData });
  if (res.status === 401) {
    const refresh = localStorage.getItem('refresh');
    if (refresh) {
      const r = await fetch(`${API_BASE}/auth/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      });
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

export const auth = {
  me: () => api('/auth/me/'),
  updateProfile: (data) =>
    api('/auth/me/', { method: 'PATCH', body: JSON.stringify(data) }),
  updateProfileWithPhoto: (formData) =>
    apiWithFormData('/auth/me/', formData),
  changePassword: (currentPassword, newPassword) =>
    api('/auth/password/change/', { method: 'POST', body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) }),
  register: (username, email, password) =>
    api('/auth/register/', { method: 'POST', body: JSON.stringify({ username, email, password }) }),
  login: (username, password) =>
    api('/auth/token/', { method: 'POST', body: JSON.stringify({ username, password }) }),
};

export const places = {
  list: () => api('/places/'),
  get: (id) => api(`/places/${id}/`),
  create: (name) => api('/places/', { method: 'POST', body: JSON.stringify({ name }) }),
};

export const placeMembers = (placeId) => ({
  list: () => api(`/places/${placeId}/members/`),
});

export const categories = (placeId) => ({
  list: () => api(`/places/${placeId}/categories/`),
  create: (name) => api(`/places/${placeId}/categories/`, { method: 'POST', body: JSON.stringify({ name }) }),
});

export const expenses = (placeId) => ({
  list: (params = {}) => {
    const sp = new URLSearchParams();
    if (params.page != null) sp.set('page', String(params.page));
    if (params.page_size != null) sp.set('page_size', String(params.page_size));
    const qs = sp.toString();
    return api(`/places/${placeId}/expenses/${qs ? `?${qs}` : ''}`);
  },
  create: (body) => api(`/places/${placeId}/expenses/`, { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/places/${placeId}/expenses/${id}/`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id) => api(`/places/${placeId}/expenses/${id}/`, { method: 'DELETE' }),
});

export const invites = (placeId) => ({
  list: () => api(`/places/${placeId}/invites/`),
  create: (email = '') => api(`/places/${placeId}/invites/`, { method: 'POST', body: JSON.stringify({ email: email || '' }) }),
  delete: (id) => api(`/places/${placeId}/invites/${id}/`, { method: 'DELETE' }),
});

export const summary = (placeId, period = 'weekly', fromDate, weekStart) => {
  let url = `/places/${placeId}/summary/?period=${period}`;
  if (fromDate) url += `&from=${fromDate}`;
  if (weekStart === 'sunday' || weekStart === 'monday') url += `&week_start=${weekStart}`;
  return api(url);
};

export const inviteByToken = (token) => api(`/invite/${token}/`);
export const joinPlace = (token) => api(`/join/${token}/`, { method: 'POST' });
