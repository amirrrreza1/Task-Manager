'use client';

import { Button } from '../../../../../components/design-system';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@appica/ui-react/table';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useAuth } from '../../../../../components/auth-provider';
import { formatDate } from '../../../../../lib/app-config';
import { Avatar } from '../../../../../components/avatar';
import type { MemberContribution, SprintReport, SprintReportTask } from '../../../../../lib/types';

function formatEstimate(value: number | null, unit: string | null) {
  if (!value || !unit) return null;
  if (unit === 'HOURS') return `${value}h`;
  return `${value} pt`;
}

function TaskRow({ task }: { task: SprintReportTask }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow
        className={`report-task-row ${task.isDone ? 'is-done' : ''}`}
        onClick={() => task.subtasks.length > 0 && setOpen((v) => !v)}
        style={{ cursor: task.subtasks.length > 0 ? 'pointer' : undefined }}
      >
        <TableCell>
          <Link href={`/tasks/${task.id}`} className="report-link" onClick={(e) => e.stopPropagation()}>
            {task.title}
          </Link>
          {task.subtasks.length > 0 && (
            <span className="muted" style={{ marginLeft: '0.5rem', fontSize: '0.8em' }}>
              {open ? '▲' : '▼'} {task.subtasks.length} subtask{task.subtasks.length !== 1 ? 's' : ''}
            </span>
          )}
        </TableCell>
        <TableCell>
          <span className="tag">{task.column.name}</span>
          {task.isDone && <span className="report-badge done" style={{ marginLeft: '0.35rem' }}>Done</span>}
        </TableCell>
        <TableCell>
          {task.assignees.length > 0 ? (
            <span className="report-assignees">
              {task.assignees.map((u) => (
                <span key={u.id} title={u.displayName}>
                  <Avatar
                    hasAvatar={u.hasAvatar}
                    name={u.displayName}
                    size={20}
                    userId={u.id}
                  />
                </span>
              ))}
            </span>
          ) : (
            <span className="muted">Unassigned</span>
          )}
        </TableCell>
        <TableCell>{formatEstimate(task.estimateValue, task.estimateUnit) ?? <span className="muted">—</span>}</TableCell>
      </TableRow>
      {open &&
        task.subtasks.map((s) => (
          <TableRow key={s.id} className={`report-subtask-row ${s.isCompleted ? 'is-done' : ''}`}>
            <TableCell style={{ paddingLeft: '2rem' }}>↳ {s.title}</TableCell>
            <TableCell>
              <span className="tag">{s.column.name}</span>
              {s.isCompleted && <span className="report-badge done" style={{ marginLeft: '0.35rem' }}>Done</span>}
            </TableCell>
            <TableCell>
              {/* subtask has single assignee resolved at parent level */}
              <span className="muted">Subtask</span>
            </TableCell>
            <TableCell>{formatEstimate(s.estimateValue, s.estimateUnit) ?? <span className="muted">—</span>}</TableCell>
          </TableRow>
        ))}
    </>
  );
}

