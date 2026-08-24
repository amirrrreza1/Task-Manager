'use client';

import { Button, Input, Select } from '../../../../components/design-system';
import { FormEvent, use, useEffect, useRef, useState } from 'react';
import { Avatar, invalidateAvatarCache } from '../../../../components/avatar';
import { useAuth } from '../../../../components/auth-provider';
import { useToast } from '../../../../components/toast-provider';
import type { ManagedUser, UserRole } from '../../../../lib/types';
import { USER_COLORS } from '../../../../lib/user-colors';

export default function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, request, updateUser, logout } = useAuth();
  const toast = useToast();

  const [profile, setProfile] = useState<ManagedUser | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  // Form states
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [telegramUsername, setTelegramUsername] = useState('');
  const [color, setColor] = useState<string>(USER_COLORS[0].value);
  const [role, setRole] = useState<UserRole>('MEMBER');
  const [isActive, setIsActive] = useState(true);

  // Password states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [adminNewPassword, setAdminNewPassword] = useState('');

  // Loading states
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [adminPasswordSaving, setAdminPasswordSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSelf = user?.id === id;
  const isAdmin = user?.role === 'ADMIN';
  const canEdit = isSelf || isAdmin;

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    void request<ManagedUser>(`/users/${id}`)
      .then((next) => {
        if (!cancelled) {
          setProfile(next);
          setDisplayName(next.displayName || '');
          setUsername(next.username || '');
          setEmail(next.email || '');
          setTelegramUsername(next.telegramUsername ? `@${next.telegramUsername}` : '');
          setColor(next.color || USER_COLORS[0].value);
          setRole(next.role);
          setIsActive(next.isActive);
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

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    setProfileSaving(true);
    try {
      const cleanTg = telegramUsername.trim().replace(/^@+/, '');
      const payload: Record<string, unknown> = {
        displayName: displayName.trim(),
        email: email.trim() || null,
        telegramUsername: cleanTg || null,
        color,
      };

      if (isAdmin && !profile?.isBootstrapAdmin) {
        payload.username = username.trim();
        payload.role = role;
        payload.isActive = isActive;
      }

      const updated = await request<ManagedUser>(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      setProfile(updated);
      setDisplayName(updated.displayName || '');
      setUsername(updated.username || '');
      setEmail(updated.email || '');
      setTelegramUsername(updated.telegramUsername ? `@${updated.telegramUsername}` : '');
      setColor(updated.color || USER_COLORS[0].value);
      setRole(updated.role);
      setIsActive(updated.isActive);

      if (isSelf) {
        updateUser({
          displayName: updated.displayName,
          username: updated.username,
          email: updated.email,
          telegramUsername: updated.telegramUsername,
          color: updated.color,
          role: updated.role,
        });
      }
      toast.success('Profile details updated.');
    } catch (caught) {
      toast.fromError(caught, 'Could not update profile details.');
    } finally {
      setProfileSaving(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSelf) return;
    setPasswordSaving(true);
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
      setPasswordSaving(false);
    }
  }

  async function resetMemberPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || isSelf || profile?.isBootstrapAdmin) return;
    setAdminPasswordSaving(true);
    try {
      await request<void>(`/users/${id}/password`, {
        method: 'PUT',
        body: JSON.stringify({ password: adminNewPassword }),
      });
      setAdminNewPassword('');
      toast.success(`${profile?.displayName}'s password has been reset.`);
    } catch (caught) {
      toast.fromError(caught, 'Could not reset password.');
    } finally {
      setAdminPasswordSaving(false);
    }
  }

  async function onAvatarSelected(file: File | undefined) {
    if (!file || !canEdit || !profile) return;
    setAvatarBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const updated = await request<ManagedUser>(`/users/${profile.id}/avatar`, {
        method: 'POST',
        body,
      });
      invalidateAvatarCache(profile.id);
      setProfile(updated);
      if (isSelf) {
        updateUser({
          hasAvatar: updated.hasAvatar,
          displayName: updated.displayName,
        });
      }
      toast.success('Avatar photo updated.');
    } catch (caught) {
      toast.fromError(caught, 'Could not upload avatar photo.');
    } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function removeAvatar() {
    if (!canEdit || !profile) return;
    setAvatarBusy(true);
    try {
      const updated = await request<ManagedUser>(`/users/${profile.id}/avatar`, {
        method: 'DELETE',
      });
      invalidateAvatarCache(profile.id);
      setProfile(updated);
      if (isSelf) {
        updateUser({ hasAvatar: false });
      }
      toast.success('Avatar removed. Color and initial are shown instead.');
    } catch (caught) {
      toast.fromError(caught, 'Could not remove avatar.');
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

  const effectiveDisplayName = displayName || profile.displayName;
  const effectiveColor = color || profile.color;
  const effectiveUsername = username || profile.username;
  const effectiveRole = isAdmin ? role : profile.role;
  const effectiveIsActive = isAdmin ? isActive : profile.isActive;

  return (
    <div className="settings-layout profile-page">
      <header className="profile-identity">
        <Avatar
          color={effectiveColor}
          hasAvatar={profile.hasAvatar}
          name={effectiveDisplayName}
          size={84}
          userId={profile.id}
        />
        <div>
          <p className="eyebrow">{isSelf ? 'Your profile' : 'Member profile'}</p>
          <h1>{effectiveDisplayName}</h1>
          <p className="muted">
            @{effectiveUsername} · {effectiveRole === 'ADMIN' ? 'Administrator' : 'Member'}
            {!effectiveIsActive ? ' · Inactive' : ''}
          </p>
          {canEdit ? (
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

      {/* Profile & Contact Details Card */}
      {canEdit ? (
        <form className="settings-card" onSubmit={saveProfile}>
          <section>
            <div className="setting-copy">
              <h2>Profile & Contact Details</h2>
              <p>Manage identity, contact information, profile color, and access privileges.</p>
            </div>
            <div className="stacked-fields">
              <label>
                Display Name
                <Input
                  autoComplete="name"
                  maxLength={100}
                  placeholder="Full name or nickname"
                  required
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </label>

              <label>
                Username
                <Input
                  autoComplete="username"
                  disabled={!isAdmin || profile.isBootstrapAdmin}
                  maxLength={64}
                  minLength={3}
                  pattern="[A-Za-z0-9._-]+"
                  placeholder="username"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
                {profile.isBootstrapAdmin ? (
                  <small>
                    The bootstrap administrator username is managed via environment variables.
                  </small>
                ) : !isAdmin ? (
                  <small>Only workspace administrators can change account usernames.</small>
                ) : null}
              </label>

              <label>
                Profile Picture Color
                <div className="user-color-field">
                  <Avatar color={effectiveColor} name={effectiveDisplayName} size={36} />
                  <div
                    className="color-swatch-picker"
                    role="radiogroup"
                    aria-label="Profile picture color"
                  >
                    {USER_COLORS.map((col) => (
                      <button
                        key={col.value}
                        aria-checked={color === col.value}
                        className={`color-swatch-button ${color === col.value ? 'selected' : ''}`}
                        onClick={() => setColor(col.value)}
                        role="radio"
                        style={{ backgroundColor: col.value }}
                        title={col.label}
                        type="button"
                      />
                    ))}
                  </div>
                </div>
                <small>
                  Used for initial avatars, badge accents, and mentions across the board.
                </small>
              </label>

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

              {isAdmin ? (
                <>
                  <label>
                    Role
                    <Select
                      disabled={profile.isBootstrapAdmin}
                      value={role}
                      onChange={(event) => setRole(event.target.value as UserRole)}
                    >
                      <option value="MEMBER">Member</option>
                      <option value="ADMIN">Administrator</option>
                    </Select>
                    {profile.isBootstrapAdmin ? (
                      <small>The bootstrap administrator role cannot be altered.</small>
                    ) : (
                      <small>
                        Administrators have full management privileges across the workspace.
                      </small>
                    )}
                  </label>

                  {!isSelf && !profile.isBootstrapAdmin ? (
                    <label>
                      Account Status
                      <Select
                        value={isActive ? 'active' : 'inactive'}
                        onChange={(event) => setIsActive(event.target.value === 'active')}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </Select>
                      <small>
                        Inactive members cannot log in, and all their active sessions will be
                        terminated.
                      </small>
                    </label>
                  ) : null}
                </>
              ) : null}
            </div>
          </section>
          <footer className="settings-footer">
            <Button disabled={profileSaving} type="submit" variant="primary">
              {profileSaving ? 'Saving…' : 'Save profile changes'}
            </Button>
          </footer>
        </form>
      ) : (
        <section className="settings-card">
          <div className="setting-copy">
            <h2>Profile & Contact Information</h2>
          </div>
          <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <p>
              <strong>Display Name:</strong> {profile.displayName}
            </p>
            <p>
              <strong>Username:</strong> @{profile.username}
            </p>
            <p>
              <strong>Role:</strong> {profile.role === 'ADMIN' ? 'Administrator' : 'Member'}
            </p>
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

      {/* Password Management */}
      {isSelf ? (
        <form className="settings-card password-card" onSubmit={changePassword}>
          <section>
            <div className="setting-copy">
              <h2>Change Password</h2>
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
            <Button disabled={passwordSaving} type="submit" variant="primary">
              {passwordSaving ? 'Changing…' : 'Change password'}
            </Button>
          </footer>
        </form>
      ) : isAdmin ? (
        profile.isBootstrapAdmin ? (
          <section className="settings-card">
            <div className="setting-copy">
              <h2>Password Management</h2>
              <p className="muted">
                The bootstrap administrator password is set via environment variables (
                <code>BOOTSTRAP_ADMIN_PASSWORD</code>).
              </p>
            </div>
          </section>
        ) : (
          <form className="settings-card password-card" onSubmit={resetMemberPassword}>
            <section>
              <div className="setting-copy">
                <h2>Reset Member Password</h2>
                <p>
                  As an administrator, you can set a new password for {profile.displayName}. This
                  immediately signs them out of all active sessions.
                </p>
              </div>
              <div className="stacked-fields">
                <label>
                  New password
                  <Input
                    autoComplete="new-password"
                    minLength={12}
                    onChange={(event) => setAdminNewPassword(event.target.value)}
                    placeholder="Enter new password for member"
                    required
                    type="password"
                    value={adminNewPassword}
                  />
                  <small>Use at least 12 characters.</small>
                </label>
              </div>
            </section>
            <footer className="settings-footer">
              <Button disabled={adminPasswordSaving} type="submit" variant="primary">
                {adminPasswordSaving ? 'Resetting…' : 'Reset password'}
              </Button>
            </footer>
          </form>
        )
      ) : null}
    </div>
  );
}
