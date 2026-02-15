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

// --- Sound: safe / win / boom ---
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
function safeChime() {
  // мягкий “алмазный” звук
  beep(720, 45, 0.02, "sine");
  setTimeout(() => beep(920, 55, 0.02, "sine"), 40);
}
function winChime() {
  beep(760, 70, 0.03, "sine");
  setTimeout(() => beep(980, 70, 0.03, "sine"), 60);
}
function explosion(ms = 280, vol = 0.09) {
  if (!soundOn) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const bufferSize = Math.floor(ctx.sampleRate * (ms / 1000));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

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

    setTimeout(() => { try { src.stop(); } catch {} ctx.close(); }, ms + 30);
  } catch {}
}

// --- UI ---
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

bonusBtn.onclick = () => { addCoins(1000); beep(760, 70, 0.03); };

// --- game config ---
const SIZE = 25; // 5x5
const COLS = 5;

// Делает “большие иксы” на больших минах.
// Модель: шаги -> growing edge (чем ближе к totalSafe, тем быстрее рост).
function calcMultiplier(safeOpened, minesCount){
  const totalSafe = SIZE - minesCount;
  if (safeOpened <= 0) return 1;

  // base growth increases with mines
  const m = minesCount;

  // основа (линейная + квадратичная) — усилена
  const lin = safeOpened * (0.11 + 0.030 * m);
  const quad = (safeOpened * safeOpened) * (0.005 + 0.0018 * m);

  // “ускорение” ближе к финишу (чтобы на больших минах был большой X)
  const progress = safeOpened / totalSafe; // 0..1
  const boost = 1 + (progress * progress) * (0.25 + 0.018 * m);

  const mult = 1 + (lin + quad) * boost;
  return Math.max(1, Math.min(mult, 999.99));
}

function buildMinesSet(minesCount){
  const set = new Set();
  while (set.size < minesCount) set.add(randInt(0, SIZE - 1));
  return set;
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
  lockedBet: 0,
  cashed: false,
  lastHit: null
};

// --- helpers ---
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

betInput.addEventListener("input", () => { clampBet(); if (!state.inRound) renderPreview(); });
betMinus.onclick = () => { betInput.value = String((Number(betInput.value)||1) - 10); clampBet(); };
betPlus.onclick  = () => { betInput.value = String((Number(betInput.value)||1) + 10); clampBet(); };

minesRange.oninput = () => {
  renderMinesCount();
  if (!state.inRound) renderPreview(); // ВАЖНО: лесенка до старта
  beep(520, 40, 0.015);
};

// --- grid render ---
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
    }

    btn.appendChild(inner);

    btn.disabled = !state.inRound || state.over || opened;
    btn.onclick = () => onCellClick(i);

    gridEl.appendChild(btn);
  }
}

// --- ladder render (красивая сетка) ---
function renderLadder(preview = false){
  ladderEl.innerHTML = "";

  const totalSafe = SIZE - state.minesCount;
  const opened = preview ? 0 : state.safeOpened;

  // показываем первые 18 шагов (достаточно, красиво, симметрично)
  const show = Math.min(18, totalSafe);

  for (let step = 1; step <= show; step++){
    const x = calcMultiplier(step, state.minesCount);

    const box = document.createElement("div");
    box.className = "stepBox";

    // подсветка текущего “следующего” шага в раунде
    if (!preview && step === opened + 1) box.classList.add("next");

    const n = document.createElement("div");
    n.className = "stepN";
    n.textContent = `Шаг ${step}`;

    const xx = document.createElement("div");
    xx.className = "stepX";
    xx.textContent = `x${x.toFixed(2)}`;

    box.appendChild(n);
    box.appendChild(xx);
    ladderEl.appendChild(box);
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

// --- preview before start ---
function renderPreview(){
  state.safeOpened = 0;
  state.mult = 1;
  setMsg("", "");
  renderHUD();
  renderLadder(true); // preview by mines
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

  state.inRound = true;
  state.over = false;
  state.cashed = false;
  state.lastHit = null;

  state.mines = buildMinesSet(m);
  state.opened = new Set();
  state.safeOpened = 0;
  state.mult = 1;

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
  state.lockedBet = 0;

  setMsg(`✅ Забрал: +${payout} 🪙 (x${state.mult.toFixed(2)})`, "good");
  winChime();

  revealAll();
  renderAll();
}

// --- reset (возврат ставки если не проиграл/не кэш-аут) ---
function resetRound(){
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
  renderPreview(); // вернули превью лесенки
}

// --- gameplay ---
function revealAll(){
  for (let i = 0; i < SIZE; i++) state.opened.add(i);
}

function onCellClick(i){
  if (!state.inRound || state.over) return;
  if (state.opened.has(i)) return;

  state.opened.add(i);

  if (state.mines.has(i)){
    state.over = true;
    state.lastHit = i;

    // ставка сгорает
    state.lockedBet = 0;

    setMsg(`💥 Мина! Раунд проигран.`, "bad");
    explosion();

    revealAll();
    renderAll();
    return;
  }

  // safe
  state.safeOpened += 1;
  state.mult = calcMultiplier(state.safeOpened, state.minesCount);

  safeChime();

  const totalSafe = SIZE - state.minesCount;
  if (state.safeOpened >= totalSafe){
    setMsg("🏁 Открыл все safe! Авто-забор.", "good");
    renderAll();
    cashOut();
    return;
  }

  renderAll();
}

// --- wire ---
startBtn.onclick = startRound;
cashBtn.onclick = cashOut;
resetBtn.onclick = resetRound;

// --- render all ---
function renderAll(){
  renderGrid();
  renderHUD();
  renderLadder(false); // in game view
}

// init
clampBet();
renderMinesCount();
renderAll();
renderPreview();
