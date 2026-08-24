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

  it('creates a project with senior user IDs and validates active users', async () => {
    const events = [];
    const createdSeniors = [];
    const mockProject = {
      id: 'proj-1',
      workspaceId: 'ws-1',
      name: 'Backend API',
      key: 'API',
      description: 'API Services',
      color: '#2563EB',
      createdAt: new Date(),
      updatedAt: new Date(),
      seniors: [{ userId: 'user-senior-1' }],
    };

    const transaction = {
      project: {
        create: async ({ data }) => {
          if (data.seniors?.create) {
            createdSeniors.push(...data.seniors.create);
          }
          return {
            ...mockProject,
            ...data,
            _count: { tasks: 0 },
          };
        },
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
      user: {
        count: async ({ where }) => where.id.in.length,
      },
      $transaction: async (callback) => callback(transaction),
    });

    const result = await service.create(
      {
        workspaceId: 'ws-1',
        name: 'Backend API',
        seniorUserIds: ['user-senior-1', 'user-senior-2'],
      },
      'admin-1',
    );

    assert.equal(result.name, 'Backend API');
    assert.equal(createdSeniors.length, 2);
    assert.equal(createdSeniors[0].userId, 'user-senior-1');
    assert.equal(createdSeniors[1].userId, 'user-senior-2');
    assert.equal(events[0].eventType, 'project.created');
    assert.deepEqual(events[0].payload.seniorUserIds, ['user-senior-1', 'user-senior-2']);
  });

  it('rejects project creation if any senior ID is not an active user', async () => {
    const service = new ProjectsService({
      workspace: { findUnique: async () => ({ id: 'ws-1' }) },
      project: { findFirst: async () => null },
      user: {
        count: async () => 1, // only 1 of 2 found
      },
    });

    await assert.rejects(
      () =>
        service.create(
          {
            workspaceId: 'ws-1',
            name: 'Backend API',
            seniorUserIds: ['user-senior-1', 'user-senior-2'],
          },
          'admin-1',
        ),
      /Every senior must be an active user/,
    );
  });

  it('updates project seniors during update', async () => {
    const events = [];
    const seniorInserts = [];
    let deleteCount = 0;
    const existing = {
      id: 'proj-1',
      workspaceId: 'ws-1',
      name: 'Mobile App',
      key: 'MOB',
      description: null,
      color: '#2563EB',
    };

    const transaction = {
      projectSenior: {
        deleteMany: async () => {
          deleteCount++;
          return { count: 1 };
        },
        createMany: async ({ data }) => {
          seniorInserts.push(...data);
          return { count: data.length };
        },
      },
      project: {
        update: async ({ data }) => ({
          ...existing,
          ...data,
          _count: { tasks: 5 },
          seniors: seniorInserts.map((s) => ({ user: { id: s.userId } })),
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
      user: {
        count: async ({ where }) => where.id.in.length,
      },
      $transaction: async (callback) => callback(transaction),
    });

    const updated = await service.update('proj-1', { seniorUserIds: ['user-senior-3'] }, 'admin-1');
    assert.ok(updated);

    assert.equal(deleteCount, 1);
    assert.equal(seniorInserts.length, 1);
    assert.equal(seniorInserts[0].userId, 'user-senior-3');
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
