'use client';

import {
  AlertCircle,
  Check,
  Database,
  Download,
  FileText,
  Send,
  Upload,
} from '@appica/icons-react';
import { Button, Checkbox, Modal } from '../../../../components/design-system';
import Link from 'next/link';
import { type ChangeEvent, type DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { AuthGate } from '../../../../components/auth-gate';
import { useAuth } from '../../../../components/auth-provider';
import { useToast } from '../../../../components/toast-provider';
import type { BackupStatus, RestoreResult } from '../../../../lib/types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function BackupAdmin() {
  const { request, requestBlob } = useAuth();
  const toast = useToast();

  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Export options
  const [includeAttachments, setIncludeAttachments] = useState(true);
  const [exportFormat, setExportFormat] = useState<'zip' | 'json'>('zip');
  const [downloading, setDownloading] = useState(false);
  const [sendingTelegram, setSendingTelegram] = useState(false);

  // Restore options
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmedWipe, setConfirmedWipe] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadStatus = useCallback(async () => {
    try {
      const data = await request<BackupStatus>('/backup/status');
      setStatus(data);
    } catch (caught) {
      toast.fromError(caught, 'Could not load backup status.');
    } finally {
      setLoading(false);
    }
  }, [request, toast]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleDownload() {
    setDownloading(true);
    try {
      const query = new URLSearchParams({
        includeAttachments: String(includeAttachments),
        format: exportFormat,
      });
      const blob = await requestBlob(`/backup/download?${query.toString()}`);
      const extension = exportFormat === 'zip' || includeAttachments ? 'zip' : 'json';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `task-manager-backup-${timestamp}.${extension}`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success('Backup downloaded successfully.');
      void loadStatus();
    } catch (caught) {
      toast.fromError(caught, 'Failed to generate and download backup.');
    } finally {
      setDownloading(false);
    }
  }

  async function handleSendToTelegram() {
    setSendingTelegram(true);
    try {
      const res = await request<{
        success: boolean;
        message: string;
        filename: string;
        sizeBytes: number;
      }>('/backup/telegram', {
        method: 'POST',
        body: JSON.stringify({ includeAttachments }),
      });
      toast.success(res.message || 'Backup file successfully sent to Telegram group!');
      void loadStatus();
    } catch (caught) {
      toast.fromError(caught, 'Failed to send backup to Telegram group.');
    } finally {
      setSendingTelegram(false);
    }
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.zip') || file.name.endsWith('.json')) {
        setSelectedFile(file);
      } else {
        toast.error('Please upload a .zip or .json backup file.');
      }
    }
  }

  async function executeRestore() {
    if (!selectedFile) return;
    setRestoring(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const result = await request<RestoreResult>('/backup/restore', {
        method: 'POST',
        body: formData,
      });

      setShowConfirmModal(false);
      setSelectedFile(null);
      setConfirmedWipe(false);
      setRestoreResult(result);
      toast.success('Backup restored successfully!');
      void loadStatus();
    } catch (caught) {
      toast.fromError(caught, 'Failed to restore backup.');
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <span className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
            <Database className="w-6 h-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Backup & Restore</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Download system backups, dispatch them directly to your Telegram group, or restore
              data.
            </p>
          </div>
        </div>
      </div>

      {/* Metrics / Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">System Records</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {loading ? '…' : (status?.totalCounts.tasks ?? 0)}
            </span>
            <span className="text-xs text-gray-500">tasks</span>
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {status?.totalCounts.workspaces ?? 0} workspaces · {status?.totalCounts.projects ?? 0}{' '}
            projects · {status?.totalCounts.users ?? 0} users
          </div>
        </div>

        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Attachments Storage
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {loading ? '…' : formatBytes(status?.storageSizeBytes ?? 0)}
            </span>
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {status?.totalCounts.attachments ?? 0} uploaded files stored
          </div>
        </div>

        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Telegram Group</div>
          <div className="mt-2 flex items-center gap-2">
            {status?.telegramConfigured ? (
              <>
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  Connected
                </span>
              </>
            ) : (
              <>
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                  Not Configured
                </span>
              </>
            )}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {status?.telegramConfigured ? (
              <span className="truncate block font-mono">Chat: {status.telegramChatId}</span>
            ) : (
              <Link
                href="/settings/notifications"
                className="text-blue-600 dark:text-blue-400 underline hover:no-underline"
              >
                Configure in Notifications
              </Link>
            )}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Last Backup</div>
          <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {loading ? '…' : formatDate(status?.lastBackupAt ?? null)}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {status?.lastBackupAt ? 'Recorded activity' : 'No recent backup logged'}
          </div>
        </div>
      </div>

      {/* Export & Download Section */}
      <div className="border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 p-6 shadow-sm">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-100 dark:border-gray-800">
          <span className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
            <Download className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Export & Download Backup
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Create an archive of your workspaces, tasks, users, and files to download or send to
              Telegram.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="flex-1 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Backup Content & Format
              </label>

              <div className="flex items-center gap-3 pt-1">
                <Checkbox
                  id="includeAttachments"
                  checked={includeAttachments}
                  onChange={(e) => setIncludeAttachments(e.target.checked)}
                />
                <label
                  htmlFor="includeAttachments"
                  className="text-sm font-medium text-gray-800 dark:text-gray-200 cursor-pointer"
                >
                  Include file attachments and avatars
                </label>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 pl-7">
                Includes all uploaded PDFs, images, documents, and user avatars into the archive.
              </p>
            </div>

            <div className="flex-1 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Format
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setExportFormat('zip')}
                  className={`flex-1 p-3 rounded-lg border text-left transition-all ${
                    exportFormat === 'zip' || includeAttachments
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500'
                      : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                  }`}
                >
                  <div className="font-semibold text-xs">ZIP Archive (.zip)</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Full archive with database snapshot and uploads
                  </div>
                </button>

                <button
                  type="button"
                  disabled={includeAttachments}
                  onClick={() => setExportFormat('json')}
                  className={`flex-1 p-3 rounded-lg border text-left transition-all ${
                    includeAttachments
                      ? 'opacity-50 cursor-not-allowed border-gray-200 dark:border-gray-800'
                      : exportFormat === 'json'
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500'
                        : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                  }`}
                >
                  <div className="font-semibold text-xs">JSON Snapshot (.json)</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Lightweight, database records only (no attachments)
                  </div>
                </button>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-3">
            <Button
              type="button"
              variant="primary"
              disabled={downloading || sendingTelegram}
              onClick={() => void handleDownload()}
              className="flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              {downloading ? 'Preparing download…' : 'Download Backup File'}
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={downloading || sendingTelegram || !status?.telegramConfigured}
              onClick={() => void handleSendToTelegram()}
              className="flex items-center gap-2"
            >
              <Send className="w-4 h-4 text-sky-500 dark:text-sky-400" />
              {sendingTelegram ? 'Sending to Telegram…' : 'Send to Telegram Group'}
            </Button>

            {!status?.telegramConfigured && (
              <span className="self-center text-xs text-amber-600 dark:text-amber-400">
                (Telegram Bot token or Chat ID not configured)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Restore Section */}
      <div className="border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 p-6 shadow-sm">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-100 dark:border-gray-800">
          <span className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
            <Upload className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Restore System Data
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Upload a previously exported Task Manager backup file (.zip or .json) to restore data.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 dark:text-amber-200 space-y-1">
              <p className="font-semibold">Important Restore Notice</p>
              <p>
                Restoring a backup will replace current system records with the data inside the
                uploaded backup file. Any items added since the backup was taken will be
                overwritten. We recommend taking a fresh backup above before proceeding.
              </p>
            </div>
          </div>

          {/* Upload Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                : 'border-gray-300 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600 bg-gray-50/50 dark:bg-gray-800/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,.json,application/zip,application/json"
              onChange={onFileChange}
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center gap-2">
              <span className="p-3 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                <FileText className="w-6 h-6" />
              </span>
              {selectedFile ? (
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-gray-500">{formatBytes(selectedFile.size)}</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium pt-1">
                    Click or drag to choose a different file
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Click to select or drag and drop your backup file
                  </p>
                  <p className="text-xs text-gray-500">Supports .zip archives or .json exports</p>
                </div>
              )}
            </div>
          </div>

          {selectedFile && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-gray-500">
                Ready to restore:{' '}
                <span className="font-semibold text-gray-800 dark:text-gray-200">
                  {selectedFile.name}
                </span>{' '}
                ({formatBytes(selectedFile.size)})
              </span>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setConfirmedWipe(false);
                  setShowConfirmModal(true);
                }}
                disabled={restoring}
                className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white"
              >
                <Upload className="w-4 h-4" />
                {restoring ? 'Restoring…' : 'Restore from this file'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <Modal
          onOpenChange={setShowConfirmModal}
          className="max-w-md p-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xl space-y-4"
        >
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400">
              <AlertCircle className="w-6 h-6" />
            </span>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                Confirm System Restore
              </h3>
              <p className="text-xs text-gray-500">This action cannot be undone.</p>
            </div>
          </div>

          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            You are about to restore the system from{' '}
            <strong className="text-gray-900 dark:text-gray-100">{selectedFile?.name}</strong>. All
            existing tasks, workspaces, projects, and users will be replaced with the contents of
            this backup.
          </p>

          <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 flex items-start gap-3">
            <Checkbox
              id="confirmWipe"
              checked={confirmedWipe}
              onChange={(e) => setConfirmedWipe(e.target.checked)}
            />
            <label
              htmlFor="confirmWipe"
              className="text-xs font-medium text-gray-800 dark:text-gray-200 cursor-pointer"
            >
              I understand that current database data will be replaced by the backup snapshot.
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={restoring}
              onClick={() => setShowConfirmModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={!confirmedWipe || restoring}
              onClick={() => void executeRestore()}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {restoring ? 'Restoring System…' : 'Yes, Restore System'}
            </Button>
          </div>
        </Modal>
      )}

      {/* Restore Results Modal */}
      {restoreResult && (
        <Modal
          onOpenChange={() => setRestoreResult(null)}
          className="max-w-md p-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xl space-y-4"
        >
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
              <Check className="w-6 h-6" />
            </span>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                Restore Complete
              </h3>
              <p className="text-xs text-gray-500">System data restored successfully.</p>
            </div>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-gray-800 text-xs py-2">
            <div className="flex justify-between py-1.5">
              <span className="text-gray-500">Workspaces</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {restoreResult.counts.workspaces}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-gray-500">Projects</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {restoreResult.counts.projects}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-gray-500">Tasks & Subtasks</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {restoreResult.counts.tasks} tasks / {restoreResult.counts.subtasks} subtasks
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-gray-500">Users</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {restoreResult.counts.users}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-gray-500">Attachments</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {restoreResult.counts.attachments}
              </span>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setRestoreResult(null);
                window.location.reload();
              }}
            >
              Reload & Continue
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function BackupPage() {
  return (
    <AuthGate admin>
      <BackupAdmin />
    </AuthGate>
  );
}
