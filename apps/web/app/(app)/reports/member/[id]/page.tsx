'use client';

import { Button, Select } from '../../../../../components/design-system';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@appica/ui-react/table';

import Link from 'next/link';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { HeaderActions } from '../../../../../components/header-actions';
import { Avatar } from '../../../../../components/avatar';
import { TaskTypeBadge } from '../../../../../components/task-type-badge';
import { TaskIdBadge } from '../../../../../components/task-id-badge';
import { useAuth } from '../../../../../components/auth-provider';
import { useToast } from '../../../../../components/toast-provider';
import type {
  MemberReport,
  MemberReportTask,
  ReportSubtask,
  SprintSummary,
} from '../../../../../lib/types';

function formatEstimate(value: number | null, unit: string | null) {
  if (!value || !unit) return null;
  if (unit === 'HOURS') return `${value}h`;
  return `${value} pt`;
}

function SubtaskRow({ subtask }: { subtask: ReportSubtask }) {
  const isDone = Boolean(
    subtask.isCompleted ||
      subtask.column?.isDone ||
      subtask.column?.name?.trim().toLowerCase() === 'done',
  );
  return (
    <TableRow>
      <TableCell>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <TaskIdBadge id={subtask.id} />
          <span className={isDone ? 'report-done' : undefined}>{subtask.title}</span>
        </span>
      </TableCell>
      <TableCell>
        {subtask.task ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <TaskIdBadge id={subtask.task.id} />
            {subtask.task.type ? (
              <TaskTypeBadge type={subtask.task.type} showLabel={false} />
            ) : null}
            <Link href={`/tasks/${subtask.task.id}`} className="report-link">
              {subtask.task.title}
            </Link>
          </span>
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
        {isDone ? (
          <span className="report-badge done">Done</span>
        ) : (
          <span className="report-badge pending">In progress</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function TaskRow({ task }: { task: MemberReportTask }) {
  return (
    <TableRow className={task.isDone ? 'is-done' : undefined}>
      <TableCell>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <TaskIdBadge id={task.id} />
          <TaskTypeBadge type={task.type} showLabel={false} />
          <Link href={`/tasks/${task.id}`} className="report-link">
            {task.title}
          </Link>
        </span>
      </TableCell>
      <TableCell>{task.sprint?.name ?? <span className="muted">Backlog</span>}</TableCell>
      <TableCell>
        <span className="tag">{task.column.name}</span>
      </TableCell>
      <TableCell>
        {formatEstimate(task.estimateValue, task.estimateUnit) ?? <span className="muted">—</span>}
      </TableCell>
      <TableCell>
        <span className={`report-badge ${task.isDone ? 'done' : 'pending'}`}>
          {task.isDone ? 'Done' : 'In progress'}
        </span>
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
    void request<{ items: SprintSummary[] }>('/sprints?limit=100')
      .then((r) => setSprints(r.items))
      .catch((err) => toast.fromError(err, 'Could not load sprint filters.'));
  }, [request, toast]);

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

  const sprintBreakdown = useMemo(() => {
    if (!report) return [];

    const rows = new Map<
      string,
      {
        id: string;
        name: string;
        status: string;
        tasks: number;
        tasksDone: number;
        subtasks: number;
        subtasksDone: number;
      }
    >();
    const ensureRow = (sprint: { id: string; name: string; status: string } | null) => {
      const id = sprint?.id ?? 'backlog';
      if (!rows.has(id)) {
        rows.set(id, {
          id,
          name: sprint?.name ?? 'Backlog',
          status: sprint?.status ?? 'BACKLOG',
          tasks: 0,
          tasksDone: 0,
          subtasks: 0,
          subtasksDone: 0,
        });
      }
      return rows.get(id)!;
    };

    for (const task of report.assignedTasks) {
      const row = ensureRow(task.sprint);
      row.tasks++;
      if (task.isDone) row.tasksDone++;
    }
    for (const subtask of [...report.incompleteSubtasks, ...report.completedSubtasks]) {
      const row = ensureRow(subtask.sprint);
      row.subtasks++;
      if (subtask.isCompleted) row.subtasksDone++;
    }

    const sprintOrder = new Map(sprints.map((sprint, index) => [sprint.id, index]));
    return Array.from(rows.values()).sort((a, b) => {
      if (a.id === 'backlog') return 1;
      if (b.id === 'backlog') return -1;
      return (
        (sprintOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (sprintOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      );
    });
  }, [report, sprints]);

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
          <Button nativeButton={false} variant="outline" render={<Link href={`/profile/${id}`} />}>
            View profile
          </Button>
        </HeaderActions>
      ) : null}

      {report?.user && (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.5rem' }}
        >
          <Avatar
            color={report.user.color}
            hasAvatar={report.user.hasAvatar}
            name={report.user.displayName}
            size={40}
            userId={report.user.id}
          />
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 600 }}>
              {report.user.displayName}
            </h1>
            <p className="muted" style={{ margin: 0, fontSize: '0.9em' }}>
              Workload, progress, and sprint contribution
            </p>
          </div>
        </div>
      )}

      <section className="board-filters" aria-label="Report filters">
        <label>
          <span>Period</span>
          <Select value={sprintFilter} onChange={(e) => setSprintFilter(e.target.value)}>
            <option value="">All sprints and backlog</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} —{' '}
                {s.status === 'COMPLETED'
                  ? 'Completed'
                  : s.status === 'ACTIVE'
                    ? 'Active'
                    : 'Planned'}
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
              <strong>
                {report.totals.tasksDone}/{report.totals.taskCount}
              </strong>
              <span>Assigned tasks done</span>
            </div>
            <div className="report-stat">
              <strong>
                {report.totals.completedCount}/
                {report.totals.completedCount + report.totals.incompleteCount}
              </strong>
              <span>Assigned subtasks done</span>
            </div>
            <div className="report-stat">
              <strong>{report.totals.completionRate}%</strong>
              <span>Overall completion</span>
            </div>
            {report.totals.estimateHours > 0 && (
              <div className="report-stat">
                <strong>{formatEstimate(report.totals.estimateHours, 'HOURS')}</strong>
                <span>Completed subtask estimate</span>
              </div>
            )}
            {report.totals.estimatePoints > 0 && (
              <div className="report-stat">
                <strong>{report.totals.estimatePoints} pt</strong>
                <span>Completed subtask points</span>
              </div>
            )}
          </section>

          {sprintBreakdown.length > 0 && !sprintFilter && (
            <section aria-labelledby="sprint-breakdown-heading">
              <h2
                id="sprint-breakdown-heading"
                className="section-label"
                style={{ marginBottom: '0.75rem' }}
              >
                Work by sprint
              </h2>
              <div className="report-table-wrap">
                <Table size="sm" hoverableRows className="report-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Sprint</TableHead>
                      <TableHead scope="col">Status</TableHead>
                      <TableHead scope="col">Assigned tasks</TableHead>
                      <TableHead scope="col">Assigned subtasks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sprintBreakdown.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          {row.id === 'backlog' ? (
                            row.name
                          ) : (
                            <Link className="report-link" href={`/reports/sprint/${row.id}`}>
                              {row.name}
                            </Link>
                          )}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`report-badge ${row.status === 'COMPLETED' ? 'done' : 'pending'}`}
                          >
                            {row.status === 'BACKLOG'
                              ? 'Backlog'
                              : row.status === 'COMPLETED'
                                ? 'Completed'
                                : row.status === 'ACTIVE'
                                  ? 'Active'
                                  : 'Planned'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {row.tasksDone}/{row.tasks} done
                        </TableCell>
                        <TableCell>
                          {row.subtasksDone}/{row.subtasks} done
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}

          {report.assignedTasks.length > 0 && (
            <section aria-labelledby="tasks-heading">
              <h2 id="tasks-heading" className="section-label" style={{ marginBottom: '0.75rem' }}>
                Assigned tasks ({report.assignedTasks.length})
              </h2>
              <div className="report-table-wrap">
                <Table size="sm" hoverableRows className="report-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Task</TableHead>
                      <TableHead scope="col">Sprint</TableHead>
                      <TableHead scope="col">Column</TableHead>
                      <TableHead scope="col">Estimate</TableHead>
                      <TableHead scope="col">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.assignedTasks.map((task) => (
                      <TaskRow key={task.id} task={task} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}

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

          {report.assignedTasks.length === 0 &&
            report.completedSubtasks.length === 0 &&
            report.incompleteSubtasks.length === 0 && (
              <p className="muted" style={{ padding: '2rem 0' }}>
                No tasks or subtasks assigned to this member{sprintFilter ? ' in this sprint' : ''}.
              </p>
            )}
        </>
      ) : null}
    </div>
  );
}
