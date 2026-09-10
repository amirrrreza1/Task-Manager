'use client';

import { Button, Checkbox, Input, Select } from '../../../components/design-system';

import Link from 'next/link';
import {
  Fragment,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { TaskTypeBadge, TaskTypeSelect } from '../../../components/task-type-badge';
import { TaskIdBadge } from '../../../components/task-id-badge';
import { TaskCardMenu } from '../../../components/task-card-menu';
import { SubtaskCardMenu } from '../../../components/subtask-card-menu';
import {
  QuickEditAssigneeModal,
  QuickEditDescriptionModal,
  QuickEditTitleModal,
} from '../../../components/quick-edit-field-modals';
import { ProjectIcon } from '../../../lib/project-icons';
import { isTaskPriority } from '../../../lib/priority';
import { isTaskType } from '../../../lib/task-type';
import type {
  BoardResponse,
  BoardSubtask,
  ManagedUser,
  Paginated,
  Project,
  SprintSummary,
  TaskCard,
  TaskPriority,
  TaskType,
} from '../../../lib/types';
import { placeSubtaskOnColumn, workflowBoard } from '../../../lib/board-columns';
import { taskDropIndex } from '../../../lib/board-dnd';
import { useBoardSocket } from '../../../lib/use-board-socket';
import {
  type BoardSortOption,
  BOARD_SORT_OPTIONS,
  applyBoardSort,
  isValidBoardSortOption,
} from '../../../lib/task-sort';

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
        ? (pointerCollisions.find(
            (collision) =>
              collision.id !== arguments_.active.id && String(collision.id).startsWith('subtask:'),
          ) ?? pointerCollisions.find((collision) => String(collision.id).startsWith('task:')))
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
      activeType === 'task' || activeType === 'subtask'
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
  sprintId: string;
  unassigned: boolean;
  mine: boolean;
  estimate: '' | 'true' | 'false';
  priority: TaskPriority | '';
  type: TaskType | '';
  sortBy: BoardSortOption;
}

const emptyFilters: Filters = {
  search: '',
  assigneeId: '',
  projectId: '',
  sprintId: '',
  unassigned: false,
  mine: false,
  estimate: '',
  priority: '',
  type: '',
  sortBy: '',
};

