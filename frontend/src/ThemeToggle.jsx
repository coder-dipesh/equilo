import { useTheme } from './ThemeContext';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="btn btn-ghost btn-sm btn-square"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? (
        <span className="text-base" aria-hidden>☀️</span>
      ) : (
        <span className="text-base" aria-hidden>🌙</span>
      )}
    </button>
  );
}
