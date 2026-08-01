'use client';

import { Button, Input } from '../../../../components/design-system';
import { FormEvent, use, useEffect, useRef, useState } from 'react';
import { Avatar, invalidateAvatarCache } from '../../../../components/avatar';
import { useAuth } from '../../../../components/auth-provider';
import type { ManagedUser } from '../../../../lib/types';

export default function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, request, updateUser, logout } = useAuth();
  const [profile, setProfile] = useState<ManagedUser | null>(null);
  const [loadError, setLoadError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSelf = user?.id === id;

  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    void request<ManagedUser>(`/users/${id}`)
      .then((next) => {
        if (!cancelled) setProfile(next);
      })
      .catch((caught) => {
        if (!cancelled) {
          setProfile(null);
          setLoadError(caught instanceof Error ? caught.message : 'Could not load this profile.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, request]);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSelf) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await request<void>('/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setMessage('Password changed. Sign in again with your new password.');
      window.setTimeout(() => void logout(), 1200);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change your password.');
    } finally {
      setSaving(false);
    }
  }

  async function onAvatarSelected(file: File | undefined) {
    if (!file || !isSelf || !user) return;
    setAvatarBusy(true);
    setError('');
    setMessage('');
    try {
      const body = new FormData();
      body.append('file', file);
      const updated = await request<ManagedUser>(`/users/${user.id}/avatar`, {
        method: 'POST',
        body,
      });
      invalidateAvatarCache(user.id);
      setProfile(updated);
      updateUser({
        hasAvatar: updated.hasAvatar,
        displayName: updated.displayName,
      });
      setMessage('Avatar updated.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not upload the avatar.');
    } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function removeAvatar() {
    if (!isSelf || !user) return;
    setAvatarBusy(true);
    setError('');
    setMessage('');
    try {
      const updated = await request<ManagedUser>(`/users/${user.id}/avatar`, { method: 'DELETE' });
      invalidateAvatarCache(user.id);
      setProfile(updated);
      updateUser({ hasAvatar: false });
      setMessage('Avatar removed. Your initial is shown instead.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove the avatar.');
    } finally {
      setAvatarBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="settings-layout profile-page">
        <p className="form-error" role="alert">
          {loadError}
        </p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="session-loader" role="status">
        <span className="spinner" aria-hidden="true" />
        Loading profile…
      </div>
    );
  }

  return (
    <div className="settings-layout profile-page">
      <header className="profile-identity">
        <Avatar
          hasAvatar={profile.hasAvatar}
          name={profile.displayName}
          size={84}
          userId={profile.id}
        />
        <div>
          <p className="eyebrow">{isSelf ? 'Your profile' : 'Member profile'}</p>
          <h1>{profile.displayName}</h1>
          <p className="muted">
            @{profile.username} · {profile.role === 'ADMIN' ? 'Administrator' : 'Member'}
            {!profile.isActive ? ' · Inactive' : ''}
          </p>
          {isSelf ? (
            <div className="profile-avatar-actions">
              <input
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="visually-hidden"
                onChange={(event) => void onAvatarSelected(event.target.files?.[0])}
                ref={fileInputRef}
                type="file"
              />
              <Button
                disabled={avatarBusy}
                onClick={() => fileInputRef.current?.click()}
                type="button"
                variant="outline"
              >
                {avatarBusy ? 'Updating…' : 'Upload photo'}
              </Button>
              {profile.hasAvatar ? (
                <Button disabled={avatarBusy} onClick={() => void removeAvatar()} type="button" variant="ghost">
                  Use initial
                </Button>
              ) : (
                <small className="muted">No photo yet — showing the first letter of your name.</small>
              )}
            </div>
          ) : null}
        </div>
      </header>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="form-success" role="status">
          {message}
        </p>
      ) : null}

      {isSelf ? (
        <form className="settings-card password-card" onSubmit={changePassword}>
          <section>
            <div className="setting-copy">
              <h2>Change password</h2>
              <p>Changing your password signs you out of every device.</p>
            </div>
            <div className="stacked-fields">
              <label>
                Current password
                <Input
                  autoComplete="current-password"
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                  type="password"
                  value={currentPassword}
                />
              </label>
              <label>
                New password
                <Input
                  autoComplete="new-password"
                  minLength={12}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  type="password"
                  value={newPassword}
                />
                <small>Use at least 12 characters.</small>
              </label>
            </div>
          </section>
          <footer className="settings-footer">
            <span>Credentials are never shown or stored in plain text.</span>
            <Button disabled={saving} type="submit" variant="primary">
              {saving ? 'Changing…' : 'Change password'}
            </Button>
          </footer>
        </form>
      ) : (
        <section className="settings-card">
          <div className="setting-copy">
            <h2>About</h2>
            <p>This profile is view-only. Only {profile.displayName} can change their photo or password.</p>
          </div>
        </section>
      )}
    </div>
  );
}
