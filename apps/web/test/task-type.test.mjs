import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_TASK_TYPE, TASK_TYPE_LABELS, TASK_TYPES, isTaskType } from '../lib/task-type.ts';

describe('task-type utilities', () => {
  it('defines TASK and BUG as valid types', () => {
    assert.deepEqual(TASK_TYPES, ['TASK', 'BUG']);
    assert.equal(DEFAULT_TASK_TYPE, 'TASK');
  });

  it('provides friendly labels for all task types', () => {
    assert.equal(TASK_TYPE_LABELS.TASK, 'Task');
    assert.equal(TASK_TYPE_LABELS.BUG, 'Bug');
  });

  it('correctly validates task type strings', () => {
    assert.equal(isTaskType('TASK'), true);
    assert.equal(isTaskType('BUG'), true);
    assert.equal(isTaskType('task'), false);
    assert.equal(isTaskType('FEATURE'), false);
    assert.equal(isTaskType(null), false);
    assert.equal(isTaskType(undefined), false);
    assert.equal(isTaskType(123), false);
  });
});
