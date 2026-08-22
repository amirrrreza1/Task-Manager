'use client';

import { Button, Input, Modal } from '../../../../components/design-system';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AuthGate } from '../../../../components/auth-gate';
import { Avatar } from '../../../../components/avatar';
import { HeaderActions } from '../../../../components/header-actions';
import { useAuth } from '../../../../components/auth-provider';
import { useToast } from '../../../../components/toast-provider';
import type { ManagedUser } from '../../../../lib/types';
import { pickLeastUsedUserColor, USER_COLORS } from '../../../../lib/user-colors';

interface CreateForm {
  displayName: string;
  username: string;
  password: string;
  email?: string;
  telegramUsername?: string;
  color: string;
}

const emptyCreateForm: CreateForm = {
  displayName: '',
  username: '',
  password: '',
  email: '',
  telegramUsername: '',
  color: USER_COLORS[0].value,
};

function UsersAdmin() {
  const { request } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm);
  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await request<ManagedUser[]>('/users'));
    } catch (caught) {
      toast.fromError(caught, 'Could not load users.');
    }
  }, [request, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter(
      (user) =>
        user.displayName.toLowerCase().includes(query) ||
        user.username.toLowerCase().includes(query),
    );
  }, [search, users]);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyId('create');
    try {
      const payload = {
        displayName: createForm.displayName.trim(),
        username: createForm.username.trim(),
        password: createForm.password,
        ...(createForm.email?.trim() ? { email: createForm.email.trim() } : {}),
        ...(createForm.telegramUsername?.trim()
          ? { telegramUsername: createForm.telegramUsername.trim().replace(/^@+/, '') }
          : {}),
        color: createForm.color,
      };
      const created = await request<ManagedUser>('/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setUsers((current) =>
        [...current, created].sort((a, b) => a.displayName.localeCompare(b.displayName)),
      );
      setCreateForm(emptyCreateForm);
      setCreateOpen(false);
      toast.success('Member created.');
    } catch (caught) {
      toast.fromError(caught, 'Could not create the member.');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(user: ManagedUser) {
    setBusyId(user.id);
    try {
      const updated = await request<ManagedUser>(`/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      replaceUser(updated);
      toast.success(updated.isActive ? 'Account activated.' : 'Account deactivated.');
    } catch (caught) {
      toast.fromError(caught, 'Could not update the account.');
    } finally {
      setBusyId(null);
    }
  }

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetUser) return;
    setBusyId(resetUser.id);
    try {
      await request<void>(`/users/${resetUser.id}/password`, {
        method: 'PUT',
        body: JSON.stringify({ password: resetPassword }),
      });
      setResetUser(null);
      setResetPassword('');
      toast.success('Password reset.');
    } catch (caught) {
      toast.fromError(caught, 'Could not reset the password.');
    } finally {
      setBusyId(null);
    }
  }

  function replaceUser(updated: ManagedUser) {
    setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)));
  }

  return (
    <div className="page-stack people-page">
      <HeaderActions>
        <Button
          variant="primary"
          onClick={() => {
            setCreateForm({
              ...emptyCreateForm,
              color: pickLeastUsedUserColor(users.map((user) => user.color)),
            });
            setCreateOpen(true);
          }}
          type="button"
        >
          Add member
        </Button>
      </HeaderActions>

      <section className="people-toolbar" aria-label="User filters">
        <label className="search-field">
          <span className="visually-hidden">Search members</span>
          <Input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or username"
            type="search"
            value={search}
          />
        </label>
        <div className="people-count">
          <strong>{users.filter((user) => user.isActive).length}</strong> active
          <span aria-hidden="true">·</span>
          <strong>{users.length}</strong> total
        </div>
      </section>

      <section className="people-list" aria-label="Workspace users">
        <header className="people-row people-row-head">
          <span>Member</span>
          <span>Role</span>
          <span>Status</span>
          <span>Actions</span>
        </header>
        {visibleUsers.map((user) => (
          <article className="people-row" key={user.id}>
            <div className="person-cell">
              <Avatar
                color={user.color}
                hasAvatar={user.hasAvatar}
                name={user.displayName}
                userId={user.id}
              />
              <span>
                <strong>
                  <Link className="report-link" href={`/profile/${user.id}`}>
                    {user.displayName}
                  </Link>
                </strong>
                <small className="flex items-center gap-1.5 flex-wrap">
                  <span>@{user.username}</span>
                  {user.email ? <span className="text-gray-400">· {user.email}</span> : null}
                  {user.telegramUsername ? (
                    <span className="text-sky-600 dark:text-sky-400">
                      · @{user.telegramUsername}
                    </span>
                  ) : null}
                </small>
              </span>
            </div>
            <span className="role-badge">{user.role === 'ADMIN' ? 'Administrator' : 'Member'}</span>
            <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
              {user.isActive ? 'Active' : 'Inactive'}
            </span>
            <div className="row-actions">
              {!user.isBootstrapAdmin ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyId === user.id}
                    onClick={() => setResetUser(user)}
                    type="button"
                  >
                    Reset password
                  </Button>
                  <Button
                    variant={user.isActive ? 'destructive' : 'outline'}
                    size="sm"
                    disabled={busyId === user.id}
                    onClick={() => void toggleActive(user)}
                    type="button"
                  >
                    {user.isActive ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </>
              ) : null}
            </div>
          </article>
        ))}
        {!visibleUsers.length ? <p className="empty-state">No members match that search.</p> : null}
      </section>

      {createOpen ? (
        <Modal
          className="modal"
          labelledBy="create-user-title"
          onOpenChange={(open) => {
            if (!open) setCreateOpen(false);
          }}
        >
          <header>
            <div>
              <p className="section-label">New account</p>
              <h2 id="create-user-title">Add a member</h2>
            </div>
          </header>
          <form onSubmit={createUser}>
            <label>
              Display name
              <Input
                required
                maxLength={100}
                value={createForm.displayName}
                onChange={(event) =>
                  setCreateForm({ ...createForm, displayName: event.target.value })
                }
              />
            </label>
            <label>
              Username
              <Input
                required
                minLength={3}
                maxLength={64}
                pattern="[A-Za-z0-9._-]+"
                value={createForm.username}
                onChange={(event) => setCreateForm({ ...createForm, username: event.target.value })}
              />
            </label>
            <label>
              Email address (Optional)
              <Input
                type="email"
                placeholder="user@example.com"
                value={createForm.email}
                onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })}
              />
            </label>
            <label>
              Telegram username (Optional)
              <Input
                placeholder="@username"
                value={createForm.telegramUsername}
                onChange={(event) =>
                  setCreateForm({ ...createForm, telegramUsername: event.target.value })
                }
              />
            </label>
            <label>
              Color
              <div className="user-color-field">
                <Avatar
                  color={createForm.color}
                  name={createForm.displayName || 'Member'}
                  size={36}
                />
                <div className="color-swatch-picker" role="radiogroup" aria-label="Member color">
                  {USER_COLORS.map((col) => (
                    <button
                      key={col.value}
                      aria-checked={createForm.color === col.value}
                      className={`color-swatch-button ${createForm.color === col.value ? 'selected' : ''}`}
                      onClick={() => setCreateForm({ ...createForm, color: col.value })}
                      role="radio"
                      style={{ backgroundColor: col.value }}
                      title={col.label}
                      type="button"
                    />
                  ))}
                </div>
              </div>
            </label>
            <label>
              Temporary password
              <Input
                required
                minLength={12}
                maxLength={200}
                type="password"
                autoComplete="new-password"
                value={createForm.password}
                onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })}
              />
            </label>
            <footer>
              <Button variant="ghost" onClick={() => setCreateOpen(false)} type="button">
                Cancel
              </Button>
              <Button variant="primary" disabled={busyId === 'create'} type="submit">
                {busyId === 'create' ? 'Creating…' : 'Create member'}
              </Button>
            </footer>
          </form>
        </Modal>
      ) : null}

      {resetUser ? (
        <Modal
          className="modal"
          labelledBy="reset-title"
          onOpenChange={(open) => {
            if (!open) setResetUser(null);
          }}
        >
          <header>
            <div>
              <p className="section-label">Credentials</p>
              <h2 id="reset-title">Reset {resetUser.displayName}&apos;s password</h2>
            </div>
          </header>
          <form onSubmit={submitReset}>
            <p className="muted">This immediately signs the member out of every device.</p>
            <label>
              New password
              <Input
                autoFocus
                required
                minLength={12}
                maxLength={200}
                type="password"
                autoComplete="new-password"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
              />
            </label>
            <footer>
              <Button variant="ghost" onClick={() => setResetUser(null)} type="button">
                Cancel
              </Button>
              <Button variant="primary" disabled={busyId === resetUser.id} type="submit">
                Reset password
              </Button>
            </footer>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

export default function UsersPage() {
  return (
    <AuthGate admin>
      <UsersAdmin />
    </AuthGate>
  );
}
