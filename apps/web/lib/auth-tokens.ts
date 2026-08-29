export interface JwtPayload {
  sub?: string;
  username?: string;
  role?: string;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

export function parseJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload =
      typeof atob === 'function'
        ? decodeURIComponent(
            atob(base64)
              .split('')
              .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join(''),
          )
        : Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(jsonPayload) as JwtPayload;
  } catch {
    return null;
  }
}

export function getJwtExpiryMs(token: string): number | null {
  const payload = parseJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return null;
  return payload.exp * 1000;
}

export function isTokenExpiringSoon(
  token: string | null | undefined,
  bufferSeconds = 60,
  nowMs = Date.now(),
): boolean {
  if (!token) return true;
  const expiryMs = getJwtExpiryMs(token);
  if (expiryMs === null) return true;
  return nowMs >= expiryMs - bufferSeconds * 1000;
}

export function getTimeUntilRefreshMs(
  token: string,
  bufferSeconds = 60,
  minDelayMs = 5000,
  nowMs = Date.now(),
): number {
  const expiryMs = getJwtExpiryMs(token);
  if (expiryMs === null) return minDelayMs;
  const refreshAtMs = expiryMs - bufferSeconds * 1000;
  const remainingMs = refreshAtMs - nowMs;
  return Math.max(remainingMs, minDelayMs);
}
