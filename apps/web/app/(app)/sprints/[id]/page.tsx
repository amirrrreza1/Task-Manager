'use client';

import {
  Button,
  Checkbox,
  Input,
  Modal,
  Select,
  Textarea,
} from '../../../../components/design-system';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  CSSProperties,
  FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Avatar } from '../../../../components/avatar';
import { HeaderActions } from '../../../../components/header-actions';
import { PriorityBadge } from '../../../../components/priority-badge';
import { TaskTypeBadge } from '../../../../components/task-type-badge';
import { useAuth } from '../../../../components/auth-provider';
import { useToast } from '../../../../components/toast-provider';
import { formatDate, formatDateTime } from '../../../../lib/app-config';
import type {
  AvailableSprintTask,
  Paginated,
  SprintComment,
  SprintDetail,
  SprintSummary,
} from '../../../../lib/types';
import { isSprintWorkSelectionLocked } from '../../../../lib/sprint-work';

const date = (value: string | null, withTime = false) =>
  withTime ? formatDateTime(value) : formatDate(value);

export default function SprintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { request, user } = useAuth();
  const toast = useToast();
  const [sprint, setSprint] = useState<SprintDetail | null>(null);
  const [planned, setPlanned] = useState<SprintSummary[]>([]);
  const [activeSprint, setActiveSprint] = useState<SprintSummary | null>(null);
  const [comment, setComment] = useState('');
  const [editingComment, setEditingComment] = useState<SprintComment | null>(null);
  const [carryIds, setCarryIds] = useState<string[]>([]);
  const [carrySubtaskIds, setCarrySubtaskIds] = useState<string[]>([]);
  const [targetSprintId, setTargetSprintId] = useState('');
  const [newSprintName, setNewSprintName] = useState('');
  const [creatingCarryTarget, setCreatingCarryTarget] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [finishConfirmationOpen, setFinishConfirmationOpen] = useState(false);
  const [finishTargetSprintId, setFinishTargetSprintId] = useState('');
  const [availableTasks, setAvailableTasks] = useState<AvailableSprintTask[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [selectedSubtaskIds, setSelectedSubtaskIds] = useState<string[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const sprintContentRef = useRef<HTMLElement>(null);
  const capturedSprintIdRef = useRef<string | null>(null);
  const [initialPanel, setInitialPanel] = useState<{ sprintId: string; height: number } | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const [detail, plannedResponse, activeResponse] = await Promise.all([
        request<SprintDetail>(`/sprints/${id}`),
        request<Paginated<SprintSummary>>('/sprints?status=PLANNED'),
        request<Paginated<SprintSummary>>('/sprints?status=ACTIVE'),
      ]);
      setSprint(detail);
      setPlanned(plannedResponse.items.filter((item) => item.id !== id));
      const active = activeResponse.items.find((item) => item.id !== id) ?? null;
      setActiveSprint(active);
      setLoadFailed(false);
    } catch (caught) {
      setLoadFailed(true);
      toast.fromError(caught, 'Could not load the sprint.');
    }
  }, [id, request, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  // Align the work and notes cards only when this sprint first loads. New
  // comments can then grow the notes card without stretching sprint work.
  useLayoutEffect(() => {
    if (!sprint || capturedSprintIdRef.current === sprint.id) return;

    const panels =
      sprintContentRef.current?.querySelectorAll<HTMLElement>(':scope > .sprint-panel');
    const heights = panels
      ? Array.from(panels, (panel) => panel.getBoundingClientRect().height)
      : [];
    const height = heights.length ? Math.max(...heights) : 0;
    if (!height) return;

    capturedSprintIdRef.current = sprint.id;
    setInitialPanel({ sprintId: sprint.id, height: Math.ceil(height) });
  }, [sprint]);

  const unfinished = useMemo(
    () => (sprint?.taskSnapshots ?? []).filter((item) => item.canCarryOver && item.taskId),
    [sprint],
  );
  const unfinishedSubtasks = useMemo(
    () => (sprint?.subtaskSnapshots ?? []).filter((item) => item.canCarryOver && item.subtaskId),
    [sprint],
  );
  const availablePlannerTasks = useMemo(
    () =>
      availableTasks
        .map((task) => ({
          ...task,
          parentLocked: isSprintWorkSelectionLocked(task.sprint, id),
          subtasks: task.subtasks.filter(
            (subtask) => !isSprintWorkSelectionLocked(subtask.sprint, id),
          ),
        }))
        .filter((task) => !task.parentLocked || task.subtasks.length),
    [availableTasks, id],
  );
  const admin = user?.role === 'ADMIN';

  async function mutation(path: string, method = 'POST', body?: object) {
    setBusy(true);
    try {
      await request(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      await load();
      return true;
    } catch (caught) {
      toast.fromError(caught, 'Could not save the sprint.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function startSprint() {
    void mutation(`/sprints/${id}/start`, 'POST');
  }
  function finishSprint() {
    setFinishTargetSprintId(planned[0]?.id ?? '');
    setFinishConfirmationOpen(true);
  }
  function confirmFinishSprint() {
    setFinishConfirmationOpen(false);
    void mutation(
      `/sprints/${id}/finish`,
      'POST',
      finishTargetSprintId ? { targetSprintId: finishTargetSprintId } : undefined,
    );
  }
  function saveComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = editingComment
      ? `/sprints/${id}/comments/${editingComment.id}`
      : `/sprints/${id}/comments`;
    void mutation(path, editingComment ? 'PATCH' : 'POST', { body: comment }).then((saved) => {
      if (saved) {
        setComment('');
        setEditingComment(null);
      }
    });
  }
  function carryOver(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutation(`/sprints/${id}/carry-over`, 'POST', {
      targetSprintId,
      taskIds: carryIds,
      subtaskIds: carrySubtaskIds,
    }).then((saved) => {
      if (saved) {
        setCarryIds([]);
        setCarrySubtaskIds([]);
      }
    });
  }

  function moveToBacklog() {
    void mutation(`/sprints/${id}/move-to-backlog`, 'POST', {
      taskIds: carryIds,
      subtaskIds: carrySubtaskIds,
    }).then((saved) => {
      if (saved) {
        setCarryIds([]);
        setCarrySubtaskIds([]);
      }
    });
  }

  async function createCarryOverSprint() {
    const name = newSprintName.trim();
    if (!name) return;

    setCreatingCarryTarget(true);
    try {
      const created = await request<SprintSummary>('/sprints', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setPlanned((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setTargetSprintId(created.id);
      setNewSprintName('');
      toast.success('Planned sprint created.');
    } catch (caught) {
      toast.fromError(caught, 'Could not create the planned sprint.');
    } finally {
      setCreatingCarryTarget(false);
    }
  }

  async function openPlanner() {
    setPlannerOpen(true);
    setLoadingTasks(true);
    try {
      const tasks = await request<AvailableSprintTask[]>(`/sprints/${id}/available-tasks`);
      setAvailableTasks(tasks);
      setSelectedTaskIds([]);
      setSelectedSubtaskIds([]);
    } catch (caught) {
      toast.fromError(caught, 'Could not load available tasks.');
    } finally {
      setLoadingTasks(false);
    }
  }

  async function assignTasks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await Promise.all([
        selectedTaskIds.length
          ? request(`/sprints/${id}/tasks`, {
              method: 'POST',
              body: JSON.stringify({ taskIds: selectedTaskIds }),
            })
          : Promise.resolve(),
        selectedSubtaskIds.length
          ? request(`/sprints/${id}/subtasks`, {
              method: 'POST',
              body: JSON.stringify({ subtaskIds: selectedSubtaskIds }),
            })
          : Promise.resolve(),
      ]);
      setPlannerOpen(false);
      setSelectedTaskIds([]);
      setSelectedSubtaskIds([]);
      toast.success('Tasks added to the sprint.');
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not add the selected tasks.');
    } finally {
      setBusy(false);
    }
  }

  if (!sprint && !loadFailed)
    return (
      <div className="task-detail-loading">
        <span className="spinner" /> Loading sprint…
      </div>
    );
  if (!sprint) return <p className="muted">This sprint could not be loaded.</p>;

  return (
    <div className="page-stack sprint-detail">
      <Link className="back-link" href="/sprints">
        ← All sprints
      </Link>
      <HeaderActions>
        {sprint.status !== 'COMPLETED' ? (
          <Button variant="outline" onClick={() => void openPlanner()} type="button">
            Add tasks
          </Button>
        ) : null}
        {admin && sprint.status === 'PLANNED' ? (
          <Button
            variant="primary"
            disabled={busy || Boolean(activeSprint)}
            onClick={startSprint}
            type="button"
            title={activeSprint ? `Sprint "${activeSprint.name}" is currently active` : undefined}
          >
            Start sprint
          </Button>
        ) : null}
        {admin && sprint.status === 'ACTIVE' ? (
          <Button variant="primary" disabled={busy} onClick={finishSprint} type="button">
            Finish sprint
          </Button>
        ) : null}
      </HeaderActions>
      <section className="sprint-overview">
        <div>
          <span>Sprint</span>
          <strong title={sprint.goal ? `${sprint.name} · ${sprint.goal}` : sprint.name}>
            {sprint.name}
            {sprint.goal ? ` · ${sprint.goal}` : ''}
          </strong>
        </div>
        <div>
          <span>Status</span>
          <strong>
            {sprint.status === 'ACTIVE'
              ? `Active · Started ${date(sprint.startsAt)}`
              : sprint.status === 'COMPLETED'
                ? `Completed ${date(sprint.completedAt || sprint.updatedAt)}`
                : 'Planned · Not started'}
          </strong>
        </div>
        <div>
          <span>Completed</span>
          <strong>
            {sprint.outcomes.completed} of {sprint.outcomes.total}
          </strong>
        </div>
        <div>
          <span>Remaining</span>
          <strong>{sprint.outcomes.incomplete}</strong>
        </div>
        <div>
          <span>Estimates</span>
          <strong>
            {Object.entries(sprint.outcomes.estimates)
              .map(([unit, value]) => `${value} ${unit === 'HOURS' ? 'h' : 'pts'}`)
              .join(' · ') || 'None'}
          </strong>
        </div>
      </section>
      {admin && sprint.status === 'PLANNED' ? (
        <div className="sprint-panel sprint-start">
          <div>
            <h2>Start this sprint</h2>
            {activeSprint ? (
              <p className="muted" style={{ color: 'var(--color-warning, #f59e0b)' }}>
                Cannot start: Sprint <strong>&quot;{activeSprint.name}&quot;</strong> is currently
                active. Finish it before starting this sprint.
              </p>
            ) : (
              <p className="muted">
                Starting this sprint will activate it and move its planned work to your active
                workflow.
              </p>
            )}
          </div>
          <Button
            variant="primary"
            disabled={busy || Boolean(activeSprint)}
            onClick={startSprint}
            type="button"
          >
            Start sprint
          </Button>
        </div>
      ) : null}
      <section
        className="sprint-content"
        ref={sprintContentRef}
        style={
          initialPanel?.sprintId === sprint.id
            ? ({ '--sprint-panel-initial-height': `${initialPanel.height}px` } as CSSProperties)
            : undefined
        }
      >
        <div className="sprint-panel">
          <h2>{sprint.status === 'COMPLETED' ? 'Final outcome' : 'Sprint work'}</h2>
          {(sprint.status === 'COMPLETED' ? sprint.taskSnapshots : sprint.tasks).map((task) => {
            const completed = 'wasDone' in task ? task.wasDone : task.column.isDone;
            const taskId = 'taskId' in task ? task.taskId : task.id;
            return (
              <div className="sprint-work-item" key={task.id}>
                <div className="sprint-task">
                  <span
                    className={completed ? 'done-marker' : 'open-marker'}
                    aria-label={completed ? 'Completed' : 'Not completed'}
                  />
                  <div>
                    {taskId ? (
                      <Link href={`/tasks/${taskId}`}>{task.title}</Link>
                    ) : (
                      <strong>{task.title}</strong>
                    )}
                    <small>{'columnName' in task ? task.columnName : task.column.name}</small>
                  </div>
                  <span className="sprint-task-facts">
                    {'type' in task && task.type ? (
                      <TaskTypeBadge type={task.type} showLabel={false} />
                    ) : null}
                    {'priority' in task ? <PriorityBadge priority={task.priority} /> : null}
                    {task.estimateValue
                      ? `${task.estimateValue} ${task.estimateUnit === 'HOURS' ? 'h' : 'pts'}`
                      : '—'}
                  </span>
                </div>
                {'subtasks' in task && task.subtasks.length ? (
                  <div className="sprint-subtasks">
                    {task.subtasks.map((subtask) => (
                      <div key={subtask.id}>
                        <span className={subtask.isCompleted ? 'done-marker' : 'open-marker'} />
                        <span>{subtask.title}</span>
                        <span className="sprint-task-facts">
                          <small>{subtask.assignee?.displayName ?? 'Unassigned'}</small>
                          {'priority' in subtask ? (
                            <PriorityBadge priority={subtask.priority} />
                          ) : null}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
          {!sprint.outcomes.total ? (
            <p className="empty-copy">No tasks are assigned to this sprint yet.</p>
          ) : null}
        </div>
        {sprint.subtasks.length ? (
          <div className="sprint-panel standalone-subtasks">
            <h2>Planned subtasks</h2>
            <p className="muted">These are planned independently of their parent task.</p>
            {sprint.subtasks.map((subtask) => (
              <div className="sprint-task" key={subtask.id}>
                <span className={subtask.isCompleted ? 'done-marker' : 'open-marker'} />
                <div>
                  <strong>{subtask.title}</strong>
                  <small>
                    From <Link href={`/tasks/${subtask.task.id}`}>{subtask.task.title}</Link>
                    {subtask.assignee ? ` · ${subtask.assignee.displayName}` : ''}
                  </small>
                </div>
                <span className="sprint-task-facts">
                  <PriorityBadge priority={subtask.priority} />
                  {subtask.estimateValue
                    ? `${subtask.estimateValue} ${subtask.estimateUnit === 'HOURS' ? 'h' : 'pts'}`
                    : '—'}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="sprint-panel">
          <h2>Notes</h2>
          <form className="comment-form" onSubmit={saveComment}>
            <Textarea
              aria-label="Sprint comment"
              maxLength={10000}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Add a retrospective note or update…"
              required
              rows={3}
              value={comment}
            />
            <div>
              <Button variant="primary" size="sm" disabled={busy} type="submit">
                {editingComment ? 'Save edit' : 'Add comment'}
              </Button>
              {editingComment ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingComment(null);
                    setComment('');
                  }}
                  type="button"
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
          <div className="comment-list">
            {sprint.comments.map((item) => (
              <article className="sprint-comment" key={item.id}>
                <Avatar
                  color={item.author.color}
                  hasAvatar={item.author.hasAvatar}
                  name={item.author.displayName}
                  size={30}
                  userId={item.author.id}
                />
                <div>
                  <strong>{item.author.displayName}</strong>
                  <small>
                    {date(item.createdAt, true)}
                    {item.updatedAt !== item.createdAt ? ' · edited' : ''}
                  </small>
                  <p>{item.body}</p>
                  {item.authorId === user?.id || admin ? (
                    <div className="comment-actions">
                      <Button
                        className="comment-action"
                        onClick={() => {
                          setEditingComment(item);
                          setComment(item.body);
                        }}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Edit
                      </Button>
                      <Button
                        className="comment-action comment-action-delete"
                        onClick={() =>
                          void mutation(`/sprints/${id}/comments/${item.id}`, 'DELETE')
                        }
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      {admin &&
      sprint.status === 'COMPLETED' &&
      (unfinished.length || unfinishedSubtasks.length) ? (
        <form className="sprint-panel carry-over" onSubmit={carryOver}>
          <h2>Resolve unfinished work</h2>
          <p className="muted">
            The completed sprint keeps its final snapshot. Move selected tasks or subtasks to a
            planned sprint, or return them to the backlog.
          </p>
          <label>
            Planned sprint
            <Select
              onChange={(event) => setTargetSprintId(event.target.value)}
              required
              value={targetSprintId}
            >
              <option value="">Choose a sprint</option>
              {planned.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </label>
          {!planned.length ? (
            <div>
              <p className="empty-copy">
                No planned sprint is available yet. Create one here to continue.
              </p>
              <label>
                New sprint name
                <Input
                  maxLength={120}
                  onChange={(event) => setNewSprintName(event.target.value)}
                  placeholder="For example, Sprint 3"
                  value={newSprintName}
                />
              </label>
              <Button
                disabled={creatingCarryTarget || !newSprintName.trim()}
                onClick={() => void createCarryOverSprint()}
                type="button"
                variant="outline"
              >
                {creatingCarryTarget ? 'Creating…' : 'Create and select sprint'}
              </Button>
            </div>
          ) : null}
          {unfinished.length ? (
            <div className="carry-work-group">
              <h3>Tasks</h3>
              <div className="carry-items">
                {unfinished.map((task) => (
                  <label key={task.id}>
                    <Checkbox
                      checked={carryIds.includes(task.taskId!)}
                      onChange={(event) => {
                        const selected = event.target.checked;
                        setCarryIds((current) =>
                          selected
                            ? [...current, task.taskId!]
                            : current.filter((value) => value !== task.taskId),
                        );
                        if (selected)
                          setCarrySubtaskIds((current) =>
                            current.filter(
                              (subtaskId) =>
                                !unfinishedSubtasks.some(
                                  (subtask) =>
                                    subtask.subtaskId === subtaskId &&
                                    subtask.taskId === task.taskId,
                                ),
                            ),
                          );
                      }}
                    />
                    {task.title}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          {unfinishedSubtasks.length ? (
            <div className="carry-work-group">
              <h3>Subtasks</h3>
              <div className="carry-items">
                {unfinishedSubtasks.map((subtask) => (
                  <label key={subtask.id}>
                    <Checkbox
                      checked={carrySubtaskIds.includes(subtask.subtaskId!)}
                      disabled={subtask.taskId ? carryIds.includes(subtask.taskId) : false}
                      onChange={(event) =>
                        setCarrySubtaskIds((current) =>
                          event.target.checked
                            ? [...current, subtask.subtaskId!]
                            : current.filter((value) => value !== subtask.subtaskId),
                        )
                      }
                    />
                    <span>
                      {subtask.title}
                      <small>From {subtask.taskTitle}</small>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          <div>
            <Button
              variant="outline"
              disabled={
                busy ||
                !targetSprintId ||
                (!carryIds.length && !carrySubtaskIds.length) ||
                !planned.length
              }
              type="submit"
            >
              Carry over selected work
            </Button>
            <Button
              variant="ghost"
              disabled={busy || (!carryIds.length && !carrySubtaskIds.length)}
              onClick={moveToBacklog}
              type="button"
            >
              Move selected work to backlog
            </Button>
          </div>
        </form>
      ) : null}
      {finishConfirmationOpen ? (
        <Modal
          className="modal"
          labelledBy="finish-sprint-title"
          onOpenChange={(open) => {
            if (!open) setFinishConfirmationOpen(false);
          }}
        >
          <header>
            <p className="section-label">Finish sprint</p>
            <h2 id="finish-sprint-title">Finish {sprint.name}?</h2>
          </header>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              confirmFinishSprint();
            }}
          >
            <p>
              A snapshot of completed work will be saved. All incomplete tasks will automatically
              move to the next sprint with their current statuses preserved.
            </p>
            {sprint.tasks.some((t) => !t.column?.isDone) ? (
              <div style={{ margin: '1rem 0' }}>
                {planned.length ? (
                  <label>
                    Target next sprint
                    <Select
                      value={finishTargetSprintId}
                      onChange={(event) => setFinishTargetSprintId(event.target.value)}
                    >
                      {planned.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                ) : (
                  <p className="muted" style={{ fontSize: '0.9rem' }}>
                    No planned sprint is currently created. The next sprint will automatically be
                    created for you.
                  </p>
                )}
              </div>
            ) : null}
            <footer>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setFinishConfirmationOpen(false)}
                type="button"
              >
                Cancel
              </Button>
              <Button variant="primary" disabled={busy} type="submit">
                Finish sprint
              </Button>
            </footer>
          </form>
        </Modal>
      ) : null}
      {plannerOpen ? (
        <Modal
          className="modal sprint-planner"
          labelledBy="sprint-planner-title"
          onOpenChange={(open) => {
            if (!open) setPlannerOpen(false);
          }}
        >
          <header>
            <p className="section-label">Sprint planning</p>
            <h2 id="sprint-planner-title">Add work to {sprint.name}</h2>
            <p className="muted">
              Choose a parent task, or select only the subtasks you want to plan beneath it.
            </p>
          </header>
          <form onSubmit={assignTasks}>
            <div className="planner-task-list">
              {loadingTasks ? (
                <p className="muted">Loading work…</p>
              ) : (
                <>
                  {availablePlannerTasks.map((task) => {
                    const parentSelected = selectedTaskIds.includes(task.id);
                    return (
                      <div className="planner-task" key={task.id}>
                        {task.parentLocked ? (
                          <div className="planner-task-main">
                            <div>
                              <strong>{task.title}</strong>
                              <small>{task.column.name} · Choose eligible subtasks below</small>
                            </div>
                          </div>
                        ) : (
                          <label className="planner-task-main">
                            <Checkbox
                              checked={parentSelected}
                              onChange={(event) => {
                                setSelectedTaskIds((current) =>
                                  event.target.checked
                                    ? [...current, task.id]
                                    : current.filter((item) => item !== task.id),
                                );
                                if (event.target.checked)
                                  setSelectedSubtaskIds((current) =>
                                    current.filter(
                                      (item) =>
                                        !task.subtasks.some((subtask) => subtask.id === item),
                                    ),
                                  );
                              }}
                            />
                            <div>
                              <strong>{task.title}</strong>
                              <small>
                                {task.column.name}
                                {task.sprint
                                  ? ` · Currently in ${task.sprint.name}`
                                  : ' · No sprint'}
                              </small>
                            </div>
                          </label>
                        )}
                        {task.subtasks.length ? (
                          <div className="planner-subtasks">
                            {task.subtasks.map((subtask) => (
                              <label key={subtask.id}>
                                <Checkbox
                                  checked={selectedSubtaskIds.includes(subtask.id)}
                                  disabled={parentSelected}
                                  onChange={(event) =>
                                    setSelectedSubtaskIds((current) =>
                                      event.target.checked
                                        ? [...current, subtask.id]
                                        : current.filter((item) => item !== subtask.id),
                                    )
                                  }
                                />
                                <i
                                  className={subtask.isCompleted ? 'done-marker' : 'open-marker'}
                                />
                                <span>{subtask.title}</span>
                                <small>
                                  {subtask.sprint ? `In ${subtask.sprint.name}` : 'No sprint'}
                                </small>
                              </label>
                            ))}
                          </div>
                        ) : !task.parentLocked ? (
                          <p className="empty-copy">No subtasks</p>
                        ) : null}
                      </div>
                    );
                  })}
                  {!availablePlannerTasks.length ? (
                    <p className="empty-copy">
                      Every task and subtask is already in this sprint or locked to an
                      active/completed sprint.
                    </p>
                  ) : null}
                </>
              )}
            </div>
            <footer>
              <Button variant="ghost" onClick={() => setPlannerOpen(false)} type="button">
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={busy || (!selectedTaskIds.length && !selectedSubtaskIds.length)}
                type="submit"
              >
                Add selected work
              </Button>
            </footer>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
