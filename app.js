// ===============================
// Rocket Crash — ONLY (v1 stable)
// Works with: index.html + style.css (as sent earlier)
// ===============================

// -------- RNG (fair) ----------
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

// -------- Telegram WebApp ----------
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// -------- DOM ----------
const $ = (id) => document.getElementById(id);

const userText = $("userText");
const balanceText = $("balanceText");

const multText = $("multText");
const phaseHint = $("phaseHint");
const statusText = $("statusText");
const countText = $("countText");
const myBetText = $("myBetText");
const myStateText = $("myStateText");

const centerBig = $("centerBig");
const centerSmall = $("centerSmall");

const soundBtn = $("soundBtn");
const bonusBtn = $("bonusBtn");

const betInput = $("betInput");
const betMinus = $("betMinus");
const betPlus = $("betPlus");
const joinBtn = $("joinBtn");
const cashBtn = $("cashBtn");

const betHint = $("betHint");
const miniLog = $("miniLog");

const canvas = $("chart");
const ctx = canvas.getContext("2d");

// -------- User text ----------
const user = tg?.initDataUnsafe?.user;
userText.textContent = user
  ? `Привет, ${user.first_name}`
  : `Открыто вне Telegram`;

// -------- Wallet ----------
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
  balanceText.textContent = `🪙 ${wallet.coins}`;
}
function addCoins(d) {
  setCoins(wallet.coins + d);
}
setCoins(wallet.coins);

// -------- Log ----------
function logLine(s) {
  const now = new Date();
  const t = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  miniLog.textContent = `[${t}] ${s}\n` + (miniLog.textContent || "").slice(0, 700);
}

// -------- Sound (no external files) ----------
let soundOn = false;
let audioCtx = null;

function ensureAudio() {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  audioCtx = new Ctx();
  return audioCtx;
}
function beep(freq = 440, dur = 0.08, type = "sine", gain = 0.04) {
  if (!soundOn) return;
  const ac = ensureAudio();
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g);
  g.connect(ac.destination);
  o.start();
  o.stop(ac.currentTime + dur);
}
function soundToggle() {
  soundOn = !soundOn;
  soundBtn.textContent = `Звук: ${soundOn ? "on" : "off"}`;
  if (soundOn) {
    // unlock on gesture
    ensureAudio();
    beep(520, 0.06, "triangle", 0.035);
    beep(660, 0.06, "triangle", 0.03);
  }
}

soundBtn.addEventListener("click", soundToggle);
soundBtn.textContent = `Звук: off`;

// -------- Bet controls ----------
function clampBet() {
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  return v;
}
betInput.addEventListener("input", clampBet);
betMinus.addEventListener("click", () => {
  betInput.value = String((Number(betInput.value) || 1) - 10);
  clampBet();
});
betPlus.addEventListener("click", () => {
  betInput.value = String((Number(betInput.value) || 1) + 10);
  clampBet();
});

document.querySelectorAll(".chip").forEach((b) => {
  b.addEventListener("click", () => {
    const val = b.dataset.bet;
    if (val === "max") betInput.value = String(wallet.coins);
    else betInput.value = String(val);
    clampBet();
  });
});

bonusBtn.addEventListener("click", () => {
  addCoins(1000);
  beep(880, 0.06, "square", 0.03);
  logLine("Бонус: +1000 🪙");
  clampBet();
});

// -------- Game state ----------
const PHASE = {
  WAIT: "wait",
  FLY: "fly",
  CRASH: "crash",
};

const game = {
  phase: PHASE.WAIT,
  waitLeft: 5, // seconds
  // flight
  t: 0,
  mult: 1.0,
  crashPoint: 1.5,
  // player
  inRound: false,
  bet: 0,
  joinedThisRound: false,
  cashed: false,
};

function resetPlayerRoundFlags() {
  game.inRound = false;
  game.bet = 0;
  game.joinedThisRound = false;
  game.cashed = false;
}

function fairCrashPoint() {
  // Simple provably-fair-ish style distribution:
  // x = max(1.05, 1 / (1 - u)) gives heavy tail
  const u = randFloat();
  const x = 1 / Math.max(1e-9, (1 - u));
  return Math.max(1.05, Math.min(300, x));
}

