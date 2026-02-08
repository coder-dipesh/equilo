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
          type="email"
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
        />
        <button type="submit">Sign up</button>
      </form>
      <p className="auth-footer">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
