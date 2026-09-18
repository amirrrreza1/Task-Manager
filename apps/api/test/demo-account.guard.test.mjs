import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import guardModule from '../dist/auth/guards/demo-account.guard.js';

const { DemoAccountGuard } = guardModule;

function contextFor({ method = 'GET', isDemoAccount = true } = {}) {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => ({ method, user: { isDemoAccount } }),
    }),
  };
}

describe('DemoAccountGuard', () => {
  it('allows read-only requests from a demo administrator', () => {
    const guard = new DemoAccountGuard({ getAllAndOverride: () => undefined });
    assert.equal(guard.canActivate(contextFor({ method: 'GET' })), true);
  });

  it('blocks state-changing requests by default with a stable error code', () => {
    const guard = new DemoAccountGuard({ getAllAndOverride: () => undefined });
    assert.throws(
      () => guard.canActivate(contextFor({ method: 'PATCH' })),
      (error) => error.getResponse().code === 'DEMO_RESTRICTED',
    );
  });

  it('allows explicitly whitelisted demo mutations', () => {
    const guard = new DemoAccountGuard({
      getAllAndOverride: (key) => key === 'demoWritable',
    });
    assert.equal(guard.canActivate(contextFor({ method: 'POST' })), true);
  });

  it('blocks explicitly restricted downloads', () => {
    const guard = new DemoAccountGuard({
      getAllAndOverride: (key) => key === 'demoRestricted',
    });
    assert.throws(() => guard.canActivate(contextFor({ method: 'GET' })), /public demo/i);
  });

  it('does not affect normal accounts', () => {
    const guard = new DemoAccountGuard({ getAllAndOverride: () => true });
    assert.equal(guard.canActivate(contextFor({ method: 'DELETE', isDemoAccount: false })), true);
  });
});
