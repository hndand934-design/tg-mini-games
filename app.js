// ===============================
// Rocket Crash — ONLY Crash mode
// webapp/app.js
// ===============================

// --- RNG (честный) ---
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

// heavy-tail crash point (demo fair RNG). later можем сделать provably-fair seed/hash
function genCrashPoint() {
  const r = randFloat();
  const cp = 1 / (1 - r);
  return Math.min(Math.max(1.05, cp), 60);
}

// --- Telegram WebApp init ---
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// --- Wallet (virtual coins, local) ---
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
  renderTop();
}
function addCoins(d) {
  setCoins(wallet.coins + d);
}

// --- DOM ---
const elCoins = document.getElementById("coins");
const elTgStatus = document.getElementById("tgStatus");
const elMultText = document.getElementById("multText");
const elPhaseHint = document.getElementById("phaseHint");
const elRoundText = document.getElementById("roundText");
const elMyBetText = document.getElementById("myBetText");
const elMyStateText = document.getElementById("myStateText");

const betInput = document.getElementById("betInput");
const joinBtn = document.getElementById("joinBtn");
const cashBtn = document.getElementById("cashBtn");
const bonusBtn = document.getElementById("bonusBtn");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");
const soundBtn = document.getElementById("soundBtn");

const overlayMsg = document.getElementById("overlayMsg");

const canvas = document.getElementById("chart");
const ctx = canvas.getContext("2d");
const rocketEl = document.getElementById("rocket");
const chartBox = document.getElementById("chartBox");

// --- UI Top ---
function renderTop() {
  elCoins.textContent = String(wallet.coins);
  const user = tg?.initDataUnsafe?.user;
  elTgStatus.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
}
renderTop();

// --- Responsive canvas (retina) ---
function resizeCanvas() {
  const rect = chartBox.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", () => {
  resizeCanvas();
  drawChart(); // перерисовать при ресайзе
});
resizeCanvas();

// --- Sound (optional) ---
let soundOn = false;
let audioCtx = null;
function beep(freq = 440, dur = 0.06, vol = 0.05) {
  if (!soundOn) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  } catch {}
}
soundBtn.onclick = () => {
  soundOn = !soundOn;
  soundBtn.textContent = `Звук: ${soundOn ? "on" : "off"}`;
  beep(660, 0.05, 0.05);
};

// --- Bet controls ---
function clampBet() {
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  return v;
}
betInput.addEventListener("input", clampBet);

