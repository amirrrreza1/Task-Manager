import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SprintsService } from '../dist/sprints/sprints.service.js';
import { BoardService } from '../dist/board/board.service.js';

describe('Sprint History and Board Exclusion', () => {
  it('SprintsService.history returns completed sprints with done tasks and subtasks', async () => {
    const userAlice = {
      id: 'user-1',
      displayName: 'Alice',
      color: '#123456',
      hasAvatar: false,
      isActive: true,
    };

    const completedSprint = {
      id: 'sprint-1',
      workspaceId: 'ws-1',
      name: 'Sprint 1',
      goal: 'First goal',
      status: 'COMPLETED',
      startsAt: new Date('2026-08-01'),
      endsAt: new Date('2026-08-15'),
      completedAt: new Date('2026-08-15T12:00:00Z'),
      createdAt: new Date('2026-08-01'),
      taskSnapshots: [
        {
          id: 'snap-1',
          sprintId: 'sprint-1',
          taskId: 'task-1',
          title: 'Completed Task',
          estimateValue: 5,
          estimateUnit: 'POINTS',
          columnName: 'Done',
          wasDone: true,
          completedAt: new Date('2026-08-15T12:00:00Z'),
          task: {
            id: 'task-1',
            type: 'TASK',
            priority: 'HIGH',
            sprintId: 'sprint-1',
            assignees: [{ user: userAlice }],
          },
        },
        {
          id: 'snap-2',
          sprintId: 'sprint-1',
          taskId: 'task-2',
          title: 'Incomplete Task',
          estimateValue: 3,
          estimateUnit: 'POINTS',
          columnName: 'In progress',
          wasDone: false,
          completedAt: new Date('2026-08-15T12:00:00Z'),
          task: {
            id: 'task-2',
            type: 'TASK',
            priority: 'MEDIUM',
            sprintId: 'sprint-2',
            assignees: [],
          },
        },
      ],
      subtaskSnapshots: [
        {
          id: 'subsnap-1',
          sprintId: 'sprint-1',
          subtaskId: 'sub-1',
          taskId: 'task-1',
          taskTitle: 'Completed Task',
          title: 'Completed Child Subtask',
          estimateValue: 2,
          estimateUnit: 'POINTS',
          wasDone: true,
          completedAt: new Date('2026-08-15T12:00:00Z'),
          subtask: {
            id: 'sub-1',
            priority: 'MEDIUM',
            assignee: userAlice,
          },
        },
        {
          id: 'subsnap-standalone',
          sprintId: 'sprint-1',
          subtaskId: 'sub-standalone',
          taskId: 'task-other',
          taskTitle: 'External Task',
          title: 'Standalone Subtask Done',
          estimateValue: 1,
          estimateUnit: 'POINTS',
          wasDone: true,
          completedAt: new Date('2026-08-15T12:00:00Z'),
          subtask: {
            id: 'sub-standalone',
            priority: 'LOW',
            assignee: userAlice,
          },
        },
      ],
      tasks: [],
      _count: { tasks: 1, taskSnapshots: 2, comments: 0 },
    };

    const mockPrisma = {
      workspace: {
        findUnique: async () => ({ id: 'ws-1' }),
        findFirst: async () => ({ id: 'ws-1' }),
      },
      sprint: {
        findMany: async ({ where }) => {
          assert.equal(where.status, 'COMPLETED');
          return [completedSprint];
        },
      },
    };

    const sprintsService = new SprintsService(mockPrisma);
    const history = await sprintsService.history('ws-1');

    assert.equal(history.length, 1);
    const item = history[0];
    assert.equal(item.name, 'Sprint 1');
    assert.equal(item.completedTasks, 1);
    assert.equal(item.totalTasks, 2);
    assert.equal(item.doneTasks.length, 1);
    assert.equal(item.doneTasks[0].title, 'Completed Task');
    assert.equal(item.doneTasks[0].assignees[0].displayName, 'Alice');
    assert.equal(item.doneTasks[0].subtasks.length, 1);
    assert.equal(item.doneTasks[0].subtasks[0].title, 'Completed Child Subtask');
    assert.equal(item.standaloneDoneSubtasks.length, 1);
    assert.equal(item.standaloneDoneSubtasks[0].title, 'Standalone Subtask Done');
    assert.equal(item.estimateTotals.points, 5);
  });

  it('BoardService.read excludes completed sprint tasks by default', async () => {
    let capturedTaskWhere = null;

    const mockPrisma = {
      workspace: {
        findUnique: async () => ({ id: 'ws-1', estimateMode: 'TIME' }),
        findFirst: async () => ({ id: 'ws-1', estimateMode: 'TIME' }),
        findUniqueOrThrow: async () => ({ id: 'ws-1', estimateMode: 'TIME' }),
      },
      $transaction: async (callbacks) => {
        return Promise.all(callbacks);
      },
      boardColumn: {
        findMany: async ({ include }) => {
          if (include?.tasks?.where) {
            capturedTaskWhere = include.tasks.where;
          }
          return [
            {
              id: 'col-todo',
              name: 'To Do',
              position: 1,
              isBacklog: false,
              isDone: false,
              tasks: [],
            },
            {
              id: 'col-done',
              name: 'Done',
              position: 2,
              isBacklog: false,
              isDone: true,
              tasks: [],
            },
          ];
        },
      },
      subtask: {
        findMany: async () => [],
      },
    };

    const boardService = new BoardService(mockPrisma);

    // 1. By default without sprintId
    await boardService.read({ workspaceId: 'ws-1' });

    assert.ok(capturedTaskWhere);
    assert.deepEqual(capturedTaskWhere.OR, [
      { sprintId: null },
      { sprint: { status: { not: 'COMPLETED' } } },
    ]);

    // 2. With specific sprintId
    await boardService.read({ workspaceId: 'ws-1', sprintId: 'sprint-123' });
    assert.equal(capturedTaskWhere.sprintId, 'sprint-123');

    // 3. With includeCompletedSprints: true
    await boardService.read({ workspaceId: 'ws-1', includeCompletedSprints: true });
    assert.equal(capturedTaskWhere.OR, undefined);
    assert.equal(capturedTaskWhere.sprintId, undefined);
  });
});
