'use client';

import {
  ArrowBarLeft,
  ArrowBarRight,
  Bell,
  BuildingCommunity,
  CalendarTime,
  ChartBar,
  Checklist,
  Database,
  Folder,
  LayoutKanban,
  ReportAnalytics,
  Settings,
  User,
  Users,
} from '@appica/icons-react';
import { Button } from '@appica/ui-react/button';
import {
  Navigation,
  NavigationItem,
  NavigationLink,
  NavigationList,
} from '@appica/ui-react/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ComponentType, type ReactNode } from 'react';
import { useAuth } from './auth-provider';
import { useWorkspace } from './workspace-provider';
import { WorkspaceSwitcher } from './workspace-switcher';
import { NotificationBell } from './notification-bell';
import { HeaderActionsProvider, HeaderActionsSlot } from './header-actions';
import { ProfileMenu } from './profile-menu';

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ 'aria-hidden'?: boolean | 'true' | 'false'; className?: string }>;
};

const memberNavigation: NavItem[] = [
  { href: '/board', label: 'Board', icon: LayoutKanban },
  { href: '/backlog', label: 'Backlog', icon: Checklist },
  { href: '/projects', label: 'Projects', icon: Folder },
  { href: '/sprints', label: 'Sprints', icon: CalendarTime },
  { href: '/profile', label: 'Profile', icon: User },
];

const adminNavigation: NavItem[] = [
  { href: '/settings/workspaces', label: 'Workspaces', icon: BuildingCommunity },
  { href: '/settings/users', label: 'People', icon: Users },
  { href: '/settings/notifications', label: 'Notifications', icon: Bell },
  { href: '/settings/general', label: 'Settings', icon: Settings },
  { href: '/settings/board', label: 'Workflow', icon: ChartBar },
  { href: '/settings/backup', label: 'Backup & Restore', icon: Database },
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
              aria-label={item.label}
              active={active}
              data-tooltip={item.label}
              render={<Link href={item.href} />}
              title={item.label}
              value={item.href}
            >
              <Icon aria-hidden="true" className="shell-nav-icon" />
              <span className="shell-nav-label">{item.label}</span>
            </NavigationLink>
          </NavigationItem>
        );
      })}
    </NavigationList>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  if (!user) return null;

  const currentSection =
    sectionNames.find((item) => pathname.startsWith(item.href))?.label ?? 'Workspace';

  return (
    <HeaderActionsProvider>
      <div className="app-frame" data-sidebar-collapsed={sidebarCollapsed || undefined}>
        <aside className="app-sidebar">
          <div className="sidebar-brand-row">
            <WorkspaceSwitcher />
            <NotificationBell />
          </div>

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
            <ProfileMenu />
            <Button
              aria-expanded={!sidebarCollapsed}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="sidebar-toggle"
              size="icon-sm"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              variant="ghost"
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            >
              {sidebarCollapsed ? (
                <ArrowBarRight aria-hidden="true" />
              ) : (
                <ArrowBarLeft aria-hidden="true" />
              )}
            </Button>
          </div>
        </aside>

        <div className="app-main">
          <header className="app-toolbar">
            <div>
              <span className="toolbar-kicker">{currentWorkspace?.name ?? 'Workspace'}</span>
              <strong>{currentSection}</strong>
            </div>
            <div className="toolbar-actions flex items-center gap-3">
              <HeaderActionsSlot />
            </div>
          </header>
          <main className="app-content">{children}</main>
        </div>
      </div>
    </HeaderActionsProvider>
  );
}
