import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UsersService } from '../dist/users/users.service.js';

describe('UsersService', () => {
  const adminActor = { id: 'admin-1', role: 'ADMIN', username: 'admin' };
  const memberActor = { id: 'member-1', role: 'MEMBER', username: 'john' };

  it('allows administrator to update another user profile (role, username, color, etc.)', async () => {
    const existing = {
      id: 'member-2',
      username: 'jane',
      displayName: 'Jane Doe',
      color: '#2563EB',
      email: 'jane@example.com',
      telegramUsername: 'janedoe',
      role: 'MEMBER',
      isActive: true,
      isBootstrapAdmin: false,
    };
    const events = [];
    const transaction = {
      user: {
        update: async ({ data }) => ({ ...existing, ...data }),
      },
      refreshSession: {
        updateMany: async () => ({ count: 0 }),
      },
      activityEvent: {
        create: async ({ data }) => {
          events.push(data);
          return data;
        },
      },
    };

    const service = new UsersService(
      {
        user: {
          findUnique: async () => existing,
          findFirst: async () => null,
        },
        $transaction: async (cb) => cb(transaction),
      },
      {},
      {},
      {},
      { get: () => 25 },
    );

    const updated = await service.update(
      'member-2',
      {
        displayName: 'Jane Updated',
        username: 'jane_new',
        role: 'ADMIN',
        color: '#EA580C',
        isActive: false,
      },
      adminActor,
    );

    assert.equal(updated.displayName, 'Jane Updated');
    assert.equal(updated.username, 'jane_new');
    assert.equal(updated.role, 'ADMIN');
    assert.equal(updated.color, '#EA580C');
    assert.equal(updated.isActive, false);
    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, 'user.updated');
  });

  it('allows a member to update their own contact information and color', async () => {
    const existing = {
      id: 'member-1',
      username: 'john',
      displayName: 'John Doe',
      color: '#2563EB',
      email: null,
      telegramUsername: null,
      role: 'MEMBER',
      isActive: true,
      isBootstrapAdmin: false,
    };
    const transaction = {
      user: {
        update: async ({ data }) => ({ ...existing, ...data }),
      },
      activityEvent: {
        create: async () => ({}),
      },
    };

    const service = new UsersService(
      {
        user: {
          findUnique: async () => existing,
          findFirst: async () => null,
        },
        $transaction: async (cb) => cb(transaction),
      },
      {},
      {},
      {},
      { get: () => 25 },
    );

    const updated = await service.update(
      'member-1',
      {
        displayName: 'John Self',
        email: 'john@example.com',
        telegramUsername: 'john_tg',
        color: '#059669',
      },
      memberActor,
    );

    assert.equal(updated.displayName, 'John Self');
    assert.equal(updated.email, 'john@example.com');
    assert.equal(updated.telegramUsername, 'john_tg');
    assert.equal(updated.color, '#059669');
  });

  it('rejects a member attempting to update another user profile', async () => {
    const existing = {
      id: 'member-2',
      username: 'jane',
      displayName: 'Jane Doe',
      isBootstrapAdmin: false,
    };
    const service = new UsersService(
      {
        user: { findUnique: async () => existing },
      },
      {},
      {},
      {},
      { get: () => 25 },
    );

    await assert.rejects(
      () => service.update('member-2', { displayName: 'Hacked' }, memberActor),
      /You can only update your own profile/,
    );
  });

  it('rejects a member attempting to change administrative fields (role, username, isActive)', async () => {
    const existing = {
      id: 'member-1',
      username: 'john',
      displayName: 'John Doe',
      role: 'MEMBER',
      isBootstrapAdmin: false,
    };
    const service = new UsersService(
      {
        user: { findUnique: async () => existing },
      },
      {},
      {},
      {},
      { get: () => 25 },
    );

    await assert.rejects(
      () => service.update('member-1', { role: 'ADMIN' }, memberActor),
      /Only administrators can change role, status, or username/,
    );

    await assert.rejects(
      () => service.update('member-1', { isActive: false }, memberActor),
      /Only administrators can change role, status, or username/,
    );

    await assert.rejects(
      () => service.update('member-1', { username: 'newjohn' }, memberActor),
      /Only administrators can change role, status, or username/,
    );
  });

  it('protects bootstrap administrator from username/role/deactivation changes', async () => {
    const bootstrap = {
      id: 'admin-1',
      username: 'admin',
      displayName: 'Admin User',
      role: 'ADMIN',
      isActive: true,
      isBootstrapAdmin: true,
    };
    const service = new UsersService(
      {
        user: { findUnique: async () => bootstrap },
      },
      {},
      {},
      {},
      { get: () => 25 },
    );

    await assert.rejects(
      () => service.update('admin-1', { username: 'changed_admin' }, adminActor),
      /bootstrap administrator is controlled by the environment/,
    );

    await assert.rejects(
      () => service.update('admin-1', { isActive: false }, adminActor),
      /bootstrap administrator is controlled by the environment/,
    );

    await assert.rejects(
      () => service.update('admin-1', { role: 'MEMBER' }, adminActor),
      /bootstrap administrator is controlled by the environment/,
    );
  });

  it('allows administrator to remove avatar for another user but rejects non-admin member', async () => {
    const targetUser = {
      id: 'member-2',
      hasAvatar: true,
      avatarStorageKey: 'avatar-key-1',
      isBootstrapAdmin: false,
    };
    let deletedKey = null;
    const transaction = {
      user: {
        update: async ({ data }) => ({ ...targetUser, ...data }),
      },
      activityEvent: {
        create: async () => ({}),
      },
    };
    const storage = {
      delete: async (key) => {
        deletedKey = key;
      },
    };

    const service = new UsersService(
      {
        user: { findUnique: async () => targetUser },
        $transaction: async (cb) => cb(transaction),
      },
      {},
      storage,
      {},
      { get: () => 25 },
    );

    // Member attempting to delete another member's avatar should fail
    await assert.rejects(
      () => service.removeAvatar('member-2', memberActor),
      /You do not have permission to change this avatar/,
    );

    // Admin should succeed
    const result = await service.removeAvatar('member-2', adminActor);
    assert.equal(result.hasAvatar, false);
    assert.equal(deletedKey, 'avatar-key-1');
  });
});
