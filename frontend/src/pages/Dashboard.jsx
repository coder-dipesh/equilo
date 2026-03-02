import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { dashboard as dashboardApi } from '../api';
import { useAuth } from '../AuthContext';
import { usePreferences } from '../PreferencesContext';
import { Skeleton } from '../components/Skeleton';
import {
  Home,
  Plus,
  Users,
  Building2,
  RefreshCw,
  Star,
  Loader2,
  ArrowRight,
  UserPlus,
  LayoutGrid,
  Receipt,
  X,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
/** Animate number from 0 to value over duration (ms). Returns current value for display. */
function useCountUp(value, duration = 800, enabled = true) {
  const [display, setDisplay] = useState(0);
  const valueNum = typeof value === 'number' ? value : 0;
  useEffect(() => {
    if (!enabled) {
      setDisplay(valueNum);
      return;
    }
    const start = performance.now();
    let raf = 0;
    function tick(now) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const easeOut = 1 - (1 - t) * (1 - t);
      setDisplay(valueNum * easeOut);
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [valueNum, duration, enabled]);
  return display;
}

function relativeTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sec = Math.floor((now - d) / 1000);
  if (sec < 60) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min${min !== 1 ? 's' : ''} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr !== 1 ? 's' : ''} ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day !== 1 ? 's' : ''} ago`;
  return d.toLocaleDateString();
}

function UserAvatar({ username, displayName, photoUrl, size = 'md' }) {
  const name = displayName || username || '';
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  const sizeClass = size === 'xs' ? 'w-6 h-6 text-xs' : size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-lg';
  if (photoUrl) {
    return (
      <div className={`rounded-full overflow-hidden bg-base-300 shrink-0 ring-2 ring-base-100 ${sizeClass}`} aria-hidden>
        <img src={photoUrl} alt="" className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div
      className={`rounded-full bg-primary text-primary-content flex items-center justify-center font-semibold ring-2 ring-base-100 shrink-0 ${sizeClass}`}
      aria-hidden
    >
      {initial}
    </div>
  );
}

/** Same as Activity page: icon behind, user avatar overlapping bottom-right */
function ActivityIcon({ type, userDisplayName, userProfilePhoto }) {
  const isExpense = type === 'expense_added';
  const isPlace = type === 'place_created';
  const bgClass = isExpense
    ? 'bg-success text-success-content'
    : isPlace
      ? 'bg-primary text-primary-content'
      : 'bg-primary text-primary-content';
  const hasAvatar = !!userDisplayName;
  return (
    <div className="relative w-11 h-11 shrink-0">
      <div
        className={`absolute top-0 left-0 w-10 h-10 rounded-full flex items-center justify-center ring-2 ring-base-100 z-0 ${bgClass}`}
        aria-hidden
      >
        {isExpense ? <Receipt className="w-5 h-5" aria-hidden /> : <Users className="w-5 h-5" aria-hidden />}
      </div>
      {hasAvatar && (
        <div className="absolute -bottom-0.5 -right-0.5 z-10 ring-2 ring-base-100 rounded-full">
          <UserAvatar displayName={userDisplayName} photoUrl={userProfilePhoto} size="xs" />
        </div>
      )}
    </div>
  );
}

/** Format like Activity page: "Feb 15th, 2:03 AM" */
function formatTimestamp(iso) {
  const d = new Date(iso);
  const month = d.toLocaleString('en-US', { month: 'short' });
  const day = d.getDate();
  const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
  const time = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${month} ${day}${suffix}, ${time}`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currency } = usePreferences();
  const sym = currency?.symbol ?? '$';

  const [data, setData] = useState(null);
  const [addExpensePlaceOpen, setAddExpensePlaceOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let intervalId = null;
    const POLL_MS = 35000; // 35s when tab visible

    async function loadDashboard(showSpinner) {
      if (showSpinner) setLoading(true);
      try {
        const res = await dashboardApi();
        if (!cancelled) {
          setData(res);
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.detail || err.message || 'Failed to load dashboard');
        }
      } finally {
        if (!cancelled && showSpinner) setLoading(false);
      }
    }

    // initial load with spinner
    loadDashboard(true);

    function startPolling() {
      loadDashboard(false);
      intervalId = window.setInterval(() => loadDashboard(false), POLL_MS);
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
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stopPolling();
    };
  }, []);

  // Derive values (safe when data is null) and call hooks before any conditional return
  const tm = data?.this_month ?? {};
  const unsettled = data?.unsettled_balances_count ?? 0;
  const paymentPending = data?.payment_requests_pending ?? 0;
  const lastActivity = data?.last_activity_at ?? null;
  const activity = data?.recent_activity ?? [];
  const places = data?.places ?? [];

  const netMonth = (tm.net ?? 0);
  const netMonthAnimated = useCountUp(netMonth, 900, !!data);

  if (loading && !data) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div>
          <Skeleton className="h-8 sm:h-9 w-64 sm:w-80 mb-2" />
          <Skeleton className="h-4 w-48 sm:w-56" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <div className="md:col-span-8 rounded-2xl border border-base-300 bg-surface shadow-card p-6 sm:p-8 min-h-[280px] flex flex-col">
            <Skeleton className="h-6 w-32 mb-4" />
            <Skeleton className="h-12 w-40 mb-6" />
            <div className="flex gap-4 mt-auto">
              <Skeleton className="h-14 flex-1 rounded-xl" />
              <Skeleton className="h-14 flex-1 rounded-xl" />
            </div>
          </div>
          <div className="md:col-span-4 rounded-2xl border border-base-300 bg-surface shadow-card p-4 sm:p-5 space-y-3">
            <Skeleton className="h-5 w-28 mb-4" />
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-base-300 bg-surface shadow-card p-4 sm:p-6">
          <Skeleton className="h-5 w-36 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
                <Skeleton className="h-11 w-11 rounded-full shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-full max-w-[180px]" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const displayName = user?.display_name || user?.username || '';

  return (
    <div className="space-y-8">
      {/* Welcome – compact on mobile, no breadcrumb on home */}
      <style>{`
        @keyframes welcomeFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes cardFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .welcome-wrap { animation: welcomeFadeIn 0.5s ease-out forwards; }
        .dashboard-card { animation: cardFadeIn 0.45s ease-out forwards; }
        .dashboard-card-1 { animation-delay: 0.05s; opacity: 0; }
        .dashboard-card-2 { animation-delay: 0.1s; opacity: 0; }
        .dashboard-card-3 { animation-delay: 0.15s; opacity: 0; }
        .dashboard-card-4 { animation-delay: 0.2s; opacity: 0; }
        .dashboard-card-5 { animation-delay: 0.25s; opacity: 0; }
      `}</style>
      <div className="welcome-wrap">
        <h1 className="text-xl sm:text-2xl md:text-h1 text-text-primary m-0 leading-tight">
          Welcome, <span className="text-primary">{displayName || 'there'}</span>!
        </h1>
        <p className="text-sm sm:text-base text-text-secondary m-0 mt-0.5 sm:mt-1">
          Good to see you. Here&apos;s your overview.
        </p>
      </div>

      {/* Top row: two columns — This Month (wide, dominant) | Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* Left: This Month – hero, dominant */}
        <div className="md:col-span-8 dashboard-card dashboard-card-1 relative rounded-2xl border border-base-300 bg-surface shadow-card p-6 sm:p-8 min-h-[280px] sm:min-h-[300px] flex flex-col transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 overflow-hidden">
          {netMonth > 0 && <div className="absolute inset-0 rounded-2xl bg-success/[0.04] pointer-events-none" aria-hidden />}
          {netMonth < 0 && <div className="absolute inset-0 rounded-2xl bg-error/[0.04] pointer-events-none" aria-hidden />}
          <div className="relative z-[1] flex flex-col flex-1 min-h-0">
          <div className="flex items-center gap-2 mb-6">
            <Home className="w-5 h-5 text-primary shrink-0" aria-hidden />
            <h2 className="text-base font-semibold text-text-primary m-0">This Month</h2>
          </div>
          <div className="flex flex-col items-center justify-center text-center flex-1 min-h-[120px]">
            <p className={`text-4xl sm:text-5xl font-bold tabular-nums m-0 leading-none ${netMonth > 0 ? 'text-success' : netMonth < 0 ? 'text-error' : 'text-primary'}`}>
              {sym}{Number(Math.abs(netMonthAnimated)).toFixed(2)}
            </p>
            <p className="text-sm font-medium text-text-muted m-0 mt-4">
              {netMonth > 0 ? "You're owed this month" : netMonth < 0 ? 'You owe this month' : "You're settled this month"}
            </p>
            {tm.net_change_from_last_month != null && Number(tm.net_change_from_last_month) !== 0 && (
              <p className="text-[11px] text-text-muted/80 m-0 mt-1.5 flex items-center justify-center gap-1">
                {Number(tm.net_change_from_last_month) > 0 ? (
                  <TrendingUp className="w-3 h-3 text-success shrink-0" aria-hidden />
                ) : (
                  <TrendingDown className="w-3 h-3 text-error shrink-0" aria-hidden />
                )}
                <span>{sym}{Math.abs(Number(tm.net_change_from_last_month)).toFixed(0)} from last month</span>
              </p>
            )}
          </div>
          <div className="mt-6 pt-5 border-t border-base-300/40">
            <p className="text-xs text-text-muted m-0 flex items-center justify-center gap-1.5">
              <LayoutGrid className="w-3 h-3 text-text-muted shrink-0" aria-hidden />
              <span>{sym}{Number(tm.total_expense ?? 0).toFixed(0)} total expenses</span>
            </p>
            <div className="flex flex-col gap-2 mt-3 text-sm">
              <div className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 rounded-full bg-success shrink-0 ring-2 ring-success/30" aria-hidden />
                <span className="text-text-secondary">You&apos;re owed</span>
                <span className="font-semibold text-success tabular-nums">{sym}{Number(tm.owed_to_me ?? 0).toFixed(0)}</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 rounded-full bg-base-400 shrink-0 ring-2 ring-base-300" aria-hidden />
                <span className="text-text-secondary">You owe</span>
                <span className="font-semibold text-text-secondary tabular-nums">{sym}{Number(tm.i_owe ?? 0).toFixed(0)}</span>
              </div>
            </div>
            {(() => {
              const owed = Number(tm.owed_to_me ?? 0);
              const owe = Number(tm.i_owe ?? 0);
              const total = owed + owe || 1;
              const net = owed - owe;
              // Bar reflects net direction: when net > 0 green dominates (right); when net < 0 grey dominates (right).
              const leftPct = (owe / total) * 100;
              const rightPct = (owed / total) * 100;
              return (
                <div className="h-2 rounded-full bg-base-200 overflow-hidden flex mt-3" role="presentation" aria-hidden>
                  {net >= 0 ? (
                    <>
                      <span
                        className="bg-base-300 rounded-l-full transition-all duration-300 shrink-0"
                        style={{ width: `${leftPct}%` }}
                      />
                      <span
                        className="bg-success rounded-r-full transition-all duration-300 shrink-0"
                        style={{ width: `${rightPct}%` }}
                      />
                    </>
                  ) : (
                    <>
                      <span
                        className="bg-success rounded-l-full transition-all duration-300 shrink-0"
                        style={{ width: `${rightPct}%` }}
                      />
                      <span
                        className="bg-base-300 rounded-r-full transition-all duration-300 shrink-0"
                        style={{ width: `${leftPct}%` }}
                      />
                    </>
                  )}
                </div>
              );
            })()}
          </div>
            {unsettled > 0 && places.length > 0 && (() => {
              // Prefer a place that has unsettled balances; if several, pick the one with the most
              const placesWithUnsettled = places
                .filter((p) => (p.unsettled_balances_count ?? 0) > 0)
                .sort((a, b) => (b.unsettled_balances_count ?? 0) - (a.unsettled_balances_count ?? 0));
              const targetPlace = placesWithUnsettled.length > 0 ? placesWithUnsettled[0] : places[0];
              const placeId = targetPlace?.id;
              if (placeId == null) return null;
              const settleUrl = `/places/${placeId}?tab=summary`;
              return (
                <button
                  type="button"
                  onClick={() => navigate(settleUrl)}
                  className="relative z-10 mt-4 pt-4 border-t border-base-300/40 w-full flex items-center justify-center gap-1.5 text-sm text-primary hover:underline transition-colors cursor-pointer py-2 rounded-lg hover:bg-primary/5 -mx-2 px-2 bg-transparent border-x-0 border-b-0"
                >
                  Settle balances
                  <ArrowRight className="w-4 h-4 shrink-0" aria-hidden />
                </button>
              );
            })()}
          </div>
        </div>

        {/* Right: Quick Actions */}
        <div className="md:col-span-4 dashboard-card dashboard-card-2 rounded-2xl border border-base-300 bg-surface shadow-card p-5 sm:p-6 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5">
          <div className="flex items-center gap-2 mb-5">
            <Star className="w-5 h-5 text-primary shrink-0" aria-hidden />
            <h2 className="text-base font-semibold text-text-primary m-0">Quick Actions</h2>
          </div>
          <div className="flex flex-col gap-3">
            {places.length === 0 ? (
              <Link
                to="/places"
                className="flex flex-col items-center justify-center gap-3 py-5 px-4 rounded-xl border border-primary/30 bg-base-100 text-primary hover:bg-primary/5 hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 no-underline transition-all duration-200"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                  <Plus className="w-7 h-7" aria-hidden />
                </span>
                <span className="text-base font-semibold text-center">Add Expense</span>
              </Link>
            ) : places.length === 1 ? (
              <Link
                to={`/places/${places[0].id}?tab=expenses`}
                className="flex flex-col items-center justify-center gap-3 py-5 px-4 rounded-xl border border-primary/30 bg-base-100 text-primary hover:bg-primary/5 hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 no-underline transition-all duration-200"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                  <Plus className="w-7 h-7" aria-hidden />
                </span>
                <span className="text-base font-semibold text-center">Add Expense</span>
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setAddExpensePlaceOpen(true)}
                  className="flex flex-col items-center justify-center gap-3 py-5 px-4 rounded-xl border border-primary/30 bg-base-100 text-primary hover:bg-primary/5 hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-200 text-center w-full"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                    <Plus className="w-7 h-7" aria-hidden />
                  </span>
                  <span className="text-base font-semibold">Add Expense</span>
                </button>
                {addExpensePlaceOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40 bg-black/30"
                      aria-hidden
                      onClick={() => setAddExpensePlaceOpen(false)}
                    />
                    <div className="fixed left-1/2 top-1/2 z-50 w-[min(100vw-2rem,360px)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-base-100 border border-border shadow-xl p-4 animate-fade-in">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-base font-semibold text-text-primary m-0">Add expense to</h3>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-square"
                          onClick={() => setAddExpensePlaceOpen(false)}
                          aria-label="Close"
                        >
                          <X className="w-4 h-4" aria-hidden />
                        </button>
                      </div>
                      <ul className="list-none p-0 m-0 space-y-1 max-h-[60vh] overflow-auto">
                        {places.map((place) => (
                          <li key={place.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setAddExpensePlaceOpen(false);
                                navigate(`/places/${place.id}?tab=expenses`);
                              }}
                              className="w-full flex items-center gap-2.5 py-2.5 px-3 rounded-lg hover:bg-base-200 text-left text-text-primary"
                            >
                              <Building2 className="w-4 h-4 text-primary shrink-0" aria-hidden />
                              <span className="font-medium truncate">{place.name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Link
                to="/places"
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-base-300 bg-base-100 text-text-primary hover:bg-base-200 hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/20 no-underline transition-all duration-200"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-base-200 text-primary">
                  <Building2 className="w-5 h-5" aria-hidden />
                </span>
                <span className="text-xs font-medium text-center leading-tight">Create Place</span>
              </Link>
              <Link
                to={places.length ? `/places/${places[0].id}?tab=invite` : '/places'}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-base-300 bg-base-100 text-text-primary hover:bg-base-200 hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/20 no-underline transition-all duration-200"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-base-200 text-primary">
                  <UserPlus className="w-5 h-5" aria-hidden />
                </span>
                <span className="text-xs font-medium text-center leading-tight">Invite Member</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row: Recent Activity (wide) + Balance Summary + Your Places – items-start so left card doesn't stretch and show blank space */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Left: Recent Activity – same style as Activity page, full card width. On mobile: order-last so it appears at bottom */}
        <div className="lg:col-span-2 order-last lg:order-1 dashboard-card dashboard-card-4 rounded-2xl border border-base-300 bg-surface shadow-card overflow-hidden w-full min-w-0 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5">
          <h2 className="text-base font-semibold text-text-primary m-0 p-4 sm:p-5 pb-0">Recent Activity</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-text-secondary m-0 p-4 sm:p-5">No recent activity</p>
          ) : (
            <ul className="list-none p-0 m-0 relative max-h-[min(420px,60vh)] overflow-y-auto w-full">
              <div className="absolute top-0 bottom-0 w-px bg-base-300 pointer-events-none" style={{ left: '2.25rem' }} aria-hidden />
              {activity.map((a) => (
                <li
                  key={`${a.type}-${a.id}`}
                  className="relative flex items-start gap-4 px-4 py-4 sm:px-5 sm:py-5 border-b border-border last:border-b-0 w-full min-w-0"
                >
                  <ActivityIcon
                    type={a.type}
                    userDisplayName={a.user_display_name}
                    userProfilePhoto={a.user_profile_photo}
                  />
                  <div className="flex-1 min-w-0 flex flex-wrap items-start justify-between gap-2 w-full">
                    <div className="min-w-0 flex-1 w-full">
                      {a.type === 'expense_added' && (
                        <>
                          <p className="text-sm text-text-primary m-0 leading-snug">
                            <span className="font-semibold">{user?.id != null && a.user_id === user.id ? 'You' : (a.user_display_name || 'Someone')}</span>
                            {' created an expense '}
                            <span className="font-semibold">{a.description}</span>
                            {' in '}
                            <span className="font-semibold">{a.place_name}</span>
                          </p>
                          <p className="text-xs text-primary m-0 mt-0.5">
                            Amount: {sym}{Number(a.amount).toFixed(2)}
                          </p>
                        </>
                      )}
                      {a.type === 'place_created' && (
                        <p className="text-sm text-text-primary m-0 leading-snug">
                          <span className="font-semibold">{user?.id != null && a.user_id === user.id ? 'You' : (a.user_display_name || 'Someone')}</span>
                          {' created the group '}
                          <span className="font-semibold">{a.place_name}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {a.type === 'expense_added' && user?.id != null && a.user_id === user.id && (
                        <Link
                          to={`/places/${a.place_id}?tab=expenses&editExpense=${a.id}`}
                          className="btn btn-ghost btn-sm rounded-lg text-xs"
                        >
                          Edit
                        </Link>
                      )}
                      <span className="text-xs text-text-muted whitespace-nowrap">
                        {formatTimestamp(a.created_at)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {activity.length > 0 && (
            <div className="px-4 sm:px-5 pt-2 pb-4">
              <Link to="/activity" className="text-sm text-primary font-medium inline-flex items-center gap-1 no-underline hover:underline transition-colors duration-200">
                View all activity <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>

        {/* Right: Your Places. On mobile: order-first so they appear before Recent Activity */}
        <div className="lg:col-span-2 order-first lg:order-2 flex flex-col gap-6">
          {/* Your Places – horizontal scroll, swipeable mini-cards */}
          <div className="dashboard-card dashboard-card-5 rounded-2xl border border-base-300 bg-surface shadow-card p-4 sm:p-5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5">
            <h2 className="text-base font-semibold text-text-primary m-0 mb-4">Your Places</h2>
            {places.length === 0 ? (
              <p className="text-sm text-text-secondary m-0 mb-3">No places yet</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto overflow-y-hidden pb-2 -mx-1 px-1 snap-x snap-mandatory scroll-smooth [scrollbar-width:thin]">
                {places.map((place) => (
                  <Link
                    key={place.id}
                    to={place.expense_count > 0 ? `/places/${place.id}` : `/places/${place.id}?tab=expenses`}
                    className="flex flex-col min-w-[152px] w-[152px] flex-shrink-0 snap-center p-4 rounded-xl border border-base-300 bg-base-100 transition-all duration-200 hover:shadow-md hover:border-primary/30 active:scale-[0.98] no-underline"
                  >
                    <p className="font-semibold text-text-primary m-0 truncate text-sm">{place.name}</p>
                    <p className="text-xs text-text-secondary m-0 mt-1 flex items-center gap-1">
                      <Users className="w-3 h-3 text-text-muted shrink-0" aria-hidden />
                      {place.member_count} member{place.member_count !== 1 ? 's' : ''}
                    </p>
                    {place.members?.length > 0 && (
                      <div className="flex -space-x-2 mt-2">
                        {place.members.slice(0, 4).map((m) => (
                          <span key={m.id} className="inline-block ring-2 ring-base-100 rounded-full">
                            <UserAvatar username={m.username} displayName={m.display_name} size="xs" />
                          </span>
                        ))}
                      </div>
                    )}
                    {place.expense_count === 0 ? (
                      <p className="text-xs text-text-muted m-0 mt-2">No expenses yet</p>
                    ) : null}
                    <span className={`mt-3 text-xs font-medium rounded-lg py-2 text-center block ${place.expense_count > 0 ? 'text-primary border border-base-300' : 'bg-primary text-primary-content'}`}>
                      {place.expense_count > 0 ? 'View' : 'Add expense'}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <Link to="/places" className="btn btn-ghost btn-sm mt-3 rounded-lg transition-colors duration-200 hover:bg-base-200">
              Manage places
            </Link>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-error m-0">{error}</p>}
    </div>
  );
}
