import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SprintsService } from '../dist/sprints/sprints.service.js';

describe('SprintsService.finish', () => {
  it('returns unfinished work to the backlog without moving completed subtasks', async () => {
    const taskSnapshots = [];
    const subtaskSnapshots = [];
    const events = [];
    const subtaskUpdates = [];
    const taskUpdates = [];
    const sprint = {
      id: 'sprint-1',
      status: 'ACTIVE',
      tasks: [
        {
          id: 'task-1',
          title: 'Parent task',
          estimateValue: 5,
          estimateUnit: 'POINTS',
          column: { name: 'Done', isDone: true },
          subtasks: [
            {
              id: 'subtask-1',
              taskId: 'task-1',
              title: 'Unfinished child',
              estimateValue: 2,
              estimateUnit: 'POINTS',
              isCompleted: false,
            },
            {
              id: 'subtask-done',
              taskId: 'task-1',
              title: 'Finished child',
              estimateValue: null,
              estimateUnit: null,
              isCompleted: true,
            },
          ],
        },
        {
          id: 'task-3',
          title: 'Unfinished parent task',
          estimateValue: null,
          estimateUnit: null,
          column: { name: 'In progress', isDone: false },
          subtasks: [
            {
              id: 'subtask-3',
              taskId: 'task-3',
              title: 'Unfinished child of unfinished task',
              estimateValue: null,
              estimateUnit: null,
              isCompleted: false,
            },
            {
              id: 'subtask-done-3',
              taskId: 'task-3',
              title: 'Finished child of unfinished task',
              estimateValue: null,
              estimateUnit: null,
              isCompleted: true,
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
          task: { title: 'Another task' },
        },
      ],
    };
    const transaction = {
      sprint: {
        findUnique: async () => sprint,
        update: async ({ data }) => ({ ...sprint, ...data }),
      },
      sprintTaskSnapshot: {
        createMany: async ({ data }) => taskSnapshots.push(...data),
      },
      sprintSubtaskSnapshot: {
        createMany: async ({ data }) => subtaskSnapshots.push(...data),
        updateMany: async () => undefined,
      },
      boardColumn: {
        findMany: async () => [
          { id: 'backlog', isBacklog: true, position: 1 },
          { id: 'done', isBacklog: false, position: 2 },
        ],
      },
      task: {
        aggregate: async () => ({ _max: { position: 0 } }),
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
    assert.deepEqual(taskUpdates, [
      {
        where: { id: 'task-3' },
        data: { sprintId: null, columnId: 'backlog', position: 1024 },
      },
    ]);
    assert.deepEqual(subtaskUpdates, [
      {
        where: { taskId: 'task-3', isCompleted: false },
        data: { sprintId: null, columnId: 'backlog' },
      },
      {
        where: { id: { in: ['subtask-1', 'subtask-2'] } },
        data: { sprintId: null, columnId: 'backlog' },
      },
    ]);
    assert.deepEqual(events[0].payload, {
      version: 1,
      completedAt: events[0].payload.completedAt,
      totalTasks: 2,
      completedTasks: 1,
      totalSubtasks: 5,
      completedSubtasks: 2,
    });
  });
});
