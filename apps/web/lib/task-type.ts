import type { TaskType } from './types';

export const TASK_TYPES = ['TASK', 'BUG'] as const satisfies readonly TaskType[];

export const DEFAULT_TASK_TYPE: TaskType = 'TASK';

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  TASK: 'Task',
  BUG: 'Bug',
};

export function isTaskType(value: string): value is TaskType {
  return (TASK_TYPES as readonly string[]).includes(value);
}
