import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { places as placesApi, expenses, categories, summary, invites, placeMembers } from '../api';

export default function PlaceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [place, setPlace] = useState(null);
  const [expenseList, setExpenseList] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [period, setPeriod] = useState('weekly');
  const [tab, setTab] = useState('expenses'); // expenses | summary | invite
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteList, setInviteList] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  // Poll expenses and summary so other users see new bills without refreshing
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

  if (loading && !place) return <div className="page"><p>Loading…</p></div>;
  if (!place) return <div className="page"><p>Place not found.</p><Link to="/">Back to places</Link></div>;

  return (
    <div className="page">
      <header className="header">
        <Link to="/" className="back">← Places</Link>
        <h1>{place.name}</h1>
      </header>

      <nav className="tabs">
        <button type="button" className={tab === 'expenses' ? 'active' : ''} onClick={() => setTab('expenses')}>Expenses</button>
        <button type="button" className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>Summary</button>
        {isOwner && <button type="button" className={tab === 'invite' ? 'active' : ''} onClick={() => setTab('invite')}>Invite</button>}
      </nav>

      {tab === 'expenses' && (
        <ExpensesSection placeId={id} place={place} expenseList={expenseList} members={members} onRefresh={load} />
      )}
      {tab === 'summary' && summaryData && (
        <SummarySection data={summaryData} period={period} setPeriod={setPeriod} members={members} currentUserId={user?.id} />
      )}
      {tab === 'invite' && isOwner && (
        <InviteSection placeId={id} inviteEmail={inviteEmail} setInviteEmail={setInviteEmail} inviteList={inviteList} onRefresh={() => invites(id).list().then(setInviteList)} />
      )}
    </div>
  );
}

function ExpensesSection({ placeId, place, expenseList, members, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  return (
    <section>
      <div className="section-header">
        <h2>Expenses</h2>
        <button type="button" className="btn primary" onClick={() => setShowForm(!showForm)}>
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
        <p className="muted">No expenses yet. Add one to start tracking.</p>
      ) : (
        <ul className="list">
          {expenseList.map((exp) => (
            <li key={exp.id} className="list-item expense-item">
              <div>
                <strong>{exp.description}</strong>
                <span className="muted"> {exp.category?.name && ` · ${exp.category.name}`} · {exp.date}</span>
              </div>
              <div>
                <span className="amount">{Number(exp.amount).toFixed(2)}</span>
                <span className="muted"> paid by {exp.paid_by?.username}</span>
                {exp.splits?.length > 0 && <span className="muted"> · split {exp.splits.length} ways</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
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

  useEffect(() => {
    categories(placeId).list().then(setCategoryList).catch(() => setCategoryList([]));
  }, [placeId]);

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

  return (
    <form onSubmit={handleSubmit} className="card form">
      {error && <div className="error">{error}</div>}
      <label>Amount *</label>
      <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      <label>Description *</label>
      <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Electricity bill" required />
      <label>Date</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <label>Paid by</label>
      <select value={paidBy} onChange={(e) => setPaidBy(Number(e.target.value))}>
        {members.map((m) => (
          <option key={m.id} value={m.user?.id}>{m.user?.username}</option>
        ))}
      </select>
      <label>Category</label>
      <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        <option value="">—</option>
        {categoryList.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <label>Split between</label>
      <div className="checkbox-group">
        {members.map((m) => (
          <label key={m.id} className="checkbox-label">
            <input
              type="checkbox"
              checked={splitUserIds.includes(m.user?.id)}
              onChange={() => toggleSplit(m.user?.id)}
            />
            {m.user?.username}
          </label>
        ))}
      </div>
      <div className="form-actions">
        <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn primary" disabled={saving}>Add expense</button>
      </div>
    </form>
  );
}

function SummarySection({ data, period, setPeriod, members, currentUserId }) {
  const memberMap = Object.fromEntries((members || []).map((m) => [String(m.user?.id), m.user?.username]));

  return (
    <section className="card">
      <h2>Financial summary</h2>
      <div className="period-select">
        <label>Period:</label>
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="weekly">Weekly</option>
          <option value="fortnightly">Fortnightly</option>
        </select>
        <span className="muted"> {data.from} – {data.to}</span>
      </div>
      <ul className="summary-list">
        <li><strong>Total expense</strong> <span>{data.total_expense?.toFixed(2)}</span></li>
        <li><strong>My share</strong> <span>{data.my_expense?.toFixed(2)}</span></li>
        <li><strong>Others' share</strong> <span>{data.others_expense?.toFixed(2)}</span></li>
        <li><strong>Total I paid</strong> <span>{data.total_i_paid?.toFixed(2)}</span></li>
        <li><strong>Total I owe</strong> <span className={data.total_i_owe > 0 ? 'owe' : ''}>{data.total_i_owe?.toFixed(2)}</span></li>
        <li><strong>Total owed to me</strong> <span className={data.total_owed_to_me > 0 ? 'owed' : ''}>{data.total_owed_to_me?.toFixed(2)}</span></li>
      </ul>
      {data.by_member_balance && Object.keys(data.by_member_balance).length > 0 && (
        <div className="balance-breakdown">
          <h3>Balance with members</h3>
          <ul>
            {Object.entries(data.by_member_balance).map(([uid, bal]) => (
              <li key={uid}>
                {memberMap[uid] || uid}: {bal > 0 ? 'they owe you' : 'you owe them'} {Math.abs(bal).toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function InviteSection({ placeId, inviteEmail, setInviteEmail, inviteList, onRefresh }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [lastJoinLink, setLastJoinLink] = useState('');

  async function handleInvite(e) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setError('');
    setSending(true);
    setLastJoinLink('');
    try {
      const inv = await invites(placeId).create(inviteEmail.trim());
      setInviteEmail('');
      onRefresh();
      if (inv.token) setLastJoinLink(`${window.location.origin}/join/${inv.token}`);
    } catch (err) {
      setError(err.email?.[0] || err.message || 'Failed to send invite');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="card">
      <h2>Invite members</h2>
      <p className="muted">Send an invite by email. Share the join link so they can join this place.</p>
      <form onSubmit={handleInvite} className="form-inline">
        <input
          type="email"
          placeholder="Email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          disabled={sending}
        />
        <button type="submit" disabled={sending || !inviteEmail.trim()}>Send invite</button>
      </form>
      {error && <div className="error">{error}</div>}
      {lastJoinLink && (
        <div className="invite-link-box">
          <p><strong>Share this link:</strong></p>
          <code className="join-link">{lastJoinLink}</code>
        </div>
      )}
      {inviteList.length > 0 && (
        <div>
          <h3>Pending invites</h3>
          <ul>
            {inviteList.map((inv) => (
              <li key={inv.id}>{inv.email} – {inv.status}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
