'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { API_URL, ApiError, parseApiResponse } from '../lib/api';
import {
  getTimeUntilRefreshMs,
  isTokenExpiringSoon,
} from '../lib/auth-tokens';
import type { CurrentUser } from '../lib/types';

const TOKEN_STORAGE_KEY = 'task_manager_auth_token';
const USER_STORAGE_KEY = 'task_manager_auth_user';

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) return null;
    if (isTokenExpiringSoon(token, 0)) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

function getStoredUser(): CurrentUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const userJson = localStorage.getItem(USER_STORAGE_KEY);
    if (!userJson) return null;
    return JSON.parse(userJson) as CurrentUser;
  } catch {
    return null;
  }
}

function persistSession(token: string | null, user: CurrentUser | null) {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
    if (user) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_STORAGE_KEY);
    }
  } catch {
    // LocalStorage quota or security error fallback
  }
}

interface SessionResponse {
  accessToken: string;
  user: CurrentUser;
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  updateUser(patch: Partial<CurrentUser>): void;
  request<T>(path: string, init?: RequestInit): Promise<T>;
  requestBlob(path: string): Promise<Blob>;
  getToken(): Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(() => getStoredUser());
  const tokenRef = useRef<string | null>(getStoredToken());
  const [loading, setLoading] = useState(() => {
    const cachedToken = getStoredToken();
    const cachedUser = getStoredUser();
    return !(cachedToken && cachedUser);
  });
  const refreshPromise = useRef<Promise<string | null> | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleTokenRefresh = useCallback(
    (accessToken: string) => {
      clearRefreshTimer();
      const delayMs = getTimeUntilRefreshMs(accessToken, 60, 5000);
      refreshTimerRef.current = setTimeout(() => {
        void refresh();
      }, delayMs);
    },
    [clearRefreshTimer],
  );

  const refresh = useCallback(async (): Promise<string | null> => {
    if (refreshPromise.current) return refreshPromise.current;
    refreshPromise.current = (async () => {
      try {
        const response = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });

        if (!response.ok) {
          // If the server explicitly rejected the refresh session (401 or 403),
          // check if we still have a valid (unexpired) access token before clearing user state.
          if (response.status === 401 || response.status === 403) {
            const currentToken = tokenRef.current;
            if (!currentToken || isTokenExpiringSoon(currentToken, 0)) {
              clearRefreshTimer();
              tokenRef.current = null;
              setUser(null);
              persistSession(null, null);
              return null;
            }
            // Keep existing valid access token if refresh was rejected but token is still active
            return currentToken;
          }
          throw new ApiError(response.statusText ?? 'Refresh failed', response.status);
        }

        const session = await parseApiResponse<SessionResponse>(response);
        tokenRef.current = session.accessToken;
        setUser(session.user);
        persistSession(session.accessToken, session.user);
        scheduleTokenRefresh(session.accessToken);
        return session.accessToken;
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          const currentToken = tokenRef.current;
          if (!currentToken || isTokenExpiringSoon(currentToken, 0)) {
            clearRefreshTimer();
            tokenRef.current = null;
            setUser(null);
            persistSession(null, null);
            return null;
          }
          return currentToken;
        }
        return tokenRef.current;
      } finally {
        refreshPromise.current = null;
        setLoading(false);
      }
    })();
    return refreshPromise.current;
  }, [clearRefreshTimer, scheduleTokenRefresh]);

  useEffect(() => {
    void refresh();
    return () => {
      clearRefreshTimer();
    };
  }, [refresh, clearRefreshTimer]);

  useEffect(() => {
    function handleVisibilityOrFocus() {
      if (document.visibilityState === 'visible') {
        if (tokenRef.current && isTokenExpiringSoon(tokenRef.current, 120)) {
          void refresh();
        }
      }
    }
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [refresh]);

  const login = useCallback(
    async (username: string, password: string) => {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const session = await parseApiResponse<SessionResponse>(response);
      tokenRef.current = session.accessToken;
      setUser(session.user);
      persistSession(session.accessToken, session.user);
      setLoading(false);
      scheduleTokenRefresh(session.accessToken);
    },
    [scheduleTokenRefresh],
  );

  const logout = useCallback(async () => {
    clearRefreshTimer();
    try {
      await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    } finally {
      tokenRef.current = null;
      setUser(null);
      persistSession(null, null);
      router.replace('/login');
    }
  }, [clearRefreshTimer, router]);

  const updateUser = useCallback((patch: Partial<CurrentUser>) => {
    setUser((current) => {
      const updated = current ? { ...current, ...patch } : current;
      if (updated) {
        persistSession(tokenRef.current, updated);
      }
      return updated;
    });
  }, []);

  const request = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      let token = tokenRef.current;
      if (!token || isTokenExpiringSoon(token, 15)) {
        token = await refresh();
      }
      if (!token) throw new ApiError('Please sign in to continue.', 401);

      const send = (accessToken: string) =>
        fetch(`${API_URL}${path}`, {
          ...init,
          credentials: 'include',
          headers: {
            ...(init.body && !(init.body instanceof FormData)
              ? { 'Content-Type': 'application/json' }
              : {}),
            ...init.headers,
            Authorization: `Bearer ${accessToken}`,
          },
        });

      let response = await send(token);
      if (response.status === 401) {
        tokenRef.current = null;
        token = await refresh();
        if (!token) throw new ApiError('Your session has expired. Please sign in again.', 401);
        response = await send(token);
      }
      return parseApiResponse<T>(response);
    },
    [refresh],
  );

  const requestBlob = useCallback(
    async (path: string): Promise<Blob> => {
      let token = tokenRef.current;
      if (!token || isTokenExpiringSoon(token, 15)) {
        token = await refresh();
      }
      if (!token) throw new ApiError('Please sign in to continue.', 401);
      let response = await fetch(`${API_URL}${path}`, {
        credentials: 'include',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        tokenRef.current = null;
        token = await refresh();
        if (!token) throw new ApiError('Your session has expired. Please sign in again.', 401);
        response = await fetch(`${API_URL}${path}`, {
          credentials: 'include',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      if (!response.ok) await parseApiResponse<never>(response);
      return response.blob();
    },
    [refresh],
  );

  const getToken = useCallback(async (): Promise<string | null> => {
    if (tokenRef.current && !isTokenExpiringSoon(tokenRef.current, 30)) {
      return tokenRef.current;
    }
    return refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ user, loading, login, logout, updateUser, request, requestBlob, getToken }),
    [user, loading, login, logout, updateUser, request, requestBlob, getToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