// -------- UI updates ----------
function setCenter(big, small) {
  centerBig.textContent = big || "";
  centerSmall.textContent = small || "";
}

function updateTopUI() {
  multText.textContent = `x${game.mult.toFixed(2)}`;

  if (game.phase === PHASE.WAIT) {
    statusText.textContent = "Ожидание";
    phaseHint.textContent = "Новый раунд скоро";
    countText.textContent = `Старт через ${Math.ceil(game.waitLeft)}с`;
  }
  if (game.phase === PHASE.FLY) {
    statusText.textContent = "Полёт";
    phaseHint.textContent = "Ракета летит…";
    countText.textContent = "Можно забрать";
  }
  if (game.phase === PHASE.CRASH) {
    statusText.textContent = "Краш";
    phaseHint.textContent = "Раунд завершён";
    countText.textContent = "Скоро новый раунд";
  }

  if (!game.inRound) {
    myBetText.textContent = "—";
    myStateText.textContent = "не в раунде";
  } else {
    myBetText.textContent = `${game.bet} 🪙`;
    myStateText.textContent = game.cashed ? "забрал" : "в раунде";
  }

  // buttons
  if (game.phase === PHASE.WAIT) {
    joinBtn.disabled = game.inRound;      // нельзя дважды
    cashBtn.disabled = true;
    joinBtn.textContent = game.inRound ? "В раунде" : "Войти в раунд";
  } else if (game.phase === PHASE.FLY) {
    joinBtn.disabled = true;
    cashBtn.disabled = !game.inRound || game.cashed;
    joinBtn.textContent = "Вход закрыт";
  } else {
    joinBtn.disabled = true;
    cashBtn.disabled = true;
    joinBtn.textContent = "Ожидание…";
  }
}

// -------- Canvas helpers ----------
function resizeCanvasToCSS() {
  // Keep canvas resolution sharp
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  const needW = Math.floor(cssW * dpr);
  const needH = Math.floor(cssH * dpr);
  if (canvas.width !== needW || canvas.height !== needH) {
    canvas.width = needW;
    canvas.height = needH;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
}

function drawWinterBackground(w, h) {
  // dark gradient
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "rgba(10,16,34,0.0)");
  g.addColorStop(1, "rgba(0,0,0,0.18)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // subtle snowflakes
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "rgba(230,240,255,0.35)";
  for (let i = 0; i < 40; i++) {
    const x = (i * 97) % w;
    const y = (i * 53) % h;
    const r = 1 + ((i * 13) % 3);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // "snowy hills"
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "rgba(220,235,255,0.18)";
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.bezierCurveTo(w * 0.25, h * 0.82, w * 0.48, h * 0.98, w * 0.7, h * 0.86);
  ctx.bezierCurveTo(w * 0.85, h * 0.78, w * 0.93, h * 0.88, w, h * 0.82);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGrid(w, h, pad, gridX = 8, gridY = 6) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridX; i++) {
    const x = pad + (i * (w - pad * 2)) / gridX;
    ctx.beginPath();
    ctx.moveTo(x, pad);
    ctx.lineTo(x, h - pad);
    ctx.stroke();
  }
  for (let j = 0; j <= gridY; j++) {
    const y = pad + (j * (h - pad * 2)) / gridY;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - pad, y);
    ctx.stroke();
  }
  ctx.restore();
}

