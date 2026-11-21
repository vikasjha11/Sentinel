import { useState } from 'react';
import { api } from '../api.js';
import { useStore } from '../store.jsx';
import { go } from '../lib/route.js';
import { Field } from '../components/ui.jsx';

export default function Account() {
  const { user, signIn, signOut, notify } = useStore();
  const [mode, setMode] = useState('login'); const [form, setForm] = useState({ name: '', email: '', password: '' }); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const bind = k => ({ value: form[k], onChange: e => setForm(f => ({ ...f, [k]: e.target.value })) });

  if (user) return (
    <div className="page narrow">
      <h1 className="page-title">Hello, {user.name.split(' ')[0]}</h1>
      <p className="muted">{user.email}</p>
      <div className="row stack-sm">
        <a className="btn" href="#/orders">Your orders</a><a className="btn" href="#/saved">Saved items</a>
        {user.role === 'admin' && <a className="btn primary" href="#/admin">Open the admin desk</a>}
        <button className="btn" onClick={signOut}>Sign out</button>
      </div>
    </div>
  );
  const submit = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const data = await api(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(mode === 'login' ? { email: form.email, password: form.password } : form) });
      signIn(data); notify(mode === 'login' ? 'Welcome back.' : 'Account created. Welcome to Tilda.'); go(data.user.role === 'admin' ? 'admin' : history.length > 1 && document.referrer.includes('#/bag') ? 'bag' : '');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="page auth">
      <form onSubmit={submit} className="auth-card" noValidate>
        <h1>{mode === 'login' ? 'Sign in' : 'Create an account'}</h1>
        <p className="muted">{mode === 'login' ? 'Pick up your bag and orders where you left them.' : 'Takes a minute. We only ask for what an order needs.'}</p>
        {mode === 'register' && <Field label="Name"><input autoComplete="name" required minLength="2" {...bind('name')} /></Field>}
        <Field label="Email"><input type="email" autoComplete="email" required {...bind('email')} /></Field>
        <Field label="Password" hint={mode === 'register' ? 'At least 10 characters.' : ''}><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 10 : 1} {...bind('password')} /></Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <p className="switch">{mode === 'login' ? 'New here?' : 'Already have an account?'} <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
      </form>
    </div>
  );
}
