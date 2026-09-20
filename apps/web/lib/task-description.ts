/**
 * Utility functions for evaluating task descriptions and accordion thresholds.
 */

/**
 * Checks if a task description is considered "long" based on character count or line breaks.
 * A description is long if it exceeds 95 characters or contains 3 or more lines of text.
 */
export function isDescriptionLong(text?: string | null): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length > 95) return true;
  const lines = trimmed.split('\n');
  if (lines.length > 2) return true;
  return false;
}
