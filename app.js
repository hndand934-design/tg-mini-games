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

// --- Wallet (localStorage) ---
const WALLET_KEY = "mini_wallet_coinflip_v1";
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
  renderBalance();
}
function addCoins(d) {
  setCoins(wallet.coins + d);
}

// --- UI refs ---
const subtitleEl = document.getElementById("subtitle");
const balanceEl = document.getElementById("balance");

const coinEl = document.getElementById("coin");
const sparkEl = document.getElementById("coinSpark");

const soundBtn = document.getElementById("soundBtn");

const pickHeadsBtn = document.getElementById("pickHeads");
const pickTailsBtn = document.getElementById("pickTails");
const flipBtn = document.getElementById("flipBtn");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");

const betView = document.getElementById("betView");
const winView = document.getElementById("winView");
const statusView = document.getElementById("statusView");

const bonusBtn = document.getElementById("bonusBtn");

// --- State ---
let choice = null; // "heads" | "tails"
let busy = false;
let soundOn = true;

// --- Sound (без файлов) ---
function beep(type = "tick") {
  if (!soundOn) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";

    const now = ctx.currentTime;
    const freq =
      type === "win" ? 740 :
      type === "lose" ? 180 :
      440;

    o.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    o.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    o.stop(now + 0.18);

    setTimeout(() => ctx.close(), 250);
  } catch {}
}

// --- Helpers ---
function renderBalance() {
  balanceEl.textContent = String(wallet.coins);

  const user = tg?.initDataUnsafe?.user;
  subtitleEl.textContent = user
    ? `Привет, ${user.first_name}`
    : "Открыто вне Telegram";
}

function clampBet() {
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  betView.textContent = String(v);
  return v;
}

function setStatus(text) { statusView.textContent = text; }
function setWin(v) { winView.textContent = (v >= 0 ? `+${v}` : `${v}`); }

function setCoinState(stateClass) {
  coinEl.classList.remove("purple", "gold", "silver");
  coinEl.classList.add(stateClass);
}

function setChoice(next) {
  choice = next;
  pickHeadsBtn.classList.toggle("active", choice === "heads");
  pickTailsBtn.classList.toggle("active", choice === "tails");
}

function playSpark() {
  if (!sparkEl) return;
  sparkEl.classList.remove("play");
  void sparkEl.offsetWidth;
  sparkEl.classList.add("play");
}

function playLand() {
  coinEl.classList.remove("landed");
  void coinEl.offsetWidth;
  coinEl.classList.add("landed");
  setTimeout(() => coinEl.classList.remove("landed"), 260);
}

// сброс визуала при изменении ставки/выбора
function resetToReady() {
  setCoinState("purple");
  setStatus("Готов");
  setWin(0);
  coinEl.classList.remove("spin", "landed");
  if (sparkEl) sparkEl.classList.remove("play");
}

// --- Init ---
renderBalance();
setCoinState("purple");
setWin(0);
setStatus("Готов");
setChoice(null);

// --- Events ---
soundBtn.onclick = () => {
  soundOn = !soundOn;
  soundBtn.textContent = `Звук: ${soundOn ? "on" : "off"}`;
  beep("tick");
};

pickHeadsBtn.onclick = () => { setChoice("heads"); beep("tick"); };
pickTailsBtn.onclick = () => { setChoice("tails"); beep("tick"); };

bonusBtn.onclick = () => { addCoins(1000); beep("win"); };

document.querySelectorAll(".chip").forEach((b) => {
  b.onclick = () => {
    const val = b.dataset.bet;
    if (val === "max") betInput.value = String(wallet.coins);
    else betInput.value = String(val);
    clampBet();
    resetToReady();
    beep("tick");
  };
});

betMinus.onclick = () => {
  betInput.value = String((Number(betInput.value) || 1) - 10);
  clampBet();
  resetToReady();
  beep("tick");
};

betPlus.onclick = () => {
  betInput.value = String((Number(betInput.value) || 1) + 10);
  clampBet();
  resetToReady();
  beep("tick");
};

betInput.oninput = () => {
  clampBet();
  resetToReady();
};

flipBtn.onclick = async () => {
  if (busy) return;

  const bet = clampBet();
  if (!choice) {
    setStatus("Выбери Орёл/Решка");
    beep("lose");
    return;
  }
  if (bet <= 0) {
    setStatus("Ставка должна быть > 0");
    beep("lose");
    return;
  }
  if (bet > wallet.coins) {
    setStatus("Недостаточно монет");
    beep("lose");
    return;
  }

  busy = true;

  addCoins(-bet);

  setCoinState("purple");
  setStatus("Бросок...");
  setWin(0);

  coinEl.classList.remove("spin");
  void coinEl.offsetWidth;
  coinEl.classList.add("spin");
  beep("tick");

  const outcome = randFloat() < 0.5 ? "heads" : "tails";

  await new Promise((r) => setTimeout(r, 1050));

  coinEl.classList.remove("spin");
  setCoinState(outcome === "heads" ? "gold" : "silver");

  playLand();
  playSpark();

  const payout = bet * 2;
  const win = outcome === choice;

  if (win) {
    addCoins(payout);
    setWin(payout);
    setStatus("Победа");
    beep("win");
  } else {
    setWin(0);
    setStatus("Поражение");
    beep("lose");
  }

  busy = false;
};
