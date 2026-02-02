// ===============================
// Rocket Crash — app.js (ONLY Crash)
// no history panel, no rocket sprite
// line grows + glow at endpoint
// sounds: start + crash (no music)
// ===============================

// --- RNG (честный) ---
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

// "классическая" формула crashPoint (скрыт заранее, честный RNG)
function genCrashPoint() {
  // houseEdge можно 0.01..0.05 (мягкий). Оставим 0.02
  const houseEdge = 0.02;
  const r = Math.max(1e-12, 1 - randFloat());
  const x = (1 - houseEdge) / r;
  // ограничим верх, чтобы не улетало бесконечно визуально (логика ок)
  return Math.max(1.01, Math.min(x, 300));
}

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// --- Wallet (local) ---
const WALLET_KEY = "rocket_wallet_v1";
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

// --- DOM ---
const elBalance = document.getElementById("balanceValue");
const elMult = document.getElementById("statMultValue");
const elMultHint = document.getElementById("statMultHint");
const elStatus = document.getElementById("statStatusValue");
const elStatusHint = document.getElementById("statStatusHint");
const elBet = document.getElementById("statBetValue");
const elBetHint = document.getElementById("statBetHint");

const btnSound = document.getElementById("soundBtn");
const btnBonus = document.getElementById("bonusBtn");
const btnJoin = document.getElementById("btnJoin");
const btnCash = document.getElementById("btnCash");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");
const chipButtons = Array.from(document.querySelectorAll(".chip"));

const centerTitle = document.getElementById("centerTitle");
const centerSub = document.getElementById("centerSub");

const canvas = document.getElementById("chart");
const ctx = canvas.getContext("2d", { alpha: true });

// --- Resize canvas (retina) ---
function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", () => {
  fitCanvas();
  draw(); // перерисовка
});

// --- UI render ---
function renderBalance() {
  if (elBalance) elBalance.textContent = `🪙 ${wallet.coins}`;
}
renderBalance();

function clampBetUI() {
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  return v;
}

// --- Sounds (start + crash only) ---
let soundEnabled = true;
btnSound?.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  btnSound.textContent = soundEnabled ? "Звук: on" : "Звук: off";
});

let audioCtx = null;
function ensureAudio() {
  if (!soundEnabled) return null;
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

function beep({ type = "sine", t = 0.12, f0 = 440, f1 = 440, gain = 0.08 } = {}) {
  const ac = ensureAudio();
  if (!ac) return;
  const now = ac.currentTime;

  const o = ac.createOscillator();
  const g = ac.createGain();

  o.type = type;
  o.frequency.setValueAtTime(f0, now);
  o.frequency.linearRampToValueAtTime(f1, now + t);

  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + t);

  o.connect(g);
  g.connect(ac.destination);
  o.start(now);
  o.stop(now + t);
}

// мягкий “взлёт”
function sfxStart() {
  beep({ type: "triangle", t: 0.18, f0: 220, f1: 520, gain: 0.07 });
  setTimeout(() => beep({ type: "sine", t: 0.10, f0: 660, f1: 880, gain: 0.04 }), 60);
}

// “краш” (короткий удар)
function sfxCrash() {
  beep({ type: "sawtooth", t: 0.22, f0: 320, f1: 80, gain: 0.08 });
  setTimeout(() => beep({ type: "square", t: 0.10, f0: 140, f1: 60, gain: 0.05 }), 70);
}

// Разрешение звука в браузере: первый клик по странице
document.addEventListener("pointerdown", () => ensureAudio(), { once: true });

// --- Game State ---
const PHASE = {
  WAIT: "wait",   // ожидание/отсчёт
  FLY: "fly",     // полёт множителя
  CRASH: "crash"  // краш показан
};

let state = {
  phase: PHASE.WAIT,
  countdown: 3,
  crashPoint: genCrashPoint(),
  startAt: 0,
  mult: 1.0,
  // ставка игрока
  bet: 100,
  joined: false,
  betLocked: 0,
  cashed: false,
  // визуал
  spark: { on: false, x: 0, y: 0, r: 0, life: 0 }
};

function resetRound() {
  state.phase = PHASE.WAIT;
  state.countdown = 3;
  state.crashPoint = genCrashPoint();
  state.startAt = 0;
  state.mult = 1.0;
  state.joined = false;
  state.betLocked = 0;
  state.cashed = false;
  state.spark = { on: false, x: 0, y: 0, r: 0, life: 0 };

  updateUI();
  draw();
}

function startFly() {
  state.phase = PHASE.FLY;
  state.startAt = performance.now();
  state.mult = 1.0;
  state.spark.on = false;
  sfxStart();
  updateUI();
}

