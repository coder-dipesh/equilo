import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

const ThemeContext = createContext({
  theme: 'light',
  themePreference: 'light',
  setTheme: () => {},
  resolvedTheme: 'light',
});

function getSystemTheme() {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const { user, loading } = useAuth();
  const [themePreference, setThemePreferenceState] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    const t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark' || t === 'system') return t;
    return 'light';
  });
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handle = () => setSystemTheme(getSystemTheme());
    mq.addEventListener('change', handle);
    return () => mq.removeEventListener('change', handle);
  }, []);

  const resolvedTheme = themePreference === 'system' ? systemTheme : themePreference;

  useEffect(() => {
    const token =
      typeof window !== 'undefined'
        ? sessionStorage.getItem('equilo_access') || localStorage.getItem('access')
        : null;
    if (loading) {
      if (!token) {
        document.documentElement.setAttribute('data-theme', 'silk');
      } else {
        document.documentElement.setAttribute('data-theme', resolvedTheme === 'light' ? 'silk' : 'dark');
      }
      return;
    }
    if (!user) {
      document.documentElement.setAttribute('data-theme', 'silk');
      return;
    }
    document.documentElement.setAttribute('data-theme', resolvedTheme === 'light' ? 'silk' : 'dark');
  }, [user, loading, resolvedTheme]);

  useEffect(() => {
    localStorage.setItem('theme', themePreference);
  }, [themePreference]);

  const setTheme = (next) => {
    const value = next === 'light' || next === 'dark' || next === 'system' ? next : (themePreference === 'light' ? 'dark' : 'light');
    setThemePreferenceState(value);
  };

  return (
    <ThemeContext.Provider value={{ theme: resolvedTheme, themePreference, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  return useContext(ThemeContext);
}
