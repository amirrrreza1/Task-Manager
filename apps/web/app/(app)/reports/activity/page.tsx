'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../../components/auth-provider';
import { Avatar } from '../../../../components/avatar';
import type { ActivityEventItem, ManagedUser } from '../../../../lib/types';

interface Filters {
  actorId: string;
  entityType: string;
  from: string;
  to: string;
}

const emptyFilters: Filters = { actorId: '', entityType: '', from: '', to: '' };

const ENTITY_TYPES = [
  'task',
  'subtask',
  'sprint',
  'board_column',
  'user',
  'settings',
  'attachment',
];

function eventLabel(eventType: string) {
  return eventType.replace(/\./g, ' › ').replace(/_/g, ' ');
}

function entityTypeLabel(et: string) {
  return et.replace(/_/g, ' ');
}

export default function ActivityLogPage() {
  const { request, user } = useAuth();
  const [items, setItems] = useState<ActivityEventItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void request<ManagedUser[]>('/users').then(setUsers).catch(() => {});
  }, [request]);

  const load = useCallback(
    async (cursor: string | null, currentApplied: Filters) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const params = new URLSearchParams({ limit: '50' });
      if (currentApplied.actorId) params.set('actorId', currentApplied.actorId);
      if (currentApplied.entityType) params.set('entityType', currentApplied.entityType);
      if (currentApplied.from) params.set('from', currentApplied.from);
      if (currentApplied.to) params.set('to', currentApplied.to);
      if (cursor) params.set('cursor', cursor);
      try {
        const data = await request<{ items: ActivityEventItem[]; nextCursor: string | null }>(
          `/reports/activity?${params}`,
        );
        return data;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return null;
        throw err;
      }
    },
    [request],
  );

  const reload = useCallback(
    async (f: Filters) => {
      setLoading(true);
      setError('');
      try {
        const data = await load(null, f);
        if (!data) return;
        setItems(data.items);
        setNextCursor(data.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load activity log.');
      } finally {
        setLoading(false);
      }
    },
    [load],
  );

  useEffect(() => {
    void reload(applied);
  }, [reload, applied]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await load(nextCursor, applied);
      if (!data) return;
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load more.');
    } finally {
      setLoadingMore(false);
    }
  }

  function applyFilters() {
    setApplied({ ...filters });
  }

  function clearFilters() {
    setFilters(emptyFilters);
    setApplied(emptyFilters);
  }

  if (user?.role !== 'ADMIN') {
    return (
      <div className="page-stack">
        <p className="form-error inline-alert">This page is restricted to administrators.</p>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <header className="page-header compact-header">
        <div>
          <p className="eyebrow">Admin · Reports</p>
          <h1>Activity log</h1>
          <p className="muted">Every state change across tasks, sprints, board, users, and settings.</p>
        </div>
      </header>

      <section className="board-filters" aria-label="Activity log filters">
        <label>
          <span>Actor</span>
          <select value={filters.actorId} onChange={(e) => setFilters({ ...filters, actorId: e.target.value })}>
            <option value="">Everyone</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Entity type</span>
          <select value={filters.entityType} onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}>
            <option value="">All types</option>
            {ENTITY_TYPES.map((et) => (
              <option key={et} value={et}>
                {entityTypeLabel(et)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>From</span>
          <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        </label>
        <label>
          <span>To</span>
          <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </label>
        <button className="button primary compact" type="button" onClick={applyFilters}>
          Apply
        </button>
        <button className="button ghost compact" type="button" onClick={clearFilters}>
          Clear
        </button>
      </section>

      {error && (
        <p className="form-error inline-alert" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="board-loading">
          <span className="spinner" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <p className="muted" style={{ padding: '2rem 0' }}>No activity events match the current filters.</p>
      ) : (
        <>
          <div className="report-table-wrap" role="region" aria-label="Activity log">
            <table className="report-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Event</th>
                  <th scope="col">Entity type</th>
                  <th scope="col">Entity</th>
                </tr>
              </thead>
              <tbody>
                {items.map((ev) => (
                  <tr key={ev.id}>
                    <td className="report-cell-mono">
                      {new Date(ev.createdAt).toLocaleString()}
                    </td>
                    <td>
                      {ev.actor ? (
                        <span className="report-actor">
                          <Avatar name={ev.actor.displayName} seed={ev.actor.avatarSeed} size={20} />
                          <span>{ev.actor.displayName}</span>
                        </span>
                      ) : (
                        <span className="muted">System</span>
                      )}
                    </td>
                    <td>
                      <span className="report-event-type">{eventLabel(ev.eventType)}</span>
                    </td>
                    <td>
                      <span className="tag">{entityTypeLabel(ev.entityType)}</span>
                    </td>
                    <td>{ev.entityLabel ?? <span className="muted">{ev.entityId.slice(0, 8)}…</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {nextCursor && (
            <div style={{ textAlign: 'center', paddingTop: '1rem' }}>
              <button
                className="button secondary"
                type="button"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
