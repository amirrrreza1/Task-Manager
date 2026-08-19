'use client';

import { Button, Input } from '../../../../components/design-system';
import { FormEvent, use, useEffect, useRef, useState } from 'react';
import { Avatar, invalidateAvatarCache } from '../../../../components/avatar';
import { useAuth } from '../../../../components/auth-provider';
import { useToast } from '../../../../components/toast-provider';
import type { ManagedUser } from '../../../../lib/types';

export default function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, request, updateUser, logout } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState<ManagedUser | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSelf = user?.id === id;
  const [email, setEmail] = useState('');
  const [telegramUsername, setTelegramUsername] = useState('');
  const [contactSaving, setContactSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    void request<ManagedUser>(`/users/${id}`)
      .then((next) => {
        if (!cancelled) {
          setProfile(next);
          setEmail(next.email || '');
          setTelegramUsername(next.telegramUsername ? `@${next.telegramUsername}` : '');
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setProfile(null);
          setLoadFailed(true);
          toast.fromError(caught, 'Could not load this profile.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, request, toast]);

  async function saveContactInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSelf && user?.role !== 'ADMIN') return;
    setContactSaving(true);
    try {
      const cleanTg = telegramUsername.trim().replace(/^@+/, '');
      const updated = await request<ManagedUser>(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          email: email.trim() || null,
          telegramUsername: cleanTg || null,
        }),
      });
      setProfile(updated);
      setEmail(updated.email || '');
      setTelegramUsername(updated.telegramUsername ? `@${updated.telegramUsername}` : '');
      if (isSelf) {
        updateUser({
          email: updated.email,
          telegramUsername: updated.telegramUsername,
        });
      }
      toast.success('Notification contact information updated.');
    } catch (caught) {
      toast.fromError(caught, 'Could not update contact info.');
    } finally {
      setContactSaving(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSelf) return;
    setSaving(true);
    try {
      await request<void>('/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      toast.success('Password changed. Sign in again with your new password.');
      window.setTimeout(() => void logout(), 1200);
    } catch (caught) {
      toast.fromError(caught, 'Could not change your password.');
    } finally {
      setSaving(false);
    }
  }

  async function onAvatarSelected(file: File | undefined) {
    if (!file || !isSelf || !user) return;
    setAvatarBusy(true);
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
      toast.success('Avatar updated.');
    } catch (caught) {
      toast.fromError(caught, 'Could not upload the avatar.');
    } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function removeAvatar() {
    if (!isSelf || !user) return;
    setAvatarBusy(true);
    try {
      const updated = await request<ManagedUser>(`/users/${user.id}/avatar`, { method: 'DELETE' });
      invalidateAvatarCache(user.id);
      setProfile(updated);
      updateUser({ hasAvatar: false });
      toast.success('Avatar removed. Your initial is shown instead.');
    } catch (caught) {
      toast.fromError(caught, 'Could not remove the avatar.');
    } finally {
      setAvatarBusy(false);
    }
  }

  if (loadFailed) {
    return (
      <div className="settings-layout profile-page">
        <p className="muted">This profile could not be loaded.</p>
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
                <Button
                  disabled={avatarBusy}
                  onClick={() => void removeAvatar()}
                  type="button"
                  variant="ghost"
                >
                  Use initial
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      {/* Contact & Notification Information Card */}
      {isSelf || user?.role === 'ADMIN' ? (
        <form className="settings-card" onSubmit={saveContactInfo}>
          <section>
            <div className="setting-copy">
              <h2>Notifications & Contact</h2>
              <p>
                Configure your email and Telegram handle to receive task assignments and updates.
              </p>
            </div>
            <div className="stacked-fields">
              <label>
                Email Address
                <Input
                  autoComplete="email"
                  placeholder="your.email@example.com"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <small>Used for direct email notifications via SMTP.</small>
              </label>
              <label>
                Telegram Username
                <Input
                  autoComplete="username"
                  placeholder="@username"
                  type="text"
                  value={telegramUsername}
                  onChange={(event) => setTelegramUsername(event.target.value)}
                />
                <small>
                  You will be mentioned via this handle in the team's Telegram group chat.
                </small>
              </label>
            </div>
          </section>
          <footer className="settings-footer">
            <Button disabled={contactSaving} type="submit" variant="primary">
              {contactSaving ? 'Saving…' : 'Save contact details'}
            </Button>
          </footer>
        </form>
      ) : (
        <section className="settings-card">
          <div className="setting-copy">
            <h2>Contact Information</h2>
          </div>
          <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <p>
              <strong>Email:</strong> {profile.email || 'Not configured'}
            </p>
            <p>
              <strong>Telegram:</strong>{' '}
              {profile.telegramUsername ? `@${profile.telegramUsername}` : 'Not configured'}
            </p>
          </div>
        </section>
      )}

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
            <Button disabled={saving} type="submit" variant="primary">
              {saving ? 'Changing…' : 'Change password'}
            </Button>
          </footer>
        </form>
      ) : (
        <section className="settings-card">
          <div className="setting-copy">
            <h2>About</h2>
            <p>
              This profile is view-only. Only {profile.displayName} can change their photo or
              password.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
