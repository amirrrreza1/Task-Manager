'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useAuth } from '../../components/auth-provider';

function LoginForm() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const returnTo = searchParams.get('returnTo');
  const safeReturnTo =
    returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/board';

  useEffect(() => {
    if (!loading && user) router.replace(safeReturnTo);
  }, [loading, router, safeReturnTo, user]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username, password);
      router.replace(safeReturnTo);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-intro" aria-labelledby="login-title">
        <Link className="brand login-brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            TM
          </span>
          Task Manager
        </Link>
        <div>
          <p className="eyebrow">Your team, clearly aligned</p>
          <h1 id="login-title">Make the next move obvious.</h1>
          <p>
            A self-hosted workspace for focused teams—clear ownership, flexible estimates, and
            sprint history without the clutter.
          </p>
        </div>
        <p className="login-footnote">Open source · Docker-ready · Your data stays yours</p>
      </section>
      <section className="login-panel" aria-label="Sign in">
        <form className="form-card login-form" onSubmit={submit}>
          <div>
            <p className="section-label">Welcome back</p>
            <h2>Sign in to your workspace</h2>
            <p className="muted">Use the credentials provided by your administrator.</p>
          </div>
          <label>
            Username
            <input
              autoComplete="username"
              autoFocus
              maxLength={64}
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              maxLength={200}
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="button primary wide" disabled={submitting || loading} type="submit">
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="session-loader">Loading sign in…</main>}>
      <LoginForm />
    </Suspense>
  );
}
