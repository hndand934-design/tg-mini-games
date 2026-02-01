/* =========================
   Rocket Crash (Crash-only)
   v3 — stable for GitHub Pages
   - Auto rounds: WAIT -> FLY -> CRASH -> WAIT
   - Rocket is DOM overlay: ALWAYS inside chart box
   - No logs/history
   - Sound: ONLY launch + crash (pleasant WebAudio)
   ========================= */

/* ---------- RNG (crypto) ---------- */
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function rollCrashPoint() {
  const u = randFloat();
  const v = 0.99 / (1 - u);          // heavy tail
  const cp = Math.floor(v * 100) / 100;
  return Math.max(1.01, Math.min(cp, 500));
}

/* ---------- Telegram WebApp ---------- */
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

/* ---------- DOM ---------- */
const elBal = document.getElementById("balanceCoins");
const elMultTop = document.getElementById("multTop");
const elMultHint = document.getElementById("multHint");
const elStatusTop = document.getElementById("statusTop");
const elStatusHint = document.getElementById("statusHint");
const elMyBetTop = document.getElementById("myBetTop");
const elMyBetHint = document.getElementById("myBetHint");
const elMultCenter = document.getElementById("multCenter");
const elCenterSub = document.getElementById("centerSub");

const chartBox = document.getElementById("chartBox");
const canvas = document.getElementById("chart");
const ctx = canvas.getContext("2d");

const rocketEl = document.getElementById("rocket");
const soundBtn = document.getElementById("soundBtn");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");
const joinBtn = document.getElementById("joinBtn");
const cashBtn = document.getElementById("cashBtn");
const bonusBtn = document.getElementById("bonusBtn");
const rightHint = document.getElementById("rightHint");

/* ---------- User label (optional) ---------- */
(function setSubtitle(){
  const sub = document.querySelector(".subtitle");
  const user = tg?.initDataUnsafe?.user;
  if (sub) sub.textContent = user ? `Привет, ${user.first_name}` : "Открыто вне Telegram";
})();

/* ---------- Wallet ---------- */
const WALLET_KEY = "rocket_wallet_v3";
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
function renderBalance() {
  elBal.textContent = String(wallet.coins);
}
renderBalance();

/* ---------- Bet helpers ---------- */
function clampBetValue(v) {
  v = Math.floor(Number(v) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  return v;
}
function setBet(v) {
  betInput.value = String(clampBetValue(v));
}
setBet(betInput.value);

document.querySelectorAll(".chip[data-bet]").forEach((b) => {
  b.addEventListener("click", () => {
    const val = b.dataset.bet;
    if (val === "max") setBet(wallet.coins);
    else setBet(Number(val));
  });
});
betMinus.onclick = () => setBet(Number(betInput.value) - 10);
betPlus.onclick = () => setBet(Number(betInput.value) + 10);
betInput.oninput = () => setBet(betInput.value);

bonusBtn.onclick = () => addCoins(1000);

/* ---------- Audio (ONLY launch + crash) ---------- */
let audioOn = false;
let actx = null;

function ensureAudio() {
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (actx.state === "suspended") actx.resume();
}
function beep({ type="sine", f0=440, f1=440, t=0.12, gain=0.18, startAt=0 } = {}) {
  if (!audioOn) return;
  ensureAudio();

  const now = actx.currentTime + startAt;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, now);
  o.frequency.linearRampToValueAtTime(f1, now + t);

  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, now + t);

  o.connect(g).connect(actx.destination);
  o.start(now);
  o.stop(now + t + 0.02);
}
function noiseHit({ t=0.22, gain=0.25, startAt=0 } = {}) {
  if (!audioOn) return;
  ensureAudio();

  const now = actx.currentTime + startAt;
  const bufferSize = Math.floor(actx.sampleRate * t);
  const buffer = actx.createBuffer(1, bufferSize, actx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    // soft burst noise
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const src = actx.createBufferSource();
  src.buffer = buffer;

  const g = actx.createGain();
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + t);

  // lowpass
  const lp = actx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(900, now);

  src.connect(lp).connect(g).connect(actx.destination);
  src.start(now);
}
function playLaunch() {
  // small “whoosh + rise” (pleasant)
  beep({ type:"sine", f0:240, f1:420, t:0.18, gain:0.14 });
  beep({ type:"triangle", f0:520, f1:860, t:0.16, gain:0.09, startAt:0.03 });
}
function playCrash() {
  // punch + falling tone + soft noise
  beep({ type:"square", f0:220, f1:90, t:0.18, gain:0.12 });
  beep({ type:"sawtooth", f0:680, f1:160, t:0.22, gain:0.08, startAt:0.02 });
  noiseHit({ t:0.22, gain:0.20, startAt:0.00 });
}

