import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AttachmentsService } from '../dist/attachments/attachments.service.js';

describe('AttachmentsService', () => {
  it('uploads a task attachment without storing a comment on the file', async () => {
    const events = [];
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
        findUnique: async () => ({
          id: 'task-1',
          title: 'Design Logo',
          createdById: 'user-creator',
          assignees: [],
        }),
      },
      attachment: { findUnique: async () => mockAttachment },
      $transaction: async (callback) =>
        callback({
          attachment: {
            create: async ({ data }) => {
              assert.equal('comment' in data, false);
              return mockAttachment;
            },
          },
          activityEvent: {
            create: async ({ data }) => {
              events.push(data);
              return data;
            },
          },
        }),
    };
    const service = new AttachmentsService(
      mockPrisma,
      {
        put: async () => ({ storageKey: 'key-123', checksum: 'sha256-abc' }),
        delete: async () => {},
      },
      { dispatch: async () => {} },
      { get: () => 25 },
    );
    const uploaded = await service.uploadToTask(
      'task-1',
      { path: 'dummy-path', originalname: 'spec.pdf', mimetype: 'application/pdf', size: 1024 },
      'user-creator',
    );
    assert.equal(uploaded.id, 'att-1');
    assert.equal(uploaded.sizeBytes, 1024);
    assert.equal(events[0].eventType, 'attachment.created');
  });
});
