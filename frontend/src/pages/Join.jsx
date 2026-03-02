import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { inviteByToken, joinPlace } from '../api';
import { Users, ShieldCheck } from 'lucide-react';

export default function Join() {
  const { token } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [inviteInfo, setInviteInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [expiredError, setExpiredError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    setExpiredError('');
    setReady(false);
    inviteByToken(token)
      .then((data) => {
        setInviteInfo(data);
        setExpiredError('');
        setReady(true);
      })
      .catch((err) => {
        setInviteInfo(null);
        setExpiredError(err.error || '');
      })
      .finally(() => setLoading(false));
  }, [token]);

  // IMPORTANT: no auto-join. Always require explicit confirmation.

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
    <div className="min-h-[calc(100vh-3.5rem)] pb-28">
      <div className="max-w-[520px] mx-auto my-8 px-4 sm:px-0">
        <div className="rounded-2xl border border-base-300 bg-surface shadow-card p-5 sm:p-6">
          <h1 className="text-lg sm:text-xl font-semibold text-text-primary m-0">Confirm join</h1>
          <p className="text-sm text-text-secondary m-0 mt-2">
            You’re about to join <span className="font-semibold text-text-primary">{inviteInfo.place_name}</span>.
          </p>

          <div className="mt-5 rounded-xl border border-base-300 bg-base-100 p-4 flex items-start gap-3">
            <span className="mt-0.5 w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0" aria-hidden>
              <Users className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary m-0">
                {inviteInfo.member_count ?? '—'} member{(inviteInfo.member_count ?? 0) === 1 ? '' : 's'} in this group
              </p>
              <p className="text-xs text-text-muted m-0 mt-1">
                For your security, joining requires an explicit confirmation.
              </p>
            </div>
          </div>

          {inviteInfo.email && (
            <div className="mt-4 rounded-xl border border-base-300 bg-base-100 p-4 flex items-start gap-3">
              <span className="mt-0.5 w-10 h-10 rounded-xl bg-base-200 text-base-content/70 flex items-center justify-center shrink-0" aria-hidden>
                <ShieldCheck className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary m-0">Invite is email-restricted</p>
                <p className="text-xs text-text-muted m-0 mt-1">
                  This invite was sent to <span className="font-medium">{inviteInfo.email}</span>. Make sure you’re logged in with the right account.
                </p>
              </div>
            </div>
          )}

          {!user ? (
            <p className="text-sm text-text-secondary m-0 mt-5">
              Please{' '}
              <Link to={`/login?next=/join/${token}`} className="link link-primary">log in</Link>{' '}
              or{' '}
              <Link to={`/register?next=/join/${token}`} className="link link-primary">sign up</Link>{' '}
              to continue.
            </p>
          ) : (
            <>
              {error && <p className="text-sm text-error m-0 mt-4">{error}</p>}
              {ready && (
                <p className="text-xs text-text-muted m-0 mt-4">
                  You’re signed in as <span className="font-medium text-text-primary">{user.display_name || user.username}</span>.
                </p>
              )}
            </>
          )}

          <p className="mt-6 text-sm m-0">
            <Link to="/" className="link link-primary">Back</Link>
          </p>
        </div>
      </div>

      {/* Bottom confirm bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-base-300 bg-base-100/95 backdrop-blur px-4 py-4">
        <div className="max-w-[520px] mx-auto flex items-center gap-3">
          {!user ? (
            <button
              type="button"
              className="btn btn-primary w-full rounded-lg"
              onClick={() => navigate(`/login?next=/join/${token}`)}
            >
              Continue to join
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary w-full rounded-lg"
              onClick={handleJoin}
              disabled={joining}
            >
              {joining ? 'Joining…' : 'Join group'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
