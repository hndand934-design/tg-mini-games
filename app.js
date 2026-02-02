/* =========================
   Rocket Crash — app.js
   v6 (only Crash)
   Auto rounds + graph (no rocket)
   ========================= */

// ---- RNG (fair-ish demo) ----
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function fmt2(x) { return (Math.round(x * 100) / 100).toFixed(2); }

// ---- Telegram WebApp (optional) ----
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// ---- Wallet (local) ----
const WALLET_KEY = "rocket_wallet_v6";
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
  renderBalance();
}
function addCoins(d) { setCoins(wallet.coins + d); }

// ---- DOM helpers ----
const $ = (id) => document.getElementById(id);
const el = {
  // top / header
  balanceValue: $("balanceValue") || $("balance") || null,

  // stats
  multValue: $("multValue") || $("statMult") || $("mult") || null,
  multHint: $("multHint") || null,
  statusValue: $("statusValue") || $("statStatus") || $("status") || null,
  statusHint: $("statusHint") || null,
  betStatValue: $("betStatValue") || $("statBet") || $("yourBet") || null,
  betStatHint: $("betStatHint") || null,

  // center overlay
  centerTitle: $("centerTitle") || $("centerMult") || null,
  centerSub: $("centerSub") || $("centerText") || null,

  // canvas
  canvas: $("chart") || $("canvas") || null,

  // controls
  betInput: $("betInput") || $("bet") || null,
  joinBtn: $("joinBtn") || $("enterBtn") || $("btnJoin") || null,
  cashBtn: $("cashBtn") || $("btnCash") || null,
  bonusBtn: $("bonusBtn") || null,
  soundBtn: $("soundBtn") || null,
};

// If some elements are missing — fail loudly (so you can fix index)
function assertDom() {
  const required = ["canvas", "betInput", "joinBtn", "cashBtn"];
  const missing = required.filter((k) => !el[k]);
  if (missing.length) {
    console.error("Missing DOM ids:", missing);
  }
}
assertDom();

// ---- Render UI bits ----
function renderBalance() {
  if (!el.balanceValue) return;
  // show "🪙 1000" or just number depending on your html
  el.balanceValue.textContent = `🪙 ${wallet.coins}`;
}
renderBalance();

function setStatText(node, text) { if (node) node.textContent = text; }

function setCenter(mult, sub) {
  if (el.centerTitle) el.centerTitle.textContent = `${fmt2(mult)}x`;
  if (el.centerSub) el.centerSub.textContent = sub || "";
}

// ---- Sound (only start + crash) ----
let soundOn = true;
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}
function playWhoosh() {
  if (!soundOn) return;
  ensureAudio();
  const ctx = audioCtx;

  const now = ctx.currentTime;

  // noise burst
  const bufferSize = Math.floor(ctx.sampleRate * 0.25);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(300, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);

  // short “engine” tone
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, now);
  og.gain.exponentialRampToValueAtTime(0.05, now + 0.05);
  og.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
  osc.frequency.setValueAtTime(90, now);
  osc.frequency.exponentialRampToValueAtTime(160, now + 0.22);
  osc.connect(og);
  og.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.28);
}

function playCrash() {
  if (!soundOn) return;
  ensureAudio();
  const ctx = audioCtx;
  const now = ctx.currentTime;

  // noise impact
  const bufferSize = Math.floor(ctx.sampleRate * 0.35);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const t = i / bufferSize;
    data[i] = (Math.random() * 2 - 1) * (1 - t) * 0.9;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const low = ctx.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.setValueAtTime(500, now);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

  noise.connect(low);
  low.connect(g);
  g.connect(ctx.destination);
  noise.start(now);

  // low “boom” sine
  const osc = ctx.createOscillator();
  osc.type = "sine";
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, now);
  og.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
  og.gain.exponentialRampToValueAtTime(0.0001, now + 0.30);
  osc.frequency.setValueAtTime(70, now);
  osc.frequency.exponentialRampToValueAtTime(35, now + 0.25);
  osc.connect(og);
  og.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.32);
}

function updateSoundBtn() {
  if (!el.soundBtn) return;
  el.soundBtn.textContent = soundOn ? "Звук: on" : "Звук: off";
}
updateSoundBtn();

if (el.soundBtn) {
  el.soundBtn.addEventListener("click", async () => {
    soundOn = !soundOn;
    updateSoundBtn();
    // allow audio on first interaction
    try { ensureAudio(); await audioCtx.resume(); } catch {}
  });
}

// ---- Game state ----
const state = {
  phase: "waiting",   // waiting | flying | crashed
  waitTotal: 3.0,
  waitLeft: 3.0,

  inRound: false,
  bet: 100,
  placedBet: 0,

  // flight
  crashPoint: 2.0,
  mult: 1.0,
  t0: 0,
  t: 0,

  // visuals
  points: [],
};

