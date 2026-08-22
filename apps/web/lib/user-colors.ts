export const USER_COLORS = [
  { value: '#2563EB', label: 'Blue' },
  { value: '#0284C7', label: 'Sky' },
  { value: '#059669', label: 'Emerald' },
  { value: '#10B981', label: 'Green' },
  { value: '#7C3AED', label: 'Violet' },
  { value: '#C026D3', label: 'Fuchsia' },
  { value: '#E11D48', label: 'Rose' },
  { value: '#EA580C', label: 'Orange' },
  { value: '#D97706', label: 'Amber' },
  { value: '#64748B', label: 'Slate' },
] as const;

export function pickLeastUsedUserColor(existingColors: Array<string | null | undefined>) {
  const counts = new Map<string, number>(USER_COLORS.map((color) => [color.value, 0]));
  for (const color of existingColors) {
    const key = color?.trim().toUpperCase();
    const match = USER_COLORS.find((item) => item.value.toUpperCase() === key);
    if (match) counts.set(match.value, (counts.get(match.value) ?? 0) + 1);
  }

  let best: string = USER_COLORS[0].value;
  let bestCount = Number.POSITIVE_INFINITY;
  for (const [value, count] of counts) {
    if (count < bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}
