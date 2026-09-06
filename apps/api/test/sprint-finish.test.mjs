import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SprintsService } from '../dist/sprints/sprints.service.js';

describe('SprintsService sprint resolution', () => {
  it('moves unfinished work to the next planned sprint with the same status preserved', async () => {
    const taskSnapshots = [];
    const subtaskSnapshots = [];
    const events = [];
    const subtaskUpdates = [];
    const taskUpdates = [];
    const sprint = {
      id: 'sprint-1',
      name: 'Sprint 1',
      workspaceId: 'ws-1',
      status: 'ACTIVE',
      tasks: [
        {
          id: 'task-1',
          title: 'Parent task',
          estimateValue: 5,
          estimateUnit: 'POINTS',
          columnId: 'col-done',
          column: { name: 'Done', isDone: true },
          subtasks: [
            {
              id: 'subtask-1',
              taskId: 'task-1',
              title: 'Unfinished child',
              estimateValue: 2,
              estimateUnit: 'POINTS',
              isCompleted: false,
              columnId: 'col-todo',
            },
            {
              id: 'subtask-done',
              taskId: 'task-1',
              title: 'Finished child',
              estimateValue: null,
              estimateUnit: null,
              isCompleted: true,
              columnId: 'col-done',
            },
          ],
        },
        {
          id: 'task-3',
          title: 'Unfinished parent task',
          estimateValue: null,
          estimateUnit: null,
          columnId: 'col-in-progress',
          column: { name: 'In progress', isDone: false },
          subtasks: [
            {
              id: 'subtask-3',
              taskId: 'task-3',
              title: 'Unfinished child of unfinished task',
              estimateValue: null,
              estimateUnit: null,
              isCompleted: false,
              columnId: 'col-in-progress',
            },
            {
              id: 'subtask-done-3',
              taskId: 'task-3',
              title: 'Finished child of unfinished task',
              estimateValue: null,
              estimateUnit: null,
              isCompleted: true,
              columnId: 'col-done',
            },
          ],
        },
      ],
      subtasks: [
        {
          id: 'subtask-2',
          taskId: 'task-2',
          title: 'Unfinished standalone subtask',
          estimateValue: null,
          estimateUnit: null,
          isCompleted: false,
          columnId: 'col-todo',
          task: { title: 'Another task' },
        },
      ],
    };
    const plannedSprint = {
      id: 'sprint-2',
      name: 'Sprint 2',
      workspaceId: 'ws-1',
      status: 'PLANNED',
    };
    const transaction = {
      sprint: {
        findUnique: async ({ where }) => (where.id === sprint.id ? sprint : null),
        findFirst: async () => plannedSprint,
        update: async ({ data }) => ({ ...sprint, ...data }),
      },
      sprintTaskSnapshot: {
        createMany: async ({ data }) => taskSnapshots.push(...data),
      },
      sprintSubtaskSnapshot: {
        createMany: async ({ data }) => subtaskSnapshots.push(...data),
      },
      task: {
        update: async ({ where, data }) => {
          taskUpdates.push({ where, data });
          return { ...data };
        },
      },
      subtask: {
        updateMany: async ({ where, data }) => subtaskUpdates.push({ where, data }),
      },
      activityEvent: {
        create: async ({ data }) => events.push(data),
      },
    };
    const service = new SprintsService({ $transaction: async (callback) => callback(transaction) });

    await service.finish(sprint.id, 'admin-1');

    assert.equal(taskSnapshots.length, 2);
    assert.deepEqual(
      subtaskSnapshots.map(({ taskId, taskTitle, title, wasDone }) => ({
        taskId,
        taskTitle,
        title,
        wasDone,
      })),
      [
        {
          taskId: 'task-1',
          taskTitle: 'Parent task',
          title: 'Unfinished child',
          wasDone: false,
        },
        {
          taskId: 'task-1',
          taskTitle: 'Parent task',
          title: 'Finished child',
          wasDone: true,
        },
        {
          taskId: 'task-3',
          taskTitle: 'Unfinished parent task',
          title: 'Unfinished child of unfinished task',
          wasDone: false,
        },
        {
          taskId: 'task-3',
          taskTitle: 'Unfinished parent task',
          title: 'Finished child of unfinished task',
          wasDone: true,
        },
        {
          taskId: 'task-2',
          taskTitle: 'Another task',
          title: 'Unfinished standalone subtask',
          wasDone: false,
        },
      ],
    );

    // Unfinished task moved to next sprint with status (columnId) untouched
    assert.deepEqual(taskUpdates, [
      {
        where: { id: 'task-3' },
        data: { sprintId: 'sprint-2' },
      },
    ]);

    // Incomplete subtasks moved to next sprint with status (columnId) untouched
    assert.deepEqual(subtaskUpdates, [
      {
        where: { taskId: 'task-3', isCompleted: false },
        data: { sprintId: 'sprint-2' },
      },
      {
        where: { id: { in: ['subtask-1', 'subtask-2'] } },
        data: { sprintId: 'sprint-2' },
      },
    ]);

    assert.equal(events[0].payload.completedTasks, 1);
    assert.equal(events[0].payload.totalTasks, 2);
    assert.equal(events[0].payload.nextSprintId, 'sprint-2');
  });

  it('automatically creates the next planned sprint when no planned sprint exists', async () => {
    const taskUpdates = [];
    const subtaskUpdates = [];
    const createdSprints = [];
    const sprint = {
      id: 'sprint-1',
      name: 'Sprint 1',
      workspaceId: 'ws-1',
      status: 'ACTIVE',
      tasks: [
        {
          id: 'task-3',
          title: 'Unfinished parent task',
          estimateValue: null,
          estimateUnit: null,
          columnId: 'col-in-progress',
          column: { name: 'In progress', isDone: false },
          subtasks: [],
        },
      ],
      subtasks: [],
    };
    const transaction = {
      sprint: {
        findUnique: async () => sprint,
        findFirst: async () => null, // No planned sprint exists
        findMany: async () => [{ name: 'Sprint 1' }],
        create: async ({ data }) => {
          const created = { id: 'sprint-2-auto', ...data };
          createdSprints.push(created);
          return created;
        },
        update: async ({ data }) => ({ ...sprint, ...data }),
      },
      sprintTaskSnapshot: { createMany: async () => undefined },
      sprintSubtaskSnapshot: { createMany: async () => undefined },
      task: {
        update: async ({ where, data }) => {
          taskUpdates.push({ where, data });
          return { ...data };
        },
      },
      subtask: {
        updateMany: async ({ where, data }) => subtaskUpdates.push({ where, data }),
      },
      activityEvent: { create: async () => undefined },
    };
    const service = new SprintsService({ $transaction: async (callback) => callback(transaction) });

    await service.finish(sprint.id, 'admin-1');

    assert.equal(createdSprints.length, 1);
    assert.equal(createdSprints[0].name, 'Sprint 2');
    assert.equal(createdSprints[0].status, 'PLANNED');
    assert.deepEqual(taskUpdates, [
      {
        where: { id: 'task-3' },
        data: { sprintId: 'sprint-2-auto' },
      },
    ]);
  });

  it('moves work to an explicitly selected target sprint when provided', async () => {
    const taskUpdates = [];
    const sprint = {
      id: 'sprint-1',
      name: 'Sprint 1',
      workspaceId: 'ws-1',
      status: 'ACTIVE',
      tasks: [
        {
          id: 'task-3',
          title: 'Unfinished parent task',
          estimateValue: null,
          estimateUnit: null,
          columnId: 'col-in-progress',
          column: { name: 'In progress', isDone: false },
          subtasks: [],
        },
      ],
      subtasks: [],
    };
    const explicitTarget = {
      id: 'target-sprint-99',
      name: 'Sprint 99',
      workspaceId: 'ws-1',
      status: 'PLANNED',
    };
    const transaction = {
      sprint: {
        findUnique: async ({ where }) => {
          if (where.id === 'sprint-1') return sprint;
          if (where.id === 'target-sprint-99') return explicitTarget;
          return null;
        },
        update: async ({ data }) => ({ ...sprint, ...data }),
      },
      sprintTaskSnapshot: { createMany: async () => undefined },
      sprintSubtaskSnapshot: { createMany: async () => undefined },
      task: {
        update: async ({ where, data }) => {
          taskUpdates.push({ where, data });
          return { ...data };
        },
      },
      subtask: {
        updateMany: async () => undefined,
      },
      activityEvent: { create: async () => undefined },
    };
    const service = new SprintsService({ $transaction: async (callback) => callback(transaction) });

    await service.finish(sprint.id, 'admin-1', { targetSprintId: 'target-sprint-99' });

    assert.deepEqual(taskUpdates, [
      {
        where: { id: 'task-3' },
        data: { sprintId: 'target-sprint-99' },
      },
    ]);
  });

  it('keeps completed child work out of the backlog when resolving an unfinished task', async () => {
    const subtaskUpdates = [];
    const taskUpdates = [];
    const transaction = {
      sprint: { findUnique: async () => ({ status: 'COMPLETED' }) },
      sprintTaskSnapshot: { findMany: async () => [{ taskId: 'task-1' }] },
      sprintSubtaskSnapshot: { findMany: async () => [] },
      task: {
        findMany: async () => [{ id: 'task-1', columnId: 'in-progress' }],
        aggregate: async () => ({ _max: { position: 0 } }),
        update: async ({ where, data }) => {
          taskUpdates.push({ where, data });
          return data;
        },
      },
      subtask: {
        findMany: async () => [],
        updateMany: async ({ where, data }) => subtaskUpdates.push({ where, data }),
      },
      boardColumn: {
        findMany: async () => [{ id: 'backlog', isBacklog: true, position: 1 }],
      },
      activityEvent: { create: async () => undefined },
    };
    const service = new SprintsService({ $transaction: async (callback) => callback(transaction) });

    await service.moveToBacklog('sprint-1', { taskIds: ['task-1'] }, 'admin-1');

    assert.deepEqual(subtaskUpdates, [
      {
        where: { taskId: 'task-1', columnId: 'in-progress', isCompleted: false },
        data: { columnId: 'backlog' },
      },
    ]);
    assert.deepEqual(taskUpdates, [
      {
        where: { id: 'task-1' },
        data: { sprintId: null, columnId: 'backlog', position: 1024 },
      },
    ]);
  });
});
