'use client';

import { FormEvent, useState } from 'react';
import { Avatar } from '../../../components/avatar';
import { useAuth } from '../../../components/auth-provider';

export default function ProfilePage() {
  const { user, request, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  if (!user) return null;

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

  return (
    <div className="settings-layout profile-page">
      <header className="profile-identity">
        <Avatar name={user.displayName} seed={user.avatarSeed} size={84} />
        <div>
          <p className="eyebrow">Your profile</p>
          <h1>{user.displayName}</h1>
          <p className="muted">
            @{user.username} · {user.role === 'ADMIN' ? 'Administrator' : 'Member'}
          </p>
        </div>
      </header>
      <form className="settings-card password-card" onSubmit={changePassword}>
        <section>
          <div className="setting-copy">
            <h2>Change password</h2>
            <p>Changing your password signs you out of every device.</p>
          </div>
          <div className="stacked-fields">
            <label>
              Current password
              <input
                required
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label>
              New password
              <input
                required
                minLength={12}
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <small>Use at least 12 characters.</small>
            </label>
          </div>
        </section>
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
        <footer className="settings-footer">
          <span>Credentials are never shown or stored in plain text.</span>
          <button className="button primary" disabled={saving} type="submit">
            {saving ? 'Changing…' : 'Change password'}
          </button>
        </footer>
      </form>
    </div>
  );
}
