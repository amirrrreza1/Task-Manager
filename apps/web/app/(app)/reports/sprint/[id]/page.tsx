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
import { HeaderActions } from '../../../../../components/header-actions';
import { useAuth } from '../../../../../components/auth-provider';
import { useToast } from '../../../../../components/toast-provider';
import { formatDate } from '../../../../../lib/app-config';
import { Avatar } from '../../../../../components/avatar';
import { TaskTypeBadge } from '../../../../../components/task-type-badge';
import type { MemberContribution, SprintReport, SprintReportTask } from '../../../../../lib/types';

function formatEstimate(value: number | null, unit: string | null) {
  if (!value || !unit) return null;
  if (unit === 'HOURS') return `${value}h`;
  return `${value} pt`;
}

function isSubtaskDone(s: {
  isCompleted?: boolean;
  column?: { isDone?: boolean; name?: string };
}): boolean {
  return Boolean(
    s.isCompleted || s.column?.isDone || s.column?.name?.trim().toLowerCase() === 'done',
  );
}

function TaskRow({ task }: { task: SprintReportTask }) {
  const isBug = task.type === 'BUG';
  // Bugs do not show subtasks in reports
  const hasSubtasks = !isBug && task.subtasks.length > 0;
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow
        className={`report-task-row ${task.isDone ? 'is-done' : ''}`}
        onClick={() => hasSubtasks && setOpen((v) => !v)}
        style={{ cursor: hasSubtasks ? 'pointer' : undefined }}
      >
        <TableCell>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              flexWrap: 'wrap',
            }}
          >
            {task.type ? <TaskTypeBadge type={task.type} showLabel={false} /> : null}
            <Link
              href={`/tasks/${task.id}`}
              className="report-link"
              onClick={(e) => e.stopPropagation()}
            >
              {task.title}
            </Link>
            {hasSubtasks && (
              <span
                className="muted"
                style={{
                  fontSize: '0.8em',
                  padding: '0.15rem 0.45rem',
                  borderRadius: '4px',
                  background: 'var(--color-bg-subtle, rgba(125,125,125,0.1))',
                  userSelect: 'none',
                }}
              >
                {open ? '▲' : '▼'} {task.subtasks.length} subtask
                {task.subtasks.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </TableCell>
        <TableCell>
          <span className="tag">{task.column.name}</span>
          {task.isDone && (
            <span className="report-badge done" style={{ marginLeft: '0.35rem' }}>
              Done
            </span>
          )}
        </TableCell>
        <TableCell>
          {task.assignees.length > 0 ? (
            <span className="report-assignees">
              {task.assignees.map((u) => (
                <span key={u.id} title={u.displayName}>
                  <Avatar
                    color={u.color}
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
        <TableCell>
          {formatEstimate(task.estimateValue, task.estimateUnit) ?? (
            <span className="muted">—</span>
          )}
        </TableCell>
      </TableRow>
      {open &&
        hasSubtasks &&
        task.subtasks.map((s) => {
          const done = isSubtaskDone(s);
          return (
            <TableRow key={s.id} className={`report-subtask-row ${done ? 'is-done' : ''}`}>
              <TableCell style={{ paddingLeft: '2rem' }}>↳ {s.title}</TableCell>
              <TableCell>
                <span className="tag">{s.column.name}</span>
                {done && (
                  <span className="report-badge done" style={{ marginLeft: '0.35rem' }}>
                    Done
                  </span>
                )}
              </TableCell>
              <TableCell>
                {s.assignee ? (
                  <span className="report-assignees">
                    <span title={s.assignee.displayName}>
                      <Avatar
                        color={s.assignee.color}
                        hasAvatar={s.assignee.hasAvatar}
                        name={s.assignee.displayName}
                        size={20}
                        userId={s.assignee.id}
                      />
                    </span>
                    <span style={{ marginLeft: '0.35rem', fontSize: '0.85em' }}>
                      {s.assignee.displayName}
                    </span>
                  </span>
                ) : (
                  <span className="muted">Unassigned</span>
                )}
              </TableCell>
              <TableCell>
                {formatEstimate(s.estimateValue, s.estimateUnit) ?? (
                  <span className="muted">—</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
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
          color={contribution.user.color}
          hasAvatar={contribution.user.hasAvatar}
          name={contribution.user.displayName}
          size={32}
          userId={contribution.user.id}
        />
        <strong>{contribution.user.displayName}</strong>
        <span className="report-badge done">{contribution.completedSubtasks} done</span>
        {contribution.incompleteSubtasks > 0 && (
          <span className="report-badge pending">
            {contribution.incompleteSubtasks} in progress
          </span>
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
                {contribution.subtasks.map((s) => {
                  const done = isSubtaskDone(s);
                  return (
                    <TableRow key={s.id} className={done ? 'is-done' : ''}>
                      <TableCell>{s.title}</TableCell>
                      <TableCell>
                        <span
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                          {s.parentTask.type ? (
                            <TaskTypeBadge type={s.parentTask.type} showLabel={false} />
                          ) : null}
                          <Link href={`/tasks/${s.parentTask.id}`} className="report-link">
                            {s.parentTask.title}
                          </Link>
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="tag">{s.column.name}</span>
                      </TableCell>
                      <TableCell>
                        {formatEstimate(s.estimateValue, s.estimateUnit) ?? (
                          <span className="muted">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {done ? (
                          <span className="report-badge done">Done</span>
                        ) : (
                          <span className="report-badge pending">In progress</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
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
  const toast = useToast();
  const [report, setReport] = useState<SprintReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    request<SprintReport>(`/reports/sprints/${id}`)
      .then(setReport)
      .catch((err) => toast.fromError(err, 'Could not load report.'))
      .finally(() => setLoading(false));
  }, [request, id, toast]);

  if (user?.role !== 'ADMIN') {
    return (
      <div className="page-stack">
        <p className="muted">This page is restricted to administrators.</p>
      </div>
    );
  }

  return (
    <div className="page-stack">
      {report ? (
        <HeaderActions>
          <Button nativeButton={false} variant="outline" render={<Link href={`/sprints/${id}`} />}>
            View sprint
          </Button>
        </HeaderActions>
      ) : null}

      {loading ? (
        <div className="board-loading">
          <span className="spinner" /> Loading…
        </div>
      ) : report ? (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
              marginBottom: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 600 }}>
                {report.sprint.name}
              </h1>
              <span
                className={`report-badge ${report.sprint.status === 'COMPLETED' ? 'done' : 'pending'}`}
              >
                {report.sprint.status === 'COMPLETED'
                  ? 'Completed'
                  : report.sprint.status === 'ACTIVE'
                    ? 'Active'
                    : 'Planned'}
              </span>
            </div>
            {report.sprint.goal ? (
              <p className="muted" style={{ margin: 0 }}>
                {report.sprint.goal}
              </p>
            ) : null}
          </div>

          {/* Summary stats */}
          <section className="report-stats" aria-label="Sprint summary">
            {report.totals.bugCount !== undefined && report.totals.bugCount > 0 ? (
              <>
                <div className="report-stat">
                  <strong>
                    {report.totals.standardTasksDone ?? report.totals.tasksDone}/
                    {report.totals.standardTaskCount ?? report.totals.taskCount}
                  </strong>
                  <span>Tasks done</span>
                </div>
                <div className="report-stat">
                  <strong>
                    {report.totals.bugsDone ?? 0}/{report.totals.bugCount}
                  </strong>
                  <span>Bugs done</span>
                </div>
              </>
            ) : (
              <div className="report-stat">
                <strong>
                  {report.totals.tasksDone}/{report.totals.taskCount}
                </strong>
                <span>Tasks done</span>
              </div>
            )}
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
            {report.sprint.completedAt ? (
              <div className="report-stat">
                <strong>{formatDate(report.sprint.completedAt)}</strong>
                <span>Completed</span>
              </div>
            ) : report.sprint.endsAt ? (
              <div className="report-stat">
                <strong>{formatDate(report.sprint.endsAt)}</strong>
                <span>Ended</span>
              </div>
            ) : null}
          </section>

          {/* Per-member contributions */}
          {report.memberContributions.length > 0 && (
            <section aria-labelledby="contributions-heading">
              <h2
                id="contributions-heading"
                className="section-label"
                style={{ marginBottom: '0.75rem' }}
              >
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
                Tasks & Bugs ({report.tasks.length})
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
              <h2
                id="standalone-heading"
                className="section-label"
                style={{ marginBottom: '0.75rem' }}
              >
                Standalone subtasks ({report.standaloneSubtasks.length})
              </h2>
              <div className="report-table-wrap">
                <Table size="sm" hoverableRows className="report-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Subtask</TableHead>
                      <TableHead scope="col">Parent task</TableHead>
                      <TableHead scope="col">Column</TableHead>
                      <TableHead scope="col">Assignee</TableHead>
                      <TableHead scope="col">Estimate</TableHead>
                      <TableHead scope="col">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.standaloneSubtasks.map((s) => {
                      const done = isSubtaskDone(s);
                      return (
                        <TableRow key={s.id} className={done ? 'is-done' : ''}>
                          <TableCell>{s.title}</TableCell>
                          <TableCell>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                              }}
                            >
                              {s.parentTask.type ? (
                                <TaskTypeBadge type={s.parentTask.type} showLabel={false} />
                              ) : null}
                              <Link href={`/tasks/${s.parentTask.id}`} className="report-link">
                                {s.parentTask.title}
                              </Link>
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="tag">{s.column.name}</span>
                          </TableCell>
                          <TableCell>
                            {s.assignee ? (
                              <span className="report-assignees">
                                <span title={s.assignee.displayName}>
                                  <Avatar
                                    color={s.assignee.color}
                                    hasAvatar={s.assignee.hasAvatar}
                                    name={s.assignee.displayName}
                                    size={20}
                                    userId={s.assignee.id}
                                  />
                                </span>
                                <span style={{ marginLeft: '0.35rem', fontSize: '0.85em' }}>
                                  {s.assignee.displayName}
                                </span>
                              </span>
                            ) : (
                              <span className="muted">Unassigned</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {formatEstimate(s.estimateValue, s.estimateUnit) ?? (
                              <span className="muted">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {done ? (
                              <span className="report-badge done">Done</span>
                            ) : (
                              <span className="report-badge pending">In progress</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