soundBtn.onclick = () => {
  audioOn = !audioOn;
  soundBtn.textContent = audioOn ? "Звук: on" : "Звук: off";
  if (audioOn) ensureAudio();
};

/* ---------- Canvas sizing ---------- */
function resizeCanvas() {
  const r = chartBox.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(r.width * dpr);
  canvas.height = Math.floor(r.height * dpr);
  canvas.style.width = r.width + "px";
  canvas.style.height = r.height + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
}
window.addEventListener("resize", () => {
  resizeCanvas();
  draw(); // redraw
});
resizeCanvas();

/* ---------- Game state ---------- */
const STATE = {
  phase: "WAIT",   // WAIT | FLY | CRASH
  waitLeft: 3.0,
  mult: 1.0,
  t: 0,
  crashPoint: rollCrashPoint(),
  joined: false,
  bet: 0,
  cashed: false,
  lastCashMult: 1.0,
  raf: null,
  lastTs: 0,
};
const SETTINGS = {
  waitSeconds: 3,
  // growth: mult = 1 + a*t + b*t^2 (t in seconds)
  a: 0.85,
  b: 0.14,
  // chart margins
  padL: 26,
  padR: 14,
  padT: 14,
  padB: 18,
};

/* ---------- UI helpers ---------- */
function setRightHint(text) {
  rightHint.textContent = text || "";
}
function setButtons() {
  if (STATE.phase === "WAIT") {
    joinBtn.disabled = false;
    joinBtn.textContent = STATE.joined ? "В раунде (ждёшь)" : "Войти в раунд";
    cashBtn.disabled = true;
  } else if (STATE.phase === "FLY") {
    joinBtn.disabled = true;
    joinBtn.textContent = "Вход закрыт";
    cashBtn.disabled = !STATE.joined || STATE.cashed;
  } else {
    joinBtn.disabled = true;
    joinBtn.textContent = "Новый раунд скоро";
    cashBtn.disabled = true;
  }
}

function setTopBar() {
  elMultTop.textContent = `x${STATE.mult.toFixed(2)}`;
  elMultCenter.textContent = `${STATE.mult.toFixed(2)}x`;

  if (STATE.phase === "WAIT") {
    elStatusTop.textContent = "Ожидание";
    elStatusHint.textContent = `Старт через ${Math.ceil(STATE.waitLeft)}с`;
    elMultHint.textContent = "Новый раунд скоро";
    elCenterSub.textContent = `Ожидание следующего раунда (${Math.ceil(STATE.waitLeft)}с)`;
  } else if (STATE.phase === "FLY") {
    elStatusTop.textContent = "Полёт";
    elStatusHint.textContent = STATE.joined && !STATE.cashed ? "Можно забрать" : "Ты не в раунде";
    elMultHint.textContent = "Ракета летит...";
    elCenterSub.textContent = STATE.joined ? (STATE.cashed ? "Ты забрал" : "Нажми “Забрать”") : "Ты не в раунде";
  } else {
    elStatusTop.textContent = "Краш";
    elStatusHint.textContent = "Ракета улетела";
    elMultHint.textContent = `Краш на x${STATE.mult.toFixed(2)}`;
    elCenterSub.textContent = `Краш! Новый раунд через ${Math.ceil(STATE.waitLeft)}с`;
  }

  if (STATE.joined) {
    elMyBetTop.textContent = `${STATE.bet} 🪙`;
    if (STATE.cashed) {
      const profit = Math.floor(STATE.bet * STATE.lastCashMult) - STATE.bet;
      elMyBetHint.textContent = `забрал +${profit} 🪙`;
    } else {
      elMyBetHint.textContent = (STATE.phase === "WAIT") ? "в раунде" : "в полёте";
    }
  } else {
    elMyBetTop.textContent = "—";
    elMyBetHint.textContent = "не в раунде";
  }
}

/* ---------- Join / Cash ---------- */
joinBtn.onclick = () => {
  if (STATE.phase !== "WAIT") return;

  const bet = clampBetValue(betInput.value);
  if (bet <= 0) return;

  if (bet > wallet.coins) {
    setRightHint("Недостаточно монет.");
    return;
  }

  STATE.joined = true;
  STATE.cashed = false;
  STATE.bet = bet;
  addCoins(-bet);

  setRightHint("Ты в раунде. Жди старт.");
  setButtons();
  setTopBar();
};

