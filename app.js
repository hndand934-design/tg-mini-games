// ===== RNG (честный) =====
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function randChoice(arr){
  return arr[Math.floor(randFloat() * arr.length)];
}

// ===== Telegram WebApp =====
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
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

function setCoins(v){
  wallet.coins = Math.max(0, Math.floor(v));
  saveWallet(wallet);
  balanceEl.textContent = `${wallet.coins} ₽`;
}
function addCoins(d){ setCoins(wallet.coins + d); }

// ===== Sound (тихо) =====
let soundOn = true;
function beep(freq=520, ms=55, vol=0.03, type="sine"){
  if (!soundOn) return;
  try{
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
    setTimeout(()=>{ o.stop(); ctx.close(); }, ms);
  }catch{}
}
function sWin(){ beep(760,70,0.03); setTimeout(()=>beep(920,70,0.03), 75); }
function sLose(){ beep(220,110,0.03, "sine"); }
function sClick(){ beep(520,45,0.02); }

// ===== UI =====
const balanceEl = document.getElementById("balance");

const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");

const bStatus = document.getElementById("bStatus");
const bYou = document.getElementById("bYou");
const bBot = document.getElementById("bBot");
const bResult = document.getElementById("bResult");

const ladderEl = document.getElementById("ladder");
const streakText = document.getElementById("streakText");
const xText = document.getElementById("xText");
const potentialText = document.getElementById("potentialText");

const botIcon = document.getElementById("botIcon");
const youIcon = document.getElementById("youIcon");

const pickRock = document.getElementById("pickRock");
const pickScissors = document.getElementById("pickScissors");
const pickPaper = document.getElementById("pickPaper");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");

const playBtn = document.getElementById("playBtn");
const cashBtn = document.getElementById("cashBtn");
const winLine = document.getElementById("winLine");

// ===== Game config =====
const STEPS = [
  { name:"Старт", x:1.00 },
  { name:"Шаг 1", x:1.20 },
  { name:"Шаг 2", x:1.50 },
  { name:"Шаг 3", x:2.00 },
  { name:"Шаг 4", x:3.00 },
  { name:"Шаг 5", x:5.00 },
  { name:"Шаг 6", x:10.00 },
];

// ===== State =====
let picked = "rock";                 // rock|scissors|paper
let seriesActive = false;            // ставка уже списана, серия идёт
let lockedBet = 0;                   // ставка серии
let stepIndex = 0;                   // 0..6 (текущий уровень)
let busy = false;

function choiceLabel(c){
  if (c === "rock") return "Камень";
  if (c === "scissors") return "Ножницы";
  return "Бумага";
}
function choiceIcon(c){
  if (c === "rock") return "✊";
  if (c === "scissors") return "✌️";
  return "🖐️";
}
function setPick(v){
  if (busy) return;
  picked = v;
  pickRock.classList.toggle("active", v==="rock");
  pickScissors.classList.toggle("active", v==="scissors");
  pickPaper.classList.toggle("active", v==="paper");

  bYou.textContent = choiceLabel(v);
  youIcon.textContent = choiceIcon(v);
  sClick();
}

function renderLadder(){
  ladderEl.innerHTML = "";
  STEPS.forEach((s, i) => {
    const d = document.createElement("div");
    d.className = "step" + (i === stepIndex ? " active" : "");
    d.innerHTML = `<div class="sTitle">${s.name}</div><div class="sX">x${s.x.toFixed(2)}</div>`;
    ladderEl.appendChild(d);
  });
}

function canChangeBet(){
  return !seriesActive && !busy;
}

function clampBet(){
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
}
function setBet(v){
  betInput.value = String(v);
  clampBet();
}

function updatePanels(){
  // streak
  const streak = Math.max(0, stepIndex); // шаг 0 = 0 побед
  streakText.textContent = `${streak} побед`;

  // current X
  xText.textContent = `x${STEPS[stepIndex].x.toFixed(2)}`;

  // potential
  const bet = seriesActive ? lockedBet : Math.floor(Number(betInput.value)||0);
  const potential = seriesActive ? Math.floor(bet * STEPS[stepIndex].x) : bet;
  potentialText.textContent = `${potential} ₽`;

  // status line
  if (!seriesActive){
    bStatus.textContent = "Ожидание";
    bResult.textContent = "—";
    bBot.textContent = "—";
    botIcon.textContent = "🤖";
    winLine.textContent = "0 ₽";
    cashBtn.disabled = true;
  } else {
    bStatus.textContent = "Серия";
    cashBtn.disabled = (stepIndex === 0);
    const cashNow = Math.floor(lockedBet * STEPS[stepIndex].x);
    winLine.textContent = `${cashNow} ₽`;
  }

  // lock bet UI
  const lock = !canChangeBet();
  betInput.disabled = lock;
  betMinus.disabled = lock;
  betPlus.disabled = lock;
  document.querySelectorAll(".chip").forEach(b => b.disabled = lock);

  // play enabled (нужен выбор + ставка)
  playBtn.disabled = busy || (!picked) || (Math.floor(Number(betInput.value)||0) <= 0 && !seriesActive);
}

