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
const WALLET_KEY = "mini_wallet_mines_v2";
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

// ===== Sound (лёгкий, без лагов) =====
let soundOn = true;
let audioCtx = null;
function getCtx(){
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx || audioCtx.state === "closed") audioCtx = new AC();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(()=>{});
  return audioCtx;
}
function tone(freq, ms, type="sine", vol=0.03){
  if (!soundOn) return;
  const ctx = getCtx();
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = vol;
  o.connect(g); g.connect(ctx.destination);
  o.start();
  setTimeout(()=>{ try{o.stop();}catch{} }, ms);
}
function sfxDiamond(){
  tone(740, 55, "triangle", 0.035);
  setTimeout(()=>tone(980, 55, "triangle", 0.03), 70);
}
function sfxBoom(){
  // короткий “взрыв”: низ + шум-like через sawtooth
  tone(140, 120, "sawtooth", 0.05);
  setTimeout(()=>tone(90, 130, "sawtooth", 0.045), 40);
}

// ===== UI refs =====
const subTitle = document.getElementById("subTitle");
const balanceEl = document.getElementById("balance");

const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");
const bonusBtn2 = document.getElementById("bonusBtn2");
const soundMini = document.getElementById("soundMini");

const gridEl = document.getElementById("grid");
const openedView = document.getElementById("openedView");
const safeTotalView = document.getElementById("safeTotalView");
const multView = document.getElementById("multView");
const cashNowView = document.getElementById("cashNowView");
const msgEl = document.getElementById("msg");

const cashBtn = document.getElementById("cashBtn");
const resetBtn = document.getElementById("resetBtn");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");
const minesRange = document.getElementById("minesRange");
const minesView = document.getElementById("minesView");
const startBtn = document.getElementById("startBtn");
const ladderEl = document.getElementById("ladder");

// ===== top render =====
function renderTop(){
  const user = tg?.initDataUnsafe?.user;
  subTitle.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
  balanceEl.textContent = String(wallet.coins);
}
renderTop();

// sound toggle
function setSoundUI(){
  soundText.textContent = soundOn ? "Звук on" : "Звук off";
  const dot = soundBtn.querySelector(".dot");
  dot.style.background = soundOn ? "#26d47b" : "#ff5a6a";
  dot.style.boxShadow = soundOn
    ? "0 0 0 3px rgba(38,212,123,.14)"
    : "0 0 0 3px rgba(255,90,106,.14)";
  soundMini.textContent = soundOn ? "Звук" : "Звук (off)";
  soundMini.style.opacity = soundOn ? "1" : ".75";
}
setSoundUI();
soundBtn.onclick = () => { soundOn = !soundOn; setSoundUI(); tone(soundOn?640:240,60,"sine",0.03); };
soundMini.onclick = () => { soundOn = !soundOn; setSoundUI(); tone(soundOn?640:240,60,"sine",0.03); };

// bonus
function addBonus(){ addCoins(1000); tone(760, 70, "sine", 0.03); }
bonusBtn.onclick = addBonus;
bonusBtn2.onclick = addBonus;

// ===== Game constants/state =====
const SIZE = 25;       // 5x5
const COLS = 5;
let state = null;      // активный раунд или null

function buildMines(minesCount){
  const s = new Set();
  while (s.size < minesCount) s.add(randInt(0, SIZE-1));
  return s;
}

// === МУЛЬТИПЛИКАТОР (поправлен: растёт сильнее на больших минах и НЕ падает после 15) ===
// 1) считаем шанс дожить до safeOpened
// 2) честный payout ~ 1/prob (минус house)
// 3) добавляем “азартный буст” который растёт с minesCount и прогрессом
function calcMultiplier(safeOpened, minesCount){
  const totalSafe = SIZE - minesCount;
  if (safeOpened <= 0) return 1;

  let prob = 1;
  for (let i=0; i<safeOpened; i++){
    prob *= (totalSafe - i) / (SIZE - i);
  }
  const fair = 1 / prob;

  const houseEdge = 0.07; // небольшой
  let mult = fair * (1 - houseEdge);

  // буст азарта: сильнее при большом числе мин и ближе к концу
  const m = (minesCount - 3) / (SIZE - 3);              // 0..1
  const p = safeOpened / Math.max(1, totalSafe);        // 0..1
  const excitement = 1 + 0.9 * m * Math.pow(p, 1.6);    // до ~1.9
  mult *= excitement;

  // защита от странных значений
  mult = Math.max(1, mult);

  // округление “красивее”
  return Math.round(mult * 100) / 100;
}

function canStart(){
  if (state && !state.over) return false;
  return true;
}

// ===== Bet controls =====
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
    tone(540, 55, "sine", 0.02);
  };
});

function clampMines(){
  let m = Math.floor(Number(minesRange.value) || 3);
  if (m < 3) m = 3;
  if (m > 24) m = 24;
  minesRange.value = String(m);
  minesView.textContent = String(m);

  // лесенка должна быть видна ДО старта
  renderLadder(0, m);
}
minesRange.addEventListener("input", clampMines);

