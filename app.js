// ===== RNG (честный) =====
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function randInt(min, max) {
  return Math.floor(randFloat() * (max - min + 1)) + min;
}

// ===== Telegram WebApp =====
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

// ===== Wallet =====
const WALLET_KEY = "mini_wallet_mines_v1";
function loadWallet() {
  try {
    const w = JSON.parse(localStorage.getItem(WALLET_KEY) || "null");
    if (w && typeof w.coins === "number") return w;
  } catch {}
  return { coins: 1000 };
}
function saveWallet(w) { localStorage.setItem(WALLET_KEY, JSON.stringify(w)); }
let wallet = loadWallet();

function setCoins(v) {
  wallet.coins = Math.max(0, Math.floor(v));
  saveWallet(wallet);
  renderTop();
}
function addCoins(d) { setCoins(wallet.coins + d); }

// ===== Sound (тихий) =====
let soundOn = true;
function beep(freq = 520, ms = 55, vol = 0.028) {
  if (!soundOn) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, ms);
  } catch {}
}

// ===== UI refs =====
const subTitle = document.getElementById("subTitle");
const balanceEl = document.getElementById("balance");

const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");
const bonusBtn2 = document.getElementById("bonusBtn2");

const gridEl = document.getElementById("grid");
const openedView = document.getElementById("openedView");
const safeTotalView = document.getElementById("safeTotalView");
const multView = document.getElementById("multView");
const cashNowView = document.getElementById("cashNowView");

const msgEl = document.getElementById("msg");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");
const minesRange = document.getElementById("minesRange");
const minesView = document.getElementById("minesView");

const startBtn = document.getElementById("startBtn");
const cashoutBtn = document.getElementById("cashoutBtn");
const resetBtn = document.getElementById("resetBtn");

// ===== Header render =====
function renderTop(){
  const user = tg?.initDataUnsafe?.user;
  subTitle.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
  balanceEl.textContent = String(wallet.coins);
}
renderTop();

// ===== Sound toggle =====
soundBtn.onclick = () => {
  soundOn = !soundOn;
  const dot = soundBtn.querySelector(".dot");
  dot.style.background = soundOn ? "#26d47b" : "#ff5a6a";
  dot.style.boxShadow = soundOn
    ? "0 0 0 3px rgba(38,212,123,.14)"
    : "0 0 0 3px rgba(255,90,106,.14)";
  soundText.textContent = "Звук";
  beep(soundOn ? 640 : 240, 60, 0.03);
};

// ===== Bonus =====
function giveBonus(){
  addCoins(1000);
  beep(820, 70, 0.03);
}
bonusBtn.onclick = giveBonus;
bonusBtn2.onclick = giveBonus;

// ===== Mines state =====
const SIZE = 25; // 5x5
const COLS = 5;

let state = {
  inRound: false,
  bet: 100,
  mines: 3,
  minesSet: new Set(),
  opened: new Set(),
  safeOpened: 0,
  mult: 1.0,
  over: false,
  lastBoom: -1,
};

// ===== Multiplier =====
// “приятная” формула (быстрее растёт при большем числе мин)
function calcMultiplier(safeOpened, minesCount){
  const m = minesCount;
  const a = 0.090 + m * 0.0070;
  const b = 0.020 + m * 0.0016;
  const mult = 1 + safeOpened * a + (safeOpened * safeOpened) * b * 0.055;
  return Math.max(1, mult);
}

function buildMines(minesCount){
  const s = new Set();
  while (s.size < minesCount) s.add(randInt(0, SIZE - 1));
  return s;
}

function setMsg(text, type = ""){
  msgEl.classList.remove("ok","bad");
  if (type) msgEl.classList.add(type);
  msgEl.textContent = text || "";
}

function clampBet(){
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  state.bet = v;
}
betInput.addEventListener("input", () => {
  clampBet();
  // если не в раунде — просто обновить подсказки
  if (!state.inRound) render();
});
betMinus.onclick = () => { betInput.value = String((Number(betInput.value)||1) - 10); clampBet(); if (!state.inRound) render(); };
betPlus.onclick  = () => { betInput.value = String((Number(betInput.value)||1) + 10); clampBet(); if (!state.inRound) render(); };

document.querySelectorAll(".chip").forEach((b) => {
  b.onclick = () => {
    const val = b.dataset.bet;
    betInput.value = (val === "max") ? String(wallet.coins) : String(val);
    clampBet();
    beep(540, 55, 0.02);
    if (!state.inRound) render();
  };
});

function setMinesCount(v){
  state.mines = Math.max(1, Math.min(24, Math.floor(v)));
  minesView.textContent = String(state.mines);
  safeTotalView.textContent = String(SIZE - state.mines);
}
minesRange.oninput = () => {
  if (state.inRound) {
    // на раунде нельзя
    minesRange.value = String(state.mines);
    return;
  }
  setMinesCount(minesRange.value);
  beep(500, 35, 0.02);
  render();
};

