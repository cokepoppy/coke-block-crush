export const BOARD_SIZE = 8;

const LEVEL_ONE = [
  '........',
  '........',
  '...GG...',
  '..APPGGG',
  'PPGPPA..',
  '...AG...',
  '........',
  '........',
];

const LEVEL_TWO = [
  'BB....BB',
  'BB....BB',
  '...YYY..',
  '..YPPY..',
  '..YVY...',
  '..YYY..V',
  'BB....BB',
  'BB....BB',
];

// Static Level 4 study frame transcribed from the user's WeChat recording.
const LEVEL_FOUR = [
  'M...Y...',
  '.M.GGY..',
  '..Ym..Y.',
  '...Y...Y',
  'Y..B....',
  '.Y.B.Y..',
  '..Y...Y.',
  '...Y...Y',
];

// Level 7 is transcribed from the visible WeChat frame sampled on 2026-10-03.
// It contains one more apple marker than the 0/3 objective needs, as shown.
const LEVEL_SEVEN = [
  'QP.....G',
  'YpPBb..G',
  '..QP...G',
  '...pP..G',
  '....PP..',
  '.....pP.',
  '......PP',
  '........',
];

// A later stable frame from the same WeChat clip, after the pear objective
// has completed and two of the three apples have been collected.
const LEVEL_SEVEN_PEAR_COMPLETE = [
  '........',
  '..B.BP..',
  '........',
  'G.GpP.GG',
  '..G.PPGG',
  '..GPPpP.',
  '......PP',
  '........',
];

