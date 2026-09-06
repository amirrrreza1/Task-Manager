import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException } from '@nestjs/common';
import { TasksService } from '../dist/tasks/tasks.service.js';

describe('TasksService Concurrent Move Handling', () => {
  it('allows move without ConflictException when destination column matches current column', async () => {
    const events = [];
    const mockTask = {
      id: 'task-1',
      workspaceId: 'ws-1',
      title: 'Concurrent Move Task',
      columnId: 'col-progress',
      createdById: 'user-creator',
      updatedAt: new Date('2026-08-24T12:00:00Z'),
      assignees: [{ userId: 'user-1' }],
      projects: [],
    };

    const targetColumn = {
      id: 'col-progress',
      workspaceId: 'ws-1',
      name: 'In Progress',
      isReview: false,
      isDone: false,
    };

    const transaction = {
      task: {
        findUniqueOrThrow: async () => ({
          id: 'task-1',
          columnId: 'col-progress',
          position: 1024,
        }),
        findMany: async () => [],
        update: async ({ data }) => ({
          ...mockTask,
          columnId: data.columnId,
          position: data.position,
          assignees: [{ user: { id: 'user-1', displayName: 'User 1' } }],
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
        findUnique: async ({ where }) => (where.id === 'col-progress' ? targetColumn : null),
      },
      $transaction: async (callback) => callback(transaction),
    };

    const service = new TasksService(mockPrisma, {}, { dispatch: async () => {} });

    // Stale expectedUpdatedAt from before another user moved it to col-progress
    const result = await service.move(
      'task-1',
      {
        columnId: 'col-progress',
        expectedUpdatedAt: '2026-08-24T10:00:00.000Z', // Stale timestamp
      },
      'user-2',
    );

    assert.equal(result.columnId, 'col-progress');
  });

  it('still throws ConflictException when moving to a DIFFERENT column with stale expectedUpdatedAt', async () => {
    const mockTask = {
      id: 'task-1',
      workspaceId: 'ws-1',
      title: 'Conflict Task',
      columnId: 'col-todo',
      createdById: 'user-creator',
      updatedAt: new Date('2026-08-24T12:00:00Z'),
      assignees: [],
      projects: [],
    };

    const doneColumn = {
      id: 'col-done',
      workspaceId: 'ws-1',
      name: 'Done',
      isReview: false,
      isDone: true,
    };

    const mockPrisma = {
      task: {
        findUnique: async () => mockTask,
      },
      boardColumn: {
        findUnique: async ({ where }) => (where.id === 'col-done' ? doneColumn : null),
      },
      $transaction: async (callback) => callback({}),
    };

    const service = new TasksService(mockPrisma, {}, { dispatch: async () => {} });

    await assert.rejects(
      async () => {
        await service.move(
          'task-1',
          {
            columnId: 'col-done',
            expectedUpdatedAt: '2026-08-24T10:00:00.000Z', // Stale timestamp
          },
          'user-2',
        );
      },
      (error) => error instanceof ConflictException,
    );
  });

  it('moveSubtask returns early without ConflictException when subtask is already in the target column', async () => {
    const mockSubtask = {
      id: 'subtask-1',
      taskId: 'task-1',
      columnId: 'col-progress',
      title: 'Subtask 1',
      updatedAt: new Date('2026-08-24T12:00:00Z'),
      task: { workspaceId: 'ws-1' },
      assignee: null,
      attachments: [],
    };

    const progressColumn = {
      id: 'col-progress',
      workspaceId: 'ws-1',
      name: 'In Progress',
    };

    const mockPrisma = {
      subtask: {
        findFirst: async () => mockSubtask,
        findUniqueOrThrow: async () => mockSubtask,
      },
      boardColumn: {
        findUnique: async ({ where }) => (where.id === 'col-progress' ? progressColumn : null),
      },
    };

    const service = new TasksService(mockPrisma, {}, { dispatch: async () => {} });

    const result = await service.moveSubtask(
      'task-1',
      'subtask-1',
      {
        columnId: 'col-progress',
        expectedUpdatedAt: '2026-08-24T10:00:00.000Z', // Stale timestamp
      },
      'user-1',
    );

    assert.equal(result.id, 'subtask-1');
    assert.equal(result.columnId, 'col-progress');
  });
});
