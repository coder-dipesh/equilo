import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { places as placesApi } from '../api';
import {
  Home,
  Plus,
  Users,
  LogOut,
  Building2,
  Sparkles,
  Loader2,
  ChevronRight,
} from 'lucide-react';

function UserAvatar({ username, size = 'md' }) {
  const initial = username ? username.charAt(0).toUpperCase() : '?';
  const sizeClass = size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-lg';
  return (
    <div
      className={`rounded-full bg-primary/20 text-primary flex items-center justify-center font-semibold ring-2 ring-base-300 shrink-0 ${sizeClass}`}
      aria-hidden="true"
    >
      <span>{initial}</span>
    </div>
  );
}

export default function Places() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const logoutRef = useRef(null);

  useEffect(() => {
    placesApi.list()
      .then(setPlaces)
      .catch(() => setPlaces([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!logoutConfirm) return;
    function handleClose(e) {
      if (logoutRef.current && !logoutRef.current.contains(e.target)) setLogoutConfirm(false);
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setLogoutConfirm(false);
    }
    document.addEventListener('click', handleClose);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('click', handleClose);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [logoutConfirm]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setError('');
    setCreating(true);
    try {
      const place = await placesApi.create(newName.trim());
      setPlaces((p) => [place, ...p]);
      setNewName('');
      navigate(`/places/${place.id}`);
    } catch (err) {
      setError(err.name?.[0] || err.message || 'Failed to create place');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="pb-8" role="main" aria-label="My places dashboard">
      {/* Skip link for keyboard/screen reader */}
      <a
        href="#dashboard-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-20 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-content focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
      >
        Skip to main content
      </a>

      {/* Header */}
      <header
        className="flex items-center justify-between gap-3 mb-8 animate-fade-in"
        role="banner"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary" aria-hidden="true">
              <Home className="w-5 h-5" />
            </span>
            <h1 className="text-h2 m-0 truncate">My places</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 relative" ref={logoutRef}>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-base-200/80 border border-base-300">
            <UserAvatar username={user?.username} size="sm" />
            <span className="text-sm font-medium truncate max-w-[120px]" title={user?.username}>
              {user?.username}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="sm:hidden">
              <UserAvatar username={user?.username} size="sm" />
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square"
              onClick={() => setLogoutConfirm(!logoutConfirm)}
              aria-label={logoutConfirm ? 'Cancel logout' : 'Log out'}
              aria-expanded={logoutConfirm}
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
            </button>
            {logoutConfirm && (
              <div className="absolute right-0 top-full mt-2 z-20 flex flex-col gap-1 p-2 rounded-lg bg-base-200 border border-base-300 shadow-lg animate-fade-in min-w-[140px]">
                <span className="text-xs px-2 py-1 opacity-80">Log out?</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => setLogoutConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-error btn-xs"
                    onClick={() => { setLogoutConfirm(false); logout(); }}
                  >
                    Log out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div id="dashboard-main" className="space-y-6" tabIndex={-1}>
        {/* Create a place card */}
        <section
          className="card bg-base-200 border border-base-300 rounded-2xl p-5 sm:p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:border-primary/20 animate-fade-in-up"
          aria-labelledby="create-place-heading"
          style={{ animationDelay: '0.05s' }}
        >
          <div className="flex items-start gap-3 mb-4">
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/15 text-primary shrink-0" aria-hidden="true">
              <Plus className="w-5 h-5" />
            </span>
            <div>
              <h2 id="create-place-heading" className="text-h3 m-0">Create a place</h2>
              <p className="text-small text-text-secondary mt-0.5 mb-0">
                A shared apartment or house. Create one and invite your flatmates.
              </p>
            </div>
          </div>
          <form
            onSubmit={handleCreate}
            className="flex flex-col sm:flex-row gap-3"
            aria-describedby={error ? 'create-error' : undefined}
          >
            <label htmlFor="place-name" className="sr-only">Place name</label>
            <input
              id="place-name"
              type="text"
              placeholder="e.g. Sunset Apartment"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={creating}
              className="input input-bordered flex-1 w-full transition-shadow focus:ring-2 focus:ring-primary/30"
              autoComplete="off"
              aria-invalid={!!error}
              aria-describedby={error ? 'create-error' : undefined}
            />
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="btn btn-primary min-h-12 sm:min-h-10 transition-transform active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100"
              aria-busy={creating}
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
                  <span>Creating…</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Create</span>
                </>
              )}
            </button>
          </form>
          {error && (
            <p id="create-error" className="text-error text-sm mt-2 flex items-center gap-1.5" role="alert">
              {error}
            </p>
          )}
        </section>

        {/* Your places list */}
        <section aria-labelledby="your-places-heading" className="animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <h2 id="your-places-heading" className="text-h3 m-0 mb-3 flex items-center gap-2">
            <Building2 className="w-5 h-5 opacity-80" aria-hidden="true" />
            Your places
          </h2>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-base-content/70" role="status" aria-live="polite">
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              <span>Loading places…</span>
            </div>
          ) : places.length === 0 ? (
            <div
              className="rounded-2xl border border-dashed border-base-300 bg-base-200/50 p-8 text-center animate-fade-in"
              role="status"
            >
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-40" aria-hidden="true" />
              <p className="opacity-80 text-sm m-0">
                No places yet. Create one above or ask for an invite link to join someone else's.
              </p>
            </div>
          ) : (
            <ul className="list-none p-0 m-0 space-y-2" role="list">
              {places.map((place, index) => (
                <li
                  key={place.id}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${0.12 + index * 0.04}s` }}
                >
                  <Link
                    to={`/places/${place.id}`}
                    className="group flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-4 rounded-xl border border-base-300 bg-base-200/60 no-underline text-inherit transition-all duration-200 hover:bg-base-300 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-100 active:scale-[0.99]"
                    aria-label={`Open ${place.name}, ${place.member_count} member${place.member_count !== 1 ? 's' : ''}`}
                  >
                    <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary shrink-0 group-hover:bg-primary/20 transition-colors" aria-hidden="true">
                      <Home className="w-5 h-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold block truncate">{place.name}</span>
                      <span className="text-sm opacity-70 flex items-center gap-1.5 mt-0.5">
                        <Users className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        {place.member_count} member{place.member_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <ChevronRight className="w-5 h-5 shrink-0 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