const PIECE_POOL = [
  { name: 'single', color: 'green', cells: [[0, 0]] },
  { name: 'single', color: 'blue', cells: [[0, 0]] },
  { name: 'domino', color: 'pink', cells: [[0, 0], [1, 0]] },
  { name: 'domino', color: 'green', cells: [[0, 0], [1, 0]] },
  { name: 'domino', color: 'yellow', cells: [[0, 0], [1, 0]] },
  { name: 'bar', color: 'pink', cells: [[0, 0], [1, 0], [2, 0]] },
  { name: 'bar', color: 'green', cells: [[0, 0], [1, 0], [2, 0]] },
  { name: 'bar', color: 'blue', cells: [[0, 0], [0, 1], [0, 2]] },
  { name: 'corner', color: 'pink', cells: [[0, 0], [0, 1], [1, 1]] },
  { name: 'corner', color: 'green', cells: [[0, 0], [0, 1], [1, 1]] },
  { name: 'corner', color: 'blue', cells: [[0, 0], [1, 0], [0, 1]] },
  { name: 'square', color: 'green', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { name: 'L', color: 'green', cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
];

const cloneCell = (cell) => cell ? { ...cell } : null;
const nextRandom = (seed) => (Math.imul(seed, 1664525) + 1013904223) >>> 0;

export function boardFromRows(rows) {
  if (rows.length !== BOARD_SIZE || rows.some((row) => row.length !== BOARD_SIZE)) {
    throw new Error('A board must have eight rows of eight cells.');
  }
  return rows.flatMap((row) => [...row].map((symbol) => {
    if (symbol === '.') return null;
    if (symbol === 'P') return { color: 'pink', apple: false };
    if (symbol === 'G') return { color: 'green', apple: false };
    if (symbol === 'B') return { color: 'blue', apple: false };
    if (symbol === 'Y') return { color: 'yellow', apple: false };
    if (symbol === 'A') return { color: 'green', apple: true, fruit: 'apple' };
    if (symbol === 'p') return { color: 'pink', apple: true, fruit: 'apple' };
    if (symbol === 'b') return { color: 'blue', apple: true, fruit: 'apple' };
    if (symbol === 'Q') return { color: 'pink', apple: false, fruit: 'pear' };
    if (symbol === 'V') return { color: 'green', apple: false, fruit: 'avocado' };
    if (symbol === 'M') return { color: 'yellow', apple: false, fruit: 'plum' };
    if (symbol === 'm') return { color: 'green', apple: false, fruit: 'plum' };
    throw new Error(`Unknown board symbol: ${symbol}`);
  }));
}

export function fruitType(cell) {
  return cell?.fruit ?? (cell?.apple ? 'apple' : null);
}

function allObjectivesMet(state) {
  return (state.objectives ?? [{ kind: 'apple', collected: state.apples, target: state.target }])
    .every((objective) => objective.collected >= objective.target);
}

function collectFruits(state, fruitCells) {
  const collectedByKind = {};
  for (const item of fruitCells) collectedByKind[item.fruit] = (collectedByKind[item.fruit] ?? 0) + 1;
  const objectives = (state.objectives ?? [{ kind: 'apple', collected: state.apples, target: state.target }])
    .map((objective) => ({
      ...objective,
      collected: Math.min(objective.target, objective.collected + (collectedByKind[objective.kind] ?? 0)),
    }));
  return {
    objectives,
    apples: objectives.find((objective) => objective.kind === 'apple')?.collected ?? state.apples,
    collectedByKind,
  };
}

export function createInitialState(level = 1) {
  const board = boardFromRows(level === 7 ? LEVEL_SEVEN : level === 4 ? LEVEL_FOUR : level === 2 ? LEVEL_TWO : LEVEL_ONE);
  const target = level === 6 ? 4 : level === 4 ? 2 : 3;
  if (level > 1 && ![2, 4, 7].includes(level)) {
    let needed = Math.max(0, target - board.filter((cell) => cell?.apple).length);
    for (let offset = 0; offset < board.length && needed > 0; offset += 1) {
      const index = (level * 17 + offset * 13) % board.length;
      if (board[index] === null) {
        board[index] = { color: 'green', apple: true };
        needed -= 1;
      }
    }
  }
  const objectives = level === 7
    ? [{ kind: 'pear', collected: 0, target: 2 }, { kind: 'apple', collected: 0, target: 3 }]
    : [{ kind: level === 2 ? 'avocado' : level === 4 ? 'plum' : 'apple', collected: 0, target }];
  const starterPieces = level === 1
    ? [{ id: 1, name: 'single', color: 'green', cells: [[0, 0]], appleAt: 0 }]
    : level === 2
      ? [
        { id: 1, name: 'long bar', color: 'blue', cells: [[0, 0], [0, 1], [0, 2], [0, 3]], fruitAt: 2, fruit: 'avocado' },
        { id: 2, name: 'hook', color: 'blue', cells: [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]] },
        { id: 3, name: 'corner', color: 'yellow', cells: [[0, 0], [0, 1], [1, 1]] },
      ]
    : level === 4
      ? [{ id: 1, slot: 1, name: 'bar', color: 'blue', cells: [[0, 0], [1, 0], [2, 0]] }]
    : level === 7
      ? [
        { id: 1, slot: 0, name: 'single', color: 'yellow', cells: [[0, 0]], fruitAt: 0, fruit: 'pear' },
        { id: 2, slot: 2, name: 'single', color: 'yellow', cells: [[0, 0]] },
      ]
      : null;
  const seededTray = starterPieces ? null : refillTray((0xC0C0A + level) >>> 0, 1);
  const tray = starterPieces ?? seededTray.pieces;
  const chestTargets = { 1: 500, 2: 500, 3: 1500, 4: 1500, 5: 1500, 6: 3000, 7: 3000 };
  return {
    level,
    board,
    tray,
    nextPieceId: Math.max(...tray.map((piece) => piece.id)) + 1,
    seed: seededTray?.seed ?? (0xC0C0A + level) >>> 0,
    apples: 0,
    target,
    objectives,
    chestProgress: level === 1 ? 2 : level === 4 ? 947 : level === 7 ? 2007 : 2,
    chestTarget: chestTargets[level] ?? 500,
    score: 0,
    moves: 0,
    movesLeft: null,
    combo: 0,
    status: 'playing',
    generation: 0,
  };
}

export function createStudyState(level = 1, frame = 'opening') {
  const state = createInitialState(level);
  if (level !== 7 || frame !== 'pear-complete') return state;
  return {
    ...state,
    board: boardFromRows(LEVEL_SEVEN_PEAR_COMPLETE),
    tray: [{ id: 1, slot: 0, name: 'long bar', color: 'blue', cells: [[0, 0], [0, 1], [0, 2], [0, 3]] }],
    nextPieceId: 2,
    objectives: [
      { kind: 'pear', collected: 2, target: 2 },
      { kind: 'apple', collected: 2, target: 3 },
    ],
    apples: 2,
    chestProgress: 2275,
  };
}

export function pieceDimensions(piece) {
  return {
    width: Math.max(...piece.cells.map(([x]) => x)) + 1,
    height: Math.max(...piece.cells.map(([, y]) => y)) + 1,
  };
}

export function canPlace(board, piece, anchorX, anchorY) {
  return piece.cells.every(([dx, dy]) => {
    const x = anchorX + dx;
    const y = anchorY + dy;
    return x >= 0 && y >= 0 && x < BOARD_SIZE && y < BOARD_SIZE && !board[y * BOARD_SIZE + x];
  });
}

export function hasMove(board, pieces) {
  return pieces.some((piece) => {
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        if (canPlace(board, piece, x, y)) return true;
      }
    }
    return false;
  });
}

