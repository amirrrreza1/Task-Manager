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
import type { CurrentUser } from '../lib/types';

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
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);
  const refreshPromise = useRef<Promise<string | null> | null>(null);
  const router = useRouter();

  const refresh = useCallback(async () => {
    if (refreshPromise.current) return refreshPromise.current;
    refreshPromise.current = (async () => {
      try {
        const response = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        const session = await parseApiResponse<SessionResponse>(response);
        tokenRef.current = session.accessToken;
        setUser(session.user);
        return session.accessToken;
      } catch {
        tokenRef.current = null;
        setUser(null);
        return null;
      } finally {
        refreshPromise.current = null;
        setLoading(false);
      }
    })();
    return refreshPromise.current;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const session = await parseApiResponse<SessionResponse>(response);
    tokenRef.current = session.accessToken;
    setUser(session.user);
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    } finally {
      tokenRef.current = null;
      setUser(null);
      router.replace('/login');
    }
  }, [router]);

  const updateUser = useCallback((patch: Partial<CurrentUser>) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const request = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      let token = tokenRef.current ?? (await refresh());
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
      let token = tokenRef.current ?? (await refresh());
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

  const value = useMemo(
    () => ({ user, loading, login, logout, updateUser, request, requestBlob }),
    [user, loading, login, logout, updateUser, request, requestBlob],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
