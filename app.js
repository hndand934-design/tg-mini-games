// ===== RPS (бот, финальная логика: ставка списывается 1 раз на старт серии) =====

// --- Telegram WebApp ---
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

// --- Wallet ---
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
  renderTop();
}
function addCoins(d){ setCoins(wallet.coins + d); }

// --- Sound ---
let soundOn = true;
function beep(freq=520, ms=55, vol=0.03){
  if(!soundOn) return;
  try{
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    setTimeout(()=>{ o.stop(); ctx.close(); }, ms);
  }catch{}
}

// --- RNG ---
function randInt(n){
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
}

// --- Elements ---
const balanceEl = document.getElementById("balance");
const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus  = document.getElementById("betPlus");

const playBtn = document.getElementById("playBtn");
const cashBtn = document.getElementById("cashBtn");
const winLine = document.getElementById("winLine");

const pickRock = document.getElementById("pickRock");
const pickScissors = document.getElementById("pickScissors");
const pickPaper = document.getElementById("pickPaper");

const ladderEl = document.getElementById("ladder");

const bStatus = document.getElementById("bStatus");
const bYou = document.getElementById("bYou");
const bBot = document.getElementById("bBot");
const bResult = document.getElementById("bResult");

const streakText = document.getElementById("streakText");
const xText = document.getElementById("xText");
const potentialText = document.getElementById("potentialText");

const youIcon = document.getElementById("youIcon");
const botIcon = document.getElementById("botIcon");

// --- Ladder ---
const LADDER = [1.00, 1.20, 1.50, 2.00, 3.00, 5.00, 10.00];
const MAX_STEP = LADDER.length - 1;

// --- State ---
let chosen = "rock";
let inSeries = false;
let seriesBet = 0;
let step = 0;
let busy = false;

// --- SVG руки (теперь бежевые через CSS переменную --hand) ---
function svgRock(){
  return `
  <svg class="handSvg" viewBox="0 0 64 64" aria-hidden="true">
    <path class="handFill" d="M22 30c0-5 4-9 9-9h2c5 0 9 4 9 9v2c0 2 2 3 2 6v7c0 8-7 14-16 14S12 53 12 45v-6c0-5 3-9 10-9z"/>
    <path class="handStroke" d="M18 34h28M16 41h32"/>
  </svg>`;
}
function svgPaper(){
  return `
  <svg class="handSvg" viewBox="0 0 64 64" aria-hidden="true">
    <path class="handFill" d="M18 30c0-7 6-12 14-12s14 5 14 12v16c0 9-7 16-14 16S18 55 18 46z"/>
    <path class="handStroke" d="M22 26h20M22 32h20M22 38h20"/>
  </svg>`;
}
function svgScissors(){
  return `
  <svg class="handSvg" viewBox="0 0 64 64" aria-hidden="true">
    <path class="handFill" d="M20 44c0-7 5-12 12-12h2c7 0 12 5 12 12v6c0 6-5 12-13 12S20 56 20 50z"/>
    <path class="handFill" d="M24 14c2-3 6-4 9-2l6 4c3 2 4 6 2 9-2 3-6 4-9 2l-6-4c-3-2-4-6-2-9z"/>
    <path class="handFill" d="M34 12c3-2 7-1 9 2 2 3 1 7-2 9l-6 4c-3 2-7 1-9-2-2-3-1-7 2-9z"/>
    <path class="handStroke" d="M32 30v-8"/>
  </svg>`;
}
function iconFor(choice){
  if(choice==="rock") return svgRock();
  if(choice==="paper") return svgPaper();
  return svgScissors();
}
function labelFor(choice){
  if(choice==="rock") return "Камень";
  if(choice==="paper") return "Бумага";
  return "Ножницы";
}

// --- Render ---
function renderTop(){
  balanceEl.textContent = `${wallet.coins} ₽`;
}
renderTop();

function renderLadder(){
  ladderEl.innerHTML = "";
  LADDER.forEach((x, i)=>{
    const d = document.createElement("div");
    d.className = "step" + (i===step ? " active" : "");
    d.innerHTML = `<div class="sTitle">${i===0 ? "Старт" : `Шаг ${i}`}</div><div class="sX">x${x.toFixed(2)}</div>`;
    ladderEl.appendChild(d);
  });
}
function renderStats(){
  streakText.textContent = `${step} побед`;
  xText.textContent = `x${LADDER[step].toFixed(2)}`;
  const pot = inSeries ? Math.floor(seriesBet * LADDER[step]) : 0;
  potentialText.textContent = `${pot} ₽`;
  winLine.textContent = inSeries ? `${pot} ₽` : "0 ₽";
  cashBtn.disabled = !(inSeries && step >= 1 && !busy);
}
function setBadges(status, you, bot, res){
  bStatus.textContent = status;
  bYou.textContent = you;
  bBot.textContent = bot;
  bResult.textContent = res;
}

