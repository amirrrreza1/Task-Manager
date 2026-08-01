'use client';

import { Button, Input, Modal, Select } from '../../../../components/design-system';

import { FormEvent, type PropsWithChildren, useCallback, useEffect, useMemo, useState } from 'react';
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
import { AuthGate } from '../../../../components/auth-gate';
import { useAuth } from '../../../../components/auth-provider';
import type { BoardColumn } from '../../../../lib/types';

interface ColumnForm {
  id?: string;
  name: string;
  color: string;
}

const COLUMN_COLORS = [
  { value: '#64748B', label: 'Slate' },
  { value: '#2563EB', label: 'Blue' },
  { value: '#0284C7', label: 'Sky' },
  { value: '#7C3AED', label: 'Violet' },
  { value: '#C026D3', label: 'Fuchsia' },
  { value: '#E11D48', label: 'Rose' },
  { value: '#EA580C', label: 'Orange' },
  { value: '#D97706', label: 'Amber' },
  { value: '#059669', label: 'Emerald' },
  { value: '#0F766E', label: 'Teal' },
] as const;

function BoardSettings() {
  const { request } = useAuth();
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [form, setForm] = useState<ColumnForm | null>(null);
  const [deleting, setDeleting] = useState<BoardColumn | null>(null);
  const [destination, setDestination] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const workflowColumns = useMemo(
    () => columns.filter((column) => !column.isBacklog),
    [columns],
  );
  const todoColumn = workflowColumns.find((column) => column.isTodo);
  const doneColumn = workflowColumns.find((column) => column.isDone);
  const reorderableColumns = workflowColumns.filter(
    (column) => !column.isTodo && !column.isDone,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    try {
      setColumns(await request<BoardColumn[]>('/board-columns'));
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load board columns.');
    }
  }, [request]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    setError('');
    try {
      await request(form.id ? `/board-columns/${form.id}` : '/board-columns', {
        method: form.id ? 'PATCH' : 'POST',
        body: JSON.stringify({ name: form.name, color: form.color }),
      });
      setForm(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the column.');
    } finally {
      setBusy(false);
    }
  }

  function finishColumnDrag(event: DragEndEvent) {
    if (!event.over || busy) return;
    const activeId = String(event.active.id).replace(/^column:/, '');
    const overId = String(event.over.id).replace(/^column:/, '');
    const oldIndex = reorderableColumns.findIndex((column) => column.id === activeId);
    const newIndex = reorderableColumns.findIndex((column) => column.id === overId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    void saveColumnOrder(arrayMove(reorderableColumns, oldIndex, newIndex));
  }

  async function saveColumnOrder(reorderedColumns: BoardColumn[]) {
    if (busy) return;
    const previous = columns;
    const reordered = [
      ...columns.filter((column) => column.isBacklog),
      ...(todoColumn ? [todoColumn] : []),
      ...reorderedColumns,
      ...(doneColumn ? [doneColumn] : []),
    ];
    setColumns(reordered);
    setBusy(true);
    setError('');
    try {
      setColumns(
        await request<BoardColumn[]>('/board-columns/reorder', {
          method: 'POST',
          body: JSON.stringify({ columnIds: reordered.map((column) => column.id) }),
        }),
      );
    } catch (caught) {
      setColumns(previous);
      setError(caught instanceof Error ? caught.message : 'Could not reorder columns.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError('');
    try {
      await request<void>(
        `/board-columns/${deleting.id}${destination ? `?moveTasksTo=${destination}` : ''}`,
        { method: 'DELETE' },
      );
      setDeleting(null);
      setDestination('');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete the column.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack settings-layout">
      <header className="page-header compact-header">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Board workflow</h1>
          <p className="muted">
            To Do and Done are fixed endpoints. Drag the columns between them to shape your
            team&apos;s workflow.
          </p>
        </div>
        <Button
          variant="primary"
          type="button"
          onClick={() => setForm({ name: '', color: COLUMN_COLORS[0].value })}
        >
          Add column
        </Button>
      </header>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={finishColumnDrag}
      >
        <SortableContext
          items={reorderableColumns.map((column) => `column:${column.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <section className="workflow-settings" aria-label="Board workflow">
            {todoColumn ? <WorkflowEndpoint column={todoColumn} position="start" /> : null}
            <div className="workflow-reorder-zone">
              <header className="workflow-reorder-header">
                <div>
                  <p className="section-label">Your workflow</p>
                  <h2>Drag columns to reorder</h2>
                </div>
                <span className="workflow-drag-hint">Drag &amp; drop</span>
              </header>
              <div
                className="column-settings-list"
                aria-describedby="workflow-reorder-help"
                aria-label="Reorderable workflow columns"
              >
                {reorderableColumns.map((column, index) => (
                  <SortableColumnShell
                    id={column.id}
                    name={column.name}
                    disabled={busy}
                    key={column.id}
                  >
                    <article
                      className="column-settings-row"
                      onPointerDown={(event) => {
                        const target = event.target as HTMLElement;
                        if (target.closest('button, input, select, label, a')) {
                          event.stopPropagation();
                        }
                      }}
                    >
                      <span
                        className="column-color-large"
                        style={{ background: column.color }}
                        aria-hidden="true"
                      />
                      <div>
                        <strong>{column.name}</strong>
                        <small>Workflow position {index + 1}</small>
                      </div>
                      <span className="workflow-drag-handle" aria-hidden="true">
                        ::
                      </span>
                      <div className="row-actions">
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={() =>
                            setForm({
                              id: column.id,
                              name: column.name,
                              color: column.color.slice(0, 7),
                            })
                          }
                        >
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          type="button"
                          onClick={() => {
                            setDeleting(column);
                            setDestination(
                              workflowColumns.find((item) => item.id !== column.id)?.id ?? '',
                            );
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </article>
                  </SortableColumnShell>
                ))}
                {reorderableColumns.length === 0 ? (
                  <p className="empty-workflow-columns">
                    Add a column to create the steps between To Do and Done.
                  </p>
                ) : null}
              </div>
              <p className="workflow-reorder-help" id="workflow-reorder-help">
                Drag a workflow column anywhere within this area to change its position.
              </p>
            </div>
            {doneColumn ? <WorkflowEndpoint column={doneColumn} position="end" /> : null}
          </section>
        </SortableContext>
      </DndContext>
      <p className="settings-note">
        To Do is always first and Done is always last. Both are locked. New columns are added
        to the middle area, and tasks in a deleted column move to the destination you select.
      </p>

      {form ? (
        <Modal
          className="modal"
          labelledBy="column-modal-title"
          onOpenChange={(open) => {
            if (!open) setForm(null);
          }}
        >
          <header>
            <p className="section-label">Workflow</p>
            <h2 id="column-modal-title">{form.id ? 'Edit column' : 'Add column'}</h2>
          </header>
          <form onSubmit={save}>
            <label>
              Name
              <Input
                autoFocus
                required
                maxLength={80}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <fieldset className="column-color-picker">
              <legend>Color</legend>
              <div className="column-color-options" role="radiogroup" aria-label="Column color">
                {COLUMN_COLORS.map((color) => (
                  <button
                    aria-checked={form.color === color.value}
                    className={form.color === color.value ? 'selected' : undefined}
                    key={color.value}
                    onClick={() => setForm({ ...form, color: color.value })}
                    role="radio"
                    style={{ color: color.value }}
                    title={color.label}
                    type="button"
                  >
                    <span aria-hidden="true" />
                    <span className="visually-hidden">{color.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <footer>
              <Button variant="ghost" type="button" onClick={() => setForm(null)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={busy} type="submit">
                Save column
              </Button>
            </footer>
          </form>
        </Modal>
      ) : null}

      {deleting ? (
        <Modal
          className="modal"
          labelledBy="delete-column-title"
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
        >
          <header>
            <p className="section-label">Destructive action</p>
            <h2 id="delete-column-title">Delete {deleting.name}?</h2>
          </header>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void remove();
            }}
          >
            <p className="muted">Any tasks in this column will be moved atomically.</p>
            <label>
              Move tasks to
              <Select
                required
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
              >
                {workflowColumns
                  .filter((column) => column.id !== deleting.id)
                  .map((column) => (
                    <option value={column.id} key={column.id}>
                      {column.name}
                    </option>
                  ))}
              </Select>
            </label>
            <footer>
              <Button variant="ghost" type="button" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={busy} type="submit">
                Delete column
              </Button>
            </footer>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function WorkflowEndpoint({
  column,
  position,
}: {
  column: BoardColumn;
  position: 'start' | 'end';
}) {
  const isStart = position === 'start';
  return (
    <article className={`workflow-endpoint workflow-endpoint--${position}`}>
      <div className="workflow-endpoint-heading">
        <span
          className="column-color-large"
          style={{ background: column.color }}
          aria-hidden="true"
        />
        <div>
          <strong>{column.name}</strong>
          <small>{isStart ? 'First workflow column' : 'Final workflow column'}</small>
        </div>
      </div>
      <div className="workflow-endpoint-status">
        <span className={`status-pill${isStart ? '' : ' done'}`}>
          {isStart ? 'To Do' : 'Done'}
        </span>
        <span className="fixed-column-label">Locked endpoint</span>
      </div>
    </article>
  );
}

function SortableColumnShell({
  id,
  name,
  disabled,
  children,
}: PropsWithChildren<{ id: string; name: string; disabled: boolean }>) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: `column:${id}`,
    disabled,
  });
  const { role, ...columnDragAttributes } = attributes;
  void role;
  return (
    <div
      ref={setNodeRef}
      className={`sortable-column-shell column-settings-row--draggable ${isDragging ? 'is-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      title={disabled ? undefined : `Drag ${name}`}
      aria-label={
        disabled
          ? undefined
          : `Column ${name}. Drag from anywhere on the row to reorder. Use arrow keys while dragging to choose a position.`
      }
      {...(disabled ? {} : { ...columnDragAttributes, ...listeners })}
    >
      {children}
    </div>
  );
}

export default function BoardSettingsPage() {
  return (
    <AuthGate admin>
      <BoardSettings />
    </AuthGate>
  );
}
