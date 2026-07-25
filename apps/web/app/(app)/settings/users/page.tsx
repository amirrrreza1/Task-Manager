'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AuthGate } from '../../../../components/auth-gate';
import { Avatar } from '../../../../components/avatar';
import { useAuth } from '../../../../components/auth-provider';
import type { ManagedUser } from '../../../../lib/types';

interface CreateForm {
  displayName: string;
  username: string;
  password: string;
}

const emptyCreateForm: CreateForm = { displayName: '', username: '', password: '' };

function UsersAdmin() {
  const { request } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm);
  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await request<ManagedUser[]>('/users'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load users.');
    }
  }, [request]);

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
    setError('');
    setBusyId('create');
    try {
      const created = await request<ManagedUser>('/users', {
        method: 'POST',
        body: JSON.stringify(createForm),
      });
      setUsers((current) =>
        [...current, created].sort((a, b) => a.displayName.localeCompare(b.displayName)),
      );
      setCreateForm(emptyCreateForm);
      setCreateOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the member.');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(user: ManagedUser) {
    setError('');
    setBusyId(user.id);
    try {
      const updated = await request<ManagedUser>(`/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      replaceUser(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the account.');
    } finally {
      setBusyId(null);
    }
  }

  async function regenerateAvatar(user: ManagedUser) {
    setError('');
    setBusyId(user.id);
    try {
      replaceUser(
        await request<ManagedUser>(`/users/${user.id}/avatar/regenerate`, { method: 'POST' }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not regenerate the avatar.');
    } finally {
      setBusyId(null);
    }
  }

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetUser) return;
    setError('');
    setBusyId(resetUser.id);
    try {
      await request<void>(`/users/${resetUser.id}/password`, {
        method: 'PUT',
        body: JSON.stringify({ password: resetPassword }),
      });
      setResetUser(null);
      setResetPassword('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reset the password.');
    } finally {
      setBusyId(null);
    }
  }

  function replaceUser(updated: ManagedUser) {
    setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)));
  }

  return (
    <div className="page-stack people-page">
      <header className="page-header compact-header">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>People &amp; access</h1>
          <p className="muted">
            Create accounts, rotate credentials, and control workspace access.
          </p>
        </div>
        <button className="button primary" onClick={() => setCreateOpen(true)} type="button">
          Add member
        </button>
      </header>

      <section className="people-toolbar" aria-label="User filters">
        <label className="search-field">
          <span className="visually-hidden">Search members</span>
          <input
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

      {error ? (
        <p className="form-error inline-alert" role="alert">
          {error}
        </p>
      ) : null}

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
              <Avatar name={user.displayName} seed={user.avatarSeed} />
              <span>
                <strong>{user.displayName}</strong>
                <small>@{user.username}</small>
              </span>
            </div>
            <span className="role-badge">{user.role === 'ADMIN' ? 'Administrator' : 'Member'}</span>
            <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
              {user.isActive ? 'Active' : 'Inactive'}
            </span>
            <div className="row-actions">
              <button
                className="button ghost compact"
                disabled={busyId === user.id}
                onClick={() => void regenerateAvatar(user)}
                type="button"
              >
                New avatar
              </button>
              {!user.isBootstrapAdmin ? (
                <>
                  <button
                    className="button ghost compact"
                    disabled={busyId === user.id}
                    onClick={() => setResetUser(user)}
                    type="button"
                  >
                    Reset password
                  </button>
                  <button
                    className={`button compact ${user.isActive ? 'danger-ghost' : 'secondary'}`}
                    disabled={busyId === user.id}
                    onClick={() => void toggleActive(user)}
                    type="button"
                  >
                    {user.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                </>
              ) : (
                <span className="env-note">Protected by environment</span>
              )}
            </div>
          </article>
        ))}
        {!visibleUsers.length ? <p className="empty-state">No members match that search.</p> : null}
      </section>

      {createOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-user-title"
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
                <input
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
                <input
                  required
                  minLength={3}
                  maxLength={64}
                  pattern="[A-Za-z0-9._-]+"
                  value={createForm.username}
                  onChange={(event) =>
                    setCreateForm({ ...createForm, username: event.target.value })
                  }
                />
              </label>
              <label>
                Temporary password
                <input
                  required
                  minLength={12}
                  maxLength={200}
                  type="password"
                  autoComplete="new-password"
                  value={createForm.password}
                  onChange={(event) =>
                    setCreateForm({ ...createForm, password: event.target.value })
                  }
                />
                <small>At least 12 characters. Share it securely.</small>
              </label>
              <footer>
                <button className="button ghost" onClick={() => setCreateOpen(false)} type="button">
                  Cancel
                </button>
                <button className="button primary" disabled={busyId === 'create'} type="submit">
                  {busyId === 'create' ? 'Creating…' : 'Create member'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

      {resetUser ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
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
                <input
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
                <button className="button ghost" onClick={() => setResetUser(null)} type="button">
                  Cancel
                </button>
                <button className="button primary" disabled={busyId === resetUser.id} type="submit">
                  Reset password
                </button>
              </footer>
            </form>
          </section>
        </div>
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
