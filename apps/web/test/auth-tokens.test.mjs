import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getJwtExpiryMs,
  getTimeUntilRefreshMs,
  isTokenExpiringSoon,
  parseJwtPayload,
} from '../lib/auth-tokens.ts';

function createMockToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.mockSignature`;
}

describe('auth-tokens JWT decoding & expiration calculations', () => {
  it('parses valid JWT payload correctly', () => {
    const token = createMockToken({
      sub: 'user-123',
      username: 'johndoe',
      role: 'ADMIN',
      exp: 1800000000,
    });

    const payload = parseJwtPayload(token);
    assert.ok(payload);
    assert.equal(payload.sub, 'user-123');
    assert.equal(payload.username, 'johndoe');
    assert.equal(payload.role, 'ADMIN');
    assert.equal(payload.exp, 1800000000);
  });

  it('returns null for malformed or empty tokens', () => {
    assert.equal(parseJwtPayload(''), null);
    assert.equal(parseJwtPayload('invalid-token-without-dots'), null);
    assert.equal(parseJwtPayload('a.not-valid-base64-json.sig'), null);
  });

  it('extracts token expiry in milliseconds', () => {
    const token = createMockToken({ exp: 1700000000 });
    assert.equal(getJwtExpiryMs(token), 1700000000000);
  });

  it('detects when token is expired or expiring within buffer', () => {
    const nowSec = 1700000000;
    const nowMs = nowSec * 1000;

    // Token expires in 30 seconds
    const expiringSoonToken = createMockToken({ exp: nowSec + 30 });
    assert.equal(isTokenExpiringSoon(expiringSoonToken, 60, nowMs), true);
    assert.equal(isTokenExpiringSoon(expiringSoonToken, 20, nowMs), false);

    // Token expired 10 seconds ago
    const expiredToken = createMockToken({ exp: nowSec - 10 });
    assert.equal(isTokenExpiringSoon(expiredToken, 60, nowMs), true);

    // Token valid for 1 hour
    const freshToken = createMockToken({ exp: nowSec + 3600 });
    assert.equal(isTokenExpiringSoon(freshToken, 60, nowMs), false);

    // Missing token
    assert.equal(isTokenExpiringSoon(null, 60, nowMs), true);
    assert.equal(isTokenExpiringSoon(undefined, 60, nowMs), true);
  });

  it('calculates remaining time until proactive refresh', () => {
    const nowSec = 1700000000;
    const nowMs = nowSec * 1000;

    // Token expires in 600 seconds (10 mins). With 60s buffer, refresh at 540 seconds (540,000ms).
    const token = createMockToken({ exp: nowSec + 600 });
    const delay = getTimeUntilRefreshMs(token, 60, 5000, nowMs);
    assert.equal(delay, 540000);

    // Token expires in 30 seconds (already within 60s buffer). Should return minDelayMs (5000ms).
    const urgentToken = createMockToken({ exp: nowSec + 30 });
    assert.equal(getTimeUntilRefreshMs(urgentToken, 60, 5000, nowMs), 5000);
  });
});
