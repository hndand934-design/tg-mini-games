/* Dragon Tower — чистый ванильный JS, GitHub Pages friendly */

const $ = (s) => document.querySelector(s);

const els = {
  balanceText: $("#balanceText"),
  soundBtn: $("#soundBtn"),
  soundState: $("#soundState"),

  modeNormal: $("#modeNormal"),
  modeHard: $("#modeHard"),
  modeHint: $("#modeHint"),

  betMinus: $("#betMinus"),
  betPlus: $("#betPlus"),
  betInput: $("#betInput"),
  betMax: $("#betMax"),
  chips: Array.from(document.querySelectorAll(".chip[data-chip]")),

  startBtn: $("#startBtn"),
  cashoutBtn: $("#cashoutBtn"),

  statusText: $("#statusText"),
  xText: $("#xText"),
  potentialText: $("#potentialText"),

  lastText: $("#lastText"),
  winText: $("#winText"),

  towerGrid: $("#towerGrid"),
  xScale: $("#xScale"),
};

// ====== Storage ======
const LS_BAL = "dt_balance_v1";
const LS_SOUND = "dt_sound_v1";

function loadBalance() {
  const v = Number(localStorage.getItem(LS_BAL));
  return Number.isFinite(v) && v >= 0 ? v : 1000;
}
function saveBalance(v) {
  localStorage.setItem(LS_BAL, String(v));
}
function loadSound() {
  const v = localStorage.getItem(LS_SOUND);
  if (v === null) return true;
  return v === "1";
}
function saveSound(on) {
  localStorage.setItem(LS_SOUND, on ? "1" : "0");
}

// ====== Audio (простые бипы) ======
let audioCtx = null;
function beep(freq = 440, dur = 0.06, gain = 0.04) {
  if (!state.soundOn) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const t0 = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start(t0);
  o.stop(t0 + dur);
}
function sfxTick(){ beep(720, 0.03, 0.03); }
function sfxWin(){ beep(520, 0.07, 0.05); setTimeout(()=>beep(760, 0.08, 0.05), 70); }
function sfxLose(){ beep(180, 0.12, 0.05); setTimeout(()=>beep(130, 0.12, 0.04), 90); }

// ====== Game config ======
const ROWS = 9;
const COLS = 4;

// Множители — можно позже подстроить под твои
const MULT_NORMAL = [1.00, 1.25, 1.55, 1.95, 2.45, 3.10, 3.95, 5.15, 6.80, 9.00];
const MULT_HARD   = [1.00, 1.40, 1.95, 2.75, 3.90, 5.55, 7.95, 11.40, 16.40, 24.00];

function fmt2(x){ return "x" + Number(x).toFixed(2); }
function rub(x){ return Math.round(x) + " ₽"; }

const state = {
  balance: loadBalance(),
  soundOn: loadSound(),

  mode: "normal",           // normal | hard
  inRound: false,
  bet: 100,

  // tower data:
  // trapsByRow[rowIndex] = Set(colIndex)
  trapsByRow: [],
  currentRow: 0,            // 0..ROWS-1
  safePassed: 0,            // сколько безопасных рядов прошёл
  currentX: 1.00,
  lastEvent: "—",
  lastWin: "—",
};

// ====== UI helpers ======
function clampBet(v) {
  v = Math.floor(Number(v) || 0);
  if (v < 1) v = 1;
  if (v > state.balance && !state.inRound) v = state.balance; // при ожидании — не больше баланса
  return v;
}

function setStatus(text) {
  els.statusText.textContent = text;
}

function updateTop() {
  els.balanceText.textContent = String(state.balance);
  els.soundState.textContent = state.soundOn ? "on" : "off";
  els.soundBtn.setAttribute("aria-pressed", state.soundOn ? "true" : "false");
}

function modeConfig() {
  if (state.mode === "normal") {
    return { safe: 3, trap: 1, mult: MULT_NORMAL, hint: "Обычный: 3 яйца / 1 ловушка в ряду" };
  }
  return { safe: 2, trap: 2, mult: MULT_HARD, hint: "Сложный: 2 яйца / 2 ловушки в ряду" };
}

