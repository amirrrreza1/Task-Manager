'use client';

import { FormEvent, useState } from 'react';
import { AuthGate } from '../../../../components/auth-gate';
import { useAuth } from '../../../../components/auth-provider';
import { useToast } from '../../../../components/toast-provider';
import { useWorkspace } from '../../../../components/workspace-provider';
import { Button, Input, Modal, Radio, Textarea } from '../../../../components/design-system';
import type { Workspace } from '../../../../lib/types';

export default function WorkspacesSettingsPage() {
  return (
    <AuthGate admin>
      <WorkspacesSettings />
    </AuthGate>
  );
}

function WorkspacesSettings() {
  const { request } = useAuth();
  const toast = useToast();
  const { workspaces, currentWorkspace, setCurrentWorkspaceId, refreshWorkspaces } = useWorkspace();

  const [creating, setCreating] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [deletingWorkspace, setDeletingWorkspace] = useState<Workspace | null>(null);

  // Create form state
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createEstimateMode, setCreateEstimateMode] = useState<'TIME' | 'POINTS'>('TIME');
  const [createSprintDuration, setCreateSprintDuration] = useState(14);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editEstimateMode, setEditEstimateMode] = useState<'TIME' | 'POINTS'>('TIME');
  const [editSprintDuration, setEditSprintDuration] = useState(14);

  const [saving, setSaving] = useState(false);

  const openCreateModal = () => {
    setCreateName('');
    setCreateDescription('');
    setCreateEstimateMode('TIME');
    setCreateSprintDuration(14);
    setCreating(true);
  };

  const openEditModal = (ws: Workspace) => {
    setEditingWorkspace(ws);
    setEditName(ws.name);
    setEditDescription(ws.description ?? '');
    setEditEstimateMode(ws.estimateMode);
    setEditSprintDuration(ws.sprintDurationDays);
  };

  const openDeleteModal = (ws: Workspace) => {
    setDeletingWorkspace(ws);
  };

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!createName.trim()) return;
    setSaving(true);
    try {
      const created = await request<Workspace>('/workspaces', {
        method: 'POST',
        body: JSON.stringify({
          name: createName.trim(),
          description: createDescription.trim() || undefined,
          estimateMode: createEstimateMode,
          sprintDurationDays: createSprintDuration,
        }),
      });
      setCreating(false);
      await refreshWorkspaces();
      setCurrentWorkspaceId(created.id);
      toast.success(`Workspace "${created.name}" created.`);
    } catch (caught) {
      toast.fromError(caught, 'Could not create workspace.');
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingWorkspace || !editName.trim()) return;
    setSaving(true);
    try {
      const updated = await request<Workspace>(`/workspaces/${editingWorkspace.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || undefined,
          estimateMode: editEstimateMode,
          sprintDurationDays: editSprintDuration,
        }),
      });
      setEditingWorkspace(null);
      await refreshWorkspaces();
      toast.success(`Workspace "${updated.name}" updated.`);
    } catch (caught) {
      toast.fromError(caught, 'Could not update workspace.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deletingWorkspace) return;
    setSaving(true);
    try {
      await request(`/workspaces/${deletingWorkspace.id}`, {
        method: 'DELETE',
      });
      const deletedId = deletingWorkspace.id;
      const deletedName = deletingWorkspace.name;
      setDeletingWorkspace(null);
      await refreshWorkspaces();

      // If active workspace was deleted, switch to another
      if (currentWorkspace?.id === deletedId) {
        const remaining = workspaces.filter((w) => w.id !== deletedId);
        if (remaining.length > 0) {
          setCurrentWorkspaceId(remaining[0].id);
        }
      }
      toast.success(`Workspace "${deletedName}" deleted.`);
    } catch (caught) {
      toast.fromError(caught, 'Could not delete workspace.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Workspaces</h1>
          <p className="muted">
            Manage team workspaces, separate task boards, sprints, and estimation workflows.
          </p>
        </div>
        <div className="header-actions">
          <Button variant="primary" onClick={openCreateModal} type="button">
            + New Workspace
          </Button>
        </div>
      </header>

      <div className="workspaces-grid">
        {workspaces.map((ws) => {
          const isActive = currentWorkspace?.id === ws.id;
          return (
            <div
              key={ws.id}
              className={`workspace-card ${isActive ? 'workspace-card-active' : ''}`}
            >
              <div className="workspace-card-header">
                <div>
                  <div className="workspace-card-title-row">
                    <h2>{ws.name}</h2>
                    {isActive ? <span className="workspace-active-badge">Active</span> : null}
                  </div>
                  <p className="workspace-card-desc">
                    {ws.description || 'No description provided.'}
                  </p>
                </div>
              </div>

              <div className="workspace-card-meta">
                <div className="meta-item">
                  <span className="meta-label">Estimate mode</span>
                  <strong className="meta-value">
                    {ws.estimateMode === 'TIME' ? 'Time (Hours)' : 'Points (Relative)'}
                  </strong>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Sprint duration</span>
                  <strong className="meta-value">{ws.sprintDurationDays} days</strong>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Tasks & Sprints</span>
                  <strong className="meta-value">
                    {ws._count?.tasks ?? 0} tasks · {ws._count?.sprints ?? 0} sprints
                  </strong>
                </div>
              </div>

              <div className="workspace-card-actions">
                {!isActive ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCurrentWorkspaceId(ws.id);
                      toast.success(`Switched to workspace "${ws.name}".`);
                    }}
                  >
                    Switch to this
                  </Button>
                ) : (
                  <span className="workspace-current-indicator">✓ Current</span>
                )}
                <div className="workspace-card-action-group">
                  <Button size="sm" variant="ghost" onClick={() => openEditModal(ws)}>
                    Edit
                  </Button>
                  <Button
                    disabled={workspaces.length <= 1}
                    size="sm"
                    variant="ghost"
                    className="button-danger"
                    onClick={() => openDeleteModal(ws)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Workspace Modal */}
      {creating && (
        <Modal
          className="modal"
          labelledBy="create-workspace-title"
          onOpenChange={(open) => {
            if (!open) setCreating(false);
          }}
        >
          <header>
            <p className="section-label">Workspace Management</p>
            <h2 id="create-workspace-title">Create Workspace</h2>
          </header>
          <form onSubmit={handleCreate}>
            <label>
              Workspace name
              <Input
                autoFocus
                maxLength={120}
                placeholder="e.g. Mobile App Team, Marketing..."
                required
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </label>

            <label>
              Description <small>Optional</small>
              <Textarea
                maxLength={10000}
                placeholder="Brief description of this workspace"
                rows={2}
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
              />
            </label>

            <div className="form-field-group">
              <span className="field-label">Estimate mode</span>
              <div className="segmented-control" role="radiogroup" aria-label="Estimate mode">
                <label className={createEstimateMode === 'TIME' ? 'selected' : undefined}>
                  <Radio
                    checked={createEstimateMode === 'TIME'}
                    name="createEstimateMode"
                    type="radio"
                    onChange={() => setCreateEstimateMode('TIME')}
                  />
                  <strong>Time</strong>
                  <span>Hours</span>
                </label>
                <label className={createEstimateMode === 'POINTS' ? 'selected' : undefined}>
                  <Radio
                    checked={createEstimateMode === 'POINTS'}
                    name="createEstimateMode"
                    type="radio"
                    onChange={() => setCreateEstimateMode('POINTS')}
                  />
                  <strong>Points</strong>
                  <span>Relative effort</span>
                </label>
              </div>
            </div>

            <label className="number-field">
              <span>Sprint duration</span>
              <Input
                max={90}
                min={1}
                type="number"
                value={createSprintDuration}
                onChange={(e) => setCreateSprintDuration(Number(e.target.value))}
              />
              <span className="unit-label">days</span>
            </label>

            <footer>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button disabled={saving} type="submit" variant="primary">
                {saving ? 'Creating…' : 'Create workspace'}
              </Button>
            </footer>
          </form>
        </Modal>
      )}

      {/* Edit Workspace Modal */}
      {editingWorkspace && (
        <Modal
          className="modal"
          labelledBy="edit-workspace-title"
          onOpenChange={(open) => {
            if (!open) setEditingWorkspace(null);
          }}
        >
          <header>
            <p className="section-label">Workspace Management</p>
            <h2 id="edit-workspace-title">Edit Workspace</h2>
          </header>
          <form onSubmit={handleEdit}>
            <label>
              Workspace name
              <Input
                autoFocus
                maxLength={120}
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </label>

            <label>
              Description <small>Optional</small>
              <Textarea
                maxLength={10000}
                rows={2}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </label>

            <div className="form-field-group">
              <span className="field-label">Estimate mode</span>
              <div className="segmented-control" role="radiogroup" aria-label="Estimate mode">
                <label className={editEstimateMode === 'TIME' ? 'selected' : undefined}>
                  <Radio
                    checked={editEstimateMode === 'TIME'}
                    name="editEstimateMode"
                    type="radio"
                    onChange={() => setEditEstimateMode('TIME')}
                  />
                  <strong>Time</strong>
                  <span>Hours</span>
                </label>
                <label className={editEstimateMode === 'POINTS' ? 'selected' : undefined}>
                  <Radio
                    checked={editEstimateMode === 'POINTS'}
                    name="editEstimateMode"
                    type="radio"
                    onChange={() => setEditEstimateMode('POINTS')}
                  />
                  <strong>Points</strong>
                  <span>Relative effort</span>
                </label>
              </div>
            </div>

            <label className="number-field">
              <span>Sprint duration</span>
              <Input
                max={90}
                min={1}
                type="number"
                value={editSprintDuration}
                onChange={(e) => setEditSprintDuration(Number(e.target.value))}
              />
              <span className="unit-label">days</span>
            </label>

            <footer>
              <Button type="button" variant="ghost" onClick={() => setEditingWorkspace(null)}>
                Cancel
              </Button>
              <Button disabled={saving} type="submit" variant="primary">
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </footer>
          </form>
        </Modal>
      )}

      {/* Delete Workspace Confirmation Modal */}
      {deletingWorkspace && (
        <Modal
          className="modal"
          labelledBy="delete-workspace-title"
          onOpenChange={(open) => {
            if (!open) setDeletingWorkspace(null);
          }}
        >
          <header>
            <p className="section-label">Delete Workspace</p>
            <h2 id="delete-workspace-title">Delete &ldquo;{deletingWorkspace.name}&rdquo;?</h2>
          </header>
          <div>
            <p style={{ marginBottom: '1rem', color: 'var(--foreground-muted)' }}>
              Are you sure you want to delete this workspace? This will permanently delete all board
              columns, sprints, tasks, and subtasks associated with this workspace.
            </p>
            {workspaces.length <= 1 && (
              <p className="muted">You cannot delete the last remaining workspace.</p>
            )}
          </div>
          <footer>
            <Button type="button" variant="ghost" onClick={() => setDeletingWorkspace(null)}>
              Cancel
            </Button>
            <Button
              disabled={saving || workspaces.length <= 1}
              type="button"
              variant="primary"
              className="button-danger-fill"
              onClick={handleDelete}
            >
              {saving ? 'Deleting…' : 'Delete workspace'}
            </Button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
