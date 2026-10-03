import {
  BOARD_SIZE,
  canPlace,
  createStudyState,
  nextLevel,
  pieceDimensions,
  placePiece,
  removeCell,
  removeColor,
  restart,
  shuffleTray,
  switchPieceColor,
} from './engine.js';
import { AudioEngine } from './audio.js';

const game = document.querySelector('#game');
const boardElement = document.querySelector('#board');
const trayElement = document.querySelector('#tray');
const effectsElement = document.querySelector('#effects');
const modalElement = document.querySelector('#modal');
const goalCard = document.querySelector('.goal-card');
const movesCard = document.querySelector('#moves-card');
const movesCount = document.querySelector('#moves-count');
const chestCount = document.querySelector('#chest-count');
const chestFill = document.querySelector('#chest-fill');
const chestProgressElement = document.querySelector('.chest-progress');
const goalContainer = document.querySelector('#goal-items');
const levelLabel = document.querySelector('#level-label');
const toastElement = document.querySelector('#toast');
const audio = new AudioEngine();
const publicBaseUrl = import.meta.env.BASE_URL;
const localReferenceEnabled = import.meta.env.DEV || import.meta.env.VITE_USE_LOCAL_REFERENCE === 'true';

const BOARD_LEFT = 23;
const BOARD_TOP = 216;
const CELL = 43;
const TOOL_UNLOCK = { hammer: 2, rewind: 3, shuffle: 4, switcher: 5, lighting: 6 };
const art = {
  apple: `${publicBaseUrl}assets/apple.svg`,
  pear: `${publicBaseUrl}assets/pear.svg`,
  avocado: `${publicBaseUrl}assets/avocado.svg`,
  plum: `${publicBaseUrl}assets/plum.svg`,
  cat: `${publicBaseUrl}assets/cat-avatar.svg`,
  chest: `${publicBaseUrl}assets/chest.svg`,
};

const requestedStudyLevel = Number(new URLSearchParams(window.location.search).get('studyLevel'));
const requestedStudyFrame = new URLSearchParams(window.location.search).get('studyFrame') ?? 'opening';
const initialStudyLevel = Number.isInteger(requestedStudyLevel) && requestedStudyLevel >= 1 && requestedStudyLevel <= 7
  ? requestedStudyLevel
  : 1;
let state = createStudyState(initialStudyLevel, requestedStudyFrame);
let selectedPieceId = null;
let activeTool = null;
let drag = null;
let history = [];
let toastTimer = null;
let effectTimers = new Set();

// A locally extracted reference pack can improve private visual study. It is
// deliberately ignored by Git; the tracked SVG artwork remains the fallback.
if (localReferenceEnabled) {
  document.documentElement.style.setProperty(
    '--local-booster-frame',
    `url("${publicBaseUrl}local-reference/power-up-frame.png")`,
  );
  for (const name of Object.keys(art)) {
    const probe = new Image();
    probe.onload = () => {
      art[name] = `${publicBaseUrl}local-reference/${name}.png`;
      document.querySelectorAll(`[data-art="${name}"]`).forEach((image) => { image.src = art[name]; });
    };
    probe.src = `${publicBaseUrl}local-reference/${name}.png`;
  }
  for (const [tool, file] of Object.entries({ hammer: 'hammer', rewind: 'rewind', shuffle: 'shuffle', switcher: 'switcher', lighting: 'lighting' })) {
    const probe = new Image();
    probe.onload = () => {
      const holder = document.querySelector(`.booster[data-tool="${tool}"] .booster-art`);
      if (!holder) return;
      const icon = document.createElement('img');
      icon.src = `${publicBaseUrl}local-reference/${file}.png`;
      icon.alt = '';
      holder.replaceChildren(icon);
    };
    probe.src = `${publicBaseUrl}local-reference/${file}.png`;
  }
  {
    const probe = new Image();
    probe.onload = () => document.querySelectorAll('.padlock').forEach((holder) => {
      const icon = document.createElement('img');
      icon.src = `${publicBaseUrl}local-reference/lock.png`;
      icon.alt = '';
      holder.replaceChildren(icon);
    });
    probe.src = `${publicBaseUrl}local-reference/lock.png`;
  }
}

function fitScreen() {
  const scale = Math.min(window.innerWidth / 390, window.innerHeight / 844);
  game.style.setProperty('--scale', String(scale));
}
window.addEventListener('resize', fitScreen);
fitScreen();

