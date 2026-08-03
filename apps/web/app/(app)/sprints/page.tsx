'use client';

import { Button, Input, Modal, Textarea } from '../../../components/design-system';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../components/auth-provider';
import { formatDate } from '../../../lib/app-config';
import type { Paginated, SprintSummary } from '../../../lib/types';

const labels = { PLANNED: 'Planned', ACTIVE: 'Active', COMPLETED: 'Completed' };

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
        <div><h1>Sprints</h1></div>
        <div className="header-actions"><Button variant="primary" onClick={() => setShowForm(true)} type="button">Plan sprint</Button></div>
      </header>
      {showForm ? <Modal
        className="modal"
        labelledBy="create-sprint-title"
        onOpenChange={(open) => { if (!open) setShowForm(false); }}
      >
        <header>
          <p className="section-label">Sprint planning</p>
          <h2 id="create-sprint-title">Plan a sprint</h2>
        </header>
        <form onSubmit={create}>
          <label>Sprint name<Input autoFocus maxLength={120} onChange={(event) => setName(event.target.value)} required value={name} /></label>
          <label>Goal <small>Optional</small><Textarea maxLength={10000} onChange={(event) => setGoal(event.target.value)} rows={2} value={goal} /></label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <footer>
            <Button variant="ghost" onClick={() => setShowForm(false)} type="button">Cancel</Button>
        <Button variant="primary" disabled={creating} type="submit">{creating ? 'Creating…' : 'Create planned sprint'}</Button>
          </footer>
        </form>
      </Modal> : null}
      {error && !showForm ? <p className="form-error" role="alert">{error}</p> : null}
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
