import { createContext, useContext, useState, useEffect } from 'react';
import { auth as authApi } from './api';

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
    const token = localStorage.getItem('access');
    if (!token) {
      setLoading(false);
      return;
    }
    authApi.me()
      .then((userData) => {
        setUser(userData);
        try {
          localStorage.setItem('user', JSON.stringify(userData));
        } catch {}
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = async (username, password) => {
    const data = await authApi.login(username, password);
    localStorage.setItem('access', data.access);
    localStorage.setItem('refresh', data.refresh);
    const userData = await authApi.me();
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    return data;
  };

  const register = async (username, email, password) => {
    const data = await authApi.register(username, email || '', password);
    localStorage.setItem('access', data.access);
    localStorage.setItem('refresh', data.refresh);
    const userData = data.user
      ? { id: data.user.id, username: data.user.username, email: data.user.email, display_name: data.user.display_name, profile_photo: data.user.profile_photo }
      : null;
    setUser(userData);
    if (userData) localStorage.setItem('user', JSON.stringify(userData));
    return data;
  };

  const logout = () => {
    localStorage.removeItem('access');
    localStorage.removeItem('refresh');
    localStorage.removeItem('user');
    setUser(null);
  };

  const updateUser = (next) => {
    setUser((prev) => (prev ? { ...prev, ...next } : null));
    try {
      const u = localStorage.getItem('user');
      const parsed = u ? JSON.parse(u) : null;
      if (parsed) localStorage.setItem('user', JSON.stringify({ ...parsed, ...next }));
    } catch {}
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
