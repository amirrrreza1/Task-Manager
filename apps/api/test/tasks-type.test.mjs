import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TasksService } from '../dist/tasks/tasks.service.js';
import { BoardService } from '../dist/board/board.service.js';

describe('Task and Bug Types Support', () => {
  it('creates a bug with type BUG and logs type in activity event', async () => {
    let createdTaskData = null;
    let activityEventData = null;

    const mockPrisma = {
      workspace: {
        findUnique: async () => ({ id: 'ws-1', estimateMode: 'HOURS' }),
        findFirst: async () => ({ id: 'ws-1', estimateMode: 'HOURS' }),
      },
      boardColumn: {
        findMany: async () => [
          { id: 'col-backlog', workspaceId: 'ws-1', isBacklog: true, position: 0 },
        ],
        findFirst: async () => ({
          id: 'col-backlog',
          workspaceId: 'ws-1',
          isBacklog: true,
          position: 0,
        }),
        findUnique: async () => ({
          id: 'col-backlog',
          workspaceId: 'ws-1',
          isBacklog: true,
          position: 0,
        }),
      },
      task: {
        findMany: async () => [],
        aggregate: async () => ({ _max: { position: 100 } }),
        create: async ({ data }) => {
          createdTaskData = data;
          return {
            id: 'task-bug-1',
            workspaceId: data.workspaceId,
            title: data.title,
            description: data.description,
            type: data.type ?? 'TASK',
            priority: data.priority ?? 'MEDIUM',
            columnId: data.columnId,
            createdById: data.createdById,
            attachments: [],
            subtasks: [],
            assignees: [],
            projects: [],
            comments: [],
          };
        },
      },
      activityEvent: {
        create: async ({ data }) => {
          activityEventData = data;
          return data;
        },
      },
      $transaction: async (callback) => {
        return callback({
          task: {
            aggregate: async () => ({ _max: { position: 100 } }),
            create: async ({ data }) => {
              createdTaskData = data;
              return {
                id: 'task-bug-1',
                workspaceId: data.workspaceId,
                title: data.title,
                description: data.description,
                type: data.type ?? 'TASK',
                priority: data.priority ?? 'MEDIUM',
                columnId: data.columnId,
                createdById: data.createdById,
                attachments: [],
                subtasks: [],
                assignees: [],
                projects: [],
                comments: [],
              };
            },
          },
          activityEvent: {
            create: async ({ data }) => {
              activityEventData = data;
              return data;
            },
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

    const result = await service.create(
      {
        workspaceId: 'ws-1',
        title: 'Crash on login page',
        type: 'BUG',
      },
      'user-1',
    );

    assert.equal(createdTaskData.type, 'BUG');
    assert.equal(result.type, 'BUG');
    assert.equal(activityEventData.payload.type, 'BUG');
  });

  it('defaults to TASK when type is not specified upon creation', async () => {
    let createdTaskData = null;

    const mockPrisma = {
      workspace: {
        findUnique: async () => ({ id: 'ws-1', estimateMode: 'HOURS' }),
        findFirst: async () => ({ id: 'ws-1', estimateMode: 'HOURS' }),
      },
      boardColumn: {
        findMany: async () => [
          { id: 'col-backlog', workspaceId: 'ws-1', isBacklog: true, position: 0 },
        ],
        findFirst: async () => ({
          id: 'col-backlog',
          workspaceId: 'ws-1',
          isBacklog: true,
          position: 0,
        }),
        findUnique: async () => ({
          id: 'col-backlog',
          workspaceId: 'ws-1',
          isBacklog: true,
          position: 0,
        }),
      },
      $transaction: async (callback) => {
        return callback({
          task: {
            aggregate: async () => ({ _max: { position: 100 } }),
            create: async ({ data }) => {
              createdTaskData = data;
              return {
                id: 'task-std-1',
                ...data,
                type: data.type ?? 'TASK',
                attachments: [],
                subtasks: [],
                assignees: [],
                projects: [],
                comments: [],
              };
            },
          },
          activityEvent: {
            create: async ({ data }) => data,
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

    const result = await service.create(
      {
        workspaceId: 'ws-1',
        title: 'Standard task',
      },
      'user-1',
    );

    // If input.type is undefined, create does not set data.type, which lets Prisma schema default to 'TASK'
    assert.equal(createdTaskData.type, undefined);
    assert.equal(result.type, 'TASK');
  });

  it('updates task type from TASK to BUG', async () => {
    let updatedTaskData = null;

    const mockExisting = {
      id: 'task-1',
      workspaceId: 'ws-1',
      title: 'Something odd',
      type: 'TASK',
      priority: 'MEDIUM',
      columnId: 'col-1',
      sprintId: null,
      assignees: [],
      projects: [],
    };

    const mockPrisma = {
      task: {
        findUnique: async () => mockExisting,
      },
      $transaction: async (callback) => {
        return callback({
          task: {
            update: async ({ data }) => {
              updatedTaskData = data;
              return {
                ...mockExisting,
                ...data,
                attachments: [],
                subtasks: [],
                assignees: [],
                projects: [],
                comments: [],
              };
            },
          },
          activityEvent: {
            create: async ({ data }) => data,
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

    const result = await service.update('task-1', { type: 'BUG' }, 'user-1');
    assert.equal(updatedTaskData.type, 'BUG');
    assert.equal(result.type, 'BUG');
  });

  it('filters board tasks and subtasks by type in BoardService', async () => {
    let passedTaskWhere = null;
    let passedSubtaskWhere = null;

    const mockPrisma = {
      workspace: {
        findUnique: async () => ({ id: 'ws-1' }),
        findFirst: async () => ({ id: 'ws-1' }),
        findUniqueOrThrow: async () => ({ id: 'ws-1' }),
      },
      $transaction: async () => {
        return [
          [
            {
              id: 'col-1',
              name: 'Todo',
              color: '#3b82f6',
              position: 0,
              tasks: [],
            },
          ],
          [],
          { id: 'ws-1' },
        ];
      },
      boardColumn: {
        findMany: async ({ include }) => {
          passedTaskWhere = include.tasks.where;
          return [
            {
              id: 'col-1',
              name: 'Todo',
              color: '#3b82f6',
              position: 0,
              tasks: [],
            },
          ];
        },
      },
      subtask: {
        findMany: async ({ where }) => {
          passedSubtaskWhere = where;
          return [];
        },
      },
    };

    const boardService = new BoardService(mockPrisma);
    await boardService.read({ workspaceId: 'ws-1', type: 'BUG' });

    assert.equal(passedTaskWhere.type, 'BUG');
    assert.equal(passedSubtaskWhere.task.type, 'BUG');
  });
});
