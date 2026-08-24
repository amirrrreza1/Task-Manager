import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AttachmentsService } from '../dist/attachments/attachments.service.js';

describe('AttachmentsService Comments', () => {
  it('uploads an attachment to a task with a comment and dispatches notification with comment', async () => {
    const dispatched = [];
    const events = [];

    const mockTask = {
      id: 'task-1',
      title: 'Design Logo',
      createdById: 'user-creator',
      assignees: [{ userId: 'user-1' }],
    };

    const mockStored = {
      storageKey: 'key-123',
      checksum: 'sha256-abc',
    };

    const mockAttachment = {
      id: 'att-1',
      ownerType: 'TASK',
      taskId: 'task-1',
      subtaskId: null,
      storageKey: 'key-123',
      originalName: 'spec.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024n,
      checksum: 'sha256-abc',
      comment: 'Initial design document for review',
      uploadedById: 'user-creator',
      createdAt: new Date(),
      uploadedBy: {
        id: 'user-creator',
        displayName: 'Creator',
        color: '#ff0000',
        hasAvatar: false,
        isActive: true,
      },
    };

    const mockPrisma = {
      task: {
        findUnique: async () => mockTask,
      },
      attachment: {
        findUnique: async () => mockAttachment,
      },
      $transaction: async (cb) => {
        const tx = {
          attachment: {
            create: async ({ data }) => {
              assert.equal(data.comment, 'Initial design document for review');
              return { ...mockAttachment, comment: data.comment };
            },
          },
          activityEvent: {
            create: async ({ data }) => {
              events.push(data);
              return data;
            },
          },
        };
        return cb(tx);
      },
    };

    const mockStorage = {
      put: async () => mockStored,
      delete: async () => {},
    };

    const mockNotifications = {
      dispatch: async (dto) => {
        dispatched.push(dto);
      },
    };

    const mockConfig = {
      get: () => 25,
    };

    const service = new AttachmentsService(mockPrisma, mockStorage, mockNotifications, mockConfig);

    const uploaded = await service.uploadToTask(
      'task-1',
      {
        path: 'dummy-path',
        originalname: 'spec.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      },
      'user-creator',
      'Initial design document for review',
    );

    assert.equal(uploaded.id, 'att-1');
    assert.equal(uploaded.comment, 'Initial design document for review');
    assert.equal(uploaded.sizeBytes, 1024);
    assert.equal(events.length, 1);
    assert.equal(events[0].payload.comment, 'Initial design document for review');
  });

  it('updates an attachment comment via update method and records activity event', async () => {
    const events = [];
    const mockAttachment = {
      id: 'att-1',
      ownerType: 'SUBTASK',
      taskId: null,
      subtaskId: 'subtask-1',
      storageKey: 'key-123',
      originalName: 'screenshot.png',
      mimeType: 'image/png',
      sizeBytes: 2048n,
      checksum: 'sha256-xyz',
      comment: 'Old comment',
      uploadedById: 'user-1',
      createdAt: new Date(),
      uploadedBy: {
        id: 'user-1',
        displayName: 'Alice',
        color: '#00ff00',
        hasAvatar: false,
        isActive: true,
      },
    };

    const mockPrisma = {
      attachment: {
        findUnique: async () => mockAttachment,
      },
      $transaction: async (cb) => {
        const tx = {
          attachment: {
            update: async ({ data }) => {
              return { ...mockAttachment, comment: data.comment };
            },
          },
          activityEvent: {
            create: async ({ data }) => {
              events.push(data);
              return data;
            },
          },
        };
        return cb(tx);
      },
    };

    const service = new AttachmentsService(mockPrisma, {}, {}, { get: () => 25 });

    const updated = await service.update(
      'att-1',
      { comment: 'Updated explanation of the UI bug' },
      'user-1',
    );

    assert.equal(updated.comment, 'Updated explanation of the UI bug');
    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, 'attachment.updated');
    assert.equal(events[0].payload.comment, 'Updated explanation of the UI bug');
  });
});