// ===== Create cell icons (inline SVG) =====
function gemSVG(){
  return `
  <svg class="icon gem" viewBox="0 0 64 64" width="28" height="28" aria-hidden="true">
    <defs>
      <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#7fe6ff"/>
        <stop offset="1" stop-color="#1aa6ff"/>
      </linearGradient>
    </defs>
    <path d="M20 10h24l10 14-22 30L10 24 20 10z" fill="url(#g1)" opacity=".95"/>
    <path d="M20 10l12 44L10 24 20 10z" fill="#39c7ff" opacity=".35"/>
    <path d="M44 10L32 54l22-30L44 10z" fill="#0f7cff" opacity=".28"/>
    <path d="M20 10h24l-6 14H26L20 10z" fill="#b8f2ff" opacity=".55"/>
  </svg>`;
}
function bombSVG(){
  return `
  <svg class="icon bomb" viewBox="0 0 64 64" width="28" height="28" aria-hidden="true">
    <path d="M42 14c4-1 8 1 10 5l-4 2c-1-2-3-3-5-2l-1-5z" fill="#ff6b7a"/>
    <circle cx="30" cy="36" r="18" fill="#2a2f3a"/>
    <circle cx="24" cy="30" r="6" fill="#3a4150" opacity=".55"/>
    <path d="M44 20l6-4 4 6-6 4-4-6z" fill="#ff6b7a"/>
  </svg>`;
}

// ===== Render grid =====
function render(){
  openedView.textContent = String(state.safeOpened);
  multView.textContent = `x${state.mult.toFixed(2)}`;

  const cashNow = (state.inRound && !state.over && state.safeOpened > 0)
    ? Math.floor(state.bet * state.mult)
    : null;

  cashNowView.textContent = cashNow === null ? "—" : `${cashNow} 🪙`;

  // buttons
  startBtn.disabled = state.inRound && !state.over;         // нельзя стартовать пока идёт раунд
  cashoutBtn.disabled = !(state.inRound && !state.over && state.safeOpened > 0);

  // right controls lock during round
  minesRange.disabled = state.inRound && !state.over;
  betInput.disabled = state.inRound && !state.over;
  betMinus.disabled = state.inRound && !state.over;
  betPlus.disabled = state.inRound && !state.over;

  // build cells
  gridEl.innerHTML = "";
  for (let i = 0; i < SIZE; i++){
    const btn = document.createElement("button");
    btn.className = "cell unopened";
    btn.type = "button";

    const inner = document.createElement("div");
    inner.className = "cellInner";
    btn.appendChild(inner);

    const isOpened = state.opened.has(i);
    const isMine = state.minesSet.has(i);

    if (isOpened){
      btn.classList.remove("unopened");
      if (isMine){
        btn.classList.add("mine");
        inner.innerHTML = bombSVG();
        if (state.lastBoom === i) btn.classList.add("boom");
      } else {
        btn.classList.add("safe");
        inner.innerHTML = gemSVG();
      }
      btn.disabled = true;
    } else {
      // unopened: show faint gem like in screenshot (always visible)
      inner.innerHTML = gemSVG();
      btn.disabled = state.over; // если раунд закончен — блок
      btn.onclick = () => onPick(i);
    }

    gridEl.appendChild(btn);
  }

  if (!state.inRound){
    setMsg("Выбери ставку, количество мин и нажми Start.", "");
  }
}

// ===== Game flow =====
function startRound(){
  clampBet();

  const bet = state.bet;
  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");

  // списываем ставку 1 раз
  addCoins(-bet);

  state.inRound = true;
  state.over = false;
  state.lastBoom = -1;
  state.opened = new Set();
  state.safeOpened = 0;
  state.mult = 1.0;
  state.minesSet = buildMines(state.mines);

  beep(520, 55, 0.02);
  setMsg("Раунд начался. Открывай safe клетки.", "ok");
  render();
}

function revealAll(){
  for (let i = 0; i < SIZE; i++) state.opened.add(i);
}

function loseRound(hitIndex){
  state.over = true;
  state.lastBoom = hitIndex;
  revealAll();
  beep(220, 90, 0.03);
  setMsg("💥 Мина! Раунд проигран.", "bad");
  render();
}

function winCashout(auto = false){
  if (!(state.inRound && !state.over)) return;

  state.over = true;

  const payout = Math.floor(state.bet * state.mult);
  addCoins(payout);

  beep(760, 65, 0.03);
  beep(920, 65, 0.03);

  revealAll();
  setMsg(auto
    ? `🏁 Открыл все safe! Авто-забор: +${payout} 🪙 (x${state.mult.toFixed(2)})`
    : `✅ Забрал: +${payout} 🪙 (x${state.mult.toFixed(2)})`
  , "ok");
  render();
}

function onPick(i){
  if (!state.inRound || state.over) return;
  if (state.opened.has(i)) return;

  state.opened.add(i);

  if (state.minesSet.has(i)){
    loseRound(i);
    return;
  }

  // safe
  state.safeOpened += 1;
  state.mult = calcMultiplier(state.safeOpened, state.mines);

  beep(560, 40, 0.02);

  // авто-забор если открыл все safe
  const safeTotal = SIZE - state.mines;
  if (state.safeOpened >= safeTotal){
    winCashout(true);
    return;
  }

  render();
}

// ===== Reset =====
function reset(){
  state.inRound = false;
  state.over = false;
  state.lastBoom = -1;
  state.opened = new Set();
  state.safeOpened = 0;
  state.mult = 1.0;
  state.minesSet = new Set();
  minesRange.disabled = false;
  betInput.disabled = false;
  betMinus.disabled = false;
  betPlus.disabled = false;

  setMinesCount(minesRange.value);
  clampBet();
  render();
}

// ===== Wire buttons =====
startBtn.onclick = () => {
  if (state.inRound && !state.over) return;
  startRound();
};

cashoutBtn.onclick = () => {
  if (!(state.inRound && !state.over)) return;
  if (state.safeOpened <= 0) return;
  winCashout(false);
};

resetBtn.onclick = () => {
  beep(420, 50, 0.02);
  reset();
};

// init
setMinesCount(minesRange.value);
clampBet();
reset();
