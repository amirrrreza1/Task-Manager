export const USER_COLORS = [
  '#2563EB',
  '#0284C7',
  '#059669',
  '#10B981',
  '#7C3AED',
  '#C026D3',
  '#E11D48',
  '#EA580C',
  '#D97706',
  '#64748B',
] as const;

export type UserColor = (typeof USER_COLORS)[number];

const USER_COLOR_SET = new Set<string>(USER_COLORS);

export function normalizeUserColor(value: string): UserColor | null {
  const normalized = value.trim().toUpperCase();
  const match = USER_COLORS.find((color) => color.toUpperCase() === normalized);
  return match ?? null;
}

export function toUserColorInput(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  return normalizeUserColor(value) ?? value.trim();
}

export function pickLeastUsedUserColor(
  existingColors: string[],
  preferred?: string | null,
): UserColor {
  const chosen = preferred ? normalizeUserColor(preferred) : null;
  if (chosen && USER_COLOR_SET.has(chosen)) return chosen;

  const counts = new Map<string, number>(USER_COLORS.map((color) => [color, 0]));
  for (const color of existingColors) {
    const key = normalizeUserColor(color);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let best: UserColor = USER_COLORS[0];
  let bestCount = Number.POSITIVE_INFINITY;
  for (const color of USER_COLORS) {
    const count = counts.get(color) ?? 0;
    if (count < bestCount) {
      best = color;
      bestCount = count;
    }
  }
  return best;
}