function MemberCard({ contribution }: { contribution: MemberContribution }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="report-member-card">
      <Button
        className="report-member-header"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Avatar
          hasAvatar={contribution.user.hasAvatar}
          name={contribution.user.displayName}
          size={32}
          userId={contribution.user.id}
        />
        <strong>{contribution.user.displayName}</strong>
        <span className="report-badge done">{contribution.completedSubtasks} done</span>
        {contribution.incompleteSubtasks > 0 && (
          <span className="report-badge pending">{contribution.incompleteSubtasks} in progress</span>
        )}
        {contribution.estimateHours > 0 && (
          <span className="muted">{formatEstimate(contribution.estimateHours, 'HOURS')}</span>
        )}
        {contribution.estimatePoints > 0 && (
          <span className="muted">{contribution.estimatePoints} pt</span>
        )}
        <span className="muted" style={{ marginLeft: 'auto', fontSize: '0.8em' }}>
          {open ? '▲' : '▼'}
        </span>
      </Button>
      {open && (
        <div className="report-member-subtasks">
          {contribution.subtasks.length === 0 ? (
            <p className="muted">No subtasks.</p>
          ) : (
            <Table size="sm" hoverableRows className="report-table">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Subtask</TableHead>
                  <TableHead scope="col">Parent task</TableHead>
                  <TableHead scope="col">Column</TableHead>
                  <TableHead scope="col">Estimate</TableHead>
                  <TableHead scope="col">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contribution.subtasks.map((s) => (
                  <TableRow key={s.id} className={s.isCompleted ? 'is-done' : ''}>
                    <TableCell>{s.title}</TableCell>
                    <TableCell>
                      <Link href={`/tasks/${s.parentTask.id}`} className="report-link">
                        {s.parentTask.title}
                      </Link>
                    </TableCell>
                    <TableCell><span className="tag">{s.column.name}</span></TableCell>
                    <TableCell>{formatEstimate(s.estimateValue, s.estimateUnit) ?? <span className="muted">—</span>}</TableCell>
                    <TableCell>
                      {s.isCompleted ? (
                        <span className="report-badge done">Done</span>
                      ) : (
                        <span className="report-badge pending">In progress</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}

export default function SprintReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { request, user } = useAuth();
  const [report, setReport] = useState<SprintReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    request<SprintReport>(`/reports/sprints/${id}`)
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load report.'))
      .finally(() => setLoading(false));
  }, [request, id]);

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
            <Link href="/reports" className="report-link">Reports</Link> › Sprint
          </p>
          <h1>{report ? report.sprint.name : 'Sprint report'}</h1>
          {report?.sprint.goal && <p className="muted">{report.sprint.goal}</p>}
        </div>
        {report && (
          <Button nativeButton={false} variant="outline" render={<Link href={`/sprints/${id}`} />}>
            View sprint
          </Button>
        )}
      </header>

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
          {/* Summary stats */}
          <section className="report-stats" aria-label="Sprint summary">
            <div className="report-stat">
              <strong>
                {report.totals.tasksDone}/{report.totals.taskCount}
              </strong>
              <span>Tasks done</span>
            </div>
            <div className="report-stat">
              <strong>
                {report.totals.subtasksDone}/{report.totals.subtaskCount}
              </strong>
              <span>Subtasks done</span>
            </div>
            {report.sprint.startsAt && (
              <div className="report-stat">
                <strong>{formatDate(report.sprint.startsAt)}</strong>
                <span>Started</span>
              </div>
            )}
            {report.sprint.endsAt && (
              <div className="report-stat">
                <strong>{formatDate(report.sprint.endsAt)}</strong>
                <span>Ended</span>
              </div>
            )}
          </section>

          {/* Per-member contributions */}
          {report.memberContributions.length > 0 && (
            <section aria-labelledby="contributions-heading">
              <h2 id="contributions-heading" className="section-label" style={{ marginBottom: '0.75rem' }}>
                Member contributions
              </h2>
              <div className="report-member-list">
                {report.memberContributions.map((c) => (
                  <MemberCard key={c.user.id} contribution={c} />
                ))}
              </div>
            </section>
          )}

          {/* Task breakdown */}
          {report.tasks.length > 0 && (
            <section aria-labelledby="tasks-heading">
              <h2 id="tasks-heading" className="section-label" style={{ marginBottom: '0.75rem' }}>
                Tasks ({report.tasks.length})
              </h2>
              <div className="report-table-wrap">
                <Table size="sm" hoverableRows className="report-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Task</TableHead>
                      <TableHead scope="col">Column / status</TableHead>
                      <TableHead scope="col">Assignees</TableHead>
                      <TableHead scope="col">Estimate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.tasks.map((task) => (
                      <TaskRow key={task.id} task={task} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}

          {/* Standalone subtasks */}
          {report.standaloneSubtasks.length > 0 && (
            <section aria-labelledby="standalone-heading">
              <h2 id="standalone-heading" className="section-label" style={{ marginBottom: '0.75rem' }}>
                Standalone subtasks ({report.standaloneSubtasks.length})
              </h2>
              <div className="report-table-wrap">
                <Table size="sm" hoverableRows className="report-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Subtask</TableHead>
                      <TableHead scope="col">Parent task</TableHead>
                      <TableHead scope="col">Column</TableHead>
                      <TableHead scope="col">Estimate</TableHead>
                      <TableHead scope="col">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.standaloneSubtasks.map((s) => (
                      <TableRow key={s.id} className={s.isCompleted ? 'is-done' : ''}>
                        <TableCell>{s.title}</TableCell>
                        <TableCell>
                          <Link href={`/tasks/${s.parentTask.id}`} className="report-link">
                            {s.parentTask.title}
                          </Link>
                        </TableCell>
                        <TableCell><span className="tag">{s.column.name}</span></TableCell>
                        <TableCell>{formatEstimate(s.estimateValue, s.estimateUnit) ?? <span className="muted">—</span>}</TableCell>
                        <TableCell>
                          {s.isCompleted ? (
                            <span className="report-badge done">Done</span>
                          ) : (
                            <span className="report-badge pending">In progress</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
