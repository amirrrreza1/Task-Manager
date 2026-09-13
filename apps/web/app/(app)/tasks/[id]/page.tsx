'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ChevronRight, Download, FileText, Plus, Trash } from '@appica/icons-react';
import { Button, Checkbox, Input, Modal, Select, Textarea } from '../../../../components/design-system';
import { Avatar } from '../../../../components/avatar';
import { HeaderActions } from '../../../../components/header-actions';
import { PriorityBadge, PrioritySelect } from '../../../../components/priority-badge';
import { TaskTypeBadge, TaskTypeSelect } from '../../../../components/task-type-badge';
import { TaskIdBadge } from '../../../../components/task-id-badge';
import { formatTaskId } from '../../../../lib/task-id';
import { ProjectIcon } from '../../../../lib/project-icons';
import { useAuth } from '../../../../components/auth-provider';
import { useToast } from '../../../../components/toast-provider';
import { formatDateTime } from '../../../../lib/app-config';
import { DEFAULT_TASK_PRIORITY } from '../../../../lib/priority';
import { DEFAULT_TASK_TYPE } from '../../../../lib/task-type';
import { parseEstimateInput } from '../../../../lib/estimate';
import type {
  AppSettings,
  Attachment,
  EstimateUnit,
  ManagedUser,
  Paginated,
  Project,
  SprintSummary,
  TaskDetail,
  TaskPriority,
  TaskType,
  WorkItemComment,
} from '../../../../lib/types';

interface SubtaskForm {
  title: string;
  description: string;
  estimate: string;
  assigneeId: string;
  priority: TaskPriority;
}

