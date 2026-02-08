import { useState, useEffect, useRef } from 'react';
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
  const [expiredError, setExpiredError] = useState('');
  const autoJoinDone = useRef(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    setExpiredError('');
    inviteByToken(token)
      .then((data) => {
        setInviteInfo(data);
        setExpiredError('');
      })
      .catch((err) => {
        setInviteInfo(null);
        setExpiredError(err.error || '');
      })
      .finally(() => setLoading(false));
  }, [token]);

  // When user lands here after login/signup (user + valid invite), auto-join and redirect to the place
  useEffect(() => {
    if (!token || !user || !inviteInfo?.place_name || loading || autoJoinDone.current) return;
    autoJoinDone.current = true;
    setJoining(true);
    setError('');
    joinPlace(token)
      .then((place) => {
        navigate(`/places/${place?.id ?? ''}`, { replace: true });
      })
      .catch((err) => {
        setError(err.error || err.message || 'Failed to join');
        setJoining(false);
        autoJoinDone.current = false;
      });
  }, [token, user, inviteInfo, loading, navigate]);

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

  if (loading) return <div className="pb-8"><p>Loading…</p></div>;
  if (!inviteInfo || !inviteInfo.place_name) {
    return (
      <div className="pb-8 max-w-[360px] mx-auto my-8 text-center">
        <p className="mb-4">{expiredError || 'Invalid or expired invite link.'}</p>
        {expiredError && <p className="opacity-80 text-sm mb-4">Ask the place owner to generate a new link from the Invite tab.</p>}
        <Link to="/" className="link link-primary">Go home</Link>
      </div>
    );
  }

  return (
    <div className="pb-8 max-w-[360px] mx-auto my-8 text-center">
      <h1 className="text-2xl font-semibold">Join a place</h1>
      <p className="my-4">You've been invited to join <strong>{inviteInfo.place_name}</strong>.</p>
      {!user ? (
        <p>
          <Link to={`/login?next=/join/${token}`} className="link link-primary">Log in</Link> or <Link to={`/register?next=/join/${token}`} className="link link-primary">sign up</Link> to join.
        </p>
      ) : (
        <>
          {error && <div className="text-error text-sm mb-2">{error}</div>}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleJoin}
            disabled={joining}
          >
            {joining ? 'Joining…' : 'Join place'}
          </button>
        </>
      )}
      <p className="mt-6 text-sm"><Link to="/" className="link link-primary">Back to places</Link></p>
    </div>
  );
}
