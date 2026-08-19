import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { NotificationsService } from '../dist/notifications/notifications.service.js';

describe('NotificationsService', () => {
  test('dispatch skips if no recipients are found', async () => {
    let transactionCalled = false;
    const mockPrisma = {
      user: {
        findMany: async () => [],
        findUnique: async () => null,
      },
      $transaction: async () => {
        transactionCalled = true;
      },
    };
    const mockMail = { sendNotification: async () => true };
    const mockTelegram = { sendNotification: async () => true };

    const service = new NotificationsService(mockPrisma, mockMail, mockTelegram);

    await service.dispatch({
      recipientUserIds: ['user-1'],
      actorId: 'user-1', // actor is same as recipient -> filtered out
      type: 'task.assigned',
      title: 'Task Assigned',
      message: 'Task assigned message',
    });

    assert.equal(transactionCalled, false);
  });

  test('dispatch creates in-app notification and sends email & telegram', async () => {
    const createdNotifications = [];
    const emailsSent = [];
    const telegramSent = [];

    const mockPrisma = {
      user: {
        findMany: async () => [
          {
            id: 'user-2',
            email: 'user2@example.com',
            telegramUsername: 'user_two',
            displayName: 'User Two',
          },
        ],
        findUnique: async () => ({ displayName: 'Actor One' }),
      },
      notification: {
        create: async ({ data }) => {
          const rec = { id: 'notif-1', ...data, emailSent: false, telegramSent: false };
          createdNotifications.push(rec);
          return rec;
        },
        update: async ({ where, data }) => {
          const matched = createdNotifications.find((n) => n.id === where.id);
          if (matched) Object.assign(matched, data);
          return matched;
        },
        updateMany: async ({ data }) => {
          createdNotifications.forEach((n) => Object.assign(n, data));
          return { count: createdNotifications.length };
        },
      },
      $transaction: async (promises) => Promise.all(promises),
    };

    const mockMail = {
      sendNotification: async (opts) => {
        emailsSent.push(opts);
        return true;
      },
    };

    const mockTelegram = {
      sendNotification: async (opts) => {
        telegramSent.push(opts);
        return true;
      },
    };

    const service = new NotificationsService(mockPrisma, mockMail, mockTelegram);

    await service.dispatch({
      recipientUserIds: ['user-2'],
      actorId: 'user-1',
      type: 'task.assigned',
      title: 'Task Assigned: Feature A',
      message: 'You have been assigned to Feature A',
      link: '/tasks/123',
    });

    // Wait a moment for background promises
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(createdNotifications.length, 1);
    assert.equal(createdNotifications[0].userId, 'user-2');
    assert.equal(createdNotifications[0].type, 'task.assigned');
    assert.equal(emailsSent.length, 1);
    assert.equal(emailsSent[0].to, 'user2@example.com');
    assert.equal(telegramSent.length, 1);
    assert.deepEqual(telegramSent[0].mentions, ['@user_two']);
  });

  test('list returns paginated records and unread count', async () => {
    const mockPrisma = {
      notification: {
        findMany: async () => [
          { id: 'n1', title: 'Task Assigned', isRead: false },
          { id: 'n2', title: 'Sprint Started', isRead: true },
        ],
        count: async () => 1,
      },
    };

    const service = new NotificationsService(mockPrisma, {}, {});
    const result = await service.list('user-1', { limit: 10 });

    assert.equal(result.items.length, 2);
    assert.equal(result.unreadCount, 1);
    assert.equal(result.nextCursor, null);
  });
});