export default function TaskPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { request, requestBlob, user } = useAuth();
  const toast = useToast();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [plannedSprints, setPlannedSprints] = useState<SprintSummary[]>([]);
  const [editing, setEditing] = useState(false);
  const [subtaskForm, setSubtaskForm] = useState<SubtaskForm | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [editingComment, setEditingComment] = useState<WorkItemComment | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TaskType>(DEFAULT_TASK_TYPE);
  const [estimate, setEstimate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>(DEFAULT_TASK_PRIORITY);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [sprintId, setSprintId] = useState('');
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const estimateUnit: EstimateUnit = settings?.estimateMode === 'POINTS' ? 'POINTS' : 'HOURS';

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const nextTask = await request<TaskDetail>(`/tasks/${id}`);
      const workspaceParam = nextTask.workspaceId ? `&workspaceId=${nextTask.workspaceId}` : '';
      const [nextUsers, nextSettings, planned, active, nextProjects] = await Promise.all([
        request<ManagedUser[]>('/users'),
        request<AppSettings>('/settings'),
        request<Paginated<SprintSummary>>(`/sprints?status=PLANNED${workspaceParam}`),
        request<Paginated<SprintSummary>>(`/sprints?status=ACTIVE${workspaceParam}`),
        request<Project[]>(
          `/projects${nextTask.workspaceId ? `?workspaceId=${nextTask.workspaceId}` : ''}`,
        ),
      ]);
      setTask(nextTask);
      setUsers(nextUsers.filter((member) => member.isActive));
      setSettings(nextSettings);
      setPlannedSprints([...active.items, ...planned.items]);
      setTitle(nextTask.title);
      setDescription(nextTask.description ?? '');
      setType(nextTask.type ?? DEFAULT_TASK_TYPE);
      setEstimate(nextTask.estimateValue?.toString() ?? '');
      setPriority(nextTask.priority);
      setAssigneeIds(nextTask.assignees.map((item) => item.user.id));
      setSprintId(nextTask.sprintId ?? '');
      const assignedProjectIds =
        nextTask.projects?.map((p) => p.project.id) ??
        (nextTask.projectId ? [nextTask.projectId] : []);
      setProjectIds(assignedProjectIds);
      setProjects(nextProjects);
      if (typeof document !== 'undefined') {
        document.title = `${formatTaskId(nextTask.id)} ${nextTask.title} · Task Manager`;
      }
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
    const hasSubtasks = Boolean(task?.subtasks && task.subtasks.length > 0);
    const parsedEstimate = parseEstimateInput(estimate);
    if (!hasSubtasks && estimate.trim() && (parsedEstimate === null || Number.isNaN(parsedEstimate))) {
      toast.error('Please enter a valid positive numeric estimate.');
      return;
    }

    setBusy(true);
    try {
      await request(`/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          description: description || null,
          type,
          assigneeIds,
          sprintId: sprintId || null,
          projectIds,
          priority,
          ...(hasSubtasks
            ? {}
            : {
                estimate:
                  parsedEstimate !== null ? { value: parsedEstimate, unit: estimateUnit } : null,
              }),
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

  async function saveSubtask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subtaskForm) return;

    const parsedEstimate = parseEstimateInput(subtaskForm.estimate);
    if (subtaskForm.estimate.trim() && (parsedEstimate === null || Number.isNaN(parsedEstimate))) {
      toast.error('Please enter a valid positive numeric estimate.');
      return;
    }

    setBusy(true);
    try {
      const created = await request<{ id: string }>(`/tasks/${id}/subtasks`, {
        method: 'POST',
        body: JSON.stringify({
          title: subtaskForm.title,
          description: subtaskForm.description || null,
          assigneeId: subtaskForm.assigneeId || null,
          priority: subtaskForm.priority,
          estimate: parsedEstimate !== null ? { value: parsedEstimate, unit: estimateUnit } : null,
        }),
      });
      toast.success('Subtask created.');
      router.push(`/tasks/${id}/subtasks/${created.id}`);
    } catch (caught) {
      toast.fromError(caught, 'Could not create the subtask.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleSubtaskCompletion(subtaskId: string, currentCompleted: boolean) {
    setTask((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        subtasks: prev.subtasks.map((item) =>
          item.id === subtaskId ? { ...item, isCompleted: !currentCompleted } : item,
        ),
      };
    });
    try {
      await request(`/tasks/${id}/subtasks/${subtaskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isCompleted: !currentCompleted }),
      });
      toast.success(!currentCompleted ? 'Subtask completed.' : 'Subtask reopened.');
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not update subtask status.');
      await load();
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

  async function saveComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = editingComment
      ? `/tasks/${id}/comments/${editingComment.id}`
      : `/tasks/${id}/comments`;
    setBusy(true);
    try {
      await request(path, {
        method: editingComment ? 'PATCH' : 'POST',
        body: JSON.stringify({ body: comment }),
      });
      setComment('');
      setEditingComment(null);
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not save comment.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteComment(commentId: string) {
    setBusy(true);
    try {
      await request<void>(`/tasks/${id}/comments/${commentId}`, { method: 'DELETE' });
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not delete comment.');
    } finally {
      setBusy(false);
    }
  }

  async function uploadAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uploadFile) return;
    const body = new FormData();
    body.append('file', uploadFile);
    setBusy(true);
    try {
      await request(`/tasks/${id}/attachments`, { method: 'POST', body });
      setUploadOpen(false);
      setUploadFile(null);
      toast.success('File uploaded.');
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not upload the file.');
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
        {loadFailed ? 'This task could not be loaded.' : 'Loading task…'}
      </div>
    );
  const canManageComment = (item: WorkItemComment) =>
    item.authorId === user?.id || user?.role === 'ADMIN';

  return (
    <div className="page-stack task-detail-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/board">Board</Link>
        <span>/</span>
        <span>{task.column.name}</span>
      </nav>
      <header className="task-detail-header">
        <div>
          <div className="task-heading-facts">
            <TaskIdBadge id={task.id} size="md" />
            <span className="column-chip">
              <span style={{ background: task.column.color }} />
              {task.column.name}
            </span>
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
                    {project.key ? `${project.key}-${project.name}` : project.name}
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
                {task.project.key ? `${task.project.key}-${task.project.name}` : task.project.name}
              </span>
            ) : null}
            <TaskTypeBadge type={task.type} />
            <PriorityBadge priority={task.priority} />
          </div>
          <h1>{task.title}</h1>
          <p className="muted">
            Created by {task.createdBy.displayName} · Updated {formatDateTime(task.updatedAt)}
          </p>
        </div>
        <HeaderActions>
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit task
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void deleteTask()}>
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
          <section className="detail-section subtasks-section">
            <header>
              <div>
                <div className="subtasks-header-title">
                  <h2>Subtasks</h2>
                  {task.subtasks.length > 0 ? (
                    <span className="subtasks-count-chip">
                      {task.subtasks.filter((s) => s.isCompleted).length}/{task.subtasks.length}
                    </span>
                  ) : null}
                </div>
                <p>
                  {task.subtasks.length === 0
                    ? '0 total'
                    : `${task.subtasks.filter((s) => s.isCompleted).length} of ${task.subtasks.length} completed`}
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
              >
                <Plus size={14} />
                Add subtask
              </Button>
            </header>
            {task.subtasks.length > 0 ? (
              <div
                className="subtasks-progress-track"
                role="progressbar"
                aria-valuenow={Math.round(
                  (task.subtasks.filter((s) => s.isCompleted).length / task.subtasks.length) * 100,
                )}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Subtasks progress: ${Math.round(
                  (task.subtasks.filter((s) => s.isCompleted).length / task.subtasks.length) * 100,
                )}% completed`}
              >
                <div
                  className="subtasks-progress-fill"
                  style={{
                    width: `${Math.round(
                      (task.subtasks.filter((s) => s.isCompleted).length / task.subtasks.length) *
                        100,
                    )}%`,
                  }}
                />
              </div>
            ) : null}
            <div className="subtask-list">
              {task.subtasks.map((subtask) => (
                <div
                  key={subtask.id}
                  className={`subtask-item ${subtask.isCompleted ? 'is-completed' : ''}`}
                >
                  <div className="subtask-item-main">
                    <div className="subtask-item-check">
                      <Checkbox
                        aria-label={`Mark "${subtask.title}" as ${subtask.isCompleted ? 'incomplete' : 'complete'}`}
                        checked={subtask.isCompleted}
                        disabled={busy}
                        onChange={() =>
                          void toggleSubtaskCompletion(subtask.id, subtask.isCompleted)
                        }
                      />
                    </div>
                    <TaskIdBadge id={subtask.id} />
                    <Link
                      className="subtask-item-title"
                      href={`/tasks/${id}/subtasks/${subtask.id}`}
                      title={subtask.title}
                    >
                      {subtask.title}
                    </Link>
                  </div>
                  <div className="subtask-item-meta">
                    {subtask.estimateValue ? (
                      <span
                        className="subtask-meta-pill"
                        title={`Estimate: ${formatEstimate(subtask.estimateValue, subtask.estimateUnit)}`}
                      >
                        {formatEstimate(subtask.estimateValue, subtask.estimateUnit, true)}
                      </span>
                    ) : null}
                    <PriorityBadge priority={subtask.priority} />
                    {subtask.assignee ? (
                      <div
                        className="subtask-assignee-badge"
                        title={`Assigned to ${subtask.assignee.displayName}`}
                      >
                        <Avatar
                          color={subtask.assignee.color}
                          hasAvatar={subtask.assignee.hasAvatar}
                          name={subtask.assignee.displayName}
                          size={20}
                          userId={subtask.assignee.id}
                        />
                        <span className="subtask-assignee-name">
                          {subtask.assignee.displayName}
                        </span>
                      </div>
                    ) : null}
                    {subtask.attachments && subtask.attachments.length > 0 ? (
                      <span
                        className="subtask-meta-pill subtask-attachment-pill-badge"
                        title={`${subtask.attachments.length} attachment(s)`}
                      >
                        <FileText size={12} />
                        <span>{subtask.attachments.length}</span>
                      </span>
                    ) : null}
                    <Link
                      href={`/tasks/${id}/subtasks/${subtask.id}`}
                      className="subtask-open-btn"
                      aria-label={`View subtask ${subtask.title}`}
                      title="View subtask"
                    >
                      <ChevronRight size={15} />
                    </Link>
                  </div>
                </div>
              ))}
              {!task.subtasks.length ? (
                <div className="subtask-empty-box">
                  <p className="empty-copy">
                    No subtasks yet. Break this task into independently owned steps.
                  </p>
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
                  >
                    <Plus size={14} />
                    Add subtask
                  </Button>
                </div>
              ) : null}
            </div>
          </section>
          <CommentThread
            comments={task.comments}
            value={comment}
            editing={editingComment}
            busy={busy}
            canManage={canManageComment}
            onChange={setComment}
            onEdit={(item) => {
              setEditingComment(item);
              setComment(item.body);
            }}
            onCancel={() => {
              setEditingComment(null);
              setComment('');
            }}
            onDelete={deleteComment}
            onSubmit={saveComment}
          />
          <section className="detail-section">
            <header>
              <div>
                <h2>Files</h2>
                <p>{task.attachments.length} attached</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setUploadFile(null);
                  setUploadOpen(true);
                }}
              >
                <Plus size={14} />
                Upload file
              </Button>
            </header>
            <div className="task-file-list">
              {task.attachments.map((file) => (
                <FileCard
                  file={file}
                  key={file.id}
                  onDelete={deleteFile}
                  onDownload={downloadFile}
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
              <span style={{ background: task.column.color }} />
              {task.column.name}
            </p>
          </section>
          <section>
            <h2>Projects</h2>
            {task.projects && task.projects.length > 0 ? (
              <div className="sidebar-projects">
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
                    {project.key ? `${project.key}-${project.name}` : project.name}
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
                {task.project.key ? `${task.project.key}-${task.project.name}` : task.project.name}
              </span>
            ) : (
              <p>No project</p>
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
              {task.subtasks && task.subtasks.length > 0 ? (
                <span
                  className="muted"
                  style={{ fontSize: '0.8rem', display: 'block', marginTop: '0.2rem' }}
                >
                  (sum of subtasks)
                </span>
              ) : null}
            </p>
          </section>
          <section>
            <h2>Assignees</h2>
            {task.assignees.length ? (
              <div className="sidebar-assignees">
                {task.assignees.map(({ user: member }) => (
                  <span key={member.id}>
                    <Avatar
                      color={member.color}
                      hasAvatar={member.hasAvatar}
                      name={member.displayName}
                      size={31}
                      userId={member.id}
                    />
                    {member.displayName}
                  </span>
                ))}
              </div>
            ) : (
              <p>Unassigned</p>
            )}
          </section>
          <section>
            <h2>Sprint</h2>
            {task.sprint ? (
              <p>
                <Link href={`/sprints/${task.sprint.id}`}>
                  {task.sprint.name}
                  {task.sprint.status === 'ACTIVE' ? ' (active)' : ''}
                  {task.sprint.status === 'COMPLETED' ? ' (completed)' : ''}
                </Link>
              </p>
            ) : (
              <p>Backlog</p>
            )}
          </section>
        </aside>
      </div>
      {editing ? (
        <TaskEditModal
          task={task}
          users={users}
          projects={projects}
          sprints={plannedSprints}
          title={title}
          type={type}
          description={description}
          estimate={estimate}
          priority={priority}
          assigneeIds={assigneeIds}
          projectIds={projectIds}
          sprintId={sprintId}
          estimateUnit={estimateUnit}
          busy={busy}
          onClose={() => setEditing(false)}
          onSubmit={saveTask}
          setTitle={setTitle}
          setType={setType}
          setDescription={setDescription}
          setEstimate={setEstimate}
          setPriority={setPriority}
          setAssigneeIds={setAssigneeIds}
          setProjectIds={setProjectIds}
          setSprintId={setSprintId}
        />
      ) : null}
      {subtaskForm ? (
        <SubtaskModal
          form={subtaskForm}
          users={users}
          unit={estimateUnit}
          busy={busy}
          onClose={() => setSubtaskForm(null)}
          onChange={setSubtaskForm}
          onSubmit={saveSubtask}
        />
      ) : null}
      {uploadOpen ? (
        <UploadModal
          file={uploadFile}
          busy={busy}
          onClose={() => setUploadOpen(false)}
          onFile={setUploadFile}
          onSubmit={uploadAttachment}
        />
      ) : null}
    </div>
  );
}

function CommentThread({
  comments,
  value,
  editing,
  busy,
  canManage,
  onChange,
  onEdit,
  onCancel,
  onDelete,
  onSubmit,
}: {
  comments: WorkItemComment[];
  value: string;
  editing: WorkItemComment | null;
  busy: boolean;
  canManage(item: WorkItemComment): boolean;
  onChange(value: string): void;
  onEdit(item: WorkItemComment): void;
  onCancel(): void;
  onDelete(id: string): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
}) {
  return (
    <section className="detail-section comment-section">
      <header>
        <div>
          <h2>Comments</h2>
          <p>{comments.length} total</p>
        </div>
      </header>
      <form className="comment-form" onSubmit={onSubmit}>
        <Textarea
          aria-label="Task comment"
          maxLength={10000}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Add an update or question…"
          required
          rows={3}
          value={value}
        />
        <div>
          <Button variant="primary" size="sm" disabled={busy} type="submit">
            {editing ? 'Save edit' : 'Add comment'}
          </Button>
          {editing ? (
            <Button variant="ghost" size="sm" onClick={onCancel} type="button">
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
      <div className="comment-list">
        {comments.map((item) => (
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
                {formatDateTime(item.createdAt)}
                {item.updatedAt !== item.createdAt ? ' · edited' : ''}
              </small>
              <p>{item.body}</p>
              {canManage(item) ? (
                <div className="comment-actions">
                  <Button
                    className="comment-action"
                    onClick={() => onEdit(item)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Edit
                  </Button>
                  <Button
                    className="comment-action comment-action-delete"
                    onClick={() => onDelete(item.id)}
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
    </section>
  );
}

function FileCard({
  file,
  onDownload,
  onDelete,
}: {
  file: Attachment;
  onDownload(file: Attachment): void;
  onDelete(file: Attachment): void;
}) {
  return (
    <article className="file-card">
      <div className="file-card-main">
        <div className="file-card-icon">
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
            Uploaded by <strong>{file.uploadedBy.displayName}</strong>
            <span>·</span>
            <span>{formatDateTime(file.createdAt)}</span>
          </div>
        </div>
        <div className="file-card-actions">
          <Button variant="ghost" size="sm" onClick={() => onDownload(file)}>
            <Download size={13} />
            Download
          </Button>
          <Button variant="destructive" size="sm" onClick={() => onDelete(file)}>
            <Trash size={13} />
            Delete
          </Button>
        </div>
      </div>
    </article>
  );
}

function UploadModal({
  file,
  busy,
  onClose,
  onFile,
  onSubmit,
}: {
  file: File | null;
  busy: boolean;
  onClose(): void;
  onFile(file: File | null): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
}) {
  return (
    <Modal
      className="modal attachment-modal"
      labelledBy="upload-file-title"
      onOpenChange={(open) => !open && onClose()}
    >
      <header>
        <p className="section-label">Task attachment</p>
        <h2 id="upload-file-title">Attach file</h2>
      </header>
      <form onSubmit={onSubmit}>
        <label className="upload-dropzone">
          <span className="upload-dropzone-title">
            {file ? file.name : 'Choose a file to attach'}
          </span>
          <span className="upload-dropzone-hint">
            {file
              ? `${formatBytes(file.size)} · Click to change file`
              : 'Click or browse from your device (up to 25 MB)'}
          </span>
          <Input
            type="file"
            className="sr-only"
            disabled={busy}
            required={!file}
            onChange={(event) => onFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <footer>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !file} type="submit">
            {busy ? 'Uploading…' : 'Attach file'}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}

function SubtaskModal({
  form,
  users,
  unit,
  busy,
  onClose,
  onChange,
  onSubmit,
}: {
  form: SubtaskForm;
  users: ManagedUser[];
  unit: EstimateUnit;
  busy: boolean;
  onClose(): void;
  onChange(form: SubtaskForm): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
}) {
  return (
    <Modal
      className="modal task-modal"
      labelledBy="subtask-title"
      onOpenChange={(open) => !open && onClose()}
    >
      <header>
        <p className="section-label">Subtask</p>
        <h2 id="subtask-title">Add subtask</h2>
      </header>
      <form onSubmit={onSubmit}>
        <label>
          Title
          <Input
            autoFocus
            required
            maxLength={240}
            value={form.title}
            onChange={(event) => onChange({ ...form, title: event.target.value })}
          />
        </label>
        <label>
          Description
          <Textarea
            rows={3}
            maxLength={50000}
            value={form.description}
            onChange={(event) => onChange({ ...form, description: event.target.value })}
          />
        </label>
        <label>
          Assignee
          <Select
            value={form.assigneeId}
            onChange={(event) => onChange({ ...form, assigneeId: event.target.value })}
          >
            <option value="">Unassigned</option>
            {users.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </Select>
        </label>
        <label>
          Priority
          <PrioritySelect
            value={form.priority}
            onChange={(value) => value && onChange({ ...form, priority: value })}
          />
        </label>
        <label>
          Estimate ({unit === 'HOURS' ? 'hours' : 'points'})
          <Input
            type="text"
            inputMode="decimal"
            value={form.estimate}
            onChange={(event) => onChange({ ...form, estimate: event.target.value })}
            placeholder={unit === 'HOURS' ? 'e.g. 0.5 or 2' : 'e.g. 3'}
          />
        </label>
        <footer>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} type="submit">
            Create subtask
          </Button>
        </footer>
      </form>
    </Modal>
  );
}

function TaskEditModal({
  task,
  users,
  projects,
  sprints,
  title,
  type,
  description,
  estimate,
  priority,
  assigneeIds,
  projectIds,
  sprintId,
  estimateUnit,
  busy,
  onClose,
  onSubmit,
  setTitle,
  setType,
  setDescription,
  setEstimate,
  setPriority,
  setAssigneeIds,
  setProjectIds,
  setSprintId,
}: {
  task: TaskDetail;
  users: ManagedUser[];
  projects: Project[];
  sprints: SprintSummary[];
  title: string;
  type: TaskType;
  description: string;
  estimate: string;
  priority: TaskPriority;
  assigneeIds: string[];
  projectIds: string[];
  sprintId: string;
  estimateUnit: EstimateUnit;
  busy: boolean;
  onClose(): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  setTitle(value: string): void;
  setType(value: TaskType): void;
  setDescription(value: string): void;
  setEstimate(value: string): void;
  setPriority(value: TaskPriority): void;
  setAssigneeIds(value: string[]): void;
  setProjectIds(value: string[]): void;
  setSprintId(value: string): void;
}) {
  const hasSubtasks = Boolean(task.subtasks && task.subtasks.length > 0);

  return (
    <Modal
      className="modal task-modal"
      labelledBy="edit-task-title"
      onOpenChange={(open) => !open && onClose()}
    >
      <header>
        <p className="section-label">Task details</p>
        <h2 id="edit-task-title">Edit task</h2>
      </header>
      <form onSubmit={onSubmit}>
        <label>
          Title
          <Input
            required
            maxLength={240}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <fieldset className="assignee-picker">
          <legend>Projects</legend>
          {projects.map((project) => {
            const isChecked = projectIds.includes(project.id);
            const color = project.color || '#2563EB';
            return (
              <label
                className="assignee-choice project-choice"
                key={project.id}
                style={
                  isChecked
                    ? {
                        backgroundColor: `${color}18`,
                        borderColor: `${color}60`,
                      }
                    : undefined
                }
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(event) =>
                    setProjectIds(
                      event.target.checked
                        ? [...projectIds, project.id]
                        : projectIds.filter((id) => id !== project.id),
                    )
                  }
                />
                <ProjectIcon className="project-badge-icon" name={project.icon} />
                <span>{project.key ? `${project.key}-${project.name}` : project.name}</span>
              </label>
            );
          })}
          {!projects.length ? <p className="muted">No projects in this workspace.</p> : null}
        </fieldset>
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
          Type
          <TaskTypeSelect value={type} onChange={(value) => value && setType(value)} />
        </label>
        <label>
          Priority
          <PrioritySelect value={priority} onChange={(value) => value && setPriority(value)} />
        </label>
        <label>
          Estimate ({estimateUnit === 'HOURS' ? 'hours' : 'points'})
          {hasSubtasks ? (
            <small className="muted" style={{ display: 'block', marginBottom: '0.25rem' }}>
              Calculated from subtasks (cannot be changed directly)
            </small>
          ) : null}
          <Input
            type="text"
            inputMode="decimal"
            value={hasSubtasks ? (task.estimateValue ? String(task.estimateValue) : '') : estimate}
            onChange={(event) => setEstimate(event.target.value)}
            placeholder={estimateUnit === 'HOURS' ? 'e.g. 0.5 or 2' : 'e.g. 3'}
            disabled={hasSubtasks}
            readOnly={hasSubtasks}
          />
        </label>
        <label>
          Sprint
          <Select
            value={sprintId}
            onChange={(event) => setSprintId(event.target.value)}
            disabled={task.sprint?.status === 'COMPLETED'}
          >
            <option value="">No sprint</option>
            {task.sprint && !sprints.some((sprint) => sprint.id === task.sprint?.id) ? (
              <option value={task.sprint.id}>
                {task.sprint.name} ({task.sprint.status.toLowerCase()})
              </option>
            ) : null}
            {sprints.map((sprint) => (
              <option key={sprint.id} value={sprint.id}>
                {sprint.name}
                {sprint.status === 'ACTIVE' ? ' (active)' : ''}
              </option>
            ))}
          </Select>
          {task.sprint?.status === 'COMPLETED' ? (
            <span className="muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
              Tasks in a completed sprint cannot be reassigned.
            </span>
          ) : null}
        </label>
        <fieldset className="assignee-picker">
          <legend>Assignees</legend>
          {users.map((member) => (
            <label className="assignee-choice" key={member.id}>
              <input
                type="checkbox"
                checked={assigneeIds.includes(member.id)}
                onChange={(event) =>
                  setAssigneeIds(
                    event.target.checked
                      ? [...assigneeIds, member.id]
                      : assigneeIds.filter((memberId) => memberId !== member.id),
                  )
                }
              />
              <Avatar
                color={member.color}
                hasAvatar={member.hasAvatar}
                name={member.displayName}
                size={24}
                userId={member.id}
              />
              <span>{member.displayName}</span>
            </label>
          ))}
        </fieldset>
        <footer>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} type="submit">
            Save task
          </Button>
        </footer>
      </form>
    </Modal>
  );
}

function formatEstimate(value: number, unit: EstimateUnit | null, compact = false) {
  if (unit === 'POINTS') {
    return compact ? `${value} ${value === 1 ? 'pt' : 'pts'}` : `${value} ${value === 1 ? 'point' : 'points'}`;
  }
  return `${value}h`;
}
function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
