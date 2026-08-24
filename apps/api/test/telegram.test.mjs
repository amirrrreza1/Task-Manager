import assert from 'node:assert/strict';
import { test, describe, beforeEach, afterEach } from 'node:test';
import {
  readTelegramEnv,
  isTelegramConfigured,
} from '../dist/infrastructure/config/notification-env.js';
import { TelegramService } from '../dist/infrastructure/telegram/telegram.service.js';

describe('Telegram Configuration and Service', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('readTelegramEnv', () => {
    test('parses bot token, chat ID, and thread ID when all are present', () => {
      process.env.TELEGRAM_BOT_TOKEN = '123456:ABC-DEF';
      process.env.TELEGRAM_CHAT_ID = '-1002428157981';
      process.env.TELEGRAM_MESSAGE_THREAD_ID = '3960';

      const config = readTelegramEnv();
      assert.equal(config.botToken, '123456:ABC-DEF');
      assert.equal(config.chatId, '-1002428157981');
      assert.equal(config.messageThreadId, 3960);
      assert.equal(isTelegramConfigured(config), true);
    });

    test('parses null messageThreadId when TELEGRAM_MESSAGE_THREAD_ID is not set', () => {
      process.env.TELEGRAM_BOT_TOKEN = '123456:ABC-DEF';
      process.env.TELEGRAM_CHAT_ID = '-1002428157981';
      delete process.env.TELEGRAM_MESSAGE_THREAD_ID;

      const config = readTelegramEnv();
      assert.equal(config.botToken, '123456:ABC-DEF');
      assert.equal(config.chatId, '-1002428157981');
      assert.equal(config.messageThreadId, null);
      assert.equal(isTelegramConfigured(config), true);
    });

    test('parses null messageThreadId when TELEGRAM_MESSAGE_THREAD_ID is empty or whitespace or invalid', () => {
      process.env.TELEGRAM_BOT_TOKEN = '123456:ABC-DEF';
      process.env.TELEGRAM_CHAT_ID = '-1002428157981';
      process.env.TELEGRAM_MESSAGE_THREAD_ID = '   ';

      let config = readTelegramEnv();
      assert.equal(config.messageThreadId, null);

      process.env.TELEGRAM_MESSAGE_THREAD_ID = 'invalid-thread-id';
      config = readTelegramEnv();
      assert.equal(config.messageThreadId, null);
    });
  });

  describe('TelegramService', () => {
    test('sendNotification includes message_thread_id when configured', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test-token';
      process.env.TELEGRAM_CHAT_ID = '-1002428157981';
      process.env.TELEGRAM_MESSAGE_THREAD_ID = '3960';

      let sentPayload = null;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, options) => {
        if (url.includes('/sendMessage')) {
          sentPayload = JSON.parse(options.body);
          return {
            json: async () => ({ ok: true }),
          };
        }
        return { json: async () => ({ ok: true }) };
      };

      try {
        const mockPrisma = {
          notificationConfig: {
            upsert: async () => ({ telegramEnabled: true }),
          },
        };

        const service = new TelegramService(mockPrisma);
        const result = await service.sendNotification({
          title: 'Test Notification',
          lines: ['Line 1', 'Line 2'],
        });

        assert.equal(result, true);
        assert.ok(sentPayload);
        assert.equal(sentPayload.chat_id, '-1002428157981');
        assert.equal(sentPayload.message_thread_id, 3960);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('sendNotification omits message_thread_id when not configured', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test-token';
      process.env.TELEGRAM_CHAT_ID = '-1002428157981';
      delete process.env.TELEGRAM_MESSAGE_THREAD_ID;

      let sentPayload = null;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, options) => {
        if (url.includes('/sendMessage')) {
          sentPayload = JSON.parse(options.body);
          return {
            json: async () => ({ ok: true }),
          };
        }
        return { json: async () => ({ ok: true }) };
      };

      try {
        const mockPrisma = {
          notificationConfig: {
            upsert: async () => ({ telegramEnabled: true }),
          },
        };

        const service = new TelegramService(mockPrisma);
        const result = await service.sendNotification({
          title: 'Test Notification',
          lines: ['Line 1', 'Line 2'],
        });

        assert.equal(result, true);
        assert.ok(sentPayload);
        assert.equal(sentPayload.chat_id, '-1002428157981');
        assert.equal('message_thread_id' in sentPayload, false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('testConnection includes message_thread_id when configured', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test-token';
      process.env.TELEGRAM_CHAT_ID = '-1002428157981';
      process.env.TELEGRAM_MESSAGE_THREAD_ID = '3960';

      let sentPayload = null;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, options) => {
        if (url.includes('/getMe')) {
          return {
            json: async () => ({
              ok: true,
              result: { username: 'test_bot', first_name: 'Test Bot' },
            }),
          };
        }
        if (url.includes('/sendMessage')) {
          sentPayload = JSON.parse(options.body);
          return {
            json: async () => ({ ok: true }),
          };
        }
        return { json: async () => ({ ok: true }) };
      };

      try {
        const mockPrisma = {};
        const service = new TelegramService(mockPrisma);
        const result = await service.testConnection();

        assert.equal(result.success, true);
        assert.match(result.message, /topic 3960/);
        assert.ok(sentPayload);
        assert.equal(sentPayload.chat_id, '-1002428157981');
        assert.equal(sentPayload.message_thread_id, 3960);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('testConnection omits message_thread_id when not configured', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test-token';
      process.env.TELEGRAM_CHAT_ID = '-1002428157981';
      delete process.env.TELEGRAM_MESSAGE_THREAD_ID;

      let sentPayload = null;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, options) => {
        if (url.includes('/getMe')) {
          return {
            json: async () => ({
              ok: true,
              result: { username: 'test_bot', first_name: 'Test Bot' },
            }),
          };
        }
        if (url.includes('/sendMessage')) {
          sentPayload = JSON.parse(options.body);
          return {
            json: async () => ({ ok: true }),
          };
        }
        return { json: async () => ({ ok: true }) };
      };

      try {
        const mockPrisma = {};
        const service = new TelegramService(mockPrisma);
        const result = await service.testConnection();

        assert.equal(result.success, true);
        assert.doesNotMatch(result.message, /topic/);
        assert.ok(sentPayload);
        assert.equal(sentPayload.chat_id, '-1002428157981');
        assert.equal('message_thread_id' in sentPayload, false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