cashBtn.onclick = () => {
  if (STATE.phase !== "FLY") return;
  if (!STATE.joined || STATE.cashed) return;

  STATE.cashed = true;
  STATE.lastCashMult = STATE.mult;

  const payout = Math.floor(STATE.bet * STATE.mult);
  addCoins(payout);

  const profit = payout - STATE.bet;
  setRightHint(`✅ Забрал: +${profit} 🪙 (x${STATE.mult.toFixed(2)})`);

  setButtons();
  setTopBar();
};

/* ---------- Chart math ---------- */
function getChartRect() {
  const w = chartBox.clientWidth;
  const h = chartBox.clientHeight;
  return {
    x: SETTINGS.padL,
    y: SETTINGS.padT,
    w: Math.max(10, w - SETTINGS.padL - SETTINGS.padR),
    h: Math.max(10, h - SETTINGS.padT - SETTINGS.padB),
  };
}

// scale so rocket ALWAYS stays inside box
function multToY(mult, maxMultVisible) {
  const r = getChartRect();
  const m = Math.min(mult, maxMultVisible);
  const t = (m - 1) / (maxMultVisible - 1); // 0..1
  // y grows upward: invert
  return r.y + r.h * (1 - t);
}
function timeToX(t, maxT) {
  const r = getChartRect();
  const tt = Math.min(Math.max(t / maxT, 0), 1);
  return r.x + r.w * tt;
}

// choose dynamic visible max so rocket never leaves area
function computeVisibleMax() {
  // slightly above current to give headroom
  const m = STATE.mult;
  const base = 2.5;
  const vis = Math.max(base, m * 1.15);
  // limit to keep readable (but still inside)
  return Math.min(vis, 200);
}

