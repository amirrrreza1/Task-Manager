'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar } from '../../../../components/avatar';
import { useAuth } from '../../../../components/auth-provider';
import type {
  AvailableSprintTask,
  Paginated,
  SprintComment,
  SprintDetail,
  SprintSummary,
} from '../../../../lib/types';
import { isSprintWorkSelectionLocked } from '../../../../lib/sprint-work';

const statusLabel = { PLANNED: 'Planned', ACTIVE: 'Active', COMPLETED: 'Completed' };
const date = (value: string | null, withTime = false) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', ...(withTime ? { timeStyle: 'short' } : {}) }).format(new Date(value)) : 'Not scheduled';
const localInput = (value: string | null) => value ? new Date(value).toISOString().slice(0, 16) : '';

export default function SprintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { request, user } = useAuth();
  const [sprint, setSprint] = useState<SprintDetail | null>(null);
  const [planned, setPlanned] = useState<SprintSummary[]>([]);
  const [comment, setComment] = useState('');
  const [editingComment, setEditingComment] = useState<SprintComment | null>(null);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [carryIds, setCarryIds] = useState<string[]>([]);
  const [targetSprintId, setTargetSprintId] = useState('');
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [availableTasks, setAvailableTasks] = useState<AvailableSprintTask[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [selectedSubtaskIds, setSelectedSubtaskIds] = useState<string[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [detail, plannedResponse] = await Promise.all([
        request<SprintDetail>(`/sprints/${id}`),
        request<Paginated<SprintSummary>>('/sprints?status=PLANNED'),
      ]);
      setSprint(detail);
      setPlanned(plannedResponse.items.filter((item) => item.id !== id));
      setStartAt(localInput(detail.startsAt));
      setEndAt(localInput(detail.endsAt));
      setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load the sprint.'); }
  }, [id, request]);
  useEffect(() => { void load(); }, [load]);

  const unfinished = useMemo(() => (sprint?.taskSnapshots ?? []).filter((item) => !item.wasDone && item.taskId), [sprint]);
  const admin = user?.role === 'ADMIN';

  async function mutation(path: string, method = 'POST', body?: object) {
    setBusy(true); setError('');
    try { await request(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) }); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save the sprint.'); }
    finally { setBusy(false); }
  }

  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutation(`/sprints/${id}/start`, 'POST', { ...(startAt ? { startsAt: new Date(startAt).toISOString() } : {}), ...(endAt ? { endsAt: new Date(endAt).toISOString() } : {}) });
  }
  function saveComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = editingComment ? `/sprints/${id}/comments/${editingComment.id}` : `/sprints/${id}/comments`;
    void mutation(path, editingComment ? 'PATCH' : 'POST', { body: comment }).then(() => { setComment(''); setEditingComment(null); });
  }
  function carryOver(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutation(`/sprints/${id}/carry-over`, 'POST', { targetSprintId, taskIds: carryIds }).then(() => setCarryIds([]));
  }

  async function openPlanner() {
    setPlannerOpen(true);
    setLoadingTasks(true);
    setError('');
    try {
      const tasks = await request<AvailableSprintTask[]>(`/sprints/${id}/available-tasks`);
      setAvailableTasks(tasks);
      setSelectedTaskIds([]); setSelectedSubtaskIds([]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load available tasks.'); }
    finally { setLoadingTasks(false); }
  }

  async function assignTasks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await Promise.all([
        selectedTaskIds.length
          ? request(`/sprints/${id}/tasks`, { method: 'POST', body: JSON.stringify({ taskIds: selectedTaskIds }) })
          : Promise.resolve(),
        selectedSubtaskIds.length
          ? request(`/sprints/${id}/subtasks`, { method: 'POST', body: JSON.stringify({ subtaskIds: selectedSubtaskIds }) })
          : Promise.resolve(),
      ]);
      setPlannerOpen(false); setSelectedTaskIds([]); setSelectedSubtaskIds([]); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not add the selected tasks.'); }
    finally { setBusy(false); }
  }

  if (!sprint && !error) return <div className="task-detail-loading"><span className="spinner" /> Loading sprint…</div>;
  if (!sprint) return <p className="form-error" role="alert">{error}</p>;

  return <div className="page-stack sprint-detail">
    <header className="page-header compact-header">
      <div><Link className="back-link" href="/sprints">← All sprints</Link><p className="eyebrow">{statusLabel[sprint.status]} sprint</p><h1>{sprint.name}</h1><p className="muted">{sprint.goal || 'No goal set for this sprint.'}</p></div>
      <div className="header-actions">{sprint.status !== 'COMPLETED' ? <button className="button secondary" onClick={() => void openPlanner()} type="button">Add tasks</button> : null}{admin && sprint.status === 'ACTIVE' ? <button className="button primary" disabled={busy} onClick={() => void mutation(`/sprints/${id}/finish`)} type="button">Finish sprint</button> : null}</div>
    </header>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <section className="sprint-overview">
      <div><span>Schedule</span><strong>{date(sprint.startsAt)} — {date(sprint.endsAt)}</strong></div>
      <div><span>Completed</span><strong>{sprint.outcomes.completed} of {sprint.outcomes.total}</strong></div>
      <div><span>Remaining</span><strong>{sprint.outcomes.incomplete}</strong></div>
      <div><span>Estimates</span><strong>{Object.entries(sprint.outcomes.estimates).map(([unit, value]) => `${value} ${unit === 'MINUTES' ? 'min' : 'pts'}`).join(' · ') || 'None'}</strong></div>
    </section>
    {admin && sprint.status === 'PLANNED' ? <form className="sprint-form sprint-start" onSubmit={start}>
      <div><h2>Start this sprint</h2><p className="muted">The workspace duration proposes the end date. Change it here if this sprint needs a different cadence.</p></div>
      <label>Start date<input onChange={(event) => setStartAt(event.target.value)} type="datetime-local" value={startAt} /></label>
      <label>Target end date<input onChange={(event) => setEndAt(event.target.value)} type="datetime-local" value={endAt} /></label>
      <button className="button primary" disabled={busy} type="submit">Start sprint</button>
    </form> : null}
    <section className="sprint-content">
      <div className="sprint-panel"><h2>{sprint.status === 'COMPLETED' ? 'Final outcome' : 'Sprint work'}</h2>
        {(sprint.status === 'COMPLETED' ? sprint.taskSnapshots : sprint.tasks).map((task) => {
          const completed = 'wasDone' in task ? task.wasDone : task.column.isDone;
          const taskId = 'taskId' in task ? task.taskId : task.id;
          return <div className="sprint-work-item" key={task.id}><div className="sprint-task"><span className={completed ? 'done-marker' : 'open-marker'} aria-label={completed ? 'Completed' : 'Not completed'} />
            <div>{taskId ? <Link href={`/tasks/${taskId}`}>{task.title}</Link> : <strong>{task.title}</strong>}<small>{'columnName' in task ? task.columnName : task.column.name}</small></div>
            <span>{task.estimateValue ? `${task.estimateValue} ${task.estimateUnit === 'MINUTES' ? 'min' : 'pts'}` : '—'}</span></div>
            {'subtasks' in task && task.subtasks.length ? <div className="sprint-subtasks">{task.subtasks.map((subtask) => <div key={subtask.id}><span className={subtask.isCompleted ? 'done-marker' : 'open-marker'} /><span>{subtask.title}</span><small>{subtask.assignee?.displayName ?? 'Unassigned'}</small></div>)}</div> : null}</div>;
        })}
        {!sprint.outcomes.total ? <p className="empty-copy">No tasks are assigned to this sprint yet.</p> : null}
      </div>
      {sprint.subtasks.length ? <div className="sprint-panel standalone-subtasks"><h2>Planned subtasks</h2><p className="muted">These are planned independently of their parent task.</p>{sprint.subtasks.map((subtask) => <div className="sprint-task" key={subtask.id}><span className={subtask.isCompleted ? 'done-marker' : 'open-marker'} /><div><strong>{subtask.title}</strong><small>From <Link href={`/tasks/${subtask.task.id}`}>{subtask.task.title}</Link>{subtask.assignee ? ` · ${subtask.assignee.displayName}` : ''}</small></div><span>{subtask.estimateValue ? `${subtask.estimateValue} ${subtask.estimateUnit === 'MINUTES' ? 'min' : 'pts'}` : '—'}</span></div>)}</div> : null}
      <div className="sprint-panel"><h2>Notes</h2><form className="comment-form" onSubmit={saveComment}><textarea aria-label="Sprint comment" maxLength={10000} onChange={(event) => setComment(event.target.value)} placeholder="Add a retrospective note or update…" required rows={3} value={comment} /><div><button className="button primary compact" disabled={busy} type="submit">{editingComment ? 'Save edit' : 'Add comment'}</button>{editingComment ? <button className="button ghost compact" onClick={() => { setEditingComment(null); setComment(''); }} type="button">Cancel</button> : null}</div></form>
        <div className="comment-list">{sprint.comments.map((item) => <article className="sprint-comment" key={item.id}><Avatar name={item.author.displayName} seed={item.author.avatarSeed} size={30} /><div><strong>{item.author.displayName}</strong><small>{date(item.createdAt, true)}{item.updatedAt !== item.createdAt ? ' · edited' : ''}</small><p>{item.body}</p>{(item.authorId === user?.id || admin) ? <div className="comment-actions"><button onClick={() => { setEditingComment(item); setComment(item.body); }} type="button">Edit</button><button onClick={() => void mutation(`/sprints/${id}/comments/${item.id}`, 'DELETE')} type="button">Delete</button></div> : null}</div></article>)}</div>
      </div>
    </section>
    {admin && sprint.status === 'COMPLETED' && unfinished.length ? <form className="sprint-panel carry-over" onSubmit={carryOver}><h2>Carry unfinished work forward</h2><p className="muted">The completed sprint keeps this final snapshot; selected tasks move to a planned sprint.</p><label>Planned sprint<select onChange={(event) => setTargetSprintId(event.target.value)} required value={targetSprintId}><option value="">Choose a sprint</option>{planned.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="carry-items">{unfinished.map((task) => <label key={task.id}><input checked={carryIds.includes(task.taskId!)} onChange={() => setCarryIds((current) => current.includes(task.taskId!) ? current.filter((value) => value !== task.taskId) : [...current, task.taskId!])} type="checkbox" />{task.title}</label>)}</div><button className="button secondary" disabled={busy || !targetSprintId || !carryIds.length || !planned.length} type="submit">Carry over selected work</button>{!planned.length ? <p className="empty-copy">Create a planned sprint before carrying work over.</p> : null}</form> : null}
    {plannerOpen ? <div className="modal-backdrop" role="presentation"><section className="modal sprint-planner" aria-labelledby="sprint-planner-title" aria-modal="true" role="dialog"><header><p className="section-label">Sprint planning</p><h2 id="sprint-planner-title">Add work to {sprint.name}</h2><p className="muted">Choose a parent task, or select only the subtasks you want to plan beneath it.</p></header><form onSubmit={assignTasks}><div className="planner-task-list">{loadingTasks ? <p className="muted">Loading work…</p> : <>{availableTasks.map((task) => { const parentLocked = isSprintWorkSelectionLocked(task.sprint, id); const parentSelected = selectedTaskIds.includes(task.id); return <div className="planner-task" key={task.id}><label className="planner-task-main"><input checked={parentSelected} disabled={parentLocked} onChange={(event) => { setSelectedTaskIds((current) => event.target.checked ? [...current, task.id] : current.filter((item) => item !== task.id)); if (event.target.checked) setSelectedSubtaskIds((current) => current.filter((item) => !task.subtasks.some((subtask) => subtask.id === item))); }} type="checkbox" /><div><strong>{task.title}</strong><small>{task.column.name}{task.sprint ? ` · Currently in ${task.sprint.name}` : ' · No sprint'}</small></div></label>{task.subtasks.length ? <div className="planner-subtasks">{task.subtasks.map((subtask) => { const subtaskLocked = isSprintWorkSelectionLocked(subtask.sprint, id); return <label key={subtask.id}><input checked={selectedSubtaskIds.includes(subtask.id)} disabled={parentSelected || subtaskLocked} onChange={(event) => setSelectedSubtaskIds((current) => event.target.checked ? [...current, subtask.id] : current.filter((item) => item !== subtask.id))} type="checkbox" /><i className={subtask.isCompleted ? 'done-marker' : 'open-marker'} /><span>{subtask.title}</span><small>{subtask.sprint ? `In ${subtask.sprint.name}` : 'No sprint'}</small></label>; })}</div> : <p className="empty-copy">No subtasks</p>}</div>; })}{!availableTasks.length ? <p className="empty-copy">Every task and subtask is already in this sprint or locked to an active/completed sprint.</p> : null}</>}</div><footer><button className="button ghost" onClick={() => setPlannerOpen(false)} type="button">Cancel</button><button className="button primary" disabled={busy || (!selectedTaskIds.length && !selectedSubtaskIds.length)} type="submit">Add selected work</button></footer></form></section></div> : null}
  </div>;
}
