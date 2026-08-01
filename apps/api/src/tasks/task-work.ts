export function isBacklogColumn(
  column: { isBacklog?: boolean; position: number; name?: string },
  columns: Array<{ isBacklog?: boolean; position: number }>,
): boolean {
  if (column.isBacklog === true) return true;
  const anyMarked = columns.some((item) => item.isBacklog === true);
  if (anyMarked) return false;
  const minPosition = Math.min(...columns.map((item) => item.position));
  return column.position === minPosition;
}

export function pickBacklogColumnId<T extends { id: string; isBacklog?: boolean; position: number }>(
  columns: T[],
): string | null {
  if (!columns.length) return null;
  const marked = columns.find((column) => column.isBacklog === true);
  if (marked) return marked.id;
  return [...columns].sort((a, b) => a.position - b.position)[0]?.id ?? null;
}

export function pickTodoColumnId<
  T extends { id: string; isBacklog?: boolean; isTodo?: boolean; isDone?: boolean; position: number },
>(columns: T[]): string | null {
  if (!columns.length) return null;
  const marked = columns.find((column) => column.isTodo === true);
  if (marked) return marked.id;
  return (
    [...columns]
      .filter((column) => column.isBacklog !== true && column.isDone !== true)
      .sort((a, b) => a.position - b.position)[0]?.id ?? null
  );
}
