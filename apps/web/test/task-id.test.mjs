import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatTaskId, getShortId, matchesTaskId } from '../lib/task-id.ts';

describe('task-id utilities', () => {
  const sampleUuid = 'c56a4180-65aa-42ec-a945-5fd21dec0538';

  it('generates simplified numeric short ID of given length', () => {
    const id5 = getShortId(sampleUuid);
    assert.equal(/^\d{5}$/.test(id5), true);
    assert.equal(id5, '79411');

    const id4 = getShortId(sampleUuid, 4);
    assert.equal(/^\d{4}$/.test(id4), true);
    assert.equal(id4, '7411');

    const id6 = getShortId(sampleUuid, 6);
    assert.equal(/^\d{6}$/.test(id6), true);
    assert.equal(id6, '619411');

    assert.equal(getShortId(''), '');
    assert.equal(getShortId('12345'), '12345');
  });

  it('formats task ID with simplified numbers by default', () => {
    assert.equal(formatTaskId(sampleUuid), '79411');
    assert.equal(formatTaskId(sampleUuid, { includeHash: true }), '#79411');
  });

  it('formats task ID with project key when provided', () => {
    assert.equal(formatTaskId(sampleUuid, { projectKey: 'PROJ' }), 'PROJ-79411');
    assert.equal(formatTaskId(sampleUuid, { projectKey: 'api', length: 6 }), 'API-619411');
  });

  it('matches task ID with search queries', () => {
    assert.equal(matchesTaskId(sampleUuid, '79411'), true);
    assert.equal(matchesTaskId(sampleUuid, '#79411'), true);
    assert.equal(matchesTaskId(sampleUuid, 'PROJ-79411', 'PROJ'), true);
    assert.equal(matchesTaskId(sampleUuid, 'c56a4180'), true);
    assert.equal(matchesTaskId(sampleUuid, 'xyz999'), false);
    assert.equal(matchesTaskId(sampleUuid, ''), false);
  });
});
