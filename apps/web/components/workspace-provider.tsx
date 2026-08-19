'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './auth-provider';
import type { Workspace } from '../lib/types';

const STORAGE_KEY = 'task_manager_active_workspace';

interface WorkspaceContextValue {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  currentWorkspaceId: string | null;
  setCurrentWorkspace: (workspace: Workspace) => void;
  setCurrentWorkspaceId: (id: string) => void;
  refreshWorkspaces: () => Promise<void>;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { request, user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshWorkspaces = useCallback(async () => {
    if (!user) {
      setWorkspaces([]);
      setCurrentWorkspaceIdState(null);
      setLoading(false);
      return;
    }
    try {
      const items = await request<Workspace[]>('/workspaces');
      setWorkspaces(items);

      const savedId = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      if (savedId && items.some((w) => w.id === savedId)) {
        setCurrentWorkspaceIdState(savedId);
      } else if (items.length > 0) {
        setCurrentWorkspaceIdState(items[0].id);
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, items[0].id);
        }
      } else {
        setCurrentWorkspaceIdState(null);
      }
    } catch {
      // Best-effort error handling
    } finally {
      setLoading(false);
    }
  }, [request, user]);

  useEffect(() => {
    void refreshWorkspaces();
  }, [refreshWorkspaces]);

  const setCurrentWorkspaceId = useCallback((id: string) => {
    setCurrentWorkspaceIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const setCurrentWorkspace = useCallback(
    (workspace: Workspace) => {
      setCurrentWorkspaceId(workspace.id);
    },
    [setCurrentWorkspaceId],
  );

  const currentWorkspace = useMemo(() => {
    if (!currentWorkspaceId) return workspaces[0] ?? null;
    return workspaces.find((w) => w.id === currentWorkspaceId) ?? workspaces[0] ?? null;
  }, [workspaces, currentWorkspaceId]);

  const value = useMemo(
    () => ({
      workspaces,
      currentWorkspace,
      currentWorkspaceId: currentWorkspace?.id ?? null,
      setCurrentWorkspace,
      setCurrentWorkspaceId,
      refreshWorkspaces,
      loading,
    }),
    [
      workspaces,
      currentWorkspace,
      setCurrentWorkspace,
      setCurrentWorkspaceId,
      refreshWorkspaces,
      loading,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
