import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { places as placesApi } from '../api';
import { useAuth } from '../AuthContext';
import { Skeleton } from '../components/Skeleton';
import {
  Home,
  Plus,
  Users,
  Building2,
  Sparkles,
  Loader2,
  ChevronRight,
  Trash2,
  MoreVertical,
  Pencil,
} from 'lucide-react';

function UserAvatar({ username, size = 'md', className = '' }) {
  const initial = username ? username.charAt(0).toUpperCase() : '?';
  const sizeClass =
    size === 'xs' ? 'w-6 h-6 text-xs' :
    size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-lg';
  return (
    <div
      className={`rounded-full bg-primary/20 text-primary flex items-center justify-center font-semibold ring-2 ring-base-100 shrink-0 ${sizeClass} ${className}`}
      aria-hidden="true"
    >
      <span>{initial}</span>
    </div>
  );
}

function StackedMemberAvatars({ members, totalCount, maxShow = 4 }) {
  const list = Array.isArray(members) ? members.slice(0, maxShow) : [];
  if (list.length === 0 && totalCount === 0) return null;
  return (
    <span className="flex items-center gap-1.5">
      {list.length > 0 ? (
        <span className="flex -space-x-2" aria-hidden="true">
          {list.map((m) => (
            <span key={m.id ?? m.user?.id} className="inline-block ring-2 ring-base-100 rounded-full">
              <UserAvatar username={m.user?.display_name || m.user?.username} size="xs" />
            </span>
          ))}
        </span>
      ) : (
        <Users className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden="true" />
      )}
      <span>
        {totalCount} member{totalCount !== 1 ? 's' : ''}
      </span>
    </span>
  );
}

