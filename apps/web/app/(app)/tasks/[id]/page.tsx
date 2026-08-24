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
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  MessageDots,
  Paperclip,
  Plus,
  Trash,
} from '@appica/icons-react';
import { Avatar } from '../../../../components/avatar';
import { HeaderActions } from '../../../../components/header-actions';
import { PriorityBadge, PrioritySelect } from '../../../../components/priority-badge';
import { ProjectIcon } from '../../../../lib/project-icons';
import { useAuth } from '../../../../components/auth-provider';
import { useToast } from '../../../../components/toast-provider';
import { formatDateTime } from '../../../../lib/app-config';
import { DEFAULT_TASK_PRIORITY } from '../../../../lib/priority';
import type {
  AppSettings,
  Attachment,
  EstimateUnit,
  ManagedUser,
  Paginated,
  Project,
  SprintSummary,
  Subtask,
  TaskDetail,
  TaskPriority,
} from '../../../../lib/types';

interface SubtaskForm {
  id?: string;
  title: string;
  description: string;
  estimate: string;
  assigneeId: string;
  priority: TaskPriority;
}

export default function TaskPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { request, requestBlob } = useAuth();
  const toast = useToast();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [plannedSprints, setPlannedSprints] = useState<SprintSummary[]>([]);
  const [sprintId, setSprintId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [estimate, setEstimate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>(DEFAULT_TASK_PRIORITY);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [subtaskForm, setSubtaskForm] = useState<SubtaskForm | null>(null);

  // Attachment upload & comment modals
  const [uploadModal, setUploadModal] = useState<{
    owner: 'task' | 'subtask';
    ownerId: string;
    title: string;
  } | null>(null);
  const [uploadFileSelected, setUploadFileSelected] = useState<File | null>(null);
  const [uploadComment, setUploadComment] = useState('');

  const [commentModal, setCommentModal] = useState<{ attachment: Attachment } | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  // Expand / collapse subtask attachments
  const [expandedSubtaskFiles, setExpandedSubtaskFiles] = useState<Record<string, boolean>>({});

  function toggleSubtaskFiles(subtaskId: string) {
    setExpandedSubtaskFiles((prev) => ({
      ...prev,
      [subtaskId]: prev[subtaskId] === undefined ? false : !prev[subtaskId],
    }));
  }

  function isSubtaskFilesExpanded(subtask: Subtask) {
    if (expandedSubtaskFiles[subtask.id] !== undefined) {
      return expandedSubtaskFiles[subtask.id];
    }
    return subtask.attachments.length > 0;
  }

  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const workspaceEstimateUnit: EstimateUnit =
    settings?.estimateMode === 'POINTS' ? 'POINTS' : 'HOURS';
  const subtaskSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const [nextTask, nextUsers, nextSettings, planned, active] = await Promise.all([
        request<TaskDetail>(`/tasks/${id}`),
        request<ManagedUser[]>('/users'),
        request<AppSettings>('/settings'),
        request<Paginated<SprintSummary>>('/sprints?status=PLANNED'),
        request<Paginated<SprintSummary>>('/sprints?status=ACTIVE'),
      ]);
      setTask(nextTask);
      setUsers(nextUsers.filter((user) => user.isActive));
      setSettings(nextSettings);
      setPlannedSprints([...active.items, ...planned.items]);
      setSprintId(nextTask.sprintId ?? '');
      setProjectId(nextTask.projectId ?? nextTask.project?.id ?? '');
      setTitle(nextTask.title);
      setDescription(nextTask.description ?? '');
      setEstimate(nextTask.estimateValue?.toString() ?? '');
      setPriority(nextTask.priority);
      setAssigneeIds(nextTask.assignees.map((item) => item.user.id));

      const wsParam = nextTask.workspaceId ? `?workspaceId=${nextTask.workspaceId}` : '';
      const nextProjects = await request<Project[]>(`/projects${wsParam}`);
      setProjects(nextProjects);
      setLoadFailed(false);
    } catch (caught) {
      setLoadFailed(true);
      toast.fromError(caught, 'Could not load the task.');
    }
  }, [id, request, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!task) return;
    setBusy(true);
    try {
      await request(`/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          description: description || null,
          assigneeIds,
          sprintId: sprintId || null,
          projectId: projectId || null,
          priority,
          estimate: estimate ? { value: Number(estimate), unit: workspaceEstimateUnit } : null,
        }),
      });
      setEditing(false);
      toast.success('Task saved.');
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not save the task.');
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
      toast.success('Task deleted.');
      router.push('/board');
    } catch (caught) {
      toast.fromError(caught, 'Could not delete the task.');
      setBusy(false);
    }
  }

  async function saveSubtask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subtaskForm) return;
    setBusy(true);
    try {
      await request(
        subtaskForm.id ? `/tasks/${id}/subtasks/${subtaskForm.id}` : `/tasks/${id}/subtasks`,
        {
          method: subtaskForm.id ? 'PATCH' : 'POST',
          body: JSON.stringify({
            title: subtaskForm.title,
            description: subtaskForm.description || null,
            assigneeId: subtaskForm.assigneeId || null,
            priority: subtaskForm.priority,
            estimate: subtaskForm.estimate
              ? { value: Number(subtaskForm.estimate), unit: workspaceEstimateUnit }
              : null,
          }),
        },
      );
      setSubtaskForm(null);
      toast.success(subtaskForm.id ? 'Subtask updated.' : 'Subtask created.');
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not save the subtask.');
    } finally {
      setBusy(false);
    }
  }

  async function patchSubtask(subtask: Subtask, changes: object) {
    setBusy(true);
    try {
      await request(`/tasks/${id}/subtasks/${subtask.id}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      });
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not update the subtask.');
    } finally {
      setBusy(false);
    }
  }

  async function removeSubtask(subtask: Subtask) {
    if (!window.confirm(`Delete subtask “${subtask.title}”?`)) return;
    setBusy(true);
    try {
      await request<void>(`/tasks/${id}/subtasks/${subtask.id}`, { method: 'DELETE' });
      toast.success('Subtask deleted.');
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not delete the subtask.');
    } finally {
      setBusy(false);
    }
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
    try {
      await request(`/tasks/${id}/subtasks/reorder`, {
        method: 'POST',
        body: JSON.stringify({ subtaskIds: reordered.map((item) => item.id) }),
      });
      await load();
    } catch (caught) {
      setTask(previousTask);
      toast.fromError(caught, 'Could not reorder subtasks.');
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(
    owner: 'task' | 'subtask',
    ownerId: string,
    file: File | undefined,
    comment?: string,
  ) {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    if (comment && comment.trim()) {
      form.append('comment', comment.trim());
    }
    setBusy(true);
    try {
      await request(
        owner === 'task' ? `/tasks/${ownerId}/attachments` : `/subtasks/${ownerId}/attachments`,
        { method: 'POST', body: form },
      );
      toast.success('File uploaded.');
      setUploadModal(null);
      setUploadFileSelected(null);
      setUploadComment('');
      if (owner === 'subtask') {
        setExpandedSubtaskFiles((prev) => ({ ...prev, [ownerId]: true }));
      }
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not upload the file.');
    } finally {
      setBusy(false);
    }
  }

  async function saveAttachmentComment(attachmentId: string, commentText: string) {
    setBusy(true);
    try {
      await request(`/attachments/${attachmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          comment: commentText && commentText.trim().length > 0 ? commentText.trim() : null,
        }),
      });
      toast.success('Comment saved.');
      setCommentModal(null);
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not save comment.');
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
      toast.fromError(caught, 'Could not download the file.');
    }
  }

  async function deleteFile(file: Attachment) {
    if (!window.confirm(`Delete “${file.originalName}”?`)) return;
    setBusy(true);
    try {
      await request<void>(`/attachments/${file.id}`, { method: 'DELETE' });
      toast.success('File deleted.');
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not delete the file.');
    } finally {
      setBusy(false);
    }
  }

  if (!task)
    return (
      <div className="task-detail-loading">
        {loadFailed ? (
          <p className="muted">This task could not be loaded.</p>
        ) : (
          <>
            <span className="spinner" /> Loading task…
          </>
        )}
      </div>
    );
  const completed = task.subtasks.filter((item) => item.isCompleted).length;

  return (
    <div className="page-stack task-detail-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/board">Board</Link>
        <span>/</span>
        <span>{task.column.name}</span>
      </nav>
      <header className="task-detail-header">
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.35rem',
            }}
          >
            <span className="column-chip">
              <span style={{ background: task.column.color }} />
              {task.column.name}
            </span>
            {task.project && (
              <span
                className="task-project-pill"
                style={{
                  backgroundColor: `${task.project.color || '#2563EB'}20`,
                  color: task.project.color || '#2563EB',
                  borderColor: `${task.project.color || '#2563EB'}40`,
                }}
              >
                <ProjectIcon className="project-badge-icon" name={task.project.icon} />
                {task.project.key ? `${task.project.key}-${task.project.name}` : task.project.name}
              </span>
            )}
            <PriorityBadge priority={task.priority} />
          </div>
          <h1>{task.title}</h1>
          <p className="muted">
            Created by {task.createdBy.displayName} · Updated {formatDateTime(task.updatedAt)}
          </p>
        </div>
        <HeaderActions>
          <Button variant="outline" onClick={() => setEditing(true)} type="button">
            Edit task
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => void deleteTask()}
            type="button"
          >
            Delete
          </Button>
        </HeaderActions>
      </header>

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
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setSubtaskForm({
                    title: '',
                    description: '',
                    estimate: '',
                    assigneeId: '',
                    priority: DEFAULT_TASK_PRIORITY,
                  })
                }
                type="button"
              >
                Add subtask
              </Button>
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
                  {task.subtasks.map((subtask) => (
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
                          if (
                            target.closest(
                              'button, input, select, label, a, .subtask-attachments-panel, .file-card',
                            )
                          ) {
                            event.stopPropagation();
                          }
                        }}
                      >
                        <div className="subtask-row-main">
                          <Checkbox
                            className="subtask-check"
                            aria-label={`Mark ${subtask.title} ${subtask.isCompleted ? 'incomplete' : 'complete'}`}
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
                              <PriorityBadge priority={subtask.priority} />
                              {subtask.estimateValue ? (
                                <span>
                                  {formatEstimate(subtask.estimateValue, subtask.estimateUnit)}
                                </span>
                              ) : null}
                              {subtask.attachments.length > 0 ? (
                                <button
                                  type="button"
                                  className="subtask-attachment-pill"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSubtaskFiles(subtask.id);
                                  }}
                                  title={
                                    isSubtaskFilesExpanded(subtask)
                                      ? 'Hide attachments'
                                      : 'Show attachments'
                                  }
                                >
                                  <Paperclip size={13} aria-hidden="true" />
                                  <span>
                                    {subtask.attachments.length}{' '}
                                    {subtask.attachments.length === 1 ? 'file' : 'files'}
                                  </span>
                                  {isSubtaskFilesExpanded(subtask) ? (
                                    <ChevronUp size={12} aria-hidden="true" />
                                  ) : (
                                    <ChevronDown size={12} aria-hidden="true" />
                                  )}
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <Select
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
                          </Select>
                          <div className="subtask-actions">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setUploadModal({
                                  owner: 'subtask',
                                  ownerId: subtask.id,
                                  title: subtask.title,
                                });
                                setUploadFileSelected(null);
                                setUploadComment('');
                              }}
                              type="button"
                              title="Attach file"
                            >
                              <Paperclip size={14} aria-hidden="true" />
                              <span className="sr-only">Attach file</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setSubtaskForm({
                                  id: subtask.id,
                                  title: subtask.title,
                                  description: subtask.description ?? '',
                                  estimate: subtask.estimateValue?.toString() ?? '',
                                  assigneeId: subtask.assigneeId ?? '',
                                  priority: subtask.priority,
                                })
                              }
                              type="button"
                            >
                              Edit
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => void removeSubtask(subtask)}
                              type="button"
                            >
                              Delete
                            </Button>
                          </div>
                        </div>

                        {isSubtaskFilesExpanded(subtask) && (
                          <div
                            className="subtask-attachments-panel"
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            <div className="subtask-attachments-header">
                              <span className="subtask-attachments-title">
                                <Paperclip size={13} aria-hidden="true" />
                                Attachments ({subtask.attachments.length})
                              </span>
                              <button
                                type="button"
                                className="subtask-add-file-btn"
                                onClick={() => {
                                  setUploadModal({
                                    owner: 'subtask',
                                    ownerId: subtask.id,
                                    title: subtask.title,
                                  });
                                  setUploadFileSelected(null);
                                  setUploadComment('');
                                }}
                              >
                                <Plus size={13} aria-hidden="true" />
                                Attach file
                              </button>
                            </div>

                            {subtask.attachments.length > 0 ? (
                              <div className="subtask-file-list">
                                {subtask.attachments.map((file) => (
                                  <FileCard
                                    file={file}
                                    key={file.id}
                                    onDownload={downloadFile}
                                    onDelete={deleteFile}
                                    onEditComment={(file) => {
                                      setCommentModal({ attachment: file });
                                      setEditingCommentText(file.comment ?? '');
                                    }}
                                  />
                                ))}
                              </div>
                            ) : null}
                          </div>
                        )}
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
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => {
                  setUploadModal({
                    owner: 'task',
                    ownerId: task.id,
                    title: task.title,
                  });
                  setUploadFileSelected(null);
                  setUploadComment('');
                }}
              >
                <Plus size={14} aria-hidden="true" />
                Upload file
              </Button>
            </header>
            <div className="task-file-list">
              {task.attachments.map((file) => (
                <FileCard
                  file={file}
                  key={file.id}
                  onDownload={downloadFile}
                  onDelete={deleteFile}
                  onEditComment={(file) => {
                    setCommentModal({ attachment: file });
                    setEditingCommentText(file.comment ?? '');
                  }}
                />
              ))}
              {!task.attachments.length ? <p className="empty-copy">No files attached.</p> : null}
            </div>
          </section>
        </main>
        <aside className="task-sidebar">
          <section>
            <h2>Status</h2>
            <p className="column-chip">
              <span style={{ background: task.column.color }} aria-hidden="true" />
              {task.column.name}
            </p>
          </section>
          <section>
            <h2>Project</h2>
            {task.project ? (
              <p
                className="task-project-pill"
                style={{
                  display: 'inline-flex',
                  backgroundColor: `${task.project.color || '#2563EB'}20`,
                  color: task.project.color || '#2563EB',
                  borderColor: `${task.project.color || '#2563EB'}40`,
                }}
              >
                <ProjectIcon className="project-badge-icon" name={task.project.icon} />
                {task.project.key ? `${task.project.key}-${task.project.name}` : task.project.name}
              </p>
            ) : (
              <p className="muted">No project</p>
            )}
          </section>
          <section>
            <h2>Priority</h2>
            <PriorityBadge priority={task.priority} />
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
                    <Avatar
                      color={item.user.color}
                      hasAvatar={item.user.hasAvatar}
                      name={item.user.displayName}
                      size={31}
                      userId={item.user.id}
                    />
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
        <Modal
          className="modal task-modal"
          labelledBy="edit-task-title"
          onOpenChange={(open) => {
            if (!open) setEditing(false);
          }}
        >
          <header>
            <p className="section-label">Task details</p>
            <h2 id="edit-task-title">Edit task</h2>
          </header>
          <form onSubmit={saveTask}>
            <label>
              Title
              <Input
                required
                maxLength={240}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label>
              Project <small>Optional</small>
              <Select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                <option value="">No project</option>
                {projects.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    {proj.key ? `${proj.key}-${proj.name}` : proj.name}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              Description
              <Textarea
                rows={5}
                maxLength={50000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
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
              Estimate ({workspaceEstimateUnit === 'HOURS' ? 'hours' : 'points'})
              <Input
                type="number"
                min={1}
                max={workspaceEstimateUnit === 'HOURS' ? 8760 : 10000}
                value={estimate}
                onChange={(event) => setEstimate(event.target.value)}
                placeholder="Optional"
              />
            </label>
            <label>
              Sprint
              <Select value={sprintId} onChange={(event) => setSprintId(event.target.value)}>
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
                          : assigneeIds.filter((userId) => userId !== member.id),
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
            </fieldset>
            <footer>
              <Button variant="ghost" type="button" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={busy} type="submit">
                Save task
              </Button>
            </footer>
          </form>
        </Modal>
      ) : null}

      {subtaskForm ? (
        <Modal
          className="modal task-modal"
          labelledBy="subtask-title"
          onOpenChange={(open) => {
            if (!open) setSubtaskForm(null);
          }}
        >
          <header>
            <p className="section-label">Checklist</p>
            <h2 id="subtask-title">{subtaskForm.id ? 'Edit subtask' : 'Add subtask'}</h2>
          </header>
          <form onSubmit={saveSubtask}>
            <label>
              Title
              <Input
                autoFocus
                required
                maxLength={240}
                value={subtaskForm.title}
                onChange={(event) => setSubtaskForm({ ...subtaskForm, title: event.target.value })}
              />
            </label>
            <label>
              Description
              <Textarea
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
              <Select
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
              </Select>
            </label>
            <label>
              Priority
              <PrioritySelect
                value={subtaskForm.priority}
                onChange={(value) => {
                  if (value) setSubtaskForm({ ...subtaskForm, priority: value });
                }}
              />
            </label>
            <label>
              Estimate ({workspaceEstimateUnit === 'HOURS' ? 'hours' : 'points'})
              <Input
                type="number"
                min={1}
                max={workspaceEstimateUnit === 'HOURS' ? 8760 : 10000}
                value={subtaskForm.estimate}
                onChange={(event) =>
                  setSubtaskForm({ ...subtaskForm, estimate: event.target.value })
                }
                placeholder="Optional"
              />
            </label>
            <footer>
              <Button variant="ghost" type="button" onClick={() => setSubtaskForm(null)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={busy} type="submit">
                Save subtask
              </Button>
            </footer>
          </form>
        </Modal>
      ) : null}

      {uploadModal ? (
        <Modal
          className="modal attachment-modal"
          labelledBy="upload-file-title"
          onOpenChange={(open) => {
            if (!open) {
              setUploadModal(null);
              setUploadFileSelected(null);
              setUploadComment('');
            }
          }}
        >
          <header>
            <p className="section-label">
              {uploadModal.owner === 'task' ? 'Task attachment' : 'Subtask attachment'}
            </p>
            <h2 id="upload-file-title">Attach file</h2>
            <p className="muted" style={{ fontSize: '0.82rem', marginTop: '0.2rem' }}>
              {uploadModal.title}
            </p>
          </header>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (uploadFileSelected) {
                void uploadFile(
                  uploadModal.owner,
                  uploadModal.ownerId,
                  uploadFileSelected,
                  uploadComment,
                );
              }
            }}
          >
            <label className="upload-dropzone">
              <span className="upload-dropzone-icon">
                <Paperclip size={26} aria-hidden="true" />
              </span>
              <span className="upload-dropzone-title">
                {uploadFileSelected ? uploadFileSelected.name : 'Choose a file to attach'}
              </span>
              <span className="upload-dropzone-hint">
                {uploadFileSelected
                  ? `${formatBytes(uploadFileSelected.size)} · Click to change file`
                  : 'Click or browse from your device (up to 25 MB)'}
              </span>
              <Input
                type="file"
                className="sr-only"
                disabled={busy}
                required={!uploadFileSelected}
                onChange={(event) => {
                  const f = event.target.files?.[0];
                  if (f) setUploadFileSelected(f);
                }}
              />
            </label>

            <label>
              Comment <small>Optional</small>
              <Textarea
                rows={3}
                maxLength={50000}
                value={uploadComment}
                onChange={(event) => setUploadComment(event.target.value)}
                placeholder="Add an optional comment or note about this file..."
              />
            </label>

            <footer>
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setUploadModal(null);
                  setUploadFileSelected(null);
                  setUploadComment('');
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" disabled={busy || !uploadFileSelected} type="submit">
                {busy ? 'Uploading…' : 'Attach file'}
              </Button>
            </footer>
          </form>
        </Modal>
      ) : null}

      {commentModal ? (
        <Modal
          className="modal comment-modal"
          labelledBy="file-comment-title"
          onOpenChange={(open) => {
            if (!open) setCommentModal(null);
          }}
        >
          <header>
            <p className="section-label">File comment</p>
            <h2 id="file-comment-title">
              {commentModal.attachment.comment ? 'Edit comment on file' : 'Add comment on file'}
            </h2>
            <p className="muted" style={{ fontSize: '0.82rem', marginTop: '0.2rem' }}>
              {commentModal.attachment.originalName}
            </p>
          </header>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveAttachmentComment(commentModal.attachment.id, editingCommentText);
            }}
          >
            <label>
              Comment
              <Textarea
                autoFocus
                rows={4}
                maxLength={50000}
                value={editingCommentText}
                onChange={(event) => setEditingCommentText(event.target.value)}
                placeholder="Write a comment or notes about this file..."
              />
            </label>
            <footer>
              <Button variant="ghost" type="button" onClick={() => setCommentModal(null)}>
                Cancel
              </Button>
              {commentModal.attachment.comment ? (
                <Button
                  variant="destructive"
                  type="button"
                  disabled={busy}
                  onClick={() => void saveAttachmentComment(commentModal.attachment.id, '')}
                >
                  Remove comment
                </Button>
              ) : null}
              <Button variant="primary" disabled={busy} type="submit">
                Save comment
              </Button>
            </footer>
          </form>
        </Modal>
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

function FileCard({
  file,
  onDownload,
  onDelete,
  onEditComment,
}: {
  file: Attachment;
  onDownload(file: Attachment): void;
  onDelete(file: Attachment): void;
  onEditComment(file: Attachment): void;
}) {
  return (
    <article className="file-card">
      <div className="file-card-main">
        <div className="file-card-icon" aria-hidden="true">
          <FileText size={18} />
        </div>
        <div className="file-card-info">
          <div className="file-card-name-row">
            <strong className="file-card-name" title={file.originalName}>
              {file.originalName}
            </strong>
            <span className="file-card-size">{formatBytes(file.sizeBytes)}</span>
          </div>
          <div className="file-card-meta">
            <span>
              Uploaded by <strong>{file.uploadedBy.displayName}</strong>
            </span>
            <span>·</span>
            <span>{formatDateTime(file.createdAt)}</span>
          </div>
        </div>
        <div className="file-card-actions">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => onDownload(file)}
            title="Download file"
          >
            <Download size={13} aria-hidden="true" />
            <span>Download</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => onEditComment(file)}
            title={file.comment ? 'Edit comment' : 'Add comment'}
          >
            <MessageDots size={13} aria-hidden="true" />
            <span>{file.comment ? 'Edit comment' : 'Add comment'}</span>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            type="button"
            onClick={() => onDelete(file)}
            title="Delete file"
          >
            <Trash size={13} aria-hidden="true" />
            <span>Delete</span>
          </Button>
        </div>
      </div>

      {file.comment ? (
        <div className="file-comment-box">
          <div className="file-comment-header">
            <MessageDots size={13} aria-hidden="true" className="file-comment-icon" />
            <span className="file-comment-label">Comment</span>
          </div>
          <p className="file-comment-text">{file.comment}</p>
        </div>
      ) : null}
    </article>
  );
}

function formatEstimate(value: number, unit: EstimateUnit | null) {
  if (unit === 'POINTS') return `${value} ${value === 1 ? 'point' : 'points'}`;
  return `${value}h`;
}
function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