function tileElement(cell, small = false, justPlaced = false) {
  const tile = document.createElement('span');
  tile.className = `tile ${cell.color}${justPlaced ? ' just-placed' : ''}`;
  if (small) tile.classList.add('mini');
  const fruit = cell.fruit ?? (cell.apple ? 'apple' : null);
  if (fruit) {
    const apple = document.createElement('img');
    apple.src = art[fruit] ?? art.apple;
    apple.dataset.art = fruit;
    apple.alt = '';
    tile.append(apple);
  }
  return tile;
}

function renderBoard(justPlaced = []) {
  const placed = new Set(justPlaced.map(({ x, y }) => y * BOARD_SIZE + x));
  const fragment = document.createDocumentFragment();
  state.board.forEach((cell, index) => {
    const x = index % BOARD_SIZE;
    const y = Math.floor(index / BOARD_SIZE);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cell';
    button.dataset.x = x;
    button.dataset.y = y;
    button.setAttribute('role', 'gridcell');
    const fruit = cell?.fruit ?? (cell?.apple ? 'apple' : null);
    button.setAttribute('aria-label', `Row ${y + 1}, column ${x + 1}: ${cell ? `${cell.color} block${fruit ? ` with ${fruit}` : ''}` : 'empty'}`);
    if (cell) button.append(tileElement(cell, false, placed.has(index)));
    fragment.append(button);
  });
  boardElement.replaceChildren(fragment);
}

function renderTray() {
  const fragment = document.createDocumentFragment();
  for (let slot = 0; slot < 3; slot += 1) {
    const holder = document.createElement('div');
    holder.className = 'piece-slot';
    const piece = state.tray.find((item, index) => (item.slot ?? index) === slot);
    if (piece) {
      const { width, height } = pieceDimensions(piece);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `piece${selectedPieceId === piece.id ? ' selected' : ''}`;
      button.dataset.pieceId = piece.id;
      button.style.setProperty('--piece-cols', width);
      button.style.setProperty('--piece-rows', height);
      const fruitAt = piece.fruitAt ?? piece.appleAt;
      const fruitName = piece.fruitAt !== undefined ? piece.fruit : piece.appleAt !== undefined ? 'apple' : null;
      button.setAttribute('aria-label', `${piece.color} ${piece.name} piece, ${piece.cells.length} blocks${fruitAt !== undefined ? `, with ${fruitName}` : ''}`);
      piece.cells.forEach(([x, y], index) => {
        const fruit = piece.fruitAt === index ? piece.fruit : piece.appleAt === index ? 'apple' : null;
        const tile = tileElement({ color: piece.color, apple: fruit === 'apple', fruit }, true);
        tile.style.gridColumn = String(x + 1);
        tile.style.gridRow = String(y + 1);
        button.append(tile);
      });
      holder.append(button);
    }
    fragment.append(holder);
  }
  trayElement.replaceChildren(fragment);
}

function renderHeader() {
  levelLabel.textContent = `Level ${state.level}`;
  const objectives = state.objectives ?? [{ kind: 'apple', collected: state.apples, target: state.target }];
  goalCard.classList.toggle('multi-goal', objectives.length > 1);
  goalContainer.replaceChildren(...objectives.map((objective) => {
    const item = document.createElement('span');
    item.className = 'goal-item';
    item.dataset.goalKind = objective.kind;
    const image = document.createElement('img');
    image.src = art[objective.kind] ?? art.apple;
    image.dataset.art = objective.kind;
    image.alt = { pear: 'Pears', avocado: 'Avocados', apple: 'Apples', plum: 'Plums' }[objective.kind] ?? 'Fruit';
    const count = document.createElement('span');
    count.className = 'goal-count';
    count.textContent = `${objective.collected}/${objective.target}`;
    item.append(image, count);
    return item;
  }));
  movesCard.classList.toggle('hidden', state.movesLeft === null);
  if (state.movesLeft !== null) movesCount.textContent = String(state.movesLeft);
  chestCount.textContent = `${state.chestProgress}/${state.chestTarget}`;
  chestFill.style.width = `${Math.max(1, (state.chestProgress / state.chestTarget) * 100)}%`;
  chestProgressElement.classList.toggle('advanced-chest', state.level >= 3);
  document.querySelectorAll('.booster').forEach((button) => {
    const required = TOOL_UNLOCK[button.dataset.tool];
    const unlocked = state.level >= required;
    button.classList.toggle('unlocked', unlocked);
    button.classList.toggle('active', activeTool === button.dataset.tool);
    button.setAttribute('aria-label', unlocked ? `${button.dataset.tool} tool` : `${button.dataset.tool} tool, unlock at level ${required}`);
  });
}

