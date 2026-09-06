'use client';

import { FormEvent, KeyboardEvent, useEffect, useState } from 'react';
import { Button, Input, Modal, Select, Textarea } from './design-system';
import type { ManagedUser } from '../lib/types';

interface QuickEditTitleModalProps {
  open: boolean;
  initialTitle: string;
  itemType?: 'task' | 'subtask';
  onClose: () => void;
  onSave: (newTitle: string) => Promise<void>;
}

export function QuickEditTitleModal({
  open,
  initialTitle,
  itemType = 'task',
  onClose,
  onSave,
}: QuickEditTitleModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(initialTitle);
  }, [initialTitle, open]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSave(trimmed);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const headingId = 'quick-edit-title-heading';

  return (
    <Modal
      className="modal"
      labelledBy={headingId}
      onOpenChange={(isOpen) => {
        if (!isOpen && !saving) onClose();
      }}
    >
      <header>
        <p className="section-label">{itemType === 'task' ? 'Task' : 'Subtask'}</p>
        <h2 id={headingId}>Edit Title</h2>
      </header>

      <form onSubmit={handleSubmit}>
        <label>
          Title
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter title..."
            maxLength={240}
            required
            autoFocus
            disabled={saving}
          />
        </label>

        <footer>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving || !title.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}

interface QuickEditDescriptionModalProps {
  open: boolean;
  initialDescription: string;
  itemType?: 'task' | 'subtask';
  onClose: () => void;
  onSave: (newDescription: string) => Promise<void>;
}

export function QuickEditDescriptionModal({
  open,
  initialDescription,
  itemType = 'task',
  onClose,
  onSave,
}: QuickEditDescriptionModalProps) {
  const [description, setDescription] = useState(initialDescription);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDescription(initialDescription);
  }, [initialDescription, open]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await onSave(description.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void handleSubmit(event as unknown as FormEvent<HTMLFormElement>);
    }
  }

  const headingId = 'quick-edit-desc-heading';

  return (
    <Modal
      className="modal"
      labelledBy={headingId}
      onOpenChange={(isOpen) => {
        if (!isOpen && !saving) onClose();
      }}
    >
      <header>
        <p className="section-label">{itemType === 'task' ? 'Task' : 'Subtask'}</p>
        <h2 id={headingId}>Edit Description</h2>
      </header>

      <form onSubmit={handleSubmit}>
        <label>
          Description <small>Press Ctrl+Enter to save</small>
          <Textarea
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add or update description..."
            maxLength={50000}
            autoFocus
            disabled={saving}
          />
        </label>

        <footer>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}

interface QuickEditAssigneeModalProps {
  open: boolean;
  currentAssigneeId: string | null;
  users: ManagedUser[];
  itemType?: 'task' | 'subtask';
  onClose: () => void;
  onSave: (assigneeId: string | null) => Promise<void>;
}

export function QuickEditAssigneeModal({
  open,
  currentAssigneeId,
  users,
  itemType = 'subtask',
  onClose,
  onSave,
}: QuickEditAssigneeModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(currentAssigneeId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelectedId(currentAssigneeId);
  }, [currentAssigneeId, open]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await onSave(selectedId);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const headingId = 'quick-edit-assignee-heading';

  return (
    <Modal
      className="modal"
      labelledBy={headingId}
      onOpenChange={(isOpen) => {
        if (!isOpen && !saving) onClose();
      }}
    >
      <header>
        <p className="section-label">{itemType === 'task' ? 'Task' : 'Subtask'}</p>
        <h2 id={headingId}>Edit Assignee</h2>
      </header>

      <form onSubmit={handleSubmit}>
        <label>
          Assignee
          <Select
            value={selectedId ?? ''}
            onChange={(event) => setSelectedId(event.target.value || null)}
            disabled={saving}
          >
            <option value="">Unassigned</option>
            {users.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </Select>
        </label>

        <footer>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
