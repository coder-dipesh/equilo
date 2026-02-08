import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') || '/';
  const { register } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await register(username, email, password);
      navigate(next);
    } catch (err) {
      setError(err.username?.[0] || err.email?.[0] || err.password?.[0] || err.error || err.message || 'Registration failed');
    }
  }

  return (
    <div className="max-w-[360px] mx-auto my-8 text-center">
      <h1 className="text-h1 m-0 mb-1">Equilo</h1>
      <p className="text-body text-text-secondary mb-6">Split bills with your place</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-left">
        {error && <div className="alert alert-error text-sm">{error}</div>}
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoComplete="username"
          className="input input-bordered w-full"
        />
        <input
          type="email"
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="input input-bordered w-full"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          className="input input-bordered w-full"
        />
        <button type="submit" className="btn btn-primary mt-2">
          Sign up
        </button>
      </form>
      <p className="mt-6 text-sm">
        Already have an account? <Link to={next && next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login'} className="link link-primary">Log in</Link>
      </p>
    </div>
  );
}
