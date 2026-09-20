import type { BoardColumn, BoardResponse, BoardSubtask } from './types';

type ColumnLike = Pick<BoardColumn, 'position'> & { isBacklog?: boolean };

export function isBacklogColumn(column: ColumnLike, columns: ColumnLike[]): boolean {
  if (column.isBacklog === true) return true;
  if (column.isBacklog === false) return false;
  const minPosition = Math.min(...columns.map((item) => item.position));
  return column.position === minPosition;
}

export function workflowBoard(board: BoardResponse): BoardResponse {
  const seenTaskIds = new Set<string>();
  const columns = board.columns
    .filter((column) => !isBacklogColumn(column, board.columns))
    .map((column) => ({
      ...column,
      tasks: (column.tasks ?? []).filter((task) => {
        if (seenTaskIds.has(task.id)) return false;
        seenTaskIds.add(task.id);
        return true;
      }),
      subtasks: column.subtasks ?? [],
    }));
  return { ...board, columns };
}

export function backlogBoard(board: BoardResponse): BoardResponse {
  const seenTaskIds = new Set<string>();
  const columns = board.columns
    .filter((column) => isBacklogColumn(column, board.columns))
    .map((column) => ({
      ...column,
      tasks: (column.tasks ?? []).filter((task) => {
        if (seenTaskIds.has(task.id)) return false;
        seenTaskIds.add(task.id);
        return true;
      }),
      subtasks: column.subtasks ?? [],
    }));
  return { ...board, columns };
}

export function primaryBacklogColumn(
  board: BoardResponse,
): BoardResponse['columns'][number] | null {
  const columns = backlogBoard(board).columns;
  return columns[0] ?? null;
}

export function placeSubtaskOnColumn(
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

export function findBoardSubtask(
  board: BoardResponse | null,
  subtaskId: string,
): { subtask: BoardSubtask; taskId: string; columnIndex: number } | null {
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

export function resolveBoardColumnIndex(
  board: BoardResponse | null,
  overId: string,
): number {
  if (!board) return -1;
  if (overId.startsWith('column:')) {
    const columnId = overId.replace(/^column:/, '');
    return board.columns.findIndex((column) => column.id === columnId);
  }
  if (overId.startsWith('task:')) {
    const taskId = overId.replace(/^task:/, '');
    return board.columns.findIndex((column) =>
      column.tasks.some((item) => item.id === taskId),
    );
  }
  if (overId.startsWith('subtask:')) {
    const subtaskId = overId.replace(/^subtask:/, '');
    const found = findBoardSubtask(board, subtaskId);
    return found?.columnIndex ?? -1;
  }
  return -1;
}

