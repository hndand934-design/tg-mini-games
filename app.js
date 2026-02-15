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
if (tg) {
  tg.ready();
  tg.expand();
}

// ===== Wallet =====
const WALLET_KEY = "mini_wallet_mines_v3";
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
function setCoins(v){
  wallet.coins = Math.max(0, Math.floor(v));
  saveWallet(wallet);
  renderTop();
}
function addCoins(d){ setCoins(wallet.coins + d); }

// ===== Sound (лёгкий, без лагов) =====
let soundOn = true;
let audioCtx = null;
function getAC(){
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  return audioCtx;
}
function tone(freq = 520, ms = 60, vol = 0.03, type = "sine"){
  if (!soundOn) return;
  try{
    const ctx = getAC();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => { o.stop(); }, ms);
  }catch{}
}
function soundSafe(){
  tone(720, 55, 0.03, "sine");
  setTimeout(()=>tone(980, 55, 0.03, "sine"), 55);
}
function soundBoom(){
  tone(140, 120, 0.05, "square");
  setTimeout(()=>tone(90, 160, 0.05, "square"), 80);
}

// ===== UI refs =====
const subTitle = document.getElementById("subTitle");
const balanceEl = document.getElementById("balance");

const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");

const gridEl = document.getElementById("grid");

const openedView = document.getElementById("openedView");
const safeMaxView = document.getElementById("safeMaxView");
const multView = document.getElementById("multView");
const cashNowView = document.getElementById("cashNowView");

const cashoutBtn = document.getElementById("cashoutBtn");
const resetBtn = document.getElementById("resetBtn");
const msgEl = document.getElementById("msg");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");

const minesRange = document.getElementById("minesRange");
const minesView = document.getElementById("minesView");

const startBtn = document.getElementById("startBtn");

const ladderGrid = document.getElementById("ladderGrid");

// ===== Top render =====
function renderTop(){
  const user = tg?.initDataUnsafe?.user;
  subTitle.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
  balanceEl.textContent = String(wallet.coins);
}
renderTop();

// sound toggle
soundBtn.onclick = () => {
  soundOn = !soundOn;
  soundText.textContent = "Звук";
  const dot = soundBtn.querySelector(".dot");
  dot.style.background = soundOn ? "#26d47b" : "#ff5a6a";
  dot.style.boxShadow = soundOn
    ? "0 0 0 3px rgba(38,212,123,.14)"
    : "0 0 0 3px rgba(255,90,106,.14)";
  tone(soundOn ? 640 : 240, 70, 0.03);
};

// bonus
bonusBtn.onclick = () => { addCoins(1000); tone(760, 70, 0.03); };

// ===== Game constants =====
const SIZE = 25; // 5x5
const COLS = 5;
const HOUSE_EDGE = 0.05; // небольшой edge, но X всё равно растёт сильно на больших минах

// ===== State =====
let st = null;
// st = {
//   active: true/false,
//   bet, minesCount,
//   mines: Set<int>,
//   opened: Set<int>,
//   safeOpened,
//   over, cashed
// }

// ===== Utils =====
function setMsg(t){ msgEl.textContent = t; }

function buildMines(minesCount){
  const mines = new Set();
  while (mines.size < minesCount) mines.add(randInt(0, SIZE - 1));
  return mines;
}

// Честный множитель по шансам:
// mult = (C(25, m) / C(25-safe, m)) * (1 - edge)
function comb(n, k){
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let num = 1;
  let den = 1;
  for (let i = 1; i <= k; i++){
    num *= (n - (k - i));
    den *= i;
  }
  return num / den;
}
function calcMultiplier(safeOpened, minesCount){
  if (safeOpened <= 0) return 1.0;
  const total = SIZE;
  const m = minesCount;
  const fair = comb(total, m) / comb(total - safeOpened, m);
  const withEdge = fair * (1 - HOUSE_EDGE);
  return Math.max(1, withEdge);
}

function money(n){
  return `${Math.floor(n)} 🪙`;
}

// ===== Controls =====
function clampBet(){
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  renderStats();
}
betInput.addEventListener("input", clampBet);
betMinus.onclick = () => { betInput.value = String((Number(betInput.value)||1) - 10); clampBet(); };
betPlus.onclick  = () => { betInput.value = String((Number(betInput.value)||1) + 10); clampBet(); };

document.querySelectorAll(".chip").forEach((b) => {
  b.onclick = () => {
    const val = b.dataset.bet;
    betInput.value = (val === "max") ? String(wallet.coins) : String(val);
    clampBet();
    tone(540, 55, 0.02);
  };
});

function clampMines(){
  let m = Math.floor(Number(minesRange.value) || 3);
  if (m < 3) m = 3;
  if (m > 24) m = 24;
  minesRange.value = String(m);
  minesView.textContent = String(m);

  // при смене мин в ожидании — просто обновляем лесенку/статы
  renderLadder(m, st?.safeOpened || 0);
  renderStats();
}
minesRange.addEventListener("input", clampMines);

clampMines();
clampBet();

