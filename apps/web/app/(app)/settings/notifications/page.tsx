'use client';

import { Mail, Message, Send } from '@appica/icons-react';
import { Button, Checkbox, Input } from '../../../../components/design-system';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AuthGate } from '../../../../components/auth-gate';
import { useAuth } from '../../../../components/auth-provider';
import { useToast } from '../../../../components/toast-provider';
import type { NotificationSettings } from '../../../../lib/types';

function NotificationSettingsAdmin() {
  const { user, request } = useAuth();
  const toast = useToast();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);

  // SMTP State
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('Task Manager');
  const [smtpEnabled, setSmtpEnabled] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);

  // SMTP Test State
  const [testEmail, setTestEmail] = useState('');
  const [testingSmtp, setTestingSmtp] = useState(false);

  // Telegram State
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramSaving, setTelegramSaving] = useState(false);

  // Telegram Test State
  const [testingTelegram, setTestingTelegram] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await request<NotificationSettings>('/settings/notifications');
      setSettings(data);
      setSmtpHost(data.smtpHost || '');
      setSmtpPort(data.smtpPort || 587);
      setSmtpSecure(data.smtpSecure || false);
      setSmtpUser(data.smtpUser || '');
      setSmtpPassword('');
      setSmtpFromEmail(data.smtpFromEmail || '');
      setSmtpFromName(data.smtpFromName || 'Task Manager');
      setSmtpEnabled(data.smtpEnabled || false);

      setTelegramBotToken('');
      setTelegramChatId(data.telegramChatId || '');
      setTelegramEnabled(data.telegramEnabled || false);

      if (user?.email && !testEmail) {
        setTestEmail(user.email);
      }
    } catch (caught) {
      toast.fromError(caught, 'Could not load notification settings.');
    }
  }, [request, user?.email, testEmail, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSmtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSmtpSaving(true);
    try {
      const updated = await request<NotificationSettings>('/settings/notifications/smtp', {
        method: 'PATCH',
        body: JSON.stringify({
          smtpHost,
          smtpPort: Number(smtpPort),
          smtpSecure,
          smtpUser,
          ...(smtpPassword ? { smtpPassword } : {}),
          smtpFromEmail,
          smtpFromName,
          smtpEnabled,
        }),
      });
      setSettings(updated);
      setSmtpPassword('');
      toast.success('SMTP configuration saved.');
    } catch (caught) {
      toast.fromError(caught, 'Could not save SMTP settings.');
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

  async function saveTelegram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTelegramSaving(true);
    try {
      const updated = await request<NotificationSettings>('/settings/notifications/telegram', {
        method: 'PATCH',
        body: JSON.stringify({
          ...(telegramBotToken ? { telegramBotToken } : {}),
          telegramChatId,
          telegramEnabled,
        }),
      });
      setSettings(updated);
      setTelegramBotToken('');
      toast.success('Telegram settings saved.');
    } catch (caught) {
      toast.fromError(caught, 'Could not save Telegram settings.');
    } finally {
      setTelegramSaving(false);
    }
  }

  async function runTestTelegram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTestingTelegram(true);
    try {
      const res = await request<{ success: boolean; message: string }>(
        '/settings/notifications/telegram/test',
        {
          method: 'POST',
          body: JSON.stringify({
            botToken: telegramBotToken || undefined,
            chatId: telegramChatId || undefined,
          }),
        },
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
      <header className="page-header compact-header">
        <div>
          <h1>Notifications & Integrations</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure SMTP email delivery and Telegram group chat notifications for your workspace.
          </p>
        </div>
      </header>

      {/* 1. SMTP Email Configuration Card */}
      <div className="settings-card border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 p-6 shadow-sm">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-100 dark:border-gray-800">
          <span className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
            <Mail className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              SMTP Email Server
            </h2>
            <p className="text-xs text-gray-500">
              Configure your outbound email server to send task assignments and status updates.
            </p>
          </div>
        </div>

        <form onSubmit={saveSmtp} className="mt-6 space-y-5">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <Checkbox checked={smtpEnabled} onChange={(e) => setSmtpEnabled(e.target.checked)} />
            <div>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Enable Email Notifications
              </span>
              <p className="text-xs text-gray-500">
                Dispatches automated emails to users who have an email address configured.
              </p>
            </div>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                SMTP Host
              </label>
              <Input
                placeholder="smtp.mailgun.org or smtp.gmail.com"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Port
              </label>
              <Input
                type="number"
                placeholder="587"
                value={smtpPort}
                onChange={(e) => setSmtpPort(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} />
            <span className="text-xs text-gray-700 dark:text-gray-300">
              Use SSL/TLS encryption (Check for port 465, uncheck for STARTTLS on port 587/25)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                SMTP Username
              </label>
              <Input
                placeholder="postmaster@yourdomain.com"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                SMTP Password {settings?.smtpHasPassword ? '(Password Saved)' : ''}
              </label>
              <Input
                type="password"
                placeholder={
                  settings?.smtpHasPassword
                    ? '•••••••• (Leave blank to keep current)'
                    : 'Enter SMTP password'
                }
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Sender Email (From)
              </label>
              <Input
                placeholder="notifications@yourdomain.com"
                type="email"
                value={smtpFromEmail}
                onChange={(e) => setSmtpFromEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Sender Name
              </label>
              <Input
                placeholder="Task Manager"
                value={smtpFromName}
                onChange={(e) => setSmtpFromName(e.target.value)}
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button variant="primary" type="submit" disabled={smtpSaving}>
              {smtpSaving ? 'Saving SMTP…' : 'Save SMTP Settings'}
            </Button>
          </div>
        </form>

        {/* Send Test Email Sub-Section */}
        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Verify Email Delivery
          </h3>
          <form
            onSubmit={runTestSmtp}
            className="flex flex-col sm:flex-row gap-3 items-start sm:items-center"
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
              variant="outline"
              disabled={testingSmtp || !smtpHost}
              className="whitespace-nowrap flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              {testingSmtp ? 'Sending Test…' : 'Send Test Email'}
            </Button>
          </form>
        </div>
      </div>

      {/* 2. Telegram Group Notifications Card */}
      <div className="settings-card border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 p-6 shadow-sm">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-100 dark:border-gray-800">
          <span className="p-2.5 rounded-lg bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400">
            <Message className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Telegram Group Bot
            </h2>
            <p className="text-xs text-gray-500">
              Broadcast task & sprint events into your team Telegram group with user @mentions.
            </p>
          </div>
        </div>

        <form onSubmit={saveTelegram} className="mt-6 space-y-5">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <Checkbox
              checked={telegramEnabled}
              onChange={(e) => setTelegramEnabled(e.target.checked)}
            />
            <div>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Enable Telegram Group Notifications
              </span>
              <p className="text-xs text-gray-500">
                Sends rich interactive alerts and tags users via their @telegramUsername.
              </p>
            </div>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Telegram Bot Token {settings?.telegramHasBotToken ? '(Token Saved)' : ''}
              </label>
              <Input
                type="password"
                placeholder={
                  settings?.telegramHasBotToken
                    ? `${settings.telegramBotTokenPreview} (Leave blank to keep)`
                    : '123456789:ABCdefGHIjklMNOpqrs...'
                }
                value={telegramBotToken}
                onChange={(e) => setTelegramBotToken(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Group Chat ID
              </label>
              <Input
                placeholder="-1001234567890"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button variant="primary" type="submit" disabled={telegramSaving}>
              {telegramSaving ? 'Saving Telegram…' : 'Save Telegram Settings'}
            </Button>
          </div>
        </form>

        {/* Send Test Telegram Sub-Section */}
        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Verify Telegram Connection
          </h3>
          <form onSubmit={runTestTelegram} className="flex gap-3 items-center">
            <Button
              type="submit"
              variant="outline"
              disabled={testingTelegram || (!telegramChatId && !settings?.telegramChatId)}
              className="flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              {testingTelegram ? 'Sending Test…' : 'Send Test Telegram Message'}
            </Button>
          </form>
        </div>

        {/* Setup Guide Box */}
        <div className="mt-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 text-xs space-y-2 text-gray-600 dark:text-gray-300">
          <p className="font-semibold text-gray-900 dark:text-gray-100">
            📌 How to configure Telegram Group Notifications:
          </p>
          <ol className="list-decimal list-inside space-y-1 ml-1 leading-relaxed">
            <li>
              Open Telegram and message <strong>@BotFather</strong> to create a new bot (
              <code>/newbot</code>) and copy the API Token.
            </li>
            <li>Add your bot as a member or administrator to your team's Telegram Group chat.</li>
            <li>
              Find your Group Chat ID (for example, add <strong>@RawDataBot</strong> to the group
              temporarily or check updates).
            </li>
            <li>
              Workspace members can set their <strong>@telegramUsername</strong> on their{' '}
              <Link href="/profile" className="text-blue-600 hover:underline">
                Profile
              </Link>{' '}
              to be automatically tagged in group messages!
            </li>
          </ol>
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
