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
const WALLET_KEY = "mini_wallet_coinflip_v2";
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
function addCoins(d) {
  setCoins(wallet.coins + d);
}

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

// history storage (last 18)
const HISTORY_KEY = "coinflip_history_v1";
let hist = [];
try { hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { hist = []; }
if (!Array.isArray(hist)) hist = [];

function saveHist() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(-18)));
}
function pushHist(v) {
  hist.push(v);
  hist = hist.slice(-18);
  saveHist();
  renderHist();
}
function renderHist() {
  historyDots.innerHTML = "";
  const show = hist.slice(-18);
  // если мало — добьем пустыми
  const emptyCount = Math.max(0, 18 - show.length);
  for (let i=0;i<emptyCount;i++){
    const d = document.createElement("div");
    d.className = "hDot";
    historyDots.appendChild(d);
  }
  for (const v of show) {
    const d = document.createElement("div");
    d.className = "hDot " + (v === "eagle" ? "gold" : "silver");
    historyDots.appendChild(d);
  }
}

function renderTop() {
  const user = tg?.initDataUnsafe?.user;
  subTitle.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
  balanceEl.textContent = String(wallet.coins);
  balance2.textContent = String(wallet.coins);
}
renderTop();
renderHist();

// Sound toggle
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

// Bonus
bonusBtn.onclick = () => {
  addCoins(1000);
  beep(760, 70, 0.03);
};

// Pick
function setPick(v) {
  picked = v;
  pickEagle.classList.toggle("active", v === "eagle");
  pickTail.classList.toggle("active", v === "tail");
  beep(520, 50, 0.025);
}
pickEagle.onclick = () => setPick("eagle");
pickTail.onclick = () => setPick("tail");

function setCoinTheme(theme) {
  coinEl.classList.remove("coin--purple", "coin--gold", "coin--silver");
  coinEl.classList.add(`coin--${theme}`);
}

// bet
function clampBet() {
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

// chips
document.querySelectorAll(".chip").forEach((b) => {
  b.onclick = () => {
    const val = b.dataset.bet;
    if (val === "max") betInput.value = String(wallet.coins);
    else betInput.value = String(val);
    clampBet();
    beep(540, 55, 0.02);
  };
});

clampBet();

// --- ULTRA SMOOTH animation (mobile-friendly) ---
// только transform, без blur, через Web Animations API
function animateFlip(duration = 720) {
  // небольшой “tilt” + много оборотов
  const keyframes = [
    { transform: "translateZ(0) rotateX(8deg) rotateY(0deg) scale(1)" },
    { transform: "translateZ(0) rotateX(16deg) rotateY(540deg) scale(1.04)" },
    { transform: "translateZ(0) rotateX(22deg) rotateY(1080deg) scale(1.06)" },
    { transform: "translateZ(0) rotateX(10deg) rotateY(1620deg) scale(1.02)" },
    { transform: "translateZ(0) rotateX(8deg) rotateY(1800deg) scale(1)" },
  ];

  // Safari iOS отлично тянет это
  if (coinEl.animate) {
    return coinEl.animate(keyframes, {
      duration,
      easing: "cubic-bezier(.2,.85,.2,1)",
      fill: "both",
    }).finished;
  }

  // fallback: если animate нет — просто задержка
  return new Promise((r) => setTimeout(r, duration));
}

// Flip
flipBtn.onclick = async () => {
  if (busy) return;

  const bet = Math.floor(Number(betInput.value) || 0);
  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");

  busy = true;
  flipBtn.disabled = true;
  statusView.textContent = "Бросок...";
  winView.textContent = "+0";

  // списываем ставку сразу
  addCoins(-bet);

  // определяем результат
  const result = randFloat() < 0.5 ? "eagle" : "tail";

  beep(520, 55, 0.02);

  // крутилка
  await animateFlip(720);

  // применяем цвет результата
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
