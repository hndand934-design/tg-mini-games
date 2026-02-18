// ===== RNG (честный) =====
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

// ===== Wallet =====
const WALLET_KEY = "mini_wallet_rps_v1";
function loadWallet(){
  try{
    const w = JSON.parse(localStorage.getItem(WALLET_KEY) || "null");
    if (w && typeof w.coins === "number") return w;
  }catch{}
  return { coins: 1000 };
}
function saveWallet(w){ localStorage.setItem(WALLET_KEY, JSON.stringify(w)); }
let wallet = loadWallet();

// ===== Sounds (тихо) =====
let soundOn = true;
function beep(freq=520, ms=55, vol=0.03){
  if(!soundOn) return;
  try{
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type="sine"; o.frequency.value=freq; g.gain.value=vol;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    setTimeout(()=>{ o.stop(); ctx.close(); }, ms);
  }catch{}
}

// ===== UI =====
const balanceEl = document.getElementById("balance");
const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");

const statusView = document.getElementById("statusView");
const youPickView = document.getElementById("youPickView");
const botPickView = document.getElementById("botPickView");
const resultView = document.getElementById("resultView");

const ladderEl = document.getElementById("ladder");
const seriesView = document.getElementById("seriesView");
const multView = document.getElementById("multView");
const potentialView = document.getElementById("potentialView");

const botIcon = document.getElementById("botIcon");
const youIcon = document.getElementById("youIcon");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");

const playBtn = document.getElementById("playBtn");
const cashoutBtn = document.getElementById("cashoutBtn");
const winView = document.getElementById("winView");

// ===== Game config =====
const STEPS = [1.00, 1.20, 1.50, 2.00, 3.00, 5.00, 10.00]; // старт + 6 шагов
const MAX_STEP = STEPS.length - 1; // 6

const MOVES = ["rock","scissors","paper"];
const MOVE_RU = {
  rock: "Камень",
  scissors: "Ножницы",
  paper: "Бумага"
};
// БЕЖЕВЫЕ РУКИ (не жёлтые)
const ICON = {
  rock: "✊🏻",
  scissors: "✌🏻",
  paper: "✋🏻"
};

// ===== State =====
let picked = "rock";
let inSeries = false;     // серия активна (ставка уже списана)
let series = 0;           // кол-во побед подряд (0..6)
let lockedBet = 0;        // ставка, зафиксированная на серию
let busy = false;

// ===== Helpers =====
function setCoins(v){
  wallet.coins = Math.max(0, Math.floor(v));
  saveWallet(wallet);
  balanceEl.textContent = String(wallet.coins);
}
function addCoins(d){ setCoins(wallet.coins + d); }

function currentX(){ return STEPS[Math.min(series, MAX_STEP)]; }

function renderLadder(){
  ladderEl.innerHTML = "";
  STEPS.forEach((x, i) => {
    const box = document.createElement("div");
    box.className = "step" + (i === series ? " active" : "");
    box.innerHTML = `
      <div class="sTitle">${i===0 ? "Старт" : `Шаг ${i}`}</div>
      <div class="sX">x${x.toFixed(2)}</div>
    `;
    ladderEl.appendChild(box);
  });
}

function renderStats(){
  seriesView.textContent = `${series} побед`;
  multView.textContent = `x${currentX().toFixed(2)}`;
  const baseBet = inSeries ? lockedBet : Math.floor(Number(betInput.value)||0);
  potentialView.textContent = baseBet > 0 ? `${Math.floor(baseBet * currentX())} ₽` : `0 ₽`;
}

function lockBetUI(lock){
  // пока серия идёт — ставку менять нельзя
  betInput.disabled = lock;
  betMinus.disabled = lock;
  betPlus.disabled = lock;
  document.querySelectorAll(".chip").forEach(b => b.disabled = lock);
}

function setPicked(v){
  picked = v;
  document.querySelectorAll(".pickBtn").forEach(b => b.classList.toggle("active", b.dataset.move === v));
  youIcon.textContent = ICON[v];
  youPickView.textContent = MOVE_RU[v];
  beep(520, 45, 0.02);
}

// ===== Init =====
balanceEl.textContent = String(wallet.coins);
renderLadder();
renderStats();
setPicked("rock");

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

// chips
document.querySelectorAll(".chip").forEach((b) => {
  b.onclick = () => {
    if (inSeries) return;
    const val = b.dataset.bet;
    betInput.value = (val === "max") ? String(wallet.coins) : String(val);
    clampBet();
    beep(540, 55, 0.02);
  };
});

