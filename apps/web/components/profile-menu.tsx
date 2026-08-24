'use client';

import { Logout } from '@appica/icons-react';
import { Button } from '@appica/ui-react/button';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from './avatar';
import { useAuth } from './auth-provider';
import { ThemeToggle } from './theme-toggle';

export function ProfileMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  if (!user) return null;

  function showMenu() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(true);
  }

  function hideMenu() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 140);
  }

  return (
    <div className="profile-menu" ref={rootRef} onMouseEnter={showMenu} onMouseLeave={hideMenu}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Account menu"
        className="profile-menu-trigger"
        type="button"
        onClick={() => setOpen((current) => !current)}
        onFocus={showMenu}
      >
        <Avatar
          color={user.color}
          hasAvatar={user.hasAvatar}
          name={user.displayName}
          size={32}
          title={false}
          userId={user.id}
        />
        <span className="account-copy">
          <strong>{user.displayName}</strong>
        </span>
      </button>

      {open ? (
        <div className="profile-menu-panel" role="dialog" aria-label="Account">
          <div className="profile-menu-identity">
            <Avatar
              color={user.color}
              hasAvatar={user.hasAvatar}
              name={user.displayName}
              size={40}
              userId={user.id}
            />
            <div>
              <strong>{user.displayName}</strong>
              <small>{user.role === 'ADMIN' ? 'Administrator' : 'Member'}</small>
            </div>
          </div>
          <div className="profile-menu-actions">
            <ThemeToggle label="Theme" />
            <Button className="profile-menu-signout" variant="ghost" onClick={() => void logout()}>
              <Logout aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
