'use client';

import { Button, Input, Textarea } from '../../../components/design-system';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../components/auth-provider';
import type { Paginated, SprintSummary } from '../../../lib/types';

const labels = { PLANNED: 'Planned', ACTIVE: 'Active', COMPLETED: 'Completed' };

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : 'Not scheduled';
}

export default function SprintsPage() {
  const { request } = useAuth();
  const [sprints, setSprints] = useState<SprintSummary[]>([]);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await request<Paginated<SprintSummary>>('/sprints');
      setSprints(response.items);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load sprints.');
    }
  }, [request]);
  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError('');
    try {
      const sprint = await request<SprintSummary>('/sprints', {
        method: 'POST', body: JSON.stringify({ name, goal: goal || null }),
      });
      setSprints((current) => [sprint, ...current]);
      setName(''); setGoal(''); setShowForm(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the sprint.');
    } finally { setCreating(false); }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div><p className="eyebrow">Delivery cadence</p><h1>Sprints</h1><p className="muted">Plan work, run one focused sprint at a time, and keep the outcome visible after it closes.</p></div>
        <div className="header-actions"><Button variant="primary" onClick={() => setShowForm((value) => !value)} type="button">{showForm ? 'Close' : 'Plan sprint'}</Button></div>
      </header>
      {showForm ? <form className="sprint-form" onSubmit={create}>
        <label>Sprint name<Input autoFocus maxLength={120} onChange={(event) => setName(event.target.value)} required value={name} /></label>
        <label>Goal <small>Optional</small><Textarea maxLength={10000} onChange={(event) => setGoal(event.target.value)} rows={2} value={goal} /></label>
        <Button variant="primary" disabled={creating} type="submit">{creating ? 'Creating…' : 'Create planned sprint'}</Button>
      </form> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <section className="sprint-list" aria-label="Sprint history">
        {sprints.map((sprint) => <Link className="sprint-row" href={`/sprints/${sprint.id}`} key={sprint.id}>
          <div><span className={`sprint-status ${sprint.status.toLowerCase()}`}>{labels[sprint.status]}</span><h2>{sprint.name}</h2><p>{sprint.goal || 'No goal set.'}</p></div>
          <div className="sprint-row-meta"><span>{formatDate(sprint.startsAt)} — {formatDate(sprint.endsAt)}</span><span>{sprint.status === 'COMPLETED' ? (sprint._count?.taskSnapshots ?? 0) : (sprint._count?.tasks ?? 0)} tasks · {sprint._count?.comments ?? 0} comments</span></div>
        </Link>)}
        {!sprints.length ? <div className="empty-state"><h2>No sprints yet</h2><p>Plan your first sprint to collect work before starting it.</p></div> : null}
      </section>
    </div>
  );
}
