import { SprintStatus } from '@prisma/client';

export type SprintRef = { id: string; status: SprintStatus };

export function sprintAcceptsNewWork(status: SprintStatus): boolean {
  return status !== SprintStatus.COMPLETED;
}

/** UI planner: disable selecting work already tied to this sprint or locked elsewhere. */
export function isSprintWorkSelectionLocked(
  sprint: SprintRef | null | undefined,
  targetSprintId: string,
): boolean {
  if (!sprint) return false;
  if (sprint.id === targetSprintId) return true;
  return sprint.status === SprintStatus.COMPLETED || sprint.status === SprintStatus.ACTIVE;
}

/** API assign: reject moving work out of completed or a different active sprint. */
export function assertTaskCanJoinSprint(
  taskSprint: SprintRef | null | undefined,
  targetSprintId: string,
): void {
  if (!taskSprint || taskSprint.id === targetSprintId) return;
  if (taskSprint.status === SprintStatus.COMPLETED) {
    throw new Error('Tasks in completed sprints cannot be reassigned.');
  }
  if (taskSprint.status === SprintStatus.ACTIVE) {
    throw new Error('Tasks in another active sprint cannot be reassigned.');
  }
}

export function assertSubtaskCanJoinSprint(
  subtaskSprint: SprintRef | null | undefined,
  targetSprintId: string,
): void {
  if (!subtaskSprint || subtaskSprint.id === targetSprintId) return;
  if (subtaskSprint.status === SprintStatus.COMPLETED) {
    throw new Error('Subtasks in completed sprints cannot be reassigned.');
  }
  if (subtaskSprint.status === SprintStatus.ACTIVE) {
    throw new Error('Subtasks in another active sprint cannot be reassigned.');
  }
}

export function sprintOutcomeTotals(
  items: Array<{
    estimateValue: number | null;
    estimateUnit: string | null;
    wasDone?: boolean;
    column?: { isDone: boolean };
  }>,
) {
  const estimates: Record<string, number> = {};
  let completed = 0;
  for (const item of items) {
    if (item.wasDone ?? item.column?.isDone) completed += 1;
    if (item.estimateValue && item.estimateUnit) {
      estimates[item.estimateUnit] = (estimates[item.estimateUnit] ?? 0) + item.estimateValue;
    }
  }
  return { total: items.length, completed, incomplete: items.length - completed, estimates };
}
