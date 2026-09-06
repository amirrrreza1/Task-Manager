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