// ===== Rendering =====
function renderGrid(){
  const isActive = !!st && st.active;
  const over = st?.over;

  let html = "";
  for (let i = 0; i < SIZE; i++){
    const opened = isActive && st.opened.has(i);
    const isMine = isActive && st.mines.has(i);

    let cls = "cell";
    let icon = "";

    if (!isActive){
      cls += " locked";
      icon = ""; // ДО Start — пусто
    } else {
      if (opened && !isMine) { cls += " safe"; icon = "💎"; }
      if (opened && isMine)  { cls += " mine"; icon = "💣"; }
    }

    html += `<button class="${cls}" data-i="${i}" ${(!isActive || over) ? "disabled" : ""}>
      <span class="icon">${icon}</span>
    </button>`;
  }

  gridEl.innerHTML = html;

  gridEl.querySelectorAll(".cell").forEach((btn) => {
    btn.onclick = () => onCellClick(Number(btn.dataset.i));
  });
}

function renderStats(){
  const minesCount = Math.floor(Number(minesRange.value) || 3);
  const safeMax = SIZE - minesCount;
  safeMaxView.textContent = String(safeMax);

  if (!st || !st.active){
    openedView.textContent = "0";
    multView.textContent = "x1.00";
    cashNowView.textContent = "—";
    cashoutBtn.disabled = true;
    return;
  }

  openedView.textContent = String(st.safeOpened);
  multView.textContent = `x${st.multiplier.toFixed(2)}`;

  const cashNow = Math.floor(st.bet * st.multiplier);
  cashNowView.textContent = money(cashNow);

  cashoutBtn.disabled = st.over || st.safeOpened <= 0 || st.cashed;
}

function renderLadder(minesCount, safeOpened){
  const safeMax = SIZE - minesCount;

  // шаги: 1..safeMax
  // показываем X заранее, подсветка = текущий safeOpened
  const items = [];
  for (let s = 1; s <= safeMax; s++){
    const m = calcMultiplier(s, minesCount);
    const xTxt = `x${m.toFixed(m >= 100 ? 0 : m >= 10 ? 1 : 2)}`;

    const big = m >= 1000 ? " big" : "";
    const active = (safeOpened === s) ? " active" : "";

    items.push(`
      <div class="lstep${big}${active}">
        <span class="k">#${s}</span>
        <span class="x">${xTxt}</span>
      </div>
    `);
  }

  ladderGrid.innerHTML = items.join("");
}

// ===== Game flow =====
function startGame(){
  if (st && st.active && !st.over){
    setMsg("Раунд уже идёт. Можно открывать клетки или нажать “Забрать/Сброс”.");
    return;
  }

  const bet = Math.floor(Number(betInput.value) || 0);
  const minesCount = Math.floor(Number(minesRange.value) || 3);

  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");
  if (minesCount < 3 || minesCount > 24) return alert("Мин должно быть от 3 до 24");

  // списываем ставку один раз на Start
  addCoins(-bet);

  st = {
    active: true,
    bet,
    minesCount,
    mines: buildMines(minesCount),
    opened: new Set(),
    safeOpened: 0,
    multiplier: 1.0,
    over: false,
    cashed: false,
  };

  setMsg("Раунд начался. Открывай safe клетки. Можно “Забрать”.");
  renderLadder(minesCount, 0);
  renderGrid();
  renderStats();
}

function revealAll(){
  for (let i = 0; i < SIZE; i++) st.opened.add(i);
}

function onCellClick(i){
  if (!st || !st.active || st.over) return;
  if (st.opened.has(i)) return;

  st.opened.add(i);

  if (st.mines.has(i)){
    // проигрыш
    st.over = true;
    st.cashed = false;
    revealAll();
    setMsg(`💥 Мина! Ставка ${st.bet} 🪙 сгорела.`);
    soundBoom();
    renderLadder(st.minesCount, st.safeOpened);
    renderGrid();
    renderStats();
    return;
  }

  // safe
  st.safeOpened += 1;
  st.multiplier = calcMultiplier(st.safeOpened, st.minesCount);
  soundSafe();

  // подсветка шага
  renderLadder(st.minesCount, st.safeOpened);

  // если открыл все safe — авто cashout
  const safeMax = SIZE - st.minesCount;
  if (st.safeOpened >= safeMax){
    cashOut(true);
    return;
  }

  renderGrid();
  renderStats();
}

function cashOut(auto = false){
  if (!st || !st.active || st.over || st.cashed) return;
  if (st.safeOpened <= 0) {
    setMsg("Нужно открыть хотя бы 1 safe клетку, чтобы забрать.");
    return;
  }

  st.cashed = true;
  st.over = true;

  const payout = Math.floor(st.bet * st.multiplier);
  addCoins(payout);

  setMsg(auto
    ? `🏁 Открыл все safe! Авто-забор: +${payout} 🪙 (x${st.multiplier.toFixed(2)})`
    : `✅ Забрал: +${payout} 🪙 (x${st.multiplier.toFixed(2)})`
  );

  revealAll();
  renderGrid();
  renderStats();
}

function resetGame(){
  // если был активный раунд и он НЕ проигран и НЕ закэш-аутен — возвращаем ставку
  if (st && st.active && !st.over){
    addCoins(st.bet);
    setMsg(`↩️ Сброс. Ставка ${st.bet} 🪙 возвращена.`);
  } else {
    setMsg("Выбери ставку и количество мин, затем нажми Start.");
  }

  st = null;
  renderGrid();
  clampMines();  // важное: лесенка всегда возвращается
  renderStats();
}

// ===== Buttons =====
startBtn.onclick = startGame;
cashoutBtn.onclick = () => cashOut(false);
resetBtn.onclick = resetGame;

// ===== Init =====
renderGrid();
clampMines();
renderStats();
