import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Lock, ArrowRight, ShieldCheck, Users, LayoutDashboard, AlertTriangle } from 'lucide-react';
import { useAuth } from '../AuthContext';
import appIconUrl from '../assets/logo/app_icon.svg';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') || '/';
  const { register } = useAuth();
  const navigate = useNavigate();

  const minLength = 8;
  const lengthOk = password.length >= minLength;
  const numberOk = /\d/.test(password);
  const specialOk = /[^\w\s]/.test(password);
  const passwordScore = [lengthOk, numberOk, specialOk].filter(Boolean).length;
  const isPasswordWeak = password.length > 0 && (password.length < minLength || passwordScore === 0);
  const strengthLabel = password.length === 0 ? null : passwordScore === 0 ? 'Too weak' : passwordScore === 1 ? 'Weak' : passwordScore === 2 ? 'Good' : 'Strong';
  const strengthLabelClass = passwordScore === 0 ? 'text-error' : passwordScore === 1 ? 'text-warning' : 'text-success';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < minLength || passwordScore < 1) {
      setError('Please choose a stronger password (at least 10 characters, with a number or special character).');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await register(username, email, password);
      navigate(next);
    } catch (err) {
      setError(err.username?.[0] || err.email?.[0] || err.password?.[0] || err.error || err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-pattern-equilo text-text-primary flex flex-col md:flex-row">
      {/* Left: Brand / story panel – grid layout, hidden on small screens */}
      <div className="hidden md:flex md:w-1/2 items-center justify-center px-10 lg:px-16 relative">
        <div className="relative max-w-md space-y-6">
          <Link to="/" className="inline-flex items-center gap-2 no-underline hover:opacity-90 transition-opacity">
            <img src={appIconUrl} alt="Equilo" className="w-8 h-8" />
            <span className="text-body-lg font-semibold tracking-tight text-text-primary leading-none">Equilo</span>
          </Link>
          <h1 className="text-h2 font-semibold text-text-primary leading-tight">
            Create an account that{' '}
            <span className="text-primary">keeps bills fair.</span>
          </h1>
          <p className="text-body text-text-secondary max-w-lg">
            Set up your profile once, then let Equilo keep track of who paid what in every shared place.
          </p>

          {/* Illustration-style stats card */}
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
                Fair splits
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-primary/10 border border-border p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" aria-hidden />
                  <span className="text-small font-medium text-text-secondary">Shared expenses</span>
                </div>
                <p className="text-base font-semibold text-primary m-0">Auto-tracked</p>
              </div>
              <div className="rounded-xl bg-warning/15 border border-warning/30 p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <LayoutDashboard className="w-4 h-4 text-warning" aria-hidden />
                  <span className="text-small font-medium text-warning">Dashboard</span>
                </div>
                <p className="text-base font-semibold text-warning m-0">At a glance</p>
              </div>
            </div>
            <p className="text-small text-text-muted m-0">
              Your balances stay in sync across every place you live in.
            </p>
          </div>
        </div>
      </div>

      {/* Right: Sign up card – same structure as sign in card */}
      <div className="flex-1 flex items-center justify-center px-4 py-8 md:px-8">
        <div className="w-full max-w-md">
          {/* Mobile logo / heading */}
          <Link to="/" className="mb-6 md:hidden flex items-center justify-center gap-2 no-underline hover:opacity-90 transition-opacity">
            <img src={appIconUrl} alt="Equilo" className="w-8 h-8" />
            <span className="text-body-lg font-semibold tracking-tight text-text-primary">Equilo</span>
          </Link>

          <div className="rounded-2xl border border-border bg-base-100/95 shadow-card px-6 py-8 md:px-8 md:py-9 backdrop-blur-sm animate-fade-in">
            <div className="text-center mb-7">
              <Link to="/" className="hidden md:inline-flex items-center gap-2 no-underline hover:opacity-90 transition-opacity">
                <img src={appIconUrl} alt="Equilo" className="w-8 h-8" />
                <span className="text-body-lg font-semibold tracking-tight text-text-primary">Equilo</span>
              </Link>
              <p className="text-sm text-text-muted md:mt-2 mt-0 m-0">Create your account</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-sm text-error mb-1 animate-fade-in" role="alert">
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
                  placeholder="Choose a username"
                  className="input input-bordered w-full min-h-11 rounded-lg border-base-300 bg-base-100 text-text-primary"
                />
                
              </div>

              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="input input-bordered w-full min-h-11 rounded-lg border-base-300 bg-base-100 text-text-primary"
                />
                
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label htmlFor="password" className="text-sm font-medium text-text-primary">
                    Password
                  </label>
                  {strengthLabel && (
                    <span className={`text-sm font-medium ${strengthLabelClass}`}>{strengthLabel}</span>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={minLength}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    className={`input input-bordered w-full min-h-11 rounded-lg bg-base-100 pr-10 text-text-primary ${
                      isPasswordWeak ? 'border-error focus:outline-error' : 'border-base-300'
                    }`}
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

                {/* 3-segment password strength bar */}
                <div className="flex gap-1 mt-2">
                  <div
                    className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                      passwordScore >= 1 ? (passwordScore === 1 ? 'bg-error' : passwordScore === 2 ? 'bg-warning' : 'bg-success') : 'bg-base-200'
                    }`}
                  />
                  <div
                    className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                      passwordScore >= 2 ? (passwordScore === 2 ? 'bg-warning' : 'bg-success') : 'bg-base-200'
                    }`}
                  />
                  <div
                    className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                      passwordScore >= 3 ? 'bg-success' : 'bg-base-200'
                    }`}
                  />
                </div>

                {isPasswordWeak && (
                  <p className="flex items-start gap-2 text-sm text-error mt-2 m-0" role="alert">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                    <span>
                      Your password needs to be at least {minLength} characters. Use multiple words and phrases to make it more secure.
                    </span>
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirm-password" className="block text-sm font-medium text-text-primary mb-1.5">
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Confirm your password"
                  className="input input-bordered w-full min-h-11 rounded-lg border-base-300 bg-base-100 text-text-primary"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full rounded-lg min-h-12 gap-2 mt-4"
              >
                {loading ? (
                  <>
                    <span className="loading loading-spinner loading-xs" aria-hidden />
                    Creating account…
                  </>
                ) : (
                  <>
                    Create account
                    <ArrowRight className="w-4 h-4" aria-hidden />
                  </>
                )}
              </button>

              {/* Trust note */}
              <div className="flex items-center justify-center gap-2 pt-3 text-small text-text-muted">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Lock className="w-3 h-3" aria-hidden />
                </span>
                <span>Secure sign up. Your data is encrypted.</span>
              </div>
            </form>
          </div>

          {/* Secondary action & footer */}
          <div className="mt-5 text-center space-y-2">
            <p className="text-sm text-text-secondary m-0">
              Already have an account?{' '}
              <Link
                to={next && next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login'}
                className="font-semibold text-primary hover:underline no-underline"
              >
                Log in
              </Link>
            </p>
            <p className="text-small text-text-muted m-0">
              <span className="hover:text-text-secondary cursor-pointer">Privacy</span>
              <span className="mx-2">•</span>
              <span className="hover:text-text-secondary cursor-pointer">Terms</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
