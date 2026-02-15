// --- RNG (честный) ---
function randInt(min, max) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  const r = a[0] / 2 ** 32;
  return Math.floor(r * (max - min + 1)) + min;
}

// --- Telegram WebApp ---
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// --- Wallet ---
const WALLET_KEY = "mini_wallet_dice_v1";
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

// --- Sound ---
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
    o.connect(g); g.connect(ctx.destination);
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, ms);
  } catch {}
}

// --- UI refs ---
const subTitle = document.getElementById("subTitle");
const balanceEl = document.getElementById("balance");
const balance2 = document.getElementById("balance2");

const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");

const modeLess = document.getElementById("modeLess");
const modeMore = document.getElementById("modeMore");
const rulePill = document.getElementById("rulePill");

const multView = document.getElementById("multView");
const winView = document.getElementById("winView");
const chanceView = document.getElementById("chanceView");

const thrRange = document.getElementById("thrRange");
const thrView = document.getElementById("thrView");
const rolledView = document.getElementById("rolledView");

const dieEl = document.getElementById("die");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");
const rollBtn = document.getElementById("rollBtn");

// --- state ---
let mode = "more";     // "more" | "less"
let threshold = 2;     // 1..6
let busy = false;

// IMPORTANT: углы подобраны так, чтобы ВЕРХНЯЯ грань = нужное число.
// Face layout в CSS: 1 top,6 bottom,3 front,4 back,2 right,5 left
// Для rotateY затем rotateX (как в transform): эти пары дают нужную верхнюю грань.
function anglesForTop(n) {
  switch (n) {
    case 1: return { rx: 0,   ry: 0   };
    case 2: return { rx: 90,  ry: 90  };
    case 3: return { rx: 270, ry: 0   };
    case 4: return { rx: 90,  ry: 0   };
    case 5: return { rx: 90,  ry: 270 };
    case 6: return { rx: 180, ry: 0   };
    default: return { rx: 0, ry: 0 };
  }
}

function setDieToNumber(n) {
  const { rx, ry } = anglesForTop(n);
  // небольшой "камерный" наклон сохраняем через rotateZ, чтобы выглядело живо
  dieEl.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(0deg)`;
}

function renderTop() {
  const user = tg?.initDataUnsafe?.user;
  subTitle.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
  balanceEl.textContent = String(wallet.coins);
  balance2.textContent = String(wallet.coins);
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

bonusBtn.onclick = () => { addCoins(1000); beep(760, 70, 0.03); };

// bet controls
function clampBet() {
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  recompute();
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

// mode
function setMode(m) {
  mode = m;
  modeLess.classList.toggle("active", m === "less");
  modeMore.classList.toggle("active", m === "more");
  beep(520, 50, 0.02);
  recompute();
}
modeLess.onclick = () => setMode("less");
modeMore.onclick = () => setMode("more");

// threshold
thrRange.oninput = () => {
  threshold = Math.max(1, Math.min(6, Number(thrRange.value) || 2));
  thrView.textContent = String(threshold);
  recompute();
};

function chanceFor(mode, thr) {
  // less: win if roll <= thr (chance = thr/6)
  // more: win if roll >= thr (chance = (7-thr)/6)
  const c = mode === "less" ? (thr / 6) : ((7 - thr) / 6);
  return Math.max(1/6, Math.min(1, c));
}

function computeMultiplier(chance) {
  // house edge ~2%
  const m = (1 / chance) * 0.98;
  return Math.max(1.01, m);
}

function recompute() {
  const bet = Math.floor(Number(betInput.value) || 0);
  const c = chanceFor(mode, threshold);
  const mult = computeMultiplier(c);

  multView.textContent = `x${mult.toFixed(2)}`;
  chanceView.textContent = `${(c * 100).toFixed(1)}%`;

  const payout = Math.floor(bet * mult);
  const profit = Math.max(0, payout - bet);
  winView.textContent = `+${profit}`;

  // правило справа сверху
  rulePill.textContent = mode === "more"
    ? `Выигрыш если выпало ≥ ${threshold}`
    : `Выигрыш если выпало ≤ ${threshold}`;
}
clampBet();
setMode("more");
threshold = Number(thrRange.value) || 2;
setDieToNumber(1); // стартовая поза

function playRollAnim() {
  return new Promise((resolve) => {
    const done = () => {
      dieEl.removeEventListener("animationend", done);
      dieEl.classList.remove("rolling");
      resolve();
    };
    dieEl.addEventListener("animationend", done, { once: true });

    dieEl.classList.remove("rolling");
    void dieEl.offsetWidth; // reflow
    dieEl.classList.add("rolling");
  });
}

// roll
rollBtn.onclick = async () => {
  if (busy) return;

  const bet = Math.floor(Number(betInput.value) || 0);
  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");

  busy = true;
  rollBtn.disabled = true;
  rolledView.textContent = "—";
  beep(520, 55, 0.02);

  // списываем ставку
  addCoins(-bet);

  // генерим число
  const rolled = randInt(1, 6);

  // анимация
  await playRollAnim();

  // ВАЖНО: после анимации СТАВИМ грань строго под rolled
  setDieToNumber(rolled);
  rolledView.textContent = String(rolled);

  // win check
  const win = mode === "less" ? (rolled <= threshold) : (rolled >= threshold);
  const c = chanceFor(mode, threshold);
  const mult = computeMultiplier(c);

  if (win) {
    const payout = Math.floor(bet * mult);
    addCoins(payout);
    beep(760, 65, 0.03);
    beep(920, 65, 0.03);
  } else {
    beep(220, 85, 0.03);
  }

  // обновляем возможный выигрыш (на случай если баланс изменился)
  recompute();

  busy = false;
  rollBtn.disabled = false;
};
