import type { EstimateUnit } from './types';

/**
 * Parses user estimate input allowing both dot and comma decimal notations (e.g., "0.5" or "0,25").
 * Returns:
 * - null: for empty or whitespace-only input (clearing/omitting estimate)
 * - NaN: for non-numeric input or non-positive numbers (<= 0)
 * - number: valid positive number
 */
export function parseEstimateInput(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return NaN;
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Replace comma decimal separator with dot
  const normalized = trimmed.replace(',', '.');
  const parsed = Number(normalized);

  if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed <= 0) {
    return NaN;
  }

  return parsed;
}

/**
 * Returns formatted estimate input string for forms (e.g., "0.5" or "0.25").
 */
export function formatEstimateInput(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return String(value);
}

/**
 * Calculates sum of subtask estimates for parent task.
 */
export function calculateSubtasksEstimate(
  subtasks: Array<{ estimateValue?: number | null; estimateUnit?: EstimateUnit | null }>,
  defaultUnit: EstimateUnit = 'HOURS',
): { estimateValue: number | null; estimateUnit: EstimateUnit | null } {
  if (!subtasks || subtasks.length === 0) {
    return { estimateValue: null, estimateUnit: null };
  }

  const estimated = subtasks.filter(
    (s): s is { estimateValue: number; estimateUnit?: EstimateUnit | null } =>
      typeof s.estimateValue === 'number' &&
      Number.isFinite(s.estimateValue) &&
      s.estimateValue > 0,
  );

  if (estimated.length === 0) {
    return { estimateValue: null, estimateUnit: null };
  }

  const unit = estimated.find((s) => s.estimateUnit)?.estimateUnit ?? defaultUnit;

  if (unit === 'POINTS') {
    const sum = Math.round(estimated.reduce((acc, s) => acc + s.estimateValue, 0));
    const clamped = Math.min(Math.max(sum, 1), 10000);
    return { estimateValue: clamped, estimateUnit: 'POINTS' };
  } else {
    const rawSum = estimated.reduce((acc, s) => acc + s.estimateValue, 0);
    const sum = Math.round((rawSum + Number.EPSILON) * 100) / 100;
    const clamped = Math.min(Math.max(sum, 0.01), 8760);
    return { estimateValue: clamped, estimateUnit: 'HOURS' };
  }
}