function computeCrashPoint() {
  // classic crash distribution: 1/(1-r)
  const r = randFloat();
  const raw = 1 / (1 - r);
  // keep sane for demo
  return clamp(raw, 1.05, 80);
}

function resetRoundToWaiting() {
  state.phase = "waiting";
  state.waitTotal = 3.0;
  state.waitLeft = 3.0;

  state.inRound = false;
  state.placedBet = 0;

  state.mult = 1.0;
  state.t = 0;
  state.points = [{ t: 0, m: 1.0 }];

  syncUi();
}

function startFlight() {
  state.phase = "flying";
  state.crashPoint = computeCrashPoint();
  state.t0 = performance.now();
  state.t = 0;
  state.mult = 1.0;
  state.points = [{ t: 0, m: 1.0 }];

  playWhoosh();
  syncUi();
}

function crashNow() {
  state.phase = "crashed";
  // lock mult at crashPoint (visual)
  state.mult = state.crashPoint;
  state.points.push({ t: state.t, m: state.mult });

  // if user didn't cash out and was in round -> lose (bet already deducted)
  // if cashed out -> state.inRound already false
  state.inRound = false;
  state.placedBet = 0;

  playCrash();
  syncUi();

  // short pause then next round
  setTimeout(() => resetRoundToWaiting(), 1200);
}

// ---- Controls ----
function clampBetInput() {
  if (!el.betInput) return;
  let v = Math.floor(Number(el.betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  el.betInput.value = String(v);
  state.bet = v;
  syncUi();
}

if (el.betInput) {
  el.betInput.addEventListener("input", clampBetInput);
  // initial
  el.betInput.value = String(state.bet);
}

document.querySelectorAll("[data-bet]").forEach((b) => {
  b.addEventListener("click", () => {
    const val = b.getAttribute("data-bet");
    if (!el.betInput) return;

    if (val === "max") {
      el.betInput.value = String(wallet.coins);
    } else {
      el.betInput.value = String(Number(val) || state.bet);
    }
    clampBetInput();
  });
});

document.querySelectorAll("[data-bet-step]").forEach((b) => {
  b.addEventListener("click", () => {
    if (!el.betInput) return;
    const step = Number(b.getAttribute("data-bet-step")) || 0;
    el.betInput.value = String((Number(el.betInput.value) || 0) + step);
    clampBetInput();
  });
});

if (el.bonusBtn) {
  el.bonusBtn.addEventListener("click", () => addCoins(1000));
}

if (el.joinBtn) {
  el.joinBtn.addEventListener("click", async () => {
    // allow audio on interaction
    try { ensureAudio(); await audioCtx.resume(); } catch {}

    if (state.phase !== "waiting") return;
    clampBetInput();

    if (state.bet <= 0) return;
    if (state.bet > wallet.coins) return;

    addCoins(-state.bet);
    state.inRound = true;
    state.placedBet = state.bet;

    syncUi();
  });
}

if (el.cashBtn) {
  el.cashBtn.addEventListener("click", async () => {
    // allow audio on interaction
    try { ensureAudio(); await audioCtx.resume(); } catch {}

    if (state.phase !== "flying") return;
    if (!state.inRound) return;

    const payout = Math.floor(state.placedBet * state.mult);
    addCoins(payout);

    state.inRound = false;
    state.placedBet = 0;

    syncUi();
  });
}

// ---- UI sync ----
function syncUi() {
  renderBalance();

  // stats row
  setStatText(el.multValue, `x${fmt2(state.mult)}`);
  setStatText(el.statusValue,
    state.phase === "waiting" ? "Ожидание" :
    state.phase === "flying" ? "Полёт" : "Краш"
  );

  // "твоя ставка"
  setStatText(el.betStatValue, state.inRound ? `${state.placedBet} 🪙` : "—");
  if (el.betStatHint) {
    el.betStatHint.textContent = state.inRound ? "Ты в раунде" : "не в раунде";
  }

  // hints
  if (el.multHint) {
    el.multHint.textContent =
      state.phase === "waiting" ? "Новый раунд скоро" :
      state.phase === "flying" ? "Растёт..." : "Раунд завершён";
  }
  if (el.statusHint) {
    el.statusHint.textContent =
      state.phase === "waiting" ? `Старт через ${Math.ceil(state.waitLeft)}с` :
      state.phase === "flying" ? (state.inRound ? "Можно забрать" : "Ты не в раунде") :
      "Краш";
  }

  // center overlay
  const sub =
    state.phase === "waiting" ? `Ожидание следующего раунда (${Math.ceil(state.waitLeft)}с)` :
    state.phase === "flying" ? (state.inRound ? "Нажми “Забрать” в любой момент" : "Ты не в раунде") :
    `Краш на x${fmt2(state.crashPoint)}`;
  setCenter(state.mult, sub);

  // buttons
  if (el.joinBtn) {
    el.joinBtn.disabled = (state.phase !== "waiting") || state.inRound;
    el.joinBtn.textContent =
      state.phase !== "waiting" ? "Вход закрыт" : (state.inRound ? "В раунде" : "Войти в раунд");
  }
  if (el.cashBtn) {
    el.cashBtn.disabled = (state.phase !== "flying") || !state.inRound;
    el.cashBtn.textContent = "Забрать";
  }
}

// ---- Graph drawing ----
const ctx = el.canvas ? el.canvas.getContext("2d") : null;

function resizeCanvasToCSS() {
  if (!el.canvas || !ctx) return;
  const r = el.canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  el.canvas.width = Math.floor(r.width * dpr);
  el.canvas.height = Math.floor(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", () => {
  resizeCanvasToCSS();
  draw();
});

function draw() {
  if (!ctx || !el.canvas) return;
  const w = el.canvas.getBoundingClientRect().width;
  const h = el.canvas.getBoundingClientRect().height;

  ctx.clearRect(0, 0, w, h);

  // plot area padding
  const pad = 18;
  const x0 = pad, y0 = pad, x1 = w - pad, y1 = h - pad;
  const pw = x1 - x0, ph = y1 - y0;

  // dynamic scaling
  const visibleT = Math.max(6, Math.min(14, state.t + 3)); // adaptive window
  const maxM = Math.max(2, state.mult, state.crashPoint || 2);
  const visibleM = Math.min(80, Math.max(3, maxM * 1.08));

  const toX = (t) => x0 + (t / visibleT) * pw;
  const toY = (m) => y1 - ((m - 1) / (visibleM - 1)) * ph;

  // subtle vignette
  const g = ctx.createRadialGradient(w * 0.5, h * 0.8, 20, w * 0.5, h * 0.8, Math.max(w, h));
  g.addColorStop(0, "rgba(255,255,255,0.06)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // build path points
  const pts = state.points;
  if (!pts || pts.length < 2) return;

  // clip to plot
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x0, y0, pw, ph, 12);
  ctx.clip();

  // fill under curve (stake-like)
  ctx.beginPath();
  ctx.moveTo(toX(pts[0].t), y1);
  for (let i = 0; i < pts.length; i++) ctx.lineTo(toX(pts[i].t), toY(pts[i].m));
  ctx.lineTo(toX(pts[pts.length - 1].t), y1);
  ctx.closePath();

  const fill = ctx.createLinearGradient(0, y0, 0, y1);
  fill.addColorStop(0, "rgba(255,85,85,0.10)");
  fill.addColorStop(1, "rgba(255,85,85,0.00)");
  ctx.fillStyle = fill;
  ctx.fill();

  // glow line
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(toX(pts[0].t), toY(pts[0].m));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(toX(pts[i].t), toY(pts[i].m));

  ctx.strokeStyle = "rgba(255,110,110,0.30)";
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,110,110,0.95)";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // dot at the end (so “интереснее смотреть” без ракеты)
  const last = pts[pts.length - 1];
  const lx = toX(last.t), ly = toY(last.m);

  // glow dot
  ctx.beginPath();
  ctx.arc(lx, ly, 10, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,120,120,0.12)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(lx, ly, 4.2, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,220,220,0.95)";
  ctx.fill();

  ctx.restore();

  // outer border (soft)
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x0, y0, pw, ph);
}

