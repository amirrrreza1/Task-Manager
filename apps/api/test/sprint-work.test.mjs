import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sprintWorkModule from '../dist/sprints/sprint-work.js';
import taskWorkModule from '../dist/tasks/task-work.js';

const {
  assertSubtaskCanJoinSprint,
  assertTaskCanJoinSprint,
  isSprintWorkSelectionLocked,
  sprintAcceptsNewWork,
  sprintOutcomeTotals,
} = sprintWorkModule;
const { pickBacklogColumnId, pickTodoColumnId } = taskWorkModule;

const sprint = (id, status) => ({ id, status });

describe('sprintAcceptsNewWork', () => {
  it('allows planned and active sprints', () => {
    assert.equal(sprintAcceptsNewWork('PLANNED'), true);
    assert.equal(sprintAcceptsNewWork('ACTIVE'), true);
  });

  it('rejects completed sprints', () => {
    assert.equal(sprintAcceptsNewWork('COMPLETED'), false);
  });
});

describe('isSprintWorkSelectionLocked', () => {
  it('unlocks unassigned work', () => {
    assert.equal(isSprintWorkSelectionLocked(null, 'target'), false);
  });

  it('locks work already in the target sprint', () => {
    assert.equal(isSprintWorkSelectionLocked(sprint('target', 'PLANNED'), 'target'), true);
  });

  it('unlocks work in another planned sprint', () => {
    assert.equal(isSprintWorkSelectionLocked(sprint('other', 'PLANNED'), 'target'), false);
  });

  it('locks work in another active or completed sprint', () => {
    assert.equal(isSprintWorkSelectionLocked(sprint('other', 'ACTIVE'), 'target'), true);
    assert.equal(isSprintWorkSelectionLocked(sprint('other', 'COMPLETED'), 'target'), true);
  });
});

describe('assertTaskCanJoinSprint', () => {
  it('allows backlog and cross-planned reassignment', () => {
    assert.doesNotThrow(() => assertTaskCanJoinSprint(null, 'target'));
    assert.doesNotThrow(() => assertTaskCanJoinSprint(sprint('other', 'PLANNED'), 'target'));
  });

  it('rejects completed and foreign active assignments', () => {
    assert.throws(
      () => assertTaskCanJoinSprint(sprint('old', 'COMPLETED'), 'target'),
      /completed/i,
    );
    assert.throws(
      () => assertTaskCanJoinSprint(sprint('old', 'ACTIVE'), 'target'),
      /active sprint/i,
    );
  });
});

describe('assertSubtaskCanJoinSprint', () => {
  it('mirrors task assignment rules', () => {
    assert.doesNotThrow(() => assertSubtaskCanJoinSprint(sprint('other', 'PLANNED'), 'target'));
    assert.throws(
      () => assertSubtaskCanJoinSprint(sprint('old', 'ACTIVE'), 'target'),
      /active sprint/i,
    );
  });
});

describe('sprintOutcomeTotals', () => {
  it('counts completion and estimate totals per unit', () => {
    const result = sprintOutcomeTotals([
      { estimateValue: 4, estimateUnit: 'HOURS', column: { isDone: false } },
      { estimateValue: 5, estimateUnit: 'POINTS', column: { isDone: true } },
      { estimateValue: null, estimateUnit: null, wasDone: true },
    ]);
    assert.deepEqual(result, {
      total: 3,
      completed: 2,
      incomplete: 1,
      estimates: { HOURS: 4, POINTS: 5 },
    });
  });
});

describe('pickBacklogColumnId', () => {
  it('prefers the marked backlog column', () => {
    assert.equal(
      pickBacklogColumnId([
        { id: 'ready', position: 0, isBacklog: false },
        { id: 'backlog', position: 2, isBacklog: true },
      ]),
      'backlog',
    );
  });

  it('falls back to the leftmost column', () => {
    assert.equal(
      pickBacklogColumnId([
        { id: 'left', position: 0, isBacklog: false },
        { id: 'right', position: 1, isBacklog: false },
      ]),
      'left',
    );
  });
});

describe('pickTodoColumnId', () => {
  it('prefers the marked To Do column', () => {
    assert.equal(
      pickTodoColumnId([
        { id: 'ready', position: 1, isBacklog: false, isTodo: false, isDone: false },
        { id: 'todo', position: 2, isBacklog: false, isTodo: true, isDone: false },
      ]),
      'todo',
    );
  });

  it('falls back to the first workflow column', () => {
    assert.equal(
      pickTodoColumnId([
        { id: 'backlog', position: 0, isBacklog: true, isDone: false },
        { id: 'ready', position: 1, isBacklog: false, isDone: false },
        { id: 'done', position: 2, isBacklog: false, isDone: true },
      ]),
      'ready',
    );
  });
});
