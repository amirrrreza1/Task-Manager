import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import { SprintsController } from '../dist/sprints/sprints.controller.js';
import { CreateSprintDto } from '../dist/sprints/dto/create-sprint.dto.js';

describe('SprintsController create sprint validation', () => {
  it('preserves CreateSprintDto as design:paramtypes metadata on create', () => {
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      SprintsController.prototype,
      'create',
    );
    assert.ok(paramTypes, 'Metadata design:paramtypes should exist');
    assert.equal(paramTypes[0], CreateSprintDto);
  });

  it('accepts valid sprint payload with goal and workspaceId through ValidationPipe', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      SprintsController.prototype,
      'create',
    );
    const transformed = await pipe.transform(
      {
        name: 'Sprint 1',
        goal: 'Complete milestone 1',
        workspaceId: '11111111-1111-4111-8111-111111111111',
      },
      {
        type: 'body',
        metatype: paramTypes[0],
      },
    );

    assert.equal(transformed.name, 'Sprint 1');
    assert.equal(transformed.goal, 'Complete milestone 1');
    assert.equal(transformed.workspaceId, '11111111-1111-4111-8111-111111111111');
  });
});
