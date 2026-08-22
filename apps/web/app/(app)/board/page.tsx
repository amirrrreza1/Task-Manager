'use client';

import { Button, Checkbox, Input, Select } from '../../../components/design-system';

import Link from 'next/link';
import { Fragment, type PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
import {
  closestCorners,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  defaultDropAnimationSideEffects,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DropAnimation,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Avatar } from '../../../components/avatar';
import { useAuth } from '../../../components/auth-provider';
import { useToast } from '../../../components/toast-provider';
import { useWorkspace } from '../../../components/workspace-provider';
import { HeaderActions } from '../../../components/header-actions';
import { PriorityBadge, PrioritySelect } from '../../../components/priority-badge';
import { ProjectIcon } from '../../../lib/project-icons';
import { isTaskPriority } from '../../../lib/priority';
import type {
  BoardResponse,
  BoardSubtask,
  ManagedUser,
  Project,
  TaskCard,
  TaskPriority,
} from '../../../lib/types';
import { workflowBoard } from '../../../lib/board-columns';
import { taskDropIndex } from '../../../lib/board-dnd';

type ActiveDrag =
  | { type: 'task'; task: TaskCard }
  | {
      type: 'subtask';
      subtask: BoardSubtask;
      taskId: string;
      taskTitle: string;
      standalone: boolean;
    };

interface TaskDropPreview {
  columnId: string;
  index: number;
}

const dropAnimation: DropAnimation = {
  duration: 220,
  easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: '0.35' } },
  }),
};

const boardCollisionDetection: CollisionDetection = (arguments_) => {
  const pointerCollisions = pointerWithin(arguments_);
  const activeType = arguments_.active.data.current?.type;
  const directWorkItem =
    activeType === 'task'
      ? pointerCollisions.find(
          (collision) =>
            collision.id !== arguments_.active.id && String(collision.id).startsWith('task:'),
        )
      : activeType === 'subtask'
        ? (pointerCollisions.find((collision) => String(collision.id).startsWith('subtask:')) ??
          pointerCollisions.find((collision) => String(collision.id).startsWith('task:')))
        : pointerCollisions.find((collision) => !String(collision.id).startsWith('column:'));
  if (directWorkItem) return [directWorkItem];

  const columnCollision = pointerCollisions.find((collision) =>
    String(collision.id).startsWith('column:'),
  );
  if (columnCollision) {
    const hoveredColumn = arguments_.droppableContainers.find(
      (container) => container.id === columnCollision.id,
    );
    const columnId = hoveredColumn?.data.current?.columnId;
    const workItemsInColumn = arguments_.droppableContainers.filter(
      (container) =>
        container.id !== columnCollision.id &&
        container.id !== arguments_.active.id &&
        container.data.current?.columnId === columnId &&
        (activeType !== 'task' || String(container.id).startsWith('task:')),
    );
    const nearestWorkItem = closestCorners({
      ...arguments_,
      droppableContainers: workItemsInColumn,
    });
    return nearestWorkItem.length ? nearestWorkItem : [columnCollision];
  }

  return closestCorners({
    ...arguments_,
    droppableContainers:
      activeType === 'task'
        ? arguments_.droppableContainers.filter(
            (container) => container.id !== arguments_.active.id,
          )
        : arguments_.droppableContainers,
  });
};

interface Filters {
  search: string;
  assigneeId: string;
  projectId: string;
  unassigned: boolean;
  mine: boolean;
  estimate: '' | 'true' | 'false';
  priority: TaskPriority | '';
}

const emptyFilters: Filters = {
  search: '',
  assigneeId: '',
  projectId: '',
  unassigned: false,
  mine: false,
  estimate: '',
  priority: '',
};

