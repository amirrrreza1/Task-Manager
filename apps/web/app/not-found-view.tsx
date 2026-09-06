'use client';

import {
  ArrowLeft,
  ArrowRight,
  Checklist,
  Compass,
  Folder,
  LayoutKanban,
  Settings,
} from '@appica/icons-react';
import { BackgroundPattern } from '@appica/ui-react/background-pattern';
import { Badge } from '@appica/ui-react/badge';
import { Button } from '@appica/ui-react/button';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../components/auth-provider';
import { ThemeToggle } from '../components/theme-toggle';
import { companyName } from '../lib/app-config';

export function NotFoundView() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();

  const showPath = pathname && pathname !== '/_not-found' && pathname !== '/not-found';

  function handleGoBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(user ? '/board' : '/');
    }
  }

  return (
    <div className="not-found-page">
      <BackgroundPattern
        aria-hidden="true"
        cellSize={28}
        className="not-found-pattern"
        spotlight={{ size: 540, persistent: true }}
        track="window"
        variant="grid"
      />

      <header className="not-found-header">
        <Link
          href={user ? '/board' : '/'}
          className="not-found-brand"
          aria-label={`${companyName} Home`}
        >
          <span className="brand-mark" aria-hidden="true">
            <LayoutKanban />
          </span>
          <span className="brand-copy">
            <strong>{companyName}</strong>
            <small>Task &amp; Sprint Manager</small>
          </span>
        </Link>

        <div className="not-found-header-actions">
          {user ? (
            <div className="not-found-user-indicator" title={`Signed in as ${user.displayName || user.username}`}>
              <span className="not-found-user-dot" aria-hidden="true" />
              <span className="not-found-user-name">{user.displayName || user.username}</span>
            </div>
          ) : null}
          <ThemeToggle />
        </div>
      </header>

      <main className="not-found-main">
        <div className="not-found-card">
          <div className="not-found-badge-wrap">
            <Badge variant="outline" size="sm" className="not-found-error-badge">
              Error 404
            </Badge>
          </div>

          <div className="not-found-illustration">
            <div className="not-found-icon-pulse" aria-hidden="true" />
            <div className="not-found-icon-shell">
              <Compass className="not-found-compass-icon" aria-hidden="true" />
            </div>
          </div>

          <div className="not-found-headings">
            <h1 className="not-found-title">Page not found</h1>
            <p className="not-found-description">
              The page you are looking for doesn&apos;t exist, was moved, or is temporarily unavailable.
            </p>
            {showPath ? (
              <div className="not-found-path-pill" title={pathname}>
                <span className="not-found-path-label">Requested:</span>
                <code className="not-found-path-code">{pathname}</code>
              </div>
            ) : null}
          </div>

          <div className="not-found-actions">
            <Button
              variant="outline"
              size="md"
              onClick={handleGoBack}
              className="not-found-btn not-found-btn-back"
            >
              <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
              <span>Go back</span>
            </Button>

            {user ? (
              <Button
                nativeButton={false}
                variant="primary"
                size="md"
                render={<Link href="/board" />}
                className="not-found-btn"
              >
                <LayoutKanban className="w-4 h-4 mr-2" aria-hidden="true" />
                <span>Back to Board</span>
              </Button>
            ) : (
              <Button
                nativeButton={false}
                variant="primary"
                size="md"
                render={<Link href="/login" />}
                className="not-found-btn"
              >
                <span>Sign in</span>
                <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
              </Button>
            )}
          </div>

          {user ? (
            <div className="not-found-quick-links">
              <span className="not-found-quick-links-title">Quick destinations</span>
              <div className="not-found-quick-grid">
                <Link href="/board" className="not-found-quick-item">
                  <span className="not-found-quick-icon" aria-hidden="true">
                    <LayoutKanban />
                  </span>
                  <span>Active Board</span>
                </Link>
                <Link href="/backlog" className="not-found-quick-item">
                  <span className="not-found-quick-icon" aria-hidden="true">
                    <Checklist />
                  </span>
                  <span>Backlog</span>
                </Link>
                <Link href="/projects" className="not-found-quick-item">
                  <span className="not-found-quick-icon" aria-hidden="true">
                    <Folder />
                  </span>
                  <span>Projects</span>
                </Link>
                {user.role === 'ADMIN' ? (
                  <Link href="/settings" className="not-found-quick-item">
                    <span className="not-found-quick-icon" aria-hidden="true">
                      <Settings />
                    </span>
                    <span>Settings</span>
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </main>

      <footer className="not-found-footer">
        <p className="not-found-copyright">
          &copy; {new Date().getFullYear()} {companyName}. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
