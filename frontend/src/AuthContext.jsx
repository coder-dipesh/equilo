import { createContext, useContext, useState, useEffect } from 'react';
import { auth as authApi, persistAccessToken, getAccessToken, clearAccessToken, refreshAccessToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const u = localStorage.getItem('user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On login/register we are not authenticated yet — skip /auth/me to avoid 401 + refresh noise.
    // (Global api() no longer redirects /login → /login; this also saves requests.)
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    if (path === '/login' || path === '/register') {
      setLoading(false);
      return;
    }
    // Don't rely on sessionStorage alone: backgrounded tabs may clear it while the refresh cookie remains.
    // /auth/me → 401 → refresh via cookie → retry restores the session.
    authApi
      .me()
      .then((userData) => {
        setUser(userData);
        try {
          localStorage.setItem('user', JSON.stringify(userData));
        } catch {
          /* empty */
        }
      })
      .catch((err) => {
        // Only clear session on real auth failure — not timeouts / offline (status 0) or server errors
        if (err?.status === 401) {
          setUser(null);
          try {
            localStorage.removeItem('user');
          } catch {
            /* empty */
          }
          clearAccessToken();
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // After idle/background: refresh access using cookie so the next request does not race many 401s
  useEffect(() => {
    let lastRefresh = 0;
    const minGapMs = 5 * 60 * 1000;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      if (path === '/login' || path === '/register') return;
      const now = Date.now();
      if (now - lastRefresh < minGapMs) return;
      lastRefresh = now;
      void refreshAccessToken();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const login = async (username, password) => {
    const data = await authApi.login(username, password);
    if (data.access) persistAccessToken(data.access);
    const userData = await authApi.me();
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    return data;
  };

  const register = async (username, email, password) => {
    const data = await authApi.register(username, email || '', password);
    if (data.access) persistAccessToken(data.access);
    const userData = data.user
      ? {
          id: data.user.id,
          username: data.user.username,
          email: data.user.email,
          display_name: data.user.display_name,
          profile_photo: data.user.profile_photo,
        }
      : null;
    setUser(userData);
    if (userData) localStorage.setItem('user', JSON.stringify(userData));
    return data;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      clearAccessToken();
      try {
        localStorage.removeItem('user');
      } catch {
        /* empty */
      }
      setUser(null);
      return;
    }
    setUser(null);
  };

  const updateUser = (next) => {
    setUser((prev) => (prev ? { ...prev, ...next } : null));
    try {
      const u = localStorage.getItem('user');
      const parsed = u ? JSON.parse(u) : null;
      if (parsed) localStorage.setItem('user', JSON.stringify({ ...parsed, ...next }));
    } catch {
      /* empty */
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
