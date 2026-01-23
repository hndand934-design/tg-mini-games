// --- RNG (честный) ---
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

// Crash-point распределение с "хвостом" (как демо)
function sampleCrashPoint() {
  // 1/(1-r) даёт длинный хвост, но режем верх для UI
  const r = randFloat();
  const raw = 1 / (1 - r);
  return Math.max(1.05, Math.min(raw, 50));
}

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const userEl = document.getElementById("user");
const balancePill = document.getElementById("balancePill");

const multEl = document.getElementById("mult");
const hintEl = document.getElementById("hint");
const roundStatusEl = document.getElementById("roundStatus");
const countdownEl = document.getElementById("countdown");
const myBetEl = document.getElementById("myBet");
const myStateEl = document.getElementById("myState");

const rocketWrap = document.getElementById("rocketWrap");
const trail = document.getElementById("trail");

const betInput = document.getElementById("betInput");
const joinBtn = document.getElementById("joinBtn");
const cashBtn = document.getElementById("cashBtn");
const bonusBtn = document.getElementById("bonusBtn");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");
const rngBtn = document.getElementById("rngBtn");
const soundBtn = document.getElementById("soundBtn");

// --- Virtual Coins (local) ---
const WALLET_KEY = "mini_wallet_crash_v1";
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

function renderTop() {
  const user = tg?.initDataUnsafe?.user;
  userEl.textContent = user
    ? `Привет, ${user.first_name}`
    : `Открыто вне Telegram`;
  balancePill.textContent = `🪙 ${wallet.coins}`;
}
renderTop();

// --- Sound (простая заглушка UI) ---
let soundOn = true;
soundBtn.onclick = () => {
  soundOn = !soundOn;
  soundBtn.textContent = soundOn ? "🔊" : "🔇";
};

// --- Bet UI helpers ---
function clampBet() {
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  return v;
}

document.querySelectorAll(".chip[data-bet]").forEach((b) => {
  b.onclick = () => {
    const val = b.dataset.bet;
    if (val === "max") betInput.value = String(wallet.coins || 1);
    else betInput.value = String(val);
    clampBet();
  };
});
betMinus.onclick = () => {
  betInput.value = String((Number(betInput.value) || 1) - 10);
  clampBet();
};
betPlus.onclick = () => {
  betInput.value = String((Number(betInput.value) || 1) + 10);
  clampBet();
};
betInput.oninput = clampBet;

bonusBtn.onclick = () => addCoins(1000);

// --- Crash game state ---
const ROUND = {
  WAIT: "wait",
  COUNTDOWN: "countdown",
  FLY: "fly",
  CRASHED: "crashed",
};

let state = {
  phase: ROUND.WAIT,
  mult: 1.0,
  crashPoint: sampleCrashPoint(),
  countdown: 5,
  // player
  inRound: false,
  bet: 0,
  cashed: false,
  cashMult: 0,
  // loop
  timer: null,
  startTs: 0,
};

// debug (для теста можно показать краш-поинт)
let debugReveal = false;
rngBtn.onclick = () => {
  debugReveal = !debugReveal;
  rngBtn.textContent = debugReveal
    ? `Краш-поинт (тест): x${state.crashPoint.toFixed(2)}`
    : "Краш-поинт скрыт (честный RNG)";
};

// --- Rocket animation mapping ---
function setRocketByMult(mult) {
  // Чем выше множитель — тем выше ракета
  // 1.0..20 => 0..-240px (примерно)
  const capped = Math.min(mult, 20);
  const y = -(capped - 1) * 13; // 19*13 ≈ 247px
  rocketWrap.style.transform = `translateX(-50%) translateY(${y}px)`;

  // факел/след
  if (state.phase === ROUND.FLY) {
    trail.style.opacity = "1";
  } else {
    trail.style.opacity = "0";
  }
}

