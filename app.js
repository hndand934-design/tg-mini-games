// ===================== RNG =====================
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function randInt(min, max) { // inclusive
  return Math.floor(randFloat() * (max - min + 1)) + min;
}

// ===================== Telegram =====================
const tg = window.Telegram?.WebApp;
if (tg) { try { tg.ready(); tg.expand(); } catch {} }

// ===================== Wallet =====================
const WALLET_KEY = "mini_wallet_penalty_v1";
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

// ===================== Sound =====================
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

function noiseBurst(ms = 130, vol = 0.05) {
  if (!soundOn) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * (ms / 1000)));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const g = ctx.createGain();
    g.gain.value = vol;

    const biquad = ctx.createBiquadFilter();
    biquad.type = "lowpass";
    biquad.frequency.value = 900;

    src.connect(biquad);
    biquad.connect(g);
    g.connect(ctx.destination);

    src.start();
    setTimeout(() => { try { ctx.close(); } catch {} }, ms + 40);
  } catch {}
}

// ===================== Multipliers =====================
// 10 шагов (0..10). На шаге 0 — x1.00
const LADDERS = {
  easy: [1.00, 1.18, 1.42, 1.75, 2.20, 2.85, 3.80, 5.30, 7.80, 12.0, 18.0],
  hard: [1.00, 1.25, 1.60, 2.10, 2.85, 3.90, 5.80, 9.20, 15.0, 27.0, 50.0],
};
const DIFF_LABEL = { easy:"Лёгкий", hard:"Сложный" };
const DIFF_HINT = {
  easy:"Лёгкий: вратарь перекрывает только 2 зоны (две руки).",
  hard:"Сложный: вратарь перекрывает 2 зоны, но «дотягивается» на 1 клетку вокруг рук."
};
// сложный — радиус сейва вокруг рук
const HARD_REACH = 1; // манхэттен 1

// ===================== UI refs =====================
const subTitle = document.getElementById("subTitle");
const balanceEl = document.getElementById("balance");
const balance2 = document.getElementById("balance2");

const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");

const diffBtns = Array.from(document.querySelectorAll(".diffBtn"));
const diffHint = document.getElementById("diffHint");

const ladderEl = document.getElementById("ladder");

const stepView = document.getElementById("stepView");
const xView = document.getElementById("xView");
const potView = document.getElementById("potView");
const stepMini = document.getElementById("stepMini");
const xMini = document.getElementById("xMini");

const seriesToggle = document.getElementById("seriesToggle");

const betBtn = document.getElementById("betBtn");
const cashBtn = document.getElementById("cashBtn");
const resetBtn = document.getElementById("resetBtn");

const statusText = document.getElementById("statusText");

const infoDiff = document.getElementById("infoDiff");
const infoBet = document.getElementById("infoBet");
const infoCash = document.getElementById("infoCash");
const infoSeries = document.getElementById("infoSeries");

const goalEl = document.getElementById("goal");
const gridEl = document.getElementById("grid");
const gloveA = document.getElementById("gloveA");
const gloveB = document.getElementById("gloveB");
const ballEl = document.getElementById("ball");
const flashEl = document.getElementById("flash");

// ===================== State =====================
let diff = "easy";
let step = 0;
let bet = 100;
let inRound = false;
let busy = false;

let patrolTimer = null;
let lastPair = null; // {a,b} indices (adjacent)

// ===================== Render top =====================
function renderTop(){
  const user = tg?.initDataUnsafe?.user;
  subTitle.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
  balanceEl.textContent = String(wallet.coins);
  balance2.textContent = String(wallet.coins);
}
renderTop();

// ===================== Sound toggle =====================
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

// ===================== Grid =====================
const ROWS = 3, COLS = 5;
const CELLS = ROWS * COLS;