document.querySelectorAll(".chip").forEach((b) => {
  b.onclick = () => {
    const v = b.dataset.bet;
    if (v === "max") betInput.value = String(wallet.coins);
    else betInput.value = String(v);
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

bonusBtn.onclick = () => addCoins(1000);

// --- Overlay helpers ---
function showOverlay(text) {
  overlayMsg.textContent = text;
  overlayMsg.style.display = "block";
}
function hideOverlay() {
  overlayMsg.style.display = "none";
}
function setRocketVisible(v) {
  rocketEl.style.opacity = v ? "1" : "0";
}
function moveRocket(px, py, rotDeg) {
  rocketEl.style.transform = `translate(${px}px, ${py}px) rotate(${rotDeg}deg)`;
}

// --- Curve mapping for 2D flight ---
function curveXY(p, w, h) {
  // p: 0..1 along curve
  const x0 = 60;
  const y0 = h - 140;
  const x1 = w - 90;
  const y1 = 95;

  const t = Math.min(1, Math.max(0, p));
  const e = 1 - Math.pow(1 - t, 2.2);

  const x = x0 + (x1 - x0) * e;
  const y = y0 - (y0 - y1) * Math.pow(e, 1.65);

  // derivative
  const dt = 0.002;
  const t2 = Math.min(1, t + dt);
  const e2 = 1 - Math.pow(1 - t2, 2.2);
  const x2 = x0 + (x1 - x0) * e2;
  const y2 = y0 - (y0 - y1) * Math.pow(e2, 1.65);
  const ang = Math.atan2(y2 - y, x2 - x) * 180 / Math.PI;

  return { x, y, ang };
}

// --- Game state ---
const PHASE = {
  BETTING: "BETTING",
  FLYING: "FLYING",
  CRASHED: "CRASHED",
};

let phase = PHASE.BETTING;
let countdown = 5;          // sec
let lastTs = performance.now();

let crashPoint = genCrashPoint();
let startAt = 0;
let mult = 1.0;

let inRound = false;
let myBet = 0;
let cashed = false;
let myCashMult = 0;

let raf = null;

// --- UI render ---
function renderRightButtons() {
  // join доступен только в ожидании и если ещё не в раунде
  joinBtn.disabled = !(phase === PHASE.BETTING && !inRound);

  // cash доступен только в полёте и если в раунде и не забрал
  cashBtn.disabled = !(phase === PHASE.FLYING && inRound && !cashed);

  // input ставки редактируем только в ожидании
  betInput.disabled = !(phase === PHASE.BETTING && !inRound);
  betMinus.disabled = betInput.disabled;
  betPlus.disabled = betInput.disabled;
}

function renderHeaderTexts() {
  elMultText.textContent = `x${mult.toFixed(2)}`;

  if (phase === PHASE.BETTING) {
    elPhaseHint.textContent = "Ожидание — старт скоро";
    elRoundText.textContent = `Старт через ${countdown}s`;
  } else if (phase === PHASE.FLYING) {
    elPhaseHint.textContent = "Полёт — можно забрать";
    elRoundText.textContent = "Раунд идёт";
  } else {
    elPhaseHint.textContent = "Краш — новый раунд скоро";
    elRoundText.textContent = `Старт через ${countdown}s`;
  }

  if (!inRound) {
    elMyBetText.textContent = "—";
    elMyStateText.textContent = "не в раунде";
  } else {
    elMyBetText.textContent = `${myBet} 🪙`;
    if (cashed) elMyStateText.textContent = `забрал на x${myCashMult.toFixed(2)}`;
    else if (phase === PHASE.FLYING) elMyStateText.textContent = "в раунде";
    else if (phase === PHASE.BETTING) elMyStateText.textContent = "ждём старт";
    else elMyStateText.textContent = "не успел";
  }
}

function renderAll() {
  renderTop();
  renderRightButtons();
  renderHeaderTexts();
}

// --- Mult growth curve (feel) ---
function calcMult(t) {
  // t seconds since start
  // чуть “ускоряющийся” рост как в crash
  return 1 + t * 0.75 + t * t * 0.12;
}

// --- Main drawing ---
function drawChart() {
  const rect = chartBox.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  // grid
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;

  const step = 52;
  for (let x = 0; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();

  // progress along curve: p = log(mult)/log(crashPoint)
  const cp = Math.max(1.05, crashPoint);
  let p = 0;
  if (phase === PHASE.FLYING || phase === PHASE.CRASHED) {
    p = Math.min(1, Math.log(mult) / Math.log(cp));
    if (!Number.isFinite(p)) p = 0;
    p = Math.max(0, Math.min(1, p));
  }

  const start = curveXY(0, w, h);
  const cur = curveXY(Math.max(0.02, p), w, h);

  // draw curve up to current
  ctx.save();
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);

  const samples = 180;
  const steps = Math.max(2, Math.floor(samples * Math.max(0.02, p)));
  for (let i = 1; i <= steps; i++) {
    const t = i / samples;
    if (t > p) break;
    const pt = curveXY(t, w, h);
    ctx.lineTo(pt.x, pt.y);
  }
  ctx.stroke();
  ctx.restore();

  // red fill under curve while flying
  if (phase === PHASE.FLYING) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "rgba(255,40,40,0.55)";
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);

    const samples2 = 140;
    const steps2 = Math.max(2, Math.floor(samples2 * Math.max(0.02, p)));
    for (let i = 1; i <= steps2; i++) {
      const t = i / samples2;
      if (t > p) break;
      const pt = curveXY(t, w, h);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.lineTo(cur.x, h);
    ctx.lineTo(start.x, h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // rocket position rules:
  // - BETTING: rocket hidden
  // - FLYING: rocket follows curve
  // - CRASHED: rocket hidden (улетела/пропала)
  if (phase === PHASE.FLYING) {
    setRocketVisible(true);
    // convert curve point to rocket element position
    // rocketEl positioned relative to chartBox
    const rx = cur.x - 27;
    const ry = cur.y - 27;
    moveRocket(rx, ry, cur.ang + 12);
  } else {
    setRocketVisible(false);
    moveRocket(-9999, -9999, 0);
  }

  // Big center multiplier text (like crash)
  ctx.save();
  const big = phase === PHASE.FLYING ? `x${mult.toFixed(2)}` : (phase === PHASE.BETTING ? "Ожидание" : `x${mult.toFixed(2)}`);
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 72px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillText(big, w * 0.5, h * 0.48);
  ctx.restore();
}

// --- Round transitions ---
function resetForBetting() {
  phase = PHASE.BETTING;
  countdown = 5;
  mult = 1.0;
  crashPoint = genCrashPoint();

  inRound = false;
  myBet = 0;
  cashed = false;
  myCashMult = 0;

  hideOverlay();
  renderAll();
  drawChart();
}

function startFlying() {
  phase = PHASE.FLYING;
  startAt = performance.now();
  mult = 1.0;
  hideOverlay();

  renderAll();
  drawChart();
  beep(740, 0.05, 0.05);
}

function crashNow() {
  phase = PHASE.CRASHED;

  // если игрок был в раунде и не забрал — проиграл
  if (inRound && !cashed) {
    showOverlay("💥 Краш! Ты не успел — ставка сгорела");
    beep(220, 0.12, 0.06);
  } else {
    showOverlay("🚀 Ракета улетела. Новый раунд скоро…");
    beep(330, 0.08, 0.04);
  }

  // rocket must disappear
  setRocketVisible(false);

  countdown = 5;
  renderAll();
  drawChart();
}

// --- Actions: join & cash ---
joinBtn.onclick = () => {
  if (!(phase === PHASE.BETTING && !inRound)) return;
  const bet = clampBet();
  if (bet <= 0) return;

  if (bet > wallet.coins) {
    alert("Недостаточно монет");
    return;
  }

  addCoins(-bet);
  inRound = true;
  myBet = bet;
  cashed = false;
  myCashMult = 0;

  showOverlay(`✅ Вошёл в раунд: ставка ${bet} 🪙`);
  setTimeout(() => {
    if (phase === PHASE.BETTING) hideOverlay();
  }, 900);

  renderAll();
};

cashBtn.onclick = () => {
  if (!(phase === PHASE.FLYING && inRound && !cashed)) return;

  cashed = true;
  myCashMult = mult;

  const payout = Math.floor(myBet * myCashMult);
  addCoins(payout);

  showOverlay(`✅ Забрал: +${payout} 🪙 (x${myCashMult.toFixed(2)})`);
  beep(980, 0.06, 0.05);
  setTimeout(() => {
    if (phase === PHASE.FLYING) hideOverlay();
  }, 900);

  renderAll();
};

// --- Main loop ---
function tick(ts) {
  const dt = (ts - lastTs) / 1000;
  lastTs = ts;

  if (phase === PHASE.BETTING) {
    // countdown
    countdown -= dt;
    if (countdown <= 0) {
      startFlying();
    }
  } else if (phase === PHASE.FLYING) {
    const t = (ts - startAt) / 1000;
    mult = calcMult(t);

    // crash condition
    if (mult >= crashPoint) {
      mult = crashPoint;
      crashNow();
    } else {
      // small tick beep each ~0.25 sec if sound on
      if (soundOn) {
        // simple: beep rarely based on mult fractional
        if (Math.floor(mult * 4) !== Math.floor((mult - dt) * 4)) beep(520, 0.02, 0.02);
      }
    }
  } else if (phase === PHASE.CRASHED) {
    countdown -= dt;
    if (countdown <= 0) {
      resetForBetting();
    }
  }

  renderAll();
  drawChart();

  raf = requestAnimationFrame(tick);
}

function startLoop() {
  if (raf) cancelAnimationFrame(raf);
  lastTs = performance.now();
  raf = requestAnimationFrame(tick);
}

// init
resetForBetting();
startLoop();