function refillTray(seed, nextPieceId) {
  const pieces = [];
  let currentSeed = seed;
  for (let i = 0; i < 3; i += 1) {
    currentSeed = nextRandom(currentSeed);
    const template = PIECE_POOL[currentSeed % PIECE_POOL.length];
    pieces.push({ ...template, id: nextPieceId + i, slot: i, cells: template.cells.map((cell) => [...cell]) });
  }
  return { pieces, seed: currentSeed, nextPieceId: nextPieceId + 3 };
}

export function placePiece(state, pieceId, anchorX, anchorY) {
  if (state.status !== 'playing') return { state, events: [{ type: 'ignored' }] };
  const piece = state.tray.find((item) => item.id === pieceId);
  if (!piece || !canPlace(state.board, piece, anchorX, anchorY)) {
    return { state, events: [{ type: 'invalid' }] };
  }

  const board = state.board.map(cloneCell);
  const placed = [];
  piece.cells.forEach(([dx, dy], index) => {
    const x = anchorX + dx;
    const y = anchorY + dy;
    const fruit = piece.fruitAt === index ? piece.fruit : piece.appleAt === index ? 'apple' : null;
    board[y * BOARD_SIZE + x] = { color: piece.color, apple: fruit === 'apple', ...(fruit ? { fruit } : {}) };
    placed.push({ x, y });
  });

  const fullRows = [];
  const fullColumns = [];
  for (let i = 0; i < BOARD_SIZE; i += 1) {
    if (Array.from({ length: BOARD_SIZE }, (_, x) => board[i * BOARD_SIZE + x]).every(Boolean)) fullRows.push(i);
    if (Array.from({ length: BOARD_SIZE }, (_, y) => board[y * BOARD_SIZE + i]).every(Boolean)) fullColumns.push(i);
  }
  const clearIndices = new Set();
  for (const y of fullRows) for (let x = 0; x < BOARD_SIZE; x += 1) clearIndices.add(y * BOARD_SIZE + x);
  for (const x of fullColumns) for (let y = 0; y < BOARD_SIZE; y += 1) clearIndices.add(y * BOARD_SIZE + x);
  const clearedCells = [...clearIndices].map((index) => ({ x: index % BOARD_SIZE, y: Math.floor(index / BOARD_SIZE), color: board[index]?.color, apple: Boolean(board[index]?.apple) }));
  const fruitCells = [];
  for (const index of clearIndices) {
    const fruit = fruitType(board[index]);
    if (fruit) fruitCells.push({ x: index % BOARD_SIZE, y: Math.floor(index / BOARD_SIZE), fruit });
    board[index] = null;
  }

  const fruitUpdate = collectFruits(state, fruitCells);

  let tray = state.tray.filter((item) => item.id !== pieceId);
  let seed = state.seed;
  let nextPieceId = state.nextPieceId;
  if (tray.length === 0) {
    const refill = refillTray(seed, nextPieceId);
    tray = refill.pieces;
    seed = refill.seed;
    nextPieceId = refill.nextPieceId;
  }

  const apples = fruitUpdate.apples;
  const combo = clearIndices.size ? state.combo + 1 : 0;
  const movesLeft = state.movesLeft === null ? null : Math.max(0, state.movesLeft - 1);
  const score = state.score + piece.cells.length * 10 + clearIndices.size * 20 + (fullRows.length + fullColumns.length > 1 ? 80 : 0) + (combo > 1 ? combo * 20 : 0);
  const status = fruitUpdate.objectives.every((objective) => objective.collected >= objective.target) ? 'won' : movesLeft === 0 || !hasMove(board, tray) ? 'lost' : 'playing';
  const nextState = {
    ...state,
    board,
    tray,
    seed,
    nextPieceId,
    apples,
    objectives: fruitUpdate.objectives,
    score,
    combo,
    movesLeft,
    chestProgress: Math.min(state.chestTarget, state.chestProgress + piece.cells.length + clearIndices.size),
    moves: state.moves + 1,
    status,
  };
  const events = [{ type: 'placed', cells: placed }];
  if (clearIndices.size) events.push({
    type: 'cleared', cells: clearedCells, rows: fullRows, columns: fullColumns,
    apples: fruitUpdate.collectedByKind.apple ?? 0,
    fruits: fruitUpdate.collectedByKind,
    fruitCells,
    appleCells: fruitCells.filter((item) => item.fruit === 'apple'),
    combo,
  });
  if (status === 'won') events.push({ type: 'won' });
  if (status === 'lost') events.push({ type: 'lost' });
  return { state: nextState, events };
}

