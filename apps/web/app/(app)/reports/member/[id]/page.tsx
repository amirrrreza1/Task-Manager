'use client';

import { Select } from '../../../../../components/design-system';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@appica/ui-react/table';

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../../../components/auth-provider';
import { useToast } from '../../../../../components/toast-provider';
import type { MemberReport, ReportSubtask, SprintSummary } from '../../../../../lib/types';

function formatEstimate(value: number | null, unit: string | null) {
  if (!value || !unit) return null;
  if (unit === 'HOURS') return `${value}h`;
  return `${value} pt`;
}

function SubtaskRow({ subtask }: { subtask: ReportSubtask }) {
  return (
    <TableRow>
      <TableCell>
        <span className={subtask.isCompleted ? 'report-done' : undefined}>{subtask.title}</span>
      </TableCell>
      <TableCell>
        {subtask.task ? (
          <Link href={`/tasks/${subtask.task.id}`} className="report-link">
            {subtask.task.title}
          </Link>
        ) : (
          <span className="muted">—</span>
        )}
      </TableCell>
      <TableCell>{subtask.sprint?.name ?? <span className="muted">Backlog</span>}</TableCell>
      <TableCell>
        <span className="tag">{subtask.column.name}</span>
      </TableCell>
      <TableCell>
        {formatEstimate(subtask.estimateValue, subtask.estimateUnit) ?? (
          <span className="muted">—</span>
        )}
      </TableCell>
      <TableCell>
        {subtask.isCompleted ? (
          <span className="report-badge done">Done</span>
        ) : (
          <span className="report-badge pending">In progress</span>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function MemberReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { request, user } = useAuth();
  const toast = useToast();
  const [report, setReport] = useState<MemberReport | null>(null);
  const [sprints, setSprints] = useState<SprintSummary[]>([]);
  const [sprintFilter, setSprintFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void request<{ items: SprintSummary[] }>('/sprints?limit=200')
      .then((r) => setSprints(r.items))
      .catch(() => {});
  }, [request]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (sprintFilter) params.set('sprintId', sprintFilter);
      const data = await request<MemberReport>(`/reports/members/${id}?${params}`);
      setReport(data);
    } catch (err) {
      toast.fromError(err, 'Could not load report.');
    } finally {
      setLoading(false);
    }
  }, [request, id, sprintFilter, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (user?.role !== 'ADMIN') {
    return (
      <div className="page-stack">
        <p className="muted">This page is restricted to administrators.</p>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="board-filters" aria-label="Report filters">
        <label>
          <span>Sprint</span>
          <Select value={sprintFilter} onChange={(e) => setSprintFilter(e.target.value)}>
            <option value="">All time</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </label>
      </section>

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
            {report.totals.estimateHours > 0 && (
              <div className="report-stat">
                <strong>{formatEstimate(report.totals.estimateHours, 'HOURS')}</strong>
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
              <h2
                id="completed-heading"
                className="section-label"
                style={{ marginBottom: '0.75rem' }}
              >
                Completed subtasks ({report.completedSubtasks.length})
              </h2>
              <div className="report-table-wrap">
                <Table size="sm" hoverableRows className="report-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Subtask</TableHead>
                      <TableHead scope="col">Parent task</TableHead>
                      <TableHead scope="col">Sprint</TableHead>
                      <TableHead scope="col">Column</TableHead>
                      <TableHead scope="col">Estimate</TableHead>
                      <TableHead scope="col">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.completedSubtasks.map((s) => (
                      <SubtaskRow key={s.id} subtask={s} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}

          {/* Incomplete subtasks */}
          {report.incompleteSubtasks.length > 0 && (
            <section aria-labelledby="incomplete-heading">
              <h2
                id="incomplete-heading"
                className="section-label"
                style={{ marginBottom: '0.75rem' }}
              >
                In-progress subtasks ({report.incompleteSubtasks.length})
              </h2>
              <div className="report-table-wrap">
                <Table size="sm" hoverableRows className="report-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Subtask</TableHead>
                      <TableHead scope="col">Parent task</TableHead>
                      <TableHead scope="col">Sprint</TableHead>
                      <TableHead scope="col">Column</TableHead>
                      <TableHead scope="col">Estimate</TableHead>
                      <TableHead scope="col">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.incompleteSubtasks.map((s) => (
                      <SubtaskRow key={s.id} subtask={s} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}

          {report.completedSubtasks.length === 0 && report.incompleteSubtasks.length === 0 && (
            <p className="muted" style={{ padding: '2rem 0' }}>
              No subtasks assigned to this member{sprintFilter ? ' in this sprint' : ''}.
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
