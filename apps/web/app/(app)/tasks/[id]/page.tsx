'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, type PropsWithChildren, useCallback, useEffect, useState } from 'react';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Avatar } from '../../../../components/avatar';
import { useAuth } from '../../../../components/auth-provider';
import type {
  AppSettings,
  Attachment,
  BoardColumn,
  EstimateUnit,
  ManagedUser,
  Paginated,
  SprintSummary,
  Subtask,
  TaskDetail,
} from '../../../../lib/types';

interface SubtaskForm {
  id?: string;
  title: string;
  description: string;
  estimate: string;
  estimateUnit: EstimateUnit;
  assigneeId: string;
}

export default function TaskPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { request, requestBlob } = useAuth();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [plannedSprints, setPlannedSprints] = useState<SprintSummary[]>([]);
  const [sprintId, setSprintId] = useState('');
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [estimate, setEstimate] = useState('');
  const [estimateUnit, setEstimateUnit] = useState<EstimateUnit>('MINUTES');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [subtaskForm, setSubtaskForm] = useState<SubtaskForm | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const subtaskSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    try {
      const [nextTask, nextUsers, nextColumns, nextSettings, planned, active] = await Promise.all([
        request<TaskDetail>(`/tasks/${id}`),
        request<ManagedUser[]>('/users'),
        request<BoardColumn[]>('/board-columns'),
        request<AppSettings>('/settings'),
        request<Paginated<SprintSummary>>('/sprints?status=PLANNED'),
        request<Paginated<SprintSummary>>('/sprints?status=ACTIVE'),
      ]);
      setTask(nextTask);
      setUsers(nextUsers.filter((user) => user.isActive));
      setColumns(nextColumns);
      setSettings(nextSettings);
      setPlannedSprints([...active.items, ...planned.items]);
      setSprintId(nextTask.sprintId ?? '');
      setTitle(nextTask.title);
      setDescription(nextTask.description ?? '');
      setEstimate(nextTask.estimateValue?.toString() ?? '');
      setEstimateUnit(
        nextTask.estimateUnit ?? (nextSettings.estimateMode === 'TIME' ? 'MINUTES' : 'POINTS'),
      );
      setAssigneeIds(nextTask.assignees.map((item) => item.user.id));
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the task.');
    }
  }, [id, request]);
  useEffect(() => {
    void load();
  }, [load]);

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await request(`/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          description: description || null,
          assigneeIds,
          sprintId: sprintId || null,
          estimate: estimate ? { value: Number(estimate), unit: estimateUnit } : null,
        }),
      });
      setEditing(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the task.');
    } finally {
      setBusy(false);
    }
  }

  async function moveToColumn(columnId: string) {
    if (!task || columnId === task.columnId) return;
    setBusy(true);
    setError('');
    try {
      await request(`/tasks/${id}/move`, {
        method: 'POST',
        body: JSON.stringify({ columnId, expectedUpdatedAt: task.updatedAt }),
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not move the task.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteTask() {
    if (!task || !window.confirm(`Delete “${task.title}” and all of its subtasks and files?`))
      return;
    setBusy(true);
    try {
      await request<void>(`/tasks/${id}`, { method: 'DELETE' });
      router.push('/board');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete the task.');
      setBusy(false);
    }
  }

  async function saveSubtask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subtaskForm) return;
    setBusy(true);
    setError('');
    try {
      await request(
        subtaskForm.id ? `/tasks/${id}/subtasks/${subtaskForm.id}` : `/tasks/${id}/subtasks`,
        {
          method: subtaskForm.id ? 'PATCH' : 'POST',
          body: JSON.stringify({
            title: subtaskForm.title,
            description: subtaskForm.description || null,
            assigneeId: subtaskForm.assigneeId || null,
            estimate: subtaskForm.estimate
              ? { value: Number(subtaskForm.estimate), unit: subtaskForm.estimateUnit }
              : null,
          }),
        },
      );
      setSubtaskForm(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the subtask.');
    } finally {
      setBusy(false);
    }
  }

  async function patchSubtask(subtask: Subtask, changes: object) {
    setBusy(true);
    setError('');
    try {
      await request(`/tasks/${id}/subtasks/${subtask.id}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the subtask.');
    } finally {
      setBusy(false);
    }
  }

  async function removeSubtask(subtask: Subtask) {
    if (!window.confirm(`Delete subtask “${subtask.title}”?`)) return;
    setBusy(true);
    try {
      await request<void>(`/tasks/${id}/subtasks/${subtask.id}`, { method: 'DELETE' });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete the subtask.');
    } finally {
      setBusy(false);
    }
  }

  async function reorderSubtask(index: number, direction: -1 | 1) {
    if (!task) return;
    const target = index + direction;
    if (target < 0 || target >= task.subtasks.length) return;
    await saveSubtaskOrder(arrayMove(task.subtasks, index, target));
  }

  function finishSubtaskDrag(event: DragEndEvent) {
    if (!task || !event.over || busy) return;
    const activeId = String(event.active.id).replace(/^subtask:/, '');
    const overId = String(event.over.id).replace(/^subtask:/, '');
    const oldIndex = task.subtasks.findIndex((subtask) => subtask.id === activeId);
    const newIndex = task.subtasks.findIndex((subtask) => subtask.id === overId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    void saveSubtaskOrder(arrayMove(task.subtasks, oldIndex, newIndex));
  }

  async function saveSubtaskOrder(reordered: Subtask[]) {
    if (!task || busy) return;
    const previousTask = task;
    setTask({ ...task, subtasks: reordered });
    setBusy(true);
    setError('');
    try {
      await request(`/tasks/${id}/subtasks/reorder`, {
        method: 'POST',
        body: JSON.stringify({ subtaskIds: reordered.map((item) => item.id) }),
      });
      await load();
    } catch (caught) {
      setTask(previousTask);
      setError(caught instanceof Error ? caught.message : 'Could not reorder subtasks.');
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(owner: 'task' | 'subtask', ownerId: string, file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setBusy(true);
    setError('');
    try {
      await request(
        owner === 'task' ? `/tasks/${ownerId}/attachments` : `/subtasks/${ownerId}/attachments`,
        { method: 'POST', body: form },
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not upload the file.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadFile(file: Attachment) {
    try {
      const blob = await requestBlob(`/attachments/${file.id}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.originalName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not download the file.');
    }
  }

  async function deleteFile(file: Attachment) {
    if (!window.confirm(`Delete “${file.originalName}”?`)) return;
    setBusy(true);
    try {
      await request<void>(`/attachments/${file.id}`, { method: 'DELETE' });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete the file.');
    } finally {
      setBusy(false);
    }
  }

  if (!task)
    return (
      <div className="task-detail-loading">
        {error ? (
          <p className="form-error">{error}</p>
        ) : (
          <>
            <span className="spinner" /> Loading task…
          </>
        )}
      </div>
    );
  const completed = task.subtasks.filter((item) => item.isCompleted).length;
  const defaultUnit: EstimateUnit = settings?.estimateMode === 'POINTS' ? 'POINTS' : 'MINUTES';

  return (
    <div className="page-stack task-detail-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/board">Board</Link>
        <span>/</span>
        <span>{task.column.name}</span>
      </nav>
      <header className="task-detail-header">
        <div>
          <span className="column-chip">
            <span style={{ background: task.column.color }} />
            {task.column.name}
          </span>
          <h1>{task.title}</h1>
          <p className="muted">
            Created by {task.createdBy.displayName} · Updated{' '}
            {new Date(task.updatedAt).toLocaleString()}
          </p>
        </div>
        <div className="header-actions">
          <button className="button secondary" onClick={() => setEditing(true)} type="button">
            Edit task
          </button>
          <button
            className="button danger-ghost"
            disabled={busy}
            onClick={() => void deleteTask()}
            type="button"
          >
            Delete
          </button>
        </div>
      </header>
      {error ? (
        <p className="form-error inline-alert" role="alert">
          {error}
        </p>
      ) : null}

      <div className="task-detail-grid">
        <main className="task-main-column">
          <section className="detail-section">
            <header>
              <h2>Description</h2>
            </header>
            {task.description ? (
              <div className="task-description">{task.description}</div>
            ) : (
              <p className="empty-copy">No description yet.</p>
            )}
          </section>
          <section className="detail-section">
            <header>
              <div>
                <h2>Subtasks</h2>
                <p>
                  {completed} of {task.subtasks.length} complete
                </p>
              </div>
              <button
                className="button secondary compact"
                onClick={() =>
                  setSubtaskForm({
                    title: '',
                    description: '',
                    estimate: '',
                    estimateUnit: defaultUnit,
                    assigneeId: '',
                  })
                }
                type="button"
              >
                Add subtask
              </button>
            </header>
            <DndContext
              sensors={subtaskSensors}
              collisionDetection={closestCenter}
              onDragEnd={finishSubtaskDrag}
            >
              <SortableContext
                items={task.subtasks.map((subtask) => `subtask:${subtask.id}`)}
                strategy={verticalListSortingStrategy}
              >
                <div className="subtask-list">
                  {task.subtasks.map((subtask, index) => (
                    <SortableSubtaskShell
                      id={subtask.id}
                      title={subtask.title}
                      disabled={busy}
                      key={subtask.id}
                    >
                      <article
                        className={`subtask-row ${subtask.isCompleted ? 'completed' : ''}`}
                        onPointerDown={(event) => {
                          const target = event.target as HTMLElement;
                          if (target.closest('button, input, select, label, a')) {
                            event.stopPropagation();
                          }
                        }}
                      >
                        <input
                          className="subtask-check"
                          aria-label={`Mark ${subtask.title} ${subtask.isCompleted ? 'incomplete' : 'complete'}`}
                          type="checkbox"
                          checked={subtask.isCompleted}
                          disabled={busy}
                          onChange={() =>
                            void patchSubtask(subtask, { isCompleted: !subtask.isCompleted })
                          }
                        />
                        <div className="subtask-copy">
                          <strong>{subtask.title}</strong>
                          {subtask.description ? <small>{subtask.description}</small> : null}
                          <div className="subtask-meta">
                            {subtask.estimateValue ? (
                              <span>
                                {formatEstimate(subtask.estimateValue, subtask.estimateUnit)}
                              </span>
                            ) : null}
                            {subtask.attachments.length ? (
                              <span>
                                {subtask.attachments.length} file
                                {subtask.attachments.length === 1 ? '' : 's'}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <select
                          aria-label={`Assignee for ${subtask.title}`}
                          value={subtask.assigneeId ?? ''}
                          disabled={busy}
                          onChange={(event) =>
                            void patchSubtask(subtask, { assigneeId: event.target.value || null })
                          }
                        >
                          <option value="">Unassigned</option>
                          {users.map((member) => (
                            <option value={member.id} key={member.id}>
                              {member.displayName}
                            </option>
                          ))}
                        </select>
                        <div className="subtask-actions">
                          <button
                            disabled={busy || index === 0}
                            aria-label={`Move ${subtask.title} up`}
                            onClick={() => void reorderSubtask(index, -1)}
                            type="button"
                          >
                            ↑
                          </button>
                          <button
                            disabled={busy || index === task.subtasks.length - 1}
                            aria-label={`Move ${subtask.title} down`}
                            onClick={() => void reorderSubtask(index, 1)}
                            type="button"
                          >
                            ↓
                          </button>
                          <button
                            onClick={() =>
                              setSubtaskForm({
                                id: subtask.id,
                                title: subtask.title,
                                description: subtask.description ?? '',
                                estimate: subtask.estimateValue?.toString() ?? '',
                                estimateUnit: subtask.estimateUnit ?? defaultUnit,
                                assigneeId: subtask.assigneeId ?? '',
                              })
                            }
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="danger"
                            onClick={() => void removeSubtask(subtask)}
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                        <div className="subtask-files">
                          <label className="file-button">
                            Attach file
                            <input
                              type="file"
                              disabled={busy}
                              onChange={(event) => {
                                void uploadFile('subtask', subtask.id, event.target.files?.[0]);
                                event.target.value = '';
                              }}
                            />
                          </label>
                          {subtask.attachments.map((file) => (
                            <FileRow
                              file={file}
                              key={file.id}
                              onDownload={downloadFile}
                              onDelete={deleteFile}
                            />
                          ))}
                        </div>
                      </article>
                    </SortableSubtaskShell>
                  ))}
                  {!task.subtasks.length ? (
                    <p className="empty-copy">
                      Break this task into small, independently owned steps.
                    </p>
                  ) : null}
                </div>
              </SortableContext>
            </DndContext>
          </section>
          <section className="detail-section">
            <header>
              <div>
                <h2>Files</h2>
                <p>{task.attachments.length} attached</p>
              </div>
              <label className="button secondary compact file-button">
                Upload file
                <input
                  type="file"
                  disabled={busy}
                  onChange={(event) => {
                    void uploadFile('task', task.id, event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
              </label>
            </header>
            <div className="file-list">
              {task.attachments.map((file) => (
                <FileRow
                  file={file}
                  key={file.id}
                  onDownload={downloadFile}
                  onDelete={deleteFile}
                />
              ))}
              {!task.attachments.length ? <p className="empty-copy">No files attached.</p> : null}
            </div>
          </section>
        </main>
        <aside className="task-sidebar">
          <section>
            <h2>Status</h2>
            <select
              value={task.columnId}
              disabled={busy}
              onChange={(event) => void moveToColumn(event.target.value)}
            >
              {columns.map((column) => (
                <option value={column.id} key={column.id}>
                  {column.name}
                </option>
              ))}
            </select>
          </section>
          <section>
            <h2>Estimate</h2>
            <p>
              {task.estimateValue
                ? formatEstimate(task.estimateValue, task.estimateUnit)
                : 'Not estimated'}
            </p>
          </section>
          <section>
            <h2>Assignees</h2>
            {task.assignees.length ? (
              <div className="sidebar-assignees">
                {task.assignees.map((item) => (
                  <span key={item.user.id}>
                    <Avatar name={item.user.displayName} seed={item.user.avatarSeed} size={31} />
                    {item.user.displayName}
                  </span>
                ))}
              </div>
            ) : (
              <p>Unassigned</p>
            )}
          </section>
        </aside>
      </div>

      {editing ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal task-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-task-title"
          >
            <header>
              <p className="section-label">Task details</p>
              <h2 id="edit-task-title">Edit task</h2>
            </header>
            <form onSubmit={saveTask}>
              <label>
                Title
                <input
                  required
                  maxLength={240}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label>
                Description
                <textarea
                  rows={5}
                  maxLength={50000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <div className="form-grid">
                <label>
                  Estimate
                  <input
                    type="number"
                    min={1}
                    max={estimateUnit === 'MINUTES' ? 525600 : 10000}
                    value={estimate}
                    onChange={(event) => setEstimate(event.target.value)}
                    placeholder="Optional"
                  />
                </label>
                <label>
                  Unit
                  <select
                    value={estimateUnit}
                    onChange={(event) => setEstimateUnit(event.target.value as EstimateUnit)}
                  >
                    <option value="MINUTES">Minutes</option>
                    <option value="POINTS">Points</option>
                  </select>
                </label>
              </div>
              <label>
                Sprint
                <select value={sprintId} onChange={(event) => setSprintId(event.target.value)}>
                  <option value="">No sprint</option>
                  {task.sprint && !plannedSprints.some((sprint) => sprint.id === task.sprint?.id) ? (
                    <option value={task.sprint.id}>
                      {task.sprint.name} ({task.sprint.status.toLowerCase()})
                    </option>
                  ) : null}
                  {plannedSprints.map((sprint) => (
                    <option key={sprint.id} value={sprint.id}>
                      {sprint.name}
                      {sprint.status === 'ACTIVE' ? ' (active)' : ''}
                    </option>
                  ))}
                </select>
              </label>
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
                            : assigneeIds.filter((userId) => userId !== member.id),
                        )
                      }
                    />
                    <Avatar name={member.displayName} seed={member.avatarSeed} size={26} />
                    <span>{member.displayName}</span>
                  </label>
                ))}
              </fieldset>
              <footer>
                <button className="button ghost" type="button" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button className="button primary" disabled={busy} type="submit">
                  Save task
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

      {subtaskForm ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal task-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="subtask-title"
          >
            <header>
              <p className="section-label">Checklist</p>
              <h2 id="subtask-title">{subtaskForm.id ? 'Edit subtask' : 'Add subtask'}</h2>
            </header>
            <form onSubmit={saveSubtask}>
              <label>
                Title
                <input
                  autoFocus
                  required
                  maxLength={240}
                  value={subtaskForm.title}
                  onChange={(event) =>
                    setSubtaskForm({ ...subtaskForm, title: event.target.value })
                  }
                />
              </label>
              <label>
                Description
                <textarea
                  rows={3}
                  maxLength={50000}
                  value={subtaskForm.description}
                  onChange={(event) =>
                    setSubtaskForm({ ...subtaskForm, description: event.target.value })
                  }
                />
              </label>
              <label>
                Assignee
                <select
                  value={subtaskForm.assigneeId}
                  onChange={(event) =>
                    setSubtaskForm({ ...subtaskForm, assigneeId: event.target.value })
                  }
                >
                  <option value="">Unassigned</option>
                  {users.map((member) => (
                    <option value={member.id} key={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label>
                  Estimate
                  <input
                    type="number"
                    min={1}
                    max={subtaskForm.estimateUnit === 'MINUTES' ? 525600 : 10000}
                    value={subtaskForm.estimate}
                    onChange={(event) =>
                      setSubtaskForm({ ...subtaskForm, estimate: event.target.value })
                    }
                    placeholder="Optional"
                  />
                </label>
                <label>
                  Unit
                  <select
                    value={subtaskForm.estimateUnit}
                    onChange={(event) =>
                      setSubtaskForm({
                        ...subtaskForm,
                        estimateUnit: event.target.value as EstimateUnit,
                      })
                    }
                  >
                    <option value="MINUTES">Minutes</option>
                    <option value="POINTS">Points</option>
                  </select>
                </label>
              </div>
              <footer>
                <button className="button ghost" type="button" onClick={() => setSubtaskForm(null)}>
                  Cancel
                </button>
                <button className="button primary" disabled={busy} type="submit">
                  Save subtask
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function SortableSubtaskShell({
  id,
  title,
  disabled,
  children,
}: PropsWithChildren<{ id: string; title: string; disabled: boolean }>) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: `subtask:${id}`,
    disabled,
  });
  const { role, ...subtaskDragAttributes } = attributes;
  void role;
  return (
    <div
      ref={setNodeRef}
      className={`sortable-subtask-shell subtask-row--draggable ${isDragging ? 'is-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      title={disabled ? undefined : `Drag ${title}`}
      aria-label={
        disabled
          ? undefined
          : `Subtask ${title}. Drag from anywhere on the row to reorder. Use arrow keys while dragging to choose a position.`
      }
      {...(disabled ? {} : { ...subtaskDragAttributes, ...listeners })}
    >
      {children}
    </div>
  );
}

function FileRow({
  file,
  onDownload,
  onDelete,
}: {
  file: Attachment;
  onDownload(file: Attachment): void;
  onDelete(file: Attachment): void;
}) {
  return (
    <article className="file-row">
      <div>
        <strong>{file.originalName}</strong>
        <small>
          {formatBytes(file.sizeBytes)} · uploaded by {file.uploadedBy.displayName}
        </small>
      </div>
      <button className="button ghost compact" type="button" onClick={() => onDownload(file)}>
        Download
      </button>
      <button className="button danger-ghost compact" type="button" onClick={() => onDelete(file)}>
        Delete
      </button>
    </article>
  );
}

function formatEstimate(value: number, unit: EstimateUnit | null) {
  if (unit === 'POINTS') return `${value} ${value === 1 ? 'point' : 'points'}`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours ? `${hours}h${minutes ? ` ${minutes}m` : ''}` : `${minutes}m`;
}
function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
