'use client';

import { Button, Input, Radio } from '../../../../components/design-system';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AuthGate } from '../../../../components/auth-gate';
import { useAuth } from '../../../../components/auth-provider';
import { useToast } from '../../../../components/toast-provider';
import { useWorkspace } from '../../../../components/workspace-provider';
import type { AppSettings } from '../../../../lib/types';

function GeneralSettings() {
  const { request } = useAuth();
  const toast = useToast();
  const { currentWorkspace, refreshWorkspaces } = useWorkspace();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [estimateMode, setEstimateMode] = useState<'TIME' | 'POINTS'>('TIME');
  const [duration, setDuration] = useState(14);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const wsParam = currentWorkspace?.id ? `?workspaceId=${currentWorkspace.id}` : '';
      const value = await request<AppSettings>(`/settings${wsParam}`);
      setSettings(value);
      setEstimateMode(value.estimateMode);
      setDuration(value.sprintDurationDays);
    } catch (caught) {
      toast.fromError(caught, 'Could not load settings.');
    }
  }, [request, currentWorkspace?.id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const value = await request<AppSettings>('/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          estimateMode,
          sprintDurationDays: duration,
          revision: settings.revision,
          ...(currentWorkspace?.id ? { workspaceId: currentWorkspace.id } : {}),
        }),
      });
      setSettings(value);
      await refreshWorkspaces();
      toast.success('Workspace settings saved.');
    } catch (caught) {
      toast.fromError(caught, 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-layout">
      <form className="settings-card" onSubmit={save}>
        <section>
          <div className="setting-copy">
            <h2>Estimate mode</h2>
            <p>New estimates use this unit. Existing estimates keep their original unit.</p>
          </div>
          <div className="segmented-control" role="radiogroup" aria-label="Estimate mode">
            <label className={estimateMode === 'TIME' ? 'selected' : undefined}>
              <Radio
                checked={estimateMode === 'TIME'}
                name="estimateMode"
                onChange={() => setEstimateMode('TIME')}
                type="radio"
              />
              <strong>Time</strong>
              <span>Hours</span>
            </label>
            <label className={estimateMode === 'POINTS' ? 'selected' : undefined}>
              <Radio
                checked={estimateMode === 'POINTS'}
                name="estimateMode"
                onChange={() => setEstimateMode('POINTS')}
                type="radio"
              />
              <strong>Points</strong>
              <span>Relative effort</span>
            </label>
          </div>
        </section>
        <section>
          <div className="setting-copy">
            <h2>Sprint duration</h2>
            <p>Used to propose an end date when an administrator starts a sprint.</p>
          </div>
          <label className="number-field">
            <Input
              max={90}
              min={1}
              onChange={(event) => setDuration(Number(event.target.value))}
              type="number"
              value={duration}
            />
            <span>days</span>
          </label>
        </section>
        <footer className="settings-footer">
          <Button variant="primary" disabled={!settings || saving} type="submit">
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </footer>
      </form>
    </div>
  );
}

export default function GeneralSettingsPage() {
  return (
    <AuthGate admin>
      <GeneralSettings />
    </AuthGate>
  );
}
