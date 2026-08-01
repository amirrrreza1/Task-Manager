'use client';

import { AlertCircle, ArrowRight, LayoutKanban, Lock, User } from '@appica/icons-react';
import { Alert, AlertDescription, AlertIcon } from '@appica/ui-react/alert';
import { BackgroundPattern } from '@appica/ui-react/background-pattern';
import { Button } from '@appica/ui-react/button';
import { Field, FieldLabel } from '@appica/ui-react/field';
import { Input } from '@appica/ui-react/input';
import { Spinner } from '@appica/ui-react/spinner';
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
      <BackgroundPattern
        aria-hidden="true"
        cellSize={28}
        className="login-pattern"
        spotlight={{ size: 540, persistent: true }}
        track="window"
        variant="grid"
      />
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
