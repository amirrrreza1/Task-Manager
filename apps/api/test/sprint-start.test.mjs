import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SprintsService } from '../dist/sprints/sprints.service.js';

describe('SprintsService sprint start', () => {
  it('starts a planned sprint without schedule dates when no sprint is active', async () => {
    const events = [];
    let updatedData = null;
    const sprint = {
      id: 'sprint-1',
      name: 'Sprint 1',
      goal: 'First goal',
      status: 'PLANNED',
      workspaceId: 'ws-1',
    };

    const transaction = {
      sprint: {
        findUnique: async () => sprint,
        findFirst: async () => null, // No active sprint
        update: async ({ data }) => {
          updatedData = data;
          return { ...sprint, ...data };
        },
      },
      activityEvent: {
        create: async ({ data }) => {
          events.push(data);
          return data;
        },
      },
    };

    const service = new SprintsService(
      { $transaction: async (callback) => callback(transaction) },
      { dispatch: async () => undefined },
    );

    const result = await service.start(sprint.id, {}, 'admin-1');

    assert.equal(result.status, 'ACTIVE');
    assert.ok(result.startsAt instanceof Date);
    assert.equal(result.endsAt, null);
    assert.equal(updatedData.status, 'ACTIVE');
    assert.equal(updatedData.endsAt, null);
    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, 'sprint.started');
  });

  it('rejects starting a sprint when another sprint in the workspace is already active', async () => {
    const sprint = {
      id: 'sprint-2',
      name: 'Sprint 2',
      status: 'PLANNED',
      workspaceId: 'ws-1',
    };
    const activeSprint = {
      id: 'sprint-1',
      name: 'Sprint 1',
      status: 'ACTIVE',
      workspaceId: 'ws-1',
    };

    const transaction = {
      sprint: {
        findUnique: async () => sprint,
        findFirst: async () => activeSprint, // Active sprint exists
      },
    };

    const service = new SprintsService(
      { $transaction: async (callback) => callback(transaction) },
      { dispatch: async () => undefined },
    );

    await assert.rejects(
      () => service.start(sprint.id, {}, 'admin-1'),
      /Sprint "Sprint 1" is currently active/i,
    );
  });

  it('rejects starting a sprint that is not planned', async () => {
    const sprint = {
      id: 'sprint-1',
      name: 'Sprint 1',
      status: 'COMPLETED',
      workspaceId: 'ws-1',
    };

    const transaction = {
      sprint: {
        findUnique: async () => sprint,
      },
    };

    const service = new SprintsService(
      { $transaction: async (callback) => callback(transaction) },
      { dispatch: async () => undefined },
    );

    await assert.rejects(
      () => service.start(sprint.id, {}, 'admin-1'),
      /Only planned sprints can be started/i,
    );
  });
});
