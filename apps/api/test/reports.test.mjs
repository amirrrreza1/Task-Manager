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

    let queryCaptured = null;
    const prismaMock = {
      user: {
        findUnique: async () => userAlice,
      },
      subtask: {
        findMany: async (args) => {
          queryCaptured = args;
          if (args.where.isCompleted) {
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
                  sprint: { id: 'sprint-1', name: 'Sprint 1', status: 'ACTIVE' },
                },
                sprint: null, // sprintId is on parent task!
                assignee: userAlice,
              },
            ];
          }
          return [];
        },
      },
    };

    const service = new ReportsService(prismaMock);
    const report = await service.memberReport('user-1', { sprintId: 'sprint-1' });

    // Verify query captured includes OR for parent task sprintId
    assert.deepEqual(queryCaptured.where.OR, [
      { sprintId: 'sprint-1' },
      { sprintId: null, task: { sprintId: 'sprint-1' } },
    ]);

    // Verify completedSubtask sprint resolved from task
    assert.equal(report.completedSubtasks.length, 1);
    assert.equal(report.completedSubtasks[0].title, 'Done subtask');
    assert.equal(report.completedSubtasks[0].sprint.name, 'Sprint 1');

    assert.equal(report.totals.completedCount, 1);
    assert.equal(report.totals.incompleteCount, 0);
    assert.equal(report.totals.estimateHours, 4);
  });
});
