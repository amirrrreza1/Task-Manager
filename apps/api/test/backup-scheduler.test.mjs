import assert from 'node:assert/strict';
import { test, describe, beforeEach } from 'node:test';
import {
  parseScheduleTime,
  calculateNextRun,
  BackupSchedulerService,
} from '../dist/backup/backup-scheduler.service.js';

describe('BackupSchedulerService & helpers', () => {
  describe('parseScheduleTime', () => {
    test('parses standard 00:00', () => {
      const result = parseScheduleTime('00:00');
      assert.deepEqual(result, { hour: 0, minute: 0 });
    });

    test('parses 12:00 PM', () => {
      const result = parseScheduleTime('12:00');
      assert.deepEqual(result, { hour: 12, minute: 0 });
    });

    test('parses single digit hour like 0:30', () => {
      const result = parseScheduleTime('0:30');
      assert.deepEqual(result, { hour: 0, minute: 30 });
    });

    test('clamps hours and minutes', () => {
      const result = parseScheduleTime('25:70');
      assert.deepEqual(result, { hour: 23, minute: 59 });
    });

    test('defaults to 00:00 for invalid or empty inputs', () => {
      assert.deepEqual(parseScheduleTime(null), { hour: 0, minute: 0 });
      assert.deepEqual(parseScheduleTime(''), { hour: 0, minute: 0 });
      assert.deepEqual(parseScheduleTime('invalid'), { hour: 0, minute: 0 });
    });
  });

  describe('calculateNextRun', () => {
    test('schedules for next day when target time has passed today (local)', () => {
      const fakeNow = new Date('2026-09-13T14:30:00.000Z');
      const nextRun = calculateNextRun(0, 0, null, fakeNow);

      assert.ok(nextRun.getTime() > fakeNow.getTime(), 'next run must be in the future');
      assert.equal(nextRun.getHours(), 0);
      assert.equal(nextRun.getMinutes(), 0);
      assert.equal(nextRun.getSeconds(), 0);
    });

    test('schedules for later today if target time has not passed (local)', () => {
      // Local time: construct a Date where target hour (23) is in the future
      const fakeNow = new Date();
      fakeNow.setHours(10, 0, 0, 0);

      const nextRun = calculateNextRun(23, 0, null, fakeNow);
      assert.ok(nextRun.getTime() > fakeNow.getTime());
      assert.equal(nextRun.getDate(), fakeNow.getDate());
      assert.equal(nextRun.getHours(), 23);
    });

    test('handles UTC timezone properly', () => {
      const fakeNow = new Date('2026-09-13T14:00:00.000Z');
      const nextRun = calculateNextRun(0, 0, 'UTC', fakeNow);

      assert.ok(nextRun.getTime() > fakeNow.getTime());
      // In UTC, next midnight is 2026-09-14T00:00:00.000Z (10 hours later)
      const diffHours = (nextRun.getTime() - fakeNow.getTime()) / (1000 * 3600);
      assert.equal(diffHours, 10);
      assert.equal(nextRun.toISOString(), '2026-09-14T00:00:00.000Z');
    });

    test('handles regional timezone e.g. Asia/Tehran', () => {
      const fakeNow = new Date('2026-09-13T12:00:00.000Z');
      const nextRun = calculateNextRun(0, 0, 'Asia/Tehran', fakeNow);

      assert.ok(nextRun.getTime() > fakeNow.getTime());
    });
  });

  describe('BackupSchedulerService lifecycle and manual run', () => {
    let mockConfig;
    let mockBackupService;
    let sendToTelegramCalls;

    beforeEach(() => {
      sendToTelegramCalls = [];
      mockConfig = {
        get: (key) => {
          if (key === 'BACKUP_NIGHTLY_TELEGRAM_ENABLED') return 'true';
          if (key === 'BACKUP_NIGHTLY_TIME') return '00:00';
          if (key === 'BACKUP_NIGHTLY_TIMEZONE') return 'UTC';
          if (key === 'BACKUP_NIGHTLY_INCLUDE_ATTACHMENTS') return 'true';
          return null;
        },
      };

      mockBackupService = {
        getStatus: async () => ({
          telegramConfigured: true,
          telegramEnabled: true,
        }),
        sendToTelegram: async (options, actorId) => {
          sendToTelegramCalls.push({ options, actorId });
          return {
            success: true,
            message: 'Backup file successfully sent to Telegram group.',
            filename: 'test-backup.zip',
            sizeBytes: 1024,
          };
        },
      };
    });

    test('initializes and reports schedule info correctly', () => {
      const scheduler = new BackupSchedulerService(mockConfig, mockBackupService);
      scheduler.onModuleInit();

      const info = scheduler.getScheduleInfo();
      assert.equal(info.enabled, true);
      assert.equal(info.time, '00:00');
      assert.equal(info.timezone, 'UTC');
      assert.equal(info.includeAttachments, true);
      assert.ok(info.nextRunAt !== null);

      scheduler.onModuleDestroy();
    });

    test('triggerManualRun calls sendToTelegram with automated: true and test caption', async () => {
      const scheduler = new BackupSchedulerService(mockConfig, mockBackupService);
      scheduler.onModuleInit();

      const res = await scheduler.triggerManualRun();
      assert.equal(res.success, true);
      assert.equal(sendToTelegramCalls.length, 1);
      assert.equal(sendToTelegramCalls[0].options.automated, true);
      assert.equal(sendToTelegramCalls[0].actorId, null);
      assert.ok(sendToTelegramCalls[0].options.captionPrefix.includes('Test Run'));

      scheduler.onModuleDestroy();
    });

    test('remains disabled when config is false', () => {
      const disabledConfig = {
        get: (key) => (key === 'BACKUP_NIGHTLY_TELEGRAM_ENABLED' ? 'false' : null),
      };
      const scheduler = new BackupSchedulerService(disabledConfig, mockBackupService);
      scheduler.onModuleInit();

      const info = scheduler.getScheduleInfo();
      assert.equal(info.enabled, false);
      assert.equal(info.nextRunAt, null);

      scheduler.onModuleDestroy();
    });
  });

  describe('BackupService 50MB fallback behavior for automated runs', () => {
    test('falls back to json snapshot when automated is true and zip exceeds 50MB', async () => {
      const { BackupService } = await import('../dist/backup/backup.service.js');
      let sentDoc = null;
      const mockTelegramService = {
        sendDocument: async (opts) => {
          sentDoc = opts;
          return { success: true, message: 'Document sent' };
        },
      };
      const mockPrisma = {
        activityEvent: { create: async () => ({}) },
      };
      const mockConfig = { get: () => './uploads' };

      const service = new BackupService(mockPrisma, mockConfig, mockTelegramService);

      let callCount = 0;
      service.createBackupFile = async (options) => {
        callCount++;
        if (options.includeAttachments) {
          // Simulate > 50MB zip
          return {
            buffer: Buffer.alloc(51 * 1024 * 1024),
            filename: 'oversized.zip',
            mimeType: 'application/zip',
            metadata: {
              exportedAt: '2026-09-13T00:00:00.000Z',
              counts: {
                workspaces: 1,
                projects: 1,
                tasks: 1,
                subtasks: 0,
                users: 1,
                attachments: 50,
              },
            },
          };
        } else {
          // Fallback lightweight json
          return {
            buffer: Buffer.from('{"data": true}'),
            filename: 'records-only.json',
            mimeType: 'application/json',
            metadata: {
              exportedAt: '2026-09-13T00:00:00.000Z',
              counts: {
                workspaces: 1,
                projects: 1,
                tasks: 1,
                subtasks: 0,
                users: 1,
                attachments: 0,
              },
            },
          };
        }
      };

      const result = await service.sendToTelegram(
        { automated: true, includeAttachments: true },
        null,
      );

      assert.equal(result.success, true);
      assert.equal(callCount, 2); // Initial attempt + fallback attempt
      assert.ok(sentDoc);
      assert.ok(sentDoc.caption.includes('Attachments exceeded 50 MB limit'));
      assert.ok(sentDoc.caption.includes('Automated Nightly Backup'));
      assert.equal(sentDoc.filename, 'records-only.json');
    });
  });
});