function render(justPlaced = []) {
  renderHeader();
  renderBoard(justPlaced);
  renderTray();
}

function showToast(message, duration = 1900) {
  clearTimeout(toastTimer);
  toastElement.textContent = message;
  toastElement.classList.add('show');
  toastTimer = setTimeout(() => toastElement.classList.remove('show'), duration);
}

function later(ms, callback) {
  const generation = state.generation;
  const timer = setTimeout(() => {
    effectTimers.delete(timer);
    if (state.generation === generation) callback();
  }, ms);
  effectTimers.add(timer);
}

function clearEffects() {
  for (const timer of effectTimers) clearTimeout(timer);
  effectTimers.clear();
  effectsElement.replaceChildren();
  clearTimeout(toastTimer);
  toastElement.classList.remove('show');
}

function cellCenter(x, y) { return { x: BOARD_LEFT + x * CELL + CELL / 2, y: BOARD_TOP + y * CELL + CELL / 2 }; }

function addSpark(x, y, angle, distance, color = '#fff5b5') {
  const spark = document.createElement('span');
  spark.className = 'spark';
  spark.style.left = `${x - 4}px`;
  spark.style.top = `${y - 4}px`;
  spark.style.background = color;
  spark.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
  spark.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
  effectsElement.append(spark);
  later(760, () => spark.remove());
}

function addBurst(x, y, count = 9, color = '#fff5b5') {
  for (let i = 0; i < count; i += 1) addSpark(x, y, (i / count) * Math.PI * 2, 22 + (i % 3) * 10, color);
}

function addClearFlash(x, y) {
  const flash = document.createElement('span');
  flash.className = 'clear-flash';
  flash.style.left = `${BOARD_LEFT + x * CELL}px`;
  flash.style.top = `${BOARD_TOP + y * CELL}px`;
  effectsElement.append(flash);
  later(430, () => flash.remove());
}

function addBoardGlow() {
  const glow = document.createElement('span');
  glow.className = `board-glow${state.level <= 3 ? ' early-fruit-glow' : ''}`;
  effectsElement.append(glow);
  later(800, () => glow.remove());
}

function addLineBeam(event) {
  for (const row of event.rows ?? []) {
    const beam = document.createElement('span');
    beam.className = `line-beam${event.fruitCells?.length ? ' fruit-beam' : ''}`;
    beam.style.left = `${BOARD_LEFT}px`;
    beam.style.top = `${BOARD_TOP + row * CELL + CELL / 2 - 3}px`;
    beam.style.width = `${BOARD_SIZE * CELL}px`;
    beam.style.height = '6px';
    effectsElement.append(beam);
    later(680, () => beam.remove());
  }
  for (const column of event.columns ?? []) {
    const beam = document.createElement('span');
    beam.className = `line-beam${event.fruitCells?.length ? ' fruit-beam' : ''}`;
    beam.style.left = `${BOARD_LEFT + column * CELL + CELL / 2 - 3}px`;
    beam.style.top = `${BOARD_TOP}px`;
    beam.style.width = '6px';
    beam.style.height = `${BOARD_SIZE * CELL}px`;
    beam.style.background = 'linear-gradient(#fff9, #fff, #fbe6ff, #fff9)';
    effectsElement.append(beam);
    later(680, () => beam.remove());
  }
}

function addShards(x, y, color = 'green') {
  const center = cellCenter(x, y);
  const base = color === 'pink' ? '#e42faf' : color === 'blue' ? '#298eed' : '#6eec4b';
  for (let i = 0; i < 7; i += 1) {
    const shard = document.createElement('span');
    const angle = ((x * 11 + y * 7 + i * 13) % 29) / 29 * Math.PI * 2;
    const distance = 23 + ((x * 17 + y * 13 + i * 19) % 49);
    shard.className = 'shard';
    shard.style.left = `${center.x - 6}px`;
    shard.style.top = `${center.y - 5}px`;
    shard.style.background = base;
    shard.style.color = base;
    shard.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    shard.style.setProperty('--dy', `${Math.sin(angle) * distance + 25}px`);
    shard.style.setProperty('--rotate', `${(i % 2 ? -1 : 1) * (95 + i * 28)}deg`);
    effectsElement.append(shard);
    later(850, () => shard.remove());
  }
}

