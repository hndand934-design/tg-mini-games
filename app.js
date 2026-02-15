// ====== RNG (честный) ======
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function randInt(min, max) {
  return Math.floor(randFloat() * (max - min + 1)) + min;
}

// ====== Telegram WebApp ======
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

// ====== Wallet ======
const WALLET_KEY = "mini_wallet_mines_vfinal";
function loadWallet() {
  try {
    const w = JSON.parse(localStorage.getItem(WALLET_KEY) || "null");
    if (w && typeof w.coins === "number") return w;
  } catch {}
  return { coins: 1000 };
}
function saveWallet(w) { localStorage.setItem(WALLET_KEY, JSON.stringify(w)); }
let wallet = loadWallet();
function setCoins(v) { wallet.coins = Math.max(0, Math.floor(v)); saveWallet(wallet); renderTop(); }
function addCoins(d) { setCoins(wallet.coins + d); }

// ====== Light sound (safe / boom) ======
let soundOn = true;
let audioCtx = null;
function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function beep(type) {
  if (!soundOn) return;
  try {
    const c = ctx();
    const t0 = c.currentTime;

    const o = c.createOscillator();
    const g = c.createGain();
    o.connect(g); g.connect(c.destination);

    if (type === "safe") {
      // кристалл: две короткие ноты
      o.type = "sine";
      o.frequency.setValueAtTime(740, t0);
      o.frequency.exponentialRampToValueAtTime(990, t0 + 0.08);
      g.gain.setValueAtTime(0.04, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.10);
      o.start(t0);
      o.stop(t0 + 0.11);
      return;
    }

    // boom: шумоподобный "взрыв" (быстро вниз)
    o.type = "sawtooth";
    o.frequency.setValueAtTime(220, t0);
    o.frequency.exponentialRampToValueAtTime(60, t0 + 0.18);
    g.gain.setValueAtTime(0.06, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    o.start(t0);
    o.stop(t0 + 0.23);
  } catch {}
}

// ====== UI refs ======
const subTitle = document.getElementById("subTitle");
const balanceEl = document.getElementById("balance");

const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");

const gridEl = document.getElementById("grid");
const msgEl = document.getElementById("msg");

const safeView = document.getElementById("safeView");
const safeTotalView = document.getElementById("safeTotal");
const multView = document.getElementById("multView");
const takeView = document.getElementById("takeView");

const cashBtn = document.getElementById("cashBtn");
const resetBtn = document.getElementById("resetBtn");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");

const minesRange = document.getElementById("minesRange");
const minesShow = document.getElementById("minesShow");
const startBtn = document.getElementById("startBtn");

const ladderEl = document.getElementById("ladder");

// ====== Top render ======
function renderTop(){
  const user = tg?.initDataUnsafe?.user;
  subTitle.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
  balanceEl.textContent = String(wallet.coins);
}
renderTop();

// ====== Settings ======
soundBtn.onclick = () => {
  soundOn = !soundOn;
  soundText.textContent = soundOn ? "Звук" : "Звук off";
  const dot = soundBtn.querySelector(".dot");
  dot.style.background = soundOn ? "#26d47b" : "#ff5a6a";
  dot.style.boxShadow = soundOn
    ? "0 0 0 3px rgba(38,212,123,.14)"
    : "0 0 0 3px rgba(255,90,106,.14)";
  beep("safe");
};
bonusBtn.onclick = () => addCoins(1000);

// ====== Game constants/state ======
const SIZE = 25; // 5x5
const COLS = 5;

let state = null;
// state = {
//   bet, minesCount, mines:Set, opened:Set, over:boolean,
//   safeOpened:number, multiplier:number,
//   inRound:boolean, cashed:boolean, lastHit:number|null
// }

function buildMines(minesCount) {
  const mines = new Set();
  while (mines.size < minesCount) mines.add(randInt(0, SIZE - 1));
  return mines;
}

// ====== MULTIPLIER (фикс: после 15 мин не падает) ======
// Идея: "ускорение" зависит от мин, и квадратичный рост по safe тоже усиливается.
// Держим адекватные ранние X и усиливаем большие мины.
function calcMultiplier(safeOpened, minesCount) {
  if (safeOpened <= 0) return 1;

  const m = minesCount;                 // 3..24
  const k1 = 0.095 + m * 0.012;         // линейный рост (сильно зависит от мин)
  const k2 = 0.010 + m * 0.0022;        // ускорение (квадрат)
  const mult = 1 + safeOpened * k1 + (safeOpened * safeOpened) * k2 * 0.06;

  return Math.max(1, mult);
}

function payoutNow() {
  if (!state) return 0;
  return Math.floor(state.bet * state.multiplier);
}

// ====== BET controls ======
function clampBet(){
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
}
betInput.addEventListener("input", clampBet);
betMinus.onclick = () => { betInput.value = String((Number(betInput.value)||1) - 10); clampBet(); };
betPlus.onclick  = () => { betInput.value = String((Number(betInput.value)||1) + 10); clampBet(); };

document.querySelectorAll(".chip").forEach((b) => {
  b.onclick = () => {
    const val = b.dataset.bet;
    betInput.value = (val === "max") ? String(wallet.coins) : String(val);
    clampBet();
  };
});

function clampMines(){
  let v = Math.floor(Number(minesRange.value) || 3);
  if (v < 3) v = 3;
  if (v > 24) v = 24;
  minesRange.value = String(v);
  minesShow.textContent = String(v);

  // показываем лесенку заранее (без игры)
  if (!state) renderLadder(0, v);
}
minesRange.addEventListener("input", clampMines);

// ====== Ladder render (без "..." и с подсветкой) ======
function renderLadder(openedSafe, minesCount){
  const totalSafe = SIZE - minesCount;
  safeTotalView.textContent = String(totalSafe);
  ladderEl.innerHTML = "";

  for (let step = 1; step <= totalSafe; step++){
    const x = calcMultiplier(step, minesCount);

    const div = document.createElement("div");
    div.className = "lstep" + (step === openedSafe ? " active" : "");
    if (x >= 10) div.classList.add("big");
    div.innerHTML = `<span class="k">#${step}</span><span class="x">x${x.toFixed(2)}</span>`;
    ladderEl.appendChild(div);
  }
}

// ====== Draw grid ======
function drawGrid(){
  gridEl.innerHTML = "";

  for (let i = 0; i < SIZE; i++){
    const btn = document.createElement("button");
    btn.className = "cell";
    btn.type = "button";

    let opened = false, isMine = false;

    if (state){
      opened = state.opened.has(i);
      isMine = state.mines.has(i);

      if (opened && isMine) btn.classList.add("mine");
      if (opened && !isMine) btn.classList.add("safe");
      if (state.over) btn.disabled = true;
    } else {
      btn.disabled = true;
    }

    const icon = document.createElement("div");
    icon.className = "icon";

    if (opened){
      icon.textContent = isMine ? "💣" : "💎";
    } else {
      icon.textContent = "💎"; // как на твоём скрине: “плитки” с алмазами
      icon.style.opacity = "0.35";
    }

    btn.appendChild(icon);

    btn.onclick = () => onCellClick(i);
    gridEl.appendChild(btn);
  }
}

// ====== UI render ======
function renderUI(){
  if (!state){
    msgEl.textContent = "Выбери ставку и количество мин, затем нажми Start.";
    safeView.textContent = "0";
    multView.textContent = "x1.00";
    takeView.textContent = "—";
    cashBtn.disabled = true;
    drawGrid();
    return;
  }

  safeView.textContent = String(state.safeOpened);
  multView.textContent = `x${state.multiplier.toFixed(2)}`;
  takeView.textContent = String(payoutNow());

  cashBtn.disabled = state.over || state.safeOpened <= 0 || state.cashed;

  renderLadder(state.safeOpened, state.minesCount);
  drawGrid();
}

// ====== Start / Reset / Cashout ======
startBtn.onclick = () => {
  if (state && !state.over) return;

  const bet = Math.floor(Number(betInput.value) || 0);
  const minesCount = Math.floor(Number(minesRange.value) || 3);

  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");
  if (minesCount < 3 || minesCount > 24) return alert("Мины: от 3 до 24");

  // списываем ставку при Start
  addCoins(-bet);

  state = {
    bet,
    minesCount,
    mines: buildMines(minesCount),
    opened: new Set(),
    over: false,
    safeOpened: 0,
    multiplier: 1,
    inRound: true,
    cashed: false,
    lastHit: null
  };

  msgEl.textContent = "Раунд начался. Открывай клетки.";
  renderUI();
};

resetBtn.onclick = () => {
  // СБРОС: если раунд начат и НЕ проигран и НЕ кэшаут — вернуть ставку
  if (state && state.inRound && !state.over && !state.cashed){
    addCoins(state.bet);
  }
  state = null;
  clampMines();
  clampBet();
  renderUI();
};

cashBtn.onclick = () => {
  if (!state || state.over || state.cashed) return;
  if (state.safeOpened <= 0) return;

  state.cashed = true;
  state.over = true;

  const pay = payoutNow();
  addCoins(pay);

  msgEl.textContent = `✅ Забрал: +${pay} 🪙 (x${state.multiplier.toFixed(2)})`;
  renderUI();
};

// ====== Click logic ======
function revealAll(){
  if (!state) return;
  for (let i = 0; i < SIZE; i++) state.opened.add(i);
}

function onCellClick(i){
  if (!state || state.over) return;
  if (state.opened.has(i)) return;

  state.opened.add(i);

  if (state.mines.has(i)){
    state.over = true;
    state.lastHit = i;
    state.inRound = true; // было
    msgEl.textContent = `💥 Мина! Ставка ${state.bet} 🪙 сгорела.`;
    beep("boom");
    revealAll();
    renderUI();
    return;
  }

  state.safeOpened += 1;
  state.multiplier = calcMultiplier(state.safeOpened, state.minesCount);
  beep("safe");

  // если открыл все safe — авто cashout
  const totalSafe = SIZE - state.minesCount;
  if (state.safeOpened >= totalSafe){
    state.cashed = true;
    state.over = true;
    const pay = payoutNow();
    addCoins(pay);
    msgEl.textContent = `🏁 Все safe! Авто-забор: +${pay} 🪙 (x${state.multiplier.toFixed(2)})`;
    renderUI();
    return;
  }

  msgEl.textContent = `✅ Safe! Множитель растёт.`;
  renderUI();
}

// ====== init ======
clampBet();
clampMines();
renderUI();
