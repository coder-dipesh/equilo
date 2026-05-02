import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useTheme } from './ThemeContext';
import { LogOut, ChevronDown, Settings, Bell, Banknote, AlertTriangle, Home, ChevronRight, Receipt, Building2, Activity } from 'lucide-react';
import logoUrl from './assets/logo/logo.svg';
import { notifications as notificationsApi } from './api';

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
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const [dropdownStyle, setDropdownStyle] = useState({ top: 0, right: 0 });

  // Notifications
  const [notifOpen, setNotifOpen] = useState(false);
  const notifTriggerRef = useRef(null);
  const notifDropdownRef = useRef(null);
  const [notifStyle, setNotifStyle] = useState({ top: 0, right: 0 });
  const [isMobileView, setIsMobileView] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState('');
  const [notifUnreadCount, setNotifUnreadCount] = useState(0);
  const [notifItems, setNotifItems] = useState([]);
  const lastUnreadRef = useRef(0);
  const shownToastIdsRef = useRef(new Set());
  const [toastQueue, setToastQueue] = useState([]);
  const [toastOffset, setToastOffset] = useState(0);
  const toastDragStartX = useRef(0);
  const toastDidDrag = useRef(false);
  const notifToast = toastQueue[0] || null;

  async function refreshNotifications(limit = 8, playOnIncrease = false) {
    if (!user) return;
    setNotifError('');
    setNotifLoading(true);
    try {
      const res = await notificationsApi.list(limit);
      const nextUnread = res?.unread_count ?? 0;
      const results = Array.isArray(res?.results) ? res.results : [];

      if (playOnIncrease && nextUnread > lastUnreadRef.current && results.length > 0) {
        const audio = document.getElementById('notif-sound');
        if (audio && typeof audio.play === 'function') {
          try {
            audio.currentTime = 0;
            audio.play().catch(() => {});
          } catch {
            // ignore
          }
        }
        // Only toast the single newest notification (results are newest-first) so we don't show old details
        const newOnes = results.filter((n) => !shownToastIdsRef.current.has(n.id));
        if (newOnes.length > 0) {
          const latest = newOnes[0];
          shownToastIdsRef.current.add(latest.id);
          setToastQueue((prev) => [
            ...prev,
            {
              id: latest.id,
              type: latest.type,
              title: latest.title,
              message: latest.message,
              placeId: latest?.data?.place_id || latest.place,
            },
          ]);
        }
      }
      lastUnreadRef.current = nextUnread;
      setNotifUnreadCount(nextUnread);
      setNotifItems(results);
    } catch (e) {
      setNotifError(e?.detail || e?.message || 'Failed to load notifications');
    } finally {
      setNotifLoading(false);
    }
  }

  useLayoutEffect(() => {
    if (logoutOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownStyle({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    }
  }, [logoutOpen]);

  useLayoutEffect(() => {
    if (notifOpen && notifTriggerRef.current) {
      const rect = notifTriggerRef.current.getBoundingClientRect();
      const mobile = window.innerWidth < 640;
      setIsMobileView(mobile);
      if (mobile) {
        setNotifStyle({ top: rect.bottom + 10, left: 0, right: 0 });
      } else {
        setNotifStyle({ top: rect.bottom + 10, right: window.innerWidth - rect.right });
      }
    }
  }, [notifOpen]);

  // Load unread badge once on mount
  useEffect(() => {
    refreshNotifications(5, false).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prime notification audio on first user interaction to satisfy autoplay policies
  useEffect(() => {
    function primeAudio() {
      const audio = document.getElementById('notif-sound');
      if (!audio || typeof audio.play !== 'function') return;
      audio.volume = 0;
      audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = 1;
        })
        .catch(() => {
          // ignore – user agent may still block, we'll try again on next interaction
        });
    }
    window.addEventListener('click', primeAudio, { once: true });
    window.addEventListener('keydown', primeAudio, { once: true });
    return () => {
      window.removeEventListener('click', primeAudio);
      window.removeEventListener('keydown', primeAudio);
    };
  }, []);

  // Poll for notifications only when tab is visible (saves server load when tab is in background)
  useEffect(() => {
    const POLL_MS = 20000; // 20s when visible
    let intervalId = null;

    function tick() {
      refreshNotifications(5, true).catch(() => {});
    }

    function startPolling() {
      tick(); // one immediate check when tab becomes visible
      intervalId = window.setInterval(tick, POLL_MS);
    }

    function stopPolling() {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') startPolling();
      else stopPolling();
    }

    if (document.visibilityState === 'visible') startPolling();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!notifOpen) return;
    // refresh list when dropdown opens
    refreshNotifications(8, false).catch(() => {});
    function close(e) {
      if (
        !notifTriggerRef.current?.contains(e.target) &&
        !notifDropdownRef.current?.contains(e.target)
      ) {
        setNotifOpen(false);
      }
    }
    function escape(e) {
      if (e.key === 'Escape') setNotifOpen(false);
    }
    document.addEventListener('click', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', escape);
    };
  }, [notifOpen]);

  useEffect(() => {
    if (!confirmLogoutOpen) return;
    function escape(e) {
      if (e.key === 'Escape') setConfirmLogoutOpen(false);
    }
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [confirmLogoutOpen]);

  const isDark = theme === 'dark';

  function notifIcon(type) {
    switch (type) {
      case 'payment_request':
        return <Banknote className="w-5 h-5 text-success" aria-hidden />;
      case 'expense_added':
        return <Receipt className="w-5 h-5 text-primary" aria-hidden />;
      case 'unsettled_balance':
        return <AlertTriangle className="w-5 h-5 text-error" aria-hidden />;
      case 'welcome':
        return <Home className="w-5 h-5 text-primary" aria-hidden />;
      case 'balance_updated':
        return <Bell className="w-5 h-5 text-primary" aria-hidden />;
      default:
        return <Bell className="w-5 h-5 text-primary" aria-hidden />;
    }
  }

  async function handleMarkAllRead() {
    try {
      await notificationsApi.markAllRead();
      await refreshNotifications(8, false);
    } catch (e) {
      setNotifError(e?.detail || e?.message || 'Failed to mark as read');
    }
  }

  async function handleOpenNotification(n) {
    try {
      if (!n?.is_read) await notificationsApi.markRead(n.id);
    } catch {
      // ignore
    } finally {
      // optimistic update
      setNotifItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      setNotifUnreadCount((c) => Math.max(0, c - (n?.is_read ? 0 : 1)));
    }

    const placeId = n?.data?.place_id || n?.place;
    if (placeId) {
      const openSettlement = n?.data?.open_settlement === true;
      navigate(openSettlement ? `/places/${placeId}?tab=summary&settle=1` : `/places/${placeId}`);
    }
    setNotifOpen(false);
  }

  // Auto-dismiss notification toast after a few seconds
  useEffect(() => {
    if (!notifToast) return;
    // reset swipe state on new toast
    setToastOffset(0);
    toastDidDrag.current = false;
    // auto-dismiss after 5 seconds
    const id = window.setTimeout(() => {
      setToastQueue((prev) => (prev.length > 0 ? prev.slice(1) : prev));
    }, 5000);
    return () => window.clearTimeout(id);
  }, [notifToast, setToastQueue]);

  function handleToastTouchStart(e) {
    const t = e.touches?.[0];
    if (!t) return;
    toastDragStartX.current = t.clientX;
    toastDidDrag.current = false;
  }

  function handleToastTouchMove(e) {
    const t = e.touches?.[0];
    if (!t) return;
    const dx = t.clientX - toastDragStartX.current;
    if (dx > 0) {
      toastDidDrag.current = true;
      const clamped = Math.min(dx, 120);
      setToastOffset(clamped);
    }
  }

  function handleToastTouchEnd() {
    if (!toastDidDrag.current) {
      setToastOffset(0);
      return;
    }
    if (toastOffset > 60) {
      setToastQueue((prev) => prev.slice(1));
    } else {
      setToastOffset(0);
    }
  }

  return (
    <>
      {/* Notification sound – public/sound/notification.mp3, use base for subpath deploys */}
      <audio
        id="notif-sound"
        src={`${(import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || ''}/sound/notification.mp3`}
        preload="auto"
      />
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

          {/* Main navigation – desktop only; mobile uses BottomNav */}
          <nav aria-label="Main" className="hidden md:flex items-center gap-0.5">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 focus:ring-offset-surface no-underline ${
                  isActive ? 'bg-primary/15 text-primary' : 'text-text-secondary hover:bg-base-200 hover:text-text-primary'
                }`
              }
              title="Home"
            >
              <Home className="w-4 h-4 shrink-0" aria-hidden />
              <span>Home</span>
            </NavLink>
            <NavLink
              to="/places"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 focus:ring-offset-surface no-underline ${
                  isActive ? 'bg-primary/15 text-primary' : 'text-text-secondary hover:bg-base-200 hover:text-text-primary'
                }`
              }
              title="Places"
            >
              <Building2 className="w-4 h-4 shrink-0" aria-hidden />
              <span>Places</span>
            </NavLink>
            <NavLink
              to="/activity"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 focus:ring-offset-surface no-underline ${
                  isActive ? 'bg-primary/15 text-primary' : 'text-text-secondary hover:bg-base-200 hover:text-text-primary'
                }`
              }
              title="Activity"
            >
              <Activity className="w-4 h-4 shrink-0" aria-hidden />
              <span>Activity</span>
            </NavLink>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {user && (
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-square rounded-lg"
                aria-label="Notifications"
                title="Notifications"
                ref={notifTriggerRef}
                onClick={() => setNotifOpen((o) => !o)}
              >
                <span className="relative">
                  <Bell className="w-5 h-5 text-base-content/60" aria-hidden />
                  {notifUnreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-error text-white text-[10px] font-semibold">
                      {notifUnreadCount > 9 ? '9+' : notifUnreadCount}
                    </span>
                  )}
                </span>
              </button>
            )}
            <label className="swap swap-rotate btn btn-ghost btn-sm btn-square rounded-lg" title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
              <input
                type="checkbox"
                checked={!isDark}
                onChange={() => setTheme(isDark ? 'light' : 'dark')}
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              />
              <svg className="swap-on h-5 w-5 fill-current text-warning/90" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden>
                <path d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z" />
              </svg>
              <svg className="swap-off h-5 w-5 fill-current text-base-content/60" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden>
                <path d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z" />
              </svg>
            </label>
            {user ? (
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
                  <span className="text-sm font-medium text-text-primary truncate max-w-[80px] sm:max-w-[100px]" title={user?.display_name || user?.username}>
                    {(() => {
                      const full = user?.display_name || user?.username || '';
                      const first = full.trim().split(/[\s_.-]/)[0] || full;
                      return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : full;
                    })()}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${logoutOpen ? 'rotate-180' : ''}`} aria-hidden />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to={`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`}
                  className="btn btn-ghost btn-sm rounded-lg hidden sm:inline-flex"
                >
                  Sign in
                </Link>
                <Link
                  to={`/register?next=${encodeURIComponent(window.location.pathname + window.location.search)}`}
                  className="btn btn-primary btn-sm rounded-lg"
                >
                  Sign up
                </Link>
              </div>
            )}
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
              {/* Full name + email */}
              <div className="px-3 py-3">
                <p className="text-sm font-medium text-text-primary m-0 truncate" title={user?.display_name || user?.username}>
                  {(() => {
                    const full = (user?.display_name || user?.username || '').trim();
                    if (!full) return '—';
                    return full.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
                  })()}
                </p>
                <p className="text-xs text-text-muted m-0 mt-0.5 truncate" title={user?.email}>
                  {user?.email || '—'}
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

      {/* Notifications dropdown */}
      {notifOpen &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998] bg-transparent"
              aria-hidden
              onClick={() => setNotifOpen(false)}
            />
            <div
              ref={notifDropdownRef}
              className={`fixed z-[9999] rounded-xl bg-base-100 border border-border shadow-xl animate-fade-in overflow-hidden flex flex-col ${
                isMobileView
                  ? 'left-4 right-4 w-[calc(100%-2rem)] max-h-[70vh]'
                  : 'w-[min(calc(100vw-2rem),420px)] max-h-[420px]'
              }`}
              style={{
                top: notifStyle.top,
                ...(isMobileView ? {} : { right: notifStyle.right }),
              }}
              role="dialog"
              aria-label="Notifications"
            >
              <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-border shrink-0 min-w-0">
                <h3 className="text-sm font-semibold text-text-primary m-0 truncate">Notifications</h3>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs rounded-lg text-primary whitespace-nowrap shrink-0"
                  onClick={handleMarkAllRead}
                  disabled={notifLoading || notifUnreadCount === 0}
                >
                  Mark all as read
                </button>
              </div>

              {notifError && (
                <div className="px-4 py-2 text-sm text-error">{notifError}</div>
              )}

              <div className={`flex-1 min-h-0 overflow-auto ${isMobileView ? '' : 'max-h-[360px]'}`}>
                {notifLoading && notifItems.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-text-secondary">Loading…</div>
                ) : notifItems.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-text-secondary">No notifications yet</div>
                ) : (
                  <ul className="list-none p-0 m-0">
                    {notifItems.map((n) => (
                      <li key={n.id} className="border-b border-border last:border-b-0">
                        <button
                          type="button"
                          onClick={() => handleOpenNotification(n)}
                          className="w-full text-left px-4 py-3 hover:bg-base-200 transition-colors flex items-start gap-3"
                        >
                          <div className="mt-0.5 w-10 h-10 rounded-xl bg-base-200 flex items-center justify-center shrink-0">
                            {notifIcon(n.type)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-text-primary m-0 truncate">
                                {n.title}
                              </p>
                              {!n.is_read && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-warning/20 text-warning shrink-0">
                                  NEW
                                </span>
                              )}
                            </div>
                            {n.message && (
                              <p className="text-sm text-text-secondary m-0 mt-0.5 truncate">
                                {n.message}
                              </p>
                            )}
                            <p className="text-xs text-text-muted m-0 mt-1">
                              {new Date(n.created_at).toLocaleString()}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-text-muted mt-1 shrink-0" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <button
                type="button"
                className="w-full px-4 py-3 text-sm font-medium text-primary hover:bg-base-200 transition-colors shrink-0"
                onClick={() => {
                  setNotifOpen(false);
                  navigate('/notifications');
                }}
              >
                View all
              </button>
            </div>
          </>,
          document.body
        )}

      {/* Notification toast queue (bottom-right) */}
      {notifToast &&
        createPortal(
          <div className="fixed bottom-4 right-4 z-[9999] max-w-xs w-[min(320px,calc(100vw-2rem))]">
            <div
              className="w-full flex items-start gap-3 rounded-xl bg-base-100 border border-border shadow-card px-3 py-3 text-left hover:bg-base-200 transition-colors cursor-pointer"
              style={{ transform: `translateX(${toastOffset}px)` }}
              onTouchStart={handleToastTouchStart}
              onTouchMove={handleToastTouchMove}
              onTouchEnd={handleToastTouchEnd}
              onClick={() => {
                if (toastDidDrag.current) {
                  // click after swipe should not navigate
                  return;
                }
                if (notifToast.placeId) {
                  navigate(`/places/${notifToast.placeId}`);
                } else {
                  navigate('/notifications');
                }
                setToastQueue((prev) => prev.slice(1));
              }}
            >
              <div className="mt-0.5 w-9 h-9 rounded-full bg-base-200 flex items-center justify-center shrink-0">
                {notifIcon(notifToast.type)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text-primary m-0 truncate">
                  {notifToast.title || 'New notification'}
                </p>
                {notifToast.message && (
                  <p className="text-xs text-text-secondary m-0 mt-0.5 line-clamp-2">
                    {notifToast.message}
                  </p>
                )}
              </div>
            </div>
          </div>,
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
