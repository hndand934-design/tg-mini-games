// ===== RNG =====
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function randInt(max) {
  return Math.floor(randFloat() * max);
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ===== Telegram =====
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

// ===== Sound =====
let soundOn = true;
function beep(freq = 520, ms = 60, vol = 0.03, type = "sine") {
  if (!soundOn) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, ms);
  } catch {}
}
function sPick(){ beep(540, 55, 0.025); }
function sRowWin(){ beep(720, 70, 0.03); beep(920, 60, 0.028); }
function sLose(){ beep(240, 110, 0.03, "square"); }
function sCash(){ beep(760, 70, 0.03); beep(980, 70, 0.03); }

// ===== UI =====
const subTitle = document.getElementById("subTitle");
const balanceEl = document.getElementById("balance");
const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");

const modeNormalBtn = document.getElementById("modeNormal");
const modeHardBtn = document.getElementById("modeHard");
const modeHint = document.getElementById("modeHint");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");

const startBtn = document.getElementById("startBtn");
const cashoutBtn = document.getElementById("cashoutBtn");

const statusText = document.getElementById("statusText");
const xText = document.getElementById("xText");
const potentialText = document.getElementById("potentialText");

const towerGridEl = document.getElementById("towerGrid");
const ladderEl = document.getElementById("ladder");
const difficultyTag = document.getElementById("difficultyTag");

// ===== Config =====
const ROWS = 8;
const COLS = 4;

// multipliers per cleared row (1..ROWS)
const LADDER = {
  normal: [1.18, 1.42, 1.72, 2.10, 2.60, 3.30, 4.20, 5.50],
  hard:   [1.35, 1.75, 2.35, 3.20, 4.20, 5.50, 7.20, 9.40],
};

function fmtX(x){ return `x${Number(x).toFixed(2)}`; }
function clampBet(){
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  renderPotential();
}

// ===== State =====
let mode = "normal"; // normal | hard
let inRound = false;
let busy = false;
let bet = 100;

let currentRow = 0; // 0..ROWS-1 (0 = первый снизу)
let cleared = 0;    // сколько рядов пройдено
let board = [];     // [ROWS][COLS] => "egg"|"skull"
let revealed = [];  // [ROWS][COLS] => bool
let lost = false;

// ===== Render Top =====
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

// bet controls
betInput.addEventListener("input", () => { clampBet(); resetIfIdleVisual(); });
betMinus.onclick = () => { betInput.value = String((Number(betInput.value)||1) - 10); clampBet(); resetIfIdleVisual(); };
betPlus.onclick  = () => { betInput.value = String((Number(betInput.value)||1) + 10); clampBet(); resetIfIdleVisual(); };

document.querySelectorAll(".chip").forEach((b) => {
  b.onclick = () => {
    const val = b.dataset.bet;
    betInput.value = (val === "max") ? String(wallet.coins) : String(val);
    clampBet();
    resetIfIdleVisual();
    beep(540, 55, 0.02);
  };
});

function resetIfIdleVisual(){
  if (inRound) return; // в раунде не трогаем
  statusText.textContent = "Ожидание";
  xText.textContent = "x1.00";
  renderPotential();
}

// modes
function setMode(m){
  if (busy) return;
  if (inRound) return; // режим нельзя менять во время раунда
  mode = m;

  modeNormalBtn.classList.toggle("active", m === "normal");
  modeHardBtn.classList.toggle("active", m === "hard");

  modeHint.textContent = m === "normal"
    ? "Обычный: 3 яйца / 1 череп"
    : "Сложный: 1 яйцо / 3 черепа";

  difficultyTag.textContent = `Сложность: ${m === "normal" ? "обычный" : "сложный"}`;
  renderLadder();
  buildEmptyTower();
  sPick();
}
modeNormalBtn.onclick = () => setMode("normal");
modeHardBtn.onclick = () => setMode("hard");

