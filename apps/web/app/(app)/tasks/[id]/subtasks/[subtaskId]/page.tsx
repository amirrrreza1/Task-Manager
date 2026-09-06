'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Download, FileText, Plus, Trash } from '@appica/icons-react';
import {
  Button,
  Checkbox,
  Input,
  Modal,
  Select,
  Textarea,
} from '../../../../../../components/design-system';
import { Avatar } from '../../../../../../components/avatar';
import { HeaderActions } from '../../../../../../components/header-actions';
import { PriorityBadge, PrioritySelect } from '../../../../../../components/priority-badge';
import { useAuth } from '../../../../../../components/auth-provider';
import { useToast } from '../../../../../../components/toast-provider';
import { formatDateTime } from '../../../../../../lib/app-config';
import { parseEstimateInput } from '../../../../../../lib/estimate';
import type {
  AppSettings,
  Attachment,
  EstimateUnit,
  ManagedUser,
  SubtaskDetail,
  TaskPriority,
  WorkItemComment,
} from '../../../../../../lib/types';

export default function SubtaskPage() {
  const { id: taskId, subtaskId } = useParams<{ id: string; subtaskId: string }>();
  const router = useRouter();
  const { request, requestBlob, user } = useAuth();
  const toast = useToast();
  const [subtask, setSubtask] = useState<SubtaskDetail | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [editing, setEditing] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [comment, setComment] = useState('');
  const [editingComment, setEditingComment] = useState<WorkItemComment | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [estimate, setEstimate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [assigneeId, setAssigneeId] = useState('');
  const unit: EstimateUnit = settings?.estimateMode === 'POINTS' ? 'POINTS' : 'HOURS';

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const [nextSubtask, nextUsers, nextSettings] = await Promise.all([
        request<SubtaskDetail>(`/tasks/${taskId}/subtasks/${subtaskId}`),
        request<ManagedUser[]>('/users'),
        request<AppSettings>('/settings'),
      ]);
      setSubtask(nextSubtask);
      setUsers(nextUsers.filter((member) => member.isActive));
      setSettings(nextSettings);
      setTitle(nextSubtask.title);
      setDescription(nextSubtask.description ?? '');
      setEstimate(nextSubtask.estimateValue?.toString() ?? '');
      setPriority(nextSubtask.priority);
      setAssigneeId(nextSubtask.assigneeId ?? '');
    } catch (caught) {
      setLoadFailed(true);
      toast.fromError(caught, 'Could not load the subtask.');
    }
  }, [request, subtaskId, taskId, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  async function update(changes: object, success?: string) {
    setBusy(true);
    try {
      await request(`/tasks/${taskId}/subtasks/${subtaskId}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      });
      if (success) toast.success(success);
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not save the subtask.');
    } finally {
      setBusy(false);
    }
  }
  async function saveSubtask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedEstimate = parseEstimateInput(estimate);
    if (estimate.trim() && (parsedEstimate === null || Number.isNaN(parsedEstimate))) {
      toast.error('Please enter a valid positive numeric estimate.');
      return;
    }

    await update(
      {
        title,
        description: description || null,
        assigneeId: assigneeId || null,
        priority,
        estimate: parsedEstimate !== null ? { value: parsedEstimate, unit } : null,
      },
      'Subtask saved.',
    );
    setEditing(false);
  }
  async function deleteSubtask() {
    if (!subtask || !window.confirm(`Delete “${subtask.title}”?`)) return;
    setBusy(true);
    try {
      await request<void>(`/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'DELETE' });
      toast.success('Subtask deleted.');
      router.push(`/tasks/${taskId}`);
    } catch (caught) {
      toast.fromError(caught, 'Could not delete the subtask.');
      setBusy(false);
    }
  }
  async function saveComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const path = editingComment
        ? `/tasks/${taskId}/subtasks/${subtaskId}/comments/${editingComment.id}`
        : `/tasks/${taskId}/subtasks/${subtaskId}/comments`;
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
      await request<void>(`/tasks/${taskId}/subtasks/${subtaskId}/comments/${commentId}`, {
        method: 'DELETE',
      });
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
      await request(`/subtasks/${subtaskId}/attachments`, { method: 'POST', body });
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

  if (!subtask)
    return (
      <div className="task-detail-loading">
        {loadFailed ? 'This subtask could not be loaded.' : 'Loading subtask…'}
      </div>
    );
  const canManage = (item: WorkItemComment) => item.authorId === user?.id || user?.role === 'ADMIN';
  return (
    <div className="page-stack task-detail-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/board">Board</Link>
        <span>/</span>
        <Link href={`/tasks/${taskId}`}>{subtask.task.title}</Link>
        <span>/</span>
        <span>Subtask</span>
      </nav>
      <header className="task-detail-header">
        <div>
          <div className="task-heading-facts">
            <span className="column-chip">
              <span style={{ background: subtask.column.color }} />
              {subtask.column.name}
            </span>
            <PriorityBadge priority={subtask.priority} />
          </div>
          <h1>{subtask.title}</h1>
          <p className="muted">
            Created by {subtask.createdBy.displayName} · Updated {formatDateTime(subtask.updatedAt)}
          </p>
        </div>
        <HeaderActions>
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit subtask
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void deleteSubtask()}>
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
            {subtask.description ? (
              <div className="task-description">{subtask.description}</div>
            ) : (
              <p className="empty-copy">No description yet.</p>
            )}
          </section>
          <section className="detail-section comment-section">
            <header>
              <div>
                <h2>Comments</h2>
                <p>{subtask.comments.length} total</p>
              </div>
            </header>
            <form className="comment-form" onSubmit={saveComment}>
              <Textarea
                aria-label="Subtask comment"
                maxLength={10000}
                required
                rows={3}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Add an update or question…"
              />
              <div>
                <Button variant="primary" size="sm" disabled={busy} type="submit">
                  {editingComment ? 'Save edit' : 'Add comment'}
                </Button>
                {editingComment ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => {
                      setEditingComment(null);
                      setComment('');
                    }}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            </form>
            <div className="comment-list">
              {subtask.comments.map((item) => (
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
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingComment(item);
                            setComment(item.body);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          className="comment-action comment-action-delete"
                          size="sm"
                          variant="ghost"
                          onClick={() => void deleteComment(item.id)}
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
          <section className="detail-section">
            <header>
              <div>
                <h2>Files</h2>
                <p>{subtask.attachments.length} attached</p>
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
              {subtask.attachments.map((file) => (
                <FileCard
                  file={file}
                  key={file.id}
                  onDownload={downloadFile}
                  onDelete={deleteFile}
                />
              ))}
              {!subtask.attachments.length ? (
                <p className="empty-copy">No files attached.</p>
              ) : null}
            </div>
          </section>
        </main>
        <aside className="task-sidebar">
          <section>
            <h2>Completed</h2>
            <div className="subtask-completion-control">
              <Checkbox
                checked={subtask.isCompleted}
                disabled={busy}
                onChange={() =>
                  void update(
                    { isCompleted: !subtask.isCompleted },
                    subtask.isCompleted ? 'Subtask reopened.' : 'Subtask completed.',
                  )
                }
              />
              <span>{subtask.isCompleted ? 'Complete' : 'Not complete'}</span>
            </div>
          </section>
          <section>
            <h2>Status</h2>
            <p className="column-chip">
              <span style={{ background: subtask.column.color }} />
              {subtask.column.name}
            </p>
          </section>
          <section>
            <h2>Priority</h2>
            <PriorityBadge priority={subtask.priority} />
          </section>
          <section>
            <h2>Estimate</h2>
            <p>
              {subtask.estimateValue
                ? formatEstimate(subtask.estimateValue, subtask.estimateUnit)
                : 'Not estimated'}
            </p>
          </section>
          <section>
            <h2>Assignee</h2>
            {subtask.assignee ? (
              <div className="sidebar-assignees">
                <span>
                  <Avatar
                    color={subtask.assignee.color}
                    hasAvatar={subtask.assignee.hasAvatar}
                    name={subtask.assignee.displayName}
                    size={31}
                    userId={subtask.assignee.id}
                  />
                  {subtask.assignee.displayName}
                </span>
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
          labelledBy="edit-subtask-title"
          onOpenChange={(open) => !open && setEditing(false)}
        >
          <header>
            <p className="section-label">Subtask details</p>
            <h2 id="edit-subtask-title">Edit subtask</h2>
          </header>
          <form onSubmit={saveSubtask}>
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
              Description
              <Textarea
                rows={5}
                maxLength={50000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <label>
              Assignee
              <Select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
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
              <PrioritySelect value={priority} onChange={(value) => value && setPriority(value)} />
            </label>
            <label>
              Estimate ({unit === 'HOURS' ? 'hours' : 'points'})
              <Input
                type="text"
                inputMode="decimal"
                value={estimate}
                onChange={(event) => setEstimate(event.target.value)}
                placeholder={unit === 'HOURS' ? 'e.g. 0.5 or 2' : 'e.g. 3'}
              />
            </label>
            <footer>
              <Button variant="ghost" type="button" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={busy} type="submit">
                Save subtask
              </Button>
            </footer>
          </form>
        </Modal>
      ) : null}
      {uploadOpen ? (
        <Modal
          className="modal attachment-modal"
          labelledBy="upload-file-title"
          onOpenChange={(open) => !open && setUploadOpen(false)}
        >
          <header>
            <p className="section-label">Subtask attachment</p>
            <h2 id="upload-file-title">Attach file</h2>
          </header>
          <form onSubmit={uploadAttachment}>
            <label className="upload-dropzone">
              <span className="upload-dropzone-title">
                {uploadFile ? uploadFile.name : 'Choose a file to attach'}
              </span>
              <span className="upload-dropzone-hint">
                {uploadFile
                  ? `${formatBytes(uploadFile.size)} · Click to change file`
                  : 'Click or browse from your device (up to 25 MB)'}
              </span>
              <Input
                type="file"
                className="sr-only"
                required={!uploadFile}
                disabled={busy}
                onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <footer>
              <Button variant="ghost" type="button" onClick={() => setUploadOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={busy || !uploadFile} type="submit">
                {busy ? 'Uploading…' : 'Attach file'}
              </Button>
            </footer>
          </form>
        </Modal>
      ) : null}
    </div>
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
function formatEstimate(value: number, unit: EstimateUnit | null) {
  return unit === 'POINTS' ? `${value} ${value === 1 ? 'point' : 'points'}` : `${value}h`;
}
function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