export default function BoardPage() {
  const { user, request } = useAuth();
  const toast = useToast();
  const { currentWorkspace } = useWorkspace();
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [taskDropPreview, setTaskDropPreview] = useState<TaskDropPreview | null>(null);
  const taskDropPreviewRef = useRef<TaskDropPreview | null>(null);
  const dragOriginBoard = useRef<BoardResponse | null>(null);
  const suppressClickRef = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function armClickSuppression() {
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 250);
  }

  function guardCardNavigation(event: { preventDefault(): void; stopPropagation(): void }) {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function updateTaskDropPreview(next: TaskDropPreview | null) {
    taskDropPreviewRef.current = next;
    setTaskDropPreview((current) =>
      current?.columnId === next?.columnId && current?.index === next?.index ? current : next,
    );
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mine = params.get('mine') === 'true';
    const estimated = params.get('hasEstimate');
    const priority = params.get('priority') ?? '';
    setFilters({
      search: params.get('search') ?? '',
      assigneeId: mine ? '' : (params.get('assigneeId') ?? ''),
      projectId: params.get('projectId') ?? '',
      unassigned: !mine && params.get('unassigned') === 'true',
      mine,
      estimate: estimated === 'true' || estimated === 'false' ? estimated : '',
      priority: isTaskPriority(priority) ? priority : '',
    });
  }, []);

  const load = useCallback(async () => {
    if (filters.mine && !user?.id) return;

    const browserParams = new URLSearchParams();
    const apiParams = new URLSearchParams();
    if (currentWorkspace?.id) {
      apiParams.set('workspaceId', currentWorkspace.id);
    }
    if (filters.search.trim()) {
      browserParams.set('search', filters.search.trim());
      apiParams.set('search', filters.search.trim());
    }
    if (filters.projectId) {
      browserParams.set('projectId', filters.projectId);
      apiParams.set('projectId', filters.projectId);
    }
    if (filters.mine && user?.id) {
      browserParams.set('mine', 'true');
      apiParams.set('assigneeId', user.id);
    } else if (filters.assigneeId) {
      browserParams.set('assigneeId', filters.assigneeId);
      apiParams.set('assigneeId', filters.assigneeId);
    }
    if (filters.unassigned) {
      browserParams.set('unassigned', 'true');
      apiParams.set('unassigned', 'true');
    }
    if (filters.estimate) {
      browserParams.set('hasEstimate', filters.estimate);
      apiParams.set('hasEstimate', filters.estimate);
    }
    if (filters.priority) {
      browserParams.set('priority', filters.priority);
      apiParams.set('priority', filters.priority);
    }
    const browserQuery = browserParams.toString();
    const apiQuery = apiParams.toString();
    window.history.replaceState(null, '', browserQuery ? `/board?${browserQuery}` : '/board');
    setLoadFailed(false);
    try {
      const wsParam = currentWorkspace?.id ? `?workspaceId=${currentWorkspace.id}` : '';
      const [nextBoard, nextUsers, nextProjects] = await Promise.all([
        request<BoardResponse>(`/board${apiQuery ? `?${apiQuery}` : ''}`),
        request<ManagedUser[]>('/users'),
        request<Project[]>(`/projects${wsParam}`),
      ]);
      setBoard(workflowBoard(nextBoard));
      setUsers(nextUsers.filter((member) => member.isActive));
      setProjects(nextProjects);
      setLoadFailed(false);
    } catch (caught) {
      setLoadFailed(true);
      toast.fromError(caught, 'Could not load the board.');
    }
  }, [filters, request, user?.id, currentWorkspace?.id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function moveTask(task: TaskCard, targetColumnIndex: number, targetIndex: number) {
    if (!board || busy) return;
    const targetColumn = board.columns[targetColumnIndex];
    const candidates = targetColumn.tasks.filter((item) => item.id !== task.id);
    const safeIndex = Math.max(0, Math.min(targetIndex, candidates.length));
    const beforeTaskId = candidates[safeIndex - 1]?.id;
    const afterTaskId = candidates[safeIndex]?.id;
    const previousBoard = dragOriginBoard.current ?? board;
    setBoard({
      ...board,
      columns: board.columns.map((column, index) => {
        if (index === targetColumnIndex) {
          return {
            ...column,
            tasks: [
              ...candidates.slice(0, safeIndex),
              { ...task, columnId: targetColumn.id },
              ...candidates.slice(safeIndex),
            ],
          };
        }
        return {
          ...column,
          tasks: column.tasks.filter((item) => item.id !== task.id),
        };
      }),
    });
    setBusy(true);
    try {
      await request(`/tasks/${task.id}/move`, {
        method: 'POST',
        body: JSON.stringify({
          columnId: targetColumn.id,
          beforeTaskId,
          afterTaskId,
          expectedUpdatedAt: task.updatedAt,
        }),
      });
      await load();
    } catch (caught) {
      setBoard(previousBoard);
      toast.fromError(caught, 'Could not move the task.');
    } finally {
      setBusy(false);
      dragOriginBoard.current = null;
    }
  }

  async function moveSubtask(taskId: string, subtask: BoardSubtask, targetColumnId: string) {
    if (!board || busy || subtask.columnId === targetColumnId) return;
    const previousBoard = dragOriginBoard.current ?? board;
    setBoard(placeSubtaskOnColumn(board, subtask.id, targetColumnId));
    setBusy(true);
    try {
      await request(`/tasks/${taskId}/subtasks/${subtask.id}/move`, {
        method: 'POST',
        body: JSON.stringify({
          columnId: targetColumnId,
          expectedUpdatedAt: subtask.updatedAt,
        }),
      });
      await load();
    } catch (caught) {
      setBoard(previousBoard);
      toast.fromError(caught, 'Could not move the subtask.');
    } finally {
      setBusy(false);
      dragOriginBoard.current = null;
    }
  }

  function findBoardSubtask(subtaskId: string) {
    if (!board) return null;
    for (const [columnIndex, column] of board.columns.entries()) {
      for (const task of column.tasks) {
        const nested = task.subtasks.find((item) => item.id === subtaskId);
        if (nested) return { subtask: nested, taskId: task.id, columnIndex };
      }
      const standalone = column.subtasks.find((item) => item.id === subtaskId);
      if (standalone) return { subtask: standalone, taskId: standalone.taskId, columnIndex };
    }
    return null;
  }

  function findTaskLocation(taskId: string, source: BoardResponse = board!) {
    for (const [columnIndex, column] of source.columns.entries()) {
      const taskIndex = column.tasks.findIndex((item) => item.id === taskId);
      if (taskIndex >= 0) return { columnIndex, taskIndex, task: column.tasks[taskIndex] };
    }
    return null;
  }

  function resolveColumnIndex(overId: string) {
    if (!board) return -1;
    if (overId.startsWith('column:')) {
      return board.columns.findIndex((column) => column.id === overId.replace(/^column:/, ''));
    }
    if (overId.startsWith('task:')) {
      const taskId = overId.replace(/^task:/, '');
      return board.columns.findIndex((column) => column.tasks.some((item) => item.id === taskId));
    }
    if (overId.startsWith('subtask:')) {
      const found = findBoardSubtask(overId.replace(/^subtask:/, ''));
      return found?.columnIndex ?? -1;
    }
    return -1;
  }

  function taskPointerY(event: DragMoveEvent) {
    const activator = event.activatorEvent as Event & { clientY?: number };
    if (typeof activator.clientY === 'number') return activator.clientY + event.delta.y;
    const activeRect = event.active.rect.current.translated;
    return activeRect ? activeRect.top + activeRect.height / 2 : undefined;
  }

  function taskRectsInColumn(columnId: string) {
    const columnBody = Array.from(
      document.querySelectorAll<HTMLElement>('[data-board-column-id]'),
    ).find((element) => element.dataset.boardColumnId === columnId);
    if (!columnBody) return [];

    const placeholder = columnBody.querySelector<HTMLElement>(':scope > .task-drop-placeholder');
    const placeholderRect = placeholder?.getBoundingClientRect();
    const rowGap = Number.parseFloat(window.getComputedStyle(columnBody).rowGap) || 0;
    const placeholderSpace = placeholderRect ? placeholderRect.height + rowGap : 0;

    return Array.from(columnBody.querySelectorAll<HTMLElement>('[data-board-task-id]')).map(
      (element) => {
        const rect = element.getBoundingClientRect();
        const followsPlaceholder = placeholderRect && rect.top > placeholderRect.top;
        return {
          taskId: element.dataset.boardTaskId ?? '',
          top: rect.top - (followsPlaceholder ? placeholderSpace : 0),
          height: rect.height,
        };
      },
    );
  }

  function startBoardDrag(event: DragStartEvent) {
    if (!board || busy) return;
    armClickSuppression();
    updateTaskDropPreview(null);
    dragOriginBoard.current = board;
    const activeId = String(event.active.id);
    if (activeId.startsWith('task:')) {
      const taskId = activeId.replace(/^task:/, '');
      const location = findTaskLocation(taskId);
      if (location) {
        setActiveDrag({ type: 'task', task: location.task });
        setBoard({
          ...board,
          columns: board.columns.map((column) => ({
            ...column,
            tasks: column.tasks.filter((task) => task.id !== taskId),
          })),
        });
      }
      return;
    }
    if (activeId.startsWith('subtask:')) {
      const subtaskId = activeId.replace(/^subtask:/, '');
      for (const column of board.columns) {
        for (const task of column.tasks) {
          const nested = task.subtasks.find((item) => item.id === subtaskId);
          if (nested) {
            setActiveDrag({
              type: 'subtask',
              subtask: nested,
              taskId: task.id,
              taskTitle: task.title,
              standalone: false,
            });
            return;
          }
        }
        const standalone = column.subtasks.find((item) => item.id === subtaskId);
        if (standalone) {
          setActiveDrag({
            type: 'subtask',
            subtask: standalone,
            taskId: standalone.taskId,
            taskTitle: standalone.parentTask?.title ?? 'Parent task',
            standalone: true,
          });
          return;
        }
      }
    }
  }

  function previewTaskDrag(event: DragMoveEvent) {
    if (!board || !event.over || busy || !String(event.active.id).startsWith('task:')) {
      if (!event.over) updateTaskDropPreview(null);
      return;
    }

    const activeTaskId = String(event.active.id).replace(/^task:/, '');
    const targetColumnIndex = resolveColumnIndex(String(event.over.id));
    const pointerY = taskPointerY(event);
    if (targetColumnIndex < 0 || pointerY === undefined) {
      updateTaskDropPreview(null);
      return;
    }

    const targetColumn = board.columns[targetColumnIndex];
    const targetIndex = taskDropIndex({
      taskIds: targetColumn.tasks.map((task) => task.id),
      activeTaskId,
      pointerY,
      taskRects: taskRectsInColumn(targetColumn.id),
    });
    updateTaskDropPreview({ columnId: targetColumn.id, index: targetIndex });
  }

  function previewBoardDrag(event: DragOverEvent) {
    if (!board || !event.over || busy) return;
    const activeId = String(event.active.id);
    const overId = String(event.over.id);
    if (activeId === overId) return;

    if (activeId.startsWith('task:')) return;

    if (activeId.startsWith('subtask:')) {
      const targetColumnIndex = resolveColumnIndex(overId);
      if (targetColumnIndex < 0) return;
      const targetColumnId = board.columns[targetColumnIndex].id;
      const active = findBoardSubtask(activeId.replace(/^subtask:/, ''));
      if (!active || active.subtask.columnId === targetColumnId) return;
      setBoard(placeSubtaskOnColumn(board, active.subtask.id, targetColumnId));
    }
  }

  function cancelBoardDrag() {
    if (dragOriginBoard.current) setBoard(dragOriginBoard.current);
    dragOriginBoard.current = null;
    setActiveDrag(null);
    updateTaskDropPreview(null);
  }

  function finishBoardDrag(event: DragEndEvent) {
    const origin = dragOriginBoard.current;
    const active = activeDrag;
    const taskPreview = taskDropPreviewRef.current;
    setActiveDrag(null);
    updateTaskDropPreview(null);

    if (!board || busy) {
      dragOriginBoard.current = null;
      return;
    }
    if (!event.over) {
      if (origin) setBoard(origin);
      dragOriginBoard.current = null;
      return;
    }

    if (String(event.active.id).startsWith('subtask:') && active?.type === 'subtask') {
      const activeId = String(event.active.id).replace(/^subtask:/, '');
      const overId = String(event.over.id);
      if (overId.startsWith('subtask:')) {
        const overSubtaskId = overId.replace(/^subtask:/, '');
        const parentTask = board.columns
          .flatMap((column) => column.tasks)
          .find((task) => task.subtasks.some((subtask) => subtask.id === activeId));
        if (parentTask && parentTask.subtasks.some((subtask) => subtask.id === overSubtaskId)) {
          const oldIndex = parentTask.subtasks.findIndex((subtask) => subtask.id === activeId);
          const newIndex = parentTask.subtasks.findIndex((subtask) => subtask.id === overSubtaskId);
          if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
            void saveBoardSubtaskOrder(
              parentTask,
              arrayMove(parentTask.subtasks, oldIndex, newIndex),
            );
          } else {
            dragOriginBoard.current = null;
          }
          return;
        }
      }

      const current = findBoardSubtask(activeId);
      const originSubtask =
        origin &&
        (() => {
          for (const column of origin.columns) {
            for (const task of column.tasks) {
              const nested = task.subtasks.find((item) => item.id === activeId);
              if (nested) return nested;
            }
            const standalone = column.subtasks.find((item) => item.id === activeId);
            if (standalone) return standalone;
          }
          return null;
        })();
      if (current && originSubtask && current.subtask.columnId !== originSubtask.columnId) {
        void moveSubtask(active.taskId, originSubtask, current.subtask.columnId);
        return;
      }
      dragOriginBoard.current = null;
      return;
    }

    const taskId = String(event.active.id).replace(/^task:/, '');
    if (!origin) {
      dragOriginBoard.current = null;
      return;
    }
    const previous = findTaskLocation(taskId, origin);
    if (!previous) {
      dragOriginBoard.current = null;
      return;
    }

    const targetColumnIndex = taskPreview
      ? origin.columns.findIndex((column) => column.id === taskPreview.columnId)
      : -1;
    if (targetColumnIndex < 0) {
      setBoard(origin);
      dragOriginBoard.current = null;
      return;
    }

    if (targetColumnIndex === previous.columnIndex && taskPreview?.index === previous.taskIndex) {
      setBoard(origin);
      dragOriginBoard.current = null;
      return;
    }
    void moveTask(previous.task, targetColumnIndex, taskPreview?.index ?? 0);
  }

  async function saveBoardSubtaskOrder(task: TaskCard, reordered: BoardSubtask[]) {
    if (!board || busy) return;
    const previousBoard = board;
    setBoard({
      ...board,
      columns: board.columns.map((column) => ({
        ...column,
        tasks: column.tasks.map((item) =>
          item.id === task.id ? { ...item, subtasks: reordered } : item,
        ),
      })),
    });
    setBusy(true);
    try {
      await request(`/tasks/${task.id}/subtasks/reorder`, {
        method: 'POST',
        body: JSON.stringify({ subtaskIds: reordered.map((item) => item.id) }),
      });
      await load();
    } catch (caught) {
      setBoard(previousBoard);
      toast.fromError(caught, 'Could not reorder subtasks.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack board-page">
      <HeaderActions>
        {user?.role === 'ADMIN' ? (
          <Button nativeButton={false} variant="outline" render={<Link href="/settings/board" />}>
            Configure board
          </Button>
        ) : null}
        <Button nativeButton={false} variant="primary" render={<Link href="/backlog" />}>
          Backlog
        </Button>
      </HeaderActions>

      <section className="board-filters" aria-label="Board filters">
        <label className="board-search">
          <Input
            type="search"
            value={filters.search}
            onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            aria-label="Search"
            placeholder="Search"
          />
        </label>
        <label>
          <Select
            aria-label="Project"
            placeholder="Project"
            value={filters.projectId || undefined}
            onChange={(event) => setFilters({ ...filters, projectId: event.target.value })}
          >
            <option value="">All projects</option>
            {projects.map((proj) => (
              <option value={proj.id} key={proj.id}>
                {proj.key ? `${proj.key}-${proj.name}` : proj.name}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <Select
            aria-label="Assignee"
            placeholder="Assignee"
            value={filters.mine ? (user?.id ?? undefined) : filters.assigneeId || undefined}
            disabled={filters.unassigned || filters.mine}
            onChange={(event) =>
              setFilters({
                ...filters,
                assigneeId: event.target.value,
                unassigned: false,
                mine: false,
              })
            }
          >
            <option value="">Everyone</option>
            {users.map((member) => (
              <option value={member.id} key={member.id}>
                {member.displayName}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <Select
            aria-label="Estimate"
            placeholder="Estimate"
            value={filters.estimate || undefined}
            onChange={(event) =>
              setFilters({ ...filters, estimate: event.target.value as Filters['estimate'] })
            }
          >
            <option value="">Any</option>
            <option value="true">Estimated</option>
            <option value="false">No estimate</option>
          </Select>
        </label>
        <label>
          <PrioritySelect
            allowAny
            aria-label="Priority"
            placeholder="Priority"
            value={filters.priority}
            onChange={(value) => setFilters({ ...filters, priority: value })}
          />
        </label>
        <div className="board-filter-toggles" role="group" aria-label="Quick filters">
          <label className="check-field">
            <Checkbox
              checked={filters.mine}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  mine: event.target.checked,
                  unassigned: event.target.checked ? false : filters.unassigned,
                  assigneeId: event.target.checked ? '' : filters.assigneeId,
                })
              }
            />
            <span>My assignees</span>
          </label>
          <label className="check-field">
            <Checkbox
              checked={filters.unassigned}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  unassigned: event.target.checked,
                  mine: event.target.checked ? false : filters.mine,
                  assigneeId: event.target.checked ? '' : filters.assigneeId,
                })
              }
            />
            <span>Unassigned only</span>
          </label>
        </div>
        <Button
          className="board-filter-clear"
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => setFilters(emptyFilters)}
        >
          Clear
        </Button>
      </section>

      {!board ? (
        <div className="board-loading">
          {loadFailed ? (
            <p className="empty-copy">The board could not be loaded.</p>
          ) : (
            <>
              <span className="spinner" /> Loading board…
            </>
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={boardCollisionDetection}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={startBoardDrag}
          onDragMove={previewTaskDrag}
          onDragOver={previewBoardDrag}
          onDragCancel={cancelBoardDrag}
          onDragEnd={finishBoardDrag}
        >
          <section className={`task-board ${busy ? 'is-busy' : ''}`} aria-label="Task board">
            {board.columns.map((column) => {
              const activeTaskId = activeDrag?.type === 'task' ? activeDrag.task.id : null;
              const visibleTaskCount = column.tasks.filter(
                (task) => task.id !== activeTaskId,
              ).length;
              const showsTaskPlaceholder = taskDropPreview?.columnId === column.id;

              return (
                <article
                  className="task-column"
                  key={column.id}
                  aria-label={`${column.name}, ${column.tasks.length + column.subtasks.length} work items`}
                >
                  <header>
                    <span className="column-dot" style={{ backgroundColor: column.color }} />
                    <strong>{column.name}</strong>
                    {column.isDone ? <span className="done-label">Done</span> : null}
                    <small>{column.tasks.length + column.subtasks.length}</small>
                  </header>
                  <TaskColumnBody
                    columnId={column.id}
                    taskIds={column.tasks.map((task) => task.id)}
                  >
                    {column.tasks.map((task, taskIndex) => {
                      const visibleIndex = column.tasks
                        .slice(0, taskIndex)
                        .filter((item) => item.id !== activeTaskId).length;
                      const showPlaceholderBefore =
                        task.id !== activeTaskId &&
                        showsTaskPlaceholder &&
                        taskDropPreview.index === visibleIndex;

                      return (
                        <Fragment key={task.id}>
                          {showPlaceholderBefore ? <TaskDropPlaceholder /> : null}
                          <SortableTaskShell
                            id={task.id}
                            columnId={column.id}
                            title={task.title}
                            disabled={busy}
                            onNavigateGuard={guardCardNavigation}
                          >
                            <TaskCardContent
                              task={task}
                              disabled={busy}
                              onNavigateGuard={guardCardNavigation}
                            />
                          </SortableTaskShell>
                        </Fragment>
                      );
                    })}
                    {showsTaskPlaceholder && taskDropPreview.index === visibleTaskCount ? (
                      <TaskDropPlaceholder />
                    ) : null}
                    {column.subtasks.length ? (
                      <SortableContext
                        items={column.subtasks.map((subtask) => `subtask:${subtask.id}`)}
                        strategy={verticalListSortingStrategy}
                      >
                        {column.subtasks.map((subtask) => (
                          <SortableBoardSubtaskCard
                            key={subtask.id}
                            subtask={subtask}
                            task={{
                              id: subtask.taskId,
                              title: subtask.parentTask?.title ?? 'Parent task',
                            }}
                            disabled={busy}
                            standalone
                            onNavigateGuard={guardCardNavigation}
                          />
                        ))}
                      </SortableContext>
                    ) : null}
                    {!column.tasks.length && !column.subtasks.length && !showsTaskPlaceholder ? (
                      <div className="empty-column">Drop a task here</div>
                    ) : null}
                  </TaskColumnBody>
                </article>
              );
            })}
          </section>
          <DragOverlay dropAnimation={dropAnimation}>
            {activeDrag?.type === 'task' ? (
              <article className="task-card task-card--overlay">
                <TaskCardContent task={activeDrag.task} interactive={false} />
              </article>
            ) : null}
            {activeDrag?.type === 'subtask' ? (
              <div className="board-subtask-card--overlay">
                <BoardSubtaskCard
                  subtask={activeDrag.subtask}
                  task={{ id: activeDrag.taskId, title: activeDrag.taskTitle }}
                  standalone={activeDrag.standalone}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function TaskColumnBody({
  columnId,
  taskIds,
  children,
}: PropsWithChildren<{ columnId: string; taskIds: string[] }>) {
  const { setNodeRef } = useDroppable({
    id: `column:${columnId}`,
    data: { type: 'column', columnId },
  });
  return (
    <SortableContext
      items={taskIds.map((taskId) => `task:${taskId}`)}
      strategy={verticalListSortingStrategy}
    >
      <div ref={setNodeRef} className="task-column-body" data-board-column-id={columnId}>
        {children}
      </div>
    </SortableContext>
  );
}

function TaskDropPlaceholder() {
  return <div className="task-drop-placeholder" aria-hidden="true" />;
}

function TaskCardContent({
  task,
  disabled = false,
  interactive = true,
  onNavigateGuard,
}: {
  task: TaskCard;
  disabled?: boolean;
  interactive?: boolean;
  onNavigateGuard?: (event: { preventDefault(): void; stopPropagation(): void }) => void;
}) {
  const completed = task.subtasks.filter((item) => item.isCompleted).length;
  return (
    <>
      <Link
        href={`/tasks/${task.id}`}
        className="task-card-main"
        data-priority={task.priority}
        tabIndex={interactive ? undefined : -1}
        onClick={(event) => {
          if (!interactive) {
            event.preventDefault();
            return;
          }
          onNavigateGuard?.(event);
        }}
      >
        <div className="task-card-header">
          <div className="task-title-group">
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
                {task.project.key ? task.project.key : task.project.name}
              </span>
            )}
            <h2>{task.title}</h2>
          </div>
          <div
            className="card-assignees"
            aria-label={
              task.assignees.length
                ? `Assigned to ${task.assignees.map((item) => item.user.displayName).join(', ')}`
                : 'Unassigned'
            }
          >
            {task.assignees.length ? (
              <>
                <div className="card-assignee-avatars">
                  {task.assignees.slice(0, 3).map((item) => (
                    <Avatar
                      color={item.user.color}
                      hasAvatar={item.user.hasAvatar}
                      initialsSize={18}
                      key={item.user.id}
                      name={item.user.displayName}
                      size={24}
                      userId={item.user.id}
                    />
                  ))}
                  {task.assignees.length > 3 ? <span>+{task.assignees.length - 3}</span> : null}
                </div>
                <span
                  className="card-assignee-name"
                  title={task.assignees.map((item) => item.user.displayName).join(', ')}
                >
                  {task.assignees.length === 1
                    ? task.assignees[0].user.displayName
                    : `${task.assignees[0].user.displayName} +${task.assignees.length - 1}`}
                </span>
              </>
            ) : (
              <span className="unassigned-label" title="Unassigned">
                —
              </span>
            )}
          </div>
        </div>
        <p className={task.description ? undefined : 'is-empty'}>{task.description || '\u00A0'}</p>
        <div className="task-card-facts">
          <PriorityBadge priority={task.priority} />
          {task.estimateValue ? (
            <span>
              {task.estimateUnit === 'HOURS'
                ? formatHours(task.estimateValue)
                : `${task.estimateValue} pt`}
            </span>
          ) : null}
          {task.subtasks.length ? (
            <span>
              {completed}/{task.subtasks.length} subtasks
            </span>
          ) : null}
          {task._count.attachments ? (
            <span>
              {task._count.attachments} file{task._count.attachments === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      </Link>
      {task.subtasks.length ? (
        interactive ? (
          <SortableContext
            items={task.subtasks.map((subtask) => `subtask:${subtask.id}`)}
            strategy={verticalListSortingStrategy}
          >
            <div
              className="board-subtasks"
              aria-label={`Subtasks for ${task.title}`}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {task.subtasks.map((subtask) => (
                <SortableBoardSubtaskCard
                  key={subtask.id}
                  subtask={subtask}
                  task={task}
                  disabled={disabled}
                  onNavigateGuard={onNavigateGuard}
                />
              ))}
            </div>
          </SortableContext>
        ) : (
          <div className="board-subtasks" aria-hidden="true">
            {task.subtasks.map((subtask) => (
              <BoardSubtaskCard key={subtask.id} subtask={subtask} task={task} />
            ))}
          </div>
        )
      ) : null}
    </>
  );
}

function SortableTaskShell({
  id,
  columnId,
  title,
  disabled,
  children,
  onNavigateGuard,
}: PropsWithChildren<{
  id: string;
  columnId: string;
  title: string;
  disabled: boolean;
  onNavigateGuard?: (event: { preventDefault(): void; stopPropagation(): void }) => void;
}>) {
  const { attributes, isDragging, listeners, setNodeRef } = useSortable({
    id: `task:${id}`,
    data: { type: 'task', columnId },
    disabled,
  });
  const { role, ...taskDragAttributes } = attributes;
  void role;
  return (
    <article
      ref={setNodeRef}
      className={`task-card task-card--draggable sortable-task-shell ${isDragging ? 'is-dragging' : ''}`}
      data-board-task-id={id}
      title={disabled ? undefined : `Drag ${title}`}
      aria-label={
        disabled
          ? undefined
          : `Task ${title}. Drag from anywhere on the card to move. Use arrow keys while dragging to choose a position.`
      }
      onClickCapture={onNavigateGuard}
      {...(disabled ? {} : { ...taskDragAttributes, ...listeners })}
    >
      {children}
    </article>
  );
}

function SortableBoardSubtaskCard({
  subtask,
  task,
  disabled,
  standalone = false,
  onNavigateGuard,
}: {
  subtask: BoardSubtask;
  task: Pick<TaskCard, 'id' | 'title'>;
  disabled: boolean;
  standalone?: boolean;
  onNavigateGuard?: (event: { preventDefault(): void; stopPropagation(): void }) => void;
}) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: `subtask:${subtask.id}`,
    data: { type: 'subtask', taskId: task.id, columnId: subtask.columnId },
    disabled,
  });
  const { role, ...subtaskDragAttributes } = attributes;
  void role;
  const title = subtask.title ?? 'Subtask';
  return (
    <div
      ref={setNodeRef}
      className={`sortable-board-subtask board-subtask-card--draggable ${isDragging ? 'is-dragging' : ''}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
      }}
      title={disabled ? undefined : `Drag ${title}`}
      aria-label={
        disabled
          ? undefined
          : `Subtask ${title}. Drag from anywhere on the card to move. Use arrow keys while dragging to choose a position.`
      }
      onPointerDown={(event) => event.stopPropagation()}
      onClickCapture={onNavigateGuard}
      {...(disabled ? {} : { ...subtaskDragAttributes, ...listeners })}
    >
      <BoardSubtaskCard
        subtask={subtask}
        task={task}
        standalone={standalone}
        onNavigateGuard={onNavigateGuard}
      />
    </div>
  );
}

function BoardSubtaskCard({
  subtask,
  task,
  standalone = false,
  onNavigateGuard,
}: {
  subtask: BoardSubtask;
  task?: { id: string; title: string };
  standalone?: boolean;
  onNavigateGuard?: (event: { preventDefault(): void; stopPropagation(): void }) => void;
}) {
  const parentTask = task ?? { id: subtask.taskId, title: 'Parent task' };
  const attachmentCount = subtask._count?.attachments ?? 0;
  const title = subtask.title ?? 'Subtask';
  return (
    <Link
      className={`board-subtask-card ${subtask.isCompleted ? 'completed' : ''} ${standalone ? 'standalone' : ''}`}
      data-priority={subtask.priority}
      href={`/tasks/${parentTask.id}`}
      aria-label={`Subtask ${title} for ${parentTask.title}`}
      onClick={(event) => onNavigateGuard?.(event)}
    >
      <span className="board-subtask-marker" aria-hidden="true" />
      <div className="board-subtask-copy">
        <small>{standalone ? `Subtask of ${parentTask.title}` : 'Subtask'}</small>
        <strong>{title}</strong>
        <p className={subtask.description ? undefined : 'is-empty'}>
          {subtask.description || '\u00A0'}
        </p>
        <div className="task-card-facts">
          <PriorityBadge priority={subtask.priority} />
          {subtask.estimateValue ? (
            <span>
              {subtask.estimateUnit === 'HOURS'
                ? formatHours(subtask.estimateValue)
                : `${subtask.estimateValue} pt`}
            </span>
          ) : null}
          {attachmentCount ? (
            <span>
              {attachmentCount} file{attachmentCount === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      </div>
      <div className="board-subtask-assignee" aria-hidden={!subtask.assignee}>
        {subtask.assignee ? (
          <Avatar
            color={subtask.assignee.color}
            hasAvatar={subtask.assignee.hasAvatar}
            initialsSize={18}
            name={subtask.assignee.displayName}
            size={24}
            userId={subtask.assignee.id}
          />
        ) : (
          <span className="board-subtask-assignee-empty" />
        )}
      </div>
    </Link>
  );
}

function placeSubtaskOnColumn(
  board: BoardResponse,
  subtaskId: string,
  targetColumnId: string,
): BoardResponse {
  let moving: BoardSubtask | null = null;
  let parentTask: { id: string; title: string } | null = null;

  const columnsWithout = board.columns.map((column) => {
    const nestedTasks = column.tasks.map((task) => {
      const match = task.subtasks.find((item) => item.id === subtaskId);
      if (!match) return task;
      moving = { ...match, columnId: targetColumnId };
      parentTask = { id: task.id, title: task.title };
      return { ...task, subtasks: task.subtasks.filter((item) => item.id !== subtaskId) };
    });
    const standalone = column.subtasks.find((item) => item.id === subtaskId);
    if (standalone) {
      moving = { ...standalone, columnId: targetColumnId };
      parentTask = {
        id: standalone.taskId,
        title: standalone.parentTask?.title ?? 'Parent task',
      };
    }
    return {
      ...column,
      tasks: nestedTasks,
      subtasks: column.subtasks.filter((item) => item.id !== subtaskId),
    };
  });

  if (!moving) return board;

  return {
    ...board,
    columns: columnsWithout.map((column) => {
      if (column.id !== targetColumnId) return column;
      const parentStillHere = column.tasks.some((task) => task.id === moving!.taskId);
      if (parentStillHere) {
        return {
          ...column,
          tasks: column.tasks.map((task) =>
            task.id === moving!.taskId ? { ...task, subtasks: [...task.subtasks, moving!] } : task,
          ),
        };
      }
      return {
        ...column,
        subtasks: [
          ...column.subtasks,
          {
            ...moving!,
            parentTask: parentTask ?? moving!.parentTask,
          },
        ],
      };
    }),
  };
}

function formatHours(value: number) {
  return `${value}h`;
}
