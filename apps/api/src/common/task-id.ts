export function getShortId(id: string, length = 5): string {
  if (!id) return '';
  const clean = id.trim().replace(/^#/, '');
  if (!clean) return '';

  if (/^\d+$/.test(clean)) {
    return clean.slice(0, length);
  }

  // Deterministic FNV-1a 32-bit hash produces clean numeric-only digits
  let hash = 2166136261;
  for (let i = 0; i < clean.length; i++) {
    hash ^= clean.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const unsigned = hash >>> 0;
  const safeLength = Math.max(1, Math.min(length, 10));
  const min = Math.pow(10, safeLength - 1);
  const range = Math.pow(10, safeLength) - min;
  const num = min + (unsigned % range);
  return String(num);
}
