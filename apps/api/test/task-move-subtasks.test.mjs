import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TasksService } from '../dist/tasks/tasks.service.js';

describe('TasksService Task Move Subtasks Handling', () => {
  it('moves subtasks in the task column to destination column, while leaving subtasks in other columns intact', async () => {
    const updatedAt = new Date('2026-08-24T12:00:00Z');
    const mockTask = {
      id: 'task-1',
      workspaceId: 'ws-1',
      title: 'Task with Subtasks',
      columnId: 'col-todo',
      createdById: 'user-creator',
      updatedAt,
      assignees: [],
      projects: [],
    };

    const targetColumn = {
      id: 'col-done',
      workspaceId: 'ws-1',
      name: 'Done',
      isReview: false,
      isDone: true,
    };

    const subtaskUpdates = [];

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
        updateMany: async ({ where, data }) => {
          subtaskUpdates.push({ where, data });
          return { count: 1 };
        },
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
        findUnique: async ({ where }) => (where.id === 'col-done' ? targetColumn : null),
      },
      $transaction: async (callback) => callback(transaction),
    };

    const service = new TasksService(mockPrisma, {}, { dispatch: async () => {} });

    await service.move(
      'task-1',
      {
        columnId: 'col-done',
        expectedUpdatedAt: updatedAt.toISOString(),
      },
      'user-1',
    );

    // Verify subtask.updateMany was called only for subtasks with taskId AND matching fromColumnId
    assert.equal(subtaskUpdates.length, 1);
    assert.deepEqual(subtaskUpdates[0], {
      where: { taskId: 'task-1', columnId: 'col-todo' },
      data: { columnId: 'col-done' },
    });
  });
});