// ===== Ladder =====
function renderLadder(openedSafe, minesCount){
  const totalSafe = SIZE - minesCount;
  const maxSteps = totalSafe; // сколько safe можно открыть

  ladderEl.innerHTML = "";
  safeTotalView.textContent = String(totalSafe);

  // показываем первые 12 шагов + последние 4 (если много) — чтобы не был огромный список
  // но при этом X на больших минах видно сразу.
  const items = [];
  for (let i=1; i<=maxSteps; i++){
    items.push(i);
  }

  let display = items;
  if (items.length > 16){
    display = [
      ...items.slice(0, 10),
      -1, // разделитель
      ...items.slice(items.length - 6)
    ];
  }

  for (const step of display){
    if (step === -1){
      const div = document.createElement("div");
      div.className = "step";
      div.style.justifyContent = "center";
      div.style.opacity = ".6";
      div.textContent = "…";
      ladderEl.appendChild(div);
      continue;
    }
    const x = calcMultiplier(step, minesCount);
    const div = document.createElement("div");
    div.className = "step" + (step === openedSafe ? " active" : "");
    if (x >= 10) div.classList.add("big");
    div.innerHTML = `<span class="k">#${step}</span><span>x${x.toFixed(2)}</span>`;
    ladderEl.appendChild(div);
  }
}

// ===== Draw grid =====
function draw(){
  // default view
  if (!state){
    openedView.textContent = "0";
    multView.textContent = "x1.00";
    cashNowView.textContent = "—";
    msgEl.className = "msg";
    msgEl.textContent = "";
    cashBtn.disabled = true;

    // grid empty (disabled) until start
    gridEl.innerHTML = "";
    for (let i=0;i<SIZE;i++){
      const btn = document.createElement("button");
      btn.className = "cell";
      btn.disabled = true;
      btn.innerHTML = `<span class="cellInner"></span>`;
      gridEl.appendChild(btn);
    }
    clampMines();
    clampBet();
    return;
  }

  openedView.textContent = String(state.safeOpened);
  multView.textContent = `x${state.mult.toFixed(2)}`;

  const cashNow = Math.floor(state.bet * state.mult);
  cashNowView.textContent = cashNow > 0 ? `${cashNow} 🪙` : "—";

  cashBtn.disabled = state.over || state.safeOpened <= 0;

  msgEl.className = "msg" + (state.msgType ? ` ${state.msgType}` : "");
  msgEl.textContent = state.msg || "";

  gridEl.innerHTML = "";
  for (let i=0;i<SIZE;i++){
    const opened = state.opened.has(i);
    const isMine = state.mines.has(i);

    const btn = document.createElement("button");
    let cls = "cell";
    if (opened && !isMine) cls += " safe";
    if (opened && isMine) cls += " mine";
    if (state.lastHitMine === i) cls += " boom";
    btn.className = cls;
    btn.disabled = state.over || opened;

    let label = "";
    if (opened){
      label = isMine ? "💣" : "💎";
    }

    btn.innerHTML = `<span class="cellInner">${label}</span>`;
    btn.addEventListener("click", () => onCellClick(i));
    gridEl.appendChild(btn);
  }

  renderLadder(state.safeOpened, state.minesCount);
}

// ===== Start / Cell click / Cashout / Reset =====
function startGame(){
  if (!canStart()) return;

  const bet = Math.floor(Number(betInput.value) || 0);
  const minesCount = Math.floor(Number(minesRange.value) || 3);

  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");
  if (minesCount < 3 || minesCount > 24) return alert("Мины: от 3 до 24");

  // списываем ставку
  addCoins(-bet);

  state = {
    bet,
    minesCount,
    mines: buildMines(minesCount),
    opened: new Set(),
    safeOpened: 0,
    mult: 1,
    over: false,
    cashed: false,
    msg: "Раунд начат. Открывай клетки.",
    msgType: "",
    lastHitMine: null,
    refunded: false,
  };

  draw();
}

function revealAll(){
  for (let i=0;i<SIZE;i++) state.opened.add(i);
}

function onCellClick(i){
  if (!state || state.over) return;
  if (state.opened.has(i)) return;

  state.opened.add(i);

  if (state.mines.has(i)){
    state.over = true;
    state.lastHitMine = i;
    state.msg = `💥 Мина! Ставка ${state.bet} 🪙 сгорела.`;
    state.msgType = "bad";
    sfxBoom();
    revealAll();
    draw();
    return;
  }

  // safe
  state.safeOpened += 1;
  state.mult = calcMultiplier(state.safeOpened, state.minesCount);

  state.msg = `💎 Safe! x${state.mult.toFixed(2)} — можно продолжать или забрать.`;
  state.msgType = "good";
  sfxDiamond();

  const totalSafe = SIZE - state.minesCount;
  if (state.safeOpened >= totalSafe){
    // авто-кэшаут
    cashOut(true);
    return;
  }

  draw();
}

function cashOut(auto=false){
  if (!state || state.over || state.cashed) return;
  if (state.safeOpened <= 0) return;

  state.cashed = true;
  state.over = true;

  const payout = Math.floor(state.bet * state.mult);
  addCoins(payout);

  state.msg = auto
    ? `🏁 Открыл все safe! Авто-забор: +${payout} 🪙 (x${state.mult.toFixed(2)})`
    : `✅ Забрал: +${payout} 🪙 (x${state.mult.toFixed(2)})`;
  state.msgType = "good";

  tone(760, 60, "triangle", 0.035);
  setTimeout(()=>tone(920, 70, "triangle", 0.03), 70);

  revealAll();
  draw();
}

function resetRound(){
  // если раунд активен и НЕ закончился — возвращаем ставку
  if (state && !state.over && !state.refunded){
    addCoins(state.bet);
    state.refunded = true;
  }
  state = null;
  draw();
}

// ===== Buttons =====
startBtn.onclick = startGame;
cashBtn.onclick = () => cashOut(false);
resetBtn.onclick = resetRound;

// init
draw();
