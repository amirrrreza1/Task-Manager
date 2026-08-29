import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthService } from '../dist/auth/auth.service.js';

function createMockConfig() {
  return {
    getOrThrow: (key) => {
      if (key === 'JWT_SECRET') return 'test-secret-at-least-32-characters-long';
      if (key === 'JWT_EXPIRES_IN') return '1d';
      throw new Error(`Unexpected config key: ${key}`);
    },
    get: (key, defaultValue) => {
      if (key === 'REFRESH_TOKEN_DAYS') return 30;
      return defaultValue;
    },
  };
}

function createMockJwt() {
  return {
    signAsync: async (payload) => `mock-token.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`,
  };
}

describe('AuthService refresh token rotation and grace period', () => {
  it('rotates a valid refresh token and issues a new access token', async () => {
    const user = {
      id: 'user-1',
      username: 'alex',
      displayName: 'Alex Smith',
      color: '#4F46E5',
      role: 'MEMBER',
      hasAvatar: false,
      isBootstrapAdmin: false,
      isActive: true,
    };

    const initialSession = {
      id: 'session-1',
      tokenHash: 'b5bb9d8014a0f9b1d61e21e796d78dccdf1352f23cd32812f4850b878ae4944c',
      familyId: 'family-1',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      revokedAt: null,
      user,
    };

    let createdData = null;
    const mockPrisma = {
      refreshSession: {
        findUnique: async () => initialSession,
        updateMany: async () => ({ count: 1 }),
        create: async ({ data }) => {
          createdData = data;
          return data;
        },
      },
      $transaction: async (callback) =>
        callback({
          refreshSession: {
            updateMany: async () => ({ count: 1 }),
            create: async ({ data }) => {
              createdData = data;
              return data;
            },
          },
        }),
    };

    const authService = new AuthService(
      mockPrisma,
      createMockJwt(),
      createMockConfig(),
      {},
    );

    // Provide any raw token
    const result = await authService.refresh('some-valid-token');
    assert.ok(result.accessToken);
    assert.ok(result.refreshToken);
    assert.equal(result.user.id, 'user-1');
    assert.ok(createdData);
    assert.equal(createdData.familyId, 'family-1');
  });

  it('serves concurrent refresh requests within the grace period without revoking family', async () => {
    const user = {
      id: 'user-1',
      username: 'alex',
      displayName: 'Alex Smith',
      color: '#4F46E5',
      role: 'MEMBER',
      hasAvatar: false,
      isBootstrapAdmin: false,
      isActive: true,
    };

    // Session was revoked 5 seconds ago (within the 30-second grace window)
    const recentlyRevokedSession = {
      id: 'session-old',
      tokenHash: 'some-hash',
      familyId: 'family-1',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      revokedAt: new Date(Date.now() - 5000),
      user,
    };

    const activeSession = {
      id: 'session-new',
      tokenHash: 'new-hash',
      familyId: 'family-1',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      revokedAt: null,
      user,
    };

    let familyRevoked = false;
    let newSessionCreated = false;
    const mockPrisma = {
      refreshSession: {
        findUnique: async () => recentlyRevokedSession,
        findFirst: async () => activeSession,
        updateMany: async () => {
          familyRevoked = true;
          return { count: 1 };
        },
      },
      $transaction: async (callback) =>
        callback({
          refreshSession: {
            updateMany: async () => ({ count: 1 }),
            create: async ({ data }) => {
              newSessionCreated = true;
              return data;
            },
          },
        }),
    };

    const authService = new AuthService(
      mockPrisma,
      createMockJwt(),
      createMockConfig(),
      {},
    );

    const result = await authService.refresh('old-raw-token');
    assert.ok(result.accessToken);
    assert.ok(result.refreshToken);
    assert.equal(result.user.id, 'user-1');
    assert.equal(familyRevoked, false, 'Session family should NOT be revoked during grace period');
    assert.equal(newSessionCreated, true, 'New refresh session should be created during grace period');
  });

  it('detects token reuse and revokes entire family when outside grace period', async () => {
    const user = {
      id: 'user-1',
      username: 'alex',
      displayName: 'Alex Smith',
      color: '#4F46E5',
      role: 'MEMBER',
      hasAvatar: false,
      isBootstrapAdmin: false,
      isActive: true,
    };

    // Session was revoked 2 minutes ago (beyond 30s grace window)
    const oldRevokedSession = {
      id: 'session-old',
      tokenHash: 'some-hash',
      familyId: 'family-1',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      revokedAt: new Date(Date.now() - 120_000),
      user,
    };

    let familyRevoked = false;
    const mockPrisma = {
      refreshSession: {
        findUnique: async () => oldRevokedSession,
        updateMany: async ({ where }) => {
          if (where.familyId === 'family-1') {
            familyRevoked = true;
          }
          return { count: 1 };
        },
      },
    };

    const authService = new AuthService(
      mockPrisma,
      createMockJwt(),
      createMockConfig(),
      {},
    );

    await assert.rejects(
      () => authService.refresh('reused-old-token'),
      /Refresh token reuse was detected/,
    );
    assert.equal(familyRevoked, true, 'Entire family should be revoked upon reuse');
  });

  it('rejects expired refresh sessions', async () => {
    const user = { id: 'user-1', username: 'alex', isActive: true };
    const expiredSession = {
      id: 'session-expired',
      tokenHash: 'some-hash',
      familyId: 'family-1',
      userId: 'user-1',
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
      user,
    };

    const mockPrisma = {
      refreshSession: {
        findUnique: async () => expiredSession,
        updateMany: async () => ({ count: 1 }),
      },
    };

    const authService = new AuthService(
      mockPrisma,
      createMockJwt(),
      createMockConfig(),
      {},
    );

    await assert.rejects(
      () => authService.refresh('expired-token'),
      /The refresh session has expired/,
    );
  });
});