function doCrash() {
  state.phase = PHASE.CRASH;
  // эффект взрыва в точке конца
  state.spark.on = true;
  state.spark.life = 1.0;
  state.spark.r = 6;

  sfxCrash();

  // если игрок в раунде и не забрал — проиграл ставку
  if (state.joined && !state.cashed) {
    // ставка уже списана при входе
  }

  updateUI();
}

function nextRoundAfter(ms = 1400) {
  setTimeout(() => resetRound(), ms);
}

// --- Mult growth curve (красиво, ускоряется) ---
function multByTime(t) {
  // t в секундах
  // мягкая кривая, похожая на crash: сначала медленно, потом быстрее
  // base = exp(k*t) но ограничим визуально
  const k = 0.55;
  const m = Math.exp(k * t);
  return Math.max(1.0, m);
}

// --- Controls ---
chipButtons.forEach((b) => {
  b.addEventListener("click", () => {
    const v = Number(b.dataset.bet);
    if (!Number.isFinite(v)) return;
    betInput.value = String(v);
    state.bet = clampBetUI();
    updateUI();
  });
});

betMinus.addEventListener("click", () => {
  betInput.value = String((Number(betInput.value) || 1) - 10);
  state.bet = clampBetUI();
  updateUI();
});
betPlus.addEventListener("click", () => {
  betInput.value = String((Number(betInput.value) || 1) + 10);
  state.bet = clampBetUI();
  updateUI();
});
betInput.addEventListener("input", () => {
  state.bet = clampBetUI();
  updateUI();
});

btnBonus?.addEventListener("click", () => addCoins(1000));

// Вход в раунд — только во время WAIT (до старта)
btnJoin.addEventListener("click", () => {
  state.bet = clampBetUI();
  if (state.phase !== PHASE.WAIT) return;

  if (state.joined) {
    // уже в раунде
    return;
  }
  if (state.bet <= 0) return;
  if (state.bet > wallet.coins) return;

  // списываем ставку, фиксируем
  addCoins(-state.bet);
  state.joined = true;
  state.betLocked = state.bet;
  state.cashed = false;
  updateUI();
});

// Забрать — только во время FLY, если в раунде
btnCash.addEventListener("click", () => {
  if (state.phase !== PHASE.FLY) return;
  if (!state.joined) return;
  if (state.cashed) return;

  state.cashed = true;

  const payout = Math.floor(state.betLocked * state.mult);
  addCoins(payout);

  // маленький “блеск” в конце линии
  state.spark.on = true;
  state.spark.life = 0.6;
  state.spark.r = 5;

  updateUI();
});

// --- UI update ---
function updateUI() {
  renderBalance();

  // multiplier tile
  elMult.textContent = `x${state.mult.toFixed(2)}`;
  if (state.phase === PHASE.WAIT) elMultHint.textContent = "Ожидание";
  if (state.phase === PHASE.FLY) elMultHint.textContent = "Растёт...";
  if (state.phase === PHASE.CRASH) elMultHint.textContent = "Краш";

  // status tile
  if (state.phase === PHASE.WAIT) {
    elStatus.textContent = "Ожидание";
    elStatusHint.textContent = `Старт через ${state.countdown}с`;
  } else if (state.phase === PHASE.FLY) {
    elStatus.textContent = "Полёт";
    elStatusHint.textContent = "Можно забрать";
  } else {
    elStatus.textContent = "Краш";
    elStatusHint.textContent = `Краш на x${state.crashPoint.toFixed(2)}`;
  }

  // bet tile
  elBet.textContent = state.joined ? `${state.betLocked} 🪙` : "—";
  elBetHint.textContent = state.joined ? (state.cashed ? "забрал" : "в раунде") : "не в раунде";

  // center label
  centerTitle.textContent = `${state.mult.toFixed(2)}x`;
  if (state.phase === PHASE.WAIT) {
    centerSub.textContent = `Ожидание следующего раунда (${state.countdown}с)`;
  } else if (state.phase === PHASE.FLY) {
    centerSub.textContent = state.joined ? "Ты в раунде" : "Ты не в раунде";
  } else {
    centerSub.textContent = state.joined
      ? (state.cashed ? "Ты забрал" : "Ты не успел")
      : "Раунд завершён";
  }

  // кнопки
  btnJoin.disabled = !(state.phase === PHASE.WAIT);
  btnJoin.textContent = state.joined ? "В раунде (ждёшь)" : "Войти в раунд";

  btnCash.disabled = !(state.phase === PHASE.FLY && state.joined && !state.cashed);
}

