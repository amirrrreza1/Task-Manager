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

export interface FormatTaskIdOptions {
  projectKey?: string | null;
  length?: number;
  includeHash?: boolean;
}

export function formatTaskId(id: string, options?: FormatTaskIdOptions): string {
  const shortId = getShortId(id, options?.length ?? 5);
  if (!shortId) return '';

  const projectKey = options?.projectKey?.trim();
  if (projectKey) {
    return `${projectKey.toUpperCase()}-${shortId}`;
  }

  const includeHash = options?.includeHash ?? false;
  return includeHash ? `#${shortId}` : shortId;
}

export function matchesTaskId(
  id: string,
  search: string,
  projectKey?: string | null,
): boolean {
  if (!id || !search) return false;
  const term = search.trim().toLowerCase().replace(/^#/, '');
  if (!term) return false;

  const cleanId = id.toLowerCase().replace(/-/g, '');
  const rawId = id.toLowerCase();
  const shortId = getShortId(id);
  const formatted = formatTaskId(id, { projectKey }).toLowerCase();
  const hashed = `#${shortId}`.toLowerCase();

  return (
    rawId.includes(term) ||
    cleanId.includes(term.replace(/-/g, '')) ||
    shortId.includes(term) ||
    formatted.includes(term) ||
    hashed.includes(term)
  );
}
