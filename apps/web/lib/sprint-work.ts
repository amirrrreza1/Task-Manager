export type SprintStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED';

export type SprintRef = { id: string; status: SprintStatus };

export function isSprintWorkSelectionLocked(
  sprint: SprintRef | null | undefined,
  targetSprintId: string,
): boolean {
  if (!sprint) return false;
  if (sprint.id === targetSprintId) return true;
  return sprint.status === 'COMPLETED' || sprint.status === 'ACTIVE';
}
