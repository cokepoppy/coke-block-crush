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

const PIECE_POOL = [
  { name: 'single', color: 'green', cells: [[0, 0]] },
  { name: 'domino', color: 'pink', cells: [[0, 0], [1, 0]] },
  { name: 'domino', color: 'green', cells: [[0, 0], [1, 0]] },
  { name: 'bar', color: 'pink', cells: [[0, 0], [1, 0], [2, 0]] },
  { name: 'bar', color: 'green', cells: [[0, 0], [1, 0], [2, 0]] },
  { name: 'corner', color: 'pink', cells: [[0, 0], [0, 1], [1, 1]] },
  { name: 'corner', color: 'green', cells: [[0, 0], [0, 1], [1, 1]] },
  { name: 'square', color: 'green', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
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
    if (symbol === 'A') return { color: 'green', apple: true };
    throw new Error(`Unknown board symbol: ${symbol}`);
  }));
}

export function createInitialState(level = 1) {
  const board = boardFromRows(LEVEL_ONE);
  const target = level === 1 ? 3 : Math.min(3 + level, 8);
  if (level > 1) {
    let needed = Math.max(0, target - 1 - board.filter((cell) => cell?.apple).length);
    for (let offset = 0; offset < board.length && needed > 0; offset += 1) {
      const index = (level * 17 + offset * 13) % board.length;
      if (board[index] === null) {
        board[index] = { color: 'green', apple: true };
        needed -= 1;
      }
    }
  }
  return {
    level,
    board,
    tray: [{ id: 1, name: 'single', color: 'green', cells: [[0, 0]], appleAt: 0 }],
    nextPieceId: 2,
    seed: (0xC0C0A + level) >>> 0,
    apples: 0,
    target,
    chestProgress: 2,
    score: 0,
    moves: 0,
    movesLeft: level === 1 ? null : 40,
    combo: 0,
    status: 'playing',
    generation: 0,
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
    pieces.push({ ...template, id: nextPieceId + i, cells: template.cells.map((cell) => [...cell]) });
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
    board[y * BOARD_SIZE + x] = { color: piece.color, apple: piece.appleAt === index };
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
  let collected = 0;
  const appleCells = [];
  for (const index of clearIndices) {
    if (board[index]?.apple) {
      collected += 1;
      appleCells.push({ x: index % BOARD_SIZE, y: Math.floor(index / BOARD_SIZE) });
    }
    board[index] = null;
  }

  let tray = state.tray.filter((item) => item.id !== pieceId);
  let seed = state.seed;
  let nextPieceId = state.nextPieceId;
  if (tray.length === 0) {
    const refill = refillTray(seed, nextPieceId);
    tray = refill.pieces;
    seed = refill.seed;
    nextPieceId = refill.nextPieceId;
  }

  const apples = Math.min(state.target, state.apples + collected);
  const combo = clearIndices.size ? state.combo + 1 : 0;
  const movesLeft = state.movesLeft === null ? null : Math.max(0, state.movesLeft - 1);
  const score = state.score + piece.cells.length * 10 + clearIndices.size * 20 + (fullRows.length + fullColumns.length > 1 ? 80 : 0) + (combo > 1 ? combo * 20 : 0);
  const status = apples >= state.target ? 'won' : movesLeft === 0 || !hasMove(board, tray) ? 'lost' : 'playing';
  const nextState = {
    ...state,
    board,
    tray,
    seed,
    nextPieceId,
    apples,
    score,
    combo,
    movesLeft,
    chestProgress: Math.min(500, state.chestProgress + piece.cells.length + clearIndices.size),
    moves: state.moves + 1,
    status,
  };
  const events = [{ type: 'placed', cells: placed }];
  if (clearIndices.size) events.push({ type: 'cleared', cells: clearedCells, rows: fullRows, columns: fullColumns, apples: collected, appleCells, combo });
  if (status === 'won') events.push({ type: 'won' });
  if (status === 'lost') events.push({ type: 'lost' });
  return { state: nextState, events };
}

export function removeCell(state, x, y) {
  if (state.status !== 'playing' || x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return { state, events: [{ type: 'invalid' }] };
  const index = y * BOARD_SIZE + x;
  if (!state.board[index]) return { state, events: [{ type: 'invalid' }] };
  const board = state.board.map(cloneCell);
  const apple = board[index].apple;
  board[index] = null;
  const apples = Math.min(state.target, state.apples + (apple ? 1 : 0));
  const status = apples >= state.target ? 'won' : 'playing';
  return { state: { ...state, board, apples, status }, events: [{ type: 'hammer', cells: [{ x, y }], apples: apple ? 1 : 0 }, ...(status === 'won' ? [{ type: 'won' }] : [])] };
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
    if (cell.apple) appleCells.push(position);
    board[index] = null;
  });
  const apples = Math.min(state.target, state.apples + appleCells.length);
  const status = apples >= state.target ? 'won' : 'playing';
  return { state: { ...state, board, apples, status, score: state.score + cells.length * 20 }, events: [{ type: 'rainbow', cells, apples: appleCells.length, appleCells }, ...(status === 'won' ? [{ type: 'won' }] : [])] };
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
  const tray = state.tray.map((piece) => piece.id === pieceId ? { ...piece, color: piece.color === 'green' ? 'pink' : 'green' } : piece);
  return { state: { ...state, tray }, events: [{ type: 'switcher' }] };
}

export function restart(state) {
  return { ...createInitialState(state.level), generation: state.generation + 1 };
}

export function nextLevel(state) {
  return { ...createInitialState(state.level + 1), generation: state.generation + 1 };
}