function setMessage(status, resultText){
  bStatus.textContent = status;
  bResult.textContent = resultText || "—";
}

function startSeriesIfNeeded(){
  if (seriesActive) return true;
  const bet = Math.floor(Number(betInput.value)||0);
  if (bet <= 0) { alert("Ставка должна быть больше 0"); return false; }
  if (bet > wallet.coins) { alert("Недостаточно средств"); return false; }

  lockedBet = bet;
  addCoins(-bet);            // списываем 1 раз
  seriesActive = true;
  stepIndex = 0;
  renderLadder();
  updatePanels();
  return true;
}

function endSeriesLose(){
  seriesActive = false;
  lockedBet = 0;
  stepIndex = 0;
  renderLadder();
  updatePanels();
}

function cashout(reason="Cashout"){
  if (!seriesActive) return;
  const payout = Math.floor(lockedBet * STEPS[stepIndex].x);
  addCoins(payout);
  seriesActive = false;
  lockedBet = 0;
  stepIndex = 0;

  renderLadder();
  updatePanels();
  setMessage(reason, "Серия завершена");
}

function decide(bot, you){
  if (bot === you) return "draw";
  if (you === "rock" && bot === "scissors") return "win";
  if (you === "scissors" && bot === "paper") return "win";
  if (you === "paper" && bot === "rock") return "win";
  return "lose";
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
  sClick();
};

bonusBtn.onclick = () => { addCoins(1000); sWin(); };

pickRock.onclick = () => setPick("rock");
pickScissors.onclick = () => setPick("scissors");
pickPaper.onclick = () => setPick("paper");

betInput.addEventListener("input", () => { if (canChangeBet()) clampBet(); updatePanels(); });
betMinus.onclick = () => { if (!canChangeBet()) return; setBet((Number(betInput.value)||1) - 10); sClick(); updatePanels(); };
betPlus.onclick  = () => { if (!canChangeBet()) return; setBet((Number(betInput.value)||1) + 10); sClick(); updatePanels(); };

document.querySelectorAll(".chip").forEach((b) => {
  b.onclick = () => {
    if (!canChangeBet()) return;
    const val = b.dataset.bet;
    setBet(val === "max" ? wallet.coins : Number(val));
    sClick();
    updatePanels();
  };
});

cashBtn.onclick = () => {
  if (busy) return;
  if (!seriesActive || stepIndex === 0) return;
  cashout("Cashout");
  sWin();
};

// play
playBtn.onclick = async () => {
  if (busy) return;
  busy = true;
  updatePanels();

  if (!startSeriesIfNeeded()){
    busy = false; updatePanels(); return;
  }

  setMessage("Игра", "—");
  bYou.textContent = choiceLabel(picked);
  youIcon.textContent = choiceIcon(picked);

  const bot = randChoice(["rock","scissors","paper"]);
  bBot.textContent = choiceLabel(bot);
  botIcon.textContent = choiceIcon(bot);

  // небольшой “тайминг”
  await new Promise(r => setTimeout(r, 220));

  const r = decide(bot, picked);

  if (r === "draw"){
    bResult.textContent = "Ничья";
    setMessage("Ничья", "Ничья — шаг не меняется");
    beep(420, 80, 0.02);
    busy = false;
    updatePanels();
    return;
  }

  if (r === "win"){
    stepIndex = Math.min(stepIndex + 1, STEPS.length - 1);
    renderLadder();

    bResult.textContent = "Победа";
    setMessage("Победа", stepIndex === (STEPS.length - 1) ? "Максимум!" : "Серия растёт");

    // авто-cashout на максимальном шаге
    if (stepIndex === (STEPS.length - 1)){
      sWin();
      cashout("Авто-cashout");
    } else {
      sWin();
    }

    busy = false;
    updatePanels();
    return;
  }

  // lose
  bResult.textContent = "Серия в ноль";
  setMessage("Поражение", "Проиграл — серия в ноль");
  sLose();

  endSeriesLose();
  busy = false;
  updatePanels();
};

// ===== Init =====
setCoins(wallet.coins);
setPick("rock");
clampBet();
renderLadder();
updatePanels();
