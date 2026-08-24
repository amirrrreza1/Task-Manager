import assert from 'node:assert/strict';
import { test, describe, beforeEach, afterEach } from 'node:test';
import {
  readTelegramEnv,
  isTelegramConfigured,
  maskProxyUrl,
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
    test('parses bot token, chat ID, thread ID, and proxy URL when all are present', () => {
      process.env.TELEGRAM_BOT_TOKEN = '123456:ABC-DEF';
      process.env.TELEGRAM_CHAT_ID = '-1002428157981';
      process.env.TELEGRAM_MESSAGE_THREAD_ID = '3960';
      process.env.TELEGRAM_PROXY_URL = 'socks5://127.0.0.1:1080';

      const config = readTelegramEnv();
      assert.equal(config.botToken, '123456:ABC-DEF');
      assert.equal(config.chatId, '-1002428157981');
      assert.equal(config.messageThreadId, 3960);
      assert.equal(config.proxyUrl, 'socks5://127.0.0.1:1080');
      assert.equal(isTelegramConfigured(config), true);
    });

    test('parses null proxyUrl when TELEGRAM_PROXY_URL is not set', () => {
      process.env.TELEGRAM_BOT_TOKEN = '123456:ABC-DEF';
      process.env.TELEGRAM_CHAT_ID = '-1002428157981';
      delete process.env.TELEGRAM_PROXY_URL;
      delete process.env.TELEGRAM_PROXY;

      const config = readTelegramEnv();
      assert.equal(config.proxyUrl, null);
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

  describe('maskProxyUrl', () => {
    test('masks password in proxy URL with credentials', () => {
      assert.equal(
        maskProxyUrl('http://myuser:secret123@proxy.example.com:8080'),
        'http://myuser:***@proxy.example.com:8080/',
      );
      assert.equal(
        maskProxyUrl('socks5://user:pass@127.0.0.1:1080'),
        'socks5://user:***@127.0.0.1:1080',
      );
    });

    test('leaves proxy URL without password unchanged', () => {
      assert.equal(maskProxyUrl('socks5://127.0.0.1:1080'), 'socks5://127.0.0.1:1080');
      assert.equal(maskProxyUrl(null), null);
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
        const mockPrisma = {
          notificationConfig: {
            upsert: async () => ({ telegramEnabled: true, telegramProxyUrl: null }),
          },
        };
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
        const mockPrisma = {
          notificationConfig: {
            upsert: async () => ({ telegramEnabled: true, telegramProxyUrl: null }),
          },
        };
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

    test('sendNotification uses proxy dispatcher when TELEGRAM_PROXY_URL is configured', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test-token';
      process.env.TELEGRAM_CHAT_ID = '-1002428157981';
      process.env.TELEGRAM_PROXY_URL = 'http://127.0.0.1:8080';

      let capturedOptions = null;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, options) => {
        if (url.includes('/sendMessage')) {
          capturedOptions = options;
          return {
            json: async () => ({ ok: true }),
          };
        }
        return { json: async () => ({ ok: true }) };
      };

      try {
        const mockPrisma = {
          notificationConfig: {
            upsert: async () => ({ telegramEnabled: true, telegramProxyUrl: null }),
          },
        };

        const service = new TelegramService(mockPrisma);
        const result = await service.sendNotification({
          title: 'Proxy Notification',
          lines: ['Line 1'],
        });

        assert.equal(result, true);
        assert.ok(capturedOptions);
        assert.ok(capturedOptions.dispatcher);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('sendNotification uses DB telegramProxyUrl over environment default', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test-token';
      process.env.TELEGRAM_CHAT_ID = '-1002428157981';
      process.env.TELEGRAM_PROXY_URL = 'http://env-proxy:8080';

      let capturedOptions = null;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, options) => {
        if (url.includes('/sendMessage')) {
          capturedOptions = options;
          return {
            json: async () => ({ ok: true }),
          };
        }
        return { json: async () => ({ ok: true }) };
      };

      try {
        const mockPrisma = {
          notificationConfig: {
            upsert: async () => ({
              telegramEnabled: true,
              telegramProxyUrl: 'socks5://127.0.0.1:1080',
            }),
          },
        };

        const service = new TelegramService(mockPrisma);
        const result = await service.sendNotification({
          title: 'DB Proxy Notification',
          lines: ['Line 1'],
        });

        assert.equal(result, true);
        assert.ok(capturedOptions);
        assert.ok(capturedOptions.dispatcher);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('sendNotification does not include dispatcher when proxy is not set in DB or env', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test-token';
      process.env.TELEGRAM_CHAT_ID = '-1002428157981';
      delete process.env.TELEGRAM_PROXY_URL;
      delete process.env.TELEGRAM_PROXY;

      let capturedOptions = null;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, options) => {
        if (url.includes('/sendMessage')) {
          capturedOptions = options;
          return {
            json: async () => ({ ok: true }),
          };
        }
        return { json: async () => ({ ok: true }) };
      };

      try {
        const mockPrisma = {
          notificationConfig: {
            upsert: async () => ({ telegramEnabled: true, telegramProxyUrl: null }),
          },
        };

        const service = new TelegramService(mockPrisma);
        const result = await service.sendNotification({
          title: 'Direct Notification',
          lines: ['Line 1'],
        });

        assert.equal(result, true);
        assert.ok(capturedOptions);
        assert.equal(capturedOptions.dispatcher, undefined);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('testConnection uses proxy dispatcher when TELEGRAM_PROXY_URL is configured', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test-token';
      process.env.TELEGRAM_CHAT_ID = '-1002428157981';
      process.env.TELEGRAM_PROXY_URL = 'socks5://127.0.0.1:1080';

      const capturedCalls = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, options) => {
        capturedCalls.push({ url, options });
        if (url.includes('/getMe')) {
          return {
            json: async () => ({
              ok: true,
              result: { username: 'proxy_bot', first_name: 'Proxy Bot' },
            }),
          };
        }
        if (url.includes('/sendMessage')) {
          return {
            json: async () => ({ ok: true }),
          };
        }
        return { json: async () => ({ ok: true }) };
      };

      try {
        const mockPrisma = {
          notificationConfig: {
            upsert: async () => ({ telegramEnabled: true, telegramProxyUrl: null }),
          },
        };
        const service = new TelegramService(mockPrisma);
        const result = await service.testConnection();

        assert.equal(result.success, true);
        assert.equal(capturedCalls.length, 2);
        assert.ok(capturedCalls[0].options.dispatcher);
        assert.ok(capturedCalls[1].options.dispatcher);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
