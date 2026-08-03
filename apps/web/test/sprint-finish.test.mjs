import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { needsSprintFinishConfirmation } from '../lib/sprint-finish.ts';

describe('needsSprintFinishConfirmation', () => {
  const today = new Date('2026-08-03T12:00:00.000Z');

  it('does not require confirmation on the scheduled end date', () => {
    assert.equal(needsSprintFinishConfirmation(today.toISOString(), today), false);
  });

  it('requires confirmation when the scheduled end date is a different day', () => {
    assert.equal(needsSprintFinishConfirmation('2026-08-04T12:00:00.000Z', today), true);
  });

  it('does not require confirmation when there is no scheduled end date', () => {
    assert.equal(needsSprintFinishConfirmation(null, today), false);
  });
});
