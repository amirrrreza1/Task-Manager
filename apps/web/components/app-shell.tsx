'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Avatar } from './avatar';
import { useAuth } from './auth-provider';

const memberNavigation = [
  { href: '/board', label: 'Board' },
  { href: '/backlog', label: 'Backlog' },
  { href: '/sprints', label: 'Sprints' },
  { href: '/profile', label: 'Profile' },
];

const adminNavigation = [
  { href: '/settings/users', label: 'People' },
  { href: '/settings/general', label: 'Settings' },
  { href: '/settings/board', label: 'Workflow' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  if (!user) return null;

  const navigation =
    user.role === 'ADMIN' ? [...memberNavigation, ...adminNavigation] : memberNavigation;

  return (
    <div className="app-frame">
      <header className="topbar">
        <Link className="brand" href="/board" aria-label="Task Manager board">
          <span className="brand-mark" aria-hidden="true">
            TM
          </span>
          <span>Task Manager</span>
        </Link>
        <nav className="primary-nav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname.startsWith(item.href) ? 'active' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="account-menu">
          <Avatar seed={user.avatarSeed} name={user.displayName} size={36} />
          <span className="account-copy">
            <strong>{user.displayName}</strong>
            <small>{user.role === 'ADMIN' ? 'Administrator' : 'Member'}</small>
          </span>
          <button className="button ghost compact" type="button" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>
      <main className="app-content">{children}</main>
    </div>
  );
}
