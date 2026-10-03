import test from 'node:test';
import assert from 'node:assert/strict';
import { boardFromRows, canPlace, createInitialState, placePiece, restart, removeCell } from '../src/engine.js';

test('reference opening has an 8x8 board with three apples', () => {
  const state = createInitialState();
  assert.equal(state.board.length, 64);
  assert.equal(state.board.filter((cell) => cell?.apple).length, 3);
  assert.equal(state.target, 3);
  assert.equal(state.tray.length, 1);
});

test('later generated levels contain enough apples for their goals', () => {
  for (let level = 2; level <= 10; level += 1) {
    const state = createInitialState(level);
    const applesAvailable = state.board.filter((cell) => cell?.apple).length + state.tray.filter((piece) => piece.appleAt !== undefined).length;
    assert.ok(applesAvailable >= state.target, `Level ${level} has ${applesAvailable}/${state.target} apples`);
    assert.equal(state.movesLeft, 40);
  }
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
  const state = { ...original, board: boardFromRows(rows), target: 10, tray: [{ id: 7, color: 'green', cells: [[0, 0]], appleAt: 0 }] };
  const result = placePiece(state, 7, 7, 7);
  assert.equal(result.events.find((event) => event.type === 'cleared').apples, 9);
  assert.equal(result.state.apples, 9);
  assert.equal(result.state.board.every((cell) => cell === null), true);
});

test('hammer collects an apple and restart discards old state', () => {
  const state = createInitialState();
  const hammered = removeCell(state, 2, 3).state;
  assert.equal(hammered.apples, 1);
  assert.equal(hammered.board[3 * 8 + 2], null);
  const reset = restart(hammered);
  assert.equal(reset.apples, 0);
  assert.equal(reset.board[3 * 8 + 2]?.apple, true);
  assert.equal(reset.generation, state.generation + 1);
});
