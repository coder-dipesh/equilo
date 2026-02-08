import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { places as placesApi } from '../api';

export default function Places() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    placesApi.list()
      .then(setPlaces)
      .catch(() => setPlaces([]))
      .finally(() => setLoading(false));
  }, []);

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
    <div className="page">
      <header className="header">
        <h1>My places</h1>
        <div className="header-actions">
          <span className="user">{user?.username}</span>
          <button type="button" className="btn secondary" onClick={logout}>Log out</button>
        </div>
      </header>

      <section className="card">
        <h2>Create a place</h2>
        <p className="muted">A place is your shared apartment or house. Create one and invite your flatmates.</p>
        <form onSubmit={handleCreate} className="form-inline">
          <input
            type="text"
            placeholder="e.g. Sunset Apartment"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={creating}
          />
          <button type="submit" disabled={creating || !newName.trim()}>Create</button>
        </form>
        {error && <div className="error">{error}</div>}
      </section>

      <section>
        <h2>Your places</h2>
        {loading ? (
          <p>Loading…</p>
        ) : places.length === 0 ? (
          <p className="muted">No places yet. Create one above or ask for an invite link to join someone else's.</p>
        ) : (
          <ul className="list">
            {places.map((place) => (
              <li key={place.id}>
                <Link to={`/places/${place.id}`} className="list-item">
                  <span className="list-item-title">{place.name}</span>
                  <span className="muted">{place.member_count} member{place.member_count !== 1 ? 's' : ''}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
