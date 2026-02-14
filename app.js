// --- RNG (честный) ---
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

// --- Telegram WebApp ---
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// --- Wallet ---
const WALLET_KEY = "mini_wallet_coinflip_v3";
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

// --- Sound (легкий) ---
let soundOn = true;
function beep(freq = 520, ms = 55, vol = 0.03) {
  if (!soundOn) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, ms);
  } catch {}
}

// --- UI ---
const subTitle = document.getElementById("subTitle");
const balanceEl = document.getElementById("balance");
const balance2 = document.getElementById("balance2");

const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");

const coinEl = document.getElementById("coin");
const flipBtn = document.getElementById("flipBtn");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");

const betView = document.getElementById("betView");
const winView = document.getElementById("winView");
const statusView = document.getElementById("statusView");

const pickEagle = document.getElementById("pickEagle");
const pickTail = document.getElementById("pickTail");

const historyDots = document.getElementById("historyDots");

// --- state ---
let picked = "eagle"; // eagle|tail
let busy = false;

// history
const HISTORY_KEY = "coinflip_history_v2";
let hist = [];
try { hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { hist = []; }
if (!Array.isArray(hist)) hist = [];

function saveHist(){ localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(-18))); }
function pushHist(v){ hist.push(v); hist = hist.slice(-18); saveHist(); renderHist(); }
function renderHist(){
  historyDots.innerHTML = "";
  const show = hist.slice(-18);
  const empty = Math.max(0, 18 - show.length);
  for (let i=0;i<empty;i++){
    const d = document.createElement("div");
    d.className = "hDot";
    historyDots.appendChild(d);
  }
  for (const v of show){
    const d = document.createElement("div");
    d.className = "hDot " + (v === "eagle" ? "gold" : "silver");
    historyDots.appendChild(d);
  }
}

function renderTop(){
  const user = tg?.initDataUnsafe?.user;
  subTitle.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
  balanceEl.textContent = String(wallet.coins);
  balance2.textContent = String(wallet.coins);
}
renderTop();
renderHist();

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

// pick
function setPick(v){
  picked = v;
  pickEagle.classList.toggle("active", v === "eagle");
  pickTail.classList.toggle("active", v === "tail");
  beep(520, 50, 0.025);
}
pickEagle.onclick = () => setPick("eagle");
pickTail.onclick = () => setPick("tail");

function setCoinTheme(theme){
  coinEl.classList.remove("coin--purple","coin--gold","coin--silver");
  coinEl.classList.add(`coin--${theme}`);
}

// bet
function clampBet(){
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  betView.textContent = String(v);

  // reset visuals
  setCoinTheme("purple");
  winView.textContent = "+0";
  statusView.textContent = "Готов";
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

// ЛЁГКАЯ АНИМАЦИЯ: CSS class + animationend
function playFlipAnim(){
  return new Promise((resolve) => {
    const onEnd = () => {
      coinEl.removeEventListener("animationend", onEnd);
      coinEl.classList.remove("spin");
      resolve();
    };
    coinEl.addEventListener("animationend", onEnd, { once: true });

    // перезапуск анимации гарантированно
    coinEl.classList.remove("spin");
    void coinEl.offsetWidth; // reflow (один раз) — чтобы анимация стартанула
    coinEl.classList.add("spin");
  });
}

// flip
flipBtn.onclick = async () => {
  if (busy) return;

  const bet = Math.floor(Number(betInput.value) || 0);
  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");

  busy = true;
  flipBtn.disabled = true;
  statusView.textContent = "Бросок...";
  winView.textContent = "+0";

  // списываем ставку
  addCoins(-bet);

  // результат
  const result = (randFloat() < 0.5) ? "eagle" : "tail";

  beep(520, 55, 0.02);

  // во время броска монета остаётся фиолетовой
  setCoinTheme("purple");
  await playFlipAnim();

  // после — становится золотой/серебряной
  setCoinTheme(result === "eagle" ? "gold" : "silver");
  pushHist(result);

  const win = result === picked;
  if (win) {
    const payout = bet * 2;
    addCoins(payout);
    winView.textContent = `+${bet}`;
    statusView.textContent = "Победа";
    beep(760, 65, 0.03);
    beep(920, 65, 0.03);
  } else {
    winView.textContent = "+0";
    statusView.textContent = "Поражение";
    beep(220, 85, 0.03);
  }

  busy = false;
  flipBtn.disabled = false;
};