function idxToRC(i){ return { r: Math.floor(i / COLS), c: i % COLS }; }
function rcToIdx(r,c){ return r * COLS + c; }
function manhattan(a,b){
  const A = idxToRC(a), B = idxToRC(b);
  return Math.abs(A.r - B.r) + Math.abs(A.c - B.c);
}

function buildGrid(){
  gridEl.innerHTML = "";
  for (let i = 0; i < CELLS; i++){
    const b = document.createElement("button");
    b.className = "cell";
    b.type = "button";
    b.dataset.idx = String(i);
    b.addEventListener("click", () => onShoot(i));
    gridEl.appendChild(b);
  }
}
buildGrid();

// ===================== Bet controls =====================
function clampBet(){
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  bet = v;
  infoBet.textContent = String(bet);

  // блокируем изменение ставки в раунде
  betInput.disabled = inRound;
  betMinus.disabled = inRound;
  betPlus.disabled = inRound;
  document.querySelectorAll(".chip").forEach(c => c.disabled = inRound);
}
betInput.addEventListener("input", clampBet);
betMinus.onclick = () => { betInput.value = String((Number(betInput.value)||1) - 10); clampBet(); };
betPlus.onclick  = () => { betInput.value = String((Number(betInput.value)||1) + 10); clampBet(); };

document.querySelectorAll(".chip").forEach((b) => {
  b.onclick = () => {
    const val = b.dataset.bet;
    betInput.value = (val === "max") ? String(wallet.coins) : String(val);
    clampBet();
    beep(540, 55, 0.02);
  };
});
clampBet();

// ===================== Difficulty =====================
function setDiff(d){
  if (inRound) return;
  diff = d;
  diffBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.diff === d));
  diffHint.textContent = DIFF_HINT[d];
  infoDiff.textContent = DIFF_LABEL[d];
  renderLadder();
  beep(520, 50, 0.02);
}
diffBtns.forEach(btn => btn.addEventListener("click", () => setDiff(btn.dataset.diff)));
setDiff("easy");

// ===================== Ladder =====================
function renderLadder(){
  const arr = LADDERS[diff];
  ladderEl.innerHTML = "";
  for (let i = 1; i < arr.length; i++){
    const el = document.createElement("div");
    el.className = "lStep" + (i === step ? " active" : "");
    el.innerHTML = `<div class="t">Шаг ${i}</div><div class="x">x${arr[i].toFixed(2)}</div>`;
    ladderEl.appendChild(el);
  }
}
renderLadder();

// ===================== Series toggle =====================
seriesToggle.addEventListener("change", () => {
  infoSeries.textContent = seriesToggle.checked ? "ON" : "OFF";
  beep(520, 50, 0.02);
});

// ===================== UI helpers =====================
function setStatus(t){ statusText.textContent = t; }

function currentX(){
  const arr = LADDERS[diff];
  const s = Math.max(0, Math.min(step, arr.length - 1));
  return arr[s];
}
function calcCashout(){
  if (step < 1) return 0;
  return Math.floor(bet * currentX());
}

function setRoundUI(){
  const cells = gridEl.querySelectorAll(".cell");
  cells.forEach(c => c.classList.toggle("disabled", !inRound || busy));

  betBtn.disabled = busy || inRound;
  cashBtn.disabled = busy || !inRound || step < 1;
  resetBtn.disabled = busy;

  infoCash.textContent = (inRound && step >= 1) ? `${calcCashout()} 🪙` : "—";

  stepView.textContent = String(step);
  stepMini.textContent = String(step);

  const x = currentX();
  xView.textContent = `x${x.toFixed(2)}`;
  xMini.textContent = `x${x.toFixed(2)}`;

  potView.textContent = String(calcCashout());

  clampBet();
  renderLadder();
}

// ===================== Geometry =====================
function cellCenter(idx){
  const cell = gridEl.querySelector(`.cell[data-idx="${idx}"]`);
  const rGoal = goalEl.getBoundingClientRect();
  const r = cell.getBoundingClientRect();
  return {
    x: (r.left - rGoal.left) + r.width / 2,
    y: (r.top - rGoal.top) + r.height / 2
  };
}

