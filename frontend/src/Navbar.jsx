import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useTheme } from './ThemeContext';
import { Home, LogOut, ChevronDown, Sun, Moon, Settings } from 'lucide-react';
import logoUrl from './assets/logo/logo.svg';

function UserAvatar({ username, photoUrl, className = '' }) {
  const initial = username ? username.charAt(0).toUpperCase() : '?';
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        className={`h-8 w-8 rounded-full object-cover bg-primary/10 shrink-0 ${className}`}
        aria-hidden
      />
    );
  }
  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-semibold shrink-0 ${className}`}
      aria-hidden
    >
      {initial}
    </span>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const [dropdownStyle, setDropdownStyle] = useState({ top: 0, right: 0 });

  useLayoutEffect(() => {
    if (logoutOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownStyle({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    }
  }, [logoutOpen]);

  useEffect(() => {
    if (!logoutOpen) return;
    function close(e) {
      if (
        !triggerRef.current?.contains(e.target) &&
        !dropdownRef.current?.contains(e.target)
      )
        setLogoutOpen(false);
    }
    function escape(e) {
      if (e.key === 'Escape') setLogoutOpen(false);
    }
    document.addEventListener('click', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', escape);
    };
  }, [logoutOpen]);

  useEffect(() => {
    if (!confirmLogoutOpen) return;
    function escape(e) {
      if (e.key === 'Escape') setConfirmLogoutOpen(false);
    }
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [confirmLogoutOpen]);

  const isDark = theme === 'dark';

  return (
    <>
      {/* Brand strip */}
      <div className="h-1 w-full bg-primary" aria-hidden />
      <header
        className="sticky top-0 z-50 w-full bg-surface border-b border-border shadow-card"
        role="banner"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14 sm:h-16">
          <Link
            to="/"
            className="flex items-center shrink-0 max-w-[45%] text-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2 focus:ring-offset-surface hover:opacity-90 transition-opacity"
            aria-label="Equilo"
          >
            <img src={logoUrl} alt="" className="h-7 w-auto max-w-full sm:h-8 object-contain" aria-hidden />
            <span className="sr-only">Equilo</span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className="btn btn-ghost btn-sm btn-square rounded-lg"
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? (
                <Sun className="w-5 h-5 text-warning/90" aria-hidden />
              ) : (
                <Moon className="w-5 h-5 text-base-content/60" aria-hidden />
              )}
            </button>
            <div className="relative" ref={triggerRef}>
              <button
                type="button"
                onClick={() => setLogoutOpen(!logoutOpen)}
                className="flex items-center gap-2 sm:gap-2.5 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg border border-border bg-base-100 hover:bg-base-200 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 focus:ring-offset-surface"
                aria-expanded={logoutOpen}
                aria-haspopup="true"
                aria-label="Account menu"
              >
                <UserAvatar username={user?.display_name || user?.username} photoUrl={user?.profile_photo} />
                <span className="hidden sm:inline text-sm font-medium text-text-primary truncate max-w-[100px]" title={user?.display_name || user?.username}>
                  {user?.display_name || user?.username}
                </span>
                <ChevronDown className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${logoutOpen ? 'rotate-180' : ''}`} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </header>

      {logoutOpen &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998] bg-black/25"
              aria-hidden
              onClick={() => setLogoutOpen(false)}
            />
            <div
              ref={dropdownRef}
              className="fixed z-[9999] w-[min(calc(100vw-2rem),260px)] rounded-xl bg-base-100 border border-border shadow-xl py-2 animate-fade-in overflow-hidden"
              style={{ top: dropdownStyle.top, right: dropdownStyle.right }}
              role="menu"
              aria-label="Account menu"
            >
              {/* Email at top */}
              <div className="px-3 py-2">
                <p className="text-sm text-text-primary truncate m-0" title={user?.email || user?.display_name || user?.username}>
                  {user?.email || user?.display_name || user?.username || '—'}
                </p>
              </div>

              <hr className="border-0 border-t border-border my-0" aria-hidden />

              {/* Settings */}
              <Link
                to="/settings"
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-none hover:bg-base-200 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-inset no-underline text-text-primary"
                onClick={() => setLogoutOpen(false)}
              >
                <Settings className="w-5 h-5 text-base-content/60 shrink-0" aria-hidden />
                <span className="text-sm font-medium">Settings</span>
              </Link>

              <hr className="border-0 border-t border-border my-0" aria-hidden />

              {/* Sign out – danger on hover */}
              <button
                type="button"
                className="group w-full flex items-center gap-2.5 px-3 py-2.5 rounded-b-xl hover:bg-error/10 hover:text-error transition-colors text-left focus:outline-none focus:ring-2 focus:ring-error/20 focus:ring-inset text-text-primary"
                onClick={() => {
                  setLogoutOpen(false);
                  setConfirmLogoutOpen(true);
                }}
              >
                <LogOut className="w-5 h-5 text-base-content/60 shrink-0 group-hover:text-error" aria-hidden />
                <span className="text-sm font-medium">Sign out</span>
              </button>
            </div>
          </>,
          document.body
        )}

      {/* Sign out confirmation dialog */}
      {confirmLogoutOpen &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[10000] bg-black/30"
              aria-hidden
              onClick={() => setConfirmLogoutOpen(false)}
            />
            <div
              className="fixed left-1/2 top-1/2 z-[10001] w-[min(calc(100vw-2rem),360px)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-base-100 border border-border shadow-xl p-5 animate-fade-in"
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-logout-title"
              aria-describedby="confirm-logout-desc"
            >
              <h2 id="confirm-logout-title" className="text-lg font-semibold text-text-primary m-0 mb-1">
                Sign out?
              </h2>
              <p id="confirm-logout-desc" className="text-sm text-text-secondary m-0 mb-5">
                You will need to sign in again to access your places.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setConfirmLogoutOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-error btn-sm"
                  onClick={() => {
                    setConfirmLogoutOpen(false);
                    logout();
                  }}
                >
                  Sign out
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
