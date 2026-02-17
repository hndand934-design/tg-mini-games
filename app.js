// ===== RNG =====
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function randInt(max) { return Math.floor(randFloat() * max); }
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
function sLose(){ beep(240, 120, 0.03, "square"); }
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
const difficultyTag = document.getElementById("difficultyTag");

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

// ===== Config =====
const ROWS = 8;
const COLS = 4;
const LADDER = {
  normal: [1.18, 1.42, 1.72, 2.10, 2.60, 3.30, 4.20, 5.50],
  hard:   [1.35, 1.75, 2.35, 3.20, 4.20, 5.50, 7.20, 9.40],
};
function fmtX(x){ return `x${Number(x).toFixed(2)}`; }

// ===== State =====
let mode = "normal";
let inRound = false;
let busy = false;
let lost = false;

let bet = 100;
let currentRow = 0;
let cleared = 0;
let board = [];
let revealed = [];

// ===== Top render =====
function renderTop(){
  const user = tg?.initDataUnsafe?.user;
  subTitle.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
  balanceEl.textContent = String(wallet.coins);
}
renderTop();

// ===== Helpers =====
function clampBet(){
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  bet = v;
}

function currentX(){
  if (!inRound || cleared === 0) return 1.00;
  return LADDER[mode][cleared - 1];
}

function renderPotential(){
  const pot = inRound ? Math.floor(bet * currentX()) : 0;
  potentialText.textContent = `${pot} 🪙`;
}

function setXText(){
  xText.textContent = fmtX(currentX());
}

function canCashout(){
  return inRound && !lost && cleared > 0 && !busy;
}

function updateButtons(){
  // FIX: Start должен быть доступен, когда раунд завершён (inRound=false)
  startBtn.disabled = busy || inRound;
  cashoutBtn.disabled = !canCashout();
}

// ===== Ladder =====
function renderLadder(){
  ladderEl.innerHTML = "";
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
  items.forEach((el) => el.classList.remove("active"));
  if (!inRound) return;
  const idx = (ROWS - 1 - currentRow);
  if (items[idx]) items[idx].classList.add("active");
}