function updateRightScale() {
  const { mult } = modeConfig();
  els.xScale.innerHTML = "";
  // показываем от верхних к нижним как на скрине: Ряд 9 ... Ряд 1
  for (let r = ROWS; r >= 1; r--) {
    const x = mult[r];
    const row = document.createElement("div");
    row.className = "xRow" + (state.inRound && state.currentRow === (r - 1) ? " is-current" : "");
    row.innerHTML = `<span class="muted">Ряд ${r}</span><b>${fmt2(x)}</b>`;
    els.xScale.appendChild(row);
  }
}

function updateBetUI() {
  els.betInput.value = String(state.bet);
  els.startBtn.disabled = state.inRound;
  els.betMinus.disabled = state.inRound;
  els.betPlus.disabled = state.inRound;
  els.betMax.disabled = state.inRound;
  els.chips.forEach(b => b.disabled = state.inRound);
}

function updateRoundUI() {
  els.cashoutBtn.disabled = !state.inRound || state.safePassed === 0;
  els.xText.textContent = fmt2(state.currentX);

  const potential = state.inRound ? Math.floor(state.bet * state.currentX) : 0;
  els.potentialText.textContent = rub(potential);

  els.lastText.textContent = state.lastEvent;
  els.winText.textContent = state.lastWin;

  els.modeHint.textContent = modeConfig().hint;
  updateRightScale();
}

function setMode(mode) {
  if (state.inRound) return;

  state.mode = mode;
  els.modeNormal.classList.toggle("is-active", mode === "normal");
  els.modeHard.classList.toggle("is-active", mode === "hard");

  renderTower();       // просто перерисуем пустую сетку
  updateRoundUI();
}

// ====== Tower generation/render ======
function randInt(n){ return Math.floor(Math.random() * n); }

function generateTower() {
  const { trap } = modeConfig();
  state.trapsByRow = [];
  for (let r = 0; r < ROWS; r++) {
    const set = new Set();
    while (set.size < trap) set.add(randInt(COLS));
    state.trapsByRow.push(set);
  }
}

function renderTower() {
  els.towerGrid.innerHTML = "";

  // сетка сверху вниз визуально, но игровой "currentRow" = 0 это нижний ряд
  for (let visual = ROWS - 1; visual >= 0; visual--) {
    const rowEl = document.createElement("div");
    rowEl.className = "row";

    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell is-disabled";
      cell.dataset.row = String(visual);
      cell.dataset.col = String(c);

      cell.addEventListener("click", onCellClick);
      rowEl.appendChild(cell);
    }

    els.towerGrid.appendChild(rowEl);
  }

  refreshActiveRow();
}

function refreshActiveRow() {
  // все клетки отключаем, кроме активного ряда (если в раунде)
  const cells = Array.from(document.querySelectorAll(".cell"));
  cells.forEach((cell) => {
    const row = Number(cell.dataset.row);
    const isRevealed = cell.classList.contains("revealed");

    if (!state.inRound || isRevealed) {
      cell.classList.add("is-disabled");
      cell.classList.remove("is-active");
      cell.disabled = true;
      return;
    }

    const isActiveRow = row === state.currentRow;
    cell.classList.toggle("is-active", isActiveRow);
    cell.classList.toggle("is-disabled", !isActiveRow);
    cell.disabled = !isActiveRow;
  });
}

function revealRow(rowIndex, chosenCol = null, forceRevealAll = false) {
  // показать всё в ряду (при проигрыше) или только выбранное (при успехе)
  const traps = state.trapsByRow[rowIndex];
  const cells = Array.from(document.querySelectorAll(`.cell[data-row="${rowIndex}"]`));

  cells.forEach((cell) => {
    const col = Number(cell.dataset.col);
    const isTrap = traps.has(col);

    const shouldReveal = forceRevealAll || col === chosenCol;
    if (!shouldReveal) return;

    cell.classList.add("revealed");
    cell.disabled = true;
    cell.classList.remove("is-active");
    cell.classList.add(isTrap ? "bad" : "good");
    cell.textContent = isTrap ? "✖" : "●";
  });
}

