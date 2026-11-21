import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { request } from './api.js';
import { Brand } from './ui.jsx';
import { go } from './nav.js';

export default function Auth({ mode, onAuth }) {
  const isLogin = mode === 'signin';
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = isLogin ? { email: form.email, password: form.password } : form;
      const data = await request(`/auth/${isLogin ? 'login' : 'register'}`, { method: 'POST', body: JSON.stringify(body) });
      localStorage.setItem('sentinel-token', data.token);
      onAuth(data.user, data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <header className="auth-top"><Brand /></header>
      <form className="auth-card" onSubmit={submit}>
        <h1>{isLogin ? 'Sign in to Sentinel' : 'Create your workspace'}</h1>
        <p className="muted">{isLogin ? 'Use the email and password for your workspace.' : 'Your account becomes the owner of a new private workspace.'}</p>
        {!isLogin && (
          <label>Full name
            <input value={form.name} onChange={set('name')} required minLength={2} autoComplete="name" />
          </label>
        )}
        <label>Email address
          <input type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
        </label>
        <label>Password
          <input type="password" value={form.password} onChange={set('password')} required minLength={isLogin ? 1 : 10} autoComplete={isLogin ? 'current-password' : 'new-password'} />
          {!isLogin && <small>Use at least 10 characters.</small>}
        </label>
        {error && <div className="error-box" role="alert"><AlertTriangle size={16} />{error}</div>}
        <button className="primary-btn full-btn" disabled={busy}>{busy ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}</button>
        <p className="switch-auth">
          {isLogin ? 'No account yet?' : 'Already have an account?'}{' '}
          <a href={isLogin ? '#/signup' : '#/signin'} onClick={() => setError('')}>{isLogin ? 'Create one' : 'Sign in'}</a>
        </p>
      </form>
      <button className="text-btn auth-back" onClick={() => go('/')}>Back to home</button>
    </div>
  );
}
