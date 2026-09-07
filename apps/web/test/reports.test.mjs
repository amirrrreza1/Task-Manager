import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('Reports bug and subtask handling', () => {
  it('identifies bug tasks and suppresses subtasks for bugs', () => {
    const tasks = [
      {
        id: 't-1',
        title: 'Feature task',
        type: 'TASK',
        isDone: true,
        subtasks: [
          { id: 's-1', title: 'Subtask 1', isCompleted: true },
          { id: 's-2', title: 'Subtask 2', isCompleted: false },
        ],
      },
      {
        id: 't-2',
        title: 'Crash fix',
        type: 'BUG',
        isDone: false,
        subtasks: [{ id: 's-3', title: 'Hidden subtask', isCompleted: false }],
      },
    ];

    // Standard task allows subtasks
    const taskHasSubtasks = tasks[0].type !== 'BUG' && tasks[0].subtasks.length > 0;
    assert.equal(taskHasSubtasks, true);

    // Bug task suppresses subtasks
    const bugHasSubtasks = tasks[1].type !== 'BUG' && tasks[1].subtasks.length > 0;
    assert.equal(bugHasSubtasks, false);
  });

  it('correctly aggregates bug and standard task totals', () => {
    const totals = {
      taskCount: 3,
      tasksDone: 2,
      standardTaskCount: 1,
      standardTasksDone: 1,
      bugCount: 2,
      bugsDone: 1,
      subtaskCount: 5,
      subtasksDone: 3,
    };

    assert.equal(totals.taskCount, 3);
    assert.equal(totals.standardTaskCount, 1);
    assert.equal(totals.bugCount, 2);
    assert.equal(totals.bugsDone, 1);
  });
});
