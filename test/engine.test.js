import test from 'node:test';
import assert from 'node:assert/strict';
import { boardFromRows, canPlace, createInitialState, fruitType, placePiece, restart, removeCell } from '../src/engine.js';

test('reference opening has an 8x8 board with three apples', () => {
  const state = createInitialState();
  assert.equal(state.board.length, 64);
  assert.equal(state.board.filter((cell) => cell?.apple).length, 3);
  assert.equal(state.target, 3);
  assert.equal(state.tray.length, 1);
});

test('later generated levels contain enough of each fruit for their goals', () => {
  for (let level = 2; level <= 10; level += 1) {
    const state = createInitialState(level);
    for (const objective of state.objectives) {
      const boardFruit = state.board.filter((cell) => fruitType(cell) === objective.kind).length;
      const trayFruit = state.tray.reduce((total, piece) => total + piece.cells.filter((_, index) => {
        const kind = piece.fruitAt === index ? piece.fruit : piece.appleAt === index ? 'apple' : null;
        return kind === objective.kind;
      }).length, 0);
      assert.ok(boardFruit + trayFruit >= objective.target, `Level ${level} has ${boardFruit + trayFruit}/${objective.target} ${objective.kind}`);
    }
    assert.equal(state.movesLeft, null);
  }
});

test('Level 2 uses the avocado target shown in the WeChat gameplay clip', () => {
  const state = createInitialState(2);
  assert.deepEqual(state.objectives, [{ kind: 'avocado', collected: 0, target: 3 }]);
  assert.equal(state.tray[0].fruit, 'avocado');
  assert.equal(state.chestTarget, 500);
});

test('piece placement cannot overlap or leave the board', () => {
  const state = createInitialState();
  const piece = state.tray[0];
  assert.equal(canPlace(state.board, piece, 3, 2), false);
  assert.equal(canPlace(state.board, piece, -1, 0), false);
  assert.equal(canPlace(state.board, piece, 0, 0), true);
  assert.equal(placePiece(state, piece.id, 3, 2).state, state);
});

test('clear counts each apple once when row and column cross', () => {
  const rows = [
    'PPPPPPPA',
    'PPPPPPPG',
    'PPPPPPPG',
    'PPPPPPPG',
    'PPPPPPPG',
    'PPPPPPPG',
    'PPPPPPPG',
    'AAAAAAA.',
  ];
  const original = createInitialState();
  const state = {
    ...original,
    board: boardFromRows(rows),
    target: 10,
    objectives: [{ kind: 'apple', collected: 0, target: 10 }],
    tray: [{ id: 7, color: 'green', cells: [[0, 0]], appleAt: 0 }],
  };
  const result = placePiece(state, 7, 7, 7);
  assert.equal(result.events.find((event) => event.type === 'cleared').apples, 9);
  assert.equal(result.state.apples, 9);
  assert.equal(result.state.board.every((cell) => cell === null), true);
});

test('Level 7 collects pears and apples from the same cleared line', () => {
  const original = createInitialState(7);
  assert.deepEqual(original.objectives, [
    { kind: 'pear', collected: 0, target: 2 },
    { kind: 'apple', collected: 0, target: 3 },
  ]);
  assert.equal(original.board.filter((cell) => cell?.fruit === 'pear').length, 2);
  assert.equal(original.board.filter((cell) => cell?.fruit === 'apple').length, 3);

  const state = {
    ...original,
    board: boardFromRows([
      'QAA.....',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ]),
    tray: [{ id: 9, name: 'bar', color: 'blue', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] }],
  };
  const result = placePiece(state, 9, 3, 0);
  assert.deepEqual(result.state.objectives, [
    { kind: 'pear', collected: 1, target: 2 },
    { kind: 'apple', collected: 2, target: 3 },
  ]);
  assert.deepEqual(result.events.find((event) => event.type === 'cleared').fruits, { pear: 1, apple: 2 });
});

test('hammer collects an apple and restart discards old state', () => {
  const state = createInitialState();
  const hammered = removeCell(state, 2, 3).state;
  assert.equal(hammered.apples, 1);
  assert.equal(hammered.board[3 * 8 + 2], null);
  const reset = restart(hammered);
  assert.equal(reset.apples, 0);
  assert.equal(reset.board[3 * 8 + 2]?.apple, true);
  assert.equal(reset.chestProgress, hammered.chestProgress);
  assert.equal(reset.generation, state.generation + 1);
});
