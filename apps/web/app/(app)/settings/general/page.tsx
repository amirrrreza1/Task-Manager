'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AuthGate } from '../../../../components/auth-gate';
import { useAuth } from '../../../../components/auth-provider';
import type { AppSettings } from '../../../../lib/types';

function GeneralSettings() {
  const { request } = useAuth();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [estimateMode, setEstimateMode] = useState<'TIME' | 'POINTS'>('TIME');
  const [duration, setDuration] = useState(14);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const value = await request<AppSettings>('/settings');
      setSettings(value);
      setEstimateMode(value.estimateMode);
      setDuration(value.sprintDurationDays);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load settings.');
    }
  }, [request]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const value = await request<AppSettings>('/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          estimateMode,
          sprintDurationDays: duration,
          revision: settings.revision,
        }),
      });
      setSettings(value);
      setMessage('Workspace settings saved.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-layout">
      <header className="page-header compact-header">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Planning defaults</h1>
          <p className="muted">Set the language your team uses for estimates and sprint cadence.</p>
        </div>
      </header>

      <form className="settings-card" onSubmit={save}>
        <section>
          <div className="setting-copy">
            <h2>Estimate mode</h2>
            <p>New estimates use this unit. Existing estimates keep their original unit.</p>
          </div>
          <div className="segmented-control" role="radiogroup" aria-label="Estimate mode">
            <label className={estimateMode === 'TIME' ? 'selected' : undefined}>
              <input
                checked={estimateMode === 'TIME'}
                name="estimateMode"
                onChange={() => setEstimateMode('TIME')}
                type="radio"
              />
              <strong>Time</strong>
              <span>Minutes and hours</span>
            </label>
            <label className={estimateMode === 'POINTS' ? 'selected' : undefined}>
              <input
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
            <input
              max={90}
              min={1}
              onChange={(event) => setDuration(Number(event.target.value))}
              type="number"
              value={duration}
            />
            <span>days</span>
          </label>
        </section>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="form-success" role="status">
            {message}
          </p>
        ) : null}
        <footer className="settings-footer">
          <span>{settings ? `Revision ${settings.revision}` : 'Loading settings…'}</span>
          <button className="button primary" disabled={!settings || saving} type="submit">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
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