function addClearBanner(event) {
  const banner = document.createElement('div');
  if ((state.objectives?.length ?? 1) > 1) {
    const total = state.objectives.reduce((sum, item) => sum + item.target, 0);
    const done = state.objectives.reduce((sum, item) => sum + item.collected, 0);
    const percent = Math.round((done / total) * 100);
    banner.className = 'clear-banner progress-banner';
    const mascot = document.createElement('span');
    mascot.className = 'progress-mascot';
    mascot.setAttribute('aria-hidden', 'true');
    mascot.textContent = '•ᴗ•';
    const ribbon = document.createElement('span');
    ribbon.className = 'progress-ribbon';
    ribbon.textContent = `${percent}% DONE`;
    banner.append(mascot, ribbon);
  } else {
    banner.className = 'clear-banner';
    if (event.combo > 1) {
      const combo = document.createElement('span');
      combo.className = 'combo';
      combo.append(document.createTextNode('Combo '));
      const number = document.createElement('em');
      number.textContent = String(event.combo);
      combo.append(number);
      banner.append(combo);
    }
    const praise = event.cells.length >= 16 ? 'Perfect!' : 'Good!';
    const praiseElement = document.createElement('span');
    praiseElement.className = `praise${praise === 'Good!' ? ' good' : ''}`;
    praiseElement.textContent = praise;
    banner.append(praiseElement);
  }
  effectsElement.append(banner);
  later(1230, () => banner.remove());
}

function flyFruit(kind, x, y) {
  const origin = cellCenter(x, y);
  const goal = document.querySelector(`[data-goal-kind="${kind}"]`);
  const gameRect = game.getBoundingClientRect();
  const scale = gameRect.width / 390;
  const goalRect = goal?.getBoundingClientRect();
  const destination = goalRect
    ? { x: (goalRect.left + goalRect.width / 2 - gameRect.left) / scale, y: (goalRect.top + goalRect.height / 2 - gameRect.top) / scale }
    : { x: 193, y: 173 };
  const fruit = document.createElement('img');
  fruit.src = art[kind] ?? art.apple;
  fruit.dataset.art = kind;
  fruit.className = 'flying-fruit';
  fruit.style.left = `${origin.x - 19}px`;
  fruit.style.top = `${origin.y - 23}px`;
  fruit.style.setProperty('--dx', `${destination.x - origin.x}px`);
  fruit.style.setProperty('--dy', `${destination.y - origin.y}px`);
  effectsElement.append(fruit);
  later(760, () => fruit.remove());
}

function floatScore(x, y, text) {
  const label = document.createElement('span');
  label.className = 'float-score';
  label.style.left = `${x - 20}px`;
  label.style.top = `${y - 16}px`;
  label.textContent = text;
  effectsElement.append(label);
  later(800, () => label.remove());
}

function playEffects(events) {
  for (const event of events) {
    if (event.type === 'placed') {
      for (const { x, y } of event.cells) {
        const center = cellCenter(x, y);
        addBurst(center.x, center.y, 4, '#e0ff9c');
      }
    }
    if (event.type === 'cleared' || event.type === 'rainbow') {
      if ((state.objectives?.length ?? 1) < 2) addBoardGlow();
      addLineBeam(event);
      addClearBanner(event);
      event.cells.forEach(({ x, y }, index) => {
        later(index * 17, () => {
          const center = cellCenter(x, y);
          addClearFlash(x, y);
          addShards(x, y, event.cells[index].color);
          if (index % 2 === 0) addBurst(center.x, center.y, 4, index % 4 === 0 ? '#5beaff' : '#fff0b8');
        });
      });
      for (const position of event.fruitCells ?? (event.appleCells ?? []).map((item) => ({ ...item, fruit: 'apple' }))) {
        flyFruit(position.fruit ?? 'apple', position.x, position.y);
      }
      if (event.fruitCells?.length || event.apples) {
        goalCard.classList.remove('bump');
        void goalCard.offsetWidth;
        later(270, () => goalCard.classList.add('bump'));
        later(730, () => goalCard.classList.remove('bump'));
      }
    }
    if (event.type === 'hammer') {
      for (const { x, y } of event.cells) {
        const center = cellCenter(x, y);
        addClearFlash(x, y);
        addBurst(center.x, center.y, 12);
        const fruit = event.fruitCells?.find((item) => item.x === x && item.y === y)?.fruit;
        if (fruit) flyFruit(fruit, x, y);
      }
    }
    if (event.type === 'shuffle') showToast('Blocks shuffled!');
    if (event.type === 'won') {
      for (let i = 0; i < 30; i += 1) {
        later(i * 30, () => addSpark(35 + ((i * 71) % 320), 95 + ((i * 47) % 520), -Math.PI / 2 + (i % 7) * .35, 60 + (i % 5) * 16, ['#ffdf6e', '#ff79d2', '#66e9ff', '#7dff80'][i % 4]));
      }
      later(720, () => showModal('won'));
    }
    if (event.type === 'lost') later(420, () => showModal('lost'));
  }
}