function placeGlove(el, x, y, rot=8){
  const rGoal = goalEl.getBoundingClientRect();
  const size = el.getBoundingClientRect();
  const halfW = size.width / 2;
  const halfH = size.height / 2;

  const minX = halfW + 4;
  const maxX = rGoal.width - halfW - 4;
  const minY = halfH + 4;
  const maxY = rGoal.height - halfH - 4;

  const cx = Math.max(minX, Math.min(maxX, x));
  const cy = Math.max(minY, Math.min(maxY, y));

  el.style.left = `${cx}px`;
  el.style.top = `${cy}px`;
  el.style.transform = `translate(-50%,-50%) rotate(${rot}deg)`;
}

// СИНХРОННОЕ движение рук: две клетки (a,b) всегда рядом
function placeHands(pair, rotA, rotB){
  const ca = cellCenter(pair.a);
  const cb = cellCenter(pair.b);
  placeGlove(gloveA, ca.x, ca.y, rotA);
  placeGlove(gloveB, cb.x, cb.y, rotB);
}

// ===================== Ball (no trails) =====================
function resetBall(){
  const rg = goalEl.getBoundingClientRect();
  const startX = rg.width / 2;
  const startY = rg.height - 18;

  ballEl.classList.remove("fly");
  ballEl.style.opacity = "0";
  ballEl.style.left = `${startX}px`;
  ballEl.style.top  = `${startY}px`;
  ballEl.style.transform = "translate(-50%,-50%) scale(1)";
}
resetBall();

function flash(){
  flashEl.classList.add("on");
  setTimeout(() => flashEl.classList.remove("on"), 130);
}

function flyBallTo(idx){
  return new Promise((resolve) => {
    const rg = goalEl.getBoundingClientRect();
    const startX = rg.width / 2;
    const startY = rg.height - 18;
    const target = cellCenter(idx);

    ballEl.classList.remove("fly");
    ballEl.style.opacity = "0";
    ballEl.style.left = `${startX}px`;
    ballEl.style.top  = `${startY}px`;
    ballEl.style.transform = "translate(-50%,-50%) scale(1)";

    void ballEl.offsetWidth;

    ballEl.classList.add("fly");
    ballEl.style.opacity = "1";
    ballEl.style.left = `${target.x}px`;
    ballEl.style.top  = `${target.y}px`;
    ballEl.style.transform = "translate(-50%,-50%) scale(0.88)";

    setTimeout(() => {
      ballEl.style.opacity = "0";
      resolve();
    }, 290);
  });
}

// ===================== Adjacent pair generator =====================
function randomAdjacentPair(){
  // выбираем случайную клетку и случайное направление, пока не получится сосед
  while (true){
    const a = randInt(0, CELLS - 1);
    const { r, c } = idxToRC(a);
    const dirs = [];
    if (c > 0) dirs.push([0,-1]);
    if (c < COLS-1) dirs.push([0, 1]);
    if (r > 0) dirs.push([-1,0]);
    if (r < ROWS-1) dirs.push([ 1,0]);
    const d = dirs[randInt(0, dirs.length-1)];
    const b = rcToIdx(r + d[0], c + d[1]);
    if (b !== a) return { a, b };
  }
}

// ===================== Patrol (hands move together) =====================
function startPatrol(){
  stopPatrol();
  // стартовая пара
  lastPair = randomAdjacentPair();
  placeHands(lastPair, randInt(-10,10), randInt(-10,10));

  patrolTimer = setInterval(() => {
    if (busy) return;
    lastPair = randomAdjacentPair();
    placeHands(lastPair, randInt(-10,10), randInt(-10,10));
  }, 700);
}
function stopPatrol(){
  if (patrolTimer) clearInterval(patrolTimer);
  patrolTimer = null;
}