// --- Drawing ---
function drawGrid(w, h) {
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;

  const step = 60;
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  for (let x = 0; x <= w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBackground(w, h) {
  ctx.clearRect(0, 0, w, h);

  // мягкая виньетка
  const g = ctx.createRadialGradient(w * 0.5, h * 0.45, 40, w * 0.5, h * 0.5, Math.max(w, h));
  g.addColorStop(0, "rgba(255,255,255,0.03)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  drawGrid(w, h);
}

// перевод множителя -> точка на графике
function mapToPoint(mult, w, h) {
  // по X — время (0..T), по Y — рост
  // Выбираем “окно” так, чтобы и 20x помещалось красиво
  // Вместо реального времени делаем нормализацию: x зависит от ln(mult)
  const pad = 18;

  const m = Math.max(1.0, mult);
  const xNorm = Math.min(1, Math.log(m) / Math.log(40)); // 40x ~ почти справа
  const yNorm = Math.min(1, (m - 1) / 25);               // 26x ~ почти вверх

  const x = pad + xNorm * (w - pad * 2);
  const y = (h - pad) - yNorm * (h - pad * 2);

  return { x, y };
}

function drawLineAndFill(w, h) {
  const pad = 18;

  const p = mapToPoint(state.mult, w, h);

  // baseline
  const x0 = pad;
  const y0 = h - pad;

  // линия — белая
  ctx.save();
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // glow
  ctx.shadowColor = "rgba(255,255,255,0.25)";
  ctx.shadowBlur = 10;

  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.moveTo(x0, y0);

  // кривая (квадратичная) к концу
  const cx = x0 + (p.x - x0) * 0.55;
  const cy = y0 - (y0 - p.y) * 0.15; // слегка выгнута
  ctx.quadraticCurveTo(cx, cy, p.x, p.y);
  ctx.stroke();
  ctx.restore();

  // заливка под кривой (красно-розовая)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  const cx2 = x0 + (p.x - x0) * 0.55;
  const cy2 = y0 - (y0 - p.y) * 0.15;
  ctx.quadraticCurveTo(cx2, cy2, p.x, p.y);
  ctx.lineTo(p.x, y0);
  ctx.closePath();

  const fill = ctx.createLinearGradient(0, p.y, 0, y0);
  fill.addColorStop(0, "rgba(255,80,120,0.18)");
  fill.addColorStop(1, "rgba(255,80,120,0.02)");
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();

  // точка на конце (как “интересно смотреть”)
  ctx.save();
  ctx.shadowColor = "rgba(255,255,255,0.35)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // эффекты: spark / crash flash
  if (state.spark.on && state.spark.life > 0) {
    const life = state.spark.life;
    const rr = state.spark.r + (1 - life) * 28;

    ctx.save();
    ctx.globalAlpha = Math.max(0, life);
    const rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
    if (state.phase === PHASE.CRASH) {
      rg.addColorStop(0, "rgba(255,80,80,0.55)");
      rg.addColorStop(1, "rgba(255,80,80,0)");
    } else {
      rg.addColorStop(0, "rgba(255,255,255,0.35)");
      rg.addColorStop(1, "rgba(255,255,255,0)");
    }
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  drawBackground(w, h);
  drawLineAndFill(w, h);
}

// --- Main loop ---
let lastTick = performance.now();
let raf = null;

function tick(now) {
  const dt = Math.min(0.05, (now - lastTick) / 1000);
  lastTick = now;

  // countdown
  if (state.phase === PHASE.WAIT) {
    // уменьшаем раз в секунду
    state._acc = (state._acc || 0) + dt;
    if (state._acc >= 1) {
      state._acc = 0;
      state.countdown -= 1;
      if (state.countdown <= 0) {
        startFly();
      }
      updateUI();
    }
  }

  // flight
  if (state.phase === PHASE.FLY) {
    const t = (now - state.startAt) / 1000;
    const m = multByTime(t);

    state.mult = Math.min(m, state.crashPoint);

    // если дошли до краша
    if (state.mult >= state.crashPoint - 1e-6) {
      state.mult = state.crashPoint;
      doCrash();
      nextRoundAfter(1400);
    }

    updateUI();
  }

  // spark decay
  if (state.spark.on) {
    state.spark.life -= dt * 1.8;
    if (state.spark.life <= 0) {
      state.spark.on = false;
      state.spark.life = 0;
    }
  }

  draw();
  raf = requestAnimationFrame(tick);
}

// --- Init ---
function init() {
  fitCanvas();
  state.bet = clampBetUI();
  updateUI();
  draw();

  if (raf) cancelAnimationFrame(raf);
  lastTick = performance.now();
  raf = requestAnimationFrame(tick);
}

init();
