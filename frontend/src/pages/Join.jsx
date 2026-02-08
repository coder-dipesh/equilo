import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { inviteByToken, joinPlace } from '../api';

export default function Join() {
  const { token } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [inviteInfo, setInviteInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    inviteByToken(token)
      .then(setInviteInfo)
      .catch(() => setInviteInfo(null))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleJoin() {
    if (!user) {
      navigate(`/login?next=/join/${token}`);
      return;
    }
    setError('');
    setJoining(true);
    try {
      const place = await joinPlace(token);
      navigate(`/places/${place?.id || ''}`);
    } catch (err) {
      setError(err.error || err.message || 'Failed to join');
    } finally {
      setJoining(false);
    }
  }

  if (loading) return <div className="page"><p>Loading…</p></div>;
  if (!inviteInfo || !inviteInfo.place_name) {
    return (
      <div className="page">
        <p>Invalid or expired invite link.</p>
        <Link to="/">Go home</Link>
      </div>
    );
  }

  return (
    <div className="page auth-page">
      <h1>Join a place</h1>
      <p>You've been invited to join <strong>{inviteInfo.place_name}</strong>.</p>
      {!user ? (
        <p>
          <Link to={`/login?next=/join/${token}`}>Log in</Link> or <Link to={`/register?next=/join/${token}`}>sign up</Link> to join.
        </p>
      ) : (
        <>
          {error && <div className="error">{error}</div>}
          <button type="button" className="btn primary" onClick={handleJoin} disabled={joining}>
            {joining ? 'Joining…' : 'Join place'}
          </button>
        </>
      )}
      <p className="auth-footer"><Link to="/">Back to places</Link></p>
    </div>
  );
}
