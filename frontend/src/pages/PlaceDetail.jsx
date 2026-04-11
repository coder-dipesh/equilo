import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { usePreferences } from '../PreferencesContext';
import { Skeleton } from '../components/Skeleton';
import CallyDatePicker from '../components/CallyDatePicker';
import { places as placesApi, expenses, categories, summary, invites, placeMembers, cycles as cyclesApi, settlements as settlementsApi, settlementCreate } from '../api';
import {
  Trash2, Pencil, Filter, Calendar, Users, X, Check, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Scale, Wallet, CircleDollarSign, Clock, TrendingUp, TrendingDown, CheckCircle2, CalendarRange, Info, PlayCircle, RotateCcw, AlertTriangle,
  Home, Receipt, Building2, Zap, Droplets, Flame, Wifi, Smartphone, ShoppingCart, Sparkles, Bath, UtensilsCrossed,
  Package, Tv, Music, CreditCard, PartyPopper, CalendarDays, Search, Plus, Copy, Share2, RefreshCw, Loader2,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

// Explicit hex colors for Recharts (design system primary #0967F7 – SVG does not resolve CSS variables)
const CHART_COLORS = {
  primary: '#0967F7',
  primaryLight: '#99C3FF',
  primaryMuted: '#3E86FF',
  othersShare: '#D5DDF1',
  navy: '#031941',
};

/** Category group order for picker */
const CATEGORY_GROUP_ORDER = ['Household', 'Utilities',  'Social', 'Subscriptions', 'Housing',  'Other'];

/** Category name → { group, Icon } for display. Unknown names go to Other with CircleDollarSign. */
const CATEGORY_META = {
  'Rent': { group: 'Housing', Icon: Home },
  'Bond / Deposit': { group: 'Housing', Icon: Receipt },
  'Strata / Building Fees': { group: 'Housing', Icon: Building2 },
  'Electricity': { group: 'Utilities', Icon: Zap },
  'Water': { group: 'Utilities', Icon: Droplets },
  'Gas': { group: 'Utilities', Icon: Flame },
  'Internet': { group: 'Utilities', Icon: Wifi },
  'Mobile (Shared Plan)': { group: 'Utilities', Icon: Smartphone },
  'Groceries': { group: 'Household', Icon: ShoppingCart },
  'Cleaning Supplies': { group: 'Household', Icon: Sparkles },
  'Toiletries': { group: 'Household', Icon: Bath },
  'Kitchen Supplies': { group: 'Household', Icon: UtensilsCrossed },
  'Household Items': { group: 'Household', Icon: Package },
  'Netflix': { group: 'Subscriptions', Icon: Tv },
  'Spotify': { group: 'Subscriptions', Icon: Music },
  'Amazon Prime': { group: 'Subscriptions', Icon: CreditCard },
  'Other Shared Subscriptions': { group: 'Subscriptions', Icon: CreditCard },
  'Takeaway': { group: 'Social', Icon: UtensilsCrossed },
  'Dining Out': { group: 'Social', Icon: UtensilsCrossed },
  'House Party': { group: 'Social', Icon: PartyPopper },
  'Shared Events': { group: 'Social', Icon: CalendarDays },
  'Other': { group: 'Other', Icon: CircleDollarSign },
};

function getCategoryMeta(name) {
  return CATEGORY_META[name] || { group: 'Other', Icon: CircleDollarSign };
}

/** Type: subtle dot + muted label. fixed=purple, variable=green, one_time=red */
function CategoryTypeBadge({ type }) {
  if (!type) return null;
  const dotColor = type === 'fixed' ? 'bg-violet-500' : type === 'one_time' ? 'bg-red-500' : 'bg-emerald-500';
  const label = type === 'fixed' ? 'Fixed' : type === 'one_time' ? 'One-time' : 'Variable';
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0 text-[11px] text-text-muted" title={label}>
      <span className={`w-2 h-2 shrink-0 rounded-full ${dotColor}`} aria-hidden />
      <span>{label}</span>
    </span>
  );
}

const VALID_TABS = ['expenses', 'summary', 'invite', 'about', 'archive'];

/** Truncate email for display (e.g. san…@gmail.com). */
function truncateEmail(email) {
  if (!email || typeof email !== 'string') return email || '';
  const at = email.indexOf('@');
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 4) return email;
  return local.slice(0, 3) + '…' + domain;
}

/** Prefer username/display_name; if missing or email-like, show truncated email. */
function memberDisplayLabel(m) {
  const name = (m?.display_name || m?.username || '').trim();
  const email = (m?.email || '').trim();
  if (name && !name.includes('@')) return name;
  if (name && name.includes('@')) return truncateEmail(name);
  if (email) return truncateEmail(email);
  return 'Member';
}

/** Today's date in local time as YYYY-MM-DD (for date inputs; avoids UTC mismatch). */
function getTodayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Premium category picker: modal bottom sheet with search, grouped list, icon + name + type badge.
 * Selected row: soft blue bg + checkmark. Empty state: "Select category". Add Custom at bottom.
 */
