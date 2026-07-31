'use client';

import {
  CalendarTime,
  ChartBar,
  Checklist,
  LayoutKanban,
  Logout,
  ReportAnalytics,
  Settings,
  User,
  Users,
} from '@appica/icons-react';
import { Avatar, AvatarFallback } from '@appica/ui-react/avatar';
import { Badge } from '@appica/ui-react/badge';
import { Button } from '@appica/ui-react/button';
import {
  Navigation,
  NavigationItem,
  NavigationLink,
  NavigationList,
} from '@appica/ui-react/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, ReactNode } from 'react';
import { useAuth } from './auth-provider';
import { ThemeToggle } from './theme-toggle';

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ 'aria-hidden'?: boolean | 'true' | 'false'; className?: string }>;
};

const memberNavigation: NavItem[] = [
  { href: '/board', label: 'Board', icon: LayoutKanban },
  { href: '/backlog', label: 'Backlog', icon: Checklist },
  { href: '/sprints', label: 'Sprints', icon: CalendarTime },
  { href: '/profile', label: 'Profile', icon: User },
];

const adminNavigation: NavItem[] = [
  { href: '/settings/users', label: 'People', icon: Users },
  { href: '/settings/general', label: 'Settings', icon: Settings },
  { href: '/settings/board', label: 'Workflow', icon: ChartBar },
  { href: '/reports', label: 'Reports', icon: ReportAnalytics },
];

const sectionNames = [...memberNavigation, ...adminNavigation];

function NavigationGroup({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <NavigationList>
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <NavigationItem key={item.href}>
            <NavigationLink
              active={active}
              render={<Link href={item.href} />}
              value={item.href}
            >
              <Icon aria-hidden="true" className="shell-nav-icon" />
              <span>{item.label}</span>
            </NavigationLink>
          </NavigationItem>
        );
      })}
    </NavigationList>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  if (!user) return null;

  const currentSection =
    sectionNames.find((item) => pathname.startsWith(item.href))?.label ?? 'Workspace';

  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <Link className="brand" href="/board" aria-label="Task Manager board">
          <span className="brand-mark" aria-hidden="true">
            <LayoutKanban />
          </span>
          <span className="brand-copy">
            <strong>Task Manager</strong>
            <small>Team workspace</small>
          </span>
        </Link>

        <Navigation
          aria-label="Workspace navigation"
          className="shell-navigation"
          orientation="vertical"
          size="md"
          variant="pill"
        >
          <span className="nav-section-label">Workspace</span>
          <NavigationGroup items={memberNavigation} pathname={pathname} />
          {user.role === 'ADMIN' ? (
            <>
              <span className="nav-section-label">Administration</span>
              <NavigationGroup items={adminNavigation} pathname={pathname} />
            </>
          ) : null}
        </Navigation>

        <div className="sidebar-account">
          <div className="account-identity">
            <Avatar size="sm">
              <AvatarFallback>{initials(user.displayName)}</AvatarFallback>
            </Avatar>
            <span className="account-copy">
              <strong>{user.displayName}</strong>
              <small>{user.role === 'ADMIN' ? 'Administrator' : 'Member'}</small>
            </span>
          </div>
          <div className="account-actions">
            <ThemeToggle />
            <Button
              aria-label="Sign out"
              size="icon-sm"
              variant="ghost"
              onClick={() => void logout()}
            >
              <Logout aria-hidden="true" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-toolbar">
          <div>
            <span className="toolbar-kicker">Workspace</span>
            <strong>{currentSection}</strong>
          </div>
          <Badge size="sm" variant="soft">
            {user.role === 'ADMIN' ? 'Admin access' : 'Member access'}
          </Badge>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
