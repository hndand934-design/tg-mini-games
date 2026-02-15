// app.js

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

// --- Wallet ---
const WALLET_KEY = "mini_wallet_mines_v1";
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
function addCoins(d) { setCoins(wallet.coins + d); }

// --- Sound (лёгкий + взрыв) ---
let soundOn = true;

function beep(freq = 520, ms = 55, vol = 0.03, type = "sine") {
  if (!soundOn) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, ms);
  } catch {}
}

function explosion(ms = 260, vol = 0.08) {
  if (!soundOn) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();

    const bufferSize = Math.floor(ctx.sampleRate * (ms / 1000));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // шум + затухание
    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      const env = Math.pow(1 - t, 2.2);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;

    const g = ctx.createGain();
    g.gain.value = vol;

    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);

    src.start();

    setTimeout(() => { try { src.stop(); } catch {} ctx.close(); }, ms + 20);
  } catch {}
}

// --- UI refs ---
const subTitle = document.getElementById("subTitle");
const balanceEl = document.getElementById("balance");

const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");

const gridEl = document.getElementById("grid");
const msgEl = document.getElementById("msg");

const openedView = document.getElementById("openedView");
const multView = document.getElementById("multView");
const cashNowView = document.getElementById("cashNowView");
const ladderEl = document.getElementById("ladder");

const cashBtn = document.getElementById("cashBtn");
const resetBtn = document.getElementById("resetBtn");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");
const minesRange = document.getElementById("minesRange");
const minesVal = document.getElementById("minesVal");
const startBtn = document.getElementById("startBtn");

// --- top render ---
function renderTop(){
  const user = tg?.initDataUnsafe?.user;
  subTitle.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
  balanceEl.textContent = String(wallet.coins);
}
renderTop();

// sound toggle
soundBtn.onclick = () => {
  soundOn = !soundOn;
  soundText.textContent = soundOn ? "Звук on" : "Звук off";
  const dot = soundBtn.querySelector(".dot");
  dot.style.background = soundOn ? "#26d47b" : "#ff5a6a";
  dot.style.boxShadow = soundOn
    ? "0 0 0 3px rgba(38,212,123,.14)"
    : "0 0 0 3px rgba(255,90,106,.14)";
  beep(soundOn ? 640 : 240, 60, 0.03);
};

// bonus
bonusBtn.onclick = () => { addCoins(1000); beep(760, 70, 0.03); };

// --- game config ---
const SIZE = 25; // 5x5
const COLS = 5;

function buildMinesSet(minesCount){
  const set = new Set();
  while (set.size < minesCount) set.add(randInt(0, SIZE - 1));
  return set;
}

/**
 * Новый рост X: сильнее зависит от мин.
 * Гарантия: при safeOpened=6 разница (5 мин vs 3 мины) ~ +15%.
 */
function calcMultiplier(safeOpened, minesCount){
  const m = minesCount;

  const mult =
    1 +
    safeOpened * (0.10 + 0.0205 * m) +
    (safeOpened * safeOpened) * (0.004 + 0.00135 * m);

  return Math.max(1, Math.min(mult, 99.99));
}

// --- state ---
let state = {
  inRound: false,
  over: false,
  bet: 100,
  minesCount: 3,
  mines: new Set(),
  opened: new Set(),
  safeOpened: 0,
  mult: 1,
  lockedBet: 0,      // сколько списали при Start (для возврата при Reset)
  cashed: false,
  lastHit: null
};

// --- helpers UI ---
function setMsg(text, kind = ""){
  msgEl.textContent = text || "";
  msgEl.classList.remove("good","bad");
  if (kind) msgEl.classList.add(kind);
}

function clampBet(){
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  state.bet = v;
}

function renderMinesCount(){
  const v = Math.floor(Number(minesRange.value) || 1);
  minesRange.value = String(v);
  minesVal.textContent = String(v);
  state.minesCount = v;
}

// chips
document.querySelectorAll(".chip").forEach((b) => {
  b.onclick = () => {
    const val = b.dataset.bet;
    betInput.value = (val === "max") ? String(wallet.coins) : String(val);
    clampBet();
    beep(540, 55, 0.02);
  };
});

betInput.addEventListener("input", () => { clampBet(); resetCoinVisuals(); });
betMinus.onclick = () => { betInput.value = String((Number(betInput.value)||1) - 10); clampBet(); };
betPlus.onclick  = () => { betInput.value = String((Number(betInput.value)||1) + 10); clampBet(); };

minesRange.oninput = () => {
  renderMinesCount();
  beep(520, 40, 0.015);
};

// если меняют ставку/мины вне раунда — просто обновим превью
function resetCoinVisuals(){
  if (!state.inRound) {
    state.mult = 1;
    state.safeOpened = 0;
    setMsg("");
    renderHUD();
    renderLadder();
  }
}

