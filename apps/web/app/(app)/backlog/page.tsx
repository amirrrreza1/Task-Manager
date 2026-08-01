'use client';

import { Button, Checkbox, Input, Modal, Select, Textarea } from '../../../components/design-system';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar } from '../../../components/avatar';
import { useAuth } from '../../../components/auth-provider';
import type { BoardResponse, ManagedUser, Paginated, SprintSummary, TaskCard } from '../../../lib/types';
import { backlogBoard, primaryBacklogColumn } from '../../../lib/board-columns';

function formatHours(value: number) {
  return `${value}h`;
}

export default function BacklogPage() {
  const { request } = useAuth();
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [sprintOptions, setSprintOptions] = useState<SprintSummary[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [estimate, setEstimate] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [sprintId, setSprintId] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const backlogColumn = board ? primaryBacklogColumn(board) : null;
  const tasks = useMemo(() => {
    const items = backlogColumn?.tasks ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (task) =>
        task.title.toLowerCase().includes(term) ||
        (task.description?.toLowerCase().includes(term) ?? false),
    );
  }, [backlogColumn, search]);

  const load = useCallback(async () => {
    try {
      const [nextBoard, nextUsers, planned, active] = await Promise.all([
        request<BoardResponse>('/board'),
        request<ManagedUser[]>('/users'),
        request<Paginated<SprintSummary>>('/sprints?status=PLANNED'),
        request<Paginated<SprintSummary>>('/sprints?status=ACTIVE'),
      ]);
      setBoard(backlogBoard(nextBoard));
      setUsers(nextUsers.filter((member) => member.isActive));
      setSprintOptions([...active.items, ...planned.items]);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the backlog.');
    }
  }, [request]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!board || !backlogColumn) return;
    setBusy(true);
    setError('');
    try {
      await request('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title,
          ...(description.trim() ? { description } : {}),
          ...(sprintId ? { sprintId } : {}),
          assigneeIds,
          ...(estimate
            ? {
                estimate: {
                  value: Number(estimate),
                  unit: board.settings.estimateMode === 'TIME' ? 'HOURS' : 'POINTS',
                },
              }
            : {}),
        }),
      });
      setTitle('');
      setDescription('');
      setEstimate('');
      setAssigneeIds([]);
      setSprintId('');
      setCreateOpen(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the task.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack backlog-page">
      <header className="page-header compact-header">
        <div>
          <p className="eyebrow">Product backlog</p>
          <h1>Capture work before it hits the board.</h1>
          <p className="muted">
            New tasks start here. Open a task to move it onto the workflow board or assign it to a
            sprint.
          </p>
        </div>
        <div className="header-actions">
          <Button
            variant="primary"
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={!backlogColumn}
          >
            New task
          </Button>
        </div>
      </header>

      <section className="board-filters" aria-label="Backlog filters">
        <label className="board-search">
          <span>Search</span>
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Title or description"
          />
        </label>
      </section>

      {error ? (
        <p className="form-error inline-alert" role="alert">
          {error}
        </p>
      ) : null}

      {!board ? (
        <div className="board-loading">
          <span className="spinner" /> Loading backlog…
        </div>
      ) : (
        <section className="backlog-list" aria-label="Backlog tasks">
          {tasks.map((task) => (
            <BacklogTaskRow key={task.id} task={task} />
          ))}
          {!tasks.length ? (
            <p className="empty-copy">No tasks in the backlog yet. Create one to get started.</p>
          ) : null}
        </section>
      )}

      {createOpen && board && backlogColumn ? (
        <Modal
          className="modal task-modal"
          labelledBy="backlog-new-task-title"
          onOpenChange={(open) => {
            if (!open) setCreateOpen(false);
          }}
        >
            <header>
              <p className="section-label">New work</p>
              <h2 id="backlog-new-task-title">Create a backlog task</h2>
            </header>
            <form onSubmit={createTask}>
              <label>
                Title
                <Input
                  autoFocus
                  required
                  maxLength={240}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label>
                Description <small>Optional, plain text or Markdown</small>
                <Textarea
                  rows={4}
                  maxLength={50000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <label>
                {board.settings.estimateMode === 'TIME' ? 'Hours' : 'Points'}
                <Input
                  min={1}
                  max={board.settings.estimateMode === 'TIME' ? 8760 : 10000}
                  type="number"
                  value={estimate}
                  onChange={(event) => setEstimate(event.target.value)}
                  placeholder="Optional"
                />
              </label>
              <label>
                Sprint <small>Optional — planned or active</small>
                <Select value={sprintId} onChange={(event) => setSprintId(event.target.value)}>
                  <option value="">No sprint</option>
                  {sprintOptions.map((sprint) => (
                    <option value={sprint.id} key={sprint.id}>
                      {sprint.name}
                      {sprint.status === 'ACTIVE' ? ' (active)' : ''}
                    </option>
                  ))}
                </Select>
              </label>
              <fieldset className="assignee-picker">
                <legend>Assignees</legend>
                {users.map((member) => (
                  <label key={member.id}>
                    <Checkbox
                      checked={assigneeIds.includes(member.id)}
                      onChange={(event) =>
                        setAssigneeIds(
                          event.target.checked
                            ? [...assigneeIds, member.id]
                            : assigneeIds.filter((id) => id !== member.id),
                        )
                      }
                    />
                    <Avatar
                      hasAvatar={member.hasAvatar}
                      name={member.displayName}
                      size={26}
                      userId={member.id}
                    />
                    <span>{member.displayName}</span>
                  </label>
                ))}
                {!users.length ? <p className="muted">No active members.</p> : null}
              </fieldset>
              <footer>
                <Button variant="ghost" type="button" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" disabled={busy} type="submit">
                  {busy ? 'Creating…' : 'Create task'}
                </Button>
              </footer>
            </form>
        </Modal>
      ) : null}
    </div>
  );
}

function BacklogTaskRow({ task }: { task: TaskCard }) {
  const completed = task.subtasks.filter((item) => item.isCompleted).length;
  return (
    <article className="backlog-task">
      <Link href={`/tasks/${task.id}`} className="backlog-task-main">
        <h2>{task.title}</h2>
        <p className={task.description ? undefined : 'is-empty'}>{task.description || '\u00A0'}</p>
        <div className="task-card-facts">
          {task.estimateValue ? (
            <span>
              {task.estimateUnit === 'HOURS'
                ? formatHours(task.estimateValue)
                : `${task.estimateValue} pt`}
            </span>
          ) : null}
          {task.subtasks.length ? (
            <span>
              {completed}/{task.subtasks.length} subtasks
            </span>
          ) : null}
        </div>
      </Link>
      <div className="backlog-task-meta">
        {task.assignees.length ? (
          <div className="card-assignees" aria-label="Assignees">
            {task.assignees.slice(0, 4).map((item) => (
              <Avatar
                hasAvatar={item.user.hasAvatar}
                key={item.user.id}
                name={item.user.displayName}
                size={28}
                userId={item.user.id}
              />
            ))}
          </div>
        ) : (
          <span className="muted">Unassigned</span>
        )}
      </div>
    </article>
  );
}
