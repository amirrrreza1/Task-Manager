import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  backlogBoard,
  isBacklogColumn,
  workflowBoard,
} from '../lib/board-columns.ts';

describe('isBacklogColumn', () => {
  const columns = [
    { id: 'a', position: 0, isBacklog: true },
    { id: 'b', position: 1, isBacklog: false },
  ];

  it('uses isBacklog when present', () => {
    assert.equal(isBacklogColumn(columns[0], columns), true);
    assert.equal(isBacklogColumn(columns[1], columns), false);
  });

  it('falls back to the leftmost column', () => {
    const legacy = [
      { position: 0 },
      { position: 1 },
    ];
    assert.equal(isBacklogColumn(legacy[0], legacy), true);
    assert.equal(isBacklogColumn(legacy[1], legacy), false);
  });
});

describe('workflowBoard', () => {
  it('removes backlog columns from the board view', () => {
    const board = {
      settings: { id: 'default' },
      columns: [
        { id: 'backlog', position: 0, isBacklog: true, tasks: [], subtasks: [] },
        { id: 'ready', position: 1, isBacklog: false, tasks: [{ id: 't1' }], subtasks: [] },
      ],
    };
    const result = workflowBoard(board);
    assert.equal(result.columns.length, 1);
    assert.equal(result.columns[0].id, 'ready');
  });
});

describe('backlogBoard', () => {
  it('keeps only backlog columns', () => {
    const board = {
      settings: { id: 'default' },
      columns: [
        { id: 'backlog', position: 0, isBacklog: true, tasks: [{ id: 't1' }], subtasks: [] },
        { id: 'ready', position: 1, isBacklog: false, tasks: [], subtasks: [] },
      ],
    };
    const result = backlogBoard(board);
    assert.equal(result.columns.length, 1);
    assert.equal(result.columns[0].tasks.length, 1);
  });
});
