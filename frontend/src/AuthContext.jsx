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
    setLoading(false);
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
    const userData = { id: data.user?.id, username: data.user?.username, email: data.user?.email };
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    return data;
  };

  const logout = () => {
    localStorage.removeItem('access');
    localStorage.removeItem('refresh');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