// ===== Ladder render =====
function renderLadder(){
  ladderEl.innerHTML = "";
  // показываем сверху "Ряд 8" ... "Ряд 1" как на скрине
  for (let i = ROWS - 1; i >= 0; i--){
    const rowNum = i + 1;
    const x = LADDER[mode][i];
    const item = document.createElement("div");
    item.className = "ladderItem";
    item.innerHTML = `
      <div class="rowName">Ряд ${rowNum}</div>
      <div class="xVal">${fmtX(x)}</div>
    `;
    ladderEl.appendChild(item);
  }
  updateLadderActive();
}

function updateLadderActive(){
  const items = Array.from(ladderEl.querySelectorAll(".ladderItem"));
  // items идут сверху (ряд 8) вниз (ряд 1)
  items.forEach((el) => el.classList.remove("active"));

  if (!inRound) return;
  // текущий ряд "currentRow" (0 снизу) => индекс в items: (ROWS-1-currentRow)
  const idx = (ROWS - 1 - currentRow);
  if (items[idx]) items[idx].classList.add("active");

  // мягко держим активный в зоне видимости
  const active = items[idx];
  if (active) {
    const box = ladderEl.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    if (a.top < box.top + 10 || a.bottom > box.bottom - 10) {
      active.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }
}

// ===== Tower build/render =====
function buildEmptyTower(){
  towerGridEl.innerHTML = "";
  // rows сверху вниз в UI, но логика снизу вверх
  for (let uiRow = ROWS - 1; uiRow >= 0; uiRow--){
    const rowEl = document.createElement("div");
    rowEl.className = "row";
    rowEl.dataset.row = String(uiRow);

    for (let c = 0; c < COLS; c++){
      const cell = document.createElement("div");
      cell.className = "cell disabled";
      cell.dataset.row = String(uiRow);
      cell.dataset.col = String(c);

      cell.innerHTML = `
        <div class="cellInner">
          <div class="face face--front"></div>
          <div class="face face--back">
            <div class="icon"><span>?</span></div>
          </div>
        </div>
      `;
      rowEl.appendChild(cell);
    }
    towerGridEl.appendChild(rowEl);
  }
}

function applyRowInteractivity(){
  const cells = Array.from(towerGridEl.querySelectorAll(".cell"));
  cells.forEach((cell) => {
    const r = Number(cell.dataset.row);
    const c = Number(cell.dataset.col);

    const isRevealed = revealed?.[r]?.[c] === true;
    cell.classList.toggle("revealed", isRevealed);

    // доступно только в раунде и только текущий ряд (логический currentRow == r)
    const clickable = inRound && !busy && !lost && r === currentRow && !isRevealed;
    cell.classList.toggle("disabled", !clickable);
    cell.style.pointerEvents = clickable ? "auto" : "none";
  });
}

function setCellBack(cell, type){
  const back = cell.querySelector(".face--back .icon");
  if (!back) return;
  back.classList.remove("egg","skull");
  back.classList.add(type);

  const span = back.querySelector("span");
  span.textContent = type === "egg" ? "🥚" : "💀";
}

function revealRow(r){
  // показать все 4 клетки в ряду r
  const rowCells = Array.from(towerGridEl.querySelectorAll(`.cell[data-row="${r}"]`));
  rowCells.forEach((cell) => {
    const c = Number(cell.dataset.col);
    const t = board[r][c];
    setCellBack(cell, t);
    cell.classList.add("revealed");
  });
}

function markPicked(cell, type){
  cell.classList.add(type === "egg" ? "hitSafe" : "hitSkull");
}

// ===== Game logic =====
function renderPotential(){
  bet = Math.floor(Number(betInput.value) || 0);
  let x = 1.00;
  if (inRound && cleared > 0) x = LADDER[mode][cleared - 1];
  const pot = inRound ? Math.floor(bet * x) : 0;
  potentialText.textContent = `${pot} 🪙`;
}

function setXText(){
  let x = 1.00;
  if (inRound && cleared > 0) x = LADDER[mode][cleared - 1];
  xText.textContent = fmtX(x);
}

function canCashout(){
  return inRound && !lost && cleared > 0 && !busy;
}

function updateButtons(){
  startBtn.disabled = inRound || busy;
  cashoutBtn.disabled = !canCashout();
}

function newBoard(){
  board = Array.from({ length: ROWS }, () => Array(COLS).fill("egg"));
  revealed = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  lost = false;

  for (let r = 0; r < ROWS; r++){
    const arr = [];
    const skulls = (mode === "normal") ? 1 : 3;
    for (let i = 0; i < skulls; i++) arr.push("skull");
    while (arr.length < COLS) arr.push("egg");
    shuffle(arr);
    for (let c = 0; c < COLS; c++) board[r][c] = arr[c];
  }
}

function startRound(){
  if (busy) return;
  clampBet();
  bet = Math.floor(Number(betInput.value) || 0);
  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");

  inRound = true;
  busy = false;
  lost = false;
  cleared = 0;
  currentRow = 0;

  addCoins(-bet); // списываем 1 раз
  newBoard();

  statusText.textContent = "Игра началась. Выбери плитку в ряду 1.";
  setXText();
  renderPotential();
  renderLadder();
  buildEmptyTower(); // пересобираем чистую башню
  applyRowInteractivity();
  updateButtons();
  sPick();
}

async function handlePick(cell){
  if (!inRound || busy || lost) return;

  const r = Number(cell.dataset.row);
  const c = Number(cell.dataset.col);
  if (r !== currentRow) return;

  busy = true;
  updateButtons();

  revealed[r][c] = true;
  const pickedType = board[r][c];

  // чтобы на выбранной клетке сразу появился правильный бэк перед общим reveal
  setCellBack(cell, pickedType);

  // короткий “тык” + флип выбранной
  sPick();
  cell.classList.add("revealed");
  markPicked(cell, pickedType);

  // небольшой тайминг, потом раскрываем весь ряд красиво
  await new Promise(res => setTimeout(res, 180));
  revealRow(r);

  // фиксируем revealed всего ряда
  for (let k = 0; k < COLS; k++) revealed[r][k] = true;

  await new Promise(res => setTimeout(res, 520));

  if (pickedType === "skull"){
    lost = true;
    statusText.textContent = "Череп! Ставка сгорела.";
    setXText();
    renderPotential();
    // раскрыть всю башню для эффекта
    for (let rr = 0; rr < ROWS; rr++){
      revealRow(rr);
      for (let cc = 0; cc < COLS; cc++) revealed[rr][cc] = true;
    }
    sLose();
    busy = false;
    applyRowInteractivity();
    updateButtons();
    updateLadderActive();
    return;
  }

  // safe row
  cleared += 1;
  setXText();
  renderPotential();
  sRowWin();

  if (cleared >= ROWS){
    // авто-кэшаут на вершине
    const payout = Math.floor(bet * LADDER[mode][ROWS - 1]);
    addCoins(payout);
    statusText.textContent = `Башня пройдена! Авто-кэшаут: +${payout} 🪙`;
    inRound = false;
    busy = false;
    applyRowInteractivity();
    updateButtons();
    updateLadderActive();
    sCash();
    return;
  }

  // идём выше (следующий ряд)
  currentRow += 1;
  statusText.textContent = `Ряд ${cleared} пройден. Выбери плитку в ряду ${cleared + 1}.`;
  busy = false;

  applyRowInteractivity();
  updateButtons();
  updateLadderActive();
}

// cashout
function cashout(){
  if (!canCashout()) return;
  const x = LADDER[mode][cleared - 1];
  const payout = Math.floor(bet * x);
  addCoins(payout);
  statusText.textContent = `Кэшаут: +${payout} 🪙 (${fmtX(x)})`;
  inRound = false;
  busy = false;
  applyRowInteractivity();
  updateButtons();
  updateLadderActive();
  sCash();
}

// bind grid clicks (делегирование)
towerGridEl.addEventListener("click", (e) => {
  const cell = e.target.closest(".cell");
  if (!cell) return;
  if (cell.classList.contains("disabled")) return;
  handlePick(cell);
});

// buttons
startBtn.onclick = startRound;
cashoutBtn.onclick = cashout;

// init
function init(){
  clampBet();
  renderLadder();
  buildEmptyTower();
  applyRowInteractivity();
  updateButtons();

  const user = tg?.initDataUnsafe?.user;
  subTitle.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
}
init();
