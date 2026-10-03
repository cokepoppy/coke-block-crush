import test from 'node:test';
import assert from 'node:assert/strict';
import { boardFromRows, canPlace, createInitialState, createStudyState, fruitType, placePiece, restart, removeCell } from '../src/engine.js';

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

test('Level 4 study frame preserves the plum objective, chest progress, board, and tray', () => {
  const state = createInitialState(4);
  const encode = (cell) => {
    if (!cell) return '.';
    if (cell.fruit === 'plum') return cell.color === 'yellow' ? 'M' : 'm';
    if (cell.fruit === 'apple') return 'p';
    return cell.color[0].toUpperCase();
  };
  assert.deepEqual(state.objectives, [{ kind: 'plum', collected: 0, target: 2 }]);
  assert.equal(state.chestProgress, 947);
  assert.equal(state.chestTarget, 1500);
  assert.deepEqual(Array.from({ length: 8 }, (_, row) => state.board.slice(row * 8, row * 8 + 8).map(encode).join('')), [
    'M...Y...',
    '.M.GGY..',
    '..Ym..Y.',
    '...Y...Y',
    'Y..B....',
    '.Y.B.Y..',
    '..Y...Y.',
    '...Y...Y',
  ]);
  assert.deepEqual(state.tray.map(({ slot, color, name, cells }) => ({ slot, color, name, cells })), [
    { slot: 1, color: 'blue', name: 'bar', cells: [[0, 0], [1, 0], [2, 0]] },
  ]);
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
  assert.equal(original.board.filter((cell) => cell?.fruit === 'apple').length, 4);
  assert.equal(original.chestProgress, 2007);
  assert.deepEqual(original.board.slice(0, 8).map((cell) => cell?.fruit ?? null), ['pear', null, null, null, null, null, null, null]);
  assert.deepEqual(original.tray.map((piece) => ({ slot: piece.slot, color: piece.color, fruit: piece.fruit ?? null })), [
    { slot: 0, color: 'yellow', fruit: 'pear' },
    { slot: 2, color: 'yellow', fruit: null },
  ]);

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

test('Level 7 preserves the observed tray gaps until both visible pieces are used', () => {
  const original = createInitialState(7);
  const afterLeftPiece = placePiece(original, 1, 4, 0).state;
  assert.deepEqual(afterLeftPiece.tray.map((piece) => piece.slot), [2]);
  const afterRightPiece = placePiece(afterLeftPiece, 2, 0, 5).state;
  assert.deepEqual(afterRightPiece.tray.map((piece) => piece.slot), [0, 1, 2]);
  assert.deepEqual(afterRightPiece.tray.map((piece) => piece.id), [3, 4, 5]);
});

test('Level 7 pear-complete study frame matches the later WeChat sample', () => {
  const state = createStudyState(7, 'pear-complete');
  assert.deepEqual(state.objectives, [
    { kind: 'pear', collected: 2, target: 2 },
    { kind: 'apple', collected: 2, target: 3 },
  ]);
  assert.equal(state.chestProgress, 2275);
  assert.equal(state.chestTarget, 3000);
  assert.equal(state.board.filter((cell) => cell?.fruit === 'pear').length, 0);
  assert.equal(state.board.filter((cell) => cell?.fruit === 'apple').length, 2);
  assert.deepEqual(state.tray.map((piece) => ({ slot: piece.slot, color: piece.color, cells: piece.cells })), [
    { slot: 0, color: 'blue', cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  ]);
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