// ===================== “Save area” rules =====================
function isSaved(targetIdx, pair){
  // базово: попал в одну из 2 клеток рук
  if (targetIdx === pair.a || targetIdx === pair.b) return true;

  // сложный: +радиус досягаемости 1 клетка вокруг каждой руки
  if (diff === "hard"){
    if (manhattan(targetIdx, pair.a) <= HARD_REACH) return true;
    if (manhattan(targetIdx, pair.b) <= HARD_REACH) return true;
  }
  return false;
}

// ===================== Round actions =====================
betBtn.onclick = () => {
  if (busy || inRound) return;
  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");

  addCoins(-bet);

  inRound = true;
  step = 0;

  setStatus("Ставка принята. Выбери точку удара в воротах.");
  beep(520, 55, 0.02);

  // lock settings
  diffBtns.forEach(b => b.disabled = true);
  seriesToggle.disabled = true;

  setRoundUI();
};

cashBtn.onclick = () => {
  if (busy || !inRound || step < 1) return;

  const payout = calcCashout();
  addCoins(payout);

  setStatus(`Кэшаут: +${payout} 🪙 (x${currentX().toFixed(2)}).`);
  beep(760, 70, 0.03);
  beep(920, 70, 0.03);

  endRound(false);
};

resetBtn.onclick = () => {
  if (busy) return;

  // возврат ставки при сбросе до первого гола
  if (inRound && step === 0){
    addCoins(bet);
    setStatus("Сброс: ставка возвращена. Выбери ставку и нажми «Ставка».");
  } else {
    setStatus("Сброс. Выбери ставку и нажми «Ставка».");
  }

  endRound(true);
};

function endRound(resetStep){
  inRound = false;
  busy = false;
  if (resetStep) step = 0;

  diffBtns.forEach(b => b.disabled = false);
  seriesToggle.disabled = false;

  setRoundUI();
  resetBall();
  startPatrol();
}

// ===================== Shoot =====================
async function onShoot(idx){
  if (!inRound || busy) return;

  busy = true;
  setRoundUI();

  // руки выбирают 2 соседние клетки (СИНХРОННО)
  const pair = randomAdjacentPair();
  lastPair = pair;

  // движение рук "к сейву" (вдвоём)
  placeHands(pair, randInt(-12,12), randInt(-12,12));

  // звук удара
  beep(520, 45, 0.02);

  await flyBallTo(idx);

  const saved = isSaved(idx, pair);

  if (saved){
    setStatus("Сейв! Ставка сгорела.");
    flash();
    noiseBurst(140, 0.055);
    beep(220, 90, 0.03, "triangle");

    busy = false;
    endRound(true);
    return;
  }

  // goal
  step = Math.min(step + 1, LADDERS[diff].length - 1);
  const x = currentX();

  setStatus(`Гол! Серия: ${step}. X вырос до x${x.toFixed(2)}. Можно кэшаут.`);
  flash();
  beep(760, 65, 0.03);
  beep(920, 65, 0.03);

  // серия OFF = авто-кэшаут
  if (!seriesToggle.checked){
    const payout = calcCashout();
    addCoins(payout);
    setStatus(`Гол! Авто-кэшаут: +${payout} 🪙 (x${x.toFixed(2)}).`);
    beep(880, 70, 0.03);

    busy = false;
    endRound(true);
    return;
  }

  busy = false;
  setRoundUI();
}

// ===================== Init =====================
function init(){
  renderTop();
  infoSeries.textContent = seriesToggle.checked ? "ON" : "OFF";
  infoDiff.textContent = DIFF_LABEL[diff];

  startPatrol();
  setRoundUI();

  window.addEventListener("resize", () => {
    // на ресайзе просто безопасно пересадим руки в актуальную пару
    if (lastPair){
      placeHands(lastPair, 6, -6);
    }
    resetBall();
  });
}
init();