function CategoryPickerModal({ onClose, categoryList, selectedId, onSelect, onAddCustom }) {
  const [search, setSearch] = useState('');
  const searchLower = search.trim().toLowerCase();
  const filtered = searchLower
    ? categoryList.filter((c) => c.name.toLowerCase().includes(searchLower))
    : categoryList;

  const byGroup = CATEGORY_GROUP_ORDER.reduce((acc, g) => {
    acc[g] = filtered.filter((c) => getCategoryMeta(c.name).group === g);
    return acc;
  }, {});

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/40" aria-hidden onClick={onClose} />
      <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full max-w-md max-h-[70vh] rounded-2xl bg-base-100 shadow-xl flex flex-col border border-base-300 pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Choose category"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
          <h3 className="text-base font-semibold text-text-primary m-0">Category</h3>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm btn-square" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-4 pb-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" aria-hidden />
            <input
              type="search"
              placeholder="Search categories…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input input-bordered w-full pl-9 pr-4 py-2.5 h-11 rounded-xl text-sm"
              aria-label="Search categories"
            />
          </div>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 pb-4 flex-1 min-h-0">
          {selectedId && (
            <button
              type="button"
              onClick={() => { onSelect(null); onClose(); }}
              className="w-full flex items-center gap-3 py-3 px-4 text-left text-text-muted hover:bg-base-200 rounded-xl mb-3 border border-dashed border-base-300"
            >
              <span className="text-sm">Clear selection</span>
            </button>
          )}
          {CATEGORY_GROUP_ORDER.map((groupName) => {
            const items = byGroup[groupName];
            if (!items.length) return null;
            return (
              <div key={groupName} className="mb-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted mb-2 px-1">{groupName}</p>
                <div className="rounded-xl border border-base-300 overflow-hidden shadow-sm">
                  {items.map((c) => {
                    const { Icon } = getCategoryMeta(c.name);
                    const selected = String(c.id) === String(selectedId);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { onSelect(c.id); onClose(); }}
                        className={`w-full flex items-center gap-3 py-3 px-4 text-left transition-colors rounded-none first:rounded-t-xl last:rounded-b-xl ${selected ? 'bg-primary/10' : 'hover:bg-base-200'}`}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-base-300 text-primary">
                          <Icon className="w-4 h-4" aria-hidden />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary m-0 truncate">{c.name}</p>
                          <p className="text-[11px] text-text-muted m-0 truncate">{getCategoryMeta(c.name).group}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <CategoryTypeBadge type={c.category_type} />
                          {selected && <Check className="w-5 h-5 text-primary shrink-0" aria-hidden />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-text-muted text-center py-6 m-0">No categories match &quot;{search}&quot;</p>
          )}
        </div>
        {onAddCustom && (
          <div className="p-4 pt-2 border-t border-base-300 shrink-0">
            <button
              type="button"
              onClick={() => { onClose(); onAddCustom(); }}
              className="btn btn-outline w-full gap-2 rounded-xl py-3"
            >
              <Plus className="w-4 h-4" />
              Add custom category
            </button>
          </div>
        )}
        </div>
      </div>
    </>
  );
}

export default function PlaceDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { currency, startOfWeek } = usePreferences();
  const tabFromUrl = searchParams.get('tab');
  const editExpenseIdFromUrl = searchParams.get('editExpense');
  const tab = editExpenseIdFromUrl ? 'expenses' : (VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'expenses');

  const [place, setPlace] = useState(null);
  const [expenseList, setExpenseList] = useState([]);
  const [expensePage, setExpensePage] = useState(1);
  const [expenseTotalCount, setExpenseTotalCount] = useState(0);
  const [expensePageSize] = useState(10);
  const [summaryData, setSummaryData] = useState(null);
  const [period, setPeriod] = useState('weekly');
  const [summaryPeriodEnd, setSummaryPeriodEnd] = useState(null);
  const [cycleList, setCycleList] = useState([]);
  const [selectedCycleId, setSelectedCycleId] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteList, setInviteList] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expenseToEditFromUrl, setExpenseToEditFromUrl] = useState(null);

  const isOwner = place?.members?.some((m) => m.user?.id === user?.id && m.role === 'owner');

  function clearEditExpenseFromUrl() {
    searchParams.delete('editExpense');
    setSearchParams(searchParams, { replace: true });
    setExpenseToEditFromUrl(null);
  }

  function load() {
    if (!id) {
      setPlace(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Fetch place first; only treat place fetch failure as "not found"
    placesApi
      .get(id)
      .then((p) => {
        setPlace(p);
        // Load expenses, summary, members, cycles before showing content so we don't flash empty state
        Promise.allSettled([
          expenses(id).list({ page: 1, page_size: 10 }),
          selectedCycleId != null
            ? summary(id, { cycle_id: selectedCycleId })
            : summary(id, { period, from: summaryPeriodEnd || undefined, weekStart: startOfWeek }),
          placeMembers(id).list(),
          cyclesApi(id).list(),
        ]).then((results) => {
          const [exRes, sumRes, memRes, cyRes] = results;
          if (exRes.status === 'fulfilled') {
            const ex = exRes.value;
            const list = Array.isArray(ex) ? ex : (ex?.results ?? []);
            const count = Array.isArray(ex) ? ex.length : (ex?.count ?? list.length);
            setExpenseList(list);
            setExpensePage(1);
            setExpenseTotalCount(count);
          }
          if (memRes.status === 'fulfilled') setMembers(memRes.value);
          const cycles = cyRes?.status === 'fulfilled' && Array.isArray(cyRes.value) ? cyRes.value : [];
          if (cycles.length) setCycleList(cycles);
          // Prefer cycle-based summary on first load when there's an open/pending cycle so hard reload shows cycle view, not period
          const openCycle = cycles.find((c) => c.status === 'open');
          const pendingCycle = cycles.find((c) => c.status === 'pending_settlement');
          const preferredCycle = openCycle || pendingCycle;
          if (preferredCycle) {
            setSelectedCycleId(preferredCycle.id);
            summary(id, { cycle_id: preferredCycle.id })
              .then(setSummaryData)
              .catch(() => {})
              .finally(() => setLoading(false));
          } else {
            if (sumRes.status === 'fulfilled') setSummaryData(sumRes.value);
            setLoading(false);
          }
        });
      })
      .catch(() => {
        setPlace(null);
        setLoading(false);
      });
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

  useEffect(() => { void load(); }, [id, startOfWeek]); // eslint-disable-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps

  // Open edit expense modal when navigating from Activity with ?editExpense=id
  useEffect(() => {
    if (!id || !place || !editExpenseIdFromUrl) {
      setExpenseToEditFromUrl(null); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }
    const expenseId = editExpenseIdFromUrl.trim();
    if (!expenseId) return;
    let cancelled = false;
    expenses(id)
      .get(expenseId)
      .then((exp) => {
        if (!cancelled) setExpenseToEditFromUrl(exp);
      })
      .catch(() => {
        if (!cancelled) setExpenseToEditFromUrl(null);
      });
    return () => { cancelled = true; };
  }, [id, place, editExpenseIdFromUrl]);

  // Background refresh only when tab is visible (saves server load when tab is in background)
  useEffect(() => {
    if (!id || !place) return;
    const POLL_MS = 25000; // 25s when visible
    let intervalId = null;

    function refreshSilent() {
      Promise.allSettled([
        expenses(id).list({ page: expensePage, page_size: expensePageSize }),
        selectedCycleId != null
          ? summary(id, { cycle_id: selectedCycleId })
          : summary(id, { period, from: summaryPeriodEnd || undefined, weekStart: startOfWeek }),
        placeMembers(id).list(),
        cyclesApi(id).list(),
      ]).then((results) => {
        const [exRes, sumRes, memRes, cyRes] = results;
        if (exRes.status === 'fulfilled') {
          const ex = exRes.value;
          const list = Array.isArray(ex) ? ex : (ex?.results ?? []);
          const count = Array.isArray(ex) ? ex.length : (ex?.count ?? list.length);
          setExpenseList(list);
          setExpenseTotalCount(count);
        }
        if (sumRes.status === 'fulfilled') setSummaryData(sumRes.value);
        if (memRes.status === 'fulfilled') setMembers(memRes.value);
        if (cyRes.status === 'fulfilled') setCycleList(Array.isArray(cyRes.value) ? cyRes.value : []);
      });
    }

    function startPolling() {
      refreshSilent(); // one immediate refresh when tab becomes visible
      intervalId = window.setInterval(refreshSilent, POLL_MS);
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
  }, [id, place, expensePage, expensePageSize, period, summaryPeriodEnd, startOfWeek, selectedCycleId]);

  useEffect(() => {
    if (!id || !place) return;
    const params = selectedCycleId != null
      ? { cycle_id: selectedCycleId }
      : { period, from: summaryPeriodEnd || undefined, weekStart: startOfWeek };
    summary(id, params).then(setSummaryData).catch(() => {});
  }, [id, period, summaryPeriodEnd, place, startOfWeek, selectedCycleId]);

  const currentCycle = cycleList.find((c) => c.status === 'open') || null;

  // Resolved cycles live in Archive only; clear Summary selection when the selected cycle is resolved
  useEffect(() => {
    if (selectedCycleId == null || cycleList.length === 0) return;
    const selected = cycleList.find((c) => c.id === selectedCycleId);
    if (selected?.status !== 'resolved') return;
    const openOrPending = cycleList.find((c) => c.status === 'open' || c.status === 'pending_settlement');
    setSelectedCycleId(openOrPending ? openOrPending.id : null); // eslint-disable-line react-hooks/set-state-in-effect
  }, [cycleList, selectedCycleId]);

  useEffect(() => {
    if (cycleList.length === 0) return;
    if (selectedCycleId != null) return;
    // Prefer open cycle; else pending settlement (so admin can settle and resolve); never auto-select resolved
    if (currentCycle) {
      setSelectedCycleId(currentCycle.id); // eslint-disable-line react-hooks/set-state-in-effect
    } else {
      const pending = cycleList.find((c) => c.status === 'pending_settlement');
      setSelectedCycleId(pending ? pending.id : null);
    }
  }, [cycleList.length, currentCycle?.id, selectedCycleId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'invite' && id) {
      if (isOwner) {
        invites(id).list().then(setInviteList).catch(() => setInviteList([]));
      } else {
        setSearchParams({ tab: 'about' }, { replace: true });
      }
    }
  }, [tab, id, isOwner, setSearchParams]);

  if (loading && !place) {
    return (
      <div className="pb-8 animate-fade-in">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-text-muted mb-4">
          <Skeleton className="h-4 w-12" />
          <ChevronRight className="w-4 h-4 shrink-0 text-text-muted/50" aria-hidden />
          <Skeleton className="h-4 w-20" />
          <ChevronRight className="w-4 h-4 shrink-0 text-text-muted/50" aria-hidden />
          <Skeleton className="h-4 w-24" />
        </nav>
        <header className="flex items-center justify-between gap-4 mb-6">
          <Skeleton className="h-7 w-48 sm:w-64" />
        </header>
        <nav className="flex gap-1 mb-6">
          <Skeleton className="h-9 w-20 rounded-lg" />
          <Skeleton className="h-9 w-20 rounded-lg" />
          <Skeleton className="h-9 w-16 rounded-lg" />
        </nav>
        <div className="space-y-4">
          <div className="rounded-2xl border border-base-300 bg-surface shadow-card p-4 sm:p-6">
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-base-300">
                  <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <Skeleton className="h-4 w-full max-w-[200px]" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-6 w-16 rounded shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (!place) {
    return (
      <div className="pb-8 max-w-md">
        <p className="text-text-primary font-medium m-0 mb-1">Place not found</p>
        <p className="text-sm text-text-secondary m-0 mb-4">
          This place may not exist, or you may not have access to it. Go back to your places list and open a place from there.
        </p>
        <Link to="/places" className="btn btn-primary btn-sm">Back to places</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-8 bg-bg">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-text-muted mb-4">
        <Link to="/" className="link link-hover text-text-secondary hover:text-primary">Home</Link>
        <ChevronRight className="w-4 h-4 shrink-0" aria-hidden />
        <Link to="/places" className="link link-hover text-text-secondary hover:text-primary">Place</Link>
        <ChevronRight className="w-4 h-4 shrink-0" aria-hidden />
        <span className="text-text-primary font-medium truncate max-w-[180px] sm:max-w-none" aria-current="page" title={place.name}>{place.name}</span>
      </nav>
      <header className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-xl font-semibold m-0 truncate">{place.name}</h1>
      </header>

      <nav role="tablist" className="tabs tabs-lift mb-6">
          <button
            type="button"
            role="tab"
            className={`tab ${tab === 'expenses' ? 'tab-active' : ''}`}
            onClick={() => setSearchParams({ tab: 'expenses' })}
            aria-selected={tab === 'expenses'}
          >
            Expenses
          </button>
          <button
            type="button"
            role="tab"
            className={`tab ${tab === 'summary' ? 'tab-active' : ''}`}
            onClick={() => setSearchParams({ tab: 'summary' })}
            aria-selected={tab === 'summary'}
          >
            Summary
          </button>
          {isOwner && (
            <button
              type="button"
              role="tab"
              className={`tab ${tab === 'invite' ? 'tab-active' : ''}`}
              onClick={() => setSearchParams({ tab: 'invite' })}
              aria-selected={tab === 'invite'}
            >
              Invite
            </button>
          )}
          {!isOwner && (
            <button
              type="button"
              role="tab"
              className={`tab ${tab === 'about' ? 'tab-active' : ''}`}
              onClick={() => setSearchParams({ tab: 'about' })}
              aria-selected={tab === 'about'}
            >
              About
            </button>
          )}
          <button
            type="button"
            role="tab"
            className={`tab ${tab === 'archive' ? 'tab-active' : ''}`}
            onClick={() => setSearchParams({ tab: 'archive' })}
            aria-selected={tab === 'archive'}
          >
            Archive
          </button>
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
          expenseToEditFromUrl={expenseToEditFromUrl}
          onClearEditFromUrl={clearEditExpenseFromUrl}
          currentCycle={currentCycle}
          onSwitchToSummary={() => setSearchParams({ tab: 'summary' })}
        />
      )}
      {tab === 'summary' && summaryData && (
        <SummarySection
          data={summaryData}
          period={period}
          setPeriod={setPeriod}
          summaryPeriodEnd={summaryPeriodEnd}
          setSummaryPeriodEnd={setSummaryPeriodEnd}
          cycleList={cycleList}
          currentCycle={currentCycle}
          selectedCycleId={selectedCycleId}
          setSelectedCycleId={setSelectedCycleId}
          onResolveCycle={(cycleId) =>
            cyclesApi(id)
              .resolve(cycleId)
              .then(load)
              .catch(() => {})
            }
          onStartNewCycle={(startDate) =>
            cyclesApi(id)
              .create(startDate ? { start_date: startDate } : {})
              .then((cycle) => {
                setCycleList((prev) => [cycle, ...prev]);
                setSelectedCycleId(cycle.id);
                load();
              })
          }
          members={members}
          currentUserId={user?.id}
          currentUser={user}
          currency={currency}
          placeId={id}
          placeName={place?.name}
          isPlaceCreator={isOwner}
          onRefreshSummary={load}
        />
      )}
      {tab === 'invite' && isOwner && (
        <InviteSection
          placeId={id}
          placeName={place?.name}
          inviteEmail={inviteEmail}
          setInviteEmail={setInviteEmail}
          inviteList={inviteList}
          onRefresh={() => {
            invites(id).list().then(setInviteList);
            load();
          }}
          members={members}
          currentUserId={user?.id}
          isOwner={isOwner}
        />
      )}
      {tab === 'about' && !isOwner && (
        <AboutPlaceSection
          placeId={id}
          placeName={place?.name}
          members={members}
          currentUserId={user?.id}
          onRefresh={load}
        />
      )}
      {tab === 'archive' && (
        <ArchiveSection
          placeId={id}
          placeName={place?.name}
          cycleList={cycleList}
          members={members}
          currentUserId={user?.id}
          currency={currency}
        />
      )}
    </div>
  );
}

function Avatar({ username, photoUrl, className = '' }) {
  const initial = username ? username.charAt(0).toUpperCase() : '?';
  if (photoUrl) {
    return (
      <div className={`rounded-full overflow-hidden bg-base-300 shrink-0 w-8 h-8 ${className}`} aria-hidden>
        <img src={photoUrl} alt="" className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div className={`rounded-full bg-primary/20 text-primary flex items-center justify-center font-semibold text-sm shrink-0 w-8 h-8 ${className}`} aria-hidden>
      {initial}
    </div>
  );
}

function ExpenseCard({ expense, placeId, members: _members, currentUser, isOwner, onRefresh, onEdit, currency }) {
  const addedById = expense.added_by?.id ?? expense.added_by?.user_id;
  const canEdit = isOwner || addedById === currentUser?.id;
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
  const ACTION_WIDTH = 140;
  function handleDragMove(clientX) {
    if (!canEdit) return;
    didDrag.current = true;
    const dx = dragStartX.current - clientX;
    const next = Math.max(0, Math.min(offsetAtGestureStart.current + dx, ACTION_WIDTH));
    currentOffsetRef.current = next;
    setSwipeOffset(next);
  }
  function handleDragEnd() {
    if (!canEdit) return;
    const current = currentOffsetRef.current;
    if (current > ACTION_WIDTH / 2) { setSwipeOffset(ACTION_WIDTH); currentOffsetRef.current = ACTION_WIDTH; }
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
    } catch { /* ignore */ }
    finally { setDeleting(false); }
  }

  return (
    <div className="mb-3 transition-[margin,opacity] duration-300 ease-out" style={{ marginBottom: deleting ? 0 : undefined }}>
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
              <div className="absolute right-0 top-0 bottom-0 flex z-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSwipeOffset(0);
                    currentOffsetRef.current = 0;
                    setDetailOpen(false);
                    onEdit?.(expense);
                  }}
                  disabled={deleting}
                  className="flex flex-col items-center justify-center gap-1 w-[70px] min-h-full bg-base-300 hover:bg-base-300/90 active:opacity-90 text-base-content border-0 rounded-none"
                  aria-label="Edit expense"
                >
                  <Pencil className="w-5 h-5 shrink-0" aria-hidden />
                  <span className="text-xs font-medium">Edit</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDeleteClick(); }}
                  disabled={deleting}
                  className="flex flex-col items-center justify-center gap-1 w-[70px] min-h-full bg-error hover:bg-error/90 active:opacity-90 text-error-content border-0 rounded-none rounded-r-xl"
                  aria-label="Delete expense"
                >
                  <Trash2 className="w-5 h-5 shrink-0" aria-hidden />
                  <span className="text-xs font-medium">Delete</span>
                </button>
              </div>
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
                <Avatar username={expense.paid_by?.display_name || expense.paid_by?.username} photoUrl={expense.paid_by?.profile_photo} className="!w-10 !h-10 text-sm shrink-0 mt-0.5" />
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
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={() => setDetailOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="expense-detail-title"
        >
          <div
            className="bg-base-200 border border-base-300 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col min-h-0 shadow-xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setDetailOpen(false)}
              className="absolute top-4 right-4 btn btn-ghost btn-circle btn-sm text-text-secondary hover:text-text-primary hover:bg-base-300 z-10"
              aria-label="Close"
            >
              <X className="w-5 h-5" aria-hidden />
            </button>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-6 sm:p-8 pt-10 sm:pt-10">
              <p className="text-3xl font-bold text-primary tabular-nums m-0 mb-5">{amountStr}</p>
              <div className="flex flex-wrap items-center gap-3 mb-6">
                <h2 id="expense-detail-title" className="text-lg font-semibold text-text-primary m-0">{expense.description}</h2>
                {(expense.category?.name != null && expense.category.name !== '') ? (
                  <span className="badge badge-sm badge-ghost text-text-secondary border border-base-300 font-normal">{expense.category.name}</span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-text-secondary mb-6 pb-6 border-b border-base-300">
                <span className="flex items-center gap-2.5">
                  <Avatar username={expense.paid_by?.display_name || expense.paid_by?.username} photoUrl={expense.paid_by?.profile_photo} className="!w-7 !h-7 text-xs" />
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
                <div className="mb-4">
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wide m-0 mb-3">Split between</p>
                  <div className="flex flex-wrap gap-4">
                    {expense.splits.map((s) => (
                      <div key={s.user?.id ?? s.id} className="flex items-center gap-2.5">
                        <Avatar username={s.user?.display_name || s.user?.username} photoUrl={s.user?.profile_photo} className="!w-7 !h-7 text-xs" />
                        <span className="text-sm text-text-primary">{s.user?.display_name || s.user?.username}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {canEdit && (
              <div className="shrink-0 flex gap-3 p-4 sm:p-6 pt-3 border-t border-base-300 bg-base-200 rounded-b-2xl sm:rounded-b-2xl">
                <button type="button" className="btn btn-outline flex-1 min-h-11 rounded-lg border-base-300 gap-2" onClick={() => { setDetailOpen(false); onEdit?.(expense); }}>
                  <Pencil className="w-4 h-4 shrink-0" aria-hidden /> Edit
                </button>
                <button type="button" className="btn btn-error flex-1 min-h-11 rounded-lg shadow-soft gap-2" onClick={handleDeleteFromModal} disabled={deleting}>
                  <Trash2 className="w-4 h-4 shrink-0" aria-hidden /> {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ExpensesSection({ placeId, place, expenseList, expensePage, expenseTotalCount, expensePageSize, onPageChange, members, onRefresh, currentUser, isOwner, currency, expenseToEditFromUrl, onClearEditFromUrl, currentCycle, onSwitchToSummary }) {
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPaidBy, setFilterPaidBy] = useState(''); // '' = anyone, else member user id string
  const [filterOnlyWhereImInSplit, setFilterOnlyWhereImInSplit] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [categoryList, setCategoryList] = useState([]);

  useEffect(() => {
    categories(placeId).list().then(setCategoryList).catch(() => setCategoryList([]));
  }, [placeId]);

  // Open edit modal when navigated from Activity with ?editExpense=id
  useEffect(() => {
    if (expenseToEditFromUrl?.id) {
      setEditingExpense(expenseToEditFromUrl); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [expenseToEditFromUrl]);

  const filteredList = expenseList.filter((exp) => {
    if (filterCategory && (exp.category?.id != null ? String(exp.category.id) : '') !== filterCategory) return false;
    if (filterPaidBy) {
      const paidById = exp.paid_by?.id ?? exp.paid_by;
      if (String(paidById) !== filterPaidBy) return false;
    }
    if (filterOnlyWhereImInSplit && currentUser?.id != null) {
      const splitUserIds = (exp.splits ?? []).map((s) => s.user?.id ?? s.user).filter(Boolean);
      if (!splitUserIds.includes(currentUser.id)) return false;
    }
    return true;
  });

  // Group by expense date (transaction date), not by when it was added; newest first
  const groupedByAddedDate = (() => {
    const groups = {};
    for (const exp of filteredList) {
      const raw = exp.date || exp.created_at;
      let dateKey = 'unknown';
      if (raw) {
        const s = typeof raw === 'string' ? raw.slice(0, 10) : '';
        dateKey = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date(raw).toISOString().slice(0, 10);
      }
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

  const hasActiveFilters = filterCategory || filterPaidBy || filterOnlyWhereImInSplit;

  return (
    <section>
      {currentCycle == null && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 mb-4">
          <p className="text-sm text-base-content/90 m-0 mb-2">No open cycle. Start a new cycle from the Summary tab to add expenses.</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={onSwitchToSummary}>
            Go to Summary
          </button>
        </div>
      )}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-h3 m-0">Expenses</h2>
        <div className="flex items-center gap-2">
          {expenseList.length > 0 && (
            <button
              type="button"
              onClick={() => setShowFiltersPanel(!showFiltersPanel)}
              className={`btn btn-sm gap-1.5 relative ${showFiltersPanel ? 'btn-primary' : 'btn-ghost text-text-secondary hover:text-text-primary'}`}
              aria-label={showFiltersPanel ? 'Hide filters' : 'Show filters'}
              aria-expanded={showFiltersPanel}
            >
              <Filter className="w-4 h-4" aria-hidden />
              <span>Filters</span>
              {hasActiveFilters && !showFiltersPanel && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary" aria-hidden />
              )}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary min-h-11 rounded-lg shadow-soft px-4"
            onClick={() => setShowForm(!showForm)}
            disabled={currentCycle == null}
            title={currentCycle == null ? 'Start a cycle from Summary first' : ''}
          >
            {showForm ? 'Cancel' : 'Add expense'}
          </button>
        </div>
      </div>
      {expenseList.length > 0 && showFiltersPanel && (
        <div className="flex flex-col gap-3 mb-4 p-3 rounded-lg bg-base-300/50 border border-base-300">
          <span className="flex items-center gap-1.5 text-sm font-medium text-text-secondary shrink-0">
            <Filter className="w-4 h-4" aria-hidden /> Filters
          </span>
          <div className="flex gap-2 sm:gap-3 w-full">
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="select select-bordered select-sm flex-1 min-w-0 rounded-full" aria-label="Filter by category">
            <option value="">All categories</option>
            {CATEGORY_GROUP_ORDER.map((groupName) => {
              const items = categoryList.filter((c) => getCategoryMeta(c.name).group === groupName);
              if (!items.length) return null;
              return (
                <optgroup key={groupName} label={groupName}>
                  {items.map((c) => (
                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
            <select value={filterPaidBy} onChange={(e) => setFilterPaidBy(e.target.value)} className="select select-bordered select-sm flex-1 min-w-0 rounded-full" aria-label="Filter by who paid">
            <option value="">Paid by: anyone</option>
            {members.map((m) => (
              <option key={m.id} value={String(m.user?.id)}>
                Paid by: {m.user?.display_name || m.user?.username || 'Member'}
              </option>
            ))}
          </select>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <label className="flex items-center gap-2 cursor-pointer text-sm shrink-0 whitespace-nowrap">
            <input type="checkbox" checked={filterOnlyWhereImInSplit} onChange={(e) => setFilterOnlyWhereImInSplit(e.target.checked)} className="checkbox checkbox-sm checkbox-primary" aria-label="Only expenses I'm in the split for" />
            <span>Only where I&apos;m in the split</span>
          </label>
          {hasActiveFilters && (
            <button type="button" className="btn btn-ghost btn-sm text-sm shrink-0 whitespace-nowrap" onClick={() => { setFilterCategory(''); setFilterPaidBy(''); setFilterOnlyWhereImInSplit(false); }}>Clear filters</button>
          )}
          </div>
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
          currentCycle={currentCycle}
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
          currentCycle={currentCycle}
          onSaved={() => {
            setEditingExpense(null);
            onRefresh();
            onClearEditFromUrl?.();
          }}
          onCancel={() => {
            setEditingExpense(null);
            onClearEditFromUrl?.();
          }}
          currency={currency}
        />
      )}
    </section>
  );
}

function EditExpenseForm({ placeId, members, expense, currentCycle, onSaved, onCancel, currency }) {
  const _sym = currency?.symbol ?? '$';
  const catId = expense?.category && (typeof expense?.category === 'object' ? expense.category.id : expense.category);
  // Use expense's cycle range when API returns full cycle; fallback to current cycle so date is always restricted
  const cycleStart = expense?.cycle?.start_date ?? currentCycle?.start_date ?? null;
  const cycleEnd = expense?.cycle?.end_date ?? currentCycle?.end_date ?? null;
  const initialDate = expense?.date ?? getTodayLocal();
  const clampedInitialDate = clampDateToRange(initialDate, cycleStart, cycleEnd);
  const [amount, setAmount] = useState(() => (expense ? String(expense.amount ?? '') : ''));
  const [description, setDescription] = useState(() => expense?.description ?? '');
  const [date, setDate] = useState(() => clampedInitialDate);
  const [paidBy, setPaidBy] = useState(() => expense?.paid_by?.id ?? expense?.paid_by ?? '');
  const [categoryId, setCategoryId] = useState(() => (catId != null ? String(catId) : ''));
  const [splitUserIds, setSplitUserIds] = useState(() => {
    if (!expense?.splits?.length) return [];
    return expense.splits.map((s) => s.user?.id ?? s.user).filter(Boolean);
  });
  const [categoryList, setCategoryList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  useEffect(() => {
    categories(placeId).list().then(setCategoryList).catch(() => setCategoryList([]));
  }, [placeId]);
  useEffect(() => {
    if (expense?.splits?.length) {
      setSplitUserIds(expense.splits.map((s) => s.user?.id ?? s.user).filter(Boolean));
    }
  }, [expense?.id, expense?.splits]);

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

  const inputClass = "input input-bordered w-full min-h-11 text-base rounded-lg border-base-300 bg-base-100 focus:ring-2 focus:ring-primary/20";
  const labelClass = "block text-sm font-medium text-text-primary mb-1.5";

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
        className="card bg-base-100 border border-base-300 rounded-2xl p-4 sm:p-5 w-full max-w-md max-h-[92vh] overflow-y-auto overflow-x-hidden scrollbar-none shadow-xl text-base-content space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="edit-expense-title" className="text-h3 m-0">Edit expense</h2>
        {error && <div role="alert" className="alert alert-error text-sm rounded-lg"><span>{error}</span></div>}
        <div>
          <label htmlFor="edit-amount" className={labelClass}>Amount *</label>
          <input id="edit-amount" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} onWheel={(e) => e.target.blur()} required className={inputClass} />
        </div>
        <div>
          <label htmlFor="edit-desc" className={labelClass}>Description *</label>
          <input id="edit-desc" type="text" value={description} onChange={(e) => setDescription(e.target.value)} required className={inputClass} />
        </div>
        <div>
          <label htmlFor="edit-date" className={labelClass}>Date</label>
        <CallyDatePicker
          id="edit-date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          min={cycleStart ?? undefined}
          max={cycleEnd ?? undefined}
          inputClassName={`${inputClass} pr-10 has-calendar-icon`}
          ariaLabel="Expense date"
        />
        {cycleStart && cycleEnd && (
          <p className="text-xs text-text-muted mt-1">Within this cycle: {formatPeriodRange(cycleStart, cycleEnd)}</p>
        )}
        </div>
        <div>
          <label htmlFor="edit-paidby" className={labelClass}>Paid by</label>
          <select id="edit-paidby" value={paidBy} onChange={(e) => setPaidBy(Number(e.target.value))} className="select select-bordered w-full min-h-11 text-base rounded-lg border-base-300 bg-base-100">
          {members.map((m) => <option key={m.id} value={m.user?.id}>{m.user?.display_name || m.user?.username}</option>)}
        </select>
        </div>
        <div>
          <label htmlFor="edit-category" className={labelClass}>Category</label>
          <button
            type="button"
            id="edit-category"
            onClick={() => setCategoryPickerOpen(true)}
            className="flex items-center gap-2 w-full min-h-11 px-2 rounded-lg border border-base-300 bg-base-100 text-left hover:border-base-400 transition-colors"
            aria-label="Choose category"
          >
            {categoryId ? (() => {
              const c = categoryList.find((x) => String(x.id) === String(categoryId));
              if (!c) return <span className="text-text-muted">Select category</span>;
              const { Icon } = getCategoryMeta(c.name);
              return (
                <>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-base-300 text-primary">
                    <Icon className="w-4 h-4" aria-hidden />
                  </span>
                  <span className="flex-1 min-w-0 truncate text-text-primary font-medium">{c.name}</span>
                  <CategoryTypeBadge type={c.category_type} />
                </>
              );
            })() : (
              <span className="text-text-muted">Select category</span>
            )}
          </button>
          {categoryPickerOpen && (
            <CategoryPickerModal
              open={categoryPickerOpen}
              onClose={() => setCategoryPickerOpen(false)}
              categoryList={categoryList}
              selectedId={categoryId}
              onSelect={(id) => setCategoryId(id == null ? '' : String(id))}
            />
          )}
        </div>
        <fieldset className="border-0 p-0 m-0">
          <legend className={labelClass}>Split between</legend>
          <div className="flex flex-nowrap gap-4 overflow-x-auto py-2 -mx-1">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-2 cursor-pointer shrink-0 whitespace-nowrap min-h-[44px] py-1">
                <input type="checkbox" checked={splitUserIds.includes(m.user?.id)} onChange={() => toggleSplit(m.user?.id)} className="checkbox checkbox-sm checkbox-primary" />
                <span>{m.user?.display_name || m.user?.username}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex gap-3 pt-2">
          <button type="button" className="btn btn-outline min-h-11 rounded-lg border-base-300 flex-1" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary min-h-11 rounded-lg shadow-soft flex-1" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </div>
  );
}

function clampDateToRange(dateStr, startDate, endDate) {
  if (!dateStr) return dateStr;
  if (startDate && dateStr < startDate) return startDate;
  if (endDate && dateStr > endDate) return endDate;
  return dateStr;
}

function AddExpenseForm({ placeId, place: _place, members, onSaved, onCancel, currency, currentCycle }) {
  const { user } = useAuth();
  const sym = currency?.symbol ?? '$';
  const cycleStart = currentCycle?.start_date ?? null;
  const cycleEnd = currentCycle?.end_date ?? null;
  const defaultDate = clampDateToRange(getTodayLocal(), cycleStart, cycleEnd);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => defaultDate);
  const [paidBy, setPaidBy] = useState(user?.id || '');
  const [categoryId, setCategoryId] = useState('');
  const [splitUserIds, setSplitUserIds] = useState(members.map((m) => m.user?.id).filter(Boolean));
  const [categoryList, setCategoryList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState('variable');
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

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
      const created = await categories(placeId).create(name, newCategoryType);
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
            onWheel={(e) => e.target.blur()}
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
        <CallyDatePicker
          id="exp-date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          min={cycleStart ?? undefined}
          max={cycleEnd ?? undefined}
          inputClassName={`${inputClass} pr-10 has-calendar-icon`}
          ariaLabel="Expense date"
        />
        <p className="text-xs text-text-muted mt-1">
          {cycleStart && cycleEnd ? `Within current cycle (${formatPeriodRange(cycleStart, cycleEnd)})` : 'Defaults to today'}
        </p>
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
          <label className={labelTextClass}>Category</label>
          <div className="flex gap-2 items-center">
            <button
              type="button"
              id="exp-category"
              onClick={() => setCategoryPickerOpen(true)}
              className="flex items-center gap-2 flex-1 min-w-0 min-h-11 px-2 rounded-lg border border-base-300 bg-base-100 text-left hover:border-base-400 transition-colors"
              aria-label="Choose category"
            >
              {categoryId ? (() => {
                const c = categoryList.find((x) => String(x.id) === String(categoryId));
                if (!c) return <span className="text-text-muted">Select category</span>;
                const { Icon } = getCategoryMeta(c.name);
                return (
                  <>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-base-300 text-primary">
                      <Icon className="w-4 h-4" aria-hidden />
                    </span>
                    <span className="flex-1 min-w-0 truncate text-text-primary font-medium">{c.name}</span>
                    <CategoryTypeBadge type={c.category_type} />
                  </>
                );
              })() : (
                <span className="text-text-muted">Select category</span>
              )}
            </button>
          </div>
          {categoryPickerOpen && (
            <CategoryPickerModal
              open={categoryPickerOpen}
              onClose={() => setCategoryPickerOpen(false)}
              categoryList={categoryList}
              selectedId={categoryId}
              onSelect={(id) => setCategoryId(id == null ? '' : String(id))}
              onAddCustom={() => setShowAddCategory(true)}
            />
          )}
        </div>
      </div>
      {showAddCategory && (
        <>
          <div className="flex flex-wrap gap-2 mt-2 mb-4 items-center">
            <input
              type="text"
              placeholder="New category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCategory(e))}
              disabled={addingCategory}
              className="input input-bordered flex-1 min-w-[120px] min-h-[44px] text-base rounded-lg"
              autoFocus
              aria-label="New category name"
            />
            <select
              value={newCategoryType}
              onChange={(e) => setNewCategoryType(e.target.value)}
              className="select select-bordered min-h-[44px] text-base rounded-lg w-auto"
              aria-label="Category type"
            >
              <option value="fixed">Fixed</option>
              <option value="variable">Variable</option>
              <option value="one_time">One-time</option>
            </select>
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

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <button type="submit" className="btn btn-primary min-h-12 flex-1 order-1 sm:order-2 rounded-lg" disabled={saving}>
          {saving ? 'Adding…' : 'Add expense'}
        </button>
        <button type="button" className="btn btn-ghost min-h-12 flex-1 order-2 sm:order-1 rounded-lg" onClick={onCancel}>Cancel</button>
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

const SETTLEMENT_NOTE_COUNTS_KEY = 'equilo_settlement_note_counts_v1';
const DEFAULT_SETTLEMENT_NOTE_QUICK_OPTIONS = ['PayID', 'Cash', 'Bank Transfer'];
const MAX_SETTLEMENT_NOTE_QUICK_OPTIONS = 3;

function readSettlementNoteCounts() {
  try {
    const raw = localStorage.getItem(SETTLEMENT_NOTE_COUNTS_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    return o;
  } catch {
    return {};
  }
}

function writeSettlementNoteCounts(counts) {
  try {
    localStorage.setItem(SETTLEMENT_NOTE_COUNTS_KEY, JSON.stringify(counts));
  } catch {
    // ignore quota / private mode
  }
}

/** After a successful settlement, bump count for this note (non-empty trimmed). */
function recordSettlementNoteUsage(note) {
  const key = (note || '').trim();
  if (!key || key.length > 80) return;
  const counts = readSettlementNoteCounts();
  counts[key] = (Number(counts[key]) || 0) + 1;
  writeSettlementNoteCounts(counts);
}

/**
 * Quick-fill chips for settlement notes: up to 3 labels.
 * Uses most-used notes from this browser, then pads with defaults (PayID, Cash, Bank Transfer).
 * Swap to server-side or richer analytics later if needed.
 */
function getSettlementNoteQuickOptions() {
  const counts = readSettlementNoteCounts();
  const ranked = Object.entries(counts)
    .filter(([label]) => typeof label === 'string' && label.trim().length > 0)
    .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
    .map(([label]) => label.trim());
  const seen = new Set();
  const out = [];
  for (const label of ranked) {
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
    if (out.length >= MAX_SETTLEMENT_NOTE_QUICK_OPTIONS) return out;
  }
  for (const d of DEFAULT_SETTLEMENT_NOTE_QUICK_OPTIONS) {
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(d);
    if (out.length >= MAX_SETTLEMENT_NOTE_QUICK_OPTIONS) break;
  }
  return out;
}

function SummarySection({
  data,
  period,
  setPeriod,
  summaryPeriodEnd,
  setSummaryPeriodEnd,
  cycleList = [],
  currentCycle = null,
  selectedCycleId = null,
  setSelectedCycleId,
  onResolveCycle,
  onStartNewCycle,
  members: _members,
  currentUserId,
  currentUser,
  currency,
  placeId,
  placeName,
  isPlaceCreator = false,
  onRefreshSummary,
}) {
  const sym = currency?.symbol ?? '$';
  const netBalance = (data.total_owed_to_me ?? 0) - (data.total_i_owe ?? 0);
  const isCycleMode = data.cycle != null;
  const periodLabel = isCycleMode ? 'Cycle' : (period === 'fortnightly' ? 'Fortnight' : 'Week');
  const rangeStr = data.cycle?.name || formatPeriodRange(data.from, data.to);
  const today = new Date().toISOString().slice(0, 10);
  const canGoNext = !isCycleMode && data.to && data.to < today;
  const periodDays = period === 'fortnightly' ? 14 : 7;
  const selectedCycle = cycleList.find((c) => c.id === selectedCycleId);
  const allSettled = data?.all_settled === true;
  const isOpenCycle = selectedCycle?.status === 'open';
  const isPendingSettlement = selectedCycle?.status === 'pending_settlement';
  const canResolve = (isOpenCycle || isPendingSettlement) && allSettled;

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
  const [requestingUserId, setRequestingUserId] = useState(null);
  const [requestSentUserId, setRequestSentUserId] = useState(null);
  const [_requestErrors, setRequestErrors] = useState({});
  const [globalRequestError, setGlobalRequestError] = useState('');
  const [showStartCycleConfirm, setShowStartCycleConfirm] = useState(false);
  const [newCycleStartDate, setNewCycleStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startCycleLoading, setStartCycleLoading] = useState(false);
  const [startCycleError, setStartCycleError] = useState('');
  const [showResolveCycleConfirm, setShowResolveCycleConfirm] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleTarget, setSettleTarget] = useState(null); // optional: pre-selected recipient (from "Settle" button)
  const [settleFromUserId, setSettleFromUserId] = useState(''); // payer; defaults to current user
  const [settleToUserId, setSettleToUserId] = useState(''); // recipient
  const [settlePayerOpen, setSettlePayerOpen] = useState(false);
  const [settlePayerQuery, setSettlePayerQuery] = useState('');
  const [settleRecipientOpen, setSettleRecipientOpen] = useState(false);
  const [settleRecipientQuery, setSettleRecipientQuery] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [settleDate, setSettleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [settleNote, setSettleNote] = useState('');
  const [settleLoading, setSettleLoading] = useState(false);
  const [settleError, setSettleError] = useState('');
  const [settlementList, setSettlementList] = useState([]);

  const currentCycleName = selectedCycle?.name || (selectedCycle ? formatPeriodRange(selectedCycle.start_date, selectedCycle.end_date) : '');
  const todayIso = new Date().toISOString().slice(0, 10);
  const nextCycleStart = selectedCycle?.end_date ? addDays(selectedCycle.end_date, 1) : null;
  const _nextCycleEnd = nextCycleStart ? addDays(nextCycleStart, 13) : null;
  const nextCycleIsFuture = nextCycleStart && nextCycleStart > todayIso;
  const effectiveNextStart = nextCycleIsFuture ? todayIso : nextCycleStart;
  const effectiveNextEnd = effectiveNextStart ? addDays(effectiveNextStart, 13) : null;
  const nextCycleRangeStr = effectiveNextStart && effectiveNextEnd
    ? formatPeriodRange(effectiveNextStart, effectiveNextEnd)
    : '';
  const nextCycleNote = nextCycleIsFuture
    ? 'Current cycle hasn\'t ended yet. New cycle will start from today.'
    : null;
  const balanceStatus =
    netBalance > 0 ? `You're owed ${sym}${Math.abs(netBalance).toFixed(2)}` :
    netBalance < 0 ? `You owe ${sym}${Math.abs(netBalance).toFixed(2)}` :
    'You are settled';

  useEffect(() => {
    if (!globalRequestError) return;
    const t = setTimeout(() => setGlobalRequestError(''), 3000);
    return () => clearTimeout(t);
  }, [globalRequestError]);

  useEffect(() => {
    if (!placeId) return;
    settlementsApi(placeId)
      .list()
      .then((res) => setSettlementList(res.results ?? []))
      .catch(() => setSettlementList([]));
  }, [placeId]);

  async function handleRequestPayment(userId) {
    if (!placeId || !userId) return;
    setRequestErrors((prev) => ({ ...prev, [userId]: '' }));
    setGlobalRequestError('');
    setRequestingUserId(userId);
    try {
      await placesApi.requestPayment(placeId, userId);
      setRequestSentUserId(userId);
      window.setTimeout(() => setRequestSentUserId(null), 3000);
    } catch (err) {
      const msg =
        err?.error ||
        err?.detail ||
        (Array.isArray(err?.detail) ? err.detail[0] : '') ||
        err?.message ||
        'Failed to send payment request';
      setRequestErrors((prev) => ({ ...prev, [userId]: msg }));
      setGlobalRequestError(msg);
    } finally {
      setRequestingUserId(null);
    }
  }

  function openSettleModal(member) {
    const absBal = Math.abs(member.balance);
    const memberOwesMe = member.balance < 0;
    setSettleTarget(member);
    setSettleFromUserId(memberOwesMe ? String(member.user_id ?? '') : String(currentUserId ?? ''));
    setSettleToUserId(memberOwesMe ? String(currentUserId ?? '') : String(member.user_id ?? ''));
    setSettlePayerOpen(false);
    setSettlePayerQuery('');
    setSettleRecipientOpen(false);
    setSettleRecipientQuery('');
    setSettleAmount(String(absBal.toFixed(2)));
    setSettleDate(todayIso);
    setSettleNote('');
    setSettleError('');
    setShowSettleModal(true);
  }

  function openNewPaymentModal() {
    setSettleTarget(null);
    setSettleFromUserId(String(currentUserId ?? ''));
    setSettleToUserId('');
    setSettlePayerOpen(false);
    setSettlePayerQuery('');
    setSettleRecipientOpen(false);
    setSettleRecipientQuery('');
    setSettleAmount('');
    setSettleDate(todayIso);
    setSettleNote('');
    setSettleError('');
    setShowSettleModal(true);
  }

  function closeSettleModal() {
    if (settleLoading) return;
    setShowSettleModal(false);
    setSettleTarget(null);
    setSettleFromUserId('');
    setSettleToUserId('');
    setSettlePayerOpen(false);
    setSettleRecipientOpen(false);
    setSettleRecipientQuery('');
    setSettleError('');
  }

  async function handleSettleConfirm() {
    if (!placeId) return;
    const fromUserId = settleFromUserId ? Number(settleFromUserId) : currentUserId;
    // Recipient is what's in the Recipient field (settleToUserId); settleTarget is the "other" member, not necessarily the recipient
    const toUserId = settleToUserId ? Number(settleToUserId) : null;
    if (!fromUserId) {
      setSettleError('Select a payer');
      return;
    }
    if (!toUserId) {
      setSettleError('Select a recipient');
      return;
    }
    if (fromUserId === toUserId) {
      setSettleError('Payer and recipient must be different');
      return;
    }
    const amount = parseFloat(settleAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setSettleError('Enter a valid amount');
      return;
    }
    setSettleError('');
    setSettleLoading(true);
    try {
      await settlementCreate({
        place_id: placeId,
        from_user_id: fromUserId,
        to_user_id: toUserId,
        amount,
        date: settleDate,
        note: settleNote.trim() || undefined,
        ...(selectedCycleId ? { cycle_id: selectedCycleId } : {}),
      });
      if (settleNote.trim()) recordSettlementNoteUsage(settleNote);
      closeSettleModal();
      if (onRefreshSummary) onRefreshSummary();
      settlementsApi(placeId).list().then((res) => setSettlementList(res.results ?? []));
    } catch (err) {
      let msg = err?.error ?? err?.detail ?? (Array.isArray(err?.detail) ? err.detail[0] : '') ?? err?.message ?? 'Failed to record settlement';
      const str = String(msg || '').toLowerCase();
      if ((str.includes('do not owe') || str.includes('does not owe')) && str.includes('cycle')) {
        msg = `${msg} To record that they paid you, use the "Settle" button next to their name in Member balances.`;
      }
      setSettleError(msg);
      if (typeof err?.max_amount === 'number' && err.max_amount >= 0) {
        setSettleAmount(String(err.max_amount.toFixed(2)));
      }
    } finally {
      setSettleLoading(false);
    }
  }

  return (
    <section
      className="rounded-2xl border border-base-300 p-5 sm:p-6 bg-gradient-to-br from-base-100 via-base-100 to-base-200/50 shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
    >
      <h2 className="text-lg font-semibold text-base-content m-0 mb-5">Financial summary</h2>

      {/* Cycles: start first cycle or cycle selector + resolve / start new */}
      {cycleList.length === 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 mb-6">
          <p className="text-sm text-base-content/80 m-0 mb-3">Track expenses by cycle (e.g. fortnightly or monthly). Resolve when you settle up, then start a new cycle.</p>
          {isPlaceCreator && (
            <button type="button" className="btn btn-primary min-h-11 rounded-lg shadow-soft px-4" onClick={() => { setStartCycleError(''); setNewCycleStartDate(todayIso); setShowStartCycleConfirm(true); }}>
              Start your first cycle
            </button>
          )}
          {!isPlaceCreator && (
            <p className="text-sm text-base-content/60 m-0">Only the person who created this place can start the first cycle.</p>
          )}
        </div>
      )}
      {cycleList.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
            <label htmlFor="summary-cycle" className="text-sm font-medium text-base-content/80 shrink-0">Cycle</label>
            <select
              id="summary-cycle"
              className="select select-bordered w-full sm:max-w-xs min-h-11 rounded-lg border-base-300"
              value={selectedCycleId ?? ''}
              onChange={(e) => setSelectedCycleId(e.target.value ? Number(e.target.value) : null)}
            >
              {(() => {
                const activeCycles = cycleList.filter((c) => c.status === 'open' || c.status === 'pending_settlement');
                if (activeCycles.length === 0) {
                  return <option value="">No active cycle</option>;
                }
                return activeCycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || `${c.start_date} – ${c.end_date}`} {c.status === 'open' ? '(current)' : '(pending settlement)'}
                  </option>
                ));
              })()}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            {isPlaceCreator && (isOpenCycle || isPendingSettlement) && (
              <button
                type="button"
                className="btn btn-outline min-h-11 rounded-lg border-base-300 flex-1 min-w-[calc(50%-4px)] sm:min-w-0 sm:flex-initial"
                onClick={() => canResolve && setShowResolveCycleConfirm(true)}
                disabled={!canResolve}
                title={canResolve ? 'Close this cycle and move to archive' : 'Settle all balances first'}
              >
                Resolve this cycle
              </button>
            )}
            {isPlaceCreator && !isOpenCycle && (
              <button type="button" className="btn btn-primary min-h-11 rounded-lg shadow-soft px-4 flex-1 min-w-[calc(50%-4px)] sm:min-w-0 sm:flex-initial" onClick={() => { setStartCycleError(''); setNewCycleStartDate(todayIso); setShowStartCycleConfirm(true); }}>
                Start new cycle
              </button>
            )}
          </div>
            {!isPlaceCreator && (
            <p className="text-sm text-base-content/60 sm:w-full">Only the place creator can resolve or start a new cycle.</p>
          )}
          {isPendingSettlement && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-base-content/90 w-full">
              This cycle has ended. Record settlements until all balances are zero, then click Resolve this cycle to move it to archive.
            </div>
          )}
        </div>
      )}

      {/* When no active cycle selected, show brand-new empty state (no older data) */}
      {cycleList.length > 0 && selectedCycleId == null && (
        <div className="rounded-xl border border-base-300 p-8 text-center bg-gradient-to-br from-base-100 to-base-200/50">
          <p className="text-base-content/80 m-0 mb-1">No active cycle</p>
          <p className="text-sm text-base-content/60 m-0">Start a new cycle to begin tracking expenses for this place.</p>
        </div>
      )}

      {selectedCycleId != null && (
        <>
      {/* Three summary cards in one row */}
      {showResolveCycleConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="resolve-cycle-dialog-title"
          onClick={() => setShowResolveCycleConfirm(false)}
        >
          <div
            className="bg-base-100 border border-base-300 rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary" aria-hidden>
                  <CheckCircle2 className="h-6 w-6" />
                </span>
                <div>
                  <h3 id="resolve-cycle-dialog-title" className="text-lg font-semibold text-base-content m-0">Resolve this cycle?</h3>
                  <p className="text-sm text-base-content/70 m-0 mt-0.5">All balances are settled. Close this period and move to archive.</p>
                </div>
              </div>
              <div className="space-y-4 text-sm">
                <div className="flex gap-3 rounded-xl bg-base-200/80 p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
                    <CalendarRange className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-base-content/80 m-0 mb-0.5">Cycle</p>
                    <p className="text-base-content font-medium m-0">{currentCycleName}</p>
                    <p className="text-base-content/70 m-0 mt-1 flex items-center gap-1.5">
                      <Scale className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Total: {sym}{totalExpense.toFixed(2)} · {balanceStatus}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 rounded-lg border border-base-300 bg-base-200/50 px-3 py-2.5">
                  <Info className="h-4 w-4 shrink-0 text-primary/80 mt-0.5" aria-hidden />
                  <p className="text-base-content/70 m-0 text-sm leading-snug">
                    This cycle will move to Archive. You can then start a new cycle from today.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-4 border-t border-base-300 bg-base-200/50">
              <button
                type="button"
                className="btn btn-ghost flex-1"
                onClick={() => setShowResolveCycleConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary flex-1"
                onClick={() => {
                  setShowResolveCycleConfirm(false);
                  onResolveCycle?.(selectedCycleId);
                }}
              >
                <Check className="h-4 w-4 mr-1.5 shrink-0" aria-hidden />
                Resolve cycle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settle / New payment modal */}
      {showSettleModal && (
        <>
          <div
            className="fixed inset-0 z-[220] bg-black/40"
            aria-hidden
            onClick={closeSettleModal}
          />
          <div className="fixed inset-0 z-[221] flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none">
            {(() => {
              const meAsMember = { user_id: currentUserId, display_name: currentUser?.display_name || currentUser?.username, username: currentUser?.username, profile_photo: currentUser?.profile_photo };
              const payerOptions = memberList.some((m) => String(m.user_id) === String(currentUserId)) ? memberList : [meAsMember, ...memberList];
              const recipientOptions = memberList.some((m) => String(m.user_id) === String(currentUserId)) ? memberList : [meAsMember, ...memberList];
              const payerPicked = settleFromUserId ? payerOptions.find((m) => String(m.user_id) === String(settleFromUserId)) : meAsMember;
              const recipientPicked = settleToUserId ? recipientOptions.find((m) => String(m.user_id) === String(settleToUserId)) : (settleTarget || null);
              const payerName = payerPicked?.display_name || payerPicked?.username || (String(payerPicked?.user_id) === String(currentUserId) ? 'You' : '') || 'Payer…';
              const recipientName = recipientPicked ? (recipientPicked.display_name || recipientPicked.username || (String(recipientPicked.user_id) === String(currentUserId) ? 'You' : '')) : '';
              const payerPhoto = payerPicked?.profile_photo ?? currentUser?.profile_photo;
              const recipientPhoto = recipientPicked?.profile_photo ?? (String(recipientPicked?.user_id) === String(currentUserId) ? currentUser?.profile_photo : null);
              return (
            <div
              className="pointer-events-auto w-full sm:max-w-md max-h-[85vh] sm:max-h-[80vh] rounded-t-2xl sm:rounded-2xl border border-base-300 bg-surface shadow-card overflow-hidden flex flex-col"
              role="dialog"
              aria-modal="true"
              aria-labelledby="settle-dialog-title"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Mobile grab handle */}
              <div className="sm:hidden pt-2 pb-1 flex justify-center" aria-hidden>
                <div className="h-1 w-10 rounded-full bg-base-300" />
              </div>
              <div className="px-5 pt-5 pb-4 border-b border-border">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 id="settle-dialog-title" className="text-lg font-semibold text-text-primary m-0">
                      New payment
                    </h3>
                    <p className="text-sm text-text-muted m-0 mt-1">
                      Record a payment within <span className="font-medium text-text-secondary">{placeName || 'this place'}</span>.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-square rounded-lg"
                    onClick={closeSettleModal}
                    disabled={settleLoading}
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" aria-hidden />
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-5 overflow-y-auto flex-1 min-h-0">
                {/* Payer / Recipient */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="settle-payer" className="block text-sm font-medium text-text-secondary mb-2">Payer</label>
                    <div className="relative">
                      <button
                        id="settle-payer"
                        type="button"
                        className="w-full h-11 rounded-lg border border-base-300 bg-base-100 px-2 flex items-center gap-2.5 text-left transition-colors hover:bg-base-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
                        onClick={() => { setSettleRecipientOpen(false); setSettlePayerOpen((v) => !v); }}
                        disabled={settleLoading}
                        aria-haspopup="listbox"
                        aria-expanded={settlePayerOpen}
                      >
                        <Avatar username={payerName} photoUrl={payerPhoto} className="!w-7 !h-7  text-xs shrink-0" />
                        <span className={`text-sm truncate flex-1 ${settleFromUserId ? 'text-text-secondary' : 'text-text-muted'}`}>
                          {payerName}
                        </span>
                        <ChevronDown className="w-4 h-4 text-text-muted shrink-0" aria-hidden />
                      </button>
                      {settlePayerOpen && (
                        <div className="absolute z-10 mt-2 w-full rounded-lg border border-base-300 bg-base-100 shadow-xl overflow-hidden">
                          <div className="p-2 border-b border-base-300">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" aria-hidden />
                              <input
                                type="search"
                                value={settlePayerQuery}
                                onChange={(e) => setSettlePayerQuery(e.target.value)}
                                className="input input-bordered w-full min-h-10 rounded-lg border-base-300 pl-9 text-sm"
                                placeholder="Search member…"
                                autoFocus
                              />
                            </div>
                          </div>
                          <ul className="max-h-64 overflow-auto py-1" role="listbox" aria-label="Payers">
                            {payerOptions
                              .filter((m) => String(m.user_id) !== String(settleToUserId))
                              .filter((m) => {
                                const name = `${m.display_name || ''} ${m.username || ''}`.toLowerCase();
                                return name.includes((settlePayerQuery || '').toLowerCase());
                              })
                              .map((m) => {
                                const selected = String(m.user_id) === String(settleFromUserId);
                                return (
                                  <li key={m.user_id}>
                                    <button
                                      type="button"
                                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-base-200 transition-colors ${selected ? 'bg-primary/10' : ''}`}
                                      onClick={() => {
                                        setSettleFromUserId(String(m.user_id));
                                        setSettlePayerOpen(false);
                                        setSettlePayerQuery('');
                                      }}
                                    >
                                      <Avatar username={m.display_name || m.username} photoUrl={m.profile_photo} className="!w-9 !h-9 text-sm" />
                                      <div className="min-w-0 flex-1">
                                        <p className="m-0 text-sm font-medium text-text-primary truncate">{m.display_name || m.username}</p>
                                        <p className="m-0 text-xs text-text-muted">Group member</p>
                                      </div>
                                      {selected && <Check className="w-4 h-4 text-primary shrink-0" aria-hidden />}
                                    </button>
                                  </li>
                                );
                              })}
                            {payerOptions.filter((m) => String(m.user_id) !== String(settleToUserId)).filter((m) => {
                              const name = `${m.display_name || ''} ${m.username || ''}`.toLowerCase();
                              return name.includes((settlePayerQuery || '').toLowerCase());
                            }).length === 0 && (
                              <li className="px-3 py-3 text-sm text-text-muted">No matches</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="settle-recipient" className="block text-sm font-medium text-text-secondary mb-2">Recipient</label>
                    <div className="relative">
                      <button
                        id="settle-recipient"
                        type="button"
                        className="w-full h-11 rounded-lg border border-base-300 bg-base-100 px-2 flex items-center gap-2.5 text-left transition-colors hover:bg-base-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
                        onClick={() => { setSettlePayerOpen(false); setSettleRecipientOpen((v) => !v); }}
                        disabled={settleLoading}
                        aria-haspopup="listbox"
                        aria-expanded={settleRecipientOpen}
                      >
                        {recipientPicked ? (
                          <Avatar username={recipientName} photoUrl={recipientPhoto} className="!w-7 !h-7 text-xs shrink-0" />
                        ) : (
                          <Search className="w-4 h-4 text-text-muted shrink-0" aria-hidden />
                        )}
                        <span className={`text-sm truncate flex-1 ${recipientPicked ? 'text-text-secondary' : 'text-text-muted'}`}>
                          {recipientPicked ? recipientName : 'Recipient…'}
                        </span>
                        <ChevronDown className="w-4 h-4 text-text-muted shrink-0" aria-hidden />
                      </button>

                      {settleRecipientOpen && (
                        <div className="absolute z-10 mt-2 w-full rounded-lg border border-base-300 bg-base-100 shadow-xl overflow-hidden">
                          <div className="p-2 border-b border-base-300">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" aria-hidden />
                              <input
                                type="search"
                                value={settleRecipientQuery}
                                onChange={(e) => setSettleRecipientQuery(e.target.value)}
                                className="input input-bordered w-full min-h-10 rounded-lg border-base-300 pl-9 text-sm"
                                placeholder="Search member…"
                                autoFocus
                              />
                            </div>
                          </div>
                          <ul className="max-h-64 overflow-auto py-1" role="listbox" aria-label="Recipients">
                            {recipientOptions
                              .filter((m) => String(m.user_id) !== String(settleFromUserId))
                              .filter((m) => {
                                const name = `${m.display_name || ''} ${m.username || ''}`.toLowerCase();
                                return name.includes((settleRecipientQuery || '').toLowerCase());
                              })
                              .map((m) => {
                                const selected = String(m.user_id) === String(settleToUserId);
                                return (
                                  <li key={m.user_id}>
                                    <button
                                      type="button"
                                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-base-200 transition-colors ${selected ? 'bg-primary/10' : ''}`}
                                      onClick={() => {
                                        setSettleTarget(null);
                                        setSettleToUserId(String(m.user_id));
                                        setSettleRecipientOpen(false);
                                        setSettleRecipientQuery('');
                                      }}
                                    >
                                      <Avatar username={m.display_name || m.username} photoUrl={m.profile_photo} className="!w-9 !h-9 text-sm" />
                                      <div className="min-w-0 flex-1">
                                        <p className="m-0 text-sm font-medium text-text-primary truncate">{m.display_name || m.username}</p>
                                        <p className="m-0 text-xs text-text-muted">Group member</p>
                                      </div>
                                      {selected && <Check className="w-4 h-4 text-primary shrink-0" aria-hidden />}
                                    </button>
                                  </li>
                                );
                              })}
                            {recipientOptions
                              .filter((m) => String(m.user_id) !== String(settleFromUserId))
                              .filter((m) => {
                                const name = `${m.display_name || ''} ${m.username || ''}`.toLowerCase();
                                return name.includes((settleRecipientQuery || '').toLowerCase());
                              }).length === 0 && (
                              <li className="px-3 py-3 text-sm text-text-muted">No matches</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Amount + Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="settle-amount" className="block text-sm font-medium text-text-secondary mb-2">
                      Amount
                    </label>
                    <div className="flex items-center h-11 rounded-lg border border-base-300 bg-base-100 overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary">
                      <span className="pl-3 text-text-muted font-medium tabular-nums shrink-0">{sym}</span>
                      <input
                        id="settle-amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        className="flex-1 min-w-0 border-0 bg-transparent py-2 px-3 text-base focus:outline-none h-full"
                        value={settleAmount}
                        onChange={(e) => setSettleAmount(e.target.value)}
                        onWheel={(e) => e.target.blur()}
                        disabled={settleLoading}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="settle-date" className="block text-sm font-medium text-text-secondary mb-2">
                      Date
                    </label>
                    <CallyDatePicker
                      id="settle-date"
                      value={settleDate}
                      onChange={(e) => setSettleDate(e.target.value)}
                      disabled={settleLoading}
                      max={todayIso}
                      inputClassName="input input-bordered w-full min-h-11 rounded-lg border-base-300 bg-base-100 pr-10 has-calendar-icon"
                      ariaLabel="Settlement date"
                    />
                  </div>
                </div>

                {/* Within group (read-only context) */}
                <div className="flex items-center justify-between gap-3 rounded-lg border border-base-300 bg-base-100 px-3 py-2">
                  <span className="text-xs font-medium text-text-muted">Within group</span>
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <Users className="w-4 h-4 text-text-muted shrink-0" aria-hidden />
                    <span className="text-sm font-medium text-text-secondary truncate">{placeName || '—'}</span>
                  </span>
                </div>

                <div>
                  <label htmlFor="settle-note" className="block text-sm font-medium text-text-secondary mb-2">
                    Note (optional)
                  </label>
                  <input
                    id="settle-note"
                    type="text"
                    className="input input-bordered w-full min-h-11 rounded-lg border-base-300 bg-base-100"
                    placeholder="e.g. Bank transfer"
                    value={settleNote}
                    onChange={(e) => setSettleNote(e.target.value)}
                    disabled={settleLoading}
                  />
                  <div className="flex flex-wrap gap-2 mt-2" role="group" aria-label="Quick note options">
                    {getSettlementNoteQuickOptions().map((label) => (
                      <button
                        key={label}
                        type="button"
                        className="btn btn-sm btn-outline border-base-300 rounded-full min-h-8 h-8 px-3 text-xs font-medium"
                        disabled={settleLoading}
                        onClick={() => setSettleNote(label)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {settleError && <p className="text-sm text-error m-0">{settleError}</p>}
              </div>

              <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-border bg-base-100/60 flex gap-3">
                <button
                  type="button"
                  className="btn btn-outline min-h-11 rounded-lg border-base-300 flex-1"
                  onClick={closeSettleModal}
                  disabled={settleLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary min-h-11 rounded-lg shadow-soft flex-1"
                  disabled={settleLoading}
                  onClick={handleSettleConfirm}
                >
                  {settleLoading ? (
                    <>
                      <span className="loading loading-spinner loading-sm" aria-hidden />
                      Recording…
                    </>
                  ) : (
                    'Save'
                  )}
                </button>
              </div>
            </div>
              );
            })()}
          </div>
        </>
      )}

      {/* Three summary cards in one row */}
      {(() => {
        const netBalanceDisplay = Math.abs(netBalance) < 0.005 ? 0 : netBalance;
        return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div
          className={`rounded-xl border p-4 shadow-[0_2px_10px_rgba(0,0,0,0.04)] ${
            netBalanceDisplay >= 0
              ? 'border-primary/20 bg-gradient-to-br from-primary/10 via-primary/[0.07] to-primary/5'
              : 'border-error/20 bg-gradient-to-br from-error/10 via-error/[0.07] to-error/5'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${netBalanceDisplay >= 0 ? 'bg-primary/15 text-primary' : 'bg-error/15 text-error'}`} aria-hidden>
              <Scale className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-medium text-base-content/70 m-0">Net balance</h3>
          </div>
          <p className={`text-2xl font-bold m-0 ${netBalanceDisplay >= 0 ? 'text-primary' : 'text-error'}`}>
            {netBalanceDisplay >= 0 ? '+' : ''}{sym}{netBalanceDisplay.toFixed(2)}
          </p>
          <p className="text-sm text-base-content/60 m-0 mt-1">
            {netBalanceDisplay > 0 ? 'You are owed more than you owe.' : netBalanceDisplay < 0 ? 'You owe more than you are owed.' : 'You are settled.'}
          </p>
          {netBalanceDisplay > 0 && (
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
                      <li key={m.user_id} className="truncate">
                        {memberDisplayLabel(m)} owes {sym}{Math.abs(m.balance).toFixed(2)}
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
        );
      })()}

      {/* Period selection (only when not using cycles) */}
      {!isCycleMode && (
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
      )}

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
              <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-center">
                <div className="relative w-[200px] h-[200px] shrink-0 min-w-0 outline-none border-0 shadow-none mx-auto lg:mx-0 [&_.recharts-responsive-container]:outline-none [&_.recharts-responsive-container]:border-0 [&_.recharts-responsive-container]:shadow-none">
                  <ResponsiveContainer width={200} height={200} style={{ outline: 'none', border: 'none', boxShadow: 'none' }}>
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
                <div className="flex flex-col gap-2 min-w-0 w-full lg:flex-1">
                  <div className="flex items-center justify-center gap-2 text-sm flex-wrap lg:justify-start">
                    <span className="w-3 h-3 rounded-full bg-primary shrink-0" aria-hidden />
                    <span className="text-base-content/80 tabular-nums shrink-0">{sym}{myShare.toFixed(2)}</span>
                    <span className="text-base-content/60 min-w-0 break-words">Your share</span>
                  </div>
                  {othersShare > 0 ? (
                    <div className="flex items-center justify-center gap-2 text-sm flex-wrap lg:justify-start">
                      <span className="w-3 h-3 rounded-full bg-base-content/30 shrink-0" aria-hidden />
                      <span className="text-base-content/80 tabular-nums shrink-0">{sym}{othersShare.toFixed(2)}</span>
                      <span className="text-base-content/60 min-w-0 break-words">Others' share</span>
                    </div>
                  ) : (
                    <p className="text-xs text-base-content/50 m-0">No other shares in this period</p>
                  )}
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
                          <Avatar username={memberDisplayLabel(m)} photoUrl={m.profile_photo} />
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
                          <span className="text-sm font-medium text-base-content truncate" title={m.display_name || m.username || m.email}>{memberDisplayLabel(m)}</span>
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
                <div className="h-[200px] w-full min-w-0 outline-none">
                  <ResponsiveContainer width="100%" height={200} style={{ outline: 'none' }}>
                    <BarChart data={[{ name: 'You', paid: totalIPaid, share: myShare }]} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} style={{ outline: 'none' }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => sym + v} />
                      <Tooltip formatter={(value, name) => [sym + Number(value).toFixed(2), name === 'paid' ? 'Paid' : 'Your share']} />
                      <Legend wrapperStyle={{ paddingTop: '8px' }} iconType="square" iconSize={10} />
                      <Bar dataKey="paid" name="Paid" fill={CHART_COLORS.primaryLight} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="share" name="Your share" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: CHART_COLORS.primaryLight }} aria-hidden />
                    <span className="text-base-content/80 tabular-nums">{sym}{totalIPaid.toFixed(2)}</span>
                    <span className="text-base-content/60">Paid</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: CHART_COLORS.primary }} aria-hidden />
                    <span className="text-base-content/80 tabular-nums">{sym}{myShare.toFixed(2)}</span>
                    <span className="text-base-content/60">Your share</span>
                  </span>
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
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-base font-semibold text-base-content m-0">Member balances</h3>
                <button type="button" className="btn btn-outline min-h-11 rounded-lg border-base-300 gap-2 px-4" onClick={openNewPaymentModal}>
                  <Plus className="w-4 h-4 shrink-0" aria-hidden />
                  New payment
                </button>
              </div>
              <ul className="list-none p-0 m-0 space-y-4">
                {memberList.map((m) => {
                  const owesMe = m.balance < 0;
                  const absBal = Math.abs(Number(m.balance));
                  const isSettled = absBal < 0.005;
                  const isRequesting = requestingUserId === m.user_id;
                  const requestSent = requestSentUserId === m.user_id;
                  const buttonLabel = owesMe
                    ? (isRequesting ? 'Requesting…' : requestSent ? 'Request sent' : 'Request payment')
                    : 'Settle';
                  return (
                    <li key={m.user_id} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar username={memberDisplayLabel(m)} photoUrl={m.profile_photo} />
                        <span className="font-medium text-base-content truncate" title={m.display_name || m.username || m.email}>{memberDisplayLabel(m)}</span>
                      </span>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 sm:gap-3">
                        <span className="font-medium text-base-content tabular-nums">
                          {sym}{absBal.toFixed(2)}
                        </span>
                        {!isSettled && (
                          <button
                            type="button"
                            className={`btn min-h-11 rounded-lg gap-2 px-4 ${
                              requestSent
                                ? 'btn-success'
                                : owesMe
                                  ? 'btn-primary shadow-soft'
                                  : 'btn-outline border-base-300'
                            }`}
                            disabled={owesMe ? (isRequesting || requestSent) : false}
                            onClick={() => owesMe ? handleRequestPayment(m.user_id) : openSettleModal(m)}
                          >
                            {buttonLabel}
                          </button>
                        )}
                      </div>
                  </li>
                  );
                })}
              </ul>
              {globalRequestError && (
                <p className="mt-2 text-xs text-error m-0 sm:text-left">
                  {globalRequestError}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
        </>
      )}

      {/* Start new cycle confirmation dialog - outside selectedCycleId so it opens when "No active cycle" */}
      {showStartCycleConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="start-cycle-dialog-title"
          onClick={() => setShowStartCycleConfirm(false)}
        >
          <div
            className="bg-base-100 border border-base-300 rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary" aria-hidden>
                  <PlayCircle className="h-6 w-6" />
                </span>
                <div>
                  <h3 id="start-cycle-dialog-title" className="text-lg font-semibold text-base-content m-0">Start new cycle?</h3>
                  <p className="text-sm text-base-content/70 m-0 mt-0.5">Begin a fresh tracking period</p>
                </div>
              </div>
              <div className="space-y-4 text-sm">
                {selectedCycle && (
                  <div className="flex gap-3 rounded-xl bg-base-200/80 p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
                      <CalendarRange className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-base-content/80 m-0 mb-0.5">Current cycle</p>
                      <p className="text-base-content font-medium m-0">{currentCycleName}</p>
                      <p className="text-base-content/70 m-0 mt-1 flex items-center gap-1.5">
                        <Scale className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Total: {sym}{totalExpense.toFixed(2)} · {balanceStatus}
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-3 rounded-xl bg-primary/5 border border-primary/20 p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary" aria-hidden>
                      <Calendar className="h-4 w-4" />
                    </span>
                    <p className="font-medium text-base-content/80 m-0">New cycle</p>
                  </div>
                  <div>
                    <label htmlFor="new-cycle-start-date" className="block text-sm font-medium text-base-content/70 mb-1.5">Start date</label>
                    <CallyDatePicker
                      id="new-cycle-start-date"
                      value={newCycleStartDate}
                      onChange={(e) => setNewCycleStartDate(e.target.value)}
                      min={todayIso}
                      disabled={startCycleLoading}
                      inputClassName="input input-bordered w-full min-h-11 rounded-lg border-base-300 bg-base-100"
                      ariaLabel="Cycle start date"
                    />
                    <p className="text-base-content/70 text-sm mt-1.5 m-0">
                      {newCycleStartDate && addDays(newCycleStartDate, 13)
                        ? `${formatPeriodRange(newCycleStartDate, addDays(newCycleStartDate, 13))} (14 days)`
                        : '14-day period from chosen date'}
                    </p>
                  </div>
                  {newCycleStartDate && newCycleStartDate < todayIso && (
                    <p className="text-error text-sm m-0 flex items-center gap-1.5">
                      <Info className="h-4 w-4 shrink-0" aria-hidden />
                      Start date cannot be before today.
                    </p>
                  )}
                  {nextCycleNote && (
                    <p className="text-warning text-xs m-0 flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {nextCycleNote}
                    </p>
                  )}
                </div>
                {selectedCycle && (
                  <div className="flex gap-2 rounded-lg border border-base-300 bg-base-200/50 px-3 py-2.5">
                    <Info className="h-4 w-4 shrink-0 text-primary/80 mt-0.5" aria-hidden />
                    <p className="text-base-content/70 m-0 text-sm leading-snug">
                      The current cycle will be closed. New expenses will be added to the new cycle.
                    </p>
                  </div>
                )}
                {startCycleError && (
                  <div className="rounded-lg border border-error/30 bg-error/10 px-3 py-2.5 text-sm text-error">
                    {startCycleError}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 p-4 border-t border-base-300 bg-base-200/50">
              <button
                type="button"
                className="btn btn-ghost flex-1"
                onClick={() => { setShowStartCycleConfirm(false); setStartCycleError(''); }}
                disabled={startCycleLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary flex-1"
                disabled={startCycleLoading || (newCycleStartDate && newCycleStartDate < todayIso)}
                onClick={() => {
                  if (newCycleStartDate && newCycleStartDate < todayIso) return;
                  setStartCycleError('');
                  setStartCycleLoading(true);
                  const p = onStartNewCycle?.(newCycleStartDate || todayIso);
                  if (p && typeof p.then === 'function') {
                    p.then(() => {
                      setShowStartCycleConfirm(false);
                    }).catch((err) => {
                      let msg = err?.detail ?? err?.message;
                      if (msg == null && typeof err === 'object' && !Array.isArray(err)) {
                        const parts = [];
                        for (const [k, v] of Object.entries(err)) {
                          if (k === 'status') continue;
                          const s = Array.isArray(v) ? v.join(' ') : String(v);
                          if (s) parts.push(k === 'detail' ? s : `${k}: ${s}`);
                        }
                        msg = parts.length ? parts.join(' ') : null;
                      }
                      if (msg == null || msg === '') msg = 'Failed to start new cycle';
                      setStartCycleError(Array.isArray(msg) ? msg[0] : msg);
                    }).finally(() => setStartCycleLoading(false));
                  } else {
                    setShowStartCycleConfirm(false);
                    setStartCycleLoading(false);
                  }
                }}
              >
                {startCycleLoading ? (
                  <>
                    <span className="loading loading-spinner loading-sm" aria-hidden />
                    Starting…
                  </>
                ) : (
                  <>
                    <PlayCircle className="h-4 w-4 mr-1.5 shrink-0" aria-hidden />
                    Start new cycle
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}

/**
 * Archive tab: past (resolved) cycles. Select a cycle to view its summary and expenses read-only.
 */
function ArchiveSection({ placeId, placeName: _placeName, cycleList = [], members: _members = [], currentUserId: _currentUserId, currency }) {
  const sym = currency?.symbol ?? '$';
  const resolvedCycles = (cycleList || []).filter((c) => c.status === 'resolved');
  const [selectedCycleId, setSelectedCycleId] = useState(null);
  const [archiveSummary, setArchiveSummary] = useState(null);
  const [archiveExpenses, setArchiveExpenses] = useState([]);
  const [archiveSettlements, setArchiveSettlements] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!placeId || !selectedCycleId) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setLoading(true); });
    Promise.all([
      summary(placeId, { cycle_id: selectedCycleId }),
      expenses(placeId).list({ cycle_id: selectedCycleId, page_size: 100 }),
      settlementsApi(placeId).list().then((r) => r?.results ?? []),
    ])
      .then(([sumData, exData, allSettlements]) => {
        if (cancelled) return;
        setArchiveSummary(sumData);
        const list = Array.isArray(exData) ? exData : (exData?.results ?? []);
        setArchiveExpenses(list);
        const cycle = (cycleList || []).find((c) => c.id === selectedCycleId);
        const inCycle = cycle
          ? allSettlements.filter((s) => {
              const d = s.date;
              return d >= cycle.start_date && d <= cycle.end_date;
            })
          : [];
        setArchiveSettlements(inCycle);
      })
      .catch(() => {
        if (cancelled) return;
        setArchiveSummary(null);
        setArchiveExpenses([]);
        setArchiveSettlements([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [placeId, selectedCycleId, cycleList]);

  function handleArchiveCycleChange(value) {
    const id = value ? Number(value) : null;
    setSelectedCycleId(id);
    if (!id) {
      setArchiveSummary(null);
      setArchiveExpenses([]);
      setArchiveSettlements([]);
    }
  }

  const selectedCycle = resolvedCycles.find((c) => c.id === selectedCycleId);

  return (
    <section className="card bg-base-200 border border-base-300 rounded-xl p-5 sm:p-6 mb-6">
      <h2 className="text-lg font-semibold text-text-primary m-0 mb-2">Archive</h2>
      <p className="text-sm text-text-secondary m-0 mb-6">
        View past cycles and their expenses. Data is read-only.
      </p>

      {resolvedCycles.length === 0 ? (
        <p className="text-sm text-text-secondary m-0">No resolved cycles yet.</p>
      ) : (
        <>
          <label htmlFor="archive-cycle-select" className="block text-sm font-medium text-text-primary mb-2">
            Select a cycle
          </label>
          <select
            id="archive-cycle-select"
            value={selectedCycleId ?? ''}
            onChange={(e) => handleArchiveCycleChange(e.target.value)}
            className="select select-bordered w-full max-w-md rounded-lg mb-6"
          >
            <option value="">— Choose cycle —</option>
            {resolvedCycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || `${c.start_date} – ${c.end_date}`} ✓ Resolved
              </option>
            ))}
          </select>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-text-secondary mb-4">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
              Loading…
            </div>
          )}

          {!loading && selectedCycle && archiveSummary && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Cycle summary card – clear hierarchy and scannable amounts */}
                <div className="rounded-xl border border-base-300 bg-base-100 p-5 shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
                  <h3 className="text-lg font-semibold text-text-primary m-0 mb-3">Cycle summary</h3>
                  <p className="text-sm text-text-secondary mb-4 font-medium">
                    {selectedCycle.name || `${selectedCycle.start_date} – ${selectedCycle.end_date}`}
                  </p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg bg-base-200/60">
                      <span className="text-sm text-text-secondary">Total spent</span>
                      <span className="text-base font-semibold text-text-primary tabular-nums">{sym}{Number(archiveSummary.total_expense ?? 0).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg bg-base-200/60">
                      <span className="text-sm text-text-secondary">Your share</span>
                      <span className="text-base font-semibold text-primary tabular-nums">{sym}{Number(archiveSummary.my_expense ?? 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                {/* Settlement history card */}
                <div className="rounded-xl border border-base-300 bg-base-100 p-5 shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
                  <h3 className="text-lg font-semibold text-text-primary m-0 mb-1">Settlement history</h3>
                  <p className="text-sm text-text-secondary m-0 mb-4">Payments recorded in this cycle.</p>
                  {archiveSettlements.length > 0 ? (
                    <ul className="list-none p-0 m-0 space-y-0">
                      {archiveSettlements.map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3 border-b border-base-200 last:border-b-0">
                          <span className="text-sm text-text-primary">
                            <span className="font-medium">{s.from_user_display_name || 'Someone'}</span>
                            {' paid '}
                            <span className="font-medium">{s.to_user_display_name || 'Someone'}</span>
                            {' '}
                            <span className="font-semibold tabular-nums text-primary">{sym}{Number(s.amount).toFixed(2)}</span>
                          </span>
                          <span className="text-xs text-text-secondary">
                            {s.date}
                            {s.note ? ` · ${s.note}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-text-secondary m-0 py-2">No payments in this cycle.</p>
                  )}
                </div>
              </div>

              {/* Expenses list */}
              <div className="rounded-xl border border-base-300 bg-base-100 overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
                <div className="px-4 py-3 border-b border-base-200 bg-base-200/30">
                  <h3 className="text-lg font-semibold text-text-primary m-0">Expenses ({archiveExpenses.length})</h3>
                </div>
                {archiveExpenses.length === 0 ? (
                  <p className="text-sm text-text-secondary m-0 p-4">No expenses in this cycle.</p>
                ) : (
                  <ul className="list-none p-0 m-0 divide-y divide-base-200">
                    {archiveExpenses.map((exp) => {
                      const paidBy = exp.paid_by?.display_name || exp.paid_by?.username || 'Someone';
                      const catName = exp.category?.name ?? 'Uncategorized';
                      const splitCount = exp.splits?.length ?? 0;
                      return (
                        <li key={exp.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-base-200/30 transition-colors">
                          <span className="flex flex-col min-w-0">
                            <span className="text-sm font-medium text-text-primary truncate">{exp.description || 'Expense'}</span>
                            <span className="text-xs text-text-secondary">
                              {catName} · Paid by {paidBy}{splitCount ? ` · ${splitCount} split${splitCount !== 1 ? 's' : ''}` : ''}
                            </span>
                          </span>
                          <span className="text-sm font-semibold text-text-primary tabular-nums shrink-0">{sym}{Number(exp.amount ?? 0).toFixed(2)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/**
 * About tab: for users who joined by invite (non-owners). Shows place info, members list, and Leave place.
 */
function AboutPlaceSection({ placeId, placeName, members = [], currentUserId, onRefresh }) {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [error, setError] = useState('');

  const sortedMembers = Array.isArray(members)
    ? [...members].sort((a, b) => {
        if (a.role === 'owner' && b.role !== 'owner') return -1;
        if (b.role === 'owner' && a.role !== 'owner') return 1;
        return new Date(a.joined_at || 0) - new Date(b.joined_at || 0);
      })
    : [];

  async function handleLeavePlace() {
    setError('');
    setLeaving(true);
    setShowLeaveConfirm(false);
    try {
      await placesApi.leave(placeId);
      onRefresh();
      navigate('/places');
    } catch (err) {
      setError(err.error || err.message || 'Failed to leave place');
    } finally {
      setLeaving(false);
    }
  }

  return (
    <section className="card bg-base-200 border border-base-300 rounded-xl p-5 sm:p-6 mb-6">
      <h2 className="text-lg font-semibold text-text-primary m-0 mb-2">About this place</h2>
      <p className="text-sm text-text-secondary m-0 mb-6">
        {placeName ? `You joined ${placeName} as a member.` : 'You are a member of this place.'}
      </p>

      {error && <div className="alert alert-error text-sm rounded-lg mb-4">{error}</div>}

      <div className="mb-6">
        <h3 className="text-sm font-semibold text-text-primary m-0 mb-3">Who’s here</h3>
        {sortedMembers.length === 0 ? (
          <p className="text-sm text-text-secondary m-0">No members yet.</p>
        ) : (
          <ul className="list-none p-0 m-0 divide-y divide-base-300 rounded-lg border border-base-300 bg-base-100">
            {sortedMembers.map((m) => {
              const joinedLabel = m.joined_at ? new Date(m.joined_at).toLocaleDateString() : null;
              const isYou = m.user?.id === currentUserId;
              const roleLabel = m.role === 'owner' ? 'Owner' : 'Member';
              const name = m.user?.display_name || m.user?.username || 'Member';
              return (
                <li key={m.id ?? m.user?.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="flex items-center gap-2 min-w-0">
                    <Avatar username={name} photoUrl={m.user?.profile_photo} size="sm" />
                    <span className="flex flex-col min-w-0">
                      <span className="text-sm font-medium text-text-primary truncate">
                        {name}{isYou ? ' (you)' : ''}
                      </span>
                      <span className="text-xs text-text-secondary">
                        {roleLabel}{joinedLabel ? ` • Joined ${joinedLabel}` : ''}
                      </span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowLeaveConfirm(true)}
          disabled={leaving}
          className="btn btn-outline btn-sm border-base-300 text-text-secondary hover:border-error hover:text-error gap-2"
        >
          {leaving ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden /> : null}
          Leave place
        </button>
      </div>

      {/* Leave place confirmation */}
      {showLeaveConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-leave-place-dialog-title"
          onClick={() => setShowLeaveConfirm(false)}
        >
          <div
            className="bg-base-100 border border-base-300 rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-error/15 text-error" aria-hidden>
                  <AlertTriangle className="h-6 w-6" />
                </span>
                <div>
                  <h3 id="about-leave-place-dialog-title" className="text-lg font-semibold text-base-content m-0">Leave this place?</h3>
                  <p className="text-sm text-base-content/70 m-0 mt-0.5">This cannot be undone</p>
                </div>
              </div>
              <p className="text-sm text-base-content/80 m-0">
                You will lose access to all data in this place. You cannot undo this action.
              </p>
            </div>
            <div className="flex gap-3 p-4 border-t border-base-300 bg-base-200/50">
              <button
                type="button"
                className="btn btn-ghost flex-1"
                onClick={() => setShowLeaveConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-error flex-1 gap-2"
                onClick={() => handleLeavePlace()}
                disabled={leaving}
              >
                {leaving ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden /> : <Trash2 className="w-4 h-4 shrink-0" aria-hidden />}
                Leave place
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function InviteSection({ placeId, placeName, inviteEmail, setInviteEmail, inviteList, onRefresh, members = [], currentUserId, isOwner }) {
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [lastJoinLink, setLastJoinLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [removingUserId, setRemovingUserId] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [removeConfirmTarget, setRemoveConfirmTarget] = useState(null); // { userId, name } or null

  const sortedMembers = Array.isArray(members)
    ? [...members].sort((a, b) => {
        if (a.role === 'owner' && b.role !== 'owner') return -1;
        if (b.role === 'owner' && a.role !== 'owner') return 1;
        return new Date(a.joined_at || 0) - new Date(b.joined_at || 0);
      })
    : [];

  const currentMember = sortedMembers.find((m) => m.user?.id === currentUserId);
  const ownerCount = sortedMembers.filter((m) => m.role === 'owner').length;
  const canLeave = currentMember && (currentMember.role !== 'owner' || ownerCount > 1);

  async function handleRemoveMember(userId) {
    setError('');
    setRemovingUserId(userId);
    setRemoveConfirmTarget(null);
    try {
      await placeMembers(placeId).remove(userId);
      onRefresh();
    } catch (err) {
      setError(err.error || err.message || 'Failed to remove member');
    } finally {
      setRemovingUserId(null);
    }
  }

  async function handleLeavePlace() {
    setError('');
    setLeaving(true);
    setShowLeaveConfirm(false);
    try {
      await placesApi.leave(placeId);
      onRefresh();
      navigate('/places');
    } catch (err) {
      setError(err.error || err.message || 'Failed to leave place');
    } finally {
      setLeaving(false);
    }
  }

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
    <section className="card bg-base-200 border border-base-300 rounded-xl p-5 sm:p-6 mb-6">
      <h2 className="text-lg font-semibold text-text-primary m-0 mb-2">{isOwner ? 'Invite members' : 'Members'}</h2>
      {isOwner && (
        <p className="text-sm text-text-secondary m-0 mb-6">Share an invite link. Anyone with the link can join this place.</p>
      )}

      <div className="space-y-6">
        {isOwner && (
        <>
        {/* Share invite link */}
        <div>
          <h3 className="text-sm font-medium text-text-primary m-0 mb-3">Share invite link</h3>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleCopyLink}
              disabled={generating}
              className={`btn btn-outline min-h-11 rounded-lg border-base-300 gap-2 px-4 transition-all duration-300 ${
                copied ? 'border-success bg-success/10 text-success' : ''
              }`}
            >
              {copied ? (
                <Check className="w-4 h-4 shrink-0" aria-hidden />
              ) : (
                <Copy className="w-4 h-4 shrink-0" aria-hidden />
              )}
              <span>{copied ? 'Copied!' : 'Copy link'}</span>
            </button>
            <button
              type="button"
              onClick={handleShare}
              disabled={generating}
              className="btn btn-outline min-h-11 rounded-lg border-base-300 gap-2 px-4"
            >
              <Share2 className="w-4 h-4 shrink-0" aria-hidden />
              Share…
            </button>
            <button
              type="button"
              onClick={handleGenerateLink}
              disabled={generating}
              className="btn btn-outline min-h-11 rounded-lg border-base-300 gap-2 px-4"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="w-4 h-4 shrink-0" aria-hidden />
              )}
              <span>{generating ? 'Generating…' : 'Generate new link'}</span>
            </button>
          </div>
          {lastJoinLink && (
            <div className="mt-4 p-4 bg-base-100 rounded-lg border border-base-300">
              <p className="m-0 text-xs text-text-muted mb-2">Current invite link:</p>
              <code className="block break-all text-sm text-text-secondary">{lastJoinLink}</code>
            </div>
          )}
        </div>
        </>
        )}
      </div>

      {error && <div className="alert alert-error text-sm rounded-lg">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Members list */}
        <div>
          <h3 className="text-sm font-semibold text-text-primary m-0 mb-3">Members</h3>
          {sortedMembers.length === 0 ? (
            <p className="text-sm text-text-secondary m-0">No members yet.</p>
          ) : (
            <ul className="list-none p-0 m-0 divide-y divide-base-300 rounded-lg border border-base-300 bg-base-100">
              {sortedMembers.map((m) => {
                const joinedLabel = m.joined_at ? new Date(m.joined_at).toLocaleDateString() : null;
                const isYou = m.user?.id === currentUserId;
                const roleLabel = m.role === 'owner' ? 'Owner' : 'Member';
                const name = m.user?.display_name || m.user?.username || 'Member';
                const canRemove = isOwner && !isYou && m.user?.id;
                return (
                  <li key={m.id ?? m.user?.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <span className="flex items-center gap-2 min-w-0">
                      <Avatar username={name} photoUrl={m.user?.profile_photo} size="sm" />
                      <span className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-text-primary truncate">
                          {name}{isYou ? ' (you)' : ''}
                        </span>
                        <span className="text-xs text-text-secondary">
                          {roleLabel}{joinedLabel ? ` • Joined ${joinedLabel}` : ''}
                        </span>
                      </span>
                    </span>
                    {canRemove && (
                      <button
                        type="button"
                        onClick={() => setRemoveConfirmTarget({ userId: m.user.id, name })}
                        disabled={removingUserId === m.user.id}
                        className="btn btn-ghost btn-sm text-error hover:bg-error/10 min-h-8 gap-1"
                        aria-label={`Remove ${name}`}
                      >
                        {removingUserId === m.user.id ? (
                          <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="w-4 h-4 shrink-0" aria-hidden />
                        )}
                        <span className="hidden sm:inline">Remove</span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {canLeave && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowLeaveConfirm(true)}
                disabled={leaving}
                className="btn btn-outline btn-sm border-base-300 text-text-secondary hover:border-error hover:text-error gap-2"
              >
                {leaving ? (
                  <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden />
                ) : null}
                Leave place
              </button>
            </div>
          )}
        </div>

        {/* Pending invites - owner only */}
        {isOwner && (
        <div>
          <h3 className="text-sm font-semibold text-text-primary m-0 mb-3">Pending invites</h3>
          {inviteList.length === 0 ? (
            <p className="text-sm text-text-secondary m-0">No pending invites.</p>
          ) : (
            <ul className="list-none p-0 m-0 divide-y divide-base-300 rounded-lg border border-base-300 bg-base-100 text-sm">
              {inviteList.map((inv) => (
                <li key={inv.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                  <span className="flex flex-col min-w-0">
                    <span className="font-medium text-text-primary truncate">
                      {inv.email || 'Link invite'}
                    </span>
                    <span className="text-xs text-text-secondary">
                      Status: {inv.status === 'pending' ? 'Pending' : inv.status}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        )}
      </div>

      {/* Leave place confirmation */}
      {showLeaveConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-place-dialog-title"
          onClick={() => setShowLeaveConfirm(false)}
        >
          <div
            className="bg-base-100 border border-base-300 rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-error/15 text-error" aria-hidden>
                  <AlertTriangle className="h-6 w-6" />
                </span>
                <div>
                  <h3 id="leave-place-dialog-title" className="text-lg font-semibold text-base-content m-0">Leave this place?</h3>
                  <p className="text-sm text-base-content/70 m-0 mt-0.5">This cannot be undone</p>
                </div>
              </div>
              <p className="text-sm text-base-content/80 m-0">
                You will lose access to all data in this place. You cannot undo this action.
              </p>
            </div>
            <div className="flex gap-3 p-4 border-t border-base-300 bg-base-200/50">
              <button
                type="button"
                className="btn btn-ghost flex-1"
                onClick={() => setShowLeaveConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-error flex-1 gap-2"
                onClick={() => handleLeavePlace()}
                disabled={leaving}
              >
                {leaving ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden /> : <Trash2 className="w-4 h-4 shrink-0" aria-hidden />}
                Leave place
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove member confirmation */}
      {removeConfirmTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-member-dialog-title"
          onClick={() => setRemoveConfirmTarget(null)}
        >
          <div
            className="bg-base-100 border border-base-300 rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-error/15 text-error" aria-hidden>
                  <AlertTriangle className="h-6 w-6" />
                </span>
                <div>
                  <h3 id="remove-member-dialog-title" className="text-lg font-semibold text-base-content m-0">Remove member?</h3>
                  <p className="text-sm text-base-content/70 m-0 mt-0.5">This cannot be undone</p>
                </div>
              </div>
              <p className="text-sm text-base-content/80 m-0">
                You are about to remove <strong>{removeConfirmTarget.name}</strong> from this place. They will lose access to all data here. This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 p-4 border-t border-base-300 bg-base-200/50">
              <button
                type="button"
                className="btn btn-ghost flex-1"
                onClick={() => setRemoveConfirmTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-error flex-1 gap-2"
                onClick={() => handleRemoveMember(removeConfirmTarget.userId)}
                disabled={removingUserId === removeConfirmTarget.userId}
              >
                {removingUserId === removeConfirmTarget.userId ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden /> : <Trash2 className="w-4 h-4 shrink-0" aria-hidden />}
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
