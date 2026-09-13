'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Button, Input, Modal, Select, Textarea } from './design-system';
import { PrioritySelect } from './priority-badge';
import { TaskTypeSelect } from './task-type-badge';
import { TaskIdBadge } from './task-id-badge';
import { Avatar } from './avatar';
import { useAuth } from './auth-provider';
import { useToast } from './toast-provider';
import type {
  EstimateUnit,
  ManagedUser,
  Project,
  TaskCard,
  TaskPriority,
  TaskType,
} from '../lib/types';
import { parseEstimateInput } from '../lib/estimate';

interface TaskQuickEditModalProps {
  task: TaskCard | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void | Promise<void>;
  users: ManagedUser[];
  projects: Project[];
  columns: Array<{ id: string; name: string; color: string }>;
  estimateUnit?: EstimateUnit;
}

export function TaskQuickEditModal({
  task,
  open,
  onClose,
  onUpdated,
  users,
  projects,
  columns,
  estimateUnit = 'HOURS',
}: TaskQuickEditModalProps) {
  const { request } = useAuth();
  const toast = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TaskType>('TASK');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [columnId, setColumnId] = useState<string>('');
  const [estimate, setEstimate] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description ?? '');
    setType(task.type ?? 'TASK');
    setPriority(task.priority);
    setAssigneeIds(task.assignees.map((a) => a.user.id));
    const assignedProjectId =
      task.projects && task.projects.length > 0
        ? task.projects[0].project.id
        : (task.projectId ?? task.project?.id ?? '');
    setProjectId(assignedProjectId);
    setColumnId(task.columnId);
    setEstimate(task.estimateValue ? String(task.estimateValue) : '');
  }, [task]);

  if (!open || !task) return null;

  function toggleAssignee(userId: string) {
    setAssigneeIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!task) return;

    if (!title.trim()) {
      toast.error('Task title is required.');
      return;
    }

    setSaving(true);
    try {
      const hasSubtasks = Boolean(task.subtasks && task.subtasks.length > 0);
    const parsedEstimate = parseEstimateInput(estimate);
    if (!hasSubtasks && estimate.trim() && (parsedEstimate === null || Number.isNaN(parsedEstimate))) {
      toast.error('Please enter a valid positive numeric estimate.');
      setSaving(false);
      return;
    }

    const updated = await request<TaskCard>(`/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() ? description : null,
        type,
        priority,
        assigneeIds,
        projectId: projectId || null,
        projectIds: projectId ? [projectId] : [],
        ...(hasSubtasks
          ? {}
          : {
              estimate:
                parsedEstimate !== null
                  ? { value: parsedEstimate, unit: task.estimateUnit ?? estimateUnit }
                  : null,
            }),
      }),
    });

      // If column changed, move the task to that column
      if (columnId && columnId !== task.columnId) {
        await request(`/tasks/${task.id}/move`, {
          method: 'POST',
          body: JSON.stringify({
            columnId,
            expectedUpdatedAt: updated.updatedAt ?? task.updatedAt,
          }),
        });
      }

      toast.success('Task updated.');
      await onUpdated();
      onClose();
    } catch (caught) {
      toast.fromError(caught, 'Could not update task.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      className="task-quick-edit-modal-content"
      labelledBy="quick-edit-title"
      onOpenChange={(isOpen) => {
        if (!isOpen && !saving) onClose();
      }}
    >
      <form onSubmit={handleSave} className="task-quick-edit-form">
        <header className="quick-edit-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <h2 id="quick-edit-title">Quick Edit Task</h2>
            <TaskIdBadge id={task.id} />
          </div>
          <p className="quick-edit-subtitle">Update task details directly from the board</p>
        </header>

        <div className="quick-edit-body">
          <label className="field">
            <span className="field-label">Title</span>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              required
              autoFocus
              disabled={saving}
            />
          </label>

          <label className="field">
            <span className="field-label">Description</span>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a detailed description..."
              disabled={saving}
            />
          </label>

          <div className="quick-edit-grid">
            <label className="field">
              <span className="field-label">Type</span>
              <TaskTypeSelect
                value={type}
                onChange={(val) => {
                  if (val) setType(val);
                }}
                disabled={saving}
              />
            </label>

            <label className="field">
              <span className="field-label">Priority</span>
              <PrioritySelect
                value={priority}
                onChange={(val) => {
                  if (val) setPriority(val);
                }}
                disabled={saving}
              />
            </label>

            <label className="field">
              <span className="field-label">Status / Column</span>
              <Select
                value={columnId}
                onChange={(e) => setColumnId(e.target.value)}
                disabled={saving}
              >
                {columns.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div className="quick-edit-grid">
            <label className="field">
              <span className="field-label">Project</span>
              <Select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={saving}
              >
                <option value="">No project</option>
                {projects.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    {proj.key ? `${proj.key} - ${proj.name}` : proj.name}
                  </option>
                ))}
              </Select>
            </label>

            <label className="field">
              <span className="field-label">
                Estimate ({estimateUnit === 'POINTS' ? 'Points' : 'Hours'})
                {Boolean(task.subtasks && task.subtasks.length > 0) && (
                  <span className="muted" style={{ fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                    (Calculated from subtasks)
                  </span>
                )}
              </span>
              <Input
                type="text"
                inputMode="decimal"
                value={
                  task.subtasks && task.subtasks.length > 0
                    ? task.estimateValue
                      ? String(task.estimateValue)
                      : ''
                    : estimate
                }
                onChange={(e) => setEstimate(e.target.value)}
                placeholder={estimateUnit === 'POINTS' ? 'e.g. 5' : 'e.g. 0.5 or 2.5'}
                disabled={saving || Boolean(task.subtasks && task.subtasks.length > 0)}
                readOnly={Boolean(task.subtasks && task.subtasks.length > 0)}
              />
            </label>
          </div>

          <div className="field">
            <span className="field-label">Assignees</span>
            <div className="quick-edit-assignees-list" role="group" aria-label="Task assignees">
              {users.length === 0 ? (
                <p className="quick-edit-empty-users">No active members found.</p>
              ) : (
                users.map((user) => {
                  const isAssigned = assigneeIds.includes(user.id);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      className={`quick-edit-assignee-pill ${isAssigned ? 'is-selected' : ''}`}
                      onClick={() => toggleAssignee(user.id)}
                      disabled={saving}
                      aria-pressed={isAssigned}
                    >
                      <Avatar
                        color={user.color}
                        hasAvatar={user.hasAvatar}
                        initialsSize={14}
                        name={user.displayName}
                        size={20}
                        userId={user.id}
                      />
                      <span className="quick-edit-assignee-name">{user.displayName}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <footer className="quick-edit-footer">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving || !title.trim()}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
