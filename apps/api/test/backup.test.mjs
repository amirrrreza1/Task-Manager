import assert from 'node:assert/strict';
import { test, describe, beforeEach } from 'node:test';
import AdmZip from 'adm-zip';
import { BackupService } from '../dist/backup/backup.service.js';

describe('BackupService', () => {
  let mockPrisma;
  let mockConfig;
  let mockTelegramService;

  beforeEach(() => {
    mockPrisma = {
      user: {
        count: async () => 2,
        findMany: async () => [
          {
            id: '11111111-1111-1111-1111-111111111111',
            username: 'admin',
            displayName: 'Admin User',
            color: '#2563eb',
            passwordHash: 'hash123',
            role: 'ADMIN',
            email: 'admin@example.com',
            telegramUsername: 'admin_tg',
            avatarStorageKey: null,
            avatarMimeType: null,
            hasAvatar: false,
            isActive: true,
            isBootstrapAdmin: true,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      },
      workspace: {
        count: async () => 1,
        findMany: async () => [
          {
            id: '22222222-2222-2222-2222-222222222222',
            name: 'Primary Workspace',
            description: 'Main workspace',
            estimateMode: 'TIME',
            sprintDurationDays: 14,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      },
      project: {
        count: async () => 1,
        findMany: async () => [
          {
            id: '33333333-3333-3333-3333-333333333333',
            workspaceId: '22222222-2222-2222-2222-222222222222',
            name: 'Core Project',
            key: 'COR',
            description: null,
            color: '#10b981',
            icon: 'folder',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      },
      projectSenior: {
        findMany: async () => [],
      },
      boardColumn: {
        findMany: async () => [
          {
            id: '44444444-4444-4444-4444-444444444444',
            workspaceId: '22222222-2222-2222-2222-222222222222',
            name: 'To Do',
            color: '#64748b',
            position: 1,
            isBacklog: false,
            isTodo: true,
            isReview: false,
            isDone: false,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      },
      sprint: {
        findMany: async () => [],
      },
      task: {
        count: async () => 1,
        findMany: async () => [
          {
            id: '55555555-5555-5555-5555-555555555555',
            workspaceId: '22222222-2222-2222-2222-222222222222',
            title: 'Sample Task',
            description: 'Task details',
            priority: 'HIGH',
            estimateValue: 4,
            estimateUnit: 'HOURS',
            position: 1000,
            columnId: '44444444-4444-4444-4444-444444444444',
            sprintId: null,
            createdById: '11111111-1111-1111-1111-111111111111',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      },
      taskProject: {
        findMany: async () => [],
      },
      taskAssignment: {
        findMany: async () => [],
      },
      subtask: {
        count: async () => 0,
        findMany: async () => [],
      },
      attachment: {
        count: async () => 1,
        findMany: async () => [
          {
            id: '66666666-6666-6666-6666-666666666666',
            ownerType: 'TASK',
            taskId: '55555555-5555-5555-5555-555555555555',
            subtaskId: null,
            storageKey: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
            originalName: 'test.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1024n, // BigInt!
            checksum: 'deadbeef',
            uploadedById: '11111111-1111-1111-1111-111111111111',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      },
      workItemComment: {
        findMany: async () => [],
      },
      sprintComment: {
        findMany: async () => [],
      },
      sprintTaskSnapshot: {
        findMany: async () => [],
      },
      sprintSubtaskSnapshot: {
        findMany: async () => [],
      },
      activityEvent: {
        findFirst: async () => null,
        findMany: async () => [],
        create: async () => ({}),
      },
      notification: {
        findMany: async () => [],
      },
      appSettings: {
        findMany: async () => [
          { id: 'default', estimateMode: 'TIME', sprintDurationDays: 14, revision: 1 },
        ],
      },
      notificationConfig: {
        findMany: async () => [{ id: 'default', smtpEnabled: false, telegramEnabled: true }],
        upsert: async () => ({ id: 'default', smtpEnabled: false, telegramEnabled: true }),
      },
      $transaction: async (fn) => {
        const deletedOrder = [];
        const createdOrder = [];
        const txMock = {
          outboxMessage: {
            deleteMany: async () => {
              deletedOrder.push('outboxMessage');
            },
          },
          notification: {
            deleteMany: async () => {
              deletedOrder.push('notification');
            },
            create: async () => {},
          },
          activityEvent: {
            deleteMany: async () => {
              deletedOrder.push('activityEvent');
            },
            create: async () => {},
          },
          refreshSession: {
            deleteMany: async () => {
              deletedOrder.push('refreshSession');
            },
          },
          workItemComment: {
            deleteMany: async () => {
              deletedOrder.push('workItemComment');
            },
            create: async () => {},
          },
          sprintComment: {
            deleteMany: async () => {
              deletedOrder.push('sprintComment');
            },
            create: async () => {},
          },
          sprintSubtaskSnapshot: {
            deleteMany: async () => {
              deletedOrder.push('sprintSubtaskSnapshot');
            },
            create: async () => {},
          },
          sprintTaskSnapshot: {
            deleteMany: async () => {
              deletedOrder.push('sprintTaskSnapshot');
            },
            create: async () => {},
          },
          attachment: {
            deleteMany: async () => {
              deletedOrder.push('attachment');
            },
            create: async () => {
              createdOrder.push('attachment');
            },
          },
          subtask: {
            deleteMany: async () => {
              deletedOrder.push('subtask');
            },
            create: async () => {
              createdOrder.push('subtask');
            },
          },
          taskAssignment: {
            deleteMany: async () => {
              deletedOrder.push('taskAssignment');
            },
            create: async () => {},
          },
          taskProject: {
            deleteMany: async () => {
              deletedOrder.push('taskProject');
            },
            create: async () => {},
          },
          task: {
            deleteMany: async () => {
              deletedOrder.push('task');
            },
            create: async () => {
              createdOrder.push('task');
            },
          },
          projectSenior: {
            deleteMany: async () => {
              deletedOrder.push('projectSenior');
            },
            create: async () => {},
          },
          project: {
            deleteMany: async () => {
              deletedOrder.push('project');
            },
            create: async () => {
              createdOrder.push('project');
            },
          },
          sprint: {
            deleteMany: async () => {
              deletedOrder.push('sprint');
            },
            create: async () => {},
          },
          boardColumn: {
            deleteMany: async () => {
              deletedOrder.push('boardColumn');
            },
            create: async () => {
              createdOrder.push('boardColumn');
            },
          },
          workspace: {
            deleteMany: async () => {
              deletedOrder.push('workspace');
            },
            create: async () => {
              createdOrder.push('workspace');
            },
          },
          user: {
            deleteMany: async () => {
              deletedOrder.push('user');
            },
            create: async () => {
              createdOrder.push('user');
            },
          },
          appSettings: { upsert: async () => {} },
          notificationConfig: { upsert: async () => {} },
        };
        const res = await fn(txMock);
        return { res, deletedOrder, createdOrder };
      },
    };

    mockConfig = {
      get: (key, def) => (key === 'UPLOAD_DIRECTORY' ? './test-uploads' : def),
    };

    mockTelegramService = {
      sendDocument: async () => ({ success: true, message: 'Document sent' }),
    };
  });

  test('getStatus returns counts and readiness', async () => {
    const service = new BackupService(mockPrisma, mockConfig, mockTelegramService);
    const status = await service.getStatus();
    assert.equal(status.databaseReady, true);
    assert.equal(status.totalCounts.users, 2);
    assert.equal(status.totalCounts.workspaces, 1);
    assert.equal(status.totalCounts.tasks, 1);
    assert.equal(status.totalCounts.attachments, 1);
  });

  test('createBackupFile generates valid ZIP archive containing backup.json with BigInt serialized', async () => {
    const service = new BackupService(mockPrisma, mockConfig, mockTelegramService);
    const result = await service.createBackupFile({ format: 'zip', includeAttachments: false });

    assert.equal(result.mimeType, 'application/zip');
    assert.ok(result.filename.endsWith('.zip'));
    assert.ok(result.buffer.length > 0);

    const zip = new AdmZip(result.buffer);
    const jsonEntry = zip.getEntry('backup.json');
    assert.ok(jsonEntry, 'backup.json must exist in zip');

    const parsed = JSON.parse(jsonEntry.getData().toString('utf-8'));
    assert.equal(parsed.metadata.version, 1);
    assert.equal(parsed.metadata.counts.users, 1);
    assert.equal(parsed.metadata.counts.tasks, 1);
    assert.equal(parsed.attachments[0].sizeBytes, '1024'); // BigInt serialized to string!
  });

  test('createBackupFile generates valid JSON when format is json', async () => {
    const service = new BackupService(mockPrisma, mockConfig, mockTelegramService);
    const result = await service.createBackupFile({ format: 'json', includeAttachments: false });

    assert.equal(result.mimeType, 'application/json');
    assert.ok(result.filename.endsWith('.json'));

    const parsed = JSON.parse(result.buffer.toString('utf-8'));
    assert.equal(parsed.metadata.version, 1);
    assert.equal(parsed.users[0].username, 'admin');
  });

  test('sendToTelegram calls telegramService.sendDocument with proper metadata caption', async () => {
    let sentDoc = null;
    mockTelegramService.sendDocument = async (opts) => {
      sentDoc = opts;
      return { success: true, message: 'Document sent' };
    };

    const service = new BackupService(mockPrisma, mockConfig, mockTelegramService);
    const res = await service.sendToTelegram({ includeAttachments: false }, 'admin-id');

    assert.equal(res.success, true);
    assert.ok(sentDoc);
    assert.ok(sentDoc.caption.includes('Task Manager System Backup'));
    assert.ok(sentDoc.filename.endsWith('.zip'));
  });

  test('restoreBackup restores records in transaction from JSON file', async () => {
    const { writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');

    const tmpFile = join(tmpdir(), `test-restore-${Date.now()}.json`);
    const backupPayload = {
      metadata: { version: 1 },
      users: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          username: 'restored_user',
          displayName: 'Restored',
          color: '#123456',
          passwordHash: 'pw',
          role: 'ADMIN',
        },
      ],
      workspaces: [
        {
          id: '22222222-2222-2222-2222-222222222222',
          name: 'Restored WS',
        },
      ],
      boardColumns: [],
      sprints: [],
      projects: [],
      projectSeniors: [],
      tasks: [
        {
          id: '55555555-5555-5555-5555-555555555555',
          workspaceId: '22222222-2222-2222-2222-222222222222',
          title: 'Restored Task',
          columnId: '44444444-4444-4444-4444-444444444444',
          createdById: '11111111-1111-1111-1111-111111111111',
        },
      ],
      taskProjects: [],
      taskAssignments: [],
      subtasks: [],
      attachments: [],
      workItemComments: [],
      sprintComments: [],
      sprintTaskSnapshots: [],
      sprintSubtaskSnapshots: [],
    };
    writeFileSync(tmpFile, JSON.stringify(backupPayload), 'utf-8');

    const service = new BackupService(mockPrisma, mockConfig, mockTelegramService);
    const mockFile = {
      path: tmpFile,
      originalname: 'backup.json',
      mimetype: 'application/json',
    };

    const res = await service.restoreBackup(mockFile, 'actor-id');
    assert.equal(res.success, true);
    assert.equal(res.counts.users, 1);
    assert.equal(res.counts.workspaces, 1);
    assert.equal(res.counts.tasks, 1);
  });
});
