import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') || '/';
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await login(username, password);
      navigate(next);
    } catch (err) {
      setError(err.detail || err.username?.[0] || err.message || 'Login failed');
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
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="input input-bordered w-full"
        />
        <button type="submit" className="btn btn-primary mt-2">
          Log in
        </button>
      </form>
      <p className="mt-6 text-sm">
        Don't have an account? <Link to={next && next !== '/' ? `/register?next=${encodeURIComponent(next)}` : '/register'} className="link link-primary">Sign up</Link>
      </p>
    </div>
  );
}