function setPick(choice){
  chosen = choice;
  pickRock.classList.toggle("active", choice==="rock");
  pickScissors.classList.toggle("active", choice==="scissors");
  pickPaper.classList.toggle("active", choice==="paper");
  youIcon.innerHTML = iconFor(choice);
  bYou.textContent = labelFor(choice);
  beep(520, 45, 0.02);
}
setPick("rock");

// --- Bet ---
function clampBet(){
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;

  if (!inSeries){
    if (v > wallet.coins) v = wallet.coins;
    betInput.value = String(v);
  } else {
    betInput.value = String(seriesBet);
  }
}
betInput.addEventListener("input", ()=>{ if(!inSeries) clampBet(); });

betMinus.onclick = () => { if(inSeries) return; betInput.value = String((+betInput.value||1)-10); clampBet(); };
betPlus.onclick  = () => { if(inSeries) return; betInput.value = String((+betInput.value||1)+10); clampBet(); };

document.querySelectorAll(".chip").forEach(btn=>{
  btn.onclick = () => {
    if(inSeries) return;
    const val = btn.dataset.bet;
    betInput.value = (val==="max") ? String(wallet.coins) : String(val);
    clampBet();
    beep(540, 55, 0.02);
  };
});
clampBet();

// --- Sound/bonus ---
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

// --- Picks ---
pickRock.onclick = () => setPick("rock");
pickScissors.onclick = () => setPick("scissors");
pickPaper.onclick = () => setPick("paper");

// --- Game ---
function botChoice(){
  const r = randInt(3);
  return r===0 ? "rock" : (r===1 ? "scissors" : "paper");
}
function outcome(me, bot){
  if(me===bot) return "draw";
  if(
    (me==="rock" && bot==="scissors") ||
    (me==="scissors" && bot==="paper") ||
    (me==="paper" && bot==="rock")
  ) return "win";
  return "lose";
}

function resetUI(){
  botIcon.innerHTML = "🤖";
  setBadges(inSeries ? "Серия" : "Ожидание", labelFor(chosen), "—", inSeries ? "Серия растёт" : "—");
  renderLadder();
  renderStats();
}
resetUI();

function endSeriesLost(){
  inSeries = false;
  seriesBet = 0;
  step = 0;
  renderLadder();
  renderStats();
  clampBet();
}

function cashout(){
  if(!inSeries || step < 1 || busy) return;
  const payout = Math.floor(seriesBet * LADDER[step]);
  addCoins(payout);
  inSeries = false;
  seriesBet = 0;
  step = 0;
  renderLadder();
  renderStats();
  clampBet();
  setBadges("Кэшаут", labelFor(chosen), "—", "Забрал");
  winLine.textContent = `${payout} ₽`;
  beep(760, 65, 0.03); beep(920, 65, 0.03);
}
cashBtn.onclick = cashout;

playBtn.onclick = async () => {
  if(busy) return;

  const bet = Math.floor(Number(betInput.value) || 0);

  if(!inSeries){
    if(bet <= 0) return alert("Ставка должна быть больше 0");
    if(bet > wallet.coins) return alert("Недостаточно средств");

    addCoins(-bet);
    inSeries = true;
    seriesBet = bet;
    step = 0;
  }

  busy = true;
  playBtn.disabled = true;
  cashBtn.disabled = true;

  const bot = botChoice();
  const res = outcome(chosen, bot);

  botIcon.innerHTML = iconFor(bot);
  bBot.textContent = labelFor(bot);

  if(res === "draw"){
    setBadges("Ничья", labelFor(chosen), labelFor(bot), "Серия без изменений");
    beep(520, 50, 0.02);
  } else if(res === "win"){
    step = Math.min(MAX_STEP, step + 1);
    setBadges("Победа", labelFor(chosen), labelFor(bot), step===MAX_STEP ? "Авто-кэшаут" : "Серия растёт");
    beep(760, 55, 0.03);

    renderLadder();
    renderStats();

    if(step === MAX_STEP){
      await new Promise(r=>setTimeout(r, 220));
      cashout();
      busy = false;
      playBtn.disabled = false;
      return;
    }
  } else {
    setBadges("Поражение", labelFor(chosen), labelFor(bot), "Серия в ноль");
    beep(220, 85, 0.03);
    endSeriesLost();
  }

  renderLadder();
  renderStats();

  busy = false;
  playBtn.disabled = false;
};

renderLadder();
renderStats();
