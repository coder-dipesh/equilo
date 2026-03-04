import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({
  theme: 'dark',
  themePreference: 'dark',
  setTheme: () => {},
  resolvedTheme: 'dark',
});

function getSystemTheme() {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [themePreference, setThemePreferenceState] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    const t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark' || t === 'system') return t;
    return 'system';
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
    document.documentElement.setAttribute('data-theme', resolvedTheme === 'light' ? 'silk' : 'dark');
  }, [resolvedTheme]);

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
