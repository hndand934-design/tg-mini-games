// ===== RNG (честный) =====
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function pickIndex(n){
  return Math.floor(randFloat() * n);
}

// ===== Telegram WebApp =====
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

// ===== Wallet =====
const WALLET_KEY = "mini_wallet_dragontower_v1";
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
const sfx = {
  click(){ beep(520, 40, 0.02); },
  start(){ beep(620, 60, 0.03); },
  egg(){ beep(740, 55, 0.03); beep(920, 55, 0.02); },
  skull(){ beep(180, 90, 0.035, "triangle"); },
  cash(){ beep(760, 65, 0.03); beep(980, 65, 0.03); },
};

// ===== UI =====
const subTitle = document.getElementById("subTitle");
const balanceEl = document.getElementById("balance");

const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");

const modeEasy = document.getElementById("modeEasy");
const modeHard = document.getElementById("modeHard");
const modeHint = document.getElementById("modeHint");
const centerHint = document.getElementById("centerHint");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");
const startBtn = document.getElementById("startBtn");
const cashoutBtn = document.getElementById("cashoutBtn");

const statusText = document.getElementById("statusText");
const xText = document.getElementById("xText");
const potText = document.getElementById("potText");

const towerEl = document.getElementById("tower");
const xScaleEl = document.getElementById("xScale");

// ===== Top render =====
function renderTop(){
  const user = tg?.initDataUnsafe?.user;
  subTitle.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
  balanceEl.textContent = String(wallet.coins);
}
renderTop();

// ===== Sound toggle =====
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

// ===== Bonus =====
bonusBtn.onclick = () => { addCoins(1000); beep(760, 70, 0.03); };

// ===== Game config =====
const ROWS = 8;
const EASY_COLS = 4; // 3 egg / 1 skull
const HARD_COLS = 4; // 1 egg / 3 skull

// Финальные множители (лестница X)
const X_EASY = [1.00, 1.18, 1.42, 1.72, 2.10, 2.60, 3.30, 4.20, 5.50];
const X_HARD = [1.00, 1.55, 2.40, 3.20, 4.20, 5.50, 7.20, 9.40, 12.20];

let mode = "easy"; // easy|hard
let inRound = false;
let betLocked = 0;
let currentRow = 0;     // 0..ROWS-1
let currentX = 1.00;
let revealed = new Set(); // "r-c"
let map = []; // per row array of "egg"/"skull" length cols

function colsForMode(){ return (mode === "easy") ? EASY_COLS : HARD_COLS; }
function ladderForMode(){ return (mode === "easy") ? X_EASY : X_HARD; }
function modeText(){ return (mode === "easy") ? "Обычный: 3 яйца / 1 череп" : "Сложный: 1 яйцо / 3 черепа"; }
function centerModeText(){ return (mode === "easy") ? "Сложность: обычный" : "Сложность: сложный"; }

// ===== Bet helpers =====
function clampBet(){
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  return v;
}
betInput.addEventListener("input", () => {
  if (inRound) { betInput.value = String(betLocked); return; }
  clampBet();
});
betMinus.onclick = () => {
  if (inRound) return;
  betInput.value = String((Number(betInput.value)||1) - 10);
  clampBet();
  sfx.click();
};
betPlus.onclick = () => {
  if (inRound) return;
  betInput.value = String((Number(betInput.value)||1) + 10);
  clampBet();
  sfx.click();
};
document.querySelectorAll(".chip").forEach((b) => {
  b.onclick = () => {
    if (inRound) return;
    const val = b.dataset.bet;
    betInput.value = (val === "max") ? String(wallet.coins) : String(val);
    clampBet();
    sfx.click();
  };
});

// ===== Mode buttons =====
function setMode(m){
  if (inRound) return;
  mode = m;
  modeEasy.classList.toggle("active", mode === "easy");
  modeHard.classList.toggle("active", mode === "hard");
  modeHint.textContent = modeText();
  centerHint.textContent = centerModeText();
  renderXScale();
  buildTower(); // refresh layout
  sfx.click();
}
modeEasy.onclick = () => setMode("easy");
modeHard.onclick = () => setMode("hard");

// ===== Build tower + x scale =====
function buildTower(){
  const cols = colsForMode();

  towerEl.innerHTML = "";
  towerEl.style.gridTemplateRows = `repeat(${ROWS}, 1fr)`;

  // rows from top to bottom visually: we want active row highlighted at bottom (row 0)
  for (let r = ROWS - 1; r >= 0; r--){
    const row = document.createElement("div");
    row.className = "row";
    row.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    for (let c = 0; c < cols; c++){
      const cell = document.createElement("div");
      cell.className = "cell";

      const front = document.createElement("div");
      front.className = "face3d front3d";

      const back = document.createElement("div");
      back.className = "face3d back3d";

      cell.appendChild(front);
      cell.appendChild(back);

      const key = `${r}-${c}`;
      cell.dataset.r = String(r);
      cell.dataset.c = String(c);

      cell.onclick = () => onPick(r, c, cell);

      row.appendChild(cell);
    }
    towerEl.appendChild(row);
  }

  refreshTowerState();
}

function renderXScale(){
  const ladder = ladderForMode();
  xScaleEl.innerHTML = "";

  // show rows 1..ROWS with X (row 0 is x1.00)
  for (let i = ROWS; i >= 1; i--){
    const item = document.createElement("div");
    item.className = "xItem";
    item.dataset.row = String(i);

    const left = document.createElement("div");
    left.className = "r";
    left.textContent = `Ряд ${i}`;

    const right = document.createElement("div");
    right.className = "x";
    right.textContent = `x${ladder[i].toFixed(2)}`;

    item.appendChild(left);
    item.appendChild(right);
    xScaleEl.appendChild(item);
  }

  refreshXActive();
}

