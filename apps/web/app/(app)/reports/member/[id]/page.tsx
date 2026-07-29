'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../../../components/auth-provider';
import { Avatar } from '../../../../../components/avatar';
import type { MemberReport, ReportSubtask, SprintSummary } from '../../../../../lib/types';

function formatEstimate(value: number | null, unit: string | null) {
  if (!value || !unit) return null;
  if (unit === 'MINUTES') {
    const h = Math.floor(value / 60);
    const m = value % 60;
    return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
  }
  return `${value} pt`;
}

function SubtaskRow({ subtask }: { subtask: ReportSubtask }) {
  return (
    <tr>
      <td>
        <span className={subtask.isCompleted ? 'report-done' : undefined}>{subtask.title}</span>
      </td>
      <td>
        {subtask.task ? (
          <Link href={`/tasks/${subtask.task.id}`} className="report-link">
            {subtask.task.title}
          </Link>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td>{subtask.sprint?.name ?? <span className="muted">Backlog</span>}</td>
      <td>
        <span className="tag">{subtask.column.name}</span>
      </td>
      <td>{formatEstimate(subtask.estimateValue, subtask.estimateUnit) ?? <span className="muted">—</span>}</td>
      <td>
        {subtask.isCompleted ? (
          <span className="report-badge done">Done</span>
        ) : (
          <span className="report-badge pending">In progress</span>
        )}
      </td>
    </tr>
  );
}

export default function MemberReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { request, user } = useAuth();
  const [report, setReport] = useState<MemberReport | null>(null);
  const [sprints, setSprints] = useState<SprintSummary[]>([]);
  const [sprintFilter, setSprintFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void request<{ items: SprintSummary[] }>('/sprints?limit=200')
      .then((r) => setSprints(r.items))
      .catch(() => {});
  }, [request]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (sprintFilter) params.set('sprintId', sprintFilter);
      const data = await request<MemberReport>(`/reports/members/${id}?${params}`);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load report.');
    } finally {
      setLoading(false);
    }
  }, [request, id, sprintFilter]);

  useEffect(() => {
    void load();
  }, [load]);

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
          <p className="eyebrow">
            <Link href="/reports" className="report-link">Reports</Link> › Member
          </p>
          {report ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Avatar name={report.user.displayName} seed={report.user.avatarSeed} size={40} />
                <h1>{report.user.displayName}</h1>
              </div>
              <p className="muted">Subtask completion and estimate summary.</p>
            </>
          ) : (
            <h1>Member report</h1>
          )}
        </div>
      </header>

      <section className="board-filters" aria-label="Report filters">
        <label>
          <span>Sprint</span>
          <select value={sprintFilter} onChange={(e) => setSprintFilter(e.target.value)}>
            <option value="">All time</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
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
      ) : report ? (
        <>
          {/* Totals */}
          <section className="report-stats" aria-label="Summary totals">
            <div className="report-stat">
              <strong>{report.totals.completedCount}</strong>
              <span>Subtasks completed</span>
            </div>
            <div className="report-stat">
              <strong>{report.totals.incompleteCount}</strong>
              <span>In progress</span>
            </div>
            {report.totals.estimateMinutes > 0 && (
              <div className="report-stat">
                <strong>{formatEstimate(report.totals.estimateMinutes, 'MINUTES')}</strong>
                <span>Completed estimate (time)</span>
              </div>
            )}
            {report.totals.estimatePoints > 0 && (
              <div className="report-stat">
                <strong>{report.totals.estimatePoints} pt</strong>
                <span>Completed estimate (points)</span>
              </div>
            )}
          </section>

          {/* Completed subtasks */}
          {report.completedSubtasks.length > 0 && (
            <section aria-labelledby="completed-heading">
              <h2 id="completed-heading" className="section-label" style={{ marginBottom: '0.75rem' }}>
                Completed subtasks ({report.completedSubtasks.length})
              </h2>
              <div className="report-table-wrap">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th scope="col">Subtask</th>
                      <th scope="col">Parent task</th>
                      <th scope="col">Sprint</th>
                      <th scope="col">Column</th>
                      <th scope="col">Estimate</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.completedSubtasks.map((s) => (
                      <SubtaskRow key={s.id} subtask={s} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Incomplete subtasks */}
          {report.incompleteSubtasks.length > 0 && (
            <section aria-labelledby="incomplete-heading">
              <h2 id="incomplete-heading" className="section-label" style={{ marginBottom: '0.75rem' }}>
                In-progress subtasks ({report.incompleteSubtasks.length})
              </h2>
              <div className="report-table-wrap">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th scope="col">Subtask</th>
                      <th scope="col">Parent task</th>
                      <th scope="col">Sprint</th>
                      <th scope="col">Column</th>
                      <th scope="col">Estimate</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.incompleteSubtasks.map((s) => (
                      <SubtaskRow key={s.id} subtask={s} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {report.completedSubtasks.length === 0 && report.incompleteSubtasks.length === 0 && (
            <p className="muted" style={{ padding: '2rem 0' }}>No subtasks assigned to this member{sprintFilter ? ' in this sprint' : ''}.</p>
          )}
        </>
      ) : null}
    </div>
  );
}
