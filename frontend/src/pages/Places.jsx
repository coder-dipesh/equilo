import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { places as placesApi } from '../api';
import {
  Home,
  Plus,
  Users,
  Building2,
  Sparkles,
  Loader2,
  ChevronRight,
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
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

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
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 text-primary animate-spin" aria-hidden />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero / welcome */}
      <div className="text-center sm:text-left">
        <h1 className="text-h1 text-text-primary m-0 mb-1 flex items-center justify-center sm:justify-start gap-2">
          <Home className="w-8 h-8 text-primary shrink-0" aria-hidden />
          Your places
        </h1>
        <p className="text-body text-text-secondary m-0 flex items-center justify-center sm:justify-start gap-1.5">
          <Sparkles className="w-4 h-4 text-primary/80 shrink-0" aria-hidden />
          Split bills with your place
        </p>
      </div>

      {/* Create new place */}
      <div className="rounded-2xl border border-base-300 bg-surface shadow-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-text-primary m-0 mb-3">Create a new place</h2>
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Apartment 4B, House share"
            className="input input-bordered flex-1 bg-base-100"
            disabled={creating}
            aria-label="New place name"
          />
          <button type="submit" className="btn btn-primary shrink-0" disabled={creating || !newName.trim()}>
            {creating ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Plus className="w-4 h-4" aria-hidden />}
            {creating ? 'Creating…' : 'Add place'}
          </button>
        </form>
        {error && <p className="text-sm text-error mt-2 m-0">{error}</p>}
      </div>

      {/* Place list */}
      {places.length === 0 ? (
        <div className="rounded-2xl border border-base-300 bg-surface shadow-card p-10 text-center">
          <Building2 className="w-14 h-14 text-base-300 mx-auto mb-4" aria-hidden />
          <p className="text-text-secondary m-0 mb-1">No places yet</p>
          <p className="text-sm text-text-muted m-0">Create one above to start splitting bills with your housemates.</p>
        </div>
      ) : (
        <div>
          <h2 className="text-lg font-semibold text-text-primary m-0 mb-3">Your places</h2>
          <ul className="list-none p-0 m-0 grid gap-3">
            {places.map((place) => (
              <li key={place.id}>
                <Link
                  to={`/places/${place.id}`}
                  className="flex items-center gap-4 p-4 rounded-xl border border-base-300 bg-surface shadow-card hover:border-primary/30 transition-colors"
                >
                  <div className="rounded-lg bg-primary/10 text-primary p-3 shrink-0">
                    <Building2 className="w-6 h-6" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-text-primary truncate m-0">{place.name}</h3>
                    <StackedMemberAvatars members={place.members} totalCount={place.member_count ?? place.members?.length ?? 0} />
                  </div>
                  <ChevronRight className="w-5 h-5 text-text-muted shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
