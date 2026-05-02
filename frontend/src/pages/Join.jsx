import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { inviteByToken, joinPlace } from '../api';
import { Users, ShieldCheck, Link2Off, ArrowLeft } from 'lucide-react';

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
    const reason = expiredError || 'This invite link is no longer valid.';
    return (
      <div className="flex justify-center py-4 sm:py-10">
        <div className="w-full max-w-[460px]">
          <div className="rounded-2xl border border-base-300 bg-surface shadow-card p-6 sm:p-8 text-center">
            <span
              className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/15 text-warning"
              aria-hidden
            >
              <Link2Off className="h-7 w-7" />
            </span>

            <h1 className="text-lg sm:text-xl font-semibold text-text-primary m-0">
              Invite link doesn’t work
            </h1>
            <p className="text-sm text-text-secondary mt-2 mb-0">
              {reason}
            </p>

            <div className="mt-5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-left">
              <p className="text-sm font-medium text-text-primary m-0">
                What you can do
              </p>
              <ul className="mt-2 space-y-1.5 text-sm text-text-secondary list-disc pl-5 m-0">
                <li>Ask the place owner to generate a fresh link from the Invite tab.</li>
                <li>If you already opened this link before, you might already be a member — check your places.</li>
                {!user && (
                  <li>
                    Make sure you’re signed in with the email the invite was sent to.
                  </li>
                )}
              </ul>
            </div>

            <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 sm:justify-center">
              <Link
                to="/"
                className="btn btn-ghost rounded-lg gap-2 sm:min-w-[140px]"
              >
                <ArrowLeft className="h-4 w-4" />
                Go home
              </Link>
              {!user ? (
                <Link
                  to="/login"
                  className="btn btn-primary rounded-lg sm:min-w-[140px]"
                >
                  Sign in
                </Link>
              ) : (
                <Link
                  to="/places"
                  className="btn btn-primary rounded-lg sm:min-w-[140px]"
                >
                  My places
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-28">
      <div className="max-w-[520px] mx-auto py-4 sm:py-8">
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
