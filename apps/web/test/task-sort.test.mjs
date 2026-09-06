import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BOARD_SORT_OPTIONS,
  applyBoardSort,
  compareWorkItems,
  isValidBoardSortOption,
  sortSubtasks,
  sortTasks,
} from '../lib/task-sort.ts';

describe('isValidBoardSortOption', () => {
  it('recognizes valid sort options', () => {
    assert.equal(isValidBoardSortOption(''), true);
    for (const option of BOARD_SORT_OPTIONS) {
      assert.equal(isValidBoardSortOption(option.value), true);
    }
  });

  it('rejects invalid sort options', () => {
    assert.equal(isValidBoardSortOption('invalid'), false);
    assert.equal(isValidBoardSortOption(123), false);
    assert.equal(isValidBoardSortOption(null), false);
  });
});

describe('compareWorkItems and sortTasks', () => {
  const sampleTasks = [
    {
      id: '1',
      title: 'Beta task',
      priority: 'LOW',
      estimateValue: 5,
      createdAt: '2026-01-01T10:00:00Z',
      updatedAt: '2026-01-05T10:00:00Z',
    },
    {
      id: '2',
      title: 'Alpha task',
      priority: 'URGENT',
      estimateValue: 2,
      createdAt: '2026-01-03T10:00:00Z',
      updatedAt: '2026-01-02T10:00:00Z',
    },
    {
      id: '3',
      title: 'Gamma task',
      priority: 'MEDIUM',
      estimateValue: null,
      createdAt: '2026-01-02T10:00:00Z',
      updatedAt: '2026-01-04T10:00:00Z',
    },
    {
      id: '4',
      title: 'Delta task',
      priority: 'HIGH',
      estimateValue: 13,
      createdAt: '2026-01-04T10:00:00Z',
      updatedAt: '2026-01-03T10:00:00Z',
    },
  ];

  it('preserves order when sort option is empty (default)', () => {
    const sorted = sortTasks(sampleTasks, '');
    assert.deepEqual(
      sorted.map((t) => t.id),
      ['1', '2', '3', '4'],
    );
  });

  it('sorts by priority descending (urgent first: URGENT > HIGH > MEDIUM > LOW)', () => {
    const sorted = sortTasks(sampleTasks, 'priority-desc');
    assert.deepEqual(
      sorted.map((t) => t.id),
      ['2', '4', '3', '1'],
    );
  });

  it('sorts by priority ascending (low first: LOW > MEDIUM > HIGH > URGENT)', () => {
    const sorted = sortTasks(sampleTasks, 'priority-asc');
    assert.deepEqual(
      sorted.map((t) => t.id),
      ['1', '3', '4', '2'],
    );
  });

  it('sorts by estimate descending with nulls placed at the bottom', () => {
    const sorted = sortTasks(sampleTasks, 'estimate-desc');
    assert.deepEqual(
      sorted.map((t) => t.id),
      ['4', '1', '2', '3'],
    );
  });

  it('sorts by estimate ascending with nulls placed at the bottom', () => {
    const sorted = sortTasks(sampleTasks, 'estimate-asc');
    assert.deepEqual(
      sorted.map((t) => t.id),
      ['2', '1', '4', '3'],
    );
  });

  it('sorts by title A to Z', () => {
    const sorted = sortTasks(sampleTasks, 'title-asc');
    assert.deepEqual(
      sorted.map((t) => t.id),
      ['2', '1', '4', '3'],
    );
  });

  it('sorts by title Z to A', () => {
    const sorted = sortTasks(sampleTasks, 'title-desc');
    assert.deepEqual(
      sorted.map((t) => t.id),
      ['3', '4', '1', '2'],
    );
  });

  it('sorts by created date newest first', () => {
    const sorted = sortTasks(sampleTasks, 'created-desc');
    assert.deepEqual(
      sorted.map((t) => t.id),
      ['4', '2', '3', '1'],
    );
  });

  it('sorts by created date oldest first', () => {
    const sorted = sortTasks(sampleTasks, 'created-asc');
    assert.deepEqual(
      sorted.map((t) => t.id),
      ['1', '3', '2', '4'],
    );
  });

  it('sorts by updated date recently updated first', () => {
    const sorted = sortTasks(sampleTasks, 'updated-desc');
    assert.deepEqual(
      sorted.map((t) => t.id),
      ['1', '3', '4', '2'],
    );
  });

  it('directly compares work items using compareWorkItems', () => {
    const itemA = sampleTasks[0];
    const itemB = sampleTasks[1];
    assert.ok(compareWorkItems(itemA, itemB, 'priority-desc') > 0);
    assert.ok(compareWorkItems(itemB, itemA, 'priority-desc') < 0);
  });

  it('sorts subtasks with sortSubtasks', () => {
    const subtasks = [
      { id: 's1', title: 'B', priority: 'LOW', estimateValue: null, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      { id: 's2', title: 'A', priority: 'HIGH', estimateValue: null, createdAt: '2026-01-02', updatedAt: '2026-01-02' },
    ];
    const sorted = sortSubtasks(subtasks, 'title-asc');
    assert.equal(sorted[0].id, 's2');
    assert.equal(sorted[1].id, 's1');
  });
});

describe('applyBoardSort', () => {
  const board = {
    settings: { id: 'default' },
    columns: [
      {
        id: 'col-todo',
        position: 0,
        tasks: [
          { id: 't1', title: 'Task Low', priority: 'LOW', estimateValue: 8, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
          { id: 't2', title: 'Task Urgent', priority: 'URGENT', estimateValue: 2, createdAt: '2026-01-02', updatedAt: '2026-01-02' },
        ],
        subtasks: [
          { id: 's1', title: 'Subtask Low', priority: 'LOW', estimateValue: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
          { id: 's2', title: 'Subtask High', priority: 'HIGH', estimateValue: 5, createdAt: '2026-01-02', updatedAt: '2026-01-02' },
        ],
      },
    ],
  };

  it('returns original board unchanged when sortBy is empty', () => {
    const result = applyBoardSort(board, '');
    assert.equal(result, board);
  });

  it('returns null if board is null', () => {
    assert.equal(applyBoardSort(null, 'priority-desc'), null);
  });

  it('sorts tasks and standalone subtasks inside columns when sort option is provided', () => {
    const result = applyBoardSort(board, 'priority-desc');
    assert.notEqual(result, board);
    assert.deepEqual(
      result.columns[0].tasks.map((t) => t.id),
      ['t2', 't1'],
    );
    assert.deepEqual(
      result.columns[0].subtasks.map((s) => s.id),
      ['s2', 's1'],
    );
  });
});