// ---- Main loop (auto rounds) ----
function tick() {
  if (state.phase === "waiting") {
    state.waitLeft -= 1 / 60;
    state.waitLeft = Math.max(0, state.waitLeft);
    state.mult = 1.0;
    state.points = [{ t: 0, m: 1.0 }];

    if (state.waitLeft <= 0) startFlight();
    syncUi();
    draw();
    requestAnimationFrame(tick);
    return;
  }

  if (state.phase === "flying") {
    const now = performance.now();
    state.t = (now - state.t0) / 1000;

    // Growth: smooth curve (looks like crash games)
    // mult = 1 + a*t + b*t^2
    const a = 0.75;
    const b = 0.14;
    state.mult = 1 + a * state.t + b * state.t * state.t;

    // Keep points for drawing
    // push ~ every 50ms
    const last = state.points[state.points.length - 1];
    if (!last || state.t - last.t >= 0.05) {
      state.points.push({ t: state.t, m: state.mult });
      // limit points
      if (state.points.length > 450) state.points.shift();
    }

    // crash check
    if (state.mult >= state.crashPoint) {
      crashNow();
      draw();
      return;
    }

    syncUi();
    draw();
    requestAnimationFrame(tick);
    return;
  }

  // crashed phase is handled by timeout (resetRoundToWaiting)
  requestAnimationFrame(tick);
}

// ---- init ----
function initChipsActive() {
  // optional: highlight chosen chip if your HTML has it
}
resizeCanvasToCSS();
resetRoundToWaiting();
syncUi();
draw();

// Start animation loop (auto)
requestAnimationFrame(tick);
