import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ReportsService } from '../dist/reports/reports.service.js';

describe('ReportsService sprint and member reports', () => {
  it('sprintReport includes subtasks of sprint tasks and counts them accurately', async () => {
    const userAlice = {
      id: 'user-1',
      displayName: 'Alice',
      color: '#123456',
      hasAvatar: false,
      isActive: true,
    };
    const userBob = {
      id: 'user-2',
      displayName: 'Bob',
      color: '#654321',
      hasAvatar: true,
      isActive: true,
    };

    const sprint = {
      id: 'sprint-1',
      name: 'Sprint 1',
      goal: 'Deliver reports',
      status: 'ACTIVE',
      startsAt: new Date('2026-09-01'),
      endsAt: new Date('2026-09-14'),
      completedAt: null,
      tasks: [
        {
          id: 'task-1',
          title: 'Implement Reports',
          estimateValue: 5,
          estimateUnit: 'HOURS',
          column: { id: 'col-done', name: 'Done', isDone: true },
          assignees: [{ user: userAlice }],
          subtasks: [
            {
              id: 'sub-1',
              title: 'Fix subtask query',
              isCompleted: true,
              estimateValue: 2,
              estimateUnit: 'HOURS',
              assigneeId: userAlice.id,
              assignee: userAlice,
              column: { id: 'col-done', name: 'Done', isDone: true },
              taskId: 'task-1',
            },
            {
              id: 'sub-2',
              title: 'Add tests',
              isCompleted: false,
              estimateValue: 1,
              estimateUnit: 'HOURS',
              assigneeId: userBob.id,
              assignee: userBob,
              column: { id: 'col-todo', name: 'To Do', isDone: false },
              taskId: 'task-1',
            },
          ],
        },
      ],
      subtasks: [
        {
          id: 'sub-standalone',
          title: 'Standalone task',
          isCompleted: true,
          estimateValue: 3,
          estimateUnit: 'POINTS',
          assigneeId: userAlice.id,
          assignee: userAlice,
          column: { id: 'col-done', name: 'Done', isDone: true },
          task: { id: 'task-external', title: 'External task' },
        },
      ],
      taskSnapshots: [],
      subtaskSnapshots: [],
    };

    const prismaMock = {
      sprint: {
        findUnique: async ({ where, include }) => {
          assert.equal(where.id, 'sprint-1');
          // Verify subtasks query for sprint tasks does NOT filter by where: { sprintId }
          assert.deepEqual(include.tasks.include.subtasks.where, {
            OR: [{ sprintId: null }, { sprintId: 'sprint-1' }],
          });
          return sprint;
        },
      },
    };

    const service = new ReportsService(prismaMock);
    const report = await service.sprintReport('sprint-1');

    // Verify totals
    assert.equal(report.totals.taskCount, 1);
    assert.equal(report.totals.tasksDone, 1);
    assert.equal(report.totals.subtaskCount, 3); // 2 from task-1 + 1 standalone
    assert.equal(report.totals.subtasksDone, 2); // sub-1 + sub-standalone

    // Verify task subtasks
    assert.equal(report.tasks[0].subtasks.length, 2);
    assert.equal(report.tasks[0].subtasks[0].title, 'Fix subtask query');
    assert.equal(report.tasks[0].subtasks[0].isCompleted, true);
    assert.equal(report.tasks[0].subtasks[0].assignee.displayName, 'Alice');

    // Verify standalone subtasks
    assert.equal(report.standaloneSubtasks.length, 1);
    assert.equal(report.standaloneSubtasks[0].title, 'Standalone task');
    assert.equal(report.standaloneSubtasks[0].assignee.displayName, 'Alice');

    // Verify member contributions
    assert.equal(report.memberContributions.length, 2);
    const aliceContrib = report.memberContributions.find((c) => c.user.id === 'user-1');
    assert.ok(aliceContrib);
    assert.equal(aliceContrib.completedSubtasks, 2);
    assert.equal(aliceContrib.incompleteSubtasks, 0);
    assert.equal(aliceContrib.estimateHours, 2);
    assert.equal(aliceContrib.estimatePoints, 3);

    const bobContrib = report.memberContributions.find((c) => c.user.id === 'user-2');
    assert.ok(bobContrib);
    assert.equal(bobContrib.completedSubtasks, 0);
    assert.equal(bobContrib.incompleteSubtasks, 1);
    assert.equal(bobContrib.estimateHours, 0);
  });

  it('sprintReport reconstructs completed sprint results from snapshots accurately', async () => {
    const userAlice = {
      id: 'user-1',
      displayName: 'Alice',
      color: '#123456',
      hasAvatar: false,
      isActive: true,
    };

    const sprint = {
      id: 'sprint-completed-1',
      name: 'Sprint Completed 1',
      goal: null,
      status: 'COMPLETED',
      startsAt: new Date('2026-08-01'),
      endsAt: new Date('2026-08-14'),
      completedAt: new Date('2026-08-14'),
      tasks: [],
      subtasks: [],
      taskSnapshots: [
        {
          id: 'ts-1',
          taskId: 'task-1',
          title: 'Finished Task',
          estimateValue: 3,
          estimateUnit: 'HOURS',
          columnName: 'Done',
          wasDone: true,
          task: {
            column: { id: 'col-done', name: 'Done', isDone: true },
            assignees: [{ user: userAlice }],
          },
        },
        {
          id: 'ts-2',
          taskId: 'task-2',
          title: 'Unfinished Task',
          estimateValue: 5,
          estimateUnit: 'HOURS',
          columnName: 'In Progress',
          wasDone: false,
          task: {
            column: { id: 'col-prog', name: 'In Progress', isDone: false },
            assignees: [{ user: userAlice }],
          },
        },
      ],
      subtaskSnapshots: [
        {
          id: 'ss-1',
          subtaskId: 'sub-1',
          taskId: 'task-1',
          taskTitle: 'Finished Task',
          title: 'Child 1',
          estimateValue: 1,
          estimateUnit: 'HOURS',
          wasDone: true,
          subtask: {
            assignee: userAlice,
            column: { id: 'col-done', name: 'Done', isDone: true },
          },
        },
        {
          id: 'ss-2',
          subtaskId: 'sub-2',
          taskId: 'task-2',
          taskTitle: 'Unfinished Task',
          title: 'Child 2',
          estimateValue: 2,
          estimateUnit: 'HOURS',
          wasDone: false,
          subtask: {
            assignee: userAlice,
            column: { id: 'col-prog', name: 'In Progress', isDone: false },
          },
        },
      ],
    };

    const prismaMock = {
      sprint: {
        findUnique: async () => sprint,
      },
    };

    const service = new ReportsService(prismaMock);
    const report = await service.sprintReport('sprint-completed-1');

    // Totals should accurately reflect both finished and unfinished snapshotted items
    assert.equal(report.totals.taskCount, 2);
    assert.equal(report.totals.tasksDone, 1);
    assert.equal(report.totals.subtaskCount, 2);
    assert.equal(report.totals.subtasksDone, 1);

    // Tasks should include both tasks reconstructed with their subtasks
    assert.equal(report.tasks.length, 2);
    assert.equal(report.tasks[0].title, 'Finished Task');
    assert.equal(report.tasks[0].subtasks.length, 1);
    assert.equal(report.tasks[0].subtasks[0].title, 'Child 1');
    assert.equal(report.tasks[1].title, 'Unfinished Task');
    assert.equal(report.tasks[1].subtasks.length, 1);
    assert.equal(report.tasks[1].subtasks[0].title, 'Child 2');

    // Member contributions should be populated from snapshots
    assert.equal(report.memberContributions.length, 1);
    assert.equal(report.memberContributions[0].user.id, 'user-1');
    assert.equal(report.memberContributions[0].completedSubtasks, 1);
    assert.equal(report.memberContributions[0].incompleteSubtasks, 1);
  });

  it('memberReport filters by sprint via parent task and resolves sprint', async () => {
    const userAlice = {
      id: 'user-1',
      displayName: 'Alice',
      color: '#123456',
      hasAvatar: false,
      isActive: true,
    };

    let capturedSubtaskQuery;
    let capturedTaskQuery;
    const prismaMock = {
      user: {
        findUnique: async () => userAlice,
      },
      sprint: {
        findUnique: async () => ({
          id: 'sprint-1',
          name: 'Sprint 1',
          status: 'ACTIVE',
          taskSnapshots: [],
          subtaskSnapshots: [],
        }),
      },
      subtask: {
        findMany: async (args) => {
          capturedSubtaskQuery = args;
          return [
            {
              id: 'sub-c1',
              title: 'Done subtask',
              isCompleted: true,
              estimateValue: 4,
              estimateUnit: 'HOURS',
              column: { id: 'col-done', name: 'Done', isDone: true },
              task: {
                id: 'task-1',
                title: 'Task 1',
                type: 'TASK',
                sprint: { id: 'sprint-1', name: 'Sprint 1', status: 'ACTIVE' },
              },
              sprint: null, // sprintId is on parent task!
              assignee: userAlice,
            },
            {
              id: 'sub-p1',
              title: 'Active subtask',
              isCompleted: false,
              estimateValue: 2,
              estimateUnit: 'HOURS',
              column: { id: 'col-progress', name: 'In Progress', isDone: false },
              task: {
                id: 'task-1',
                title: 'Task 1',
                type: 'TASK',
                sprint: { id: 'sprint-1', name: 'Sprint 1', status: 'ACTIVE' },
              },
              sprint: null,
              assignee: userAlice,
            },
          ];
        },
      },
      task: {
        findMany: async (args) => {
          capturedTaskQuery = args;
          return [
            {
              id: 'task-1',
              title: 'Task 1',
              type: 'TASK',
              estimateValue: 6,
              estimateUnit: 'HOURS',
              column: { id: 'col-progress', name: 'In Progress', isDone: false },
              sprint: { id: 'sprint-1', name: 'Sprint 1', status: 'ACTIVE' },
            },
          ];
        },
      },
    };

    const service = new ReportsService(prismaMock);
    const report = await service.memberReport('user-1', { sprintId: 'sprint-1' });

    // Verify both directly assigned sprint subtasks and subtasks inherited from
    // a parent task in the sprint are included.
    assert.deepEqual(capturedSubtaskQuery.where.OR, [
      { sprintId: 'sprint-1' },
      { sprintId: null, task: { sprintId: 'sprint-1' } },
    ]);
    assert.equal(capturedTaskQuery.where.sprintId, 'sprint-1');
    assert.deepEqual(capturedTaskQuery.where.assignees, { some: { userId: 'user-1' } });

    // Verify completedSubtask sprint resolved from task
    assert.equal(report.completedSubtasks.length, 1);
    assert.equal(report.completedSubtasks[0].title, 'Done subtask');
    assert.equal(report.completedSubtasks[0].sprint.name, 'Sprint 1');
    assert.equal(report.incompleteSubtasks.length, 1);
    assert.equal(report.incompleteSubtasks[0].title, 'Active subtask');
    assert.equal(report.assignedTasks.length, 1);

    assert.equal(report.totals.completedCount, 1);
    assert.equal(report.totals.incompleteCount, 1);
    assert.equal(report.totals.taskCount, 1);
    assert.equal(report.totals.tasksDone, 0);
    assert.equal(report.totals.workItemCount, 3);
    assert.equal(report.totals.workItemsDone, 1);
    assert.equal(report.totals.completionRate, 33);
    assert.equal(report.totals.estimateHours, 4);
  });

  it('memberReport uses completed sprint snapshots so carried-over work remains visible', async () => {
    const userAlice = {
      id: 'user-1',
      displayName: 'Alice',
      color: '#123456',
      hasAvatar: false,
      isActive: true,
    };
    const sprintRef = { id: 'sprint-1', name: 'Sprint 1', status: 'COMPLETED' };
    const prismaMock = {
      user: { findUnique: async () => userAlice },
      sprint: {
        findUnique: async () => ({
          ...sprintRef,
          taskSnapshots: [
            {
              id: 'task-snapshot-1',
              taskId: 'task-1',
              title: 'Carried task',
              estimateValue: 5,
              estimateUnit: 'POINTS',
              columnName: 'In progress',
              wasDone: false,
              task: {
                type: 'TASK',
                assignees: [{ user: userAlice }],
              },
            },
          ],
          subtaskSnapshots: [
            {
              id: 'subtask-snapshot-1',
              subtaskId: 'subtask-1',
              taskId: 'task-1',
              taskTitle: 'Carried task',
              title: 'Finished part',
              estimateValue: 2,
              estimateUnit: 'HOURS',
              wasDone: true,
              subtask: { assignee: userAlice, task: { type: 'TASK' } },
            },
            {
              id: 'subtask-snapshot-2',
              subtaskId: 'subtask-2',
              taskId: 'task-1',
              taskTitle: 'Carried task',
              title: 'Carried part',
              estimateValue: 3,
              estimateUnit: 'HOURS',
              wasDone: false,
              subtask: { assignee: userAlice, task: { type: 'TASK' } },
            },
          ],
        }),
      },
      task: { findMany: async () => assert.fail('live tasks should not be queried') },
      subtask: { findMany: async () => assert.fail('live subtasks should not be queried') },
    };

    const service = new ReportsService(prismaMock);
    const report = await service.memberReport('user-1', { sprintId: 'sprint-1' });

    assert.equal(report.assignedTasks.length, 1);
    assert.equal(report.assignedTasks[0].isDone, false);
    assert.equal(report.completedSubtasks.length, 1);
    assert.equal(report.completedSubtasks[0].title, 'Finished part');
    assert.equal(report.incompleteSubtasks.length, 1);
    assert.equal(report.incompleteSubtasks[0].title, 'Carried part');
    assert.equal(report.incompleteSubtasks[0].column.name, 'Not done at sprint end');
    assert.equal(report.totals.workItemCount, 3);
    assert.equal(report.totals.workItemsDone, 1);
  });

  it('sprintReport includes task types and computes bugCount and bugsDone', async () => {
    const userAlice = {
      id: 'user-1',
      displayName: 'Alice',
      color: '#123456',
      hasAvatar: false,
      isActive: true,
    };

    const sprint = {
      id: 'sprint-bug-1',
      name: 'Sprint with Bugs',
      goal: 'Fix critical bugs',
      status: 'ACTIVE',
      startsAt: new Date('2026-09-01'),
      endsAt: new Date('2026-09-14'),
      completedAt: null,
      tasks: [
        {
          id: 'task-1',
          title: 'Implement feature',
          type: 'TASK',
          estimateValue: 3,
          estimateUnit: 'HOURS',
          column: { id: 'col-done', name: 'Done', isDone: true },
          assignees: [{ user: userAlice }],
          subtasks: [],
        },
        {
          id: 'task-2',
          title: 'Login crash on Safari',
          type: 'BUG',
          estimateValue: 2,
          estimateUnit: 'HOURS',
          column: { id: 'col-done', name: 'Done', isDone: true },
          assignees: [{ user: userAlice }],
          subtasks: [],
        },
        {
          id: 'task-3',
          title: 'UI glitch on mobile',
          type: 'BUG',
          estimateValue: 1,
          estimateUnit: 'HOURS',
          column: { id: 'col-prog', name: 'In Progress', isDone: false },
          assignees: [{ user: userAlice }],
          subtasks: [],
        },
      ],
      subtasks: [],
      taskSnapshots: [],
      subtaskSnapshots: [],
    };

    const prismaMock = {
      sprint: {
        findUnique: async () => sprint,
      },
    };

    const service = new ReportsService(prismaMock);
    const report = await service.sprintReport('sprint-bug-1');

    assert.equal(report.tasks[0].type, 'TASK');
    assert.equal(report.tasks[1].type, 'BUG');
    assert.equal(report.tasks[2].type, 'BUG');

    assert.equal(report.totals.taskCount, 3);
    assert.equal(report.totals.tasksDone, 2);
    assert.equal(report.totals.standardTaskCount, 1);
    assert.equal(report.totals.standardTasksDone, 1);
    assert.equal(report.totals.bugCount, 2);
    assert.equal(report.totals.bugsDone, 1);
  });

  it('sprintReport treats subtask in Done column as Done even if wasDone was false in snapshot', async () => {
    const userAlice = {
      id: 'user-1',
      displayName: 'Alice',
      color: '#123456',
      hasAvatar: false,
      isActive: true,
    };

    const sprint = {
      id: 'sprint-completed-2',
      name: 'Sprint Completed 2',
      goal: null,
      status: 'COMPLETED',
      startsAt: new Date('2026-08-01'),
      endsAt: new Date('2026-08-14'),
      completedAt: new Date('2026-08-14'),
      tasks: [],
      subtasks: [],
      taskSnapshots: [
        {
          id: 'ts-1',
          taskId: 'task-1',
          title: 'Parent Task',
          estimateValue: 3,
          estimateUnit: 'HOURS',
          columnName: 'Done',
          wasDone: true,
          task: {
            column: { id: 'col-done', name: 'Done', isDone: true },
            assignees: [{ user: userAlice }],
          },
        },
      ],
      subtaskSnapshots: [
        {
          id: 'ss-1',
          subtaskId: 'sub-1',
          taskId: 'task-1',
          taskTitle: 'Parent Task',
          title: 'Subtask in Done column',
          estimateValue: 2,
          estimateUnit: 'HOURS',
          wasDone: false, // Snapshot originally had false
          subtask: {
            assignee: userAlice,
            column: { id: 'col-done', name: 'Done', isDone: true },
          },
        },
      ],
    };

    const prismaMock = {
      sprint: {
        findUnique: async () => sprint,
      },
    };

    const service = new ReportsService(prismaMock);
    const report = await service.sprintReport('sprint-completed-2');

    // Totals should recognize the subtask in Done column as completed
    assert.equal(report.totals.subtaskCount, 1);
    assert.equal(report.totals.subtasksDone, 1);

    // Subtask in task should be marked completed
    assert.equal(report.tasks[0].subtasks[0].isCompleted, true);
    assert.equal(report.tasks[0].subtasks[0].column.isDone, true);

    // Member contribution should count 1 completed, 0 incomplete
    assert.equal(report.memberContributions[0].completedSubtasks, 1);
    assert.equal(report.memberContributions[0].incompleteSubtasks, 0);
  });

  it('sprintReport treats subtask in Done column as Done in active sprint even if isCompleted is false', async () => {
    const userAlice = {
      id: 'user-1',
      displayName: 'Alice',
      color: '#123456',
      hasAvatar: false,
      isActive: true,
    };

    const sprint = {
      id: 'sprint-active-subdone',
      name: 'Sprint Active Subdone',
      status: 'ACTIVE',
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1',
          type: 'TASK',
          estimateValue: 3,
          estimateUnit: 'HOURS',
          column: { id: 'col-done', name: 'Done', isDone: true },
          assignees: [{ user: userAlice }],
          subtasks: [
            {
              id: 'sub-1',
              title: 'Subtask with isCompleted false but column Done',
              isCompleted: false,
              estimateValue: 2,
              estimateUnit: 'HOURS',
              assignee: userAlice,
              column: { id: 'col-done', name: 'Done', isDone: true },
            },
          ],
        },
      ],
      subtasks: [],
      taskSnapshots: [],
      subtaskSnapshots: [],
    };

    const prismaMock = {
      sprint: {
        findUnique: async () => sprint,
      },
    };

    const service = new ReportsService(prismaMock);
    const report = await service.sprintReport('sprint-active-subdone');

    assert.equal(report.totals.subtaskCount, 1);
    assert.equal(report.totals.subtasksDone, 1);
    assert.equal(report.tasks[0].subtasks[0].isCompleted, true);
    assert.equal(report.memberContributions[0].completedSubtasks, 1);
    assert.equal(report.memberContributions[0].incompleteSubtasks, 0);
  });
});
