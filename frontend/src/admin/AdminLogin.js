import React, { useState } from 'react';
import { useToast } from '../components/Toast';
import * as api from '../api';

export default function AdminLogin({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const toast = useToast();

  const validate = () => {
    const e = {};
    if (!username.trim()) e.username = 'Username is required';
    if (!password) e.password = 'Password is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const data = await api.login(username.trim(), password);
      toast.success('Welcome back');
      onLogin(data);
    } catch (err) {
      if (err.message.includes('network') || err.message.includes('fetch')) {
        toast.error('Unable to reach the server. Check your connection.');
      } else {
        toast.error(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.logo}>LUXE</h1>
          <p style={styles.subtitle}>Store Administration</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setErrors(p => ({ ...p, username: '' })); }}
              style={{
                ...styles.input,
                ...(errors.username ? styles.inputError : {}),
              }}
              placeholder="Enter username"
              autoComplete="username"
              autoFocus
            />
            {errors.username && <span style={styles.errorText}>{errors.username}</span>}
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: '' })); }}
              style={{
                ...styles.input,
                ...(errors.password ? styles.inputError : {}),
              }}
              placeholder="Enter password"
              autoComplete="current-password"
            />
            {errors.password && <span style={styles.errorText}>{errors.password}</span>}
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.button,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (
              <span style={styles.loadingInner}>
                <span style={styles.spinner} />
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--admin-bg)',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    background: 'var(--admin-card)',
    borderRadius: 'var(--radius-lg)',
    padding: '48px 40px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
    animation: 'scaleIn 0.4s ease',
  },
  header: {
    textAlign: 'center',
    marginBottom: 40,
  },
  logo: {
    fontFamily: 'var(--font-display)',
    fontSize: '2.5rem',
    fontWeight: 600,
    letterSpacing: '0.15em',
    color: 'var(--brand)',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'var(--font-body)',
    fontSize: '0.9rem',
    color: 'var(--admin-text-hint)',
    fontWeight: 400,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: '0.8rem',
    fontWeight: 500,
    color: 'var(--admin-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  input: {
    padding: '14px 16px',
    fontSize: '0.95rem',
    border: '1.5px solid var(--admin-border)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--admin-surface)',
    color: 'var(--admin-text)',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  inputError: {
    borderColor: '#C2185B',
    boxShadow: '0 0 0 3px rgba(194, 24, 91, 0.1)',
  },
  errorText: {
    fontSize: '0.78rem',
    color: '#C2185B',
    fontWeight: 500,
  },
  button: {
    marginTop: 8,
    padding: '16px',
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#ffffff',
    background: 'var(--brand)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'background 0.2s, transform 0.1s',
    minHeight: 52,
  },
  loadingInner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  spinner: {
    display: 'inline-block',
    width: 16,
    height: 16,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
  },
};
