import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSprintWorkSelectionLocked } from '../lib/sprint-work.ts';

const sprint = (id, status) => ({ id, status });

describe('isSprintWorkSelectionLocked', () => {
  it('unlocks unassigned work', () => {
    assert.equal(isSprintWorkSelectionLocked(null, 'target'), false);
  });

  it('locks work already assigned to the target sprint', () => {
    assert.equal(isSprintWorkSelectionLocked(sprint('target', 'ACTIVE'), 'target'), true);
  });

  it('allows selecting work from another planned sprint', () => {
    assert.equal(isSprintWorkSelectionLocked(sprint('other', 'PLANNED'), 'target'), false);
  });

  it('locks work tied to another active or completed sprint', () => {
    assert.equal(isSprintWorkSelectionLocked(sprint('other', 'ACTIVE'), 'target'), true);
    assert.equal(isSprintWorkSelectionLocked(sprint('other', 'COMPLETED'), 'target'), true);
  });
});
