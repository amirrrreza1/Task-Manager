'use client';

import { AlertCircle, ArrowRight, LayoutKanban, Lock, User } from '@appica/icons-react';
import { Alert, AlertDescription, AlertIcon } from '@appica/ui-react/alert';
import { BackgroundPattern } from '@appica/ui-react/background-pattern';
import { Badge } from '@appica/ui-react/badge';
import { Button } from '@appica/ui-react/button';
import { Field, FieldDescription, FieldLabel } from '@appica/ui-react/field';
import { Input } from '@appica/ui-react/input';
import { Spinner } from '@appica/ui-react/spinner';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useAuth } from '../../components/auth-provider';
import { ThemeToggle } from '../../components/theme-toggle';

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
        <BackgroundPattern
          aria-hidden="true"
          cellSize={28}
          className="login-pattern"
          spotlight={{ size: 540, persistent: true }}
          track="window"
          variant="grid"
        />
        <div className="login-topline">
          <Link className="brand login-brand" href="/">
            <span className="brand-mark" aria-hidden="true">
              <LayoutKanban />
            </span>
            <span className="brand-copy">
              <strong>Task Manager</strong>
              <small>Team workspace</small>
            </span>
          </Link>
          <ThemeToggle />
        </div>
        <div className="login-message">
          <Badge size="sm" variant="secondary">
            Built for focused teams
          </Badge>
          <h1 id="login-title">Move work forward, together.</h1>
          <p>
            Plan the sprint, clarify ownership, and keep every decision connected to the work.
          </p>
        </div>
        <p className="login-footnote">Open source · Docker-ready · Your data stays yours</p>
      </section>

      <section className="login-panel" aria-label="Sign in">
        <form className="form-card login-form" onSubmit={submit}>
          <div className="login-heading">
            <span className="form-icon" aria-hidden="true">
              <LayoutKanban />
            </span>
            <div>
              <h2>Welcome back</h2>
              <p>Sign in to continue to your workspace.</p>
            </div>
          </div>

          <Field name="username">
            <FieldLabel>Username</FieldLabel>
            <Input
              autoComplete="username"
              autoFocus
              maxLength={64}
              placeholder="Enter your username"
              required
              startSlot={<User aria-hidden="true" />}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </Field>

          <Field name="password">
            <FieldLabel>Password</FieldLabel>
            <Input
              autoComplete="current-password"
              maxLength={200}
              placeholder="Enter your password"
              required
              startSlot={<Lock aria-hidden="true" />}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <FieldDescription>Use the credentials provided by your administrator.</FieldDescription>
          </Field>

          {error ? (
            <Alert layout="inline" role="alert" variant="error">
              <AlertIcon>
                <AlertCircle aria-hidden="true" />
              </AlertIcon>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button className="login-submit" disabled={submitting || loading} size="lg" type="submit">
            {submitting ? (
              <>
                <Spinner currentColor aria-label="Signing in" />
                Signing in…
              </>
            ) : (
              <>
                Sign in
                <ArrowRight aria-hidden="true" />
              </>
            )}
          </Button>
        </form>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="session-loader">
          <Spinner aria-label="Loading sign in" />
          Loading sign in…
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