// bet controls
function clampBet(){
  if (inSeries) return; // нельзя менять
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  renderStats();
}
betInput.addEventListener("input", clampBet);
betMinus.onclick = () => { if(inSeries) return; betInput.value = String((Number(betInput.value)||1) - 10); clampBet(); };
betPlus.onclick  = () => { if(inSeries) return; betInput.value = String((Number(betInput.value)||1) + 10); clampBet(); };
clampBet();

// picks
document.querySelectorAll(".pickBtn").forEach(btn=>{
  btn.onclick = () => setPicked(btn.dataset.move);
});

// ===== Game logic =====
function botMove(){
  const i = Math.floor(randFloat() * 3);
  return MOVES[i];
}

function decide(you, bot){
  if (you === bot) return "draw";
  if (
    (you==="rock" && bot==="scissors") ||
    (you==="scissors" && bot==="paper") ||
    (you==="paper" && bot==="rock")
  ) return "win";
  return "lose";
}

function setRoundUI(bot){
  botIcon.textContent = ICON[bot];
  botPickView.textContent = MOVE_RU[bot]; // ✅ русский
  resultView.textContent = "—";
}

// кнопка “Играть”
playBtn.onclick = async () => {
  if (busy) return;
  busy = true;

  // старт серии: списываем ставку один раз
  if (!inSeries) {
    const bet = Math.floor(Number(betInput.value) || 0);
    if (bet <= 0) { busy=false; return; }
    if (bet > wallet.coins) { alert("Недостаточно средств"); busy=false; return; }

    lockedBet = bet;
    addCoins(-lockedBet);
    inSeries = true;
    lockBetUI(true);
    winView.textContent = `0 ₽`;
    cashoutBtn.disabled = true;

    statusView.textContent = "Серия";
  }

  statusView.textContent = "Раунд...";
  youPickView.textContent = MOVE_RU[picked];
  youIcon.textContent = ICON[picked];

  const bot = botMove();
  setRoundUI(bot);

  // лёгкая пауза для ощущения "раунда"
  await new Promise(r => setTimeout(r, 140));

  const outcome = decide(picked, bot);

  if (outcome === "draw") {
    resultView.textContent = "Ничья";
    statusView.textContent = "Ничья";
    beep(420, 55, 0.02);
  }

  if (outcome === "win") {
    series = Math.min(series + 1, MAX_STEP);
    resultView.textContent = "Победа";
    statusView.textContent = "Серия растёт";
    beep(760, 60, 0.03);
    beep(920, 60, 0.03);

    // можно кэшаутить после 1+ побед
    cashoutBtn.disabled = (series === 0);

    // авто-cashout на последнем шаге
    if (series === MAX_STEP) {
      await new Promise(r => setTimeout(r, 140));
      doCashout(true);
      busy = false;
      return;
    }
  }

  if (outcome === "lose") {
    resultView.textContent = "Поражение";
    statusView.textContent = "Серия в ноль";
    beep(220, 85, 0.03);

    // ставка уже сгорела (она списана в начале серии)
    winView.textContent = `0 ₽`;

    // сброс серии
    inSeries = false;
    series = 0;
    lockedBet = 0;
    cashoutBtn.disabled = true;
    lockBetUI(false);
  }

  renderLadder();
  renderStats();

  // показать потенциальный выигрыш, если серия активна
  if (inSeries && series > 0) {
    winView.textContent = `${Math.floor(lockedBet * currentX())} ₽`;
  } else if (!inSeries) {
    winView.textContent = `0 ₽`;
  }

  busy = false;
};

// кнопка “Забрать” (✅ РАБОТАЕТ)
function doCashout(auto = false){
  if (!inSeries) return;
  if (series <= 0) return;

  const payout = Math.floor(lockedBet * currentX());
  addCoins(payout);

  statusView.textContent = auto ? "Авто-кэшаут" : "Кэшаут";
  resultView.textContent = "Забрано";
  winView.textContent = `${payout} ₽`;

  // сбрасываем серию и разблокируем ставку
  inSeries = false;
  series = 0;
  lockedBet = 0;
  cashoutBtn.disabled = true;
  lockBetUI(false);

  renderLadder();
  renderStats();
  beep(820, 70, 0.03);
}

cashoutBtn.onclick = () => {
  if (busy) return;
  doCashout(false);
};
