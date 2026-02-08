const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

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

export const auth = {
  me: () => api('/auth/me/'),
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
  list: () => api(`/places/${placeId}/expenses/`),
  create: (body) => api(`/places/${placeId}/expenses/`, { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/places/${placeId}/expenses/${id}/`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id) => api(`/places/${placeId}/expenses/${id}/`, { method: 'DELETE' }),
});

export const invites = (placeId) => ({
  list: () => api(`/places/${placeId}/invites/`),
  create: (email) => api(`/places/${placeId}/invites/`, { method: 'POST', body: JSON.stringify({ email }) }),
  delete: (id) => api(`/places/${placeId}/invites/${id}/`, { method: 'DELETE' }),
});

export const summary = (placeId, period = 'weekly', fromDate) => {
  let url = `/places/${placeId}/summary/?period=${period}`;
  if (fromDate) url += `&from=${fromDate}`;
  return api(url);
};

export const inviteByToken = (token) => api(`/invite/${token}/`);
export const joinPlace = (token) => api(`/join/${token}/`, { method: 'POST' });
