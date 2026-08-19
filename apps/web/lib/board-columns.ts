import type { BoardColumn, BoardResponse } from './types';

type ColumnLike = Pick<BoardColumn, 'position'> & { isBacklog?: boolean };

export function isBacklogColumn(column: ColumnLike, columns: ColumnLike[]): boolean {
  if (column.isBacklog === true) return true;
  if (column.isBacklog === false) return false;
  const minPosition = Math.min(...columns.map((item) => item.position));
  return column.position === minPosition;
}

export function workflowBoard(board: BoardResponse): BoardResponse {
  const columns = board.columns
    .filter((column) => !isBacklogColumn(column, board.columns))
    .map((column) => ({
      ...column,
      subtasks: column.subtasks ?? [],
    }));
  return { ...board, columns };
}

export function backlogBoard(board: BoardResponse): BoardResponse {
  const columns = board.columns
    .filter((column) => isBacklogColumn(column, board.columns))
    .map((column) => ({
      ...column,
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
