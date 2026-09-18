import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import authControllerModule from '../dist/auth/auth.controller.js';

const { AuthController } = authControllerModule;

function createController(corsOrigin) {
  const mockConfig = {
    getOrThrow: (key) => {
      if (key === 'CORS_ORIGIN') return corsOrigin;
      throw new Error(`Unexpected key: ${key}`);
    },
    get: () => undefined,
  };
  const mockAuth = {
    refresh: async () => ({ accessToken: 'test-token', user: {} }),
  };
  return new AuthController(mockAuth, mockConfig);
}

describe('AuthController assertAllowedOrigin normalization', () => {
  it('allows exact match origin', async () => {
    const controller = createController('https://tasks.example.com');
    const req = { headers: { origin: 'https://tasks.example.com' }, cookies: {} };
    const res = { cookie: () => {} };

    await assert.doesNotReject(async () => {
      await controller.refresh(req, res);
    });
  });

  it('normalizes trailing slashes in CORS_ORIGIN and request origin', async () => {
    const controller = createController('https://tasks.example.com/');
    const req = { headers: { origin: 'https://tasks.example.com' }, cookies: {} };
    const res = { cookie: () => {} };

    await assert.doesNotReject(async () => {
      await controller.refresh(req, res);
    });
  });

  it('strips quotes from CORS_ORIGIN env values', async () => {
    const controller = createController('"https://tasks.example.com"');
    const req = { headers: { origin: 'https://tasks.example.com' }, cookies: {} };
    const res = { cookie: () => {} };

    await assert.doesNotReject(async () => {
      await controller.refresh(req, res);
    });
  });

  it('allows matched origin from comma-separated list', async () => {
    const controller = createController('http://localhost:3000, https://tasks.example.com');
    const req = { headers: { origin: 'https://tasks.example.com' }, cookies: {} };
    const res = { cookie: () => {} };

    await assert.doesNotReject(async () => {
      await controller.refresh(req, res);
    });
  });

  it('rejects origin not in allowed list', async () => {
    const controller = createController('https://tasks.example.com');
    const req = { headers: { origin: 'https://malicious-site.com' }, cookies: {} };
    const res = { cookie: () => {} };

    await assert.rejects(async () => {
      await controller.refresh(req, res);
    }, /The request origin is not allowed/);
  });

  it('allows request when origin header is absent', async () => {
    const controller = createController('https://tasks.example.com');
    const req = { headers: {}, cookies: {} };
    const res = { cookie: () => {} };

    await assert.doesNotReject(async () => {
      await controller.refresh(req, res);
    });
  });
});
