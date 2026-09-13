import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TasksService } from '../dist/tasks/tasks.service.js';

describe('TasksService Sprint Reassignment Rules', () => {
  const columns = [
    { id: 'col-backlog', workspaceId: 'ws-1', isBacklog: true, isTodo: false, isDone: false, position: 0 },
    { id: 'col-todo', workspaceId: 'ws-1', isBacklog: false, isTodo: true, isDone: false, position: 1 },
    { id: 'col-in-progress', workspaceId: 'ws-1', isBacklog: false, isTodo: false, isDone: false, position: 2 },
    { id: 'col-done', workspaceId: 'ws-1', isBacklog: false, isTodo: false, isDone: true, position: 3 },
  ];

  const sprints = {
    'sprint-active': { id: 'sprint-active', workspaceId: 'ws-1', status: 'ACTIVE' },
    'sprint-planned': { id: 'sprint-planned', workspaceId: 'ws-1', status: 'PLANNED' },
    'sprint-completed': { id: 'sprint-completed', workspaceId: 'ws-1', status: 'COMPLETED' },
  };

  function createMockPrisma(taskOverrides = {}) {
    const existingTask = {
      id: 'task-1',
      workspaceId: 'ws-1',
      title: 'Test Task',
      columnId: 'col-in-progress',
      sprintId: 'sprint-active',
      assignees: [],
      projects: [],
      ...taskOverrides,
    };

    let updatedTaskData = null;
    let updatedSubtaskColumnData = null;
    let updatedSubtaskSprintData = null;

    const mockPrisma = {
      task: {
        findUnique: async ({ where }) => (where.id === existingTask.id ? existingTask : null),
      },
      boardColumn: {
        findMany: async () => columns,
        findUnique: async ({ where }) => columns.find((c) => c.id === where.id) ?? null,
      },
      sprint: {
        findUnique: async ({ where }) => sprints[where.id] ?? null,
      },
      user: {
        count: async () => 0,
      },
      taskProject: {
        count: async () => 0,
        findMany: async () => [],
      },
      $transaction: async (callback) => {
        return callback({
          taskAssignment: {
            deleteMany: async () => {},
            createMany: async () => {},
          },
          taskProject: {
            deleteMany: async () => {},
            createMany: async () => {},
          },
          task: {
            aggregate: async () => ({ _max: { position: 100 } }),
            update: async ({ data }) => {
              updatedTaskData = data;
              return {
                ...existingTask,
                ...data,
                attachments: [],
                subtasks: [],
                assignees: [],
                projects: [],
                comments: [],
              };
            },
          },
          subtask: {
            updateMany: async (args) => {
              if (args.data.columnId) {
                updatedSubtaskColumnData = args;
              }
              if (args.data.sprintId !== undefined) {
                updatedSubtaskSprintData = args;
              }
            },
          },
          activityEvent: {
            create: async ({ data }) => data,
          },
        });
      },
    };

    return {
      mockPrisma,
      getUpdatedTask: () => updatedTaskData,
      getUpdatedSubtaskColumn: () => updatedSubtaskColumnData,
      getUpdatedSubtaskSprint: () => updatedSubtaskSprintData,
    };
  }

  function createService(mockPrisma) {
    return new TasksService(
      mockPrisma,
      { delete: async () => {} },
      { dispatch: async () => {} },
      { emitBoardUpdate: () => {} },
    );
  }

  it('rejects changing sprint when task is in a completed sprint to null', async () => {
    const { mockPrisma } = createMockPrisma({ sprintId: 'sprint-completed' });
    const service = createService(mockPrisma);

    await assert.rejects(
      () => service.update('task-1', { sprintId: null }, 'user-1'),
      /Tasks in a completed sprint cannot be reassigned/i,
    );
  });

  it('rejects changing sprint when task is in a completed sprint to another sprint', async () => {
    const { mockPrisma } = createMockPrisma({ sprintId: 'sprint-completed' });
    const service = createService(mockPrisma);

    await assert.rejects(
      () => service.update('task-1', { sprintId: 'sprint-planned' }, 'user-1'),
      /Tasks in a completed sprint cannot be reassigned/i,
    );
  });

  it('allows moving task in active sprint to backlog (sprintId: null) and moves column to backlog', async () => {
    const { mockPrisma, getUpdatedTask, getUpdatedSubtaskColumn, getUpdatedSubtaskSprint } =
      createMockPrisma({ sprintId: 'sprint-active', columnId: 'col-in-progress' });
    const service = createService(mockPrisma);

    const result = await service.update('task-1', { sprintId: null }, 'user-1');

    assert.equal(result.sprintId, null);
    assert.equal(result.columnId, 'col-backlog');
    assert.equal(getUpdatedTask().sprintId, null);
    assert.equal(getUpdatedTask().columnId, 'col-backlog');
    assert.equal(getUpdatedTask().position, 1124); // max (100) + 1024

    // Verify subtasks in the task's column were moved to backlog
    assert.deepEqual(getUpdatedSubtaskColumn(), {
      where: { taskId: 'task-1', columnId: 'col-in-progress' },
      data: { columnId: 'col-backlog' },
    });

    // Verify subtasks sprintId was cleared to null
    assert.deepEqual(getUpdatedSubtaskSprint(), {
      where: { taskId: 'task-1' },
      data: { sprintId: null },
    });
  });

  it('allows moving task in active sprint to another planned sprint and moves column to To Do', async () => {
    const { mockPrisma, getUpdatedTask, getUpdatedSubtaskColumn, getUpdatedSubtaskSprint } =
      createMockPrisma({ sprintId: 'sprint-active', columnId: 'col-in-progress' });
    const service = createService(mockPrisma);

    const result = await service.update('task-1', { sprintId: 'sprint-planned' }, 'user-1');

    assert.equal(result.sprintId, 'sprint-planned');
    assert.equal(result.columnId, 'col-todo');
    assert.equal(getUpdatedTask().sprintId, 'sprint-planned');
    assert.equal(getUpdatedTask().columnId, 'col-todo');
    assert.equal(getUpdatedTask().position, 1124);

    // Verify subtasks in the task's column were moved to To Do
    assert.deepEqual(getUpdatedSubtaskColumn(), {
      where: { taskId: 'task-1', columnId: 'col-in-progress' },
      data: { columnId: 'col-todo' },
    });

    // Verify subtasks sprintId was updated
    assert.deepEqual(getUpdatedSubtaskSprint(), {
      where: { taskId: 'task-1' },
      data: { sprintId: 'sprint-planned' },
    });
  });

  it('rejects moving task in active sprint into a completed sprint', async () => {
    const { mockPrisma } = createMockPrisma({ sprintId: 'sprint-active' });
    const service = createService(mockPrisma);

    await assert.rejects(
      () => service.update('task-1', { sprintId: 'sprint-completed' }, 'user-1'),
      /Tasks cannot be added to a completed sprint/i,
    );
  });

  it('allows updating other fields without changing sprint for tasks in completed sprint', async () => {
    const { mockPrisma, getUpdatedTask } = createMockPrisma({
      sprintId: 'sprint-completed',
      title: 'Old Title',
    });
    const service = createService(mockPrisma);

    const result = await service.update(
      'task-1',
      { title: 'New Title', sprintId: 'sprint-completed' },
      'user-1',
    );

    assert.equal(result.title, 'New Title');
    assert.equal(getUpdatedTask().title, 'New Title');
    assert.equal(getUpdatedTask().columnId, undefined); // column unchanged
  });
});
