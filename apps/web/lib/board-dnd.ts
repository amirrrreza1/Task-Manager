interface TaskDropIndexOptions {
  taskIds: string[];
  activeTaskId: string;
  overTaskId?: string;
  activeCenterY?: number;
  overCenterY?: number;
  pointerY?: number;
  taskRects?: Array<{ taskId: string; top: number; height: number }>;
}

/**
 * Finds the position for a task while it is being dragged within or across
 * columns. The active task is removed first so the returned index always
 * describes the visible gap, rather than the task's previous position.
 */
export function taskDropIndex({
  taskIds,
  activeTaskId,
  overTaskId,
  activeCenterY,
  overCenterY,
  pointerY,
  taskRects,
}: TaskDropIndexOptions): number {
  const candidates = taskIds.filter((taskId) => taskId !== activeTaskId);

  if (pointerY !== undefined && taskRects) {
    const candidateRects = taskRects.filter((rect) => rect.taskId !== activeTaskId);
    const nextTaskIndex = candidateRects.findIndex(
      (rect) => pointerY < rect.top + rect.height / 2,
    );
    return nextTaskIndex < 0 ? candidateRects.length : nextTaskIndex;
  }

  if (!overTaskId) return candidates.length;

  const overIndex = candidates.indexOf(overTaskId);
  if (overIndex < 0) return candidates.length;

  const isBelowOverTask =
    activeCenterY !== undefined &&
    overCenterY !== undefined &&
    activeCenterY > overCenterY;

  return overIndex + (isBelowOverTask ? 1 : 0);
}