function applyResult(result) {
  if (result.state === state && result.events[0]?.type === 'invalid') {
    audio.playEvent(result.events[0]);
    showToast('That block does not fit.');
    return;
  }
  if (result.state !== state && result.events.some((event) => ['placed', 'hammer', 'rainbow', 'shuffle', 'switcher'].includes(event.type))) {
    history.push(state);
    if (history.length > 20) history.shift();
  }
  state = result.state;
  selectedPieceId = null;
  activeTool = null;
  const placed = result.events.find((event) => event.type === 'placed')?.cells ?? [];
  render(placed);
  for (const event of result.events) audio.playEvent(event);
  playEffects(result.events);
}

function cellFromEvent(event) {
  const bounds = boardElement.getBoundingClientRect();
  const x = Math.floor((event.clientX - bounds.left) / (bounds.width / BOARD_SIZE));
  const y = Math.floor((event.clientY - bounds.top) / (bounds.height / BOARD_SIZE));
  if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return null;
  return { x, y };
}

function handleBoardClick(event) {
  const cell = event.target.closest('.cell');
  if (!cell || state.status !== 'playing') return;
  audio.start();
  const x = Number(cell.dataset.x);
  const y = Number(cell.dataset.y);
  if (activeTool === 'hammer') return applyResult(removeCell(state, x, y));
  if (activeTool === 'lighting') return applyResult(removeColor(state, x, y));
  if (selectedPieceId !== null) return applyResult(placePiece(state, selectedPieceId, x, y));
  if (state.tray.length === 1 && !state.board[y * BOARD_SIZE + x]) return applyResult(placePiece(state, state.tray[0].id, x, y));
  if (state.board[y * BOARD_SIZE + x]) showToast('Select a block from the tray.');
}
boardElement.addEventListener('click', handleBoardClick);

function localPoint(event) {
  const rect = game.getBoundingClientRect();
  const scale = rect.width / 390;
  return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
}

function makeGhost(piece) {
  const { width, height } = pieceDimensions(piece);
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.style.setProperty('--piece-cols', width);
  ghost.style.setProperty('--piece-rows', height);
  piece.cells.forEach(([x, y], index) => {
    const fruit = piece.fruitAt === index ? piece.fruit : piece.appleAt === index ? 'apple' : null;
    const tile = tileElement({ color: piece.color, apple: fruit === 'apple', fruit });
    tile.style.gridColumn = String(x + 1);
    tile.style.gridRow = String(y + 1);
    ghost.append(tile);
  });
  game.append(ghost);
  return ghost;
}

function dragAnchor(event, piece) {
  const point = cellFromEvent(event);
  if (!point) return null;
  const dims = pieceDimensions(piece);
  const anchorX = point.x - Math.floor((dims.width - 1) / 2);
  const anchorY = point.y - Math.floor((dims.height - 1) / 2);
  return { x: anchorX, y: anchorY };
}

