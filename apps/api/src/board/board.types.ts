export type BoardEventType =
  | 'task.created'
  | 'task.updated'
  | 'task.moved'
  | 'task.deleted'
  | 'subtask.created'
  | 'subtask.updated'
  | 'subtask.moved'
  | 'subtask.reordered'
  | 'subtask.deleted'
  | 'column.created'
  | 'column.updated'
  | 'column.reordered'
  | 'column.deleted'
  | 'sprint.started'
  | 'sprint.finished'
  | 'sprint.tasks_assigned'
  | 'sprint.subtasks_assigned'
  | 'sprint.work_carried_over'
  | 'sprint.work_moved_to_backlog'
  | 'board.refresh';

export interface BoardEvent {
  workspaceId: string;
  eventType: BoardEventType;
  entityId?: string;
  actorId?: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}