// --- render grid ---
function renderGrid(){
  gridEl.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
  gridEl.innerHTML = "";

  for (let i = 0; i < SIZE; i++){
    const btn = document.createElement("button");
    btn.className = "cell";

    const inner = document.createElement("div");
    inner.className = "cellInner";

    const opened = state.opened.has(i);
    const isMine = state.mines.has(i);

    if (opened){
      if (isMine){
        inner.textContent = "💣";
        btn.classList.add("mine");
        if (state.lastHit === i) btn.classList.add("boom");
      } else {
        inner.textContent = "💎";
        btn.classList.add("safe");
      }
    } else {
      inner.textContent = "";
    }

    btn.appendChild(inner);

    const disabled = !state.inRound || state.over || opened;
    btn.disabled = disabled;

    btn.onclick = () => onCellClick(i);

    gridEl.appendChild(btn);
  }
}

// --- ladder ---
function renderLadder(){
  ladderEl.innerHTML = "";

  const totalSafe = SIZE - state.minesCount;
  const left = Math.max(0, totalSafe - state.safeOpened);

  const stepsToShow = Math.min(8, Math.max(3, left)); // 3..8
  for (let k = 1; k <= stepsToShow; k++){
    const next = state.safeOpened + k;
    const x = calcMultiplier(next, state.minesCount);

    const el = document.createElement("div");
    el.className = "step" + (k === 1 ? " next" : "");
    el.textContent = `x${x.toFixed(2)}`;
    ladderEl.appendChild(el);
  }
}

// --- HUD ---
function renderHUD(){
  const totalSafe = SIZE - state.minesCount;
  openedView.textContent = `${state.safeOpened} / ${totalSafe}`;
  multView.textContent = `x${state.mult.toFixed(2)}`;

  const cashNow = state.inRound ? Math.floor(state.lockedBet * state.mult) : 0;
  cashNowView.textContent = state.inRound ? `${cashNow} 🪙` : "—";

  cashBtn.disabled = !state.inRound || state.over || state.safeOpened <= 0;
  startBtn.disabled = state.inRound && !state.over;

  // блокируем изменение мин во время раунда
  minesRange.disabled = state.inRound && !state.over;
}

// --- start ---
function startRound(){
  clampBet();
  renderMinesCount();

  const bet = state.bet;
  const m = state.minesCount;

  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");
  if (m < 1 || m > SIZE - 1) return alert(`Мин должно быть от 1 до ${SIZE - 1}`);

  // новый раунд
  state.inRound = true;
  state.over = false;
  state.cashed = false;
  state.lastHit = null;

  state.mines = buildMinesSet(m);
  state.opened = new Set();
  state.safeOpened = 0;
  state.mult = 1;

  // списываем ставку и “замораживаем” (для возврата при Reset)
  state.lockedBet = bet;
  addCoins(-bet);

  setMsg("Раунд начался. Открывай safe клетки.", "");
  beep(600, 60, 0.02);

  renderAll();
}

// --- cashout ---
function cashOut(){
  if (!state.inRound || state.over || state.cashed) return;
  if (state.safeOpened <= 0) return;

  state.cashed = true;
  state.over = true;

  const payout = Math.floor(state.lockedBet * state.mult);
  addCoins(payout);

  // ставка “зачтена”, больше не возвращаем на reset
  state.lockedBet = 0;

  setMsg(`✅ Забрал: +${payout} 🪙 (x${state.mult.toFixed(2)})`, "good");
  beep(760, 70, 0.03);
  beep(920, 70, 0.03);

  revealAll();
  renderAll();
}

// --- reset (с возвратом ставки, если не проиграл и не кэш-аут) ---
function resetRound(){
  // если раунд активен и не завершён — возвращаем ставку
  if (state.inRound && !state.over && state.lockedBet > 0){
    addCoins(state.lockedBet);
    state.lockedBet = 0;
  }

  state.inRound = false;
  state.over = false;
  state.cashed = false;
  state.lastHit = null;

  state.mines = new Set();
  state.opened = new Set();
  state.safeOpened = 0;
  state.mult = 1;

  setMsg("", "");
  beep(420, 50, 0.02);

  renderAll();
}

// --- gameplay ---
function revealAll(){
  for (let i = 0; i < SIZE; i++) state.opened.add(i);
}

function onCellClick(i){
  if (!state.inRound || state.over) return;
  if (state.opened.has(i)) return;

  state.opened.add(i);

  // mine
  if (state.mines.has(i)){
    state.over = true;
    state.lastHit = i;

    // ставка сгорает (как и должна)
    state.lockedBet = 0;

    setMsg(`💥 Мина! Раунд проигран.`, "bad");
    explosion(280, 0.09);

    revealAll();
    renderAll();
    return;
  }

  // safe
  state.safeOpened += 1;
  state.mult = calcMultiplier(state.safeOpened, state.minesCount);

  beep(560, 45, 0.018);

  const totalSafe = SIZE - state.minesCount;
  if (state.safeOpened >= totalSafe){
    // авто кэш-аут на фулл сейф
    setMsg("🏁 Открыл все safe! Авто-забор.", "good");
    renderAll();
    cashOut();
    return;
  }

  renderAll();
}

// --- wire buttons ---
startBtn.onclick = startRound;
cashBtn.onclick = cashOut;
resetBtn.onclick = resetRound;

// --- initial render ---
function renderAll(){
  renderGrid();
  renderHUD();
  renderLadder();
}

clampBet();
renderMinesCount();
renderAll();