function updateDrag(event) {
  if (!drag) return;
  const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
  if (!drag.moved && distance < 7) return;
  if (!drag.moved) {
    drag.moved = true;
    drag.ghost = makeGhost(drag.piece);
    drag.button.classList.add('drag-source');
  }
  const point = localPoint(event);
  const dims = pieceDimensions(drag.piece);
  const anchor = dragAnchor(event, drag.piece);
  const valid = anchor && canPlace(state.board, drag.piece, anchor.x, anchor.y);
  drag.ghost.classList.toggle('invalid', !valid);
  if (anchor) {
    drag.ghost.style.left = `${BOARD_LEFT + anchor.x * CELL}px`;
    drag.ghost.style.top = `${BOARD_TOP + anchor.y * CELL}px`;
  } else {
    drag.ghost.style.left = `${point.x - dims.width * CELL / 2}px`;
    drag.ghost.style.top = `${point.y - dims.height * CELL / 2 - 45}px`;
  }
  boardElement.querySelectorAll('.hover-valid, .hover-invalid').forEach((cell) => cell.classList.remove('hover-valid', 'hover-invalid'));
  if (anchor) {
    for (const [dx, dy] of drag.piece.cells) {
      const x = anchor.x + dx;
      const y = anchor.y + dy;
      const cell = boardElement.querySelector(`[data-x="${x}"][data-y="${y}"]`);
      cell?.classList.add(valid ? 'hover-valid' : 'hover-invalid');
    }
  }
}

function endDrag(event) {
  if (!drag) return;
  const current = drag;
  drag = null;
  current.button.classList.remove('drag-source');
  current.ghost?.remove();
  boardElement.querySelectorAll('.hover-valid, .hover-invalid').forEach((cell) => cell.classList.remove('hover-valid', 'hover-invalid'));
  if (current.moved) {
    const anchor = dragAnchor(event, current.piece);
    if (anchor) applyResult(placePiece(state, current.piece.id, anchor.x, anchor.y));
    else showToast('Drop a block on the board.');
  } else {
    selectedPieceId = selectedPieceId === current.piece.id ? null : current.piece.id;
    activeTool = null;
    renderHeader();
    renderTray();
    audio.play('button');
  }
}

trayElement.addEventListener('pointerdown', (event) => {
  const button = event.target.closest('.piece');
  if (!button || state.status !== 'playing') return;
  event.preventDefault();
  audio.start();
  const piece = state.tray.find((item) => item.id === Number(button.dataset.pieceId));
  if (!piece) return;
  if (activeTool === 'switcher') return applyResult(switchPieceColor(state, piece.id));
  drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, piece, button, moved: false, ghost: null };
  button.setPointerCapture(event.pointerId);
});
trayElement.addEventListener('pointermove', (event) => { if (drag?.pointerId === event.pointerId) updateDrag(event); });
trayElement.addEventListener('pointerup', (event) => { if (drag?.pointerId === event.pointerId) endDrag(event); });
trayElement.addEventListener('pointercancel', (event) => { if (drag?.pointerId === event.pointerId) { drag.ghost?.remove(); drag = null; } });

document.querySelectorAll('.booster').forEach((button) => button.addEventListener('click', () => {
  audio.start();
  const tool = button.dataset.tool;
  const required = TOOL_UNLOCK[tool];
  if (state.level < required) {
    audio.play('invalid');
    showToast(`Unlocks at Level ${required}`);
    return;
  }
  audio.play('button');
  if (tool === 'rewind') {
    const previous = history.pop();
    if (!previous) return showToast('No move to rewind.');
    clearEffects();
    state = previous;
    selectedPieceId = null;
    activeTool = null;
    render();
    showToast('Move rewound!');
    return;
  }
  if (tool === 'shuffle') return applyResult(shuffleTray(state));
  activeTool = activeTool === tool ? null : tool;
  selectedPieceId = null;
  renderHeader();
  renderTray();
  showToast(activeTool ? `Tap a block to use ${tool}.` : 'Tool cancelled.');
}));

