import type { BoardResponse, BoardSubtask, TaskCard, TaskPriority } from './types';

export type BoardSortOption =
  | ''
  | 'priority-desc'
  | 'priority-asc'
  | 'estimate-desc'
  | 'estimate-asc'
  | 'title-asc'
  | 'title-desc'
  | 'created-desc'
  | 'created-asc'
  | 'updated-desc';

export interface SortOptionDescriptor {
  value: BoardSortOption;
  label: string;
}

export const BOARD_SORT_OPTIONS: readonly SortOptionDescriptor[] = [
  { value: '', label: 'Default order' },
  { value: 'priority-desc', label: 'Priority: Urgent to Low' },
  { value: 'priority-asc', label: 'Priority: Low to Urgent' },
  { value: 'estimate-desc', label: 'Estimate: High to Low' },
  { value: 'estimate-asc', label: 'Estimate: Low to High' },
  { value: 'title-asc', label: 'Title: A to Z' },
  { value: 'title-desc', label: 'Title: Z to A' },
  { value: 'created-desc', label: 'Created: Newest first' },
  { value: 'created-asc', label: 'Created: Oldest first' },
  { value: 'updated-desc', label: 'Updated: Recently updated' },
] as const;

const VALID_SORT_VALUES = new Set<string>(BOARD_SORT_OPTIONS.map((opt) => opt.value));

export function isValidBoardSortOption(value: unknown): value is BoardSortOption {
  return typeof value === 'string' && VALID_SORT_VALUES.has(value);
}

const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

type SortableItem = {
  title: string;
  priority: TaskPriority;
  estimateValue: number | null;
  createdAt: string;
  updatedAt: string;
};

export function compareWorkItems<T extends SortableItem>(
  a: T,
  b: T,
  sortBy: BoardSortOption,
): number {
  if (!sortBy) return 0;

  switch (sortBy) {
    case 'priority-desc': {
      const weightA = PRIORITY_WEIGHTS[a.priority] ?? 0;
      const weightB = PRIORITY_WEIGHTS[b.priority] ?? 0;
      if (weightA !== weightB) return weightB - weightA;
      break;
    }
    case 'priority-asc': {
      const weightA = PRIORITY_WEIGHTS[a.priority] ?? 0;
      const weightB = PRIORITY_WEIGHTS[b.priority] ?? 0;
      if (weightA !== weightB) return weightA - weightB;
      break;
    }
    case 'estimate-desc': {
      const valA = a.estimateValue;
      const valB = b.estimateValue;
      if (valA !== null && valB === null) return -1;
      if (valA === null && valB !== null) return 1;
      if (valA !== null && valB !== null && valA !== valB) return valB - valA;
      break;
    }
    case 'estimate-asc': {
      const valA = a.estimateValue;
      const valB = b.estimateValue;
      if (valA !== null && valB === null) return -1;
      if (valA === null && valB !== null) return 1;
      if (valA !== null && valB !== null && valA !== valB) return valA - valB;
      break;
    }
    case 'title-asc': {
      const cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      if (cmp !== 0) return cmp;
      break;
    }
    case 'title-desc': {
      const cmp = b.title.localeCompare(a.title, undefined, { sensitivity: 'base' });
      if (cmp !== 0) return cmp;
      break;
    }
    case 'created-desc': {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) return timeB - timeA;
      break;
    }
    case 'created-asc': {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) return timeA - timeB;
      break;
    }
    case 'updated-desc': {
      const timeA = new Date(a.updatedAt).getTime();
      const timeB = new Date(b.updatedAt).getTime();
      if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) return timeB - timeA;
      break;
    }
    default:
      return 0;
  }

  // Stable secondary fallback: compare titles if primary sort is tied
  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
}

export function sortTasks(tasks: TaskCard[], sortBy: BoardSortOption): TaskCard[] {
  if (!sortBy || tasks.length <= 1) return tasks;
  return [...tasks].sort((a, b) => compareWorkItems(a, b, sortBy));
}

export function sortSubtasks(subtasks: BoardSubtask[], sortBy: BoardSortOption): BoardSubtask[] {
  if (!sortBy || subtasks.length <= 1) return subtasks;
  return [...subtasks].sort((a, b) => compareWorkItems(a, b, sortBy));
}

export function applyBoardSort(
  board: BoardResponse | null,
  sortBy: BoardSortOption,
): BoardResponse | null {
  if (!board || !sortBy) return board;

  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      tasks: sortTasks(column.tasks ?? [], sortBy),
      subtasks: sortSubtasks(column.subtasks ?? [], sortBy),
    })),
  };
}
