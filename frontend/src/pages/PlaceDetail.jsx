import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { usePreferences } from '../PreferencesContext';
import { places as placesApi, expenses, categories, summary, invites, placeMembers } from '../api';
import { Trash2, Pencil, Filter, Calendar, Users, X, Check, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Scale, Wallet, CircleDollarSign, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

// Explicit hex colors for Recharts (matches fintech brand – SVG does not resolve CSS variables)
const CHART_COLORS = {
  primary: '#1F5BFF',
  primaryLight: '#AFCBFF',
  primaryMuted: '#4D7CFF',
  othersShare: '#DDE3EA',
  navy: '#0B2166',
};

const VALID_TABS = ['expenses', 'summary', 'invite'];

export default function PlaceDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { currency, startOfWeek } = usePreferences();
  const tabFromUrl = searchParams.get('tab');
  const tab = VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'expenses';

  const [place, setPlace] = useState(null);
  const [expenseList, setExpenseList] = useState([]);
  const [expensePage, setExpensePage] = useState(1);
  const [expenseTotalCount, setExpenseTotalCount] = useState(0);
  const [expensePageSize] = useState(10);
  const [summaryData, setSummaryData] = useState(null);
  const [period, setPeriod] = useState('weekly');
  const [summaryPeriodEnd, setSummaryPeriodEnd] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteList, setInviteList] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const isOwner = place?.members?.some((m) => m.user?.id === user?.id && m.role === 'owner');

  function load() {
    if (!id) {
      setPlace(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      placesApi.get(id),
      expenses(id).list({ page: 1, page_size: 10 }),
      summary(id, period, summaryPeriodEnd || undefined, startOfWeek),
      placeMembers(id).list(),
    ])
      .then(([p, ex, sum, mem]) => {
        setPlace(p);
        const list = Array.isArray(ex) ? ex : (ex?.results ?? []);
        const count = Array.isArray(ex) ? ex.length : (ex?.count ?? list.length);
        setExpenseList(list);
        setExpensePage(1);
        setExpenseTotalCount(count);
        setSummaryData(sum);
        setMembers(mem);
      })
      .catch(() => setPlace(null))
      .finally(() => setLoading(false));
  }

  function loadExpensesPage(page) {
    if (!id || page < 1) return;
    expenses(id)
      .list({ page, page_size: expensePageSize })
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.results ?? []);
        const count = Array.isArray(data) ? data.length : (data?.count ?? list.length);
        setExpenseList(list);
        setExpensePage(page);
        setExpenseTotalCount(count);
      })
      .catch(() => {});
  }

  useEffect(() => load(), [id, startOfWeek]);
  useEffect(() => {
    if (id && place) {
      summary(id, period, summaryPeriodEnd || undefined, startOfWeek).then(setSummaryData).catch(() => {});
    }
  }, [id, period, summaryPeriodEnd, place, startOfWeek]);

  useEffect(() => {
    if (!id || !place) return;
    const interval = setInterval(() => {
      expenses(id)
        .list({ page: expensePage, page_size: expensePageSize })
        .then((data) => {
          const list = Array.isArray(data) ? data : (data?.results ?? []);
          setExpenseList(list);
          if (!Array.isArray(data) && data?.count != null) setExpenseTotalCount(data.count);
        })
        .catch(() => {});
      summary(id, period, summaryPeriodEnd || undefined, startOfWeek).then(setSummaryData).catch(() => {});
      placeMembers(id).list().then(setMembers).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [id, place, period, summaryPeriodEnd, expensePage, expensePageSize, startOfWeek]);

  useEffect(() => {
    if (place && tab === 'invite' && !isOwner) {
      setSearchParams({ tab: 'expenses' });
    }
  }, [place, tab, isOwner, setSearchParams]);

  useEffect(() => {
    if (tab === 'invite' && id && isOwner) {
      invites(id).list().then(setInviteList).catch(() => setInviteList([]));
    }
  }, [tab, id, isOwner]);

  if (loading && !place) return <div className="pb-8"><p>Loading…</p></div>;
  if (!place) {
    return (
      <div className="pb-8 max-w-md">
        <p className="text-text-primary font-medium m-0 mb-1">Place not found</p>
        <p className="text-sm text-text-secondary m-0 mb-4">
          This place may not exist, or you may not have access to it. Go back to your list and open a place from there.
        </p>
        <Link to="/" className="btn btn-primary btn-sm">Back to places</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-8 bg-bg">
      <header className="flex items-center justify-between gap-4 mb-6">
        <Link to="/" className="link link-hover text-sm opacity-80">← Places</Link>
        <h1 className="text-xl font-semibold m-0">{place.name}</h1>
      </header>

      <nav className="flex gap-1 mb-6">
        <button
          type="button"
          className={`btn btn-sm ${tab === 'expenses' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setSearchParams({ tab: 'expenses' })}
        >
          Expenses
        </button>
        <button
          type="button"
          className={`btn btn-sm ${tab === 'summary' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setSearchParams({ tab: 'summary' })}
        >
          Summary
        </button>
        {isOwner && (
          <button
            type="button"
            className={`btn btn-sm ${tab === 'invite' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSearchParams({ tab: 'invite' })}
          >
            Invite
          </button>
        )}
      </nav>

      {tab === 'expenses' && (
        <ExpensesSection
          placeId={id}
          place={place}
          expenseList={expenseList}
          expensePage={expensePage}
          expenseTotalCount={expenseTotalCount}
          expensePageSize={expensePageSize}
          onPageChange={loadExpensesPage}
          members={members}
          onRefresh={load}
          currentUser={user}
          isOwner={isOwner}
          currency={currency}
        />
      )}
      {tab === 'summary' && summaryData && (
        <SummarySection
          data={summaryData}
          period={period}
          setPeriod={setPeriod}
          summaryPeriodEnd={summaryPeriodEnd}
          setSummaryPeriodEnd={setSummaryPeriodEnd}
          members={members}
          currentUserId={user?.id}
          currency={currency}
        />
      )}
      {tab === 'invite' && isOwner && (
        <InviteSection placeId={id} placeName={place?.name} inviteEmail={inviteEmail} setInviteEmail={setInviteEmail} inviteList={inviteList} onRefresh={() => invites(id).list().then(setInviteList)} />
      )}
    </div>
  );
}

function Avatar({ username, className = '' }) {
  const initial = username ? username.charAt(0).toUpperCase() : '?';
  return (
    <div className={`rounded-full bg-primary/20 text-primary flex items-center justify-center font-semibold text-sm shrink-0 w-8 h-8 ${className}`} aria-hidden>
      {initial}
    </div>
  );
}

function ExpenseCard({ expense, placeId, members, currentUser, isOwner, onRefresh, onEdit, currency }) {
  const canEdit = isOwner || (expense.added_by?.id === currentUser?.id);
  const sym = currency?.symbol ?? '$';
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);
  const offsetAtGestureStart = useRef(0);
  const currentOffsetRef = useRef(0);
  const didDrag = useRef(false);
  const deleteAnimationDone = useRef(false);

  useEffect(() => { currentOffsetRef.current = swipeOffset; }, [swipeOffset]);

  const amountStr = `${sym}${Number(expense.amount).toFixed(2)}`;

  function handleDragStart(clientX) {
    dragStartX.current = clientX;
    offsetAtGestureStart.current = currentOffsetRef.current;
    didDrag.current = false;
  }
  function handleDragMove(clientX) {
    if (!canEdit) return;
    didDrag.current = true;
    const dx = dragStartX.current - clientX;
    const next = Math.max(0, Math.min(offsetAtGestureStart.current + dx, 80));
    currentOffsetRef.current = next;
    setSwipeOffset(next);
  }
  function handleDragEnd() {
    if (!canEdit) return;
    const current = currentOffsetRef.current;
    if (current > 50) { setSwipeOffset(80); currentOffsetRef.current = 80; }
    else { setSwipeOffset(0); currentOffsetRef.current = 0; }
  }
  function handleTouchStart(e) {
    const t = e.touches[0];
    dragStartX.current = t.clientX;
    dragStartY.current = t.clientY;
    offsetAtGestureStart.current = currentOffsetRef.current;
    didDrag.current = false;
  }
  function handleTouchMove(e) {
    if (!canEdit) return;
    const t = e.touches[0];
    const dx = Math.abs(dragStartX.current - t.clientX);
    const dy = Math.abs(dragStartY.current - t.clientY);
    if (dx > dy || currentOffsetRef.current > 0) {
      e.preventDefault();
      handleDragMove(t.clientX);
    }
  }
  function handleMouseDown(e) {
    if (!canEdit) return;
    e.preventDefault();
    handleDragStart(e.clientX);
    const onMouseMove = (e2) => handleDragMove(e2.clientX);
    const onMouseUp = () => {
      handleDragEnd();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function handleDeleteClick() {
    if (!canEdit || deleting) return;
    setDetailOpen(false);
    deleteAnimationDone.current = false;
    setDeleting(true);
  }
  function handleDeleteTransitionEnd(e) {
    if (e.propertyName !== 'max-height' || deleteAnimationDone.current) return;
    deleteAnimationDone.current = true;
    expenses(placeId).delete(expense.id).then(onRefresh).catch(() => {});
  }
  async function handleDeleteFromModal() {
    if (!canEdit) return;
    setDeleting(true);
    setDetailOpen(false);
    try {
      await expenses(placeId).delete(expense.id);
      onRefresh();
    } catch (err) {}
    finally { setDeleting(false); }
  }

  return (
    <li className="list-none mb-3 transition-[margin,opacity] duration-300 ease-out" style={{ marginBottom: deleting ? 0 : undefined }}>
      <div
        className="overflow-hidden transition-[max-height,opacity] duration-300 ease-out"
        style={{ maxHeight: deleting ? 0 : 400, opacity: deleting ? 0 : 1 }}
        onTransitionEnd={handleDeleteTransitionEnd}
      >
        <div className="overflow-hidden rounded-xl border border-base-300 bg-base-200 shadow-soft">
          <div
            className="relative overflow-hidden"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleDragEnd}
            onMouseDown={handleMouseDown}
            style={{ touchAction: 'pan-y' }}
          >
            {canEdit && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleDeleteClick(); }}
                disabled={deleting}
                className="absolute right-0 top-0 bottom-0 w-20 flex items-center justify-center bg-error/90 z-0 cursor-pointer border-0 text-error-content hover:bg-error transition-colors"
                aria-label="Delete expense"
              >
                <Trash2 className="w-5 h-5 shrink-0" aria-hidden />
              </button>
            )}
            <div
              className="relative z-10 min-w-0 transition-transform duration-200 ease-out cursor-pointer select-none bg-base-200 border-l-4 border-l-primary"
              style={{ transform: `translateX(-${swipeOffset}px)` }}
              onClick={() => { if (!didDrag.current) setDetailOpen(true); didDrag.current = false; }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setDetailOpen(true)}
              aria-label={`View details for ${expense.description}, ${amountStr}`}
            >
              <div className="px-4 py-3.5 flex items-start gap-3">
                <Avatar username={expense.paid_by?.display_name || expense.paid_by?.username} className="!w-10 !h-10 text-sm shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-text-primary truncate">{expense.description}</span>
                    {expense.category?.name && (
                      <span className="badge badge-sm badge-ghost text-text-secondary border border-base-300 font-medium">{expense.category.name}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-small text-text-secondary">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden />
                      {expense.date}
                    </span>
                    {(expense.paid_by?.display_name || expense.paid_by?.username) && (
                      <span className="flex items-center gap-1">
                        <span className="opacity-70">Paid by</span>
                        <span className="font-medium text-text-primary">{expense.paid_by?.display_name || expense.paid_by?.username}</span>
                      </span>
                    )}
                    {expense.splits?.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden />
                        {expense.splits.length} way{expense.splits.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div
                  className={`text-lg font-bold text-primary shrink-0 tabular-nums transition-opacity duration-150 ${swipeOffset > 0 ? 'opacity-0' : ''}`}
                  title={amountStr}
                  aria-hidden={swipeOffset > 0}
                >
                  {amountStr}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {detailOpen && (
        <div
          className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/50"
          onClick={() => setDetailOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="expense-detail-title"
        >
          <div
            className="bg-base-200 border border-base-300 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setDetailOpen(false)}
              className="absolute top-4 right-4 btn btn-ghost btn-circle btn-sm text-text-secondary hover:text-text-primary hover:bg-base-300"
              aria-label="Close"
            >
              <X className="w-5 h-5" aria-hidden />
            </button>
            <div className="p-6 sm:p-8 pt-10 sm:pt-10">
              <p className="text-3xl font-bold text-primary tabular-nums m-0 mb-5">{amountStr}</p>
              <div className="flex flex-wrap items-center gap-3 mb-6">
                <h2 id="expense-detail-title" className="text-lg font-semibold text-text-primary m-0">{expense.description}</h2>
                {(expense.category?.name != null && expense.category.name !== '') ? (
                  <span className="badge badge-sm badge-ghost text-text-secondary border border-base-300 font-normal">{expense.category.name}</span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-text-secondary mb-6 pb-6 border-b border-base-300">
                <span className="flex items-center gap-2.5">
                  <Avatar username={expense.paid_by?.display_name || expense.paid_by?.username} className="!w-7 !h-7 text-xs" />
                  <span className="text-text-primary font-medium">{(expense.paid_by?.display_name || expense.paid_by?.username) ?? '—'}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 opacity-60 shrink-0" aria-hidden />
                  {expense.date}
                </span>
                <span className="flex items-center gap-2">
                  <span className="opacity-60">Category</span>
                  <span className="text-text-primary font-medium">{expense.category?.name ?? 'Uncategorized'}</span>
                </span>
                {expense.splits?.length > 0 && (
                  <span className="flex items-center gap-2">
                    <Users className="w-4 h-4 opacity-60 shrink-0" aria-hidden />
                    {expense.splits.length} split{expense.splits.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {expense.splits?.length > 0 && (
                <div className="mb-8">
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wide m-0 mb-3">Split between</p>
                  <div className="flex flex-wrap gap-4">
                    {expense.splits.map((s) => (
                      <div key={s.user?.id ?? s.id} className="flex items-center gap-2.5">
                        <Avatar username={s.user?.display_name || s.user?.username} className="!w-7 !h-7 text-xs" />
                        <span className="text-sm text-text-primary">{s.user?.display_name || s.user?.username}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {canEdit && (
                <div className="flex gap-3 pt-2">
                  <button type="button" className="btn btn-outline flex-1 btn-sm" onClick={() => { setDetailOpen(false); onEdit?.(expense); }}>
                    <Pencil className="w-4 h-4 mr-1.5" aria-hidden /> Edit
                  </button>
                  <button type="button" className="btn btn-error flex-1 btn-sm" onClick={handleDeleteFromModal} disabled={deleting}>
                    <Trash2 className="w-4 h-4 mr-1.5" aria-hidden /> {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function ExpensesSection({ placeId, place, expenseList, expensePage, expenseTotalCount, expensePageSize, onPageChange, members, onRefresh, currentUser, isOwner, currency }) {
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterMyExpenses, setFilterMyExpenses] = useState(false);
  const [categoryList, setCategoryList] = useState([]);

  useEffect(() => {
    categories(placeId).list().then(setCategoryList).catch(() => setCategoryList([]));
  }, [placeId]);

  const filteredList = expenseList.filter((exp) => {
    if (filterCategory && (exp.category?.id != null ? String(exp.category.id) : '') !== filterCategory) return false;
    if (filterMyExpenses && exp.added_by?.id !== currentUser?.id) return false;
    return true;
  });

  // Group by added date (created_at), newest first
  const groupedByAddedDate = (() => {
    const groups = {};
    for (const exp of filteredList) {
      const raw = exp.created_at || exp.date;
      const dateKey = raw ? new Date(raw).toISOString().slice(0, 10) : 'unknown';
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(exp);
    }
    const entries = Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
    return entries;
  })();

  const formatGroupDate = (dateKey) => {
    if (dateKey === 'unknown') return 'Unknown date';
    const d = new Date(dateKey + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  };

  const hasActiveFilters = filterCategory || filterMyExpenses;

  return (
    <section>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-h3 m-0">Expenses</h2>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancel' : 'Add expense'}
        </button>
      </div>
      {expenseList.length > 0 && (
        <div className="flex flex-nowrap items-center gap-2 sm:gap-3 mb-4 p-3 rounded-lg bg-base-300/50 border border-base-300 overflow-x-auto">
          <span className="flex items-center gap-1.5 text-sm font-medium text-text-secondary shrink-0">
            <Filter className="w-4 h-4" aria-hidden /> Filters
          </span>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="select select-bordered select-sm shrink-0 w-auto max-w-[160px]" aria-label="Filter by category">
            <option value="">All categories</option>
            {categoryList.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </select>
          <label className="flex items-center gap-2 cursor-pointer text-sm shrink-0 whitespace-nowrap">
            <input type="checkbox" checked={filterMyExpenses} onChange={(e) => setFilterMyExpenses(e.target.checked)} className="checkbox checkbox-sm checkbox-primary" />
            <span>My expenses</span>
          </label>
          {hasActiveFilters && (
            <button type="button" className="btn btn-ghost btn-sm text-sm shrink-0 whitespace-nowrap" onClick={() => { setFilterCategory(''); setFilterMyExpenses(false); }}>Clear filters</button>
          )}
        </div>
      )}
      {showForm && (
        <AddExpenseForm
          placeId={placeId}
          place={place}
          members={members}
          onSaved={() => { setShowForm(false); onRefresh(); }}
          onCancel={() => setShowForm(false)}
          currency={currency}
        />
      )}
      {expenseList.length === 0 ? (
        <p className="text-small text-text-secondary">No expenses yet. Add one to start tracking.</p>
      ) : filteredList.length === 0 ? (
        <p className="text-small text-text-secondary">No expenses match the current filters. Try changing or clearing them.</p>
      ) : (
        <>
          <ul className="list-none p-0 m-0">
            {groupedByAddedDate.map(([dateKey, expenses]) => (
              <li key={dateKey} className="mb-6">
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3 px-0" aria-hidden>
                  {formatGroupDate(dateKey)}
                </p>
                <ul className="list-none p-0 m-0 space-y-2">
                  {expenses.map((exp) => (
                    <li key={exp.id}>
                      <ExpenseCard
                        expense={exp}
                        placeId={placeId}
                        members={members}
                        currentUser={currentUser}
                        isOwner={isOwner}
                        onRefresh={onRefresh}
                        onEdit={setEditingExpense}
                        currency={currency}
                      />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {expenseTotalCount > expensePageSize && (
            <nav className="mt-6 flex flex-wrap items-center justify-center gap-2" aria-label="Expense list pagination">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={expensePage <= 1}
                onClick={() => onPageChange(expensePage - 1)}
                aria-label="Previous page"
              >
                Previous
              </button>
              <span className="text-sm text-text-secondary">
                Page {expensePage} of {Math.ceil(expenseTotalCount / expensePageSize) || 1}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={expensePage >= Math.ceil(expenseTotalCount / expensePageSize)}
                onClick={() => onPageChange(expensePage + 1)}
                aria-label="Next page"
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
      {editingExpense && (
        <EditExpenseForm
          placeId={placeId}
          members={members}
          expense={editingExpense}
          onSaved={() => { setEditingExpense(null); onRefresh(); }}
          onCancel={() => setEditingExpense(null)}
          currency={currency}
        />
      )}
    </section>
  );
}

function EditExpenseForm({ placeId, members, expense, onSaved, onCancel, currency }) {
  const sym = currency?.symbol ?? '$';
  const catId = expense?.category && (typeof expense?.category === 'object' ? expense.category.id : expense.category);
  const [amount, setAmount] = useState(() => (expense ? String(expense.amount ?? '') : ''));
  const [description, setDescription] = useState(() => expense?.description ?? '');
  const [date, setDate] = useState(() => expense?.date ?? new Date().toISOString().slice(0, 10));
  const [paidBy, setPaidBy] = useState(() => expense?.paid_by?.id ?? expense?.paid_by ?? '');
  const [categoryId, setCategoryId] = useState(() => (catId != null ? String(catId) : ''));
  const [splitUserIds, setSplitUserIds] = useState(() => {
    if (!expense?.splits?.length) return [];
    return expense.splits.map((s) => s.user?.id ?? s.user).filter(Boolean);
  });
  const [categoryList, setCategoryList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    categories(placeId).list().then(setCategoryList).catch(() => setCategoryList([]));
  }, [placeId]);
  useEffect(() => {
    if (expense?.splits?.length) {
      setSplitUserIds(expense.splits.map((s) => s.user?.id ?? s.user).filter(Boolean));
    }
  }, [expense?.id]);

  function toggleSplit(uid) {
    setSplitUserIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!expense?.id) return;
    setError('');
    setSaving(true);
    try {
      await expenses(placeId).update(expense.id, {
        amount: parseFloat(amount),
        description: description.trim(),
        date,
        paid_by: paidBy,
        category: categoryId || null,
        split_user_ids: splitUserIds,
      });
      onSaved();
    } catch (err) {
      setError(err.amount?.[0] || err.description?.[0] || err.message || 'Failed to update expense');
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "input input-bordered w-full min-h-[44px] text-base";
  const labelClass = "label py-1 first:pt-0";
  const labelTextClass = "label-text mt-4 first:mt-0 mb-1.5 text-sm font-medium opacity-80";

  if (!expense?.id) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-expense-title"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <form
        onSubmit={handleSubmit}
        className="card bg-base-200 border border-base-300 rounded-2xl p-4 sm:p-5 w-full max-w-md max-h-[85vh] overflow-y-auto shadow-xl text-base-content"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="edit-expense-title" className="text-h3 m-0 mb-4">Edit expense</h2>
        {error && <div role="alert" className="alert alert-error text-sm mb-2"><span>{error}</span></div>}
        <label htmlFor="edit-amount" className={labelClass}><span className={labelTextClass}>Amount *</span></label>
        <input id="edit-amount" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required className={inputClass} />
        <label htmlFor="edit-desc" className={labelClass}><span className={labelTextClass}>Description *</span></label>
        <input id="edit-desc" type="text" value={description} onChange={(e) => setDescription(e.target.value)} required className={inputClass} />
        <label htmlFor="edit-date" className={labelClass}><span className={labelTextClass}>Date</span></label>
        <input id="edit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        <label htmlFor="edit-paidby" className={labelClass}><span className={labelTextClass}>Paid by</span></label>
        <select id="edit-paidby" value={paidBy} onChange={(e) => setPaidBy(Number(e.target.value))} className="select select-bordered w-full min-h-[44px] text-base">
          {members.map((m) => <option key={m.id} value={m.user?.id}>{m.user?.display_name || m.user?.username}</option>)}
        </select>
        <label htmlFor="edit-category" className={labelClass}><span className={labelTextClass}>Category</span></label>
        <select id="edit-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="select select-bordered w-full min-h-[44px] text-base">
          <option value="">—</option>
          {categoryList.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
        <fieldset className="mt-4 mb-2 border-0 p-0">
          <legend className={labelTextClass}>Split between</legend>
          <div className="flex flex-nowrap gap-4 overflow-x-auto py-2 -mx-1">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-2 cursor-pointer shrink-0 whitespace-nowrap min-h-[44px] py-1">
                <input type="checkbox" checked={splitUserIds.includes(m.user?.id)} onChange={() => toggleSplit(m.user?.id)} className="checkbox checkbox-sm checkbox-primary" />
                <span>{m.user?.display_name || m.user?.username}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex gap-3 mt-6 pt-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary flex-1" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </div>
  );
}

function AddExpenseForm({ placeId, place, members, onSaved, onCancel, currency }) {
  const { user } = useAuth();
  const sym = currency?.symbol ?? '$';
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(today);
  const [paidBy, setPaidBy] = useState(user?.id || '');
  const [categoryId, setCategoryId] = useState('');
  const [splitUserIds, setSplitUserIds] = useState(members.map((m) => m.user?.id).filter(Boolean));
  const [categoryList, setCategoryList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);

  useEffect(() => {
    categories(placeId).list().then(setCategoryList).catch(() => setCategoryList([]));
  }, [placeId]);

  async function handleAddCategory(e) {
    e?.preventDefault?.();
    const name = newCategoryName.trim();
    if (!name) return;
    setCategoryError('');
    setAddingCategory(true);
    try {
      const created = await categories(placeId).create(name);
      if (created?.id != null) {
        setCategoryList((prev) => [...prev, created]);
        setCategoryId(String(created.id));
        setNewCategoryName('');
        setShowAddCategory(false);
      }
    } catch (err) {
      setCategoryError(err.name?.[0] || err.message || 'Failed to add category');
    } finally {
      setAddingCategory(false);
    }
  }

  function toggleSplit(uid) {
    setSplitUserIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  }

  function selectAllSplit() {
    setSplitUserIds(members.map((m) => m.user?.id).filter(Boolean));
  }
  function clearAllSplit() {
    setSplitUserIds([]);
  }

  const splitCount = splitUserIds.length;
  const amountNum = parseFloat(amount);
  const eachPays = splitCount > 0 && !Number.isNaN(amountNum) && amountNum >= 0 ? (amountNum / splitCount).toFixed(2) : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        amount: parseFloat(amount),
        description: description.trim(),
        date,
        paid_by: (paidBy && Number(paidBy)) ? Number(paidBy) : null,
        category: (categoryId && (Number(categoryId) || categoryId)) ? (Number(categoryId) || categoryId) : null,
        split_user_ids: splitUserIds.map((id) => Number(id)).filter((n) => !Number.isNaN(n) && n > 0),
      };
      await expenses(placeId).create(payload);
      onSaved();
    } catch (err) {
      const msg = err.amount?.[0] || err.description?.[0] || err.date?.[0] || err.category?.[0]
        || (typeof err.detail === 'string' ? err.detail : err.detail?.[0])
        || err.message || 'Failed to add expense';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "input input-bordered w-full min-h-[44px] text-base rounded-lg";
  const labelTextClass = "text-sm font-medium text-text-primary block mb-1.5";

  return (
    <form
      onSubmit={handleSubmit}
      className="card bg-base-200 border border-base-300 rounded-2xl p-5 sm:p-6 mb-6 max-w-full shadow-soft"
      aria-label="Add expense"
    >
      {error && (
        <div role="alert" className="alert alert-error text-sm mb-4 rounded-lg">
          <span>{error}</span>
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="exp-amount" className={labelTextClass}>Amount *</label>
        <div className="flex rounded-lg border border-base-300 bg-base-100 overflow-hidden focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary">
          <span className="flex items-center pl-4 text-text-secondary font-medium">{sym}</span>
          <input
            id="exp-amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="flex-1 min-w-0 border-0 bg-transparent py-3 px-2 text-base focus:outline-none"
            aria-required="true"
            inputMode="decimal"
            placeholder="0.00"
          />
        </div>
      </div>

      <div className="mb-4">
        <label htmlFor="exp-desc" className={labelTextClass}>Description *</label>
        <input
          id="exp-desc"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Electricity bill"
          required
          className={inputClass}
          aria-required="true"
          autoComplete="off"
        />
      </div>

      <div className="mb-4">
        <label htmlFor="exp-date" className={labelTextClass}>Date</label>
        <div className="relative">
          <input
            id="exp-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`${inputClass} pr-10`}
            aria-label="Expense date"
          />
          <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted pointer-events-none" aria-hidden />
        </div>
        <p className="text-xs text-text-muted mt-1">Defaults to today</p>
      </div>

      <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="exp-paidby" className={labelTextClass}>Paid by</label>
          <select
            id="exp-paidby"
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value === '' ? '' : Number(e.target.value))}
            className="select select-bordered w-full min-h-[44px] text-base rounded-lg"
            aria-label="Who paid this expense"
          >
            {members.map((m) => (
              <option key={m.id} value={m.user?.id ?? ''}>{m.user?.display_name || m.user?.username}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="exp-category" className={labelTextClass}>Category</label>
          <div className="flex gap-2 items-center">
            <select
              id="exp-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="select select-bordered flex-1 min-w-0 min-h-[44px] text-base rounded-lg"
              aria-label="Expense category"
            >
              <option value="">—</option>
              {categoryList.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => { setShowAddCategory((v) => !v); setCategoryError(''); }}
              className="btn btn-outline btn-square shrink-0 min-w-[44px] min-h-[44px] rounded-lg"
              title="Add category"
              aria-label="Add new category"
              aria-expanded={showAddCategory}
            >
              +
            </button>
          </div>
        </div>
      </div>
      {showAddCategory && (
        <>
          <div className="flex gap-2 mt-2 mb-4">
            <input
              type="text"
              placeholder="New category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCategory(e))}
              disabled={addingCategory}
              className="input input-bordered flex-1 min-h-[44px] text-base rounded-lg"
              autoFocus
              aria-label="New category name"
            />
            <button
              type="button"
              onClick={() => handleAddCategory()}
              disabled={addingCategory || !newCategoryName.trim()}
              className="btn btn-outline min-h-[44px] rounded-lg"
            >
              {addingCategory ? 'Adding…' : 'Add'}
            </button>
          </div>
          {categoryError && <div className="text-error text-sm mt-1 mb-4" role="alert">{categoryError}</div>}
        </>
      )}

      <hr className="border-0 border-t border-base-300 my-5" aria-hidden />

      <fieldset className="border-0 p-0 mb-0">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <legend className="text-sm font-medium text-text-primary m-0">Split between ({members.length} people)</legend>
          <div className="flex gap-3 text-sm">
            <button type="button" onClick={selectAllSplit} className="link link-primary link-hover">Select all</button>
            <button type="button" onClick={clearAllSplit} className="link link-primary link-hover">Clear all</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Select members to split expense with">
          {members.map((m) => {
            const uid = m.user?.id;
            const selected = uid != null && splitUserIds.includes(uid);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleSplit(uid)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${selected ? 'bg-primary text-primary-content' : 'bg-base-300 text-text-secondary hover:bg-base-300/80'}`}
                aria-pressed={selected}
                aria-label={`Split with ${m.user?.display_name || m.user?.username}`}
              >
                {selected && <Check className="w-4 h-4 shrink-0" aria-hidden />}
                <span>{m.user?.display_name || m.user?.username}</span>
              </button>
            );
          })}
        </div>
        {eachPays != null && (
          <>
            <hr className="border-0 border-t border-base-300 my-4" aria-hidden />
            <p className="text-sm text-text-secondary m-0">Each person pays: {sym}{eachPays}</p>
          </>
        )}
      </fieldset>

      <hr className="border-0 border-t border-base-300 my-5" aria-hidden />

      <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4">
        <button type="button" className="btn btn-ghost min-h-12 flex-1 order-2 sm:order-1" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary min-h-12 flex-1 order-1 sm:order-2 rounded-lg" disabled={saving}>
          {saving ? 'Adding…' : 'Add expense'}
        </button>
      </div>

      <hr className="border-0 border-t border-base-300 mt-5 mb-0" aria-hidden />
      <p className="text-xs text-text-muted text-center pt-4 mt-0 mb-0">You can edit this later</p>
    </form>
  );
}

function formatPeriodRange(fromIso, toIso) {
  if (!fromIso || !toIso) return '';
  const f = new Date(fromIso + 'T12:00:00');
  const t = new Date(toIso + 'T12:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fromStr = `${months[f.getMonth()]} ${f.getDate()}`;
  const toStr = `${months[t.getMonth()]} ${t.getDate()}`;
  return `${fromStr} - ${toStr}`;
}
function addDays(iso, days) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function subDays(iso, days) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function SummarySection({ data, period, setPeriod, summaryPeriodEnd, setSummaryPeriodEnd, members, currentUserId, currency }) {
  const sym = currency?.symbol ?? '$';
  const netBalance = (data.total_owed_to_me ?? 0) - (data.total_i_owe ?? 0);
  const periodLabel = period === 'fortnightly' ? 'Fortnight' : 'Week';
  const rangeStr = formatPeriodRange(data.from, data.to);
  const today = new Date().toISOString().slice(0, 10);
  const canGoNext = data.to && data.to < today;
  const periodDays = period === 'fortnightly' ? 14 : 7;

  const handlePrevPeriod = () => {
    if (!data.from) return;
    setSummaryPeriodEnd(subDays(data.from, 1));
  };
  const handleNextPeriod = () => {
    if (!data.to || !canGoNext) return;
    setSummaryPeriodEnd(addDays(data.to, periodDays));
  };
  const handleResetPeriod = () => setSummaryPeriodEnd(null);

  const myShare = data.my_expense ?? 0;
  const othersShare = data.others_expense ?? 0;
  const totalExpense = data.total_expense ?? 0;
  const sharePct = totalExpense > 0 ? Math.round((myShare / totalExpense) * 100) : 0;
  const pieData = [
    { name: "Your share", value: myShare, color: CHART_COLORS.primary },
    { name: "Others' share", value: othersShare, color: CHART_COLORS.othersShare },
  ].filter((d) => d.value > 0);
  const memberList = data.by_member_balance_list ?? [];
  const hasOverpay = (data.total_i_paid ?? 0) > myShare;
  const totalIPaid = data.total_i_paid ?? 0;
  const totalOwedToMe = data.total_owed_to_me ?? 0;
  const [contributionExpanded, setContributionExpanded] = useState(false);
  const whoOwesMe = memberList.filter((m) => m.balance < 0);

  return (
    <section
      className="rounded-2xl border border-base-300 p-5 sm:p-6 bg-gradient-to-br from-base-100 via-base-100 to-base-200/50 shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
    >
      <h2 className="text-lg font-semibold text-base-content m-0 mb-5">Financial summary</h2>

      {/* Three summary cards in one row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div
          className={`rounded-xl border p-4 shadow-[0_2px_10px_rgba(0,0,0,0.04)] ${
            netBalance >= 0
              ? 'border-primary/20 bg-gradient-to-br from-primary/10 via-primary/[0.07] to-primary/5'
              : 'border-error/20 bg-gradient-to-br from-error/10 via-error/[0.07] to-error/5'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${netBalance >= 0 ? 'bg-primary/15 text-primary' : 'bg-error/15 text-error'}`} aria-hidden>
              <Scale className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-medium text-base-content/70 m-0">Net balance</h3>
          </div>
          <p className={`text-2xl font-bold m-0 ${netBalance >= 0 ? 'text-primary' : 'text-error'}`}>
            {netBalance >= 0 ? '+' : ''}{sym}{netBalance.toFixed(2)}
          </p>
          <p className="text-sm text-base-content/60 m-0 mt-1">
            {netBalance > 0 ? 'You are owed more than you owe.' : netBalance < 0 ? 'You owe more than you are owed.' : 'You are settled.'}
          </p>
          {netBalance > 0 && (
            <p className="text-xs text-primary font-medium flex items-center gap-2 mt-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white shrink-0" aria-hidden>
                <Check className="w-3 h-3" strokeWidth={3} />
              </span>
              You're owed
            </p>
          )}
        </div>
        <div className="rounded-xl border border-base-300 p-4 bg-gradient-to-br from-base-100 to-base-200/80 shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary shrink-0" aria-hidden>
              <Wallet className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-medium text-base-content/70 m-0">Your contribution</h3>
          </div>
          <p className="text-2xl font-bold text-primary m-0">{sym}{totalIPaid.toFixed(2)}</p>
          {hasOverpay && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2">
              <span className="text-sm text-base-content/80">You paid {sym}{(totalIPaid - myShare).toFixed(2)} more than your share</span>
              <span className="text-sm font-semibold text-primary tabular-nums">+{sym}{(totalIPaid - myShare).toFixed(2)}</span>
            </div>
          )}
          <button
            type="button"
            className="mt-3 flex w-full items-center justify-between gap-2 rounded-lg py-2 text-left text-sm font-medium text-base-content/80 hover:bg-base-200/60 transition-colors"
            onClick={() => setContributionExpanded((e) => !e)}
            aria-expanded={contributionExpanded}
          >
            <span>{contributionExpanded ? 'Hide' : 'Show'} breakdown</span>
            {contributionExpanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
          </button>
          {contributionExpanded && (
            <div className="mt-2 space-y-0 border-t border-base-300 pt-3">
              <div className="flex items-start justify-between gap-3 py-3">
                <span className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary shrink-0" aria-hidden>
                    <Wallet className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-base-content">Paid in total</span>
                    <span className="block text-xs text-base-content/60">Total you paid this period</span>
                  </span>
                </span>
                <span className="text-sm font-medium text-base-content tabular-nums">{sym}{totalIPaid.toFixed(2)}</span>
              </div>
              <div className="border-t border-base-200" />
              <div className="flex items-center justify-between gap-3 py-3">
                <span className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary shrink-0" aria-hidden>
                    <CircleDollarSign className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium text-base-content">Your share in total</span>
                </span>
                <span className="text-sm font-medium text-base-content tabular-nums">{sym}{myShare.toFixed(2)}</span>
              </div>
              <div className="border-t border-base-200" />
              <div className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary shrink-0" aria-hidden>
                      <Clock className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-medium text-base-content">Pending owed to you</span>
                  </span>
                  <span className="text-sm font-semibold text-primary tabular-nums">{sym}{totalOwedToMe.toFixed(2)}</span>
                </div>
                {whoOwesMe.length > 0 && (
                  <ul className="ml-11 mt-2 list-none space-y-1 pl-0 text-xs text-base-content/60">
                    {whoOwesMe.map((m) => (
                      <li key={m.user_id}>
                        {(m.display_name || m.username)} owes {sym}{Math.abs(m.balance).toFixed(2)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="rounded-xl border border-base-300 p-4 bg-gradient-to-br from-base-100 to-base-200/80 shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary shrink-0" aria-hidden>
              <Users className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-medium text-base-content/70 m-0">Group total</h3>
          </div>
          <p className="text-2xl font-bold text-base-content m-0">{sym}{totalExpense.toFixed(2)}</p>
          <p className="text-sm text-base-content/60 m-0 mt-1">{rangeStr}</p>
        </div>
      </div>

      {/* Period selection: single row in light grey rounded container (reference) */}
      <div className="rounded-xl bg-base-200/80 border border-base-300 px-4 py-3 mb-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-base-content">Period</span>
          <select
            value={period}
            onChange={(e) => { setPeriod(e.target.value); setSummaryPeriodEnd(null); }}
            className="flex-1 min-w-0 max-w-[280px] rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-sm text-base-content focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none bg-no-repeat bg-[length:1rem_1rem] bg-[right_0.5rem_center] pr-9"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")` }}
            aria-label="Period"
          >
            <option value="weekly">Week ({rangeStr})</option>
            <option value="fortnightly">Fortnight ({rangeStr})</option>
          </select>
          <div className="flex items-center gap-0.5">
            <button type="button" className="btn btn-ghost btn-sm btn-square text-base-content/70 hover:text-base-content hover:bg-base-300/50" onClick={handlePrevPeriod} aria-label="Previous period">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" className="btn btn-ghost btn-sm btn-square text-base-content/70 hover:text-base-content hover:bg-base-300/50 disabled:opacity-40" disabled={!canGoNext} onClick={handleNextPeriod} aria-label="Next period">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="h-6 w-px bg-base-300 shrink-0" aria-hidden />
          <button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg border border-base-300 bg-base-100 text-base-content/70 hover:bg-base-200 hover:text-base-content" aria-label="Open calendar">
            <Calendar className="w-4 h-4" />
          </button>
          {summaryPeriodEnd && (
            <button type="button" className="btn btn-ghost btn-sm ml-1 text-primary" onClick={handleResetPeriod}>Current period</button>
          )}
        </div>
      </div>

      {/* Compared to last period: meaningful text + real percentage or amounts */}
      {data.from && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {(() => {
            const prevTotal = data.previous_total_expense ?? 0;
            const currTotal = data.total_expense ?? 0;
            const pct = data.spending_change_percent;
            const prevPeriodLabel = `${periodLabel} (${formatPeriodRange(subDays(data.from, periodDays), subDays(data.from, 1))})`;

            if (prevTotal > 0 && pct != null) {
              const isUp = pct > 0;
              const isDown = pct < 0;
              const copy = pct === 0 ? 'Same as last period' : isUp ? `${pct}% more than last period` : `${Math.abs(pct)}% less than last period`;
              return (
                <>
                  <span className="text-base-content/60" aria-hidden>
                    {isUp ? <TrendingUp className="w-4 h-4" /> : isDown ? <TrendingDown className="w-4 h-4" /> : null}
                  </span>
                  <span className="text-sm text-base-content">Compared to {prevPeriodLabel}:</span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${
                    isUp ? 'bg-success/15' : isDown ? 'bg-warning/15' : 'bg-base-300/50'
                  }`}>
                    <span className={`flex h-4 w-4 items-center justify-center rounded-full text-white shrink-0 ${
                      isUp ? 'bg-success' : isDown ? 'bg-warning' : 'bg-base-content/50'
                    }`} aria-hidden>
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                    <span className={`text-sm font-semibold ${
                      isUp ? 'text-success' : isDown ? 'text-warning' : 'text-base-content/80'
                    }`}>
                      {copy} ({sym}{prevTotal.toFixed(0)} → {sym}{currTotal.toFixed(0)})
                    </span>
                  </span>
                </>
              );
            }
            if (prevTotal === 0 && currTotal > 0) {
              return (
                <>
                  <span className="text-base-content/60" aria-hidden><TrendingUp className="w-4 h-4" /></span>
                  <span className="text-sm text-base-content">Compared to {prevPeriodLabel}:</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 bg-success/15">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-success text-white shrink-0" aria-hidden>
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                    <span className="text-sm font-semibold text-success">
                      Up from no spending last period ({sym}{currTotal.toFixed(2)} this period)
                    </span>
                  </span>
                </>
              );
            }
            if (prevTotal === 0 && currTotal === 0) {
              return (
                <>
                  <span className="text-sm text-base-content">Compared to {prevPeriodLabel}:</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 bg-base-300/50">
                    <span className="text-sm font-semibold text-base-content/80">No spending in either period</span>
                  </span>
                </>
              );
            }
            return (
              <>
                <span className="text-sm text-base-content">Compared to last period:</span>
                <span className="text-sm text-base-content/60">No comparison available</span>
              </>
            );
          })()}
        </div>
      )}

      {/* Two-column layout: Left = Share split + Expense breakdown list; Right = Paid vs share + Member balances */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="flex flex-col gap-6">
          {/* Card 1: Expense Breakdown – Share split */}
          <div className="rounded-xl border border-base-300 p-4 bg-gradient-to-br from-base-100 to-base-200/80 shadow-[0_2px_10px_rgba(0,0,0,0.04)] outline-none">
            <h3 className="text-base font-semibold text-base-content m-0 mb-3">Expense breakdown</h3>
            <h4 className="text-sm font-medium text-base-content/70 m-0 mb-3">Share split</h4>
            {pieData.length > 0 ? (
              <div className="flex flex-row items-center gap-4">
                <div className="relative w-[200px] h-[200px] shrink-0 outline-none border-0 shadow-none [&_.recharts-responsive-container]:outline-none [&_.recharts-responsive-container]:border-0 [&_.recharts-responsive-container]:shadow-none">
                  <ResponsiveContainer width="100%" height="100%" style={{ outline: 'none', border: 'none', boxShadow: 'none' }}>
                    <PieChart style={{ outline: 'none', border: 'none', boxShadow: 'none' }}>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={56}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                      >
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-center">
                      <span className="block text-primary font-semibold text-lg">Your share</span>
                      <span className="block text-primary font-semibold text-xl">{sharePct}%</span>
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="w-3 h-3 rounded-full bg-primary shrink-0" aria-hidden />
                    <span className="text-base-content/80">{sym}{myShare.toFixed(2)}</span>
                    <span className="text-base-content/60">Your share</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="w-3 h-3 rounded-full bg-base-content/30 shrink-0" aria-hidden />
                    <span className="text-base-content/80">{sym}{othersShare.toFixed(2)}</span>
                    <span className="text-base-content/60">Others' share</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-base-content/50">No expenses in this period</p>
            )}
          </div>

          {/* Card 2: Expense Breakdown – member list with chips, avatars, separators */}
          {memberList.length > 0 && (
            <div className="rounded-xl border border-base-300 p-4 bg-gradient-to-br from-base-100 to-base-200/80 shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
              <h3 className="text-base font-semibold text-base-content m-0 mb-3">Expense breakdown</h3>
              <ul className="list-none p-0 m-0">
                {/* Your share row – chip with teal check + amount */}
                <li className="flex items-center justify-between gap-3 py-3 border-b border-base-300 first:pt-0">
                  <span className="inline-flex items-center gap-2 rounded-full border border-base-300 bg-base-200 px-3 py-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white shrink-0" aria-hidden>
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span className="text-sm font-medium text-base-content">Your share</span>
                  </span>
                  <span className={`text-sm font-semibold tabular-nums ${netBalance >= 0 ? 'text-primary' : 'text-warning'}`}>
                    {netBalance >= 0 ? '+' : ''}{sym}{netBalance.toFixed(2)}
                  </span>
                </li>
                {memberList.map((m, index) => {
                  const owesMe = m.balance < 0;
                  const absBal = Math.abs(m.balance);
                  const isLast = index === memberList.length - 1;
                  return (
                    <li
                      key={m.user_id}
                      className={`flex items-center justify-between gap-3 py-3 ${!isLast ? 'border-b border-base-300' : ''}`}
                    >
                      <span className="flex min-w-0 flex-1 items-start gap-3">
                        <span className="relative shrink-0">
                          <Avatar username={m.display_name || m.username} />
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-base-100 text-white ${
                              owesMe ? 'bg-primary' : 'bg-base-content/60'
                            }`}
                            aria-hidden
                          >
                            <Check className="h-2.5 w-2.5" strokeWidth={3} />
                          </span>
                        </span>
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="text-sm font-medium text-base-content">{m.display_name || m.username}</span>
                          <span
                            className={`inline-flex w-fit rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                              owesMe
                                ? 'border-primary/30 bg-primary/10 text-primary'
                                : 'border-warning/40 bg-warning/15 text-warning'
                            }`}
                          >
                            {owesMe ? 'Owes you' : 'You owe'}
                          </span>
                        </span>
                      </span>
                      <span className={`shrink-0 text-sm font-semibold tabular-nums ${owesMe ? 'text-primary' : 'text-warning'}`}>
                        {owesMe ? '+' : '-'}{sym}{absBal.toFixed(2)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          {/* Card 1: Paid vs share */}
          <div className="rounded-xl border border-base-300 p-4 bg-gradient-to-br from-base-100 to-base-200/80 shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
            <h3 className="text-base font-semibold text-base-content m-0 mb-3">Paid vs share</h3>
            {totalExpense > 0 ? (
              <>
                <div className="h-[200px] w-full outline-none">
                  <ResponsiveContainer width="100%" height="100%" style={{ outline: 'none' }}>
                    <BarChart data={[{ name: 'You', paid: totalIPaid, share: myShare }]} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} style={{ outline: 'none' }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => sym + v} />
                      <Tooltip formatter={(v) => [sym + Number(v).toFixed(2), '']} />
                      <Bar dataKey="paid" name={`You ${sym}${totalIPaid.toFixed(0)}`} fill={CHART_COLORS.primaryLight} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="share" name={`Your share ${sym}${myShare.toFixed(2)}`} fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-sm text-base-content/60 mt-2">
                  {hasOverpay ? 'You covered more than your share this period.' : 'You paid your share or less this period.'}
                </p>
              </>
            ) : (
              <p className="text-sm text-base-content/50">No expenses in this period</p>
            )}
          </div>

          {/* Card 2: Member balances */}
          {memberList.length > 0 && (
            <div className="rounded-xl border border-base-300 p-4 bg-gradient-to-br from-base-100 to-base-200/80 shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
              <h3 className="text-base font-semibold text-base-content m-0 mb-3">Member balances</h3>
              <ul className="list-none p-0 m-0 space-y-4">
                {memberList.map((m) => {
                  const owesMe = m.balance < 0;
                  const absBal = Math.abs(m.balance);
                  return (
                    <li key={m.user_id} className="flex items-center justify-between gap-3 flex-wrap">
                      <span className="flex items-center gap-2">
                        <Avatar username={m.display_name || m.username} />
                        <span className="font-medium text-base-content">{m.display_name || m.username}</span>
                      </span>
                      <span className="font-medium text-base-content">{sym}{absBal.toFixed(2)}</span>
                      <button
                        type="button"
                        className={`btn btn-sm ${owesMe ? 'btn-primary' : 'btn-ghost bg-base-300/60'}`}
                      >
                        {owesMe ? 'Request payment' : 'Mark as paid'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function InviteSection({ placeId, placeName, inviteEmail, setInviteEmail, inviteList, onRefresh }) {
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [lastJoinLink, setLastJoinLink] = useState('');
  const [copied, setCopied] = useState(false);

  async function handleInviteByEmail(e) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setError('');
    setSending(true);
    setLastJoinLink('');
    try {
      const inv = await invites(placeId).create(inviteEmail.trim());
      setInviteEmail('');
      onRefresh();
      if (inv?.token) setLastJoinLink(`${window.location.origin}/join/${inv.token}`);
    } catch (err) {
      setError(err.email?.[0] || err.message || 'Failed to send invite');
    } finally {
      setSending(false);
    }
  }

  async function handleGenerateLink() {
    setError('');
    setGenerating(true);
    try {
      const inv = await invites(placeId).create('');
      onRefresh();
      if (inv?.token) setLastJoinLink(`${window.location.origin}/join/${inv.token}`);
    } catch (err) {
      setError(err.message || 'Failed to generate link');
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopyLink() {
    let link = lastJoinLink;
    if (!link) {
      setGenerating(true);
      try {
        const inv = await invites(placeId).create('');
        onRefresh();
        if (inv?.token) {
          link = `${window.location.origin}/join/${inv.token}`;
          setLastJoinLink(link);
        }
      } catch (err) {
        setError(err.message || 'Failed to generate link');
        setGenerating(false);
        return;
      }
      setGenerating(false);
    }
    if (link && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleShare() {
    let link = lastJoinLink;
    if (!link) {
      setGenerating(true);
      try {
        const inv = await invites(placeId).create('');
        onRefresh();
        if (inv?.token) {
          link = `${window.location.origin}/join/${inv.token}`;
          setLastJoinLink(link);
        }
      } catch (err) {
        setError(err.message || 'Failed to generate link');
        setGenerating(false);
        return;
      }
      setGenerating(false);
    }
    if (!link) return;
    const title = 'Join our place on Equilo';
    const text = `You're invited to join ${placeName || 'our place'} on Equilo. Use this link to join:`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: link });
      } catch (err) {
        if (err.name !== 'AbortError') {
          await navigator.clipboard?.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      }
    } else {
      await navigator.clipboard?.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <section className="card bg-base-200 border border-base-300 rounded-xl p-5 mb-6">
      <h2 className="text-lg font-semibold m-0 mb-2">Invite members</h2>
      <p className="opacity-80 text-sm mb-4">Invite by email or share an invite link. Anyone with the link can join this place.</p>

      {/* Invite by email */}
      <div className="mb-5">
        <h3 className="text-sm font-medium opacity-80 m-0 mb-2">Invite by email</h3>
        <form onSubmit={handleInviteByEmail} className="flex gap-2">
          <input
            type="email"
            placeholder="Enter email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            disabled={sending}
            className="input input-bordered flex-1"
          />
          <button
            type="submit"
            disabled={sending || !inviteEmail.trim()}
            className="btn btn-primary"
          >
            {sending ? 'Sending…' : 'Send invite'}
          </button>
        </form>
      </div>

      {/* Share invite link */}
      <div className="mb-5">
        <h3 className="text-sm font-medium opacity-80 m-0 mb-2">Share invite link</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            disabled={generating}
            className="btn btn-outline btn-sm"
          >
            {copied ? '✓ Copied!' : 'Copy link'}
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={generating}
            className="btn btn-outline btn-sm"
          >
            Share…
          </button>
          <button
            type="button"
            onClick={handleGenerateLink}
            disabled={generating}
            className="btn btn-outline btn-sm"
          >
            {generating ? 'Generating…' : 'Generate new link'}
          </button>
        </div>
        {lastJoinLink && (
          <div className="mt-3 p-3 bg-base-100 rounded-lg">
            <p className="m-0 text-xs opacity-70 mb-1">Current invite link:</p>
            <code className="block break-all text-sm">{lastJoinLink}</code>
          </div>
        )}
      </div>

      {error && <div className="alert alert-error text-sm mb-3">{error}</div>}

      {inviteList.length > 0 && (
        <div>
          <h3 className="text-base font-semibold m-0 mb-2">Pending invites</h3>
          <ul className="list-none p-0 m-0 text-sm opacity-80">
            {inviteList.map((inv) => (
              <li key={inv.id}>{inv.email || '(link invite)'} – {inv.status}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
