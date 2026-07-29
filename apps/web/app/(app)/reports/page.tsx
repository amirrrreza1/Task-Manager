'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '../../../components/auth-provider';
import { Avatar } from '../../../components/avatar';
import type { ManagedUser, SprintSummary } from '../../../lib/types';

export default function ReportsIndexPage() {
  const { request, user } = useAuth();
  const [members, setMembers] = useState<ManagedUser[]>([]);
  const [sprints, setSprints] = useState<SprintSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      request<ManagedUser[]>('/users'),
      request<{ items: SprintSummary[] }>('/sprints?limit=200'),
    ])
      .then(([users, sprintData]) => {
        setMembers(users.filter((u) => u.isActive));
        setSprints(sprintData.items);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load data.'))
      .finally(() => setLoading(false));
  }, [request]);

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
          <p className="eyebrow">Admin</p>
          <h1>Reports</h1>
          <p className="muted">Activity logs, member subtask reports, and sprint breakdowns.</p>
        </div>
      </header>

      {error && (
        <p className="form-error inline-alert" role="alert">
          {error}
        </p>
      )}

      {/* Activity log */}
      <section aria-labelledby="log-heading">
        <h2 id="log-heading" className="section-label" style={{ marginBottom: '0.75rem' }}>
          Activity log
        </h2>
        <Link className="report-card" href="/reports/activity">
          <div className="report-card-icon" aria-hidden="true">📋</div>
          <div>
            <strong>Full activity log</strong>
            <p className="muted">Every state change across tasks, sprints, board, users, and settings. Filter by actor, entity type, and date range.</p>
          </div>
        </Link>
      </section>

      {/* Member reports */}
      <section aria-labelledby="members-heading">
        <h2 id="members-heading" className="section-label" style={{ marginBottom: '0.75rem' }}>
          Member reports
        </h2>
        {loading ? (
          <div className="board-loading">
            <span className="spinner" /> Loading…
          </div>
        ) : members.length === 0 ? (
          <p className="muted">No active members found.</p>
        ) : (
          <div className="report-card-grid">
            {members.map((member) => (
              <Link key={member.id} className="report-card" href={`/reports/member/${member.id}`}>
                <Avatar name={member.displayName} seed={member.avatarSeed} size={36} />
                <div>
                  <strong>{member.displayName}</strong>
                  <p className="muted">Subtask completion and estimate totals</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Sprint reports */}
      <section aria-labelledby="sprints-heading">
        <h2 id="sprints-heading" className="section-label" style={{ marginBottom: '0.75rem' }}>
          Sprint reports
        </h2>
        {loading ? (
          <div className="board-loading">
            <span className="spinner" /> Loading…
          </div>
        ) : sprints.length === 0 ? (
          <p className="muted">No sprints yet.</p>
        ) : (
          <div className="report-card-grid">
            {sprints.map((sprint) => (
              <Link key={sprint.id} className="report-card" href={`/reports/sprint/${sprint.id}`}>
                <div className="report-card-icon" aria-hidden="true">
                  {sprint.status === 'COMPLETED' ? '✅' : sprint.status === 'ACTIVE' ? '🏃' : '📅'}
                </div>
                <div>
                  <strong>{sprint.name}</strong>
                  <p className="muted">
                    {sprint.status === 'COMPLETED'
                      ? `Completed ${sprint.completedAt ? new Date(sprint.completedAt).toLocaleDateString() : ''}`
                      : sprint.status === 'ACTIVE'
                        ? 'Currently active'
                        : 'Planned'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
