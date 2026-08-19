import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WorkspacesService } from '../dist/workspaces/workspaces.service.js';

describe('WorkspacesService', () => {
  it('creates a workspace and seeds default workflow columns', async () => {
    const createdColumns = [];
    const events = [];
    const mockWorkspace = {
      id: 'ws-123',
      name: 'Engineering',
      description: 'Main dev team',
      estimateMode: 'POINTS',
      sprintDurationDays: 7,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const transaction = {
      workspace: {
        create: async ({ data }) => ({ ...mockWorkspace, ...data }),
        findUniqueOrThrow: async () => ({
          ...mockWorkspace,
          columns: createdColumns,
          _count: { tasks: 0, sprints: 0, columns: 5 },
        }),
      },
      boardColumn: {
        create: async ({ data }) => {
          createdColumns.push(data);
          return data;
        },
      },
      activityEvent: {
        create: async ({ data }) => {
          events.push(data);
          return data;
        },
      },
    };

    const service = new WorkspacesService({
      $transaction: async (callback) => callback(transaction),
    });

    const result = await service.create(
      {
        name: 'Engineering',
        description: 'Main dev team',
        estimateMode: 'POINTS',
        sprintDurationDays: 7,
      },
      'admin-1',
    );

    assert.equal(result.name, 'Engineering');
    assert.equal(createdColumns.length, 5);
    assert.equal(createdColumns[0].name, 'Backlog');
    assert.equal(createdColumns[0].isBacklog, true);
    assert.equal(createdColumns[1].name, 'To Do');
    assert.equal(createdColumns[1].isTodo, true);
    assert.equal(createdColumns[4].name, 'Done');
    assert.equal(createdColumns[4].isDone, true);
    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, 'workspace.created');
  });

  it('rejects workspace creation with empty name', async () => {
    const service = new WorkspacesService({});
    await assert.rejects(
      () => service.create({ name: '   ' }, 'admin-1'),
      /Workspace name cannot be empty/,
    );
  });

  it('updates workspace attributes and emits activity event', async () => {
    const events = [];
    const existing = {
      id: 'ws-1',
      name: 'Old Name',
      description: null,
      estimateMode: 'TIME',
      sprintDurationDays: 14,
    };
    const transaction = {
      workspace: {
        update: async ({ data }) => ({ ...existing, ...data }),
      },
      activityEvent: {
        create: async ({ data }) => {
          events.push(data);
          return data;
        },
      },
    };

    const service = new WorkspacesService({
      workspace: { findUnique: async () => existing },
      $transaction: async (callback) => callback(transaction),
    });

    const updated = await service.update(
      'ws-1',
      { name: 'New Name', sprintDurationDays: 21 },
      'admin-1',
    );

    assert.equal(updated.name, 'New Name');
    assert.equal(updated.sprintDurationDays, 21);
    assert.equal(events[0].eventType, 'workspace.updated');
  });

  it('prevents deleting the last remaining workspace', async () => {
    const service = new WorkspacesService({
      workspace: { count: async () => 1 },
    });

    await assert.rejects(
      () => service.remove('ws-1', 'admin-1'),
      /Cannot delete the last remaining workspace/,
    );
  });

  it('deletes workspace when multiple workspaces exist', async () => {
    const events = [];
    let deletedId = null;
    const existing = { id: 'ws-2', name: 'Secondary Workspace' };

    const transaction = {
      workspace: {
        delete: async ({ where }) => {
          deletedId = where.id;
          return existing;
        },
      },
      activityEvent: {
        create: async ({ data }) => {
          events.push(data);
          return data;
        },
      },
    };

    const service = new WorkspacesService({
      workspace: {
        count: async () => 2,
        findUnique: async () => existing,
      },
      $transaction: async (callback) => callback(transaction),
    });

    await service.remove('ws-2', 'admin-1');

    assert.equal(deletedId, 'ws-2');
    assert.equal(events[0].eventType, 'workspace.deleted');
  });
});