/* ---------- Draw ---------- */
function drawGrid() {
  const w = chartBox.clientWidth;
  const h = chartBox.clientHeight;

  ctx.clearRect(0, 0, w, h);

  const r = getChartRect();

  // background vignette
  const g = ctx.createRadialGradient(w*0.25, h*0.8, 40, w*0.25, h*0.8, Math.max(w,h));
  g.addColorStop(0, "rgba(76,125,255,.12)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // grid
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.lineWidth = 1;

  const cols = 8;
  const rows = 5;
  for (let i = 0; i <= cols; i++) {
    const x = r.x + (r.w * i) / cols;
    ctx.beginPath();
    ctx.moveTo(x, r.y);
    ctx.lineTo(x, r.y + r.h);
    ctx.stroke();
  }
  for (let j = 0; j <= rows; j++) {
    const y = r.y + (r.h * j) / rows;
    ctx.beginPath();
    ctx.moveTo(r.x, y);
    ctx.lineTo(r.x + r.w, y);
    ctx.stroke();
  }

  // border
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.strokeRect(r.x, r.y, r.w, r.h);
}

function drawCurve(maxT, maxMultVisible) {
  const r = getChartRect();

  // path function: mult = 1 + a*t + b*t^2
  const a = SETTINGS.a;
  const b = SETTINGS.b;

  const points = [];
  const steps = 140;
  for (let i = 0; i <= steps; i++) {
    const t = (maxT * i) / steps;
    const mult = 1 + a * t + b * t * t;
    const x = timeToX(t, maxT);
    const y = multToY(mult, maxMultVisible);
    points.push({ x, y });
  }

  // glow
  ctx.save();
  ctx.shadowColor = "rgba(255,95,109,.55)";
  ctx.shadowBlur = 14;
  ctx.strokeStyle = "#ff5f6d";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
  ctx.restore();

  // fill under curve subtle
  ctx.save();
  ctx.fillStyle = "rgba(255,95,109,.10)";
  ctx.beginPath();
  ctx.moveTo(points[0].x, r.y + r.h);
  for (let i = 0; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.lineTo(points[points.length - 1].x, r.y + r.h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function placeRocket(maxT, maxMultVisible) {
  // show rocket only while flying OR waiting with position at start
  const show = (STATE.phase === "FLY" || STATE.phase === "WAIT");
  rocketEl.classList.toggle("hidden", !show);

  if (!show) return;

  // rocket flame only during fly
  rocketEl.classList.toggle("on", STATE.phase === "FLY");

  // position based on current t/mult, but clamp inside chart
  const r = getChartRect();

  let t = STATE.t;
  if (STATE.phase === "WAIT") t = 0;

  const x = timeToX(t, maxT);
  const y = multToY(STATE.mult, maxMultVisible);

  // compute slope angle to rotate along trajectory
  // derivative: d(mult)/dt = a + 2*b*t
  const a = SETTINGS.a;
  const b = SETTINGS.b;
  const dmdt = a + 2 * b * t;

  // convert slope to angle in pixels:
  // dx/dt = r.w/maxT, dy/dm = -r.h/(maxMultVisible-1)
  const dxdt = r.w / maxT;
  const dydm = -r.h / (maxMultVisible - 1);
  const dydt = dydm * dmdt;

  const angleRad = Math.atan2(dydt, dxdt);
  const angleDeg = angleRad * 180 / Math.PI;

  // clamp to chart box bounds (keep rocket fully inside)
  const pad = 12;
  const cx = Math.min(r.x + r.w - pad, Math.max(r.x + pad, x));
  const cy = Math.min(r.y + r.h - pad, Math.max(r.y + pad, y));

  rocketEl.style.left = cx + "px";
  rocketEl.style.top = cy + "px";
  rocketEl.style.transform = `translate(-50%,-50%) rotate(${angleDeg}deg)`;
}

function draw() {
  drawGrid();

  const maxMultVisible = computeVisibleMax();

  // choose maxT so curve fills box nicely and rocket never leaves
  // we map current mult to t: solve 1 + a t + b t^2 = mult
  // b t^2 + a t + (1 - mult) = 0
  const a = SETTINGS.a;
  const b = SETTINGS.b;
  function multToT(m) {
    const c = 1 - m;
    const D = a*a - 4*b*c;
    if (D <= 0) return 0;
    return (-a + Math.sqrt(D)) / (2*b);
  }

  const tNow = (STATE.phase === "WAIT") ? 0 : multToT(STATE.mult);
  const maxT = Math.max(2.0, tNow * 1.35); // headroom

  drawCurve(maxT, maxMultVisible);
  placeRocket(maxT, maxMultVisible);
}

/* ---------- Round flow ---------- */
function resetToWait() {
  STATE.phase = "WAIT";
  STATE.waitLeft = SETTINGS.waitSeconds;
  STATE.t = 0;
  STATE.mult = 1.0;

  STATE.crashPoint = rollCrashPoint();

  // reset participation each round
  STATE.joined = false;
  STATE.bet = 0;
  STATE.cashed = false;
  STATE.lastCashMult = 1.0;

  setRightHint("Вход в раунд доступен до старта.");
  setButtons();
  setTopBar();
  draw();
}

function startFly() {
  STATE.phase = "FLY";
  STATE.t = 0;
  STATE.mult = 1.0;
  setRightHint(STATE.joined ? "Полёт начался. Можно “Забрать”." : "Полёт начался. Ты не в раунде.");
  setButtons();
  setTopBar();
  playLaunch();
}

function crashNow() {
  STATE.phase = "CRASH";
  // if user did not cash and was in round => lost bet
  if (STATE.joined && !STATE.cashed) {
    setRightHint(`💥 Краш! Ставка ${STATE.bet} 🪙 сгорела`);
  } else {
    setRightHint("💥 Краш! Новый раунд скоро.");
  }
  setButtons();
  setTopBar();
  playCrash();
}

/* ---------- Animation loop ---------- */
function tick(ts) {
  if (!STATE.lastTs) STATE.lastTs = ts;
  const dt = Math.min(0.05, (ts - STATE.lastTs) / 1000);
  STATE.lastTs = ts;

  if (STATE.phase === "WAIT") {
    STATE.waitLeft -= dt;
    if (STATE.waitLeft <= 0) {
      startFly();
    }
  } else if (STATE.phase === "FLY") {
    STATE.t += dt;
    // curve: mult = 1 + a t + b t^2
    STATE.mult = 1 + SETTINGS.a * STATE.t + SETTINGS.b * STATE.t * STATE.t;

    if (STATE.mult >= STATE.crashPoint) {
      STATE.mult = STATE.crashPoint;
      crashNow();
      // immediately go to WAIT countdown after crash
      STATE.phase = "CRASH";
      STATE.waitLeft = SETTINGS.waitSeconds;
    }

  } else if (STATE.phase === "CRASH") {
    STATE.waitLeft -= dt;
    if (STATE.waitLeft <= 0) {
      resetToWait();
    }
  }

  setButtons();
  setTopBar();
  draw();

  STATE.raf = requestAnimationFrame(tick);
}

/* ---------- Init ---------- */
resetToWait();
STATE.lastTs = 0;
STATE.raf = requestAnimationFrame(tick);
