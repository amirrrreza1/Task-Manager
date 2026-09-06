'use client';

import {
  Button,
  Checkbox,
  Input,
  Modal,
  Select,
  Textarea,
} from '../../../components/design-system';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar } from '../../../components/avatar';
import { HeaderActions } from '../../../components/header-actions';
import { PriorityBadge, PrioritySelect } from '../../../components/priority-badge';
import { ProjectIcon } from '../../../lib/project-icons';
import { useAuth } from '../../../components/auth-provider';
import { useToast } from '../../../components/toast-provider';
import { useWorkspace } from '../../../components/workspace-provider';
import { DEFAULT_TASK_PRIORITY } from '../../../lib/priority';
import { parseEstimateInput } from '../../../lib/estimate';
import type {
  BoardResponse,
  ManagedUser,
  Paginated,
  Project,
  SprintSummary,
  TaskCard,
  TaskPriority,
} from '../../../lib/types';
import { backlogBoard, primaryBacklogColumn } from '../../../lib/board-columns';
import { useBoardSocket } from '../../../lib/use-board-socket';

function formatHours(value: number) {
  return `${value}h`;
}

export default function BacklogPage() {
  const { request } = useAuth();
  const toast = useToast();
  const { currentWorkspace } = useWorkspace();
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sprintOptions, setSprintOptions] = useState<SprintSummary[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [estimate, setEstimate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>(DEFAULT_TASK_PRIORITY);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [sprintId, setSprintId] = useState('');
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [projectFilter, setProjectFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const proj = params.get('projectId');
    if (proj) setProjectFilter(proj);
    const q = params.get('search');
    if (q) setSearch(q);
  }, []);

  const updateFilters = (nextProject: string, nextSearch: string) => {
    setProjectFilter(nextProject);
    setSearch(nextSearch);
    const params = new URLSearchParams();
    if (nextProject) params.set('projectId', nextProject);
    if (nextSearch.trim()) params.set('search', nextSearch.trim());
    const query = params.toString();
    window.history.replaceState(null, '', query ? `/backlog?${query}` : '/backlog');
  };

  const backlogColumn = board ? primaryBacklogColumn(board) : null;
  const tasks = useMemo(() => {
    let items = backlogColumn?.tasks ?? [];
    if (projectFilter) {
      items = items.filter(
        (task) =>
          task.projectId === projectFilter ||
          task.project?.id === projectFilter ||
          task.projects?.some((p) => p.project.id === projectFilter),
      );
    }
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (task) =>
        task.title.toLowerCase().includes(term) ||
        (task.description?.toLowerCase().includes(term) ?? false),
    );
  }, [backlogColumn, search, projectFilter]);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const wsParam = currentWorkspace?.id ? `?workspaceId=${currentWorkspace.id}` : '';
      const wsSprintPlanned = currentWorkspace?.id
        ? `?workspaceId=${currentWorkspace.id}&status=PLANNED`
        : '?status=PLANNED';
      const wsSprintActive = currentWorkspace?.id
        ? `?workspaceId=${currentWorkspace.id}&status=ACTIVE`
        : '?status=ACTIVE';

      const [nextBoard, nextUsers, planned, active, nextProjects] = await Promise.all([
        request<BoardResponse>(`/board${wsParam}`),
        request<ManagedUser[]>('/users'),
        request<Paginated<SprintSummary>>(`/sprints${wsSprintPlanned}`),
        request<Paginated<SprintSummary>>(`/sprints${wsSprintActive}`),
        request<Project[]>(`/projects${wsParam}`),
      ]);
      setBoard(backlogBoard(nextBoard));
      setUsers(nextUsers.filter((member) => member.isActive));
      setSprintOptions([...active.items, ...planned.items]);
      setProjects(nextProjects);
      setLoadFailed(false);
    } catch (caught) {
      setLoadFailed(true);
      toast.fromError(caught, 'Could not load the backlog.');
    }
  }, [request, currentWorkspace?.id, toast]);

  const handleBoardUpdate = useCallback(() => {
    if (!busy) {
      void load();
    }
  }, [busy, load]);

  const { isConnected } = useBoardSocket(currentWorkspace?.id, handleBoardUpdate);

  useEffect(() => {
    void load();
  }, [load]);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!board || !backlogColumn) return;

    const parsedEstimate = parseEstimateInput(estimate);
    if (estimate.trim() && (parsedEstimate === null || Number.isNaN(parsedEstimate))) {
      toast.error('Please enter a valid positive numeric estimate.');
      return;
    }

    setBusy(true);
    try {
      await request('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title,
          ...(currentWorkspace?.id ? { workspaceId: currentWorkspace.id } : {}),
          ...(description.trim() ? { description } : {}),
          ...(sprintId ? { sprintId } : {}),
          ...(projectIds.length > 0 ? { projectIds } : {}),
          assigneeIds,
          priority,
          ...(parsedEstimate !== null
            ? {
                estimate: {
                  value: parsedEstimate,
                  unit: board.settings.estimateMode === 'TIME' ? 'HOURS' : 'POINTS',
                },
              }
            : {}),
        }),
      });
      setTitle('');
      setDescription('');
      setEstimate('');
      setPriority(DEFAULT_TASK_PRIORITY);
      setAssigneeIds([]);
      setSprintId('');
      setProjectIds([]);
      setCreateOpen(false);
      toast.success('Task created.');
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not create the task.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack backlog-page">
      <HeaderActions>
        <div
          className={`board-live-badge ${isConnected ? 'is-connected' : 'is-disconnected'}`}
          title={
            isConnected
              ? 'Real-time synchronization is connected'
              : 'Connecting to real-time synchronization...'
          }
          aria-label={isConnected ? 'Live sync connected' : 'Connecting to live sync'}
        >
          <span className="live-dot" />
          <span>{isConnected ? 'Live' : 'Connecting'}</span>
        </div>
        <Button
          variant="primary"
          type="button"
          onClick={() => setCreateOpen(true)}
          disabled={!backlogColumn}
        >
          New task
        </Button>
      </HeaderActions>

      <section className="board-filters" aria-label="Backlog filters">
        <label className="board-search">
          <span>Search</span>
          <Input
            type="search"
            value={search}
            onChange={(event) => updateFilters(projectFilter, event.target.value)}
            placeholder="Title or description"
          />
        </label>
        <label>
          <span>Project</span>
          <Select
            value={projectFilter}
            onChange={(event) => updateFilters(event.target.value, search)}
          >
            <option value="">All projects</option>
            {projects.map((proj) => (
              <option value={proj.id} key={proj.id}>
                {proj.key ? `${proj.key}-${proj.name}` : proj.name}
              </option>
            ))}
          </Select>
        </label>
      </section>

      {!board ? (
        <div className="board-loading">
          {loadFailed ? (
            <p className="empty-copy">The backlog could not be loaded.</p>
          ) : (
            <>
              <span className="spinner" /> Loading backlog…
            </>
          )}
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
            <fieldset className="assignee-picker">
              <legend>Projects</legend>
              {projects.map((proj) => {
                const isChecked = projectIds.includes(proj.id);
                const color = proj.color || '#2563EB';
                return (
                  <label
                    className="assignee-choice project-choice"
                    key={proj.id}
                    style={
                      isChecked
                        ? {
                            backgroundColor: `${color}18`,
                            borderColor: `${color}60`,
                          }
                        : undefined
                    }
                  >
                    <Checkbox
                      checked={isChecked}
                      onChange={(event) =>
                        setProjectIds(
                          event.target.checked
                            ? [...projectIds, proj.id]
                            : projectIds.filter((id) => id !== proj.id),
                        )
                      }
                    />
                    <ProjectIcon className="project-badge-icon" name={proj.icon} />
                    <span>{proj.key ? `${proj.key}-${proj.name}` : proj.name}</span>
                  </label>
                );
              })}
              {!projects.length ? <p className="muted">No projects in this workspace.</p> : null}
            </fieldset>
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
                type="text"
                inputMode="decimal"
                value={estimate}
                onChange={(event) => setEstimate(event.target.value)}
                placeholder={board.settings.estimateMode === 'TIME' ? 'e.g. 0.5 or 2' : 'e.g. 3'}
              />
            </label>
            <label>
              Priority
              <PrioritySelect
                value={priority}
                onChange={(value) => {
                  if (value) setPriority(value);
                }}
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
                    color={member.color}
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
        <div className="task-title-group">
          {task.projects && task.projects.length > 0 ? (
            <div className="task-project-pills">
              {task.projects.map(({ project }) => (
                <span
                  key={project.id}
                  className="task-project-pill"
                  style={{
                    backgroundColor: `${project.color || '#2563EB'}20`,
                    color: project.color || '#2563EB',
                    borderColor: `${project.color || '#2563EB'}40`,
                  }}
                >
                  <ProjectIcon className="project-badge-icon" name={project.icon} />
                  {project.key ? project.key : project.name}
                </span>
              ))}
            </div>
          ) : task.project ? (
            <span
              className="task-project-pill"
              style={{
                backgroundColor: `${task.project.color || '#2563EB'}20`,
                color: task.project.color || '#2563EB',
                borderColor: `${task.project.color || '#2563EB'}40`,
              }}
            >
              <ProjectIcon className="project-badge-icon" name={task.project.icon} />
              {task.project.key ? task.project.key : task.project.name}
            </span>
          ) : null}
          <h2>{task.title}</h2>
        </div>
        <p className={task.description ? undefined : 'is-empty'}>{task.description || '\u00A0'}</p>
        <div className="task-card-facts">
          <PriorityBadge priority={task.priority} />
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
                color={item.user.color}
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