// ====== Game actions ======
function startRound() {
  state.bet = clampBet(state.bet);
  if (state.bet < 1) return;
  if (state.bet > state.balance) {
    state.bet = state.balance;
    updateBetUI();
  }
  if (state.balance < 1) return;

  // списать ставку
  state.balance -= state.bet;
  saveBalance(state.balance);

  state.inRound = true;
  state.currentRow = 0;
  state.safePassed = 0;
  state.currentX = 1.00;
  state.lastEvent = "Игра началась";
  state.lastWin = "—";

  generateTower();
  renderTower(); // перерисуем, чтобы очистить символы

  setStatus("Выбирай плитку в Ряду 1");
  sfxTick();

  updateTop();
  updateBetUI();
  updateRoundUI();
}

function loseRound(rowIndex, chosenCol) {
  revealRow(rowIndex, chosenCol, true);
  state.inRound = false;
  state.safePassed = 0;
  state.currentX = 1.00;

  state.lastEvent = "Ловушка";
  state.lastWin = "0 ₽";
  setStatus("Проигрыш. Нажми «Ставка», чтобы начать снова.");

  sfxLose();

  updateTop();
  updateBetUI();
  updateRoundUI();
  refreshActiveRow();
}

function winStep(rowIndex, chosenCol) {
  revealRow(rowIndex, chosenCol, false);

  state.safePassed += 1;
  const { mult } = modeConfig();
  state.currentX = mult[state.safePassed];

  state.lastEvent = `Безопасно • Ряд ${state.safePassed}`;
  setStatus(`Безопасно! Выбирай плитку в Ряду ${state.safePassed + 1} или жми Кэшаут`);

  // следующий ряд
  state.currentRow += 1;

  sfxWin();

  // если дошли до конца — автокэшаут
 _toggleAutoCashoutIfMax();

  updateRoundUI();
  refreshActiveRow();
}

function _toggleAutoCashoutIfMax() {
  if (!state.inRound) return;
  if (state.safePassed >= ROWS) {
    // максимальный ряд пройден
    cashout(true);
  }
}

function cashout(auto = false) {
  if (!state.inRound) return;
  if (state.safePassed === 0) return;

  const win = Math.floor(state.bet * state.currentX);
  state.balance += win;
  saveBalance(state.balance);

  state.inRound = false;

  state.lastEvent = auto ? "Авто-кэшаут (макс)" : "Кэшаут";
  state.lastWin = rub(win);

  setStatus(auto ? "Максимум! Авто-кэшаут." : "Забрал выигрыш. Можно начинать снова.");
  sfxWin();

  updateTop();
  updateBetUI();
  updateRoundUI();
  refreshActiveRow();
}

// ====== Handlers ======
function onCellClick(e) {
  if (!state.inRound) return;

  const cell = e.currentTarget;
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);

  // защита от “клика не туда”
  if (row !== state.currentRow) return;

  const traps = state.trapsByRow[row];
  const isTrap = traps.has(col);

  if (isTrap) {
    loseRound(row, col);
  } else {
    winStep(row, col);
  }
}

function setBet(v) {
  if (state.inRound) return;
  state.bet = clampBet(v);
  updateBetUI();
  updateRoundUI();
}

function addBet(delta) {
  if (state.inRound) return;
  setBet((Number(state.bet) || 0) + delta);
}

// ====== Init ======
function init() {
  updateTop();

  // sane default bet
  state.bet = clampBet(Number(els.betInput.value));
  updateBetUI();

  setMode("normal");
  renderTower();
  setStatus("Ожидание");

  // mode
  els.modeNormal.addEventListener("click", () => setMode("normal"));
  els.modeHard.addEventListener("click", () => setMode("hard"));

  // sound
  els.soundBtn.addEventListener("click", () => {
    state.soundOn = !state.soundOn;
    saveSound(state.soundOn);
    updateTop();
    sfxTick();
  });

  // bet controls
  els.betMinus.addEventListener("click", () => addBet(-10));
  els.betPlus.addEventListener("click", () => addBet(+10));

  els.betInput.addEventListener("input", () => {
    // убираем всё кроме цифр
    const cleaned = els.betInput.value.replace(/[^\d]/g, "");
    els.betInput.value = cleaned;
  });
  els.betInput.addEventListener("blur", () => {
    setBet(Number(els.betInput.value));
  });

  els.chips.forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = Number(btn.dataset.chip);
      setBet(v);
    });
  });

  els.betMax.addEventListener("click", () => setBet(state.balance));

  // actions
  els.startBtn.addEventListener("click", startRound);
  els.cashoutBtn.addEventListener("click", () => cashout(false));

  updateRoundUI();
}
init();
