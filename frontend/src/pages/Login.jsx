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
    <div className="auth-page">
      <h1>Equilo</h1>
      <p className="tagline">Split bills with your place</p>
      <form onSubmit={handleSubmit} className="auth-form">
        {error && <div className="error">{error}</div>}
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoComplete="username"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        <button type="submit">Log in</button>
      </form>
      <p className="auth-footer">
        Don't have an account? <Link to="/register">Sign up</Link>
      </p>
    </div>
  );
}
