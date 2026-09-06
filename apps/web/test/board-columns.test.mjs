import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  backlogBoard,
  isBacklogColumn,
  placeSubtaskOnColumn,
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
    const legacy = [{ position: 0 }, { position: 1 }];
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

  it('deduplicates tasks if the same task appears in multiple columns', () => {
    const board = {
      settings: { id: 'default' },
      columns: [
        {
          id: 'col-1',
          position: 1,
          isBacklog: false,
          tasks: [{ id: 'task-1', title: 'Task 1' }],
          subtasks: [],
        },
        {
          id: 'col-2',
          position: 2,
          isBacklog: false,
          tasks: [
            { id: 'task-1', title: 'Task 1' },
            { id: 'task-2', title: 'Task 2' },
          ],
          subtasks: [],
        },
      ],
    };
    const result = workflowBoard(board);
    assert.equal(result.columns[0].tasks.length, 1);
    assert.equal(result.columns[0].tasks[0].id, 'task-1');
    assert.equal(result.columns[1].tasks.length, 1);
    assert.equal(result.columns[1].tasks[0].id, 'task-2');
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

  it('deduplicates tasks within backlog columns', () => {
    const board = {
      settings: { id: 'default' },
      columns: [
        {
          id: 'backlog',
          position: 0,
          isBacklog: true,
          tasks: [{ id: 't1' }, { id: 't1' }],
          subtasks: [],
        },
      ],
    };
    const result = backlogBoard(board);
    assert.equal(result.columns.length, 1);
  });
});

describe('placeSubtaskOnColumn', () => {
  const initialBoard = {
    settings: { id: 'default' },
    columns: [
      {
        id: 'col-todo',
        name: 'To Do',
        position: 0,
        tasks: [
          {
            id: 'task-1',
            title: 'Main Task',
            columnId: 'col-todo',
            subtasks: [
              {
                id: 'subtask-1',
                taskId: 'task-1',
                columnId: 'col-todo',
                title: 'Subtask 1',
              },
            ],
          },
        ],
        subtasks: [],
      },
      {
        id: 'col-progress',
        name: 'In Progress',
        position: 1,
        tasks: [],
        subtasks: [],
      },
    ],
  };

  it('moves a nested subtask to another column as a standalone subtask', () => {
    const moved = placeSubtaskOnColumn(initialBoard, 'subtask-1', 'col-progress');
    // Removed from task's subtasks in col-todo
    assert.equal(moved.columns[0].tasks[0].subtasks.length, 0);
    // Added as standalone in col-progress
    assert.equal(moved.columns[1].subtasks.length, 1);
    assert.equal(moved.columns[1].subtasks[0].id, 'subtask-1');
    assert.equal(moved.columns[1].subtasks[0].columnId, 'col-progress');
    assert.equal(moved.columns[1].subtasks[0].parentTask.id, 'task-1');
  });

  it('moves a standalone subtask back under its task when returned to parent column', () => {
    const standaloneBoard = placeSubtaskOnColumn(initialBoard, 'subtask-1', 'col-progress');
    assert.equal(standaloneBoard.columns[1].subtasks.length, 1);

    const restored = placeSubtaskOnColumn(standaloneBoard, 'subtask-1', 'col-todo');
    // Standalone subtasks in col-progress should now be empty
    assert.equal(restored.columns[1].subtasks.length, 0);
    // Placed back inside task.subtasks in col-todo
    assert.equal(restored.columns[0].tasks[0].subtasks.length, 1);
    assert.equal(restored.columns[0].tasks[0].subtasks[0].id, 'subtask-1');
    assert.equal(restored.columns[0].tasks[0].subtasks[0].columnId, 'col-todo');
  });
});
