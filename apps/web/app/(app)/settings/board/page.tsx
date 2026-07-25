'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AuthGate } from '../../../../components/auth-gate';
import { useAuth } from '../../../../components/auth-provider';
import type { BoardColumn } from '../../../../lib/types';

interface ColumnForm {
  id?: string;
  name: string;
  color: string;
  isDone: boolean;
}

function BoardSettings() {
  const { request } = useAuth();
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [form, setForm] = useState<ColumnForm | null>(null);
  const [deleting, setDeleting] = useState<BoardColumn | null>(null);
  const [destination, setDestination] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setColumns(await request<BoardColumn[]>('/board-columns'));
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load board columns.');
    }
  }, [request]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    setError('');
    try {
      await request(form.id ? `/board-columns/${form.id}` : '/board-columns', {
        method: form.id ? 'PATCH' : 'POST',
        body: JSON.stringify({ name: form.name, color: form.color, isDone: form.isDone }),
      });
      setForm(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the column.');
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= columns.length) return;
    const next = [...columns];
    [next[index], next[target]] = [next[target], next[index]];
    setBusy(true);
    setError('');
    try {
      setColumns(
        await request<BoardColumn[]>('/board-columns/reorder', {
          method: 'POST',
          body: JSON.stringify({ columnIds: next.map((column) => column.id) }),
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reorder columns.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError('');
    try {
      await request<void>(
        `/board-columns/${deleting.id}${destination ? `?moveTasksTo=${destination}` : ''}`,
        { method: 'DELETE' },
      );
      setDeleting(null);
      setDestination('');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete the column.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack settings-layout">
      <header className="page-header compact-header">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Board workflow</h1>
          <p className="muted">
            Name, color, order, and completion semantics for your team&apos;s board.
          </p>
        </div>
        <button
          className="button primary"
          type="button"
          onClick={() => setForm({ name: '', color: '#64748B', isDone: false })}
        >
          Add column
        </button>
      </header>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <section className="column-settings-list" aria-label="Board columns">
        {columns.map((column, index) => (
          <article className="column-settings-row" key={column.id}>
            <span
              className="column-color-large"
              style={{ background: column.color }}
              aria-hidden="true"
            />
            <div>
              <strong>{column.name}</strong>
              <small>{column.isDone ? 'Completed work column' : `Position ${index + 1}`}</small>
            </div>
            {column.isDone ? <span className="status-pill done">Done</span> : <span />}
            <div className="row-actions">
              <button
                className="button ghost compact"
                disabled={busy || index === 0}
                aria-label={`Move ${column.name} left`}
                onClick={() => void move(index, -1)}
                type="button"
              >
                ←
              </button>
              <button
                className="button ghost compact"
                disabled={busy || index === columns.length - 1}
                aria-label={`Move ${column.name} right`}
                onClick={() => void move(index, 1)}
                type="button"
              >
                →
              </button>
              <button
                className="button ghost compact"
                type="button"
                onClick={() =>
                  setForm({
                    id: column.id,
                    name: column.name,
                    color: column.color.slice(0, 7),
                    isDone: column.isDone,
                  })
                }
              >
                Edit
              </button>
              <button
                className="button danger-ghost compact"
                disabled={column.isDone || columns.length <= 2}
                type="button"
                onClick={() => {
                  setDeleting(column);
                  setDestination(columns.find((item) => item.id !== column.id)?.id ?? '');
                }}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </section>
      <p className="settings-note">
        At least two columns are required. To delete the done column, designate another column as
        done first. Tasks in a deleted column move to the destination you select.
      </p>

      {form ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="column-modal-title"
          >
            <header>
              <p className="section-label">Workflow</p>
              <h2 id="column-modal-title">{form.id ? 'Edit column' : 'Add column'}</h2>
            </header>
            <form onSubmit={save}>
              <label>
                Name
                <input
                  autoFocus
                  required
                  maxLength={80}
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </label>
              <label>
                Color
                <input
                  type="color"
                  value={form.color}
                  onChange={(event) =>
                    setForm({ ...form, color: event.target.value.toUpperCase() })
                  }
                />
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={form.isDone}
                  disabled={Boolean(
                    form.id && columns.find((column) => column.id === form.id)?.isDone,
                  )}
                  onChange={(event) => setForm({ ...form, isDone: event.target.checked })}
                />
                <span>Designate as completed-work column</span>
              </label>
              <footer>
                <button className="button ghost" type="button" onClick={() => setForm(null)}>
                  Cancel
                </button>
                <button className="button primary" disabled={busy} type="submit">
                  Save column
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

      {deleting ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-column-title"
          >
            <header>
              <p className="section-label">Destructive action</p>
              <h2 id="delete-column-title">Delete {deleting.name}?</h2>
            </header>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              <p className="muted">Any tasks in this column will be moved atomically.</p>
              <label>
                Move tasks to
                <select
                  required
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                >
                  {columns
                    .filter((column) => column.id !== deleting.id)
                    .map((column) => (
                      <option value={column.id} key={column.id}>
                        {column.name}
                      </option>
                    ))}
                </select>
              </label>
              <footer>
                <button className="button ghost" type="button" onClick={() => setDeleting(null)}>
                  Cancel
                </button>
                <button className="button danger-ghost" disabled={busy} type="submit">
                  Delete column
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default function BoardSettingsPage() {
  return (
    <AuthGate admin>
      <BoardSettings />
    </AuthGate>
  );
}
