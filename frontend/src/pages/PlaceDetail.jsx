import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { places as placesApi, expenses, categories, summary, invites, placeMembers } from '../api';
import { Trash2, Pencil } from 'lucide-react';

const CURRENCY_SYMBOL = '$';

export default function PlaceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [place, setPlace] = useState(null);
  const [expenseList, setExpenseList] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [period, setPeriod] = useState('weekly');
  const [tab, setTab] = useState('expenses');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteList, setInviteList] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const isOwner = place?.members?.some((m) => m.user?.id === user?.id && m.role === 'owner');

  function load() {
    if (!id) return;
    setLoading(true);
    Promise.all([
      placesApi.get(id),
      expenses(id).list(),
      summary(id, period),
      placeMembers(id).list(),
    ])
      .then(([p, ex, sum, mem]) => {
        setPlace(p);
        setExpenseList(ex);
        setSummaryData(sum);
        setMembers(mem);
      })
      .catch(() => setPlace(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => load(), [id]);
  useEffect(() => {
    if (id && place) {
      summary(id, period).then(setSummaryData).catch(() => {});
    }
  }, [id, period, place]);

  useEffect(() => {
    if (!id || !place) return;
    const interval = setInterval(() => {
      expenses(id).list().then(setExpenseList).catch(() => {});
      summary(id, period).then(setSummaryData).catch(() => {});
      placeMembers(id).list().then(setMembers).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [id, place, period]);

  useEffect(() => {
    if (tab === 'invite' && id) {
      invites(id).list().then(setInviteList).catch(() => setInviteList([]));
    }
  }, [tab, id]);

  if (loading && !place) return <div className="pb-8"><p>Loading…</p></div>;
  if (!place) return <div className="pb-8"><p>Place not found.</p><Link to="/" className="link link-hover text-sm opacity-80">Back to places</Link></div>;

  return (
    <div className="pb-8">
      <header className="flex items-center justify-between gap-4 mb-6">
        <Link to="/" className="link link-hover text-sm opacity-80">← Places</Link>
        <h1 className="text-xl font-semibold m-0">{place.name}</h1>
      </header>

      <nav className="flex gap-1 mb-6">
        <button
          type="button"
          className={`btn btn-sm ${tab === 'expenses' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('expenses')}
        >
          Expenses
        </button>
        <button
          type="button"
          className={`btn btn-sm ${tab === 'summary' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('summary')}
        >
          Summary
        </button>
        {isOwner && (
          <button
            type="button"
            className={`btn btn-sm ${tab === 'invite' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab('invite')}
          >
            Invite
          </button>
        )}
      </nav>

      {tab === 'expenses' && (
        <ExpensesSection placeId={id} place={place} expenseList={expenseList} members={members} onRefresh={load} currentUser={user} isOwner={isOwner} />
      )}
      {tab === 'summary' && summaryData && (
        <SummarySection data={summaryData} period={period} setPeriod={setPeriod} members={members} currentUserId={user?.id} />
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

function ExpenseCard({ expense, placeId, members, currentUser, isOwner, onRefresh, onEdit }) {
  // Edit/delete only for place owner (admin) or the person who added this expense
  const canEdit = isOwner || (expense.added_by?.id === currentUser?.id);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const touchStartX = useRef(0);

  const amountStr = `${CURRENCY_SYMBOL}${Number(expense.amount).toFixed(2)}`;

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleTouchMove(e) {
    if (!canEdit) return;
    const dx = touchStartX.current - e.touches[0].clientX;
    setSwipeOffset(Math.max(0, Math.min(dx, 80)));
  }
  function handleTouchEnd() {
    if (swipeOffset > 50) setSwipeOffset(80);
    else setSwipeOffset(0);
  }

  async function handleDelete() {
    if (!canEdit) return;
    setDeleting(true);
    try {
      await expenses(placeId).delete(expense.id);
      setDetailOpen(false);
      onRefresh();
    } catch (err) {
      // ignore or toast
    } finally {
      setDeleting(false);
    }
  }

  return (
    <li className="list-none mb-2">
      <div className="overflow-hidden rounded-xl border border-base-300 bg-base-200">
        <div
          className="relative overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ touchAction: 'pan-y' }}
        >
          {/* Swipe-revealed delete: behind the card on the right */}
          {canEdit && (
            <div className="absolute right-0 top-0 bottom-0 w-20 flex items-center justify-center bg-error/90 z-0">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                disabled={deleting}
                className="btn btn-ghost btn-sm text-error-content"
                aria-label="Delete expense"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          )}
          <div
            className="relative z-10 min-w-0 transition-transform duration-200 ease-out cursor-pointer select-none bg-base-200"
            style={{ transform: `translateX(-${swipeOffset}px)` }}
            onClick={() => setDetailOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && setDetailOpen(true)}
            aria-label={`View details for ${expense.description}, ${amountStr}`}
          >
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{expense.description}</div>
                <div className="text-small text-text-secondary mt-0.5">
                  {expense.category?.name && `${expense.category.name} · `}{expense.date}
                  {expense.paid_by?.username && ` · paid by ${expense.paid_by.username}`}
                  {expense.splits?.length > 0 && ` · split ${expense.splits.length} ways`}
                </div>
              </div>
              <div className="font-semibold shrink-0">{amountStr}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Detail modal (sheet) - fixed so it portals visually to viewport */}
      {detailOpen && (
        <div
          className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/50"
          onClick={() => setDetailOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="expense-detail-title"
        >
          <div
            className="bg-base-200 border border-base-300 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <h3 id="expense-detail-title" className="text-h3 m-0 mb-1">{expense.description}</h3>
              <p className="text-2xl font-semibold text-primary mt-0 mb-4">{amountStr}</p>

              <div className="space-y-4 text-small">
                <div className="flex items-center gap-3">
                  <Avatar username={expense.paid_by?.username} />
                  <div>
                    <span className="text-text-muted">Paid by</span>
                    <p className="font-medium m-0">{expense.paid_by?.username ?? '—'}</p>
                  </div>
                </div>
                <div>
                  <span className="text-text-muted">Date</span>
                  <p className="font-medium m-0">{expense.date}</p>
                </div>
                {expense.category?.name && (
                  <div>
                    <span className="text-text-muted">Category</span>
                    <p className="font-medium m-0">{expense.category.name}</p>
                  </div>
                )}
                {expense.splits?.length > 0 && (
                  <div>
                    <span className="text-text-muted">Split between</span>
                    <ul className="list-none p-0 m-0 mt-1 flex flex-wrap gap-2">
                      {expense.splits.map((s) => (
                        <li key={s.user?.id ?? s.id} className="flex items-center gap-2">
                          <Avatar username={s.user?.username} className="!w-6 !h-6 text-xs" />
                          <span>{s.user?.username}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {canEdit && (
                <div className="flex gap-2 mt-6 pt-4 border-t border-base-300">
                  <button
                    type="button"
                    className="btn btn-outline flex-1"
                    onClick={() => { setDetailOpen(false); onEdit?.(expense); }}
                  >
                    <Pencil className="w-4 h-4 mr-1 inline" aria-hidden /> Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-error flex-1"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    <Trash2 className="w-4 h-4 mr-1 inline" aria-hidden /> {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              )}
              <button type="button" className="btn btn-ghost btn-block mt-2" onClick={() => setDetailOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function ExpensesSection({ placeId, place, expenseList, members, onRefresh, currentUser, isOwner }) {
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);

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
      {showForm && (
        <AddExpenseForm
          placeId={placeId}
          place={place}
          members={members}
          onSaved={() => { setShowForm(false); onRefresh(); }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {expenseList.length === 0 ? (
        <p className="text-small text-text-secondary">No expenses yet. Add one to start tracking.</p>
      ) : (
        <ul className="list-none p-0 m-0">
          {expenseList.map((exp) => (
            <ExpenseCard
              key={exp.id}
              expense={exp}
              placeId={placeId}
              members={members}
              currentUser={currentUser}
              isOwner={isOwner}
              onRefresh={onRefresh}
              onEdit={setEditingExpense}
            />
          ))}
        </ul>
      )}
      {editingExpense && (
        <EditExpenseForm
          placeId={placeId}
          members={members}
          expense={editingExpense}
          onSaved={() => { setEditingExpense(null); onRefresh(); }}
          onCancel={() => setEditingExpense(null)}
        />
      )}
    </section>
  );
}

function EditExpenseForm({ placeId, members, expense, onSaved, onCancel }) {
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
          {members.map((m) => <option key={m.id} value={m.user?.id}>{m.user?.username}</option>)}
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
                <span>{m.user?.username}</span>
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

function AddExpenseForm({ placeId, place, members, onSaved, onCancel }) {
  const { user } = useAuth();
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

  useEffect(() => {
    setSplitUserIds(members.map((m) => m.user?.id).filter(Boolean));
  }, [members]);

  function toggleSplit(uid) {
    setSplitUserIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await expenses(placeId).create({
        amount: parseFloat(amount),
        description: description.trim(),
        date,
        paid_by: paidBy,
        category: categoryId || null,
        split_user_ids: splitUserIds,
      });
      onSaved();
    } catch (err) {
      setError(err.amount?.[0] || err.description?.[0] || err.message || 'Failed to add expense');
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "input input-bordered w-full min-h-[44px] text-base";
  const labelClass = "label py-1 first:pt-0";
  const labelTextClass = "label-text mt-4 first:mt-0 mb-1.5 text-sm font-medium opacity-80";

  return (
    <form
      onSubmit={handleSubmit}
      className="card bg-base-200 border border-base-300 rounded-2xl p-4 sm:p-5 mb-6 max-w-full"
      aria-label="Add expense"
    >
      {error && (
        <div role="alert" className="alert alert-error text-sm mb-2">
          <span>{error}</span>
        </div>
      )}

      <label htmlFor="exp-amount" className={labelClass}>
        <span className={labelTextClass}>Amount *</span>
      </label>
      <input
        id="exp-amount"
        type="number"
        step="0.01"
        min="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        required
        className={inputClass}
        aria-required="true"
        inputMode="decimal"
      />

      <label htmlFor="exp-desc" className={labelClass}>
        <span className={labelTextClass}>Description *</span>
      </label>
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

      <label htmlFor="exp-date" className={labelClass}>
        <span className={labelTextClass}>Date</span>
      </label>
      <input
        id="exp-date"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className={inputClass}
        aria-label="Expense date"
      />

      <label htmlFor="exp-paidby" className={labelClass}>
        <span className={labelTextClass}>Paid by</span>
      </label>
      <select
        id="exp-paidby"
        value={paidBy}
        onChange={(e) => setPaidBy(Number(e.target.value))}
        className="select select-bordered w-full min-h-[44px] text-base"
        aria-label="Who paid this expense"
      >
        {members.map((m) => (
          <option key={m.id} value={m.user?.id}>{m.user?.username}</option>
        ))}
      </select>

      <label htmlFor="exp-category" className={labelClass}>
        <span className={labelTextClass}>Category</span>
      </label>
      <div className="flex gap-2 items-center">
        <select
          id="exp-category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="select select-bordered flex-1 min-w-0 min-h-[44px] text-base"
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
          className="btn btn-outline btn-square shrink-0 min-w-[44px] min-h-[44px]"
          title="Add category"
          aria-label="Add new category"
          aria-expanded={showAddCategory}
        >
          +
        </button>
      </div>
      {showAddCategory && (
        <>
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              placeholder="New category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCategory(e))}
              disabled={addingCategory}
              className="input input-bordered flex-1 min-h-[44px] text-base"
              autoFocus
              aria-label="New category name"
            />
            <button
              type="button"
              onClick={() => handleAddCategory()}
              disabled={addingCategory || !newCategoryName.trim()}
              className="btn btn-outline min-h-[44px]"
            >
              {addingCategory ? 'Adding…' : 'Add'}
            </button>
          </div>
          {categoryError && <div className="text-error text-sm mt-1" role="alert">{categoryError}</div>}
        </>
      )}

      <fieldset className="mt-4 mb-2 border-0 p-0">
        <legend className={labelTextClass}>Split between</legend>
        <div
          className="flex flex-nowrap gap-4 overflow-x-auto overflow-y-hidden py-2 -mx-1"
          role="group"
          aria-label="Select members to split expense with"
        >
          {members.map((m) => (
            <label
              key={m.id}
              className="flex items-center gap-2 cursor-pointer m-0 shrink-0 whitespace-nowrap min-h-[44px] py-1"
            >
              <input
                type="checkbox"
                checked={splitUserIds.includes(m.user?.id)}
                onChange={() => toggleSplit(m.user?.id)}
                className="checkbox checkbox-sm checkbox-primary"
                aria-label={`Split with ${m.user?.username}`}
              />
              <span>{m.user?.username}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6 pt-2">
        <button type="button" className="btn btn-ghost min-h-12 order-2 sm:order-1" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary min-h-12 order-1 sm:order-2" disabled={saving}>
          {saving ? 'Adding…' : 'Add expense'}
        </button>
      </div>
    </form>
  );
}

function SummarySection({ data, period, setPeriod, members }) {
  const memberMap = Object.fromEntries((members || []).map((m) => [String(m.user?.id), m.user?.username]));

  return (
    <section className="card bg-base-200 border border-base-300 rounded-xl p-5 mb-6">
      <h2 className="text-lg font-semibold m-0 mb-3">Financial summary</h2>
      <div className="mb-4">
        <label className="inline">Period:</label>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="select select-bordered select-sm ml-2"
        >
          <option value="weekly">Weekly</option>
          <option value="fortnightly">Fortnightly</option>
        </select>
        <span className="opacity-70 text-sm ml-2"> {data.from} – {data.to}</span>
      </div>
      <ul className="list-none p-0 m-0">
        <li className="flex justify-between py-2 border-b border-base-300"><strong>Total expense</strong> <span>{CURRENCY_SYMBOL}{data.total_expense?.toFixed(2)}</span></li>
        <li className="flex justify-between py-2 border-b border-base-300"><strong>My share</strong> <span>{CURRENCY_SYMBOL}{data.my_expense?.toFixed(2)}</span></li>
        <li className="flex justify-between py-2 border-b border-base-300"><strong>Others' share</strong> <span>{CURRENCY_SYMBOL}{data.others_expense?.toFixed(2)}</span></li>
        <li className="flex justify-between py-2 border-b border-base-300"><strong>Total I paid</strong> <span>{CURRENCY_SYMBOL}{data.total_i_paid?.toFixed(2)}</span></li>
        <li className="flex justify-between py-2 border-b border-base-300"><strong>Total I owe</strong> <span className={data.total_i_owe > 0 ? 'text-owe' : ''}>{CURRENCY_SYMBOL}{data.total_i_owe?.toFixed(2)}</span></li>
        <li className="flex justify-between py-2 border-b border-base-300"><strong>Total owed to me</strong> <span className={data.total_owed_to_me > 0 ? 'text-owed' : ''}>{CURRENCY_SYMBOL}{data.total_owed_to_me?.toFixed(2)}</span></li>
      </ul>
      {data.by_member_balance && Object.keys(data.by_member_balance).length > 0 && (
        <div className="mt-6 pt-4 border-t border-base-300">
          <h3 className="text-base font-semibold m-0 mb-2">Balance with members</h3>
          <ul className="list-none p-0 m-0 text-sm opacity-80">
            {Object.entries(data.by_member_balance).map(([uid, bal]) => (
              <li key={uid}>
                {memberMap[uid] || uid}: {bal > 0 ? 'they owe you' : 'you owe them'} {CURRENCY_SYMBOL}{Math.abs(bal).toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      )}
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
