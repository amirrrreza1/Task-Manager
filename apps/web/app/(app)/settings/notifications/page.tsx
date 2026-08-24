'use client';

import { Mail, Message, Send } from '@appica/icons-react';
import { Button, Input } from '../../../../components/design-system';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AuthGate } from '../../../../components/auth-gate';
import { useAuth } from '../../../../components/auth-provider';
import { useToast } from '../../../../components/toast-provider';
import type { NotificationSettings } from '../../../../lib/types';

function Switch({
  checked,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-60 ${
        checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function NotificationSettingsAdmin() {
  const { user, request } = useAuth();
  const toast = useToast();

  const [smtpEnabled, setSmtpEnabled] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testingSmtp, setTestingSmtp] = useState(false);

  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramSaving, setTelegramSaving] = useState(false);
  const [proxyInput, setProxyInput] = useState('');
  const [proxySaving, setProxySaving] = useState(false);
  const [envProxyUrl, setEnvProxyUrl] = useState<string | null>(null);
  const [effectiveProxyUrl, setEffectiveProxyUrl] = useState<string | null>(null);
  const [testingTelegram, setTestingTelegram] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await request<NotificationSettings>('/settings/notifications');
      setSmtpEnabled(data.smtpEnabled || false);
      setTelegramEnabled(data.telegramEnabled || false);
      setProxyInput(data.telegramProxyUrl || '');
      setEnvProxyUrl(data.telegramEnvProxyUrl || null);
      setEffectiveProxyUrl(data.telegramEffectiveProxyUrl || null);
    } catch (caught) {
      toast.fromError(caught, 'Could not load notification settings.');
    }
  }, [request, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (user?.email) {
      setTestEmail((current) => current || user.email || '');
    }
  }, [user?.email]);

  async function toggleSmtp(next: boolean) {
    const previous = smtpEnabled;
    setSmtpEnabled(next);
    setSmtpSaving(true);
    try {
      const updated = await request<NotificationSettings>('/settings/notifications/smtp', {
        method: 'PATCH',
        body: JSON.stringify({ smtpEnabled: next }),
      });
      setSmtpEnabled(updated.smtpEnabled);
    } catch (caught) {
      setSmtpEnabled(previous);
      toast.fromError(caught, 'Could not update email notifications.');
    } finally {
      setSmtpSaving(false);
    }
  }

  async function runTestSmtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTestingSmtp(true);
    try {
      const res = await request<{ success: boolean; message: string }>(
        '/settings/notifications/smtp/test',
        {
          method: 'POST',
          body: JSON.stringify({ targetEmail: testEmail || undefined }),
        },
      );
      toast.success(res.message);
    } catch (caught) {
      toast.fromError(caught, 'SMTP test failed.');
    } finally {
      setTestingSmtp(false);
    }
  }

  async function toggleTelegram(next: boolean) {
    const previous = telegramEnabled;
    setTelegramEnabled(next);
    setTelegramSaving(true);
    try {
      const updated = await request<NotificationSettings>('/settings/notifications/telegram', {
        method: 'PATCH',
        body: JSON.stringify({ telegramEnabled: next }),
      });
      setTelegramEnabled(updated.telegramEnabled);
    } catch (caught) {
      setTelegramEnabled(previous);
      toast.fromError(caught, 'Could not update Telegram notifications.');
    } finally {
      setTelegramSaving(false);
    }
  }

  async function saveProxy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProxySaving(true);
    try {
      const updated = await request<NotificationSettings>('/settings/notifications/telegram', {
        method: 'PATCH',
        body: JSON.stringify({ telegramProxyUrl: proxyInput.trim() || null }),
      });
      setProxyInput(updated.telegramProxyUrl || '');
      setEnvProxyUrl(updated.telegramEnvProxyUrl || null);
      setEffectiveProxyUrl(updated.telegramEffectiveProxyUrl || null);
      toast.success(
        proxyInput.trim()
          ? 'Telegram proxy updated.'
          : 'Telegram proxy cleared (using environment default or direct connection).',
      );
    } catch (caught) {
      toast.fromError(caught, 'Could not save Telegram proxy.');
    } finally {
      setProxySaving(false);
    }
  }

  async function runTestTelegram() {
    setTestingTelegram(true);
    try {
      const res = await request<{ success: boolean; message: string }>(
        '/settings/notifications/telegram/test',
        { method: 'POST' },
      );
      toast.success(res.message);
    } catch (caught) {
      toast.fromError(caught, 'Telegram test failed.');
    } finally {
      setTestingTelegram(false);
    }
  }

  return (
    <div className="settings-layout max-w-4xl space-y-8">
      <div className="settings-card border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
              <Mail className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Email notifications
              </h2>
              <p className="text-xs text-gray-500">Send task updates by email.</p>
            </div>
          </div>
          <Switch
            checked={smtpEnabled}
            disabled={smtpSaving}
            label="Enable email notifications"
            onCheckedChange={(checked) => void toggleSmtp(checked)}
          />
        </div>

        <form
          onSubmit={runTestSmtp}
          className="mt-5 flex flex-col sm:flex-row gap-3 items-start sm:items-center"
        >
          <Input
            className="flex-1"
            placeholder="recipient@example.com"
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
          />
          <Button
            type="submit"
            variant="primary"
            disabled={testingSmtp}
            className="whitespace-nowrap flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            {testingSmtp ? 'Sending…' : 'Send test'}
          </Button>
        </form>
      </div>

      <div className="settings-card border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-lg bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400">
              <Message className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Telegram notifications
              </h2>
              <p className="text-xs text-gray-500">Broadcast updates to the team group chat.</p>
            </div>
          </div>
          <Switch
            checked={telegramEnabled}
            disabled={telegramSaving}
            label="Enable Telegram notifications"
            onCheckedChange={(checked) => void toggleTelegram(checked)}
          />
        </div>

        <form onSubmit={saveProxy} className="mt-5 space-y-2">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
            Telegram Proxy URL
          </label>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <Input
              className="flex-1"
              placeholder="e.g. socks5://127.0.0.1:1080 or http://127.0.0.1:8080"
              type="text"
              value={proxyInput}
              onChange={(e) => setProxyInput(e.target.value)}
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={proxySaving}
              className="whitespace-nowrap"
            >
              {proxySaving ? 'Saving…' : 'Save proxy'}
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Supports HTTP, HTTPS, and SOCKS5. Leave empty to use direct connection or the
            environment default.
          </p>
        </form>

        {effectiveProxyUrl && (
          <div className="mt-4 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/60 px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-800">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            <span>
              Active proxy:{' '}
              <code className="font-mono text-gray-700 dark:text-gray-300">
                {effectiveProxyUrl}
              </code>
              {!proxyInput.trim() && envProxyUrl && ' (from environment)'}
            </span>
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
          <Button
            type="button"
            variant="primary"
            disabled={testingTelegram}
            onClick={() => void runTestTelegram()}
            className="flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            {testingTelegram ? 'Sending…' : 'Send test'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function NotificationsSettingsPage() {
  return (
    <AuthGate admin>
      <NotificationSettingsAdmin />
    </AuthGate>
  );
}
