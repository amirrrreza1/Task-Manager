'use client';

import { Button, Input, Modal, Textarea } from '../../../components/design-system';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { HeaderActions } from '../../../components/header-actions';
import { useAuth } from '../../../components/auth-provider';
import { useToast } from '../../../components/toast-provider';
import { useWorkspace } from '../../../components/workspace-provider';
import { formatDate } from '../../../lib/app-config';
import type { Paginated, SprintSummary } from '../../../lib/types';

const labels = { PLANNED: 'Planned', ACTIVE: 'Active', COMPLETED: 'Completed' };

export default function SprintsPage() {
  const { request } = useAuth();
  const toast = useToast();
  const { currentWorkspace } = useWorkspace();
  const [sprints, setSprints] = useState<SprintSummary[]>([]);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const wsParam = currentWorkspace?.id ? `?workspaceId=${currentWorkspace.id}` : '';
      const response = await request<Paginated<SprintSummary>>(`/sprints${wsParam}`);
      setSprints(response.items);
    } catch (caught) {
      toast.fromError(caught, 'Could not load sprints.');
    }
  }, [request, currentWorkspace?.id, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    try {
      const sprint = await request<SprintSummary>('/sprints', {
        method: 'POST',
        body: JSON.stringify({
          name,
          goal: goal || null,
          ...(currentWorkspace?.id ? { workspaceId: currentWorkspace.id } : {}),
        }),
      });
      setSprints((current) => [sprint, ...current]);
      setName('');
      setGoal('');
      setShowForm(false);
      toast.success('Sprint created.');
    } catch (caught) {
      toast.fromError(caught, 'Could not create the sprint.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="page-stack">
      <HeaderActions>
        <Button nativeButton={false} variant="outline" render={<Link href="/sprints/history" />}>
          Sprint History
        </Button>
        <Button variant="primary" onClick={() => setShowForm(true)} type="button">
          Plan sprint
        </Button>
      </HeaderActions>

      <div className="sprint-page-nav">
        <div className="sprint-tabs" role="tablist">
          <Link className="sprint-tab active" href="/sprints">
            Active & Planned
          </Link>
          <Link className="sprint-tab" href="/sprints/history">
            Sprint History
          </Link>
        </div>
      </div>
      {showForm ? (
        <Modal
          className="modal"
          labelledBy="create-sprint-title"
          onOpenChange={(open) => {
            if (!open) setShowForm(false);
          }}
        >
          <header>
            <p className="section-label">Sprint planning</p>
            <h2 id="create-sprint-title">Plan a sprint</h2>
          </header>
          <form onSubmit={create}>
            <label>
              Sprint name
              <Input
                autoFocus
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </label>
            <label>
              Goal <small>Optional</small>
              <Textarea
                maxLength={10000}
                onChange={(event) => setGoal(event.target.value)}
                rows={2}
                value={goal}
              />
            </label>
            <footer>
              <Button variant="ghost" onClick={() => setShowForm(false)} type="button">
                Cancel
              </Button>
              <Button variant="primary" disabled={creating} type="submit">
                {creating ? 'Creating…' : 'Create planned sprint'}
              </Button>
            </footer>
          </form>
        </Modal>
      ) : null}
      <section className="sprint-list" aria-label="Sprint history">
        {sprints.map((sprint) => (
          <Link className="sprint-row" href={`/sprints/${sprint.id}`} key={sprint.id}>
            <div>
              <span className={`sprint-status ${sprint.status.toLowerCase()}`}>
                {labels[sprint.status]}
              </span>
              <h2>{sprint.name}</h2>
              <p>{sprint.goal || 'No goal set.'}</p>
            </div>
            <div className="sprint-row-meta">
              <span>
                {sprint.status === 'ACTIVE' && sprint.startsAt
                  ? `Started ${formatDate(sprint.startsAt)}`
                  : sprint.status === 'COMPLETED' && sprint.startsAt
                    ? `Started ${formatDate(sprint.startsAt)}`
                    : 'Planned'}
              </span>
              <span>
                {sprint.status === 'COMPLETED'
                  ? (sprint._count?.taskSnapshots ?? 0)
                  : (sprint._count?.tasks ?? 0)}{' '}
                tasks · {sprint._count?.comments ?? 0} comments
              </span>
            </div>
          </Link>
        ))}
        {!sprints.length ? (
          <div className="empty-state page-empty">
            <h2>No sprints yet</h2>
            <p>Plan your first sprint to collect work before starting it.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
