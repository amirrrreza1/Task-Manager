'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '../components/auth-provider';
import { getSocketUrl } from './socket-url';

export { getSocketUrl };

export type BoardEventType =
  | 'task.created'
  | 'task.updated'
  | 'task.moved'
  | 'task.deleted'
  | 'subtask.created'
  | 'subtask.updated'
  | 'subtask.moved'
  | 'subtask.reordered'
  | 'subtask.deleted'
  | 'column.created'
  | 'column.updated'
  | 'column.reordered'
  | 'column.deleted'
  | 'sprint.started'
  | 'sprint.finished'
  | 'sprint.tasks_assigned'
  | 'sprint.subtasks_assigned'
  | 'sprint.work_carried_over'
  | 'sprint.work_moved_to_backlog'
  | 'board.refresh';

export interface BoardEvent {
  workspaceId: string;
  eventType: BoardEventType;
  entityId?: string;
  actorId?: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export function useBoardSocket(
  workspaceId: string | undefined,
  onBoardUpdate?: (event: BoardEvent) => void,
) {
  const { user, getToken } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const onBoardUpdateRef = useRef(onBoardUpdate);
  onBoardUpdateRef.current = onBoardUpdate;

  useEffect(() => {
    if (!user || !workspaceId) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    let active = true;
    const socketUrl = getSocketUrl();

    async function initializeSocket() {
      const token = await getToken();
      if (!active || !token) return;

      let socket = socketRef.current;
      if (!socket || !socket.connected) {
        socket = io(socketUrl, {
          auth: { token },
          transports: ['websocket', 'polling'],
          autoConnect: true,
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
        });
        socketRef.current = socket;
      }

      socket.on('connect', () => {
        if (!active) return;
        setIsConnected(true);
        socket?.emit('join:workspace', { workspaceId });
      });

      socket.on('disconnect', () => {
        if (!active) return;
        setIsConnected(false);
      });

      socket.on('connect_error', async () => {
        if (!active) return;
        const nextToken = await getToken();
        if (socket && nextToken) {
          socket.auth = { token: nextToken };
        }
      });

      socket.on('board:updated', (event: BoardEvent) => {
        if (!active) return;
        if (event.workspaceId === workspaceId) {
          onBoardUpdateRef.current?.(event);
        }
      });

      if (socket.connected) {
        setIsConnected(true);
        socket.emit('join:workspace', { workspaceId });
      }
    }

    void initializeSocket();

    return () => {
      active = false;
      if (socketRef.current) {
        socketRef.current.emit('leave:workspace', { workspaceId });
        socketRef.current.off('connect');
        socketRef.current.off('disconnect');
        socketRef.current.off('connect_error');
        socketRef.current.off('board:updated');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setIsConnected(false);
    };
  }, [user, workspaceId, getToken]);

  return { isConnected };
}