export default function BoardPage() {
  const { user, request } = useAuth();
  const toast = useToast();
  const { currentWorkspace } = useWorkspace();
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sprints, setSprints] = useState<SprintSummary[]>([]);
  const [editingTitleItem, setEditingTitleItem] = useState<
    { type: 'task'; item: TaskCard } | { type: 'subtask'; item: BoardSubtask } | null
  >(null);
  const [editingDescriptionItem, setEditingDescriptionItem] = useState<
    { type: 'task'; item: TaskCard } | { type: 'subtask'; item: BoardSubtask } | null
  >(null);
  const [editingSubtaskAssignee, setEditingSubtaskAssignee] = useState<BoardSubtask | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const activeDragRef = useRef<ActiveDrag | null>(null);
  const pendingReloadRef = useRef(false);
  const [taskDropPreview, setTaskDropPreview] = useState<TaskDropPreview | null>(null);
  const taskDropPreviewRef = useRef<TaskDropPreview | null>(null);
  const dragOriginBoard = useRef<BoardResponse | null>(null);
  const suppressClickRef = useRef(false);

  const displayedBoard = useMemo(() => {
    return applyBoardSort(board, filters.sortBy);
  }, [board, filters.sortBy]);

  function updateBusy(next: boolean) {
    busyRef.current = next;
    setBusy(next);
  }

  function updateActiveDrag(next: ActiveDrag | null) {
    activeDragRef.current = next;
    setActiveDrag(next);
  }

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
    const type = params.get('type') ?? '';
    const sortBy = params.get('sortBy') ?? params.get('sort') ?? '';
    const sprintId = params.get('sprintId') ?? '';
    setFilters({
      search: params.get('search') ?? '',
      assigneeId: mine ? '' : (params.get('assigneeId') ?? ''),
      projectId: params.get('projectId') ?? '',
      sprintId,
      unassigned: !mine && params.get('unassigned') === 'true',
      mine,
      estimate: estimated === 'true' || estimated === 'false' ? estimated : '',
      priority: isTaskPriority(priority) ? priority : '',
      type: isTaskType(type) ? type : '',
      sortBy: isValidBoardSortOption(sortBy) ? sortBy : '',
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
    if (filters.sprintId) {
      browserParams.set('sprintId', filters.sprintId);
      apiParams.set('sprintId', filters.sprintId);
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
    if (filters.type) {
      browserParams.set('type', filters.type);
      apiParams.set('type', filters.type);
    }
    if (filters.sortBy) {
      browserParams.set('sortBy', filters.sortBy);
    }
    const browserQuery = browserParams.toString();
    const apiQuery = apiParams.toString();
    window.history.replaceState(null, '', browserQuery ? `/board?${browserQuery}` : '/board');
    setLoadFailed(false);
    try {
      const wsParam = currentWorkspace?.id ? `?workspaceId=${currentWorkspace.id}` : '';
      const [nextBoard, nextUsers, nextProjects, nextSprints] = await Promise.all([
        request<BoardResponse>(`/board${apiQuery ? `?${apiQuery}` : ''}`),
        request<ManagedUser[]>('/users'),
        request<Project[]>(`/projects${wsParam}`),
        request<Paginated<SprintSummary>>(`/sprints${wsParam}`),
      ]);
      setBoard(workflowBoard(nextBoard));
      setUsers(nextUsers.filter((member) => member.isActive));
      setProjects(nextProjects);
      setSprints(nextSprints.items);
      setLoadFailed(false);
    } catch (caught) {
      setLoadFailed(true);
      toast.fromError(caught, 'Could not load the board.');
    }
  }, [filters, request, user?.id, currentWorkspace?.id, toast]);

  const flushPendingReload = useCallback(() => {
    if (pendingReloadRef.current && !activeDragRef.current && !busyRef.current) {
      pendingReloadRef.current = false;
      void load();
    }
  }, [load]);

  const handleBoardUpdate = useCallback(() => {
    if (activeDragRef.current || busyRef.current) {
      pendingReloadRef.current = true;
      return;
    }
    void load();
  }, [load]);

  const { isConnected } = useBoardSocket(currentWorkspace?.id, handleBoardUpdate);

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
              {
                ...task,
                columnId: targetColumn.id,
                subtasks: (task.subtasks ?? []).map((subtask) => ({
                  ...subtask,
                  columnId: targetColumn.id,
                })),
              },
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
    updateBusy(true);
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
      updateBusy(false);
      dragOriginBoard.current = null;
      flushPendingReload();
    }
  }

  async function moveSubtask(
    taskId: string,
    subtask: BoardSubtask,
    targetColumnId: string,
    reordered?: BoardSubtask[],
  ) {
    if (!board || busy || (subtask.columnId === targetColumnId && !reordered)) return;
    const previousBoard = dragOriginBoard.current ?? board;
    const nextBoard = placeSubtaskOnColumn(board, subtask.id, targetColumnId);
    if (reordered) {
      setBoard({
        ...nextBoard,
        columns: nextBoard.columns.map((column) => ({
          ...column,
          tasks: column.tasks.map((task) =>
            task.id === taskId ? { ...task, subtasks: reordered } : task,
          ),
        })),
      });
    } else {
      setBoard(nextBoard);
    }
    updateBusy(true);
    try {
      if (subtask.columnId !== targetColumnId) {
        await request(`/tasks/${taskId}/subtasks/${subtask.id}/move`, {
          method: 'POST',
          body: JSON.stringify({
            columnId: targetColumnId,
            expectedUpdatedAt: subtask.updatedAt,
          }),
        });
      }
      if (reordered && reordered.length > 1) {
        await request(`/tasks/${taskId}/subtasks/reorder`, {
          method: 'POST',
          body: JSON.stringify({ subtaskIds: reordered.map((item) => item.id) }),
        });
      }
      await load();
    } catch (caught) {
      setBoard(previousBoard);
      toast.fromError(caught, 'Could not move the subtask.');
    } finally {
      updateBusy(false);
      dragOriginBoard.current = null;
      flushPendingReload();
    }
  }

  function findBoardSubtask(subtaskId: string) {
    const current = displayedBoard ?? board;
    if (!current) return null;
    for (const [columnIndex, column] of current.columns.entries()) {
      for (const task of column.tasks) {
        const nested = task.subtasks.find((item) => item.id === subtaskId);
        if (nested) return { subtask: nested, taskId: task.id, columnIndex };
      }
      const standalone = column.subtasks.find((item) => item.id === subtaskId);
      if (standalone) return { subtask: standalone, taskId: standalone.taskId, columnIndex };
    }
    return null;
  }

  function findTaskLocation(taskId: string, source: BoardResponse = (displayedBoard ?? board)!) {
    if (!source) return null;
    for (const [columnIndex, column] of source.columns.entries()) {
      const taskIndex = column.tasks.findIndex((item) => item.id === taskId);
      if (taskIndex >= 0) return { columnIndex, taskIndex, task: column.tasks[taskIndex] };
    }
    return null;
  }

  function resolveColumnIndex(overId: string) {
    const currentBoard = displayedBoard ?? board;
    if (!currentBoard) return -1;
    if (overId.startsWith('column:')) {
      return currentBoard.columns.findIndex(
        (column) => column.id === overId.replace(/^column:/, ''),
      );
    }
    if (overId.startsWith('task:')) {
      const taskId = overId.replace(/^task:/, '');
      return currentBoard.columns.findIndex((column) =>
        column.tasks.some((item) => item.id === taskId),
      );
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
    dragOriginBoard.current = displayedBoard ?? board;
    const activeId = String(event.active.id);
    if (activeId.startsWith('task:')) {
      const taskId = activeId.replace(/^task:/, '');
      const location = findTaskLocation(taskId, displayedBoard ?? board);
      if (location) {
        updateActiveDrag({ type: 'task', task: location.task });
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
      const currentBoard = displayedBoard ?? board;
      for (const column of currentBoard.columns) {
        for (const task of column.tasks) {
          const nested = task.subtasks.find((item) => item.id === subtaskId);
          if (nested) {
            updateActiveDrag({
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
          updateActiveDrag({
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
    const currentBoard = displayedBoard ?? board;
    if (!currentBoard || !event.over || busy || !String(event.active.id).startsWith('task:')) {
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

    const targetColumn = currentBoard.columns[targetColumnIndex];
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
    updateActiveDrag(null);
    updateTaskDropPreview(null);
    flushPendingReload();
  }

  function finishBoardDrag(event: DragEndEvent) {
    const origin = dragOriginBoard.current;
    const active = activeDrag;
    const taskPreview = taskDropPreviewRef.current;
    updateActiveDrag(null);
    updateTaskDropPreview(null);

    if (!board || busy) {
      dragOriginBoard.current = null;
      flushPendingReload();
      return;
    }
    if (!event.over) {
      if (origin) setBoard(origin);
      dragOriginBoard.current = null;
      flushPendingReload();
      return;
    }

    if (String(event.active.id).startsWith('subtask:') && active?.type === 'subtask') {
      const activeId = String(event.active.id).replace(/^subtask:/, '');
      const overId = String(event.over.id);

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

      if (!origin || !originSubtask) {
        dragOriginBoard.current = null;
        flushPendingReload();
        return;
      }

      const current = findBoardSubtask(activeId);
      const targetColumnIndex = resolveColumnIndex(overId);
      const resolvedColumnId =
        targetColumnIndex >= 0 ? (board.columns[targetColumnIndex]?.id ?? null) : null;
      const targetColumnId = resolvedColumnId ?? current?.subtask.columnId ?? null;

      if (!targetColumnId) {
        setBoard(origin);
        dragOriginBoard.current = null;
        flushPendingReload();
        return;
      }

      const columnChanged = targetColumnId !== originSubtask.columnId;

      if (columnChanged) {
        const parentTask = board.columns
          .flatMap((column) => column.tasks)
          .find((task) => task.id === active.taskId);

        let reorderedSubtasks: BoardSubtask[] | undefined;
        if (parentTask && parentTask.columnId === targetColumnId && overId.startsWith('subtask:')) {
          const overSubtaskId = overId.replace(/^subtask:/, '');
          if (
            overSubtaskId !== activeId &&
            parentTask.subtasks.some((subtask) => subtask.id === overSubtaskId)
          ) {
            const oldIndex = parentTask.subtasks.findIndex((subtask) => subtask.id === activeId);
            const newIndex = parentTask.subtasks.findIndex(
              (subtask) => subtask.id === overSubtaskId,
            );
            if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
              reorderedSubtasks = arrayMove(parentTask.subtasks, oldIndex, newIndex);
            }
          }
        }

        void moveSubtask(active.taskId, originSubtask, targetColumnId, reorderedSubtasks);
        return;
      }

      // Column did not change
      if (overId.startsWith('subtask:')) {
        const overSubtaskId = overId.replace(/^subtask:/, '');
        if (overSubtaskId !== activeId) {
          const parentTask = board.columns
            .flatMap((column) => column.tasks)
            .find((task) => task.subtasks.some((subtask) => subtask.id === activeId));
          if (parentTask && parentTask.subtasks.some((subtask) => subtask.id === overSubtaskId)) {
            const oldIndex = parentTask.subtasks.findIndex((subtask) => subtask.id === activeId);
            const newIndex = parentTask.subtasks.findIndex(
              (subtask) => subtask.id === overSubtaskId,
            );
            if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
              void saveBoardSubtaskOrder(
                parentTask,
                arrayMove(parentTask.subtasks, oldIndex, newIndex),
              );
              return;
            }
          }
        }
      }

      setBoard(origin);
      dragOriginBoard.current = null;
      flushPendingReload();
      return;
    }

    const taskId = String(event.active.id).replace(/^task:/, '');
    if (!origin) {
      dragOriginBoard.current = null;
      flushPendingReload();
      return;
    }
    const previous = findTaskLocation(taskId, origin);
    if (!previous) {
      dragOriginBoard.current = null;
      flushPendingReload();
      return;
    }

    const targetColumnIndex = taskPreview
      ? origin.columns.findIndex((column) => column.id === taskPreview.columnId)
      : -1;
    if (targetColumnIndex < 0) {
      setBoard(origin);
      dragOriginBoard.current = null;
      flushPendingReload();
      return;
    }

    if (targetColumnIndex === previous.columnIndex && taskPreview?.index === previous.taskIndex) {
      setBoard(origin);
      dragOriginBoard.current = null;
      flushPendingReload();
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
    updateBusy(true);
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
      updateBusy(false);
      flushPendingReload();
    }
  }

  async function handlePriorityChange(task: TaskCard, priority: TaskPriority) {
    if (task.priority === priority) return;
    try {
      await request(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ priority }),
      });
      toast.success(`Priority set to ${priority.toLowerCase()}.`);
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not change priority.');
    }
  }

  async function handleTypeChange(task: TaskCard, type: TaskType) {
    if (task.type === type) return;
    try {
      await request(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ type }),
      });
      toast.success(`Converted to ${type === 'BUG' ? 'bug' : 'task'}.`);
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not change item type.');
    }
  }

  async function handleToggleAssignee(task: TaskCard, userId: string) {
    const currentIds = task.assignees.map((a) => a.user.id);
    const nextIds = currentIds.includes(userId)
      ? currentIds.filter((id) => id !== userId)
      : [...currentIds, userId];
    try {
      await request(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assigneeIds: nextIds }),
      });
      toast.success('Assignees updated.');
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not update assignees.');
    }
  }

  async function handleAssignSelf(task: TaskCard) {
    if (!user?.id) return;
    const currentIds = task.assignees.map((a) => a.user.id);
    if (currentIds.includes(user.id)) return;
    try {
      await request(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assigneeIds: [...currentIds, user.id] }),
      });
      toast.success('Assigned to you.');
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not assign task.');
    }
  }

  async function handleClearAssignees(task: TaskCard) {
    try {
      await request(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assigneeIds: [] }),
      });
      toast.success('All assignees cleared.');
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not clear assignees.');
    }
  }

  async function handleDeleteTask(task: TaskCard) {
    if (!window.confirm(`Delete “${task.title}” and all of its subtasks and files?`)) return;
    try {
      await request<void>(`/tasks/${task.id}`, { method: 'DELETE' });
      toast.success('Task deleted.');
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not delete the task.');
    }
  }

  async function handleSaveTitle(newTitle: string) {
    if (!editingTitleItem) return;
    if (editingTitleItem.type === 'task') {
      try {
        await request(`/tasks/${editingTitleItem.item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ title: newTitle }),
        });
        toast.success('Task title updated.');
        await load();
      } catch (caught) {
        toast.fromError(caught, 'Could not update task title.');
      }
    } else {
      try {
        await request(
          `/tasks/${editingTitleItem.item.taskId}/subtasks/${editingTitleItem.item.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ title: newTitle }),
          },
        );
        toast.success('Subtask title updated.');
        await load();
      } catch (caught) {
        toast.fromError(caught, 'Could not update subtask title.');
      }
    }
  }

  async function handleSaveDescription(newDescription: string) {
    if (!editingDescriptionItem) return;
    if (editingDescriptionItem.type === 'task') {
      try {
        await request(`/tasks/${editingDescriptionItem.item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ description: newDescription || null }),
        });
        toast.success('Task description updated.');
        await load();
      } catch (caught) {
        toast.fromError(caught, 'Could not update task description.');
      }
    } else {
      try {
        await request(
          `/tasks/${editingDescriptionItem.item.taskId}/subtasks/${editingDescriptionItem.item.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ description: newDescription || null }),
          },
        );
        toast.success('Subtask description updated.');
        await load();
      } catch (caught) {
        toast.fromError(caught, 'Could not update subtask description.');
      }
    }
  }

  async function handleSaveSubtaskAssignee(assigneeId: string | null) {
    if (!editingSubtaskAssignee) return;
    try {
      await request(
        `/tasks/${editingSubtaskAssignee.taskId}/subtasks/${editingSubtaskAssignee.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ assigneeId }),
        },
      );
      toast.success('Subtask assignee updated.');
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not update subtask assignee.');
    }
  }

  async function handleSubtaskAssignUser(subtask: BoardSubtask, userId: string | null) {
    try {
      await request(`/tasks/${subtask.taskId}/subtasks/${subtask.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assigneeId: userId }),
      });
      toast.success(userId ? 'Subtask assigned.' : 'Subtask unassigned.');
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not update subtask assignee.');
    }
  }

  async function handleSubtaskPriorityChange(subtask: BoardSubtask, priority: TaskPriority) {
    try {
      await request(`/tasks/${subtask.taskId}/subtasks/${subtask.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ priority }),
      });
      toast.success(`Priority set to ${priority.toLowerCase()}.`);
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not change subtask priority.');
    }
  }

  async function handleSubtaskDelete(subtask: BoardSubtask) {
    if (!window.confirm(`Delete “${subtask.title}”?`)) return;
    try {
      await request<void>(`/tasks/${subtask.taskId}/subtasks/${subtask.id}`, {
        method: 'DELETE',
      });
      toast.success('Subtask deleted.');
      await load();
    } catch (caught) {
      toast.fromError(caught, 'Could not delete subtask.');
    }
  }

  return (
    <div className="page-stack board-page">
      <HeaderActions>
        <div
          className={`board-live-badge ${isConnected ? 'is-connected' : 'is-disconnected'}`}
          title={
            isConnected
              ? 'Real-time board synchronization is connected'
              : 'Connecting to real-time synchronization...'
          }
          aria-label={isConnected ? 'Live sync connected' : 'Connecting to live sync'}
        >
          <span className="live-dot" />
          <span>{isConnected ? 'Live' : 'Connecting'}</span>
        </div>
        <Button nativeButton={false} variant="outline" render={<Link href="/sprints/history" />}>
          Sprint History
        </Button>
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
        {sprints.length > 0 ? (
          <label className="board-filter-sprint">
            <Select
              aria-label="Sprint"
              placeholder="Sprint"
              value={filters.sprintId || undefined}
              onChange={(event) => setFilters({ ...filters, sprintId: event.target.value })}
            >
              <option value="">All active work</option>
              {sprints.map((sp) => (
                <option value={sp.id} key={sp.id}>
                  {sp.name}{' '}
                  {sp.status === 'ACTIVE'
                    ? '· Active'
                    : sp.status === 'COMPLETED'
                      ? '· Completed'
                      : '· Planned'}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        <label className="board-filter-project">
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
        <label className="board-filter-assignee">
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
        <label className="board-filter-estimate">
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
        <label className="board-filter-priority">
          <PrioritySelect
            allowAny
            aria-label="Priority"
            placeholder="Priority"
            value={filters.priority}
            onChange={(value) => setFilters({ ...filters, priority: value })}
          />
        </label>
        <label className="board-filter-type">
          <TaskTypeSelect
            allowAny
            aria-label="Type"
            placeholder="Type"
            value={filters.type}
            onChange={(value) => setFilters({ ...filters, type: value })}
          />
        </label>
        <label className="board-filter-sort">
          <Select
            aria-label="Sort by"
            placeholder="Sort by"
            value={filters.sortBy || undefined}
            onChange={(event) =>
              setFilters({
                ...filters,
                sortBy: isValidBoardSortOption(event.target.value) ? event.target.value : '',
              })
            }
          >
            {BOARD_SORT_OPTIONS.map((opt) => (
              <option value={opt.value} key={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
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

      {!displayedBoard ? (
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
            {displayedBoard.columns.map((column) => {
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
                            type={task.type}
                            disabled={busy}
                            onNavigateGuard={guardCardNavigation}
                          >
                            <TaskCardContent
                              task={task}
                              users={users}
                              currentUserId={user?.id}
                              disabled={busy}
                              onNavigateGuard={guardCardNavigation}
                              onEditTitle={(t) => setEditingTitleItem({ type: 'task', item: t })}
                              onEditDescription={(t) =>
                                setEditingDescriptionItem({ type: 'task', item: t })
                              }
                              onPriorityChange={handlePriorityChange}
                              onTypeChange={handleTypeChange}
                              onToggleAssignee={handleToggleAssignee}
                              onAssignSelf={handleAssignSelf}
                              onClearAssignees={handleClearAssignees}
                              onDelete={handleDeleteTask}
                              onEditSubtaskTitle={(s) =>
                                setEditingTitleItem({ type: 'subtask', item: s })
                              }
                              onEditSubtaskDescription={(s) =>
                                setEditingDescriptionItem({ type: 'subtask', item: s })
                              }
                              onEditSubtaskAssignee={(s) => setEditingSubtaskAssignee(s)}
                              onSubtaskAssignUser={handleSubtaskAssignUser}
                              onSubtaskPriorityChange={handleSubtaskPriorityChange}
                              onSubtaskDelete={handleSubtaskDelete}
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
                            users={users}
                            currentUserId={user?.id}
                            disabled={busy}
                            standalone
                            onNavigateGuard={guardCardNavigation}
                            onEditTitle={(s) => setEditingTitleItem({ type: 'subtask', item: s })}
                            onEditDescription={(s) =>
                              setEditingDescriptionItem({ type: 'subtask', item: s })
                            }
                            onEditAssignee={(s) => setEditingSubtaskAssignee(s)}
                            onAssignUser={handleSubtaskAssignUser}
                            onPriorityChange={handleSubtaskPriorityChange}
                            onDelete={handleSubtaskDelete}
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
              <article className="task-card task-card--overlay" data-type={activeDrag.task.type}>
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

      <QuickEditTitleModal
        open={Boolean(editingTitleItem)}
        initialTitle={editingTitleItem?.item.title ?? ''}
        itemType={editingTitleItem?.type ?? 'task'}
        onClose={() => setEditingTitleItem(null)}
        onSave={handleSaveTitle}
      />

      <QuickEditDescriptionModal
        open={Boolean(editingDescriptionItem)}
        initialDescription={editingDescriptionItem?.item.description ?? ''}
        itemType={editingDescriptionItem?.type ?? 'task'}
        onClose={() => setEditingDescriptionItem(null)}
        onSave={handleSaveDescription}
      />

      <QuickEditAssigneeModal
        open={Boolean(editingSubtaskAssignee)}
        currentAssigneeId={editingSubtaskAssignee?.assigneeId ?? null}
        users={users}
        itemType="subtask"
        onClose={() => setEditingSubtaskAssignee(null)}
        onSave={handleSaveSubtaskAssignee}
      />
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
  users = [],
  currentUserId,
  disabled = false,
  interactive = true,
  onNavigateGuard,
  onEditTitle,
  onEditDescription,
  onPriorityChange,
  onTypeChange,
  onToggleAssignee,
  onAssignSelf,
  onClearAssignees,
  onDelete,
  onEditSubtaskTitle,
  onEditSubtaskDescription,
  onEditSubtaskAssignee,
  onSubtaskAssignUser,
  onSubtaskPriorityChange,
  onSubtaskDelete,
}: {
  task: TaskCard;
  users?: ManagedUser[];
  currentUserId?: string;
  disabled?: boolean;
  interactive?: boolean;
  onNavigateGuard?: (event: { preventDefault(): void; stopPropagation(): void }) => void;
  onEditTitle?: (task: TaskCard) => void;
  onEditDescription?: (task: TaskCard) => void;
  onPriorityChange?: (task: TaskCard, priority: TaskPriority) => void | Promise<void>;
  onTypeChange?: (task: TaskCard, type: TaskType) => void | Promise<void>;
  onToggleAssignee?: (task: TaskCard, userId: string) => void | Promise<void>;
  onAssignSelf?: (task: TaskCard) => void | Promise<void>;
  onClearAssignees?: (task: TaskCard) => void | Promise<void>;
  onDelete?: (task: TaskCard) => void | Promise<void>;
  onEditSubtaskTitle?: (subtask: BoardSubtask) => void;
  onEditSubtaskDescription?: (subtask: BoardSubtask) => void;
  onEditSubtaskAssignee?: (subtask: BoardSubtask) => void;
  onSubtaskAssignUser?: (subtask: BoardSubtask, userId: string | null) => void | Promise<void>;
  onSubtaskPriorityChange?: (subtask: BoardSubtask, priority: TaskPriority) => void | Promise<void>;
  onSubtaskDelete?: (subtask: BoardSubtask) => void | Promise<void>;
}) {
  const completed = task.subtasks.filter((item) => item.isCompleted).length;
  return (
    <>
      <Link
        href={`/tasks/${task.id}`}
        className="task-card-main"
        data-priority={task.priority}
        data-type={task.type}
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
            <div className="task-card-tags">
              <TaskIdBadge id={task.id} />
              <TaskTypeBadge type={task.type} />
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
                      {project.key ? project.key : project.name}
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
                  {task.project.key ? task.project.key : task.project.name}
                </span>
              ) : null}
            </div>
            <h2 title={task.title}>{task.title}</h2>
          </div>
          {interactive && onEditTitle && onEditDescription ? (
            <div className="task-card-header-actions">
              <TaskCardMenu
                task={task}
                users={users}
                currentUserId={currentUserId}
                disabled={disabled}
                onEditTitle={onEditTitle}
                onEditDescription={onEditDescription}
                onPriorityChange={onPriorityChange ?? (() => {})}
                onTypeChange={onTypeChange ?? (() => {})}
                onToggleAssignee={onToggleAssignee ?? (() => {})}
                onAssignSelf={onAssignSelf ?? (() => {})}
                onClearAssignees={onClearAssignees ?? (() => {})}
                onDelete={onDelete ?? (() => {})}
              />
            </div>
          ) : null}
        </div>
        <p
          className={task.description ? undefined : 'is-empty'}
          title={task.description || undefined}
        >
          {task.description || '\u00A0'}
        </p>
        <div className="task-card-footer">
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
          <div
            className="card-assignees"
            aria-label={
              task.assignees.length
                ? `Assigned to ${task.assignees.map((item) => item.user.displayName).join(', ')}`
                : 'Unassigned'
            }
          >
            {task.assignees.length ? (
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
                {task.assignees.length > 3 ? (
                  <span
                    title={task.assignees
                      .slice(3)
                      .map((item) => item.user.displayName)
                      .join(', ')}
                  >
                    +{task.assignees.length - 3}
                  </span>
                ) : null}
              </div>
            ) : (
              <span className="unassigned-label" title="Unassigned">
                —
              </span>
            )}
          </div>
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
                  users={users}
                  currentUserId={currentUserId}
                  disabled={disabled}
                  onNavigateGuard={onNavigateGuard}
                  onEditTitle={onEditSubtaskTitle}
                  onEditDescription={onEditSubtaskDescription}
                  onEditAssignee={onEditSubtaskAssignee}
                  onAssignUser={onSubtaskAssignUser}
                  onPriorityChange={onSubtaskPriorityChange}
                  onDelete={onSubtaskDelete}
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
  type,
  disabled,
  children,
  onNavigateGuard,
}: PropsWithChildren<{
  id: string;
  columnId: string;
  title: string;
  type?: TaskType;
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
      data-type={type}
      title={disabled ? undefined : title}
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
  users = [],
  currentUserId,
  disabled,
  standalone = false,
  onNavigateGuard,
  onEditTitle,
  onEditDescription,
  onEditAssignee,
  onAssignUser,
  onPriorityChange,
  onDelete,
}: {
  subtask: BoardSubtask;
  task: Pick<TaskCard, 'id' | 'title'>;
  users?: ManagedUser[];
  currentUserId?: string;
  disabled: boolean;
  standalone?: boolean;
  onNavigateGuard?: (event: { preventDefault(): void; stopPropagation(): void }) => void;
  onEditTitle?: (subtask: BoardSubtask) => void;
  onEditDescription?: (subtask: BoardSubtask) => void;
  onEditAssignee?: (subtask: BoardSubtask) => void;
  onAssignUser?: (subtask: BoardSubtask, userId: string | null) => void | Promise<void>;
  onPriorityChange?: (subtask: BoardSubtask, priority: TaskPriority) => void | Promise<void>;
  onDelete?: (subtask: BoardSubtask) => void | Promise<void>;
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
      title={disabled ? undefined : title}
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
        users={users}
        currentUserId={currentUserId}
        disabled={disabled}
        onNavigateGuard={onNavigateGuard}
        onEditTitle={onEditTitle}
        onEditDescription={onEditDescription}
        onEditAssignee={onEditAssignee}
        onAssignUser={onAssignUser}
        onPriorityChange={onPriorityChange}
        onDelete={onDelete}
      />
    </div>
  );
}

function BoardSubtaskCard({
  subtask,
  task,
  standalone = false,
  users = [],
  currentUserId,
  disabled = false,
  interactive = true,
  onNavigateGuard,
  onEditTitle,
  onEditDescription,
  onEditAssignee,
  onAssignUser,
  onPriorityChange,
  onDelete,
}: {
  subtask: BoardSubtask;
  task?: { id: string; title: string };
  standalone?: boolean;
  users?: ManagedUser[];
  currentUserId?: string;
  disabled?: boolean;
  interactive?: boolean;
  onNavigateGuard?: (event: { preventDefault(): void; stopPropagation(): void }) => void;
  onEditTitle?: (subtask: BoardSubtask) => void;
  onEditDescription?: (subtask: BoardSubtask) => void;
  onEditAssignee?: (subtask: BoardSubtask) => void;
  onAssignUser?: (subtask: BoardSubtask, userId: string | null) => void | Promise<void>;
  onPriorityChange?: (subtask: BoardSubtask, priority: TaskPriority) => void | Promise<void>;
  onDelete?: (subtask: BoardSubtask) => void | Promise<void>;
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
      tabIndex={interactive ? undefined : -1}
      onClick={(event) => {
        if (!interactive) {
          event.preventDefault();
          return;
        }
        onNavigateGuard?.(event);
      }}
    >
      <span className="board-subtask-marker" aria-hidden="true" />
      <div className="board-subtask-copy">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <small>{standalone ? `Subtask of ${parentTask.title}` : 'Subtask'}</small>
          <TaskIdBadge id={subtask.id} />
        </div>
        <strong title={title}>{title}</strong>
        <p
          className={subtask.description ? undefined : 'is-empty'}
          title={subtask.description || undefined}
        >
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
      <div className="board-subtask-side">
        {interactive && onEditTitle && onEditDescription && onEditAssignee ? (
          <SubtaskCardMenu
            subtask={subtask}
            users={users}
            currentUserId={currentUserId}
            disabled={disabled}
            onEditTitle={onEditTitle}
            onEditDescription={onEditDescription}
            onEditAssignee={onEditAssignee}
            onAssignUser={onAssignUser}
            onPriorityChange={onPriorityChange}
            onDelete={onDelete}
          />
        ) : (
          <span style={{ width: 22, height: 22 }} />
        )}
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
      </div>
    </Link>
  );
}

function formatHours(value: number) {
  return `${value}h`;
}
