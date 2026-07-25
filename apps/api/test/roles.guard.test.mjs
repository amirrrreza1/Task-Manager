import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import rolesGuardModule from '../dist/auth/guards/roles.guard.js';

const { RolesGuard } = rolesGuardModule;

function contextFor(role) {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  };
}

describe('RolesGuard authorization matrix', () => {
  it('allows an administrator through an admin-only route', () => {
    const guard = new RolesGuard({ getAllAndOverride: () => ['ADMIN'] });
    assert.equal(guard.canActivate(contextFor('ADMIN')), true);
  });

  it('rejects a member from an admin-only route', () => {
    const guard = new RolesGuard({ getAllAndOverride: () => ['ADMIN'] });
    assert.throws(() => guard.canActivate(contextFor('MEMBER')), /permission/i);
  });

  it('allows either role when a route has no role restriction', () => {
    const guard = new RolesGuard({ getAllAndOverride: () => undefined });
    assert.equal(guard.canActivate(contextFor('MEMBER')), true);
  });
});