function rocketDraw(x, y, size = 18, angleRad = -0.75) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angleRad);

  // body
  ctx.fillStyle = "rgba(245,250,255,0.95)";
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(-size * 0.55, -size * 0.25, size * 1.1, size * 0.5, size * 0.2);
  ctx.fill();
  ctx.stroke();

  // window
  ctx.fillStyle = "rgba(76,125,255,0.75)";
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.12, 0, Math.PI * 2);
  ctx.fill();

  // nose
  ctx.fillStyle = "rgba(230,240,255,0.98)";
  ctx.beginPath();
  ctx.moveTo(size * 0.55, 0);
  ctx.lineTo(size * 0.82, size * 0.14);
  ctx.lineTo(size * 0.82, -size * 0.14);
  ctx.closePath();
  ctx.fill();

  // flame (only when flying)
  if (game.phase === PHASE.FLY) {
    ctx.globalAlpha = 0.9;
    const flick = 0.7 + (Math.sin(performance.now() / 60) + 1) * 0.15;
    ctx.fillStyle = "rgba(255,170,60,0.95)";
    ctx.beginPath();
    ctx.moveTo(-size * 0.65, 0);
    ctx.quadraticCurveTo(-size * (1.0 * flick), size * 0.18, -size * 0.9, 0);
    ctx.quadraticCurveTo(-size * (1.0 * flick), -size * 0.18, -size * 0.65, 0);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "rgba(255,80,80,0.7)";
    ctx.beginPath();
    ctx.moveTo(-size * 0.62, 0);
    ctx.quadraticCurveTo(-size * (0.88 * flick), size * 0.12, -size * 0.78, 0);
    ctx.quadraticCurveTo(-size * (0.88 * flick), -size * 0.12, -size * 0.62, 0);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawCurve(points) {
  if (points.length < 2) return;

  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,90,90,0.85)";
  ctx.shadowColor = "rgba(255,90,90,0.35)";
  ctx.shadowBlur = 12;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

// -------- Mapping: time & multiplier -> canvas coords ----------
function getCurvePoints(w, h, pad) {
  // We want a nice curve like Stake: grows faster over time
  // We'll map t (seconds) horizontally and multiplier vertically with log-ish scale.

  const usableW = w - pad * 2;
  const usableH = h - pad * 2;

  // pick a "view" range based on current phase
  let tMax = 10;
  if (game.phase === PHASE.WAIT) tMax = 10;
  if (game.phase === PHASE.FLY) tMax = Math.max(6, Math.min(14, game.t + 2.5));
  if (game.phase === PHASE.CRASH) tMax = Math.max(6, Math.min(14, game.t + 2.5));

  // y scale: from 1.0 to maybe up to current*1.2
  const mMax = Math.max(2.5, Math.min(30, Math.max(game.mult, game.crashPoint) * 1.15));

  const points = [];
  const steps = 80;

  for (let i = 0; i <= steps; i++) {
    const tt = (i / steps) * Math.max(0.0001, game.t);
    const mm = multAtTime(tt);

    const x = pad + (tt / tMax) * usableW;

    // log mapping to compress highs
    const yNorm = Math.log(mm) / Math.log(mMax);
    const y = pad + (1 - yNorm) * usableH;

    points.push({ x, y, tt, mm });
  }
  return { points, tMax, mMax };
}

// multiplier curve function (same for drawing and logic)
function multAtTime(t) {
  // smooth curve
  // start at 1.00, grow gradually then faster
  return 1 + t * 0.55 + t * t * 0.085;
}

// -------- Main draw ----------
function render() {
  resizeCanvasToCSS();
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  ctx.clearRect(0, 0, w, h);

  // bg winter
  drawWinterBackground(w, h);

  // grid
  const pad = 22;
  drawGrid(w, h, pad);

  // curve + rocket position
  const { points } = getCurvePoints(w, h, pad);

  // curve line
  drawCurve(points);

  // rocket at end of curve (if in fly or crash show last point)
  if (game.phase === PHASE.FLY || game.phase === PHASE.CRASH) {
    const p = points[points.length - 1];
    // angle from last segment
    let ang = -0.8;
    if (points.length > 2) {
      const a = points[points.length - 2];
      ang = Math.atan2(p.y - a.y, p.x - a.x);
    }
    rocketDraw(p.x, p.y, 20, ang);
  }

  // overlay text
  if (game.phase === PHASE.WAIT) {
    setCenter("Ожидание…", `Следующий раунд через ${Math.ceil(game.waitLeft)}с`);
  } else if (game.phase === PHASE.FLY) {
    setCenter(`${game.mult.toFixed(2)}x`, game.inRound ? (game.cashed ? "Ты забрал" : "Ты в раунде") : "Ты не в раунде");
  } else {
    setCenter(`${game.mult.toFixed(2)}x`, "Краш! Ракета улетела 🚀");
  }

  updateTopUI();
}

// -------- Round flow ----------
let lastTs = performance.now();
let loopId = null;

function startLoop() {
  if (loopId) return;
  lastTs = performance.now();
  const tick = (ts) => {
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    step(dt);
    render();

    loopId = requestAnimationFrame(tick);
  };
  loopId = requestAnimationFrame(tick);
}

function stopLoop() {
  if (!loopId) return;
  cancelAnimationFrame(loopId);
  loopId = null;
}

function newRound() {
  game.phase = PHASE.WAIT;
  game.waitLeft = 5;
  game.t = 0;
  game.mult = 1.0;
  game.crashPoint = fairCrashPoint();

  // important: reset player for NEW round (but keep wallet)
  resetPlayerRoundFlags();

  logLine("Новый раунд: ожидание");
  beep(520, 0.05, "triangle", 0.03);
}

function startFlight() {
  game.phase = PHASE.FLY;
  game.t = 0;
  game.mult = 1.0;
  // crashPoint already chosen in newRound()
  logLine("Старт полёта");
  beep(740, 0.05, "triangle", 0.03);
  beep(980, 0.05, "triangle", 0.025);
}

function crashNow() {
  game.phase = PHASE.CRASH;

  // if player is in round and didn't cash -> lost
  if (game.inRound && !game.cashed) {
    logLine(`Краш на x${game.mult.toFixed(2)} — ставка сгорела (${game.bet} 🪙)`);
    beep(220, 0.12, "sawtooth", 0.05);
    beep(160, 0.14, "sawtooth", 0.05);
  } else {
    logLine(`Краш на x${game.mult.toFixed(2)}`);
    beep(240, 0.10, "square", 0.03);
  }

  // after crash go to wait again
  setTimeout(() => {
    newRound();
  }, 1400);
}

function step(dt) {
  if (game.phase === PHASE.WAIT) {
    game.waitLeft -= dt;
    game.mult = 1.0;

    if (game.waitLeft <= 0) {
      startFlight();
    }
    return;
  }

  if (game.phase === PHASE.FLY) {
    game.t += dt;
    game.mult = multAtTime(game.t);

    // little "engine" tick sound (very subtle)
    if (soundOn) {
      const p = Math.sin(performance.now() / 120);
      if (p > 0.98) beep(520 + game.mult * 8, 0.02, "sine", 0.01);
    }

    if (game.mult >= game.crashPoint) {
      // clamp to crashPoint for nicer UI
      game.mult = game.crashPoint;
      crashNow();
    }
    return;
  }

  // CRASH phase: nothing, waiting for timeout to call newRound
}

// -------- Actions ----------
joinBtn.addEventListener("click", () => {
  if (game.phase !== PHASE.WAIT) return;

  const bet = clampBet();
  if (bet <= 0) return;

  if (bet > wallet.coins) {
    betHint.textContent = "Недостаточно монет.";
    beep(180, 0.08, "square", 0.04);
    return;
  }

  // place bet
  addCoins(-bet);
  game.inRound = true;
  game.bet = bet;
  game.cashed = false;

  betHint.textContent = "В полёте нажми “Забрать”.";
  logLine(`Вошёл в раунд: ставка ${bet} 🪙`);
  beep(620, 0.06, "triangle", 0.03);
});

cashBtn.addEventListener("click", () => {
  if (game.phase !== PHASE.FLY) return;
  if (!game.inRound || game.cashed) return;

  game.cashed = true;

  const payout = Math.floor(game.bet * game.mult);
  addCoins(payout);

  logLine(`Забрал на x${game.mult.toFixed(2)}: +${payout} 🪙`);
  beep(880, 0.06, "triangle", 0.03);
  beep(1120, 0.06, "triangle", 0.025);
});

// -------- Init ----------
function init() {
  // protect if canvas missing
  if (!canvas || !ctx) {
    alert("Canvas не найден. Проверь index.html (id='chart').");
    return;
  }

  clampBet();
  newRound();
  startLoop();
  render();
}

window.addEventListener("resize", () => {
  render();
});

// Start
init();
