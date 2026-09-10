'use client';

import { Button, Input } from '../../../../components/design-system';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar } from '../../../../components/avatar';
import { HeaderActions } from '../../../../components/header-actions';
import { PriorityBadge } from '../../../../components/priority-badge';
import { TaskTypeBadge } from '../../../../components/task-type-badge';
import { TaskIdBadge } from '../../../../components/task-id-badge';
import { useAuth } from '../../../../components/auth-provider';
import { useToast } from '../../../../components/toast-provider';
import { useWorkspace } from '../../../../components/workspace-provider';
import { formatDate } from '../../../../lib/app-config';
import { useBoardSocket } from '../../../../lib/use-board-socket';
import type { SprintHistoryRecord } from '../../../../lib/types';

export default function SprintHistoryPage() {
  const { request } = useAuth();
  const toast = useToast();
  const { currentWorkspace } = useWorkspace();
  const [history, setHistory] = useState<SprintHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedSprints, setExpandedSprints] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const wsParam = currentWorkspace?.id ? `?workspaceId=${currentWorkspace.id}` : '';
      const response = await request<SprintHistoryRecord[]>(`/sprints/history${wsParam}`);
      setHistory(response);
      if (response.length > 0) {
        setExpandedSprints((prev) => {
          if (Object.keys(prev).length === 0) {
            return { [response[0].id]: true };
          }
          return prev;
        });
      }
    } catch (caught) {
      toast.fromError(caught, 'Could not load sprint history.');
    } finally {
      setLoading(false);
    }
  }, [request, currentWorkspace?.id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleBoardUpdate = useCallback(() => {
    void load();
  }, [load]);

  useBoardSocket(currentWorkspace?.id, handleBoardUpdate);

  function toggleSprint(sprintId: string) {
    setExpandedSprints((prev) => ({
      ...prev,
      [sprintId]: !prev[sprintId],
    }));
  }

  function expandAll() {
    const all: Record<string, boolean> = {};
    for (const s of history) {
      all[s.id] = true;
    }
    setExpandedSprints(all);
  }

  function collapseAll() {
    setExpandedSprints({});
  }

  const query = search.trim().toLowerCase();

  const filteredHistory = useMemo(() => {
    if (!query) return history;
    return history
      .map((sprint) => {
        const matchingDoneTasks = sprint.doneTasks.filter(
          (t) =>
            t.title.toLowerCase().includes(query) ||
            t.assignees.some((a) => a.displayName.toLowerCase().includes(query)) ||
            t.subtasks.some((st) => st.title.toLowerCase().includes(query)),
        );
        const matchingStandalone = sprint.standaloneDoneSubtasks.filter(
          (st) =>
            st.title.toLowerCase().includes(query) ||
            st.taskTitle.toLowerCase().includes(query) ||
            st.assignee?.displayName.toLowerCase().includes(query),
        );
        const matchesSprint =
          sprint.name.toLowerCase().includes(query) ||
          (sprint.goal && sprint.goal.toLowerCase().includes(query));

        if (matchesSprint || matchingDoneTasks.length > 0 || matchingStandalone.length > 0) {
          return {
            ...sprint,
            doneTasks: matchesSprint ? sprint.doneTasks : matchingDoneTasks,
            standaloneDoneSubtasks: matchesSprint
              ? sprint.standaloneDoneSubtasks
              : matchingStandalone,
          };
        }
        return null;
      })
      .filter((s): s is SprintHistoryRecord => s !== null);
  }, [history, query]);

  return (
    <div className="page-stack sprint-history-page">
      <HeaderActions>
        <Button nativeButton={false} variant="outline" render={<Link href="/sprints" />}>
          Active & Planned
        </Button>
        <Button nativeButton={false} variant="primary" render={<Link href="/board" />}>
          Back to Board
        </Button>
      </HeaderActions>

      <div className="sprint-page-nav">
        <div className="sprint-tabs" role="tablist">
          <Link className="sprint-tab" href="/sprints">
            Active & Planned
          </Link>
          <Link className="sprint-tab active" href="/sprints/history">
            Sprint History
          </Link>
        </div>
      </div>

      <header className="sprint-history-header">
        <div>
          <h2>Sprint History</h2>
          <p className="muted">
            Review completed sprints and track what work was done in each sprint.
          </p>
        </div>
        <div className="sprint-history-controls">
          <Input
            className="sprint-history-search"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search completed tasks or assignees…"
            type="search"
            value={search}
          />
          {history.length > 1 ? (
            <div className="sprint-expand-toggle-group">
              <Button size="sm" variant="ghost" onClick={expandAll} type="button">
                Expand all
              </Button>
              <Button size="sm" variant="ghost" onClick={collapseAll} type="button">
                Collapse all
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      {loading ? (
        <div className="board-loading">
          <span className="spinner" /> Loading sprint history…
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="empty-state page-empty">
          <h2>{search ? 'No matching completed tasks' : 'No completed sprints yet'}</h2>
          <p>
            {search
              ? 'Try a different search term.'
              : 'When an active sprint is finished, its completed tasks will automatically be archived here.'}
          </p>
          {!search && (
            <div style={{ marginTop: '1rem' }}>
              <Button nativeButton={false} variant="primary" render={<Link href="/sprints" />}>
                Go to Sprints
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="sprint-history-list">
          {filteredHistory.map((sprint) => {
            const isExpanded = query ? true : Boolean(expandedSprints[sprint.id]);
            const totalDoneItems = sprint.doneTasks.length + sprint.standaloneDoneSubtasks.length;

            return (
              <section className="sprint-history-card" key={sprint.id}>
                <div
                  className="sprint-history-card-header"
                  onClick={() => toggleSprint(sprint.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleSprint(sprint.id);
                    }
                  }}
                  aria-expanded={isExpanded}
                >
                  <div className="sprint-history-header-main">
                    <div className="sprint-history-title-row">
                      <span className="sprint-status completed">Completed</span>
                      <h3 className="sprint-history-name">{sprint.name}</h3>
                      <span className="sprint-toggle-chevron">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                    {sprint.goal && <p className="sprint-history-goal">{sprint.goal}</p>}
                    <div className="sprint-history-dates muted">
                      {sprint.startsAt && <span>Started {formatDate(sprint.startsAt)}</span>}
                      {sprint.startsAt && sprint.completedAt && <span>·</span>}
                      {sprint.completedAt && <span>Completed {formatDate(sprint.completedAt)}</span>}
                    </div>
                  </div>

                  <div className="sprint-history-meta">
                    <div className="sprint-metric-chips">
                      <span className="metric-chip done" title="Completed tasks">
                        ✓ {sprint.completedTasks} of {sprint.totalTasks} tasks
                      </span>
                      {sprint.totalSubtasks > 0 && (
                        <span className="metric-chip" title="Completed subtasks">
                          {sprint.completedSubtasks} subtasks
                        </span>
                      )}
                      {(sprint.estimateTotals.hours > 0 || sprint.estimateTotals.points > 0) && (
                        <span className="metric-chip" title="Completed estimates">
                          {sprint.estimateTotals.hours > 0
                            ? `${sprint.estimateTotals.hours}h`
                            : ''}
                          {sprint.estimateTotals.hours > 0 && sprint.estimateTotals.points > 0
                            ? ' · '
                            : ''}
                          {sprint.estimateTotals.points > 0
                            ? `${sprint.estimateTotals.points} pts`
                            : ''}
                        </span>
                      )}
                    </div>
                    <Link
                      className="sprint-details-link"
                      href={`/sprints/${sprint.id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Sprint details →
                    </Link>
                  </div>
                </div>

                {isExpanded && (
                  <div className="sprint-history-card-body">
                    {totalDoneItems === 0 ? (
                      <p className="empty-copy">No completed tasks in this sprint.</p>
                    ) : (
                      <div className="sprint-done-tasks-list">
                        {sprint.doneTasks.map((task) => (
                          <div className="sprint-done-task-item" key={task.id}>
                            <div className="sprint-done-task-row">
                              <span className="done-marker" aria-label="Completed" />
                              <TaskTypeBadge type={task.type} showLabel={false} />
                              <div className="sprint-done-task-info">
                                {task.taskId ? <TaskIdBadge id={task.taskId} /> : null}
                                {task.taskId ? (
                                  <Link
                                    className="sprint-done-task-title"
                                    href={`/tasks/${task.taskId}`}
                                  >
                                    {task.title}
                                  </Link>
                                ) : (
                                  <strong className="sprint-done-task-title">{task.title}</strong>
                                )}
                                <span className="sprint-done-task-column tag">
                                  {task.columnName}
                                </span>
                              </div>

                              <div className="sprint-done-task-facts">
                                <PriorityBadge priority={task.priority} />
                                {task.estimateValue ? (
                                  <span className="sprint-estimate-pill">
                                    {task.estimateValue}{' '}
                                    {task.estimateUnit === 'HOURS' ? 'h' : 'pts'}
                                  </span>
                                ) : null}
                                <div className="sprint-assignees">
                                  {task.assignees.length > 0 ? (
                                    task.assignees.map((user) => (
                                      <Avatar
                                        color={user.color}
                                        hasAvatar={user.hasAvatar}
                                        key={user.id}
                                        name={user.displayName}
                                        size={22}
                                        userId={user.id}
                                      />
                                    ))
                                  ) : (
                                    <span className="muted" style={{ fontSize: '0.8rem' }}>
                                      Unassigned
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {task.subtasks.length > 0 && (
                              <div className="sprint-done-nested-subtasks">
                                {task.subtasks.map((subtask) => (
                                  <div className="sprint-done-subtask-row" key={subtask.id}>
                                    <span className="done-marker subtask" />
                                    {subtask.id ? <TaskIdBadge id={subtask.id} /> : null}
                                    <span className="sprint-done-subtask-title">
                                      {subtask.title}
                                    </span>
                                    <div className="sprint-done-task-facts">
                                      {subtask.estimateValue ? (
                                        <small className="muted">
                                          {subtask.estimateValue}{' '}
                                          {subtask.estimateUnit === 'HOURS' ? 'h' : 'pts'}
                                        </small>
                                      ) : null}
                                      {subtask.assignee ? (
                                        <div
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                          }}
                                        >
                                          <Avatar
                                            color={subtask.assignee.color}
                                            hasAvatar={subtask.assignee.hasAvatar}
                                            name={subtask.assignee.displayName}
                                            size={18}
                                            userId={subtask.assignee.id}
                                          />
                                          <small className="muted">
                                            {subtask.assignee.displayName}
                                          </small>
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}

                        {sprint.standaloneDoneSubtasks.length > 0 && (
                          <div className="sprint-standalone-done-section">
                            <h4 className="section-label">Standalone completed subtasks</h4>
                            {sprint.standaloneDoneSubtasks.map((subtask) => (
                              <div className="sprint-done-subtask-row standalone" key={subtask.id}>
                                <span className="done-marker subtask" />
                                {subtask.id ? <TaskIdBadge id={subtask.id} /> : null}
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span className="sprint-done-subtask-title">
                                    {subtask.title}
                                  </span>
                                  <small className="muted">
                                    Parent:{' '}
                                    {subtask.taskId ? (
                                      <Link href={`/tasks/${subtask.taskId}`}>
                                        {subtask.taskTitle}
                                      </Link>
                                    ) : (
                                      subtask.taskTitle
                                    )}
                                  </small>
                                </div>
                                <div className="sprint-done-task-facts">
                                  {subtask.estimateValue ? (
                                    <span className="sprint-estimate-pill">
                                      {subtask.estimateValue}{' '}
                                      {subtask.estimateUnit === 'HOURS' ? 'h' : 'pts'}
                                    </span>
                                  ) : null}
                                  {subtask.assignee ? (
                                    <div
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                      }}
                                    >
                                      <Avatar
                                        color={subtask.assignee.color}
                                        hasAvatar={subtask.assignee.hasAvatar}
                                        name={subtask.assignee.displayName}
                                        size={18}
                                        userId={subtask.assignee.id}
                                      />
                                      <small className="muted">
                                        {subtask.assignee.displayName}
                                      </small>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
