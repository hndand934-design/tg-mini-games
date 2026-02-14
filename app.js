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

// --- Sound (лёгкий) ---
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

// --- UI refs ---
const subTitle = document.getElementById("subTitle");
const balanceEl = document.getElementById("balance");

const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");
const bonusBtn2 = document.getElementById("bonusBtn2");

const btnLow = document.getElementById("btnLow");
const btnHigh = document.getElementById("btnHigh");

const thrRange = document.getElementById("thrRange");
const thrText = document.getElementById("thrText");

const multView = document.getElementById("multView");
const payoutView = document.getElementById("payoutView");
const chanceView = document.getElementById("chanceView");
const rulePill = document.getElementById("rulePill");
const rolledText = document.getElementById("rolledText");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");
const rollBtn = document.getElementById("rollBtn");

const diceEl = document.getElementById("dice");
const topNumEl = document.getElementById("topNum");

// --- state ---
let mode = "high"; // "high" (>= threshold) or "low" (<= threshold)
let busy = false;
const houseEdge = 0.985;

// ориентиры “какая грань спереди” (для финальной посадки)
const ORIENT = {
  1: { rx: -22, ry: 32 },
  2: { rx: -22, ry: -58 },
  3: { rx: -112, ry: 32 },
  4: { rx: 68, ry: 32 },
  5: { rx: -22, ry: 122 },
  6: { rx: -22, ry: 212 }
};

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
function doBonus(){
  addCoins(1000);
  beep(760, 70, 0.03);
}
bonusBtn.onclick = doBonus;
bonusBtn2.onclick = doBonus;

// mode
function setMode(m){
  mode = m;
  btnLow.classList.toggle("active", m === "low");
  btnHigh.classList.toggle("active", m === "high");
  updateMath();
  beep(520, 55, 0.02);
}
btnLow.onclick = () => setMode("low");
btnHigh.onclick = () => setMode("high");

// bet
function clampBet(){
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  updateMath();
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

// threshold
thrRange.addEventListener("input", () => {
  thrText.textContent = String(thrRange.value);
  updateMath();
  beep(500, 35, 0.015);
});

// math
function calcChance(threshold){
  const t = Number(threshold);
  return (mode === "high") ? ((7 - t) / 6) : (t / 6);
}
function updateMath(){
  const t = Number(thrRange.value);
  thrText.textContent = String(t);

  const chance = calcChance(t);
  const mult = Math.max(1, (houseEdge / chance));
  multView.textContent = `x${mult.toFixed(2)}`;

  const bet = Math.floor(Number(betInput.value) || 0);
  const payout = Math.floor(bet * mult);
  payoutView.textContent = `+${Math.max(0, payout - bet)}`;
  chanceView.textContent = `${(chance * 100).toFixed(1)}%`;

  rulePill.textContent = (mode === "high")
    ? `Выигрыш если выпало ≥ ${t}`
    : `Выигрыш если выпало ≤ ${t}`;
}
clampBet();
updateMath();

// dice anim
function animateDiceTo(n){
  return new Promise((resolve) => {
    const o = ORIENT[n] || ORIENT[1];
    diceEl.style.setProperty("--rx", `${o.rx}deg`);
    diceEl.style.setProperty("--ry", `${o.ry}deg`);

    const onEnd = () => {
      diceEl.removeEventListener("animationend", onEnd);
      diceEl.classList.remove("rolling");
      resolve();
    };

    diceEl.addEventListener("animationend", onEnd, { once:true });

    diceEl.classList.remove("rolling");
    void diceEl.offsetWidth; // один reflow
    diceEl.classList.add("rolling");
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

  // ставка списалась
  addCoins(-bet);

  // RNG 1..6
  const rolled = randInt(1, 6);
  rolledText.textContent = String(rolled);

  // число на верхней грани
  topNumEl.textContent = String(rolled);
  diceEl.classList.add("showTopNum");

  beep(520, 55, 0.02);
  await animateDiceTo(rolled);

  const t = Number(thrRange.value);
  const win = (mode === "high") ? (rolled >= t) : (rolled <= t);

  const chance = calcChance(t);
  const mult = Math.max(1, (houseEdge / chance));
  const payout = Math.floor(bet * mult);

  if (win) {
    addCoins(payout);
    payoutView.textContent = `+${Math.max(0, payout - bet)}`;
    beep(760, 65, 0.03);
    beep(920, 65, 0.03);
  } else {
    payoutView.textContent = `+0`;
    beep(220, 85, 0.03);
  }

  busy = false;
  rollBtn.disabled = false;
};

