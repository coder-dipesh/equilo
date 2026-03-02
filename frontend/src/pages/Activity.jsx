import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { activity as activityApi } from '../api';
import { useAuth } from '../AuthContext';
import { usePreferences } from '../PreferencesContext';
import { Skeleton } from '../components/Skeleton';
import { Users, Receipt, ChevronRight, Wallet, Pencil, Trash2, User, Lock, LogIn } from 'lucide-react';

/** Format ISO date as "Feb 11th, 4:24 PM" */
function formatTimestamp(iso) {
  const d = new Date(iso);
  const month = d.toLocaleString('en-US', { month: 'short' });
  const day = d.getDate();
  const suffix =
    day === 1 || day === 21 || day === 31
      ? 'st'
      : day === 2 || day === 22
        ? 'nd'
        : day === 3 || day === 23
          ? 'rd'
          : 'th';
  const time = d.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${month} ${day}${suffix}, ${time}`;
}

function UserAvatar({ name, photoUrl, size = 'sm' }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const sizeClass = size === 'xs' ? 'w-6 h-6 text-xs' : 'w-9 h-9 text-sm';
  if (photoUrl) {
    return (
      <div
        className={`rounded-full overflow-hidden bg-base-300 shrink-0 ring-2 ring-base-100 ${sizeClass}`}
        aria-hidden
      >
        <img src={photoUrl} alt="" className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div
      className={`rounded-full bg-primary text-primary-content opacity-100 flex items-center justify-center font-semibold shrink-0 ring-2 ring-base-100 ${sizeClass}`}
      aria-hidden
    >
      {initial}
    </div>
  );
}

const ACTIVITY_ICON_MAP = {
  expense_added: { Icon: Receipt, bg: 'bg-success text-success-content' },
  expense_edited: { Icon: Pencil, bg: 'bg-info text-info-content' },
  expense_deleted: { Icon: Trash2, bg: 'bg-base-content/20 text-base-content' },
  place_created: { Icon: Users, bg: 'bg-primary text-primary-content' },
  place_joined: { Icon: LogIn, bg: 'bg-primary text-primary-content' },
  settlement: { Icon: Wallet, bg: 'bg-success text-success-content' },
  profile_updated: { Icon: User, bg: 'bg-primary text-primary-content' },
  password_changed: { Icon: Lock, bg: 'bg-primary text-primary-content' },
};

/** Activity icon behind; user avatar on top overlapping bottom-right */
function ActivityIcon({ type, userDisplayName, userProfilePhoto }) {
  const { Icon = Users, bg = 'bg-primary text-primary-content' } = ACTIVITY_ICON_MAP[type] || ACTIVITY_ICON_MAP.place_created;
  const hasAvatar = !!userDisplayName;
  return (
    <div className="relative w-11 h-11 shrink-0 opacity-100">
      <div
        className={`absolute top-0 left-0 w-10 h-10 rounded-full flex items-center justify-center ring-2 ring-base-100 z-0 ${bg}`}
        aria-hidden
      >
        <Icon className="w-5 h-5" aria-hidden />
      </div>
      {hasAvatar && (
        <div className="absolute -bottom-0.5 -right-0.5 z-10 ring-2 ring-base-100 rounded-full">
          <UserAvatar name={userDisplayName} photoUrl={userProfilePhoto} size="xs" />
        </div>
      )}
    </div>
  );
}

export default function Activity() {
  const { user } = useAuth();
  const { currency } = usePreferences();
  const sym = currency?.symbol ?? '$';
  const currentUserId = user?.id;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError('');
      setLoading(true);
      try {
        const res = await activityApi(80);
        if (!cancelled) {
          setItems(Array.isArray(res?.results) ? res.results : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.detail || e?.message || 'Failed to load activity');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function actorLabel(a) {
    if (currentUserId != null && a.user_id === currentUserId) return 'You';
    return a.user_display_name || 'Someone';
  }

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-text-muted">
        <Link to="/" className="link link-hover text-text-secondary hover:text-primary">
          Home
        </Link>
        <ChevronRight className="w-4 h-4 shrink-0" aria-hidden />
        <span className="text-text-primary font-medium" aria-current="page">
          Recent activity
        </span>
      </nav>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-text-primary m-0">Recent activity</h1>
          <p className="text-sm text-text-secondary m-0 mt-1">
            Timeline of expenses and groups across your places
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-base-300 bg-surface shadow-card overflow-hidden">
        {loading ? (
          <div className="p-4 sm:p-6 space-y-0 animate-fade-in">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-center gap-3 py-3 border-b border-base-300 last:border-b-0">
                <Skeleton className="h-11 w-11 rounded-full shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                  <Skeleton className="h-4 w-full max-w-[200px]" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-5 shrink-0" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-5 text-sm text-error">{error}</div>
        ) : items.length === 0 ? (
          <div className="p-5 text-sm text-text-secondary">No activity yet</div>
        ) : (
          <ul className="list-none p-0 m-0 relative">
            {/* Vertical timeline line through icon centers (pl-4 + half icon = 16+20 = 36px) */}
            <div
              className="absolute top-0 bottom-0 w-px bg-base-300 pointer-events-none"
              style={{ left: '2.25rem' }}
              aria-hidden
            />
            {items.map((a) => (
              <li
                key={`${a.type}-${a.id}`}
                className="relative flex items-start gap-4 px-4 py-4 sm:px-5 sm:py-5 border-b border-border last:border-b-0"
              >
                <ActivityIcon type={a.type} userDisplayName={a.user_display_name} userProfilePhoto={a.user_profile_photo} />

                <div className="flex-1 min-w-0 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {a.type === 'expense_added' && (
                      <>
                        <p className="text-sm text-text-primary m-0 leading-snug">
                          <span className="font-semibold">{actorLabel(a)}</span>
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
                        <span className="font-semibold">{actorLabel(a)}</span>
                        {' created the group '}
                        <span className="font-semibold">{a.place_name}</span>
                      </p>
                    )}
                    {a.type === 'expense_edited' && (
                      <p className="text-sm text-text-primary m-0 leading-snug">
                        <span className="font-semibold">{actorLabel(a)}</span>
                        {' edited an expense '}
                        {a.description && <span className="font-semibold">{a.description}</span>}
                        {a.place_name && <> in <span className="font-semibold">{a.place_name}</span></>}
                        {a.amount != null && (
                          <p className="text-xs text-primary m-0 mt-0.5">Amount: {sym}{Number(a.amount).toFixed(2)}</p>
                        )}
                      </p>
                    )}
                    {a.type === 'expense_deleted' && (
                      <p className="text-sm text-text-primary m-0 leading-snug">
                        <span className="font-semibold">{actorLabel(a)}</span>
                        {' deleted an expense '}
                        {a.description && <span className="font-semibold">{a.description}</span>}
                        {a.place_name && <> from <span className="font-semibold">{a.place_name}</span></>}
                        {a.amount != null && (
                          <p className="text-xs text-text-muted m-0 mt-0.5">Was: {sym}{Number(a.amount).toFixed(2)}</p>
                        )}
                      </p>
                    )}
                    {a.type === 'place_joined' && (
                      <p className="text-sm text-text-primary m-0 leading-snug">
                        <span className="font-semibold">{actorLabel(a)}</span>
                        {' joined the group '}
                        <span className="font-semibold">{a.place_name}</span>
                      </p>
                    )}
                    {a.type === 'settlement' && (
                      <>
                        <p className="text-sm text-text-primary m-0 leading-snug">
                          <span className="font-semibold">{actorLabel(a)}</span>
                          {' recorded a settlement'}
                          {a.place_name && <> in <span className="font-semibold">{a.place_name}</span></>}
                          {a.target_user_display_name && <> with <span className="font-semibold">{a.target_user_display_name}</span></>}
                        </p>
                        {a.amount != null && (
                          <p className="text-xs text-success m-0 mt-0.5">{sym}{Number(a.amount).toFixed(2)}</p>
                        )}
                      </>
                    )}
                    {a.type === 'profile_updated' && (
                      <p className="text-sm text-text-primary m-0 leading-snug">
                        <span className="font-semibold">{actorLabel(a)}</span>
                        {' updated their profile'}
                      </p>
                    )}
                    {a.type === 'password_changed' && (
                      <p className="text-sm text-text-primary m-0 leading-snug">
                        <span className="font-semibold">{actorLabel(a)}</span>
                        {' changed their password'}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {(a.type === 'expense_added' || a.type === 'expense_edited') &&
                      currentUserId != null &&
                      a.user_id === currentUserId &&
                      a.place_id && (
                        <Link
                          to={`/places/${a.place_id}?tab=expenses&editExpense=${a.type === 'expense_added' ? a.id : (a.expense_id || a.id)}`}
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
      </div>
    </div>
  );
}
