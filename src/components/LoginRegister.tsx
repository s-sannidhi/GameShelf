import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';

type Tab = 'login' | 'register';

interface LoginRegisterProps {
  /** When true, used on landing page: shorter title and subtitle */
  embedded?: boolean;
}

export function LoginRegister({ embedded }: LoginRegisterProps) {
  const { login, register, error, clearError } = useAuth();
  const [tab, setTab] = useState<Tab>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSubmitting(true);
    try {
      if (tab === 'login') {
        await login(email, password);
      } else {
        await register(username, email, password);
      }
    } catch {
      // error set in context
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1>{embedded ? 'Sign in' : 'Game Shelf'}</h1>
        <p className="auth-subtitle">{embedded ? 'Log in or create an account to continue.' : 'Sign in to manage your library'}</p>
        <div className="auth-tabs">
          <button
            type="button"
            className={tab === 'login' ? 'active' : ''}
            onClick={() => { setTab('login'); clearError(); }}
          >
            Login
          </button>
          <button
            type="button"
            className={tab === 'register' ? 'active' : ''}
            onClick={() => { setTab('register'); clearError(); }}
          >
            Register
          </button>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          {tab === 'register' && (
            <label>
              Username
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                placeholder="Username"
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="Email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              placeholder="Password"
              minLength={6}
            />
          </label>
          {tab === 'register' && (
            <p className="auth-hint">Password must be at least 6 characters</p>
          )}
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? '…' : tab === 'login' ? 'Login' : 'Register'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