// ===== Tower UI =====
function buildEmptyTower(){
  towerGridEl.innerHTML = "";
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

function setCellBack(cell, type){
  const back = cell.querySelector(".face--back .icon");
  if (!back) return;
  back.classList.remove("egg","skull");
  back.classList.add(type);

  const span = back.querySelector("span");
  span.textContent = type === "egg" ? "🥚" : "💀";
}

function applyRowInteractivity(){
  const cells = Array.from(towerGridEl.querySelectorAll(".cell"));
  cells.forEach((cell) => {
    const r = Number(cell.dataset.row);
    const c = Number(cell.dataset.col);
    const isRevealed = revealed?.[r]?.[c] === true;
    cell.classList.toggle("revealed", isRevealed);

    const clickable = inRound && !busy && !lost && r === currentRow && !isRevealed;
    cell.classList.toggle("disabled", !clickable);
    cell.style.pointerEvents = clickable ? "auto" : "none";
  });
}

function revealRow(r){
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

// ===== Board generation =====
function newBoard(){
  board = Array.from({ length: ROWS }, () => Array(COLS).fill("egg"));
  revealed = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  lost = false;

  const skulls = (mode === "normal") ? 1 : 3;
  for (let r = 0; r < ROWS; r++){
    const arr = [];
    for (let i = 0; i < skulls; i++) arr.push("skull");
    while (arr.length < COLS) arr.push("egg");
    shuffle(arr);
    for (let c = 0; c < COLS; c++) board[r][c] = arr[c];
  }
}

// ===== Round lifecycle =====
function resetToIdleUI(){
  // чистое состояние для следующего старта
  busy = false;
  inRound = false;
  lost = false;
  cleared = 0;
  currentRow = 0;

  setXText();
  renderPotential();
  updateLadderActive();
  applyRowInteractivity();
  updateButtons();
}

function endRoundLoss(){
  // FIX: после проигрыша нужно завершить раунд,
  // иначе Start остаётся disabled (inRound=true) и игра “залипает”
  statusText.textContent = "Череп! Ставка сгорела.";
  sLose();

  // показываем всю башню (красиво), потом сбрасываем в ожидание
  for (let rr = 0; rr < ROWS; rr++){
    revealRow(rr);
    for (let cc = 0; cc < COLS; cc++) revealed[rr][cc] = true;
  }
  applyRowInteractivity();

  // через маленькую паузу возвращаем управление и разрешаем старт
  setTimeout(() => {
    // остаётся визуал раскрытым, но раунд завершён и можно снова жать "Ставка"
    inRound = false;
    busy = false;
    // потерю фиксируем, но она уже не блокирует старт (т.к. inRound=false)
    updateButtons();
    updateLadderActive();
    // потенциал = 0, X = 1.00 для ожидания
    xText.textContent = "x1.00";
    potentialText.textContent = "0 🪙";
    statusText.textContent += " Можно начать заново.";
  }, 250);
}

function startRound(){
  if (busy) return;

  clampBet();
  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");

  // старт
  busy = false;
  inRound = true;
  lost = false;
  cleared = 0;
  currentRow = 0;

  addCoins(-bet);
  newBoard();

  statusText.textContent = "Игра началась. Выбери плитку в ряду 1.";
  setXText();
  renderPotential();

  // чистим поле под новый раунд
  buildEmptyTower();
  applyRowInteractivity();
  updateLadderActive();
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

  setCellBack(cell, pickedType);
  sPick();

  cell.classList.add("revealed");
  markPicked(cell, pickedType);

  await new Promise(res => setTimeout(res, 180));
  revealRow(r);
  for (let k = 0; k < COLS; k++) revealed[r][k] = true;

  await new Promise(res => setTimeout(res, 520));

  if (pickedType === "skull"){
    lost = true;
    busy = false;
    // ФИКС: завершаем раунд корректно
    endRoundLoss();
    return;
  }

  // safe row
  cleared += 1;
  setXText();
  renderPotential();
  sRowWin();

  if (cleared >= ROWS){
    const payout = Math.floor(bet * LADDER[mode][ROWS - 1]);
    addCoins(payout);
    statusText.textContent = `Башня пройдена! Авто-кэшаут: +${payout} 🪙`;
    inRound = false;
    busy = false;
    updateButtons();
    updateLadderActive();
    sCash();
    applyRowInteractivity();
    return;
  }

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
  const x = currentX();
  const payout = Math.floor(bet * x);
  addCoins(payout);

  statusText.textContent = `Кэшаут: +${payout} 🪙 (${fmtX(x)})`;
  inRound = false;
  busy = false;
  lost = false;

  xText.textContent = "x1.00";
  potentialText.textContent = "0 🪙";
  updateButtons();
  updateLadderActive();
  applyRowInteractivity();
  sCash();
}

// ===== Events =====
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

betInput.addEventListener("input", () => {
  clampBet();
  if (!inRound && !busy) { xText.textContent = "x1.00"; potentialText.textContent = "0 🪙"; }
});
betMinus.onclick = () => { betInput.value = String((Number(betInput.value)||1) - 10); betInput.dispatchEvent(new Event("input")); };
betPlus.onclick  = () => { betInput.value = String((Number(betInput.value)||1) + 10); betInput.dispatchEvent(new Event("input")); };

document.querySelectorAll(".chip").forEach((b) => {
  b.onclick = () => {
    const val = b.dataset.bet;
    betInput.value = (val === "max") ? String(wallet.coins) : String(val);
    betInput.dispatchEvent(new Event("input"));
    beep(540, 55, 0.02);
  };
});

function setMode(m){
  if (busy) return;
  if (inRound) return;
  mode = m;

  modeNormalBtn.classList.toggle("active", m === "normal");
  modeHardBtn.classList.toggle("active", m === "hard");

  modeHint.textContent = m === "normal"
    ? "Обычный: 3 яйца / 1 череп"
    : "Сложный: 1 яйцо / 3 черепа";

  difficultyTag.textContent = `Сложность: ${m === "normal" ? "обычный" : "сложный"}`;
  renderLadder();
  buildEmptyTower();
  resetToIdleUI();
  sPick();
}
modeNormalBtn.onclick = () => setMode("normal");
modeHardBtn.onclick = () => setMode("hard");

startBtn.onclick = startRound;
cashoutBtn.onclick = cashout;

towerGridEl.addEventListener("click", (e) => {
  const cell = e.target.closest(".cell");
  if (!cell) return;
  if (cell.classList.contains("disabled")) return;
  handlePick(cell);
});

// ===== init =====
function init(){
  clampBet();
  renderLadder();
  buildEmptyTower();
  resetToIdleUI();
  renderTop();
}
init();
