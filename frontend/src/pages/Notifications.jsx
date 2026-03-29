import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notifications as notificationsApi } from '../api';
import { Banknote, AlertTriangle, Home, Bell, ChevronRight, Receipt } from 'lucide-react';

function notifIcon(type) {
  switch (type) {
    case 'payment_request':
      return <Banknote className="w-5 h-5 text-error" aria-hidden />;
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

export default function Notifications() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState([]);

  async function refresh() {
    setError('');
    setLoading(true);
    try {
      const res = await notificationsApi.list(50);
      setUnreadCount(res?.unread_count ?? 0);
      setItems(Array.isArray(res?.results) ? res.results : []);
    } catch (e) {
      setError(e?.detail || e?.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  async function markAllRead() {
    try {
      await notificationsApi.markAllRead();
      await refresh();
    } catch (e) {
      setError(e?.detail || e?.message || 'Failed to mark all as read');
    }
  }

  async function open(n) {
    try {
      if (!n?.is_read) await notificationsApi.markRead(n.id);
    } catch {
      // ignore
    }
    const placeId = n?.data?.place_id || n?.place;
    if (placeId) {
      const openSettlement = n?.data?.open_settlement === true;
      navigate(openSettlement ? `/places/${placeId}?tab=summary&settle=1` : `/places/${placeId}`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-text-primary m-0">Notifications</h1>
          <p className="text-sm text-text-secondary m-0 mt-1">
            {unreadCount} unread
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm rounded-lg text-primary"
          onClick={markAllRead}
          disabled={unreadCount === 0}
        >
          Mark all as read
        </button>
      </div>

      {error && <p className="text-sm text-error m-0">{error}</p>}

      <div className="rounded-2xl border border-base-300 bg-surface shadow-card overflow-hidden">
        {loading ? (
          <div className="p-5 text-sm text-text-secondary">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-5 text-sm text-text-secondary">No notifications yet</div>
        ) : (
          <ul className="list-none p-0 m-0">
            {items.map((n) => (
              <li key={n.id} className="border-b border-border last:border-b-0">
                {/*
                  Only treat manual payment requests (from the Member balances "Request payment" form) as urgent.
                  Expense-added and other types use normal styling and their real title.
                */}
                {(() => {
                  const isUrgentPayment = n.type === 'payment_request' && n.data?.kind === 'manual';
                  const iconWrapperClass = `mt-0.5 w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isUrgentPayment ? 'bg-error/10' : 'bg-base-200'
                  }`;
                  return (
                <button
                  type="button"
                  onClick={() => open(n)}
                  className="w-full text-left px-4 py-3 hover:bg-base-200 transition-colors flex items-start gap-3"
                >
                  <div className={iconWrapperClass}>
                    {notifIcon(n.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-text-primary m-0 truncate">
                        {isUrgentPayment ? 'Urgent payment request' : n.title}
                      </p>
                      {!n.is_read && (
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                            isUrgentPayment ? 'bg-error/10 text-error' : 'bg-warning/20 text-warning'
                          }`}
                        >
                          {isUrgentPayment ? 'URGENT' : 'NEW'}
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
                  );
                })()}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