export function removeCell(state, x, y) {
  if (state.status !== 'playing' || x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return { state, events: [{ type: 'invalid' }] };
  const index = y * BOARD_SIZE + x;
  if (!state.board[index]) return { state, events: [{ type: 'invalid' }] };
  const board = state.board.map(cloneCell);
  const fruit = fruitType(board[index]);
  board[index] = null;
  const fruitCells = fruit ? [{ x, y, fruit }] : [];
  const fruitUpdate = collectFruits(state, fruitCells);
  const status = fruitUpdate.objectives.every((objective) => objective.collected >= objective.target) ? 'won' : 'playing';
  return {
    state: { ...state, board, apples: fruitUpdate.apples, objectives: fruitUpdate.objectives, status },
    events: [{ type: 'hammer', cells: [{ x, y }], apples: fruit === 'apple' ? 1 : 0, fruits: fruitUpdate.collectedByKind, fruitCells }, ...(status === 'won' ? [{ type: 'won' }] : [])],
  };
}

export function removeColor(state, x, y) {
  if (state.status !== 'playing' || x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return { state, events: [{ type: 'invalid' }] };
  const target = state.board[y * BOARD_SIZE + x];
  if (!target) return { state, events: [{ type: 'invalid' }] };
  const board = state.board.map(cloneCell);
  const cells = [];
  const appleCells = [];
  board.forEach((cell, index) => {
    if (cell?.color !== target.color) return;
    const position = { x: index % BOARD_SIZE, y: Math.floor(index / BOARD_SIZE) };
    cells.push(position);
    const fruit = fruitType(cell);
    if (fruit) appleCells.push({ ...position, fruit });
    board[index] = null;
  });
  const fruitCells = appleCells;
  const fruitUpdate = collectFruits(state, fruitCells);
  const status = fruitUpdate.objectives.every((objective) => objective.collected >= objective.target) ? 'won' : 'playing';
  return {
    state: { ...state, board, apples: fruitUpdate.apples, objectives: fruitUpdate.objectives, status, score: state.score + cells.length * 20 },
    events: [{ type: 'rainbow', cells, apples: fruitUpdate.collectedByKind.apple ?? 0, fruits: fruitUpdate.collectedByKind, fruitCells }, ...(status === 'won' ? [{ type: 'won' }] : [])],
  };
}

export function shuffleTray(state) {
  if (state.status !== 'playing') return { state, events: [{ type: 'ignored' }] };
  const refill = refillTray(state.seed, state.nextPieceId);
  const status = hasMove(state.board, refill.pieces) ? 'playing' : 'lost';
  return { state: { ...state, tray: refill.pieces, seed: refill.seed, nextPieceId: refill.nextPieceId, status }, events: [{ type: 'shuffle' }, ...(status === 'lost' ? [{ type: 'lost' }] : [])] };
}

export function switchPieceColor(state, pieceId) {
  if (state.status !== 'playing') return { state, events: [{ type: 'ignored' }] };
  if (!state.tray.some((piece) => piece.id === pieceId)) return { state, events: [{ type: 'invalid' }] };
  const palette = ['green', 'pink', 'blue', 'yellow'];
  const tray = state.tray.map((piece) => {
    if (piece.id !== pieceId) return piece;
    return { ...piece, color: palette[(palette.indexOf(piece.color) + 1) % palette.length] };
  });
  return { state: { ...state, tray }, events: [{ type: 'switcher' }] };
}

export function restart(state) {
  return { ...createInitialState(state.level), chestProgress: state.chestProgress, generation: state.generation + 1 };
}

export function nextLevel(state) {
  const nextState = createInitialState(state.level + 1);
  return {
    ...nextState,
    chestProgress: Math.min(nextState.chestTarget, state.chestProgress),
    generation: state.generation + 1,
  };
}
