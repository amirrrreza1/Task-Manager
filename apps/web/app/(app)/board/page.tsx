'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar } from '../../../components/avatar';
import { useAuth } from '../../../components/auth-provider';
import type { BoardResponse, ManagedUser, TaskCard } from '../../../lib/types';

interface Filters {
  search: string;
  assigneeId: string;
  unassigned: boolean;
  estimate: '' | 'true' | 'false';
}

const emptyFilters: Filters = { search: '', assigneeId: '', unassigned: false, estimate: '' };

export default function BoardPage() {
  const { user, request } = useAuth();
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [columnId, setColumnId] = useState('');
  const [estimate, setEstimate] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFilters({
      search: params.get('search') ?? '',
      assigneeId: params.get('assigneeId') ?? '',
      unassigned: params.get('unassigned') === 'true',
      estimate:
        params.get('hasEstimate') === 'true'
          ? 'true'
          : params.get('hasEstimate') === 'false'
            ? 'false'
            : '',
    });
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.search.trim()) params.set('search', filters.search.trim());
    if (filters.assigneeId) params.set('assigneeId', filters.assigneeId);
    if (filters.unassigned) params.set('unassigned', 'true');
    if (filters.estimate) params.set('hasEstimate', filters.estimate);
    const query = params.toString();
    window.history.replaceState(null, '', query ? `/board?${query}` : '/board');
    try {
      const [nextBoard, nextUsers] = await Promise.all([
        request<BoardResponse>(`/board${query ? `?${query}` : ''}`),
        request<ManagedUser[]>('/users'),
      ]);
      setBoard(nextBoard);
      setUsers(nextUsers.filter((member) => member.isActive));
      if (!columnId) setColumnId(nextBoard.columns[0]?.id ?? '');
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the board.');
    }
  }, [columnId, filters, request]);

  useEffect(() => {
    void load();
  }, [load]);

  const taskCount = useMemo(
    () => board?.columns.reduce((sum, column) => sum + column.tasks.length, 0) ?? 0,
    [board],
  );

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!board) return;
    setBusy(true);
    setError('');
    try {
      await request('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description: description || null,
          columnId,
          assigneeIds,
          estimate: estimate
            ? {
                value: Number(estimate),
                unit: board.settings.estimateMode === 'TIME' ? 'MINUTES' : 'POINTS',
              }
            : null,
        }),
      });
      setTitle('');
      setDescription('');
      setEstimate('');
      setAssigneeIds([]);
      setCreateOpen(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the task.');
    } finally {
      setBusy(false);
    }
  }

  async function moveTask(task: TaskCard, targetColumnIndex: number, targetIndex: number) {
    if (!board || busy) return;
    const targetColumn = board.columns[targetColumnIndex];
    const candidates = targetColumn.tasks.filter((item) => item.id !== task.id);
    const safeIndex = Math.max(0, Math.min(targetIndex, candidates.length));
    const beforeTaskId = candidates[safeIndex - 1]?.id;
    const afterTaskId = candidates[safeIndex]?.id;
    setBusy(true);
    setError('');
    try {
      await request(`/tasks/${task.id}/move`, {
        method: 'POST',
        body: JSON.stringify({
          columnId: targetColumn.id,
          beforeTaskId,
          afterTaskId,
          expectedUpdatedAt: task.updatedAt,
        }),
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not move the task.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack board-page">
      <header className="page-header compact-header board-header">
        <div>
          <p className="eyebrow">Workspace board</p>
          <h1>Make the work visible.</h1>
          <p className="muted">
            {taskCount} {taskCount === 1 ? 'task' : 'tasks'} across {board?.columns.length ?? 0}{' '}
            workflow columns.
          </p>
        </div>
        <div className="header-actions">
          {user?.role === 'ADMIN' ? (
            <Link className="button secondary" href="/settings/board">
              Configure board
            </Link>
          ) : null}
          <button
            className="button primary"
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={!board?.columns.length}
          >
            New task
          </button>
        </div>
      </header>

      <section className="board-filters" aria-label="Board filters">
        <label className="board-search">
          <span>Search</span>
          <input
            type="search"
            value={filters.search}
            onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            placeholder="Title or description"
          />
        </label>
        <label>
          <span>Assignee</span>
          <select
            value={filters.assigneeId}
            disabled={filters.unassigned}
            onChange={(event) => setFilters({ ...filters, assigneeId: event.target.value })}
          >
            <option value="">Everyone</option>
            {users.map((member) => (
              <option value={member.id} key={member.id}>
                {member.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Estimate</span>
          <select
            value={filters.estimate}
            onChange={(event) =>
              setFilters({ ...filters, estimate: event.target.value as Filters['estimate'] })
            }
          >
            <option value="">Any</option>
            <option value="true">Estimated</option>
            <option value="false">No estimate</option>
          </select>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={filters.unassigned}
            onChange={(event) =>
              setFilters({
                ...filters,
                unassigned: event.target.checked,
                assigneeId: event.target.checked ? '' : filters.assigneeId,
              })
            }
          />
          <span>Unassigned only</span>
        </label>
        <button
          className="button ghost compact"
          type="button"
          onClick={() => setFilters(emptyFilters)}
        >
          Clear
        </button>
      </section>

      {error ? (
        <p className="form-error inline-alert" role="alert">
          {error}
        </p>
      ) : null}
      {!board ? (
        <div className="board-loading">
          <span className="spinner" /> Loading board…
        </div>
      ) : (
        <section className="task-board" aria-label="Task board">
          {board.columns.map((column, columnIndex) => (
            <article
              className="task-column"
              key={column.id}
              aria-label={`${column.name}, ${column.tasks.length} tasks`}
            >
              <header>
                <span className="column-dot" style={{ backgroundColor: column.color }} />
                <strong>{column.name}</strong>
                {column.isDone ? <span className="done-label">Done</span> : null}
                <small>{column.tasks.length}</small>
              </header>
              <div className="task-column-body">
                {column.tasks.map((task, taskIndex) => {
                  const completed = task.subtasks.filter((item) => item.isCompleted).length;
                  return (
                    <article className="task-card" key={task.id}>
                      <Link href={`/tasks/${task.id}`} className="task-card-main">
                        <h2>{task.title}</h2>
                        {task.description ? <p>{task.description}</p> : null}
                        <div className="task-card-facts">
                          {task.estimateValue ? (
                            <span>
                              {task.estimateUnit === 'MINUTES'
                                ? formatMinutes(task.estimateValue)
                                : `${task.estimateValue} pt`}
                            </span>
                          ) : null}
                          {task.subtasks.length ? (
                            <span>
                              {completed}/{task.subtasks.length} subtasks
                            </span>
                          ) : null}
                          {task._count.attachments ? (
                            <span>
                              {task._count.attachments} file
                              {task._count.attachments === 1 ? '' : 's'}
                            </span>
                          ) : null}
                        </div>
                        {task.assignees.length ? (
                          <div
                            className="card-assignees"
                            aria-label={`Assigned to ${task.assignees.map((item) => item.user.displayName).join(', ')}`}
                          >
                            {task.assignees.slice(0, 4).map((item) => (
                              <Avatar
                                key={item.user.id}
                                name={item.user.displayName}
                                seed={item.user.avatarSeed}
                                size={27}
                              />
                            ))}
                            {task.assignees.length > 4 ? (
                              <span>+{task.assignees.length - 4}</span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="unassigned-label">Unassigned</span>
                        )}
                      </Link>
                      <div className="task-move-controls" aria-label={`Move ${task.title}`}>
                        <button
                          title="Move left"
                          aria-label={`Move ${task.title} left`}
                          disabled={busy || columnIndex === 0}
                          onClick={() =>
                            void moveTask(
                              task,
                              columnIndex - 1,
                              board.columns[columnIndex - 1]?.tasks.length ?? 0,
                            )
                          }
                        >
                          ←
                        </button>
                        <button
                          title="Move up"
                          aria-label={`Move ${task.title} up`}
                          disabled={busy || taskIndex === 0}
                          onClick={() => void moveTask(task, columnIndex, taskIndex - 1)}
                        >
                          ↑
                        </button>
                        <button
                          title="Move down"
                          aria-label={`Move ${task.title} down`}
                          disabled={busy || taskIndex === column.tasks.length - 1}
                          onClick={() => void moveTask(task, columnIndex, taskIndex + 1)}
                        >
                          ↓
                        </button>
                        <button
                          title="Move right"
                          aria-label={`Move ${task.title} right`}
                          disabled={busy || columnIndex === board.columns.length - 1}
                          onClick={() =>
                            void moveTask(
                              task,
                              columnIndex + 1,
                              board.columns[columnIndex + 1]?.tasks.length ?? 0,
                            )
                          }
                        >
                          →
                        </button>
                      </div>
                    </article>
                  );
                })}
                {!column.tasks.length ? (
                  <div className="empty-column">No matching tasks</div>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      )}

      {createOpen && board ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal task-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-task-title"
          >
            <header>
              <p className="section-label">New work</p>
              <h2 id="new-task-title">Create a task</h2>
            </header>
            <form onSubmit={createTask}>
              <label>
                Title
                <input
                  autoFocus
                  required
                  maxLength={240}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label>
                Description <small>Optional, plain text or Markdown</small>
                <textarea
                  rows={4}
                  maxLength={50000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <div className="form-grid">
                <label>
                  Column
                  <select
                    required
                    value={columnId}
                    onChange={(event) => setColumnId(event.target.value)}
                  >
                    {board.columns.map((column) => (
                      <option value={column.id} key={column.id}>
                        {column.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {board.settings.estimateMode === 'TIME' ? 'Minutes' : 'Points'}
                  <input
                    min={1}
                    max={board.settings.estimateMode === 'TIME' ? 525600 : 10000}
                    type="number"
                    value={estimate}
                    onChange={(event) => setEstimate(event.target.value)}
                    placeholder="Optional"
                  />
                </label>
              </div>
              <fieldset className="assignee-picker">
                <legend>Assignees</legend>
                {users.map((member) => (
                  <label key={member.id}>
                    <input
                      type="checkbox"
                      checked={assigneeIds.includes(member.id)}
                      onChange={(event) =>
                        setAssigneeIds(
                          event.target.checked
                            ? [...assigneeIds, member.id]
                            : assigneeIds.filter((id) => id !== member.id),
                        )
                      }
                    />
                    <Avatar name={member.displayName} seed={member.avatarSeed} size={26} />
                    <span>{member.displayName}</span>
                  </label>
                ))}
                {!users.length ? <p className="muted">No active members.</p> : null}
              </fieldset>
              <footer>
                <button className="button ghost" type="button" onClick={() => setCreateOpen(false)}>
                  Cancel
                </button>
                <button className="button primary" disabled={busy} type="submit">
                  {busy ? 'Creating…' : 'Create task'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function formatMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours ? `${hours}h${minutes ? ` ${minutes}m` : ''}` : `${minutes}m`;
}
