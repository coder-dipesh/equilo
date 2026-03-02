import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, ShieldCheck, Users, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../AuthContext';
import appIconUrl from '../assets/logo/app_icon.svg';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') || '/';
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate(next);
    } catch (err) {
      setError(err.detail || err.username?.[0] || err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-pattern-equilo text-text-primary flex flex-col md:flex-row">
      {/* Left: Brand / story panel – hidden on small screens, grid layout */}
      <div className="hidden md:flex md:w-1/2 items-center justify-center px-10 lg:px-16 relative">
        <div className="relative max-w-md space-y-6">
          <Link to="/" className="inline-flex items-center gap-2 no-underline hover:opacity-90 transition-opacity">
            <img src={appIconUrl} alt="Equilo" className="w-8 h-8" />
            <span className="text-body-lg font-semibold tracking-tight text-text-primary leading-none">Equilo</span>
          </Link>
          <h1 className="text-h2 font-semibold text-text-primary leading-tight">
            Split bills without{' '}
            <span className="text-primary">awkward conversations.</span>
          </h1>
          <p className="text-body text-text-secondary max-w-lg">
            Track shared expenses, settle balances, and keep everything fair between flatmates and friends.
          </p>

          {/* Simple illustration-style card */}
          <div className="mt-4 rounded-2xl bg-surface/95 border border-border shadow-soft p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold">
                  P
                </span>
                <div>
                  <p className="text-sm font-semibold text-text-primary m-0">P.Home</p>
                  <p className="text-small text-text-muted m-0">3 housemates • Shared bills</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-success/20 text-success text-xs font-medium px-2 py-0.5">
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
                Settled
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-primary/10 border border-border p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" aria-hidden />
                  <span className="text-small font-medium text-text-secondary">You&apos;re owed</span>
                </div>
                <p className="text-base font-semibold text-primary m-0">A$256</p>
              </div>
              <div className="rounded-xl bg-warning/15 border border-warning/30 p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <LayoutDashboard className="w-4 h-4 text-warning" aria-hidden />
                  <span className="text-small font-medium text-warning">This month</span>
                </div>
                <p className="text-base font-semibold text-warning m-0">A$4,585</p>
              </div>
            </div>
            <p className="text-small text-text-muted m-0">
              Equilo keeps track of who paid what so everyone chips in fairly.
            </p>
          </div>
        </div>
      </div>

      {/* Right: Auth card */}
      <div className="flex-1 flex items-center justify-center px-4 py-8 md:px-8">
        <div className="w-full max-w-md">
          {/* Mobile logo / heading */}
          <Link to="/" className="mb-6 md:hidden flex items-center justify-center gap-2 no-underline hover:opacity-90 transition-opacity">
            <img src={appIconUrl} alt="Equilo" className="w-8 h-8" />
            <span className="text-body-lg font-semibold tracking-tight text-text-primary">Equilo</span>
          </Link>

          {/* Card */}
          <div className="rounded-2xl border border-border bg-base-100/95 shadow-card px-6 py-8 md:px-8 md:py-9 backdrop-blur-sm animate-fade-in">
            <div className="text-center mb-6">
              <Link to="/" className="hidden md:inline-flex items-center gap-2 no-underline hover:opacity-90 transition-opacity">
                <img src={appIconUrl} alt="Equilo" className="w-8 h-8" />
                <span className="text-body-lg font-semibold tracking-tight text-text-primary">Equilo</span>
              </Link>
              <p className="text-sm text-text-muted md:mt-2 mt-0 mb-0">Welcome back</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-sm text-error mb-2 animate-fade-in" role="alert">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="username" className="block text-sm font-medium text-text-primary mb-1.5">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder="Enter your username"
                  className="input input-bordered w-full min-h-11 rounded-lg border-base-300 bg-base-100 text-text-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-text-primary mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="input input-bordered w-full min-h-11 rounded-lg border-base-300 bg-base-100 pr-10 text-text-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-base-200 transition"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <Eye className="w-4 h-4" aria-hidden /> : <EyeOff className="w-4 h-4" aria-hidden />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs md:text-sm text-text-muted pt-1">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" className="checkbox checkbox-xs rounded-md border-base-300" />
                  <span>Remember me</span>
                </label>
                <button type="button" className="text-primary hover:underline font-medium">
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full rounded-lg min-h-12 gap-2"
              >
                {loading ? (
                  <>
                    <span className="loading loading-spinner loading-xs" aria-hidden />
                    Logging in…
                  </>
                ) : (
                  <>
                    Log in
                    <ArrowRight className="w-4 h-4" aria-hidden />
                  </>
                )}
              </button>

              <div className="flex items-center gap-3 pt-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-small uppercase tracking-widest text-text-muted">Or</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <Link
                to={next && next !== '/' ? `/register?next=${encodeURIComponent(next)}` : '/register'}
                className="btn bg-base-100 border border-base-300 w-full rounded-lg min-h-11 font-medium text-text-primary hover:bg-base-200 no-underline"
              >
                Create an account
              </Link>
            </form>
          </div>

          {/* Footer trust text */}
          <p className="mt-5 text-small text-center text-text-muted">
            <span className="hover:text-text-secondary cursor-pointer">Privacy Policy</span>
            <span className="mx-2">•</span>
            <span className="hover:text-text-secondary cursor-pointer">Terms</span>
            <span className="mx-2">•</span>
            <span className="hover:text-text-secondary cursor-pointer">Contact</span>
          </p>
        </div>
      </div>
    </div>
  );
}
