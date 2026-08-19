import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ProjectsService } from '../dist/projects/projects.service.js';

describe('ProjectsService', () => {
  it('creates a project with normalized key and emits activity event', async () => {
    const events = [];
    const mockProject = {
      id: 'proj-1',
      workspaceId: 'ws-1',
      name: 'Mobile App',
      key: 'MOB',
      description: 'iOS and Android client',
      color: '#2563EB',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const transaction = {
      project: {
        create: async ({ data }) => ({
          ...mockProject,
          ...data,
          _count: { tasks: 0 },
        }),
      },
      activityEvent: {
        create: async ({ data }) => {
          events.push(data);
          return data;
        },
      },
    };

    const service = new ProjectsService({
      workspace: { findUnique: async () => ({ id: 'ws-1' }) },
      project: { findFirst: async () => null },
      $transaction: async (callback) => callback(transaction),
    });

    const result = await service.create(
      {
        workspaceId: 'ws-1',
        name: 'Mobile App',
        key: 'mob',
        description: 'iOS and Android client',
        color: '#2563EB',
      },
      'admin-1',
    );

    assert.equal(result.name, 'Mobile App');
    assert.equal(result.key, 'MOB');
    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, 'project.created');
  });

  it('rejects project creation with empty name', async () => {
    const service = new ProjectsService({});
    await assert.rejects(
      () => service.create({ name: '   ' }, 'admin-1'),
      /Project name cannot be empty/,
    );
  });

  it('rejects project creation with duplicate name in the same workspace', async () => {
    const service = new ProjectsService({
      workspace: { findUnique: async () => ({ id: 'ws-1' }) },
      project: { findFirst: async () => ({ id: 'proj-existing' }) },
    });

    await assert.rejects(
      () => service.create({ workspaceId: 'ws-1', name: 'Mobile App' }, 'admin-1'),
      /A project with this name already exists in this workspace/,
    );
  });

  it('updates project details and emits activity event', async () => {
    const events = [];
    const existing = {
      id: 'proj-1',
      workspaceId: 'ws-1',
      name: 'Old Project Name',
      key: 'OLD',
      description: null,
      color: '#2563EB',
    };

    const transaction = {
      project: {
        update: async ({ data }) => ({
          ...existing,
          ...data,
          _count: { tasks: 5 },
        }),
      },
      activityEvent: {
        create: async ({ data }) => {
          events.push(data);
          return data;
        },
      },
    };

    const service = new ProjectsService({
      project: {
        findUnique: async () => existing,
        findFirst: async () => null,
      },
      $transaction: async (callback) => callback(transaction),
    });

    const updated = await service.update(
      'proj-1',
      { name: 'New Project Name', key: 'new', color: '#10B981' },
      'admin-1',
    );

    assert.equal(updated.name, 'New Project Name');
    assert.equal(updated.key, 'NEW');
    assert.equal(updated.color, '#10B981');
    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, 'project.updated');
  });

  it('deletes a project and emits activity event', async () => {
    const events = [];
    const existing = {
      id: 'proj-1',
      workspaceId: 'ws-1',
      name: 'Project to Delete',
    };

    const transaction = {
      project: {
        delete: async () => existing,
      },
      activityEvent: {
        create: async ({ data }) => {
          events.push(data);
          return data;
        },
      },
    };

    const service = new ProjectsService({
      project: { findUnique: async () => existing },
      $transaction: async (callback) => callback(transaction),
    });

    const result = await service.remove('proj-1', 'admin-1');

    assert.equal(result.id, 'proj-1');
    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, 'project.deleted');
  });
});
