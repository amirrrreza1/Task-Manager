import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { taskDropIndex } from '../lib/board-dnd.ts';

describe('taskDropIndex', () => {
  it('places a dragged task before the task under its upper half', () => {
    assert.equal(
      taskDropIndex({
        taskIds: ['one', 'two', 'three'],
        activeTaskId: 'dragged',
        overTaskId: 'two',
        activeCenterY: 130,
        overCenterY: 140,
      }),
      1,
    );
  });

  it('places a dragged task after the task under its lower half', () => {
    assert.equal(
      taskDropIndex({
        taskIds: ['one', 'two', 'three'],
        activeTaskId: 'dragged',
        overTaskId: 'two',
        activeCenterY: 151,
        overCenterY: 140,
      }),
      2,
    );
  });

  it('uses the end of the column when hovering empty column space', () => {
    assert.equal(taskDropIndex({ taskIds: ['one', 'two'], activeTaskId: 'dragged' }), 2);
  });

  it('uses the pointer position across every visible task instead of defaulting to the bottom', () => {
    const taskRects = [
      { taskId: 'one', top: 100, height: 148 },
      { taskId: 'dragged', top: 258, height: 148 },
      { taskId: 'three', top: 416, height: 148 },
    ];

    assert.equal(
      taskDropIndex({
        taskIds: ['one', 'dragged', 'three'],
        activeTaskId: 'dragged',
        pointerY: 90,
        taskRects,
      }),
      0,
    );
    assert.equal(
      taskDropIndex({
        taskIds: ['one', 'dragged', 'three'],
        activeTaskId: 'dragged',
        pointerY: 380,
        taskRects,
      }),
      1,
    );
    assert.equal(
      taskDropIndex({
        taskIds: ['one', 'dragged', 'three'],
        activeTaskId: 'dragged',
        pointerY: 600,
        taskRects,
      }),
      2,
    );
  });

  it('reorders within the same column without treating the dragged task as a neighbor', () => {
    assert.equal(
      taskDropIndex({
        taskIds: ['one', 'dragged', 'three'],
        activeTaskId: 'dragged',
        overTaskId: 'three',
        activeCenterY: 220,
        overCenterY: 200,
      }),
      2,
    );
    assert.equal(
      taskDropIndex({
        taskIds: ['one', 'dragged', 'three'],
        activeTaskId: 'dragged',
        overTaskId: 'one',
        activeCenterY: 40,
        overCenterY: 60,
      }),
      0,
    );
  });
});