// --- HUD render ---
function renderHUD() {
  multEl.textContent = `x${state.mult.toFixed(2)}`;

  if (state.phase === ROUND.WAIT) {
    roundStatusEl.textContent = "Ожидание";
    countdownEl.textContent = `Старт через ${state.countdown}s`;
    hintEl.textContent = "Ожидание — старт скоро";
  }

  if (state.phase === ROUND.COUNTDOWN) {
    roundStatusEl.textContent = "Раунд";
    countdownEl.textContent = `Старт через ${state.countdown}s`;
    hintEl.textContent = "Можно войти в раунд";
  }

  if (state.phase === ROUND.FLY) {
    roundStatusEl.textContent = "Раунд";
    countdownEl.textContent = "В полёте";
    hintEl.textContent = "Жми “Забрать” в любой момент";
  }

  if (state.phase === ROUND.CRASHED) {
    roundStatusEl.textContent = "Раунд";
    countdownEl.textContent = "Краш";
    hintEl.textContent = "Новый раунд скоро";
  }

  myBetEl.textContent = state.inRound ? `${state.bet} 🪙` : "—";
  if (!state.inRound) {
    myStateEl.textContent = "не в раунде";
  } else if (state.cashed) {
    myStateEl.textContent = `забрал на x${state.cashMult.toFixed(2)}`;
  } else if (state.phase === ROUND.CRASHED) {
    myStateEl.textContent = "не успел";
  } else {
    myStateEl.textContent = "в раунде";
  }

  // Buttons logic
  const canJoin = (state.phase === ROUND.WAIT || state.phase === ROUND.COUNTDOWN);
  joinBtn.disabled = !canJoin;
  cashBtn.disabled = !(state.phase === ROUND.FLY && state.inRound && !state.cashed);
}

// --- Player actions ---
joinBtn.onclick = () => {
  const bet = clampBet();
  if (bet <= 0) return;

  if (!(state.phase === ROUND.WAIT || state.phase === ROUND.COUNTDOWN)) {
    alert("Войти можно только до старта (в ожидании).");
    return;
  }
  if (state.inRound) {
    alert("Ты уже в раунде.");
    return;
  }
  if (bet > wallet.coins) {
    alert("Недостаточно монет.");
    return;
  }

  addCoins(-bet);
  state.inRound = true;
  state.bet = bet;
  state.cashed = false;
  state.cashMult = 0;
  renderHUD();
};

cashBtn.onclick = () => {
  if (!(state.phase === ROUND.FLY && state.inRound && !state.cashed)) return;
  state.cashed = true;
  state.cashMult = state.mult;

  const payout = Math.floor(state.bet * state.cashMult);
  addCoins(payout);

  renderHUD();
};

// --- Round engine ---
function resetRound() {
  state.phase = ROUND.WAIT;
  state.mult = 1.0;
  state.crashPoint = sampleCrashPoint();
  state.countdown = 5;

  // игрок остаётся в раунде? нет — новый раунд требует заново входить
  state.inRound = false;
  state.bet = 0;
  state.cashed = false;
  state.cashMult = 0;

  if (debugReveal) {
    rngBtn.textContent = `Краш-поинт (тест): x${state.crashPoint.toFixed(2)}`;
  } else {
    rngBtn.textContent = "Краш-поинт скрыт (честный RNG)";
  }

  setRocketByMult(1.0);
  renderHUD();
}

function startCountdown() {
  state.phase = ROUND.COUNTDOWN;
  renderHUD();

  const tick = () => {
    state.countdown -= 1;
    if (state.countdown <= 0) {
      startFlight();
      return;
    }
    renderHUD();
    state.timer = setTimeout(tick, 1000);
  };
  state.timer = setTimeout(tick, 1000);
}

function startFlight() {
  state.phase = ROUND.FLY;
  state.startTs = performance.now();
  renderHUD();

  const step = () => {
    if (state.phase !== ROUND.FLY) return;

    const t = (performance.now() - state.startTs) / 1000;

    // рост множителя: плавно ускоряется
    // важно: должно расти достаточно “вкусно”, но не улетать мгновенно
    const mult = 1 + t * 0.85 + t * t * 0.13;
    state.mult = mult;

    setRocketByMult(state.mult);
    renderHUD();

    if (state.mult >= state.crashPoint) {
      crashNow();
      return;
    }
    state.timer = requestAnimationFrame(step);
  };

  state.timer = requestAnimationFrame(step);
}

function crashNow() {
  state.phase = ROUND.CRASHED;

  // кто не успел — проиграл ставку
  // (монеты уже списаны при входе)
  renderHUD();

  // короткая пауза и новый раунд
  setTimeout(() => {
    resetRound();
    // WAIT 1 сек → countdown
    setTimeout(() => startCountdown(), 1000);
  }, 1800);
}

function boot() {
  resetRound();
  // небольшой wait и запускаем
  setTimeout(() => startCountdown(), 800);
}

boot();
