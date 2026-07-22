import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import healthControllerModule from '../dist/health/health.controller.js';

const { HealthController } = healthControllerModule;

describe('HealthController', () => {
  it('reports a healthy database connection', async () => {
    const prisma = { $queryRaw: async () => [{ '?column?': 1 }] };
    const controller = new HealthController(prisma);

    const result = await controller.getHealth();

    assert.equal(result.status, 'ok');
    assert.equal(result.database, 'connected');
    assert.match(result.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  });
});
