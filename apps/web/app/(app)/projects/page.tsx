'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../components/auth-provider';
import { useWorkspace } from '../../../components/workspace-provider';
import { Button, Input, Modal, Textarea } from '../../../components/design-system';
import type { Project } from '../../../lib/types';

const PROJECT_COLORS = [
  { value: '#2563EB', label: 'Blue' },
  { value: '#0284C7', label: 'Sky' },
  { value: '#059669', label: 'Emerald' },
  { value: '#10B981', label: 'Green' },
  { value: '#7C3AED', label: 'Violet' },
  { value: '#C026D3', label: 'Fuchsia' },
  { value: '#E11D48', label: 'Rose' },
  { value: '#EA580C', label: 'Orange' },
  { value: '#D97706', label: 'Amber' },
  { value: '#64748B', label: 'Slate' },
] as const;

export default function ProjectsPage() {
  const { request } = useAuth();
  const { currentWorkspace } = useWorkspace();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);

  // Create form state
  const [createName, setCreateName] = useState('');
  const [createKey, setCreateKey] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createColor, setCreateColor] = useState<string>(PROJECT_COLORS[0].value);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editKey, setEditKey] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editColor, setEditColor] = useState<string>(PROJECT_COLORS[0].value);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const wsParam = currentWorkspace?.id ? `?workspaceId=${currentWorkspace.id}` : '';
      const items = await request<Project[]>(`/projects${wsParam}`);
      setProjects(items);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load projects.');
    } finally {
      setLoading(false);
    }
  }, [request, currentWorkspace?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreateModal = () => {
    setCreateName('');
    setCreateKey('');
    setCreateDescription('');
    setCreateColor(PROJECT_COLORS[0].value);
    setError('');
    setMessage('');
    setCreating(true);
  };

  const openEditModal = (proj: Project) => {
    setEditingProject(proj);
    setEditName(proj.name);
    setEditKey(proj.key ?? '');
    setEditDescription(proj.description ?? '');
    setEditColor(proj.color ?? PROJECT_COLORS[0].value);
    setError('');
    setMessage('');
  };

  const openDeleteModal = (proj: Project) => {
    setDeletingProject(proj);
    setError('');
    setMessage('');
  };

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!createName.trim()) return;
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        name: createName.trim(),
        color: createColor,
      };
      if (createKey.trim()) payload.key = createKey.trim();
      if (createDescription.trim()) payload.description = createDescription.trim();
      if (currentWorkspace?.id) payload.workspaceId = currentWorkspace.id;

      const created = await request<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setCreating(false);
      setProjects((current) => [...current, created]);
      setMessage(`Project "${created.name}" created successfully.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create project.');
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingProject || !editName.trim()) return;
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        name: editName.trim(),
        key: editKey.trim() || null,
        description: editDescription.trim() || null,
        color: editColor,
      };

      const updated = await request<Project>(`/projects/${editingProject.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setEditingProject(null);
      setProjects((current) =>
        current.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
      );
      setMessage(`Project "${updated.name}" updated successfully.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update project.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deletingProject) return;
    setSaving(true);
    setError('');
    try {
      await request(`/projects/${deletingProject.id}`, {
        method: 'DELETE',
      });
      const deletedId = deletingProject.id;
      setDeletingProject(null);
      setProjects((current) => current.filter((p) => p.id !== deletedId));
      setMessage(`Project "${deletingProject.name}" deleted.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete project.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Projects</h1>
          <p className="muted">
            Organize tasks into projects within {currentWorkspace?.name ?? 'this workspace'}.
          </p>
        </div>
        <div className="header-actions">
          <Button variant="primary" onClick={openCreateModal} type="button">
            + New Project
          </Button>
        </div>
      </header>

      {error ? (
        <p className="form-error inline-alert" role="alert">
          {error}
        </p>
      ) : null}

      {message ? (
        <p className="form-success inline-alert" role="status">
          {message}
        </p>
      ) : null}

      {projects.length === 0 && !loading ? (
        <div className="empty-state">
          <p>No projects found in this workspace yet.</p>
          <Button size="sm" variant="outline" onClick={openCreateModal}>
            Create your first project
          </Button>
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map((proj) => {
            const projectColor = proj.color || '#2563EB';
            return (
              <div key={proj.id} className="project-card">
                <div className="project-card-header">
                  <div className="project-card-badge-row">
                    <span
                      className="project-badge"
                      style={{
                        backgroundColor: `${projectColor}20`,
                        color: projectColor,
                        borderColor: `${projectColor}40`,
                      }}
                    >
                      {proj.key ? proj.key : proj.name.slice(0, 3).toUpperCase()}
                    </span>
                    <span className="project-task-count">
                      {proj._count?.tasks ?? 0} {proj._count?.tasks === 1 ? 'task' : 'tasks'}
                    </span>
                  </div>
                  <h2 className="project-card-title">{proj.name}</h2>
                  <p className="project-card-desc">
                    {proj.description || 'No description provided.'}
                  </p>
                </div>

                <div className="project-card-actions">
                  <Link className="project-board-link" href={`/board?projectId=${proj.id}`}>
                    View on Board →
                  </Link>
                  <div className="project-card-action-group">
                    <Button size="sm" variant="ghost" onClick={() => openEditModal(proj)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="button-danger"
                      onClick={() => openDeleteModal(proj)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Project Modal */}
      {creating && (
        <Modal
          className="modal"
          labelledBy="create-project-title"
          onOpenChange={(open) => {
            if (!open) setCreating(false);
          }}
        >
          <header>
            <p className="section-label">Project Management</p>
            <h2 id="create-project-title">Create Project</h2>
          </header>
          <form onSubmit={handleCreate}>
            <label>
              Project name
              <Input
                autoFocus
                maxLength={120}
                placeholder="e.g. Website Redesign, Mobile App..."
                required
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </label>

            <label>
              Key <small>Optional short identifier (e.g. WEB, MOB)</small>
              <Input
                maxLength={16}
                placeholder="e.g. WEB"
                value={createKey}
                onChange={(e) => setCreateKey(e.target.value.toUpperCase())}
              />
            </label>

            <div className="form-field-group">
              <span className="field-label">Color theme</span>
              <div className="color-swatch-picker">
                {PROJECT_COLORS.map((col) => (
                  <button
                    key={col.value}
                    type="button"
                    className={`color-swatch-button ${createColor === col.value ? 'selected' : ''}`}
                    style={{ backgroundColor: col.value }}
                    title={col.label}
                    onClick={() => setCreateColor(col.value)}
                  />
                ))}
              </div>
            </div>

            <label>
              Description <small>Optional</small>
              <Textarea
                maxLength={10000}
                placeholder="Brief summary of what this project covers..."
                rows={2}
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
              />
            </label>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <footer>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button disabled={saving} type="submit" variant="primary">
                {saving ? 'Creating…' : 'Create project'}
              </Button>
            </footer>
          </form>
        </Modal>
      )}

      {/* Edit Project Modal */}
      {editingProject && (
        <Modal
          className="modal"
          labelledBy="edit-project-title"
          onOpenChange={(open) => {
            if (!open) setEditingProject(null);
          }}
        >
          <header>
            <p className="section-label">Project Management</p>
            <h2 id="edit-project-title">Edit Project</h2>
          </header>
          <form onSubmit={handleEdit}>
            <label>
              Project name
              <Input
                autoFocus
                maxLength={120}
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </label>

            <label>
              Key <small>Optional short identifier (e.g. WEB, MOB)</small>
              <Input
                maxLength={16}
                value={editKey}
                onChange={(e) => setEditKey(e.target.value.toUpperCase())}
              />
            </label>

            <div className="form-field-group">
              <span className="field-label">Color theme</span>
              <div className="color-swatch-picker">
                {PROJECT_COLORS.map((col) => (
                  <button
                    key={col.value}
                    type="button"
                    className={`color-swatch-button ${editColor === col.value ? 'selected' : ''}`}
                    style={{ backgroundColor: col.value }}
                    title={col.label}
                    onClick={() => setEditColor(col.value)}
                  />
                ))}
              </div>
            </div>

            <label>
              Description <small>Optional</small>
              <Textarea
                maxLength={10000}
                rows={2}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </label>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <footer>
              <Button type="button" variant="ghost" onClick={() => setEditingProject(null)}>
                Cancel
              </Button>
              <Button disabled={saving} type="submit" variant="primary">
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </footer>
          </form>
        </Modal>
      )}

      {/* Delete Project Modal */}
      {deletingProject && (
        <Modal
          className="modal"
          labelledBy="delete-project-title"
          onOpenChange={(open) => {
            if (!open) setDeletingProject(null);
          }}
        >
          <header>
            <p className="section-label">Delete Project</p>
            <h2 id="delete-project-title">Delete &ldquo;{deletingProject.name}&rdquo;?</h2>
          </header>
          <div>
            <p style={{ marginBottom: '1rem', color: 'var(--foreground-muted)' }}>
              Are you sure you want to delete this project? Tasks in this project will not be
              deleted; they will simply become unassigned to any project.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <footer>
            <Button type="button" variant="ghost" onClick={() => setDeletingProject(null)}>
              Cancel
            </Button>
            <Button
              disabled={saving}
              type="button"
              variant="primary"
              className="button-danger-fill"
              onClick={handleDelete}
            >
              {saving ? 'Deleting…' : 'Delete project'}
            </Button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
