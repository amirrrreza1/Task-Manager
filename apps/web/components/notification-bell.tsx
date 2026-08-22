'use client';

import { Bell, Check } from '@appica/icons-react';
import { Button } from '@appica/ui-react/button';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from './avatar';
import { useAuth } from './auth-provider';
import type { NotificationItem, NotificationListResponse } from '../lib/types';

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSeconds < 60) return 'Just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function NotificationBell() {
  const { user, request } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await request<{ unreadCount: number }>('/notifications/unread-count');
      setUnreadCount(res.unreadCount);
    } catch {
      // Ignore background network error
    }
  }, [user, request]);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await request<NotificationListResponse>('/notifications?limit=25');
      setNotifications(res.items);
      setUnreadCount(res.unreadCount);
    } catch {
      // Ignore error
    } finally {
      setLoading(false);
    }
  }, [user, request]);

  useEffect(() => {
    void fetchUnreadCount();
    const interval = window.setInterval(() => {
      void fetchUnreadCount();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (open) {
      void loadNotifications();
    }
  }, [open, loadNotifications]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  async function markAsRead(item: NotificationItem) {
    if (!item.isRead) {
      try {
        await request(`/notifications/${item.id}/read`, { method: 'PATCH' });
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // Ignore
      }
    }
    if (item.link) {
      setOpen(false);
      router.push(item.link);
    }
  }

  async function markAllAsRead() {
    setMarkingAll(true);
    try {
      await request('/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // Ignore
    } finally {
      setMarkingAll(false);
    }
  }

  if (!user) return null;

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <Button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        className="relative p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        size="icon-sm"
        title="Notifications"
        variant="ghost"
        onClick={() => setOpen((prev) => !prev)}
      >
        <Bell aria-hidden="true" className="w-5 h-5 text-gray-700 dark:text-gray-300" />
        {unreadCount > 0 ? (
          <span
            className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm"
            aria-hidden="true"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div
          className="absolute left-0 mt-2 w-80 sm:w-96 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-2xl z-50 overflow-hidden flex flex-col max-h-[480px] animate-in fade-in zoom-in-95 duration-100"
          role="dialog"
          aria-label="Notifications Panel"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/75 dark:bg-gray-800/40">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                Notifications
              </span>
              {unreadCount > 0 ? (
                <span className="rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs px-2 py-0.5 font-medium">
                  {unreadCount} new
                </span>
              ) : null}
            </div>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium disabled:opacity-50"
                disabled={markingAll}
                onClick={() => void markAllAsRead()}
              >
                {markingAll ? 'Marking…' : 'Mark all read'}
              </button>
            ) : null}
          </div>

          <div className="overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800/60 flex-1">
            {loading && notifications.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">Loading notifications…</div>
            ) : notifications.length === 0 ? (
              <div className="p-10 text-center flex flex-col items-center justify-center">
                <span className="p-3 bg-gray-100 dark:bg-gray-800 rounded-full mb-3 text-gray-400">
                  <Check className="w-6 h-6" />
                </span>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  You're all caught up!
                </p>
                <p className="text-xs text-gray-500 mt-1">No new notifications at this time.</p>
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => void markAsRead(item)}
                  className={`p-3.5 flex gap-3 items-start transition-colors cursor-pointer text-left ${
                    item.isRead
                      ? 'bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50 opacity-80'
                      : 'bg-blue-50/40 dark:bg-blue-950/20 hover:bg-blue-50/70 dark:hover:bg-blue-950/40'
                  }`}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {item.actor ? (
                      <Avatar
                        color={item.actor.color}
                        hasAvatar={item.actor.hasAvatar}
                        name={item.actor.displayName}
                        size={28}
                        userId={item.actor.id}
                      />
                    ) : (
                      <span className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 flex items-center justify-center text-xs font-semibold">
                        TM
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {item.title}
                      </p>
                      <span className="text-[11px] text-gray-400 whitespace-nowrap">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-2 leading-relaxed">
                      {item.message}
                    </p>
                  </div>

                  {!item.isRead ? (
                    <span
                      className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 mt-1.5 flex-shrink-0"
                      title="Unread"
                    />
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
