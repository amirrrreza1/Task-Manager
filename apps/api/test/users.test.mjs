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

  it('rejects removing the bootstrap administrator', async () => {
    const bootstrap = {
      id: 'admin-1',
      username: 'admin',
      displayName: 'Admin User',
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
      () => service.remove('admin-1', adminActor),
      /The bootstrap administrator cannot be removed/,
    );
  });

  it('rejects an actor attempting to remove their own account', async () => {
    const regularUser = {
      id: 'admin-1',
      username: 'admin',
      displayName: 'Admin User',
      isBootstrapAdmin: false,
    };
    const service = new UsersService(
      {
        user: { findUnique: async () => regularUser },
      },
      {},
      {},
      {},
      { get: () => 25 },
    );

    await assert.rejects(
      () => service.remove('admin-1', adminActor),
      /You cannot remove your own account/,
    );
  });

  it('rejects reassigning to the user being removed or to an inactive user', async () => {
    const memberToDelete = {
      id: 'member-2',
      username: 'jane',
      displayName: 'Jane Doe',
      isBootstrapAdmin: false,
    };
    const inactiveUser = {
      id: 'member-3',
      username: 'inactive',
      isActive: false,
    };
    const service = new UsersService(
      {
        user: {
          findUnique: async ({ where }) => {
            if (where.id === 'member-2') return memberToDelete;
            if (where.id === 'member-3') return inactiveUser;
            return null;
          },
        },
      },
      {},
      {},
      {},
      { get: () => 25 },
    );

    // Reassigning to self
    await assert.rejects(
      () => service.remove('member-2', adminActor, 'member-2'),
      /Cannot reassign tasks to the user being removed/,
    );

    // Reassigning to inactive user
    await assert.rejects(
      () => service.remove('member-2', adminActor, 'member-3'),
      /selected reassignment user does not exist or is inactive/,
    );

    // Reassigning to non-existent user
    await assert.rejects(
      () => service.remove('member-2', adminActor, 'unknown-user'),
      /selected reassignment user does not exist or is inactive/,
    );
  });

  it('removes user and reassigns their tasks and subtasks to target user', async () => {
    const memberToDelete = {
      id: 'member-2',
      username: 'jane',
      displayName: 'Jane Doe',
      hasAvatar: true,
      avatarStorageKey: 'jane-avatar-key',
      isBootstrapAdmin: false,
    };
    const targetUser = {
      id: 'member-3',
      username: 'bob',
      displayName: 'Bob Builder',
      isActive: true,
      isBootstrapAdmin: false,
    };

    let userDeleted = false;
    let deletedAvatarKey = null;
    const events = [];
    const boardEvents = [];
    const notifications = [];
    const createdAssignments = [];
    let deletedAssignmentsFor = null;
    let subtaskAssigneeSetTo = null;
    let taskCreatedByIdSetTo = null;

    const transaction = {
      taskAssignment: {
        findMany: async ({ where }) => {
          if (where.userId === 'member-2') {
            return [
              { taskId: 'task-1', task: { workspaceId: 'ws-1' } },
              { taskId: 'task-2', task: { workspaceId: 'ws-1' } },
            ];
          }
          if (where.userId === 'member-3') {
            // Target is already assigned to task-1, but not task-2
            return [{ taskId: 'task-1' }];
          }
          return [];
        },
        createMany: async ({ data }) => {
          createdAssignments.push(...data);
          return { count: data.length };
        },
        deleteMany: async ({ where }) => {
          deletedAssignmentsFor = where.userId;
          return { count: 2 };
        },
      },
      subtask: {
        findMany: async () => [
          { id: 'subtask-1', task: { workspaceId: 'ws-1' } },
        ],
        updateMany: async ({ where, data }) => {
          if (where.assigneeId) subtaskAssigneeSetTo = data.assigneeId;
          return { count: 1 };
        },
      },
      task: {
        updateMany: async ({ where, data }) => {
          if (where.createdById) taskCreatedByIdSetTo = data.createdById;
          return { count: 1 };
        },
      },
      sprintComment: {
        updateMany: async () => ({ count: 0 }),
      },
      workItemComment: {
        updateMany: async () => ({ count: 0 }),
      },
      attachment: {
        updateMany: async () => ({ count: 0 }),
      },
      refreshSession: {
        deleteMany: async () => ({ count: 1 }),
      },
      notification: {
        deleteMany: async () => ({ count: 0 }),
      },
      projectSenior: {
        deleteMany: async () => ({ count: 0 }),
      },
      user: {
        delete: async ({ where }) => {
          if (where.id === 'member-2') userDeleted = true;
          return memberToDelete;
        },
      },
      activityEvent: {
        create: async ({ data }) => {
          events.push(data);
          return data;
        },
      },
    };

    const storage = {
      delete: async (key) => {
        deletedAvatarKey = key;
      },
    };

    const notificationsService = {
      dispatch: async (payload) => {
        notifications.push(payload);
      },
    };

    const boardEventsService = {
      emitBoardUpdate: (wsId, eventType, entityId, actorId) => {
        boardEvents.push({ wsId, eventType, entityId, actorId });
      },
    };

    const service = new UsersService(
      {
        user: {
          findUnique: async ({ where }) => {
            if (where.id === 'member-2') return memberToDelete;
            if (where.id === 'member-3') return targetUser;
            return null;
          },
        },
        $transaction: async (cb) => cb(transaction),
      },
      {},
      storage,
      notificationsService,
      { get: () => 25 },
      boardEventsService,
    );

    const result = await service.remove('member-2', adminActor, 'member-3');

    assert.equal(result.success, true);
    assert.equal(result.reassignToUserId, 'member-3');
    assert.equal(userDeleted, true);
    assert.equal(deletedAvatarKey, 'jane-avatar-key');

    // Verify task-2 was assigned to member-3 (task-1 was already assigned)
    assert.equal(createdAssignments.length, 1);
    assert.equal(createdAssignments[0].taskId, 'task-2');
    assert.equal(createdAssignments[0].userId, 'member-3');

    // Verify member-2's assignments were deleted
    assert.equal(deletedAssignmentsFor, 'member-2');

    // Verify subtask reassignment
    assert.equal(subtaskAssigneeSetTo, 'member-3');

    // Verify created tasks transferred to member-3
    assert.equal(taskCreatedByIdSetTo, 'member-3');

    // Verify activity event
    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, 'user.deleted');
    assert.equal(events[0].payload.username, 'jane');
    assert.equal(events[0].payload.reassignToUserId, 'member-3');

    // Verify board refresh event
    assert.equal(boardEvents.length, 1);
    assert.equal(boardEvents[0].wsId, 'ws-1');
    assert.equal(boardEvents[0].eventType, 'board.refresh');

    // Verify notification sent to target user
    assert.equal(notifications.length, 1);
    assert.deepEqual(notifications[0].recipientUserIds, ['member-3']);
  });

  it('removes user without reassignment (leaves unassigned)', async () => {
    const memberToDelete = {
      id: 'member-2',
      username: 'jane',
      displayName: 'Jane Doe',
      isBootstrapAdmin: false,
    };

    let userDeleted = false;
    let deletedAssignmentsFor = null;
    let subtaskAssigneeSetTo = undefined;
    let taskCreatedByIdSetTo = null;

    const transaction = {
      taskAssignment: {
        findMany: async () => [],
        deleteMany: async ({ where }) => {
          deletedAssignmentsFor = where.userId;
          return { count: 0 };
        },
      },
      subtask: {
        findMany: async () => [],
        updateMany: async ({ where, data }) => {
          if (where.assigneeId) subtaskAssigneeSetTo = data.assigneeId;
          return { count: 0 };
        },
      },
      task: {
        updateMany: async ({ where, data }) => {
          if (where.createdById) taskCreatedByIdSetTo = data.createdById;
          return { count: 0 };
        },
      },
      sprintComment: {
        updateMany: async () => ({ count: 0 }),
      },
      workItemComment: {
        updateMany: async () => ({ count: 0 }),
      },
      attachment: {
        updateMany: async () => ({ count: 0 }),
      },
      refreshSession: {
        deleteMany: async () => ({ count: 0 }),
      },
      notification: {
        deleteMany: async () => ({ count: 0 }),
      },
      projectSenior: {
        deleteMany: async () => ({ count: 0 }),
      },
      user: {
        delete: async () => {
          userDeleted = true;
          return memberToDelete;
        },
      },
      activityEvent: {
        create: async () => ({}),
      },
    };

    const service = new UsersService(
      {
        user: {
          findUnique: async () => memberToDelete,
        },
        $transaction: async (cb) => cb(transaction),
      },
      {},
      {},
      {},
      { get: () => 25 },
    );

    const result = await service.remove('member-2', adminActor);

    assert.equal(result.success, true);
    assert.equal(result.reassignToUserId, null);
    assert.equal(userDeleted, true);
    assert.equal(deletedAssignmentsFor, 'member-2');
    assert.equal(subtaskAssigneeSetTo, null);
    // When no targetId, fallback owner is adminActor.id
    assert.equal(taskCreatedByIdSetTo, 'admin-1');
  });
});
