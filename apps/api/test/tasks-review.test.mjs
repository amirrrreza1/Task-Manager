import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TasksService } from '../dist/tasks/tasks.service.js';

describe('TasksService Review State and Project Seniors Notification', () => {
  it('dispatches review notification with sendTelegram: true to project seniors when task enters review column', async () => {
    const dispatchedNotifications = [];
    const events = [];

    const mockTask = {
      id: 'task-1',
      workspaceId: 'ws-1',
      title: 'Implement Payment Gateway',
      columnId: 'col-todo',
      createdById: 'user-creator',
      updatedAt: new Date('2026-08-24T10:00:00Z'),
      assignees: [{ userId: 'user-assignee' }],
      projects: [
        {
          project: {
            id: 'proj-1',
            name: 'Billing System',
            seniors: [{ userId: 'user-senior-1' }, { userId: 'user-senior-2' }],
          },
        },
      ],
    };

    const reviewColumn = {
      id: 'col-review',
      workspaceId: 'ws-1',
      name: 'In Review',
      isReview: true,
      isDone: false,
    };

    const transaction = {
      task: {
        findMany: async () => [],
        update: async ({ data }) => ({
          ...mockTask,
          columnId: data.columnId,
          position: data.position,
          assignees: [{ user: { id: 'user-assignee', displayName: 'Assignee User' } }],
          subtasks: [],
          _count: { attachments: 0 },
        }),
      },
      subtask: {
        updateMany: async () => ({ count: 0 }),
      },
      activityEvent: {
        create: async ({ data }) => {
          events.push(data);
          return data;
        },
      },
    };

    const mockPrisma = {
      task: {
        findUnique: async () => mockTask,
      },
      boardColumn: {
        findUnique: async ({ where }) => (where.id === 'col-review' ? reviewColumn : null),
      },
      $transaction: async (callback) => callback(transaction),
    };

    const mockStorage = {
      delete: async () => {},
    };

    const mockNotifications = {
      dispatch: async (dto) => {
        dispatchedNotifications.push(dto);
      },
    };

    const service = new TasksService(mockPrisma, mockStorage, mockNotifications);

    const result = await service.move(
      'task-1',
      {
        columnId: 'col-review',
        expectedUpdatedAt: '2026-08-24T10:00:00.000Z',
      },
      'user-assignee',
    );

    assert.equal(result.columnId, 'col-review');
    assert.equal(dispatchedNotifications.length, 1);

    const notif = dispatchedNotifications[0];
    assert.equal(notif.type, 'task.review_requested');
    assert.equal(notif.sendTelegram, true);
    assert.equal(notif.sendEmail, true);
    assert.match(notif.title, /Task In Review/);
    assert.match(notif.message, /gone to review state/);

    // Verify recipients include task assignees, task creator, and project seniors
    assert.ok(notif.recipientUserIds.includes('user-assignee'));
    assert.ok(notif.recipientUserIds.includes('user-creator'));
    assert.ok(notif.recipientUserIds.includes('user-senior-1'));
    assert.ok(notif.recipientUserIds.includes('user-senior-2'));
  });

  it('notifies seniors from multiple assigned projects when task enters review column', async () => {
    const dispatchedNotifications = [];

    const mockTask = {
      id: 'task-multi',
      workspaceId: 'ws-1',
      title: 'Full Stack Integration',
      columnId: 'col-todo',
      createdById: 'user-creator',
      updatedAt: new Date('2026-08-24T10:00:00Z'),
      assignees: [{ userId: 'user-assignee' }],
      projects: [
        {
          project: {
            id: 'proj-1',
            name: 'Frontend Web',
            seniors: [{ userId: 'user-senior-web' }],
          },
        },
        {
          project: {
            id: 'proj-2',
            name: 'Backend API',
            seniors: [{ userId: 'user-senior-api' }],
          },
        },
      ],
    };

    const reviewColumn = {
      id: 'col-review',
      workspaceId: 'ws-1',
      name: 'In Review',
      isReview: true,
      isDone: false,
    };

    const transaction = {
      task: {
        findMany: async () => [],
        update: async ({ data }) => ({
          ...mockTask,
          columnId: data.columnId,
          position: data.position,
          assignees: [],
          subtasks: [],
          _count: { attachments: 0 },
        }),
      },
      subtask: {
        updateMany: async () => ({ count: 0 }),
      },
      activityEvent: {
        create: async () => {},
      },
    };

    const mockPrisma = {
      task: {
        findUnique: async () => mockTask,
      },
      boardColumn: {
        findUnique: async ({ where }) => (where.id === 'col-review' ? reviewColumn : null),
      },
      $transaction: async (callback) => callback(transaction),
    };

    const service = new TasksService(
      mockPrisma,
      {},
      {
        dispatch: async (dto) => {
          dispatchedNotifications.push(dto);
        },
      },
    );

    await service.move(
      'task-multi',
      {
        columnId: 'col-review',
        expectedUpdatedAt: '2026-08-24T10:00:00.000Z',
      },
      'user-assignee',
    );

    assert.equal(dispatchedNotifications.length, 1);
    const notif = dispatchedNotifications[0];
    assert.ok(notif.recipientUserIds.includes('user-senior-web'));
    assert.ok(notif.recipientUserIds.includes('user-senior-api'));
    assert.ok(notif.lines.some((l) => l.includes('Frontend Web, Backend API')));
  });

  it('recognizes column with name "Review" as review state even if isReview is false in db', async () => {
    const dispatchedNotifications = [];

    const mockTask = {
      id: 'task-2',
      workspaceId: 'ws-1',
      title: 'Fix Navigation Bug',
      columnId: 'col-progress',
      createdById: 'user-creator',
      updatedAt: new Date('2026-08-24T10:00:00Z'),
      assignees: [],
      projects: [
        {
          project: {
            id: 'proj-1',
            name: 'Mobile App',
            seniors: [{ userId: 'user-senior-lead' }],
          },
        },
      ],
    };

    const reviewColumn = {
      id: 'col-review-name',
      workspaceId: 'ws-1',
      name: 'Review',
      isReview: false,
      isDone: false,
    };

    const transaction = {
      task: {
        findMany: async () => [],
        update: async ({ data }) => ({
          ...mockTask,
          columnId: data.columnId,
          position: data.position,
          assignees: [],
          subtasks: [],
          _count: { attachments: 0 },
        }),
      },
      subtask: {
        updateMany: async () => ({ count: 0 }),
      },
      activityEvent: {
        create: async () => {},
      },
    };

    const mockPrisma = {
      task: {
        findUnique: async () => mockTask,
      },
      boardColumn: {
        findUnique: async () => reviewColumn,
      },
      $transaction: async (callback) => callback(transaction),
    };

    const mockNotifications = {
      dispatch: async (dto) => {
        dispatchedNotifications.push(dto);
      },
    };

    const service = new TasksService(mockPrisma, {}, mockNotifications);

    await service.move(
      'task-2',
      {
        columnId: 'col-review-name',
        expectedUpdatedAt: '2026-08-24T10:00:00.000Z',
      },
      'user-creator',
    );

    assert.equal(dispatchedNotifications.length, 1);
    const notif = dispatchedNotifications[0];
    assert.equal(notif.type, 'task.review_requested');
    assert.equal(notif.sendTelegram, true);
    assert.ok(notif.recipientUserIds.includes('user-senior-lead'));
  });
});