function refreshXActive(){
  const ladder = ladderForMode();
  const nextRow = Math.min(ROWS, currentRow + 1); // row number for cashout after beating current row
  const items = xScaleEl.querySelectorAll(".xItem");
  items.forEach(el => {
    const rowNum = Number(el.dataset.row);
    el.classList.toggle("active", inRound && rowNum === nextRow);
  });

  // update header stats
  xText.textContent = `x${currentX.toFixed(2)}`;
  const pot = Math.floor(betLocked * currentX);
  potText.textContent = `${inRound ? pot : 0} 🪙`;
}

// highlight active row cells
function refreshTowerState(){
  const cols = colsForMode();
  const cells = towerEl.querySelectorAll(".cell");

  cells.forEach(cell => {
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    const key = `${r}-${c}`;

    const isRevealed = revealed.has(key);
    const isActiveRow = inRound && r === currentRow;
    const isClickable = isActiveRow && !isRevealed;

    cell.classList.toggle("activeRow", isActiveRow);
    cell.classList.toggle("disabled", !isClickable);
    if (isRevealed) cell.classList.add("revealed");
  });

  // adjust row label
  if (!inRound){
    statusText.textContent = "Ожидание";
    currentX = 1.00;
    xText.textContent = "x1.00";
    potText.textContent = "0 🪙";
  }
}

// ===== Round generation =====
function genRow(){
  const cols = colsForMode();
  const arr = new Array(cols).fill("skull");

  if (mode === "easy"){
    // 3 eggs, 1 skull
    const skullPos = pickIndex(cols);
    for (let i=0;i<cols;i++) arr[i] = (i === skullPos) ? "skull" : "egg";
  } else {
    // 1 egg, 3 skull
    const eggPos = pickIndex(cols);
    for (let i=0;i<cols;i++) arr[i] = (i === eggPos) ? "egg" : "skull";
  }
  return arr;
}

function startRound(){
  if (inRound) return;

  const bet = clampBet();
  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");

  inRound = true;
  betLocked = bet;
  addCoins(-betLocked);

  startBtn.disabled = true;
  cashoutBtn.disabled = true;
  betInput.value = String(betLocked);

  currentRow = 0;
  currentX = 1.00;
  revealed = new Set();
  map = [];

  for (let r=0; r<ROWS; r++) map.push(genRow());

  statusText.textContent = "Игра";
  sfx.start();

  // rebuild visuals + active row highlight
  buildTower();
  renderXScale();
  refreshXActive();
}

function endLose(){
  inRound = false;
  startBtn.disabled = false;
  cashoutBtn.disabled = true;

  statusText.textContent = "Проигрыш";
  currentX = 1.00;

  // раскрыть текущий ряд (для эффекта)
  revealRow(currentRow);

  refreshTowerState();
  refreshXActive();
  sfx.skull();
}

function revealRow(r){
  const cols = colsForMode();
  for (let c=0;c<cols;c++){
    const key = `${r}-${c}`;
    if (!revealed.has(key)){
      revealed.add(key);
      const cell = towerEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
      if (cell) revealCellVisual(cell, map[r][c], false);
    }
  }
}

function canCashout(){
  // доступен после победы ряда (т.е. currentRow > 0)
  return inRound && currentRow > 0;
}

function doCashout(){
  if (!canCashout()) return;

  const payout = Math.floor(betLocked * currentX);
  addCoins(payout);

  inRound = false;
  startBtn.disabled = false;
  cashoutBtn.disabled = true;

  statusText.textContent = `Кэшаут x${currentX.toFixed(2)}`;
  sfx.cash();

  refreshTowerState();
  refreshXActive();
}

// ===== Visual flip =====
function revealCellVisual(cell, kind, animate=true){
  if (cell.classList.contains("revealed")) return;

  const back = cell.querySelector(".back3d");
  back.innerHTML = "";
  if (kind === "egg"){
    const egg = document.createElement("div");
    egg.className = "eggIcon";
    back.appendChild(egg);
  } else {
    const skull = document.createElement("div");
    skull.className = "skullIcon";
    back.appendChild(skull);
  }

  cell.classList.add("revealed");
  if (animate){
    cell.classList.remove("flip");
    void cell.offsetWidth; // restart
    cell.classList.add("flip");
  } else {
    // instantly flip state
    cell.style.transform = "rotateY(180deg)";
  }
}

// ===== Pick handler =====
function onPick(r, c, cell){
  if (!inRound) return;
  if (r !== currentRow) return;
  const key = `${r}-${c}`;
  if (revealed.has(key)) return;

  revealed.add(key);

  const kind = map[r][c];
  revealCellVisual(cell, kind, true);

  if (kind === "skull"){
    statusText.textContent = "Череп!";
    endLose();
    return;
  }

  // egg = win row
  statusText.textContent = "Яйцо!";
  sfx.egg();

  // move up
  currentRow += 1;

  // update X from ladder
  const ladder = ladderForMode();
  currentX = ladder[currentRow] ?? ladder[ladder.length-1];

  cashoutBtn.disabled = !canCashout();

  // auto-win if passed all rows
  if (currentRow >= ROWS){
    // final cashout automatically
    doCashout();
    return;
  }

  refreshTowerState();
  refreshXActive();
}

// ===== Buttons =====
startBtn.onclick = startRound;
cashoutBtn.onclick = doCashout;

// init
setMode("easy");
clampBet();
buildTower();
renderXScale();
