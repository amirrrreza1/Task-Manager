import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TasksService } from '../dist/tasks/tasks.service.js';

describe('TasksService Task Subtask Estimate Synchronization', () => {
  it('updates task estimate to the sum of subtask estimates when creating a subtask', async () => {
    let taskEstimateUpdatedWith = null;

    const mockTask = {
      id: 'task-1',
      workspaceId: 'ws-1',
      title: 'Task 1',
      columnId: 'col-1',
      createdById: 'user-1',
      column: { isDone: false, name: 'To Do' },
    };

    const existingSubtasks = [
      { id: 'sub-1', taskId: 'task-1', estimateValue: 2.5, estimateUnit: 'HOURS' },
      { id: 'sub-2', taskId: 'task-1', estimateValue: 1.5, estimateUnit: 'HOURS' },
    ];

    const mockPrisma = {
      task: {
        findUnique: async () => mockTask,
      },
      user: {
        count: async () => 1,
      },
      workspace: {
        findUnique: async () => ({ id: 'ws-1', estimateMode: 'TIME' }),
      },
      $transaction: async (callback) => {
        return callback({
          subtask: {
            aggregate: async () => ({ _max: { position: 0 } }),
            create: async ({ data }) => ({
              id: 'sub-2',
              ...data,
              assignee: null,
              attachments: [],
            }),
            findMany: async () => existingSubtasks,
          },
          task: {
            update: async ({ data }) => {
              taskEstimateUpdatedWith = data;
              return { ...mockTask, ...data };
            },
          },
          activityEvent: {
            create: async () => {},
          },
        });
      },
    };

    const service = new TasksService(
      mockPrisma,
      {},
      { dispatch: async () => {} },
      { emitBoardUpdate: () => {} },
    );

    await service.createSubtask(
      'task-1',
      {
        title: 'New Subtask',
        estimate: { value: 1.5, unit: 'HOURS' },
      },
      'user-1',
    );

    assert.deepEqual(taskEstimateUpdatedWith, {
      estimateValue: 4,
      estimateUnit: 'HOURS',
    });
  });

  it('updates task estimate when a subtask estimate is updated', async () => {
    let taskEstimateUpdatedWith = null;

    const mockSubtask = {
      id: 'sub-1',
      taskId: 'task-1',
      columnId: 'col-1',
      isCompleted: false,
      assigneeId: null,
      task: { workspaceId: 'ws-1' },
    };

    const mockPrisma = {
      subtask: {
        findFirst: async () => mockSubtask,
      },
      workspace: {
        findUnique: async () => ({ id: 'ws-1', estimateMode: 'TIME' }),
      },
      $transaction: async (callback) => {
        return callback({
          subtask: {
            update: async ({ data }) => ({
              ...mockSubtask,
              ...data,
              assignee: null,
              attachments: [],
            }),
            findMany: async () => [
              { id: 'sub-1', taskId: 'task-1', estimateValue: 3.25, estimateUnit: 'HOURS' },
              { id: 'sub-2', taskId: 'task-1', estimateValue: 1.75, estimateUnit: 'HOURS' },
            ],
          },
          task: {
            update: async ({ data }) => {
              taskEstimateUpdatedWith = data;
              return data;
            },
          },
          activityEvent: {
            create: async () => {},
          },
        });
      },
    };

    const service = new TasksService(
      mockPrisma,
      {},
      { dispatch: async () => {} },
      { emitBoardUpdate: () => {} },
    );

    await service.updateSubtask(
      'task-1',
      'sub-1',
      {
        estimate: { value: 3.25, unit: 'HOURS' },
      },
      'user-1',
    );

    assert.deepEqual(taskEstimateUpdatedWith, {
      estimateValue: 5,
      estimateUnit: 'HOURS',
    });
  });

  it('recalculates task estimate when a subtask is deleted', async () => {
    let taskEstimateUpdatedWith = null;

    const mockSubtask = {
      id: 'sub-1',
      taskId: 'task-1',
      attachments: [],
      task: { workspaceId: 'ws-1' },
    };

    const mockPrisma = {
      subtask: {
        findFirst: async () => mockSubtask,
      },
      $transaction: async (callback) => {
        return callback({
          subtask: {
            delete: async () => {},
            findMany: async () => [
              { id: 'sub-2', taskId: 'task-1', estimateValue: 2, estimateUnit: 'HOURS' },
            ],
          },
          task: {
            update: async ({ data }) => {
              taskEstimateUpdatedWith = data;
              return data;
            },
          },
          activityEvent: {
            create: async () => {},
          },
        });
      },
    };

    const service = new TasksService(
      mockPrisma,
      { delete: async () => {} },
      { dispatch: async () => {} },
      { emitBoardUpdate: () => {} },
    );

    await service.removeSubtask('task-1', 'sub-1', 'user-1');

    assert.deepEqual(taskEstimateUpdatedWith, {
      estimateValue: 2,
      estimateUnit: 'HOURS',
    });
  });

  it('preserves task estimate when the last subtask is deleted', async () => {
    let taskEstimateUpdated = false;

    const mockSubtask = {
      id: 'sub-1',
      taskId: 'task-1',
      attachments: [],
      task: { workspaceId: 'ws-1' },
    };

    const mockPrisma = {
      subtask: {
        findFirst: async () => mockSubtask,
      },
      $transaction: async (callback) => {
        return callback({
          subtask: {
            delete: async () => {},
            findMany: async () => [], // No subtasks left
          },
          task: {
            update: async () => {
              taskEstimateUpdated = true;
            },
          },
          activityEvent: {
            create: async () => {},
          },
        });
      },
    };

    const service = new TasksService(
      mockPrisma,
      { delete: async () => {} },
      { dispatch: async () => {} },
      { emitBoardUpdate: () => {} },
    );

    await service.removeSubtask('task-1', 'sub-1', 'user-1');

    assert.equal(taskEstimateUpdated, false);
  });

  it('rejects direct estimate update when the task has subtasks', async () => {
    const mockTask = {
      id: 'task-1',
      workspaceId: 'ws-1',
      title: 'Task with subtasks',
      assignees: [],
    };

    const mockPrisma = {
      task: {
        findUnique: async () => mockTask,
      },
      workspace: {
        findUnique: async () => ({ id: 'ws-1', estimateMode: 'TIME' }),
      },
      subtask: {
        count: async () => 2, // Task has 2 subtasks
      },
    };

    const service = new TasksService(
      mockPrisma,
      {},
      { dispatch: async () => {} },
      { emitBoardUpdate: () => {} },
    );

    await assert.rejects(
      async () => {
        await service.update(
          'task-1',
          { estimate: { value: 10, unit: 'HOURS' } },
          'user-1',
        );
      },
      {
        name: 'BadRequestException',
        message: 'Task estimate cannot be changed directly when it has subtasks.',
      },
    );
  });

  it('allows direct estimate update when the task has no subtasks', async () => {
    const mockTask = {
      id: 'task-1',
      workspaceId: 'ws-1',
      title: 'Task without subtasks',
      columnId: 'col-1',
      sprintId: null,
      assignees: [],
      projects: [],
      updatedAt: new Date(),
    };

    let updatedEstimate = null;

    const mockPrisma = {
      task: {
        findUnique: async () => mockTask,
      },
      workspace: {
        findUnique: async () => ({ id: 'ws-1', estimateMode: 'TIME' }),
      },
      subtask: {
        count: async () => 0, // No subtasks
      },
      $transaction: async (callback) => {
        return callback({
          task: {
            update: async ({ data }) => {
              updatedEstimate = {
                estimateValue: data.estimateValue,
                estimateUnit: data.estimateUnit,
              };
              return {
                ...mockTask,
                ...data,
                subtasks: [],
                attachments: [],
                assignees: [],
                projects: [],
                comments: [],
              };
            },
          },
          activityEvent: {
            create: async () => {},
          },
        });
      },
    };

    const service = new TasksService(
      mockPrisma,
      {},
      { dispatch: async () => {} },
      { emitBoardUpdate: () => {} },
    );

    const result = await service.update(
      'task-1',
      { estimate: { value: 6, unit: 'HOURS' } },
      'user-1',
    );

    assert.deepEqual(updatedEstimate, {
      estimateValue: 6,
      estimateUnit: 'HOURS',
    });
    assert.equal(result.estimateValue, 6);
  });
});
