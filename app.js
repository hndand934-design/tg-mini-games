// ===== Mines FINAL (UI ladder fixed, big X compact, sounds, reset returns bet) =====

// --- RNG (честный) ---
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function randInt(min, max) {
  return Math.floor(randFloat() * (max - min + 1)) + min;
}

// --- Telegram WebApp ---
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// ===== Wallet =====
const WALLET_KEY = "mini_wallet_mines_v2";
function loadWallet() {
  try {
    const w = JSON.parse(localStorage.getItem(WALLET_KEY) || "null");
    if (w && typeof w.coins === "number") return w;
  } catch {}
  return { coins: 1000 };
}
function saveWallet(w) {
  localStorage.setItem(WALLET_KEY, JSON.stringify(w));
}
let wallet = loadWallet();
function setCoins(v) {
  wallet.coins = Math.max(0, Math.floor(v));
  saveWallet(wallet);
  renderTop();
}
function addCoins(d) {
  setCoins(wallet.coins + d);
}

// ===== Sound =====
let soundOn = true;
let audioCtx = null;

function getCtx() {
  if (!soundOn) return null;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function tone(freq = 520, ms = 70, vol = 0.04, type = "sine") {
  const ctx = getCtx();
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = vol;
  o.connect(g);
  g.connect(ctx.destination);
  o.start();
  setTimeout(() => {
    try { o.stop(); } catch {}
  }, ms);
}
function sfxGem() {
  // приятный "пинг"
  tone(740, 55, 0.035, "sine");
  setTimeout(() => tone(980, 65, 0.03, "sine"), 55);
}
function sfxBoom() {
  // "взрыв" (низкий + шумоподобный)
  const ctx = getCtx();
  if (!ctx) return;

  // низкий удар
  tone(120, 140, 0.06, "square");

  // короткий шум
  const dur = 0.18;
  const bufferSize = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const t = i / bufferSize;
    data[i] = (Math.random() * 2 - 1) * (1 - t); // затухание
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  g.gain.value = 0.08;
  src.connect(g);
  g.connect(ctx.destination);
  src.start();
}

// ===== UI refs (ожидаем твою страницу Mines) =====
const subTitle = document.getElementById("subTitle");
const balanceEl = document.getElementById("balance");
const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");

// ставка
const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");
const chips = document.querySelectorAll(".chip");

// мины
const minesRange = document.getElementById("minesRange");
const minesVal = document.getElementById("minesVal");

// кнопки
const startBtn = document.getElementById("startBtn");
const cashBtn = document.getElementById("cashBtn");
const resetBtn = document.getElementById("resetBtn");

// поле
const gridEl = document.getElementById("grid");

// нижние статусы
const openedEl = document.getElementById("openedVal");
const multEl = document.getElementById("multVal");
const takeEl = document.getElementById("takeVal");

// сообщение
const msgEl = document.getElementById("msg");

// лесенка
const ladderGridEl = document.getElementById("ladderGrid");

// ===== Top render =====
function renderTop() {
  const user = tg?.initDataUnsafe?.user;
  if (subTitle) subTitle.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
  if (balanceEl) balanceEl.textContent = String(wallet.coins);
}
renderTop();

// ===== Sound toggle =====
if (soundBtn) {
  soundBtn.onclick = async () => {
    soundOn = !soundOn;
    if (soundText) soundText.textContent = soundOn ? "Звук on" : "Звук off";
    const dot = soundBtn.querySelector?.(".dot");
    if (dot) {
      dot.style.background = soundOn ? "#26d47b" : "#ff5a6a";
      dot.style.boxShadow = soundOn
        ? "0 0 0 3px rgba(38,212,123,.14)"
        : "0 0 0 3px rgba(255,90,106,.14)";
    }
    if (soundOn) sfxGem(); else tone(240, 60, 0.03);
  };
}

// ===== Bonus =====
if (bonusBtn) {
  bonusBtn.onclick = () => {
    addCoins(1000);
    sfxGem();
  };
}

// ===== Mines logic =====
const SIZE = 25;      // 5x5
const COLS = 5;
const MIN_MINES = 3;  // как ты просил: минимум 3

let state = {
  active: false,
  bet: 100,
  minesCount: 3,
  mines: new Set(),
  opened: new Set(),
  safeOpened: 0,
  mult: 1.0,
  over: false,
  cashed: false
};

// --- Математика X: монотонный рост и заметная разница на больших минах ---
// Используем "house edge" мягко, но X будет расти нормально даже на 23 минах.
// Формула: X = (1 - edge) / P, где P = вероятность открыть n safe подряд без взрыва.
// P = C(safeTotal, n) / C(25, n), safeTotal = 25 - minesCount
function comb(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let res = 1;
  for (let i = 1; i <= k; i++) {
    res = (res * (n - k + i)) / i;
  }
  return res;
}
function calcMultiplier(nSafeOpened, minesCount) {
  const safeTotal = SIZE - minesCount; // сколько всего safe клеток
  const n = nSafeOpened;

  if (n <= 0) return 1;

  // вероятность открыть n safe подряд (без взрыва)
  const p = comb(safeTotal, n) / comb(SIZE, n);

  // edge увеличиваем немного с ростом мин, но НЕ душим большие мины
  // чтобы на больших минах X реально был большим и рос
  const edgeBase = 0.06; // 6%
  const edge = Math.min(0.12, edgeBase + (minesCount - 3) * 0.002); // до 12%

  let x = (1 - edge) / Math.max(1e-9, p);

  // ограничим сверху разумно (на последних шагах может быть космос)
  x = Math.min(x, 999999);

  // минимум 1
  return Math.max(1, x);
}

// --- build mines ---
function buildMines(minesCount) {
  const mines = new Set();
  while (mines.size < minesCount) mines.add(randInt(0, SIZE - 1));
  return mines;
}

// ===== UI helpers =====
function clampBet() {
  let v = Math.floor(Number(betInput?.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  if (betInput) betInput.value = String(v);
  state.bet = v;
}
function clampMines() {
  let v = Math.floor(Number(minesRange?.value) || MIN_MINES);
  if (v < MIN_MINES) v = MIN_MINES;
  if (v > 24) v = 24;
  state.minesCount = v;
  if (minesRange) minesRange.value = String(v);
  if (minesVal) minesVal.textContent = String(v);
}

// формат икса в лесенке — чтобы не вылезало и красиво
function formatX(x) {
  if (x >= 1000) return `x${Math.round(x)}`;   // большие без .00
  return `x${x.toFixed(2)}`;
}

// ===== Ladder render =====
function renderLadder(activeStep, minesCount) {
  if (!ladderGridEl) return;

  const safeTotal = SIZE - minesCount;
  const totalSteps = safeTotal; // можно открыть максимум safeTotal клеток

  ladderGridEl.innerHTML = "";

  for (let step = 1; step <= totalSteps; step++) {
    const x = calcMultiplier(step, minesCount);

    const div = document.createElement("div");
    div.className = "lstep";

    // большие иксы пометим классом
    if (x >= 50) div.classList.add("big");

    // подсветка текущего шага
    if (step === activeStep) div.classList.add("active");

    div.innerHTML = `<span class="k">#${step}</span><span class="x">${formatX(x)}</span>`;
    ladderGridEl.appendChild(div);
  }
}

// ===== Grid render =====
function renderGrid() {
  if (!gridEl) return;

  const cells = [];
  for (let i = 0; i < SIZE; i++) {
    const opened = state.opened.has(i);

    // до старта — пустые “непрозрачные” клетки (без рисунков)
    let label = "";
    let cls = "cell";
    if (!state.active) cls += " cell--idle";

    if (opened) {
      const isMine = state.mines.has(i);
      cls += isMine ? " mine" : " safe";
      label = isMine ? "💣" : "💎";
    }

    cells.push(
      `<button class="${cls}" data-i="${i}" ${state.over || !state.active ? "disabled" : ""}>
        <span class="cellInner">${label}</span>
      </button>`
    );
  }
  gridEl.innerHTML = cells.join("");
  gridEl.querySelectorAll("button[data-i]").forEach((b) => {
    b.onclick = () => onCellClick(Number(b.dataset.i));
  });
}

// ===== Bottom stats =====
function renderBottom() {
  if (openedEl) openedEl.textContent = `${state.safeOpened} / ${SIZE - state.minesCount}`;
  if (multEl) multEl.textContent = `x${state.mult.toFixed(2)}`;

  const take = Math.floor(state.bet * state.mult);
  if (takeEl) takeEl.textContent = state.active ? `${take} 🪙` : "— 🪙";

  if (cashBtn) cashBtn.disabled = !state.active || state.over || state.safeOpened <= 0 || state.cashed;
}

// ===== Message =====
function setMsg(t) {
  if (msgEl) msgEl.textContent = t || "";
}

// ===== Start / Cashout / Reset =====
function startGame() {
  clampBet();
  clampMines();

  if (state.bet <= 0) return alert("Ставка должна быть больше 0");
  if (state.bet > wallet.coins) return alert("Недостаточно монет");
  if (state.minesCount < MIN_MINES || state.minesCount > 24)
    return alert(`Мин должно быть от ${MIN_MINES} до 24`);

  // списываем ставку только при Start
  addCoins(-state.bet);

  state.active = true;
  state.over = false;
  state.cashed = false;
  state.mines = buildMines(state.minesCount);
  state.opened = new Set();
  state.safeOpened = 0;
  state.mult = 1.0;

  setMsg("Игра началась. Открывай safe 💎 или забирай.");
  renderAll();
}

function cashOut() {
  if (!state.active || state.over || state.cashed) return;
  if (state.safeOpened <= 0) return;

  state.cashed = true;
  state.over = true;

  const payout = Math.floor(state.bet * state.mult);
  addCoins(payout);

  setMsg(`✅ Забрал: +${payout} 🪙 (${state.mult.toFixed(2)}x)`);

  // покажем все
  for (let i = 0; i < SIZE; i++) state.opened.add(i);

  renderAll();
}

function resetGame() {
  // если игра была начата и ставка списана — возвращаем при сбросе (как ты просил)
  if (state.active && !state.over) {
    addCoins(state.bet);
  }

  state.active = false;
  state.over = false;
  state.cashed = false;
  state.mines = new Set();
  state.opened = new Set();
  state.safeOpened = 0;
  state.mult = 1.0;

  setMsg("Выбери ставку и количество мин, затем нажми Start.");
  renderAll();
}

// ===== Cell click =====
function onCellClick(i) {
  if (!state.active || state.over) return;
  if (state.opened.has(i)) return;

  state.opened.add(i);

  // mine
  if (state.mines.has(i)) {
    state.over = true;
    sfxBoom();
    setMsg(`💥 Мина! Ставка ${state.bet} 🪙 сгорела.`);

    // показать все
    for (let k = 0; k < SIZE; k++) state.opened.add(k);
    renderAll();
    return;
  }

  // safe
  state.safeOpened += 1;
  state.mult = calcMultiplier(state.safeOpened, state.minesCount);

  sfxGem();
  setMsg("");

  // авто если открыл все safe
  const maxSafe = SIZE - state.minesCount;
  if (state.safeOpened >= maxSafe) {
    setMsg("🏁 Открыл все safe! Авто-забор.");
    cashOut();
    return;
  }

  renderAll();
}

// ===== Render all =====
function renderAll() {
  // кнопки
  if (startBtn) startBtn.disabled = state.active && !state.over;
  if (resetBtn) resetBtn.disabled = false;

  // лестенка показывается ВСЕГДА по выбранным минам
  renderLadder(state.active ? state.safeOpened : 0, state.minesCount);

  renderGrid();
  renderBottom();
  renderTop();
}

// ===== Bind UI =====
if (betInput) betInput.addEventListener("input", () => { clampBet(); renderBottom(); });
if (betMinus) betMinus.onclick = () => { betInput.value = String((Number(betInput.value)||1) - 10); clampBet(); renderBottom(); };
if (betPlus) betPlus.onclick = () => { betInput.value = String((Number(betInput.value)||1) + 10); clampBet(); renderBottom(); };

chips.forEach((b) => {
  b.onclick = () => {
    const val = b.dataset.bet;
    if (val === "max") betInput.value = String(wallet.coins);
    else betInput.value = String(val);
    clampBet();
    renderBottom();
    sfxGem();
  };
});

if (minesRange) minesRange.oninput = () => {
  clampMines();
  // обновляем лесенку до старта тоже
  renderLadder(state.active ? state.safeOpened : 0, state.minesCount);
};

if (startBtn) startBtn.onclick = startGame;
if (cashBtn) cashBtn.onclick = cashOut;
if (resetBtn) resetBtn.onclick = resetGame;

// ===== init =====
(function init() {
  clampMines();
  clampBet();
  setMsg("Выбери ставку и количество мин, затем нажми Start.");
  renderAll();
})();