function showModal(kind) {
  modalElement.dataset.kind = kind;
  let body;
  if (kind === 'settings') {
    body = `<div class="panel"><button class="close" data-action="close" aria-label="Close">×</button><h2>Settings</h2><div class="switch-row">Music <button data-action="toggle-music" class="${audio.musicEnabled ? '' : 'off'}">${audio.musicEnabled ? 'ON' : 'OFF'}</button></div><div class="switch-row">Sounds <button data-action="toggle-effects" class="${audio.effectsEnabled ? '' : 'off'}">${audio.effectsEnabled ? 'ON' : 'OFF'}</button></div><button class="panel-button secondary" data-action="restart">Restart Level</button></div>`;
  } else if (kind === 'chest') {
    body = `<div class="panel"><button class="close" data-action="close" aria-label="Close">×</button><h2>Treasure Chest</h2><img src="${art.chest}" data-art="chest" alt="" style="width:100px;height:85px"><p>${state.chestProgress}/500 blocks toward your next treasure.</p><button class="panel-button" data-action="close">Keep Playing</button></div>`;
  } else if (kind === 'village') {
    body = `<div class="panel"><button class="close" data-action="close" aria-label="Close">×</button><h2>Village</h2><div class="village-map" aria-hidden="true"><span>🌲</span><span>🏡</span><span>🍄</span></div><p>Collect apples and clear levels to help the village grow.</p><button class="panel-button" data-action="close">Back to Puzzle</button></div>`;
  } else if (kind === 'won') {
    const collected = state.objectives.map((item) => `${item.collected}/${item.target} ${{ pear: 'pears', avocado: 'avocados', apple: 'apples', plum: 'plums' }[item.kind] ?? 'fruit'}`).join(' · ');
    body = `<div class="panel"><h2>Level Complete!</h2><div class="reward-fruits">${state.objectives.map((item) => `<img src="${art[item.kind] ?? art.apple}" data-art="${item.kind}" alt="" />`).join('')}</div><p>${collected}<br>Score ${state.score}</p><button class="panel-button" data-action="next">Next Level</button></div>`;
  } else {
    const remaining = state.objectives.map((item) => `${item.target - item.collected} ${{ pear: 'pears', avocado: 'avocados', apple: 'apples', plum: 'plums' }[item.kind] ?? 'fruit'}`).join(' and ');
    body = `<div class="panel"><h2>No More Moves</h2><p>Try another route to collect ${remaining}.</p><button class="panel-button" data-action="restart">Retry Level</button></div>`;
  }
  modalElement.innerHTML = body;
  modalElement.classList.remove('hidden');
}

function closeModal() {
  if (state.status !== 'playing') return;
  modalElement.classList.add('hidden');
  modalElement.replaceChildren();
}

function resetLevel(next = false) {
  clearEffects();
  state = next ? nextLevel(state) : restart(state);
  history = [];
  selectedPieceId = null;
  activeTool = null;
  drag?.ghost?.remove();
  drag = null;
  modalElement.classList.add('hidden');
  modalElement.replaceChildren();
  render();
  audio.play('button');
}

modalElement.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) {
    if (event.target === modalElement) closeModal();
    return;
  }
  audio.start();
  const action = button.dataset.action;
  if (action === 'close') return closeModal();
  if (action === 'restart') return resetLevel();
  if (action === 'next') return resetLevel(true);
  if (action === 'toggle-music') { audio.setMusicEnabled(!audio.musicEnabled); showModal('settings'); audio.play('button'); }
  if (action === 'toggle-effects') { audio.setEffectsEnabled(!audio.effectsEnabled); showModal('settings'); audio.play('button'); }
});

document.querySelector('#avatar').addEventListener('click', () => { audio.start(); audio.play('button'); showModal('settings'); });
document.querySelector('#chest').addEventListener('click', () => { audio.start(); audio.play('button'); showModal('chest'); });
document.querySelector('#village').addEventListener('click', () => { audio.start(); audio.play('button'); showModal('village'); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModal();
  if (event.key.toLowerCase() === 'r' && !event.repeat) resetLevel();
  if (event.key.toLowerCase() === 'm' && !event.repeat) { audio.start(); audio.setMusicEnabled(!audio.musicEnabled); showToast(`Music ${audio.musicEnabled ? 'on' : 'off'}`); }
});

render();

// Kept read-only for browser QA; gameplay changes must still use visible controls.
window.blockCrushStudy = Object.freeze({
  version: '0.1.0',
  get snapshot() {
    return {
      level: state.level,
      apples: state.apples,
      target: state.target,
      score: state.score,
      status: state.status,
      moves: state.moves,
      combo: state.combo,
      chestProgress: state.chestProgress,
      chestTarget: state.chestTarget,
      objectives: (state.objectives ?? []).map((item) => ({ ...item })),
      board: state.board.map((cell) => cell ? { color: cell.color, fruit: cell.fruit ?? (cell.apple ? 'apple' : null) } : null),
      tray: state.tray.map((piece, index) => ({
        id: piece.id,
        slot: piece.slot ?? index,
        name: piece.name,
        color: piece.color,
        cells: piece.cells.map((cell) => [...cell]),
      })),
      audio: audio.diagnostics,
    };
  },
});
