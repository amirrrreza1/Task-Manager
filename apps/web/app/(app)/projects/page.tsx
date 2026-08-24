'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { HeaderActions } from '../../../components/header-actions';
import { useAuth } from '../../../components/auth-provider';
import { useWorkspace } from '../../../components/workspace-provider';
import { Avatar } from '../../../components/avatar';
import { Button, Checkbox, Input, Modal, Textarea } from '../../../components/design-system';
import {
  PROJECT_COLORS,
  ProjectLookModal,
  ProjectLookTrigger,
} from '../../../components/project-look-picker';
import { DEFAULT_PROJECT_ICON, ProjectIcon } from '../../../lib/project-icons';
import type { Project, UserSummary } from '../../../lib/types';

type LookEditor =
  | { source: 'create' }
  | { source: 'edit' }
  | { source: 'card'; project: Project; color: string; icon: string };

export default function ProjectsPage() {
  const { request } = useAuth();
  const { currentWorkspace } = useWorkspace();

  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [lookEditor, setLookEditor] = useState<LookEditor | null>(null);

  const [createName, setCreateName] = useState('');
  const [createKey, setCreateKey] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createColor, setCreateColor] = useState<string>(PROJECT_COLORS[0].value);
  const [createIcon, setCreateIcon] = useState(DEFAULT_PROJECT_ICON);
  const [createSeniorUserIds, setCreateSeniorUserIds] = useState<string[]>([]);

  const [editName, setEditName] = useState('');
  const [editKey, setEditKey] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editColor, setEditColor] = useState<string>(PROJECT_COLORS[0].value);
  const [editIcon, setEditIcon] = useState(DEFAULT_PROJECT_ICON);
  const [editSeniorUserIds, setEditSeniorUserIds] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const wsParam = currentWorkspace?.id ? `?workspaceId=${currentWorkspace.id}` : '';
      const [items, userList] = await Promise.all([
        request<Project[]>(`/projects${wsParam}`),
        request<UserSummary[]>('/users'),
      ]);
      setProjects(items);
      setUsers(userList.filter((user) => user.isActive));
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
    setCreateIcon(DEFAULT_PROJECT_ICON);
    setCreateSeniorUserIds([]);
    setLookEditor(null);
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
    setEditIcon(proj.icon ?? DEFAULT_PROJECT_ICON);
    setEditSeniorUserIds((proj.seniors ?? []).map((s) => s.user.id));
    setLookEditor(null);
    setError('');
    setMessage('');
  };

  const openDeleteModal = (proj: Project) => {
    setDeletingProject(proj);
    setError('');
    setMessage('');
  };

  function openCardLook(proj: Project) {
    setLookEditor({
      source: 'card',
      project: proj,
      color: proj.color ?? PROJECT_COLORS[0].value,
      icon: proj.icon ?? DEFAULT_PROJECT_ICON,
    });
  }

  async function closeLook() {
    if (lookEditor?.source === 'card') {
      try {
        const updated = await request<Project>(`/projects/${lookEditor.project.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ color: lookEditor.color, icon: lookEditor.icon }),
        });
        setProjects((current) =>
          current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
        );
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not update project look.');
      }
    }
    setLookEditor(null);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!createName.trim()) return;
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        name: createName.trim(),
        color: createColor,
        icon: createIcon,
        seniorUserIds: createSeniorUserIds,
      };
      if (createKey.trim()) payload.key = createKey.trim();
      if (createDescription.trim()) payload.description = createDescription.trim();
      if (currentWorkspace?.id) payload.workspaceId = currentWorkspace.id;

      const created = await request<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setCreating(false);
      setLookEditor(null);
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
        icon: editIcon,
        seniorUserIds: editSeniorUserIds,
      };

      const updated = await request<Project>(`/projects/${editingProject.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setEditingProject(null);
      setLookEditor(null);
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

  const lookName =
    lookEditor?.source === 'create'
      ? createName
      : lookEditor?.source === 'edit'
        ? editName
        : (lookEditor?.project.name ?? '');
  const lookColor =
    lookEditor?.source === 'create'
      ? createColor
      : lookEditor?.source === 'edit'
        ? editColor
        : (lookEditor?.color ?? PROJECT_COLORS[0].value);
  const lookIcon =
    lookEditor?.source === 'create'
      ? createIcon
      : lookEditor?.source === 'edit'
        ? editIcon
        : (lookEditor?.icon ?? DEFAULT_PROJECT_ICON);

  return (
    <div className="page-stack">
      <HeaderActions>
        <Button variant="primary" onClick={openCreateModal} type="button">
          + New Project
        </Button>
      </HeaderActions>

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
        <div className="empty-state page-empty">
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
                      <ProjectIcon className="project-badge-icon" name={proj.icon} />
                      {proj.key ? proj.key : proj.name.slice(0, 3).toUpperCase()}
                    </span>
                    <span className="project-task-count">
                      {proj._count?.tasks ?? 0} {proj._count?.tasks === 1 ? 'task' : 'tasks'}
                    </span>
                  </div>
                  <button
                    className="project-card-title"
                    type="button"
                    onClick={() => openCardLook(proj)}
                  >
                    {proj.name}
                  </button>
                  <p className="project-card-desc">
                    {proj.description || 'No description provided.'}
                  </p>
                  <div className="project-card-seniors">
                    <span className="project-seniors-label">Seniors</span>
                    {proj.seniors && proj.seniors.length > 0 ? (
                      <div className="project-seniors-list">
                        {proj.seniors.map((s) => (
                          <span key={s.user.id} className="project-senior-item">
                            <Avatar
                              color={s.user.color}
                              hasAvatar={s.user.hasAvatar}
                              name={s.user.displayName}
                              size={20}
                              userId={s.user.id}
                            />
                            <span>{s.user.displayName}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="project-senior-none">No seniors assigned</span>
                    )}
                  </div>
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

      {creating && (
        <Modal
          className="modal"
          labelledBy="create-project-title"
          onOpenChange={(open) => {
            if (!open) {
              setCreating(false);
              setLookEditor(null);
            }
          }}
        >
          <header>
            <p className="section-label">Project Management</p>
            <h2 id="create-project-title">Create Project</h2>
          </header>
          <form onSubmit={handleCreate}>
            <label>
              Project name
              <div className="project-name-row">
                <ProjectLookTrigger
                  name={createName}
                  color={createColor}
                  icon={createIcon}
                  onClick={() => setLookEditor({ source: 'create' })}
                />
                <Input
                  autoFocus
                  maxLength={120}
                  placeholder="e.g. Website Redesign, Mobile App..."
                  required
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                />
              </div>
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

            {users.length > 0 && (
              <fieldset className="assignee-picker">
                <legend>Project Seniors</legend>
                {users.map((member) => (
                  <label key={member.id}>
                    <Checkbox
                      checked={createSeniorUserIds.includes(member.id)}
                      onChange={(event) =>
                        setCreateSeniorUserIds(
                          event.target.checked
                            ? [...createSeniorUserIds, member.id]
                            : createSeniorUserIds.filter((userId) => userId !== member.id),
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
            )}

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

      {editingProject && (
        <Modal
          className="modal"
          labelledBy="edit-project-title"
          onOpenChange={(open) => {
            if (!open) {
              setEditingProject(null);
              setLookEditor(null);
            }
          }}
        >
          <header>
            <p className="section-label">Project Management</p>
            <h2 id="edit-project-title">Edit Project</h2>
          </header>
          <form onSubmit={handleEdit}>
            <label>
              Project name
              <div className="project-name-row">
                <ProjectLookTrigger
                  name={editName}
                  color={editColor}
                  icon={editIcon}
                  onClick={() => setLookEditor({ source: 'edit' })}
                />
                <Input
                  autoFocus
                  maxLength={120}
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
            </label>

            <label>
              Key <small>Optional short identifier (e.g. WEB, MOB)</small>
              <Input
                maxLength={16}
                value={editKey}
                onChange={(e) => setEditKey(e.target.value.toUpperCase())}
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

            {users.length > 0 && (
              <fieldset className="assignee-picker">
                <legend>Project Seniors</legend>
                {users.map((member) => (
                  <label key={member.id}>
                    <Checkbox
                      checked={editSeniorUserIds.includes(member.id)}
                      onChange={(event) =>
                        setEditSeniorUserIds(
                          event.target.checked
                            ? [...editSeniorUserIds, member.id]
                            : editSeniorUserIds.filter((userId) => userId !== member.id),
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
            )}

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

      {lookEditor ? (
        <ProjectLookModal
          name={lookName}
          color={lookColor}
          icon={lookIcon}
          onClose={() => void closeLook()}
          onChange={({ color, icon }) => {
            if (lookEditor.source === 'create') {
              setCreateColor(color);
              setCreateIcon(icon);
              return;
            }
            if (lookEditor.source === 'edit') {
              setEditColor(color);
              setEditIcon(icon);
              return;
            }
            setLookEditor({ ...lookEditor, color, icon });
          }}
        />
      ) : null}
    </div>
  );
}
