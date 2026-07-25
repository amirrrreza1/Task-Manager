'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from './auth-provider';

export function AuthGate({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`);
    if (!loading && user && admin && user.role !== 'ADMIN') router.replace('/board');
  }, [admin, loading, pathname, router, user]);

  if (loading || !user || (admin && user.role !== 'ADMIN')) {
    return (
      <main className="session-loader" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        Checking your workspace session…
      </main>
    );
  }

  return children;
}