export default function Places() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [menuOpen, setMenuOpen] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null); // { top, left, right } for positioning dropdown
  const [editTarget, setEditTarget] = useState(null);
  const [editName, setEditName] = useState('');
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState('');

  const myPlaces = places.filter((p) => {
    const creatorId = typeof p.created_by === 'object' ? p.created_by?.id : p.created_by;
    return user?.id != null && creatorId === user.id;
  });
  const joinedPlaces = places.filter((p) => {
    const creatorId = typeof p.created_by === 'object' ? p.created_by?.id : p.created_by;
    return user?.id != null && creatorId !== user.id;
  });

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteError('');
    setDeleting(true);
    try {
      await placesApi.delete(deleteTarget.id);
      setPlaces((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err.detail || err.message || 'Failed to delete place');
    } finally {
      setDeleting(false);
    }
  }

  async function handleEditSave() {
    if (!editTarget) return;
    const name = editName.trim();
    if (!name) return;
    setEditError('');
    setEditing(true);
    try {
      const updated = await placesApi.update(editTarget.id, { name });
      setPlaces((prev) => prev.map((p) => (p.id === editTarget.id ? { ...p, ...updated } : p)));
      setEditTarget(null);
      setEditName('');
    } catch (err) {
      setEditError(err.name?.[0] || err.detail || err.message || 'Failed to update place');
    } finally {
      setEditing(false);
    }
  }

  function PlaceRow({ place }) {
    const creatorId = typeof place.created_by === 'object' ? place.created_by?.id : place.created_by;
    const isOwner = user?.id != null && creatorId === user.id;
    const ownerMember = Array.isArray(place.members)
      ? place.members.find((m) => m.role === 'owner')
      : null;
    const createdByName = ownerMember?.user?.display_name || ownerMember?.user?.username || null;
    const [swipeOffset, setSwipeOffset] = useState(0);
    const touchStartRef = useRef(null);
    const justSwipedRef = useRef(false);
    const ACTION_WIDTH = 140;

    function handleSwipeStart(e) {
      touchStartRef.current = e.touches[0].clientX;
    }
    function handleSwipeMove(e) {
      if (touchStartRef.current == null) return;
      const delta = touchStartRef.current - e.touches[0].clientX;
      const maxReveal = isOwner ? ACTION_WIDTH : 0;
      setSwipeOffset(Math.min(0, Math.max(-maxReveal, -delta)));
    }
    function handleSwipeEnd() {
      if (touchStartRef.current == null) return;
      touchStartRef.current = null;
      if (swipeOffset < -ACTION_WIDTH / 2) {
        setSwipeOffset(-ACTION_WIDTH);
        justSwipedRef.current = true;
        setTimeout(() => { justSwipedRef.current = false; }, 300);
      } else {
        setSwipeOffset(0);
      }
    }

    function openEdit() {
      setMenuOpen(null);
      setEditTarget(place);
      setEditName(place.name);
      setEditError('');
    }
    function openDelete() {
      setMenuOpen(null);
      setDeleteTarget(place);
      setDeleteError('');
    }

    const cardContent = (
      <>
        <div className="rounded-lg bg-primary/10 text-primary p-2.5 sm:p-3 shrink-0">
          <Building2 className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-text-primary truncate m-0 text-sm sm:text-base">{place.name}</h3>
          <div className="flex flex-col gap-0.5 mt-0.5">
            <StackedMemberAvatars members={place.members} totalCount={place.member_count ?? place.members?.length ?? 0} />
            {createdByName && (
              <p className="text-xs text-text-muted m-0 truncate">
                Created by {createdByName}{isOwner ? ' (you)' : ''}
              </p>
            )}
          </div>
        </div>
      </>
    );

    const swipeActions = isOwner && (
      <div className="flex shrink-0">
        <button
          type="button"
          className="flex flex-col items-center justify-center gap-1 w-[70px] min-h-full bg-base-300 hover:bg-base-300/90 active:opacity-90 text-base-content border-0 rounded-none"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSwipeOffset(0); openEdit(); }}
          aria-label="Edit place"
        >
          <Pencil className="w-5 h-5 shrink-0" aria-hidden />
          <span className="text-xs font-medium">Edit</span>
        </button>
        <button
          type="button"
          className="flex flex-col items-center justify-center gap-1 w-[70px] min-h-full bg-error hover:bg-error/90 active:opacity-90 text-error-content border-0 rounded-none"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSwipeOffset(0); openDelete(); }}
          aria-label="Delete place"
        >
          <Trash2 className="w-5 h-5 shrink-0" aria-hidden />
          <span className="text-xs font-medium">Delete</span>
        </button>
      </div>
    );

    if (isOwner) {
      return (
        <li key={place.id} className="min-w-0">
          <div
            className="w-full min-w-0 overflow-hidden rounded-xl border border-base-300 bg-surface shadow-card"
            onTouchStart={handleSwipeStart}
            onTouchMove={handleSwipeMove}
            onTouchEnd={handleSwipeEnd}
            onTouchCancel={handleSwipeEnd}
          >
            <div
              className="flex transition-transform duration-150 ease-out"
              style={{ width: `calc(100% + ${ACTION_WIDTH}px)`, transform: `translateX(${swipeOffset}px)` }}
            >
              <Link
                to={`/places/${place.id}`}
                className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 min-w-0 flex-1 hover:border-primary/30 transition-colors"
                onClick={(e) => {
                  if (justSwipedRef.current) {
                    e.preventDefault();
                    justSwipedRef.current = false;
                  }
                }}
              >
                {cardContent}
              </Link>
              <div className="flex items-center shrink-0 pr-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-square rounded-lg"
                  title="Place actions"
                  aria-label="Place actions"
                  aria-expanded={menuOpen === place.id}
                  aria-haspopup="dialog"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (menuOpen === place.id) {
                      setMenuOpen(null);
                      setMenuAnchor(null);
                    } else {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setMenuAnchor({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                      setMenuOpen(place.id);
                    }
                  }}
                >
                  <MoreVertical className="w-5 h-5 text-text-muted" aria-hidden />
                </button>
              </div>
              {swipeActions}
            </div>
          </div>
        </li>
      );
    }

    return (
      <li key={place.id}>
        <Link
          to={`/places/${place.id}`}
          className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-base-300 bg-surface shadow-card hover:border-primary/30 transition-colors"
        >
          {cardContent}
          <ChevronRight className="w-5 h-5 text-text-muted shrink-0" aria-hidden />
        </Link>
      </li>
    );
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    placesApi
      .list()
      .then((data) => { if (!cancelled) setPlaces(Array.isArray(data) ? data : []); })
      .catch((err) => { if (!cancelled) setError(err.detail || err.message || 'Failed to load places'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setError('');
    setCreating(true);
    try {
      const place = await placesApi.create(name);
      setPlaces((prev) => [place, ...prev]);
      setNewName('');
      navigate(`/places/${place.id}`);
    } catch (err) {
      setError(err.name?.[0] || err.detail || err.message || 'Failed to create place');
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 sm:space-y-8 animate-fade-in">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs sm:text-sm text-text-muted min-w-0">
          <Skeleton className="h-4 w-12" />
          <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-text-muted/50" aria-hidden />
          <Skeleton className="h-4 w-24" />
        </nav>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Skeleton className="h-7 w-7 rounded" />
            <Skeleton className="h-8 w-32 sm:w-48" />
          </div>
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <div className="rounded-2xl border border-base-300 bg-surface shadow-card p-3 sm:p-6">
          <Skeleton className="h-5 w-40 mb-3" />
          <div className="flex flex-col sm:flex-row gap-3">
            <Skeleton className="h-12 flex-1 rounded-lg" />
            <Skeleton className="h-12 w-full sm:w-28 rounded-lg" />
          </div>
        </div>
        <div className="space-y-6">
          <section className="rounded-2xl border border-base-300 bg-surface shadow-card p-3 sm:p-6">
            <Skeleton className="h-5 w-24 mb-4" />
            <ul className="list-none p-0 m-0 grid gap-3">
              {[1, 2, 3].map((i) => (
                <li key={i} className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-base-300">
                  <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-full max-w-[180px]" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-5 rounded shrink-0" />
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-base-300 bg-surface shadow-card p-3 sm:p-6">
            <Skeleton className="h-5 w-32 mb-4" />
            <ul className="list-none p-0 m-0 grid gap-3">
              {[1, 2].map((i) => (
                <li key={i} className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-base-300">
                  <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-full max-w-[160px]" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <Skeleton className="h-5 w-5 rounded shrink-0" />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 min-w-0 overflow-x-hidden">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs sm:text-sm text-text-muted min-w-0">
        <Link to="/" className="link link-hover text-text-secondary hover:text-primary truncate">Home</Link>
        <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" aria-hidden />
        <span className="text-text-primary font-medium truncate" aria-current="page">Place</span>
      </nav>
      {/* Hero – compact on mobile, balanced title + icons */}
      <div>
        <h1 className="text-xl sm:text-2xl md:text-h1 text-text-primary m-0 mb-0.5 sm:mb-1 flex items-center gap-2 flex-wrap">
          <Home className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-primary shrink-0" aria-hidden />
          <span className="leading-tight">Place</span>
        </h1>
        <p className="text-sm sm:text-base text-text-secondary m-0 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary/80 shrink-0" aria-hidden />
          Split bills with your place
        </p>
      </div>

      {/* Create new place */}
      <div className="rounded-2xl border border-base-300 bg-surface shadow-card p-3 sm:p-6">
        <h2 className="text-base sm:text-lg font-semibold text-text-primary m-0 mb-3">Create a new place</h2>
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Apartment 4B, House share"
            className="input input-bordered flex-1 bg-base-100 min-h-[44px] text-base rounded-lg w-full"
            disabled={creating}
            aria-label="New place name"
          />
          <button type="submit" className="btn btn-primary shrink-0 min-h-12 rounded-lg w-full sm:w-auto" disabled={creating || !newName.trim()}>
            {creating ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Plus className="w-4 h-4" aria-hidden />}
            {creating ? 'Creating…' : 'Add place'}
          </button>
        </form>
        {error && <p className="text-sm text-error mt-2 m-0">{error}</p>}
      </div>

      {/* Place list – grouped in sections */}
      {places.length === 0 ? (
        <div className="rounded-2xl border border-base-300 bg-surface shadow-card p-6 sm:p-10 text-center">
          <Building2 className="w-14 h-14 text-base-300 mx-auto mb-4" aria-hidden />
          <p className="text-text-secondary m-0 mb-1">No places yet</p>
          <p className="text-sm text-text-muted m-0">Create one above to start splitting bills with your housemates.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* My places section */}
          <section className="rounded-2xl border border-base-300 bg-surface shadow-card p-3 sm:p-6 min-w-0" aria-labelledby="my-places-heading">
            <h2 id="my-places-heading" className="text-base sm:text-lg font-semibold text-text-primary m-0 mb-3 sm:mb-4">My places</h2>
            {myPlaces.length === 0 ? (
              <p className="text-sm text-text-secondary m-0">No places created by you yet.</p>
            ) : (
              <ul className="list-none p-0 m-0 grid gap-3 min-w-0">
                {myPlaces.map((place) => (
                  <PlaceRow key={place.id} place={place} />
                ))}
              </ul>
            )}
          </section>

          {/* Joined places section */}
          <section className="rounded-2xl border border-base-300 bg-surface shadow-card p-3 sm:p-6 min-w-0" aria-labelledby="joined-places-heading">
            <h2 id="joined-places-heading" className="text-base sm:text-lg font-semibold text-text-primary m-0 mb-3 sm:mb-4">Joined places</h2>
            {joinedPlaces.length === 0 ? (
              <p className="text-sm text-text-secondary m-0">No places joined yet.</p>
            ) : (
              <ul className="list-none p-0 m-0 grid gap-3 min-w-0">
                {joinedPlaces.map((place) => (
                  <PlaceRow key={place.id} place={place} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* Place actions dropdown (Edit / Delete) – positioned under three-dots */}
      {menuOpen && menuAnchor &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[10000] bg-transparent"
              aria-hidden
              onClick={() => { setMenuOpen(null); setMenuAnchor(null); }}
            />
            <div
              className="fixed z-[10001] w-[min(calc(100vw-2rem),200px)] rounded-xl bg-base-100 border border-base-300 shadow-xl p-2"
              style={{ top: menuAnchor.top, right: menuAnchor.right }}
              role="menu"
              aria-label="Place actions"
            >
              <button
                type="button"
                className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm hover:bg-base-200 rounded-xl transition-colors"
                onClick={() => {
                  const p = places.find((x) => x.id === menuOpen);
                  if (p) {
                    setMenuOpen(null);
                    setMenuAnchor(null);
                    setEditTarget(p);
                    setEditName(p.name);
                    setEditError('');
                  }
                }}
              >
                <Pencil className="w-4 h-4 shrink-0 text-primary" /> Edit
              </button>
              <button
                type="button"
                className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-error hover:bg-error/10 rounded-xl transition-colors"
                onClick={() => {
                  const p = places.find((x) => x.id === menuOpen);
                  if (p) {
                    setMenuOpen(null);
                    setMenuAnchor(null);
                    setDeleteTarget(p);
                    setDeleteError('');
                  }
                }}
              >
                <Trash2 className="w-4 h-4 shrink-0" /> Delete
              </button>
            </div>
          </>,
          document.body
        )}

      {/* Edit place modal */}
      {editTarget &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[10000] bg-black/30"
              aria-hidden
              onClick={() => (!editing ? setEditTarget(null) : null)}
            />
            <div
              className="fixed left-1/2 top-1/2 z-[10001] w-[min(calc(100vw-2rem),420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-base-100 border border-base-300 shadow-xl p-5"
              role="dialog"
              aria-modal="true"
              aria-label="Edit place name"
            >
              <h2 className="text-lg font-semibold text-text-primary m-0 mb-1">Edit place name</h2>
              <p className="text-sm text-text-secondary m-0 mb-4">
                Change the name of <span className="font-semibold text-text-primary">{editTarget.name}</span>
              </p>
              <form onSubmit={(e) => { e.preventDefault(); handleEditSave(); }}>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Place name"
                  className="input input-bordered w-full bg-base-100 min-h-[44px] text-base rounded-lg mb-4"
                  disabled={editing}
                  aria-label="Place name"
                  autoFocus
                />
                {editError && <p className="text-sm text-error m-0 mb-3">{editError}</p>}
                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm rounded-lg"
                    onClick={() => setEditTarget(null)}
                    disabled={editing}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm rounded-lg flex items-center gap-2"
                    disabled={editing || !editName.trim() || editName.trim() === editTarget.name}
                  >
                    {editing ? <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden /> : null}
                    {editing ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </>,
          document.body
        )}

      {/* Delete confirmation modal */}
      {deleteTarget &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[10000] bg-black/30"
              aria-hidden
              onClick={() => (!deleting ? setDeleteTarget(null) : null)}
            />
            <div
              className="fixed left-1/2 top-1/2 z-[10001] w-[min(calc(100vw-2rem),420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-base-100 border border-base-300 shadow-xl p-5"
              role="dialog"
              aria-modal="true"
              aria-label="Delete place"
            >
              <h2 className="text-lg font-semibold text-text-primary m-0 mb-1">Delete place?</h2>
              <p className="text-sm text-text-secondary m-0 mb-4">
                This will permanently delete <span className="font-semibold text-text-primary">{deleteTarget.name}</span> and all its expenses and members.
              </p>
              {deleteError && <p className="text-sm text-error m-0 mb-3">{deleteError}</p>}
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm rounded-lg"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-error btn-sm rounded-lg"
                  onClick={confirmDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
