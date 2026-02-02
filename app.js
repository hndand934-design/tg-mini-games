// ==============================
// Rocket Crash — app.js FINAL
// Crash only | Sound: start + crash (simple WebAudio)
// Auto rounds: WAIT(5s)->FLY->CRASH(hold)->WAIT(5s)
// Smooth graph + fill + trail
// FX layer: snow + crash flash + shake
// ==============================

// ---- Telegram WebApp (optional) ----
const tg = window.Telegram?.WebApp;
if (tg) { try { tg.ready(); tg.expand(); } catch {} }

// ---- RNG ----
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function fmt2(x) { return (Math.round(x * 100) / 100).toFixed(2); }

// "crash distribution" style
function genCrashPoint() {
  const houseEdge = 0.02;
  const r = Math.max(1e-12, 1 - randFloat());
  const x = (1 - houseEdge) / r;
  return clamp(x, 1.05, 120);
}

// ---- Wallet (local virtual coins) ----
const WALLET_KEY = "rocket_wallet_final";
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

// ---- DOM ----
const $ = (id) => document.getElementById(id);

const dom = {
  balance: $("balance"),
  // stats
  statMult: $("statMult"),
  statMultHint: $("statMultHint"),
  statStatus: $("statStatus"),
  statStatusHint: $("statStatusHint"),
  statBet: $("statBet"),
  statBetHint: $("statBetHint"),
  // center
  centerMult: $("centerMult"),
  centerText: $("centerText"),
  // controls
  betInput: $("betInput"),
  betMinus: $("betMinus"),
  betPlus: $("betPlus"),
  joinBtn: $("joinBtn"),
  cashBtn: $("cashBtn"),
  bonusBtn: $("bonus"),
  // canvases
  chart: $("chart"),
  fx: $("fx"),
  chartWrap: $("chartWrap"),
  // optional sound toggle
  soundBtn: $("soundBtn") || $("soundToggle"),
};

function renderBalance() {
  if (dom.balance) dom.balance.textContent = `🪙 ${wallet.coins}`;
}
renderBalance();

function setText(el, text) { if (el) el.textContent = text; }

// ---- Canvas setup (retina) ----
const c = dom.chart;
const fxc = dom.fx;
const ctx = c.getContext("2d", { alpha: true });
const fctx = fxc.getContext("2d", { alpha: true });

function fitCanvas() {
  const rect = c.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  c.width = Math.floor(rect.width * dpr);
  c.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  fxc.width = Math.floor(rect.width * dpr);
  fxc.height = Math.floor(rect.height * dpr);
  fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();
window.addEventListener("resize", () => { fitCanvas(); });

// ---- Game phases ----
const PHASE = { WAIT: "wait", FLY: "fly", CRASH: "crash" };

// config
const WAIT_SECONDS = 5.0;
const POST_CRASH_SECONDS = 5.0;
const CRASH_HOLD_MS = 1100;

// ---- Simple WebAudio (start + crash) ----
let soundOn = true;          // можно выключить кнопкой, если она есть
let audioCtx = null;
let audioUnlocked = false;

function ensureAudio() {
  if (!soundOn) return null;
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  audioUnlocked = true;
  return audioCtx;
}

// unlock on first user interaction (browser policy)
document.addEventListener("pointerdown", () => {
  ensureAudio();
}, { once: true });

function playStartSfx() {
  if (!soundOn) return;
  const ac = ensureAudio();
  if (!ac) return;

  const t0 = ac.currentTime;

  const o = ac.createOscillator();
  const g = ac.createGain();

  o.type = "sawtooth";
  o.frequency.setValueAtTime(180, t0);
  o.frequency.exponentialRampToValueAtTime(520, t0 + 0.18);
  o.frequency.exponentialRampToValueAtTime(260, t0 + 0.5);

  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.62);

  // soft filter
  const f = ac.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(900, t0);
  f.frequency.linearRampToValueAtTime(600, t0 + 0.6);

  o.connect(f);
  f.connect(g);
  g.connect(ac.destination);

  o.start(t0);
  o.stop(t0 + 0.65);
}

function playCrashSfx() {
  if (!soundOn) return;
  const ac = ensureAudio();
  if (!ac) return;

  const t0 = ac.currentTime;

  // noise burst (simple)
  const bufferSize = Math.floor(ac.sampleRate * 0.25);
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const k = 1 - i / bufferSize;
    data[i] = (randFloat() * 2 - 1) * k;
  }
  const noise = ac.createBufferSource();
  noise.buffer = buffer;

  const ng = ac.createGain();
  ng.gain.setValueAtTime(0.0001, t0);
  ng.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);

  const nf = ac.createBiquadFilter();
  nf.type = "highpass";
  nf.frequency.setValueAtTime(120, t0);

  noise.connect(nf);
  nf.connect(ng);
  ng.connect(ac.destination);
  noise.start(t0);
  noise.stop(t0 + 0.28);

  // thump
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(95, t0);
  o.frequency.exponentialRampToValueAtTime(48, t0 + 0.22);

  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.20, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);

  o.connect(g);
  g.connect(ac.destination);
  o.start(t0);
  o.stop(t0 + 0.25);
}

// optional toggle if button exists
if (dom.soundBtn) {
  dom.soundBtn.style.cursor = "pointer";
  dom.soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    ensureAudio();
    dom.soundBtn.textContent = soundOn ? "Звук: on" : "Звук: off";
  });
  dom.soundBtn.textContent = soundOn ? "Звук: on" : "Звук: off";
}

// ---- State ----
const state = {
  phase: PHASE.WAIT,
  waitLeft: WAIT_SECONDS,
  postLeft: POST_CRASH_SECONDS,

  // flight
  crashPoint: genCrashPoint(),
  mult: 1.0,
  t0: 0,
  t: 0,

  // betting
  bet: 100,
  joined: false,
  placedBet: 0,
  cashed: false,

  // result display
  lastCashPayout: 0,
  lastCashMult: 0,
  toast: "",
  toastT: 0,

  // graph points
  pts: [],

  // FX
  shake: 0,
  flash: 0,
  snow: [],
  trailAlpha: 0.65,
};

// ---- Snow init ----
function initSnow() {
  const rect = c.getBoundingClientRect();
  const w = rect.width, h = rect.height;

  state.snow = [];
  const count = Math.floor((w * h) / 18000);
  for (let i = 0; i < count; i++) {
    state.snow.push({
      x: randFloat() * w,
      y: randFloat() * h,
      r: 0.6 + randFloat() * 1.6,
      s: 12 + randFloat() * 26,
      d: 8 + randFloat() * 16,
      p: randFloat() * Math.PI * 2,
      a: 0.15 + randFloat() * 0.35
    });
  }
}
initSnow();
window.addEventListener("resize", initSnow);

// ---- UI sync ----
function syncUI() {
  setText(dom.statMult, `x${fmt2(state.mult)}`);

  // center text toast (after cashout)
  let centerLine = "";
  if (state.toastT > 0 && state.toast) {
    centerLine = state.toast;
  } else {
    if (state.phase === PHASE.WAIT) {
      centerLine = `Ожидание следующего раунда (${Math.ceil(state.waitLeft)}с)`;
    } else if (state.phase === PHASE.FLY) {
      // keep minimal
      centerLine = state.joined && !state.cashed ? "Нажми “Забрать” в любой момент" : "Ты не в раунде";
    } else {
      centerLine = `Игра закончилась · новый раунд через ${Math.ceil(state.postLeft)}с`;
    }
  }

  if (state.phase === PHASE.WAIT) {
    setText(dom.statMultHint, "Ожидание");
    setText(dom.statStatus, "Ожидание");
    setText(dom.statStatusHint, `Старт через ${Math.ceil(state.waitLeft)}с`);
  } else if (state.phase === PHASE.FLY) {
    setText(dom.statMultHint, "Растёт…");
    setText(dom.statStatus, "Полёт");
    setText(dom.statStatusHint, state.joined && !state.cashed ? "Можно забрать" : "Ты не в раунде");
  } else {
    setText(dom.statMultHint, "Краш");
    setText(dom.statStatus, "Игра закончилась");
    setText(dom.statStatusHint, `Новый раунд через ${Math.ceil(state.postLeft)}с`);
  }

  setText(dom.centerMult, `${fmt2(state.mult)}x`);
  setText(dom.centerText, centerLine);

  // show bet / payout
  if (state.cashed && state.lastCashPayout > 0) {
    setText(dom.statBet, `+${state.lastCashPayout} 🪙`);
    setText(dom.statBetHint, `забрал x${fmt2(state.lastCashMult)}`);
  } else {
    setText(dom.statBet, state.joined ? `${state.placedBet} 🪙` : "—");
    setText(dom.statBetHint, state.joined ? "в раунде" : "не в раунде");
  }

  // buttons
  if (dom.joinBtn) {
    dom.joinBtn.disabled = !(state.phase === PHASE.WAIT) || state.joined;
    dom.joinBtn.textContent = state.joined ? "В раунде" : "Войти в раунд";
  }
  if (dom.cashBtn) {
    dom.cashBtn.disabled = !(state.phase === PHASE.FLY && state.joined && !state.cashed);
    dom.cashBtn.textContent = "Забрать";
  }
}

// ---- Bet input helpers ----
function clampBetUI() {
  let v = Math.floor(Number(dom.betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  dom.betInput.value = String(v);
  state.bet = v;
  return v;
}

if (dom.betInput) {
  dom.betInput.value = String(state.bet);
  dom.betInput.addEventListener("input", () => { clampBetUI(); });
}

dom.betMinus?.addEventListener("click", () => {
  dom.betInput.value = String((Number(dom.betInput.value) || 1) - 10);
  clampBetUI();
});
dom.betPlus?.addEventListener("click", () => {
  dom.betInput.value = String((Number(dom.betInput.value) || 1) + 10);
  clampBetUI();
});

// preset chips
document.querySelectorAll("[data-bet]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = btn.getAttribute("data-bet");
    if (v === "max") dom.betInput.value = String(wallet.coins);
    else dom.betInput.value = String(Number(v) || state.bet);
    clampBetUI();
  });
});

// bonus
dom.bonusBtn?.addEventListener("click", () => addCoins(1000));

// join bet
dom.joinBtn?.addEventListener("click", () => {
  if (state.phase !== PHASE.WAIT) return;
  if (state.joined) return;

  // once user interacts, audio can be used
  ensureAudio();

  const b = clampBetUI();
  if (b <= 0) return;
  if (b > wallet.coins) return;

  addCoins(-b);
  state.joined = true;
  state.placedBet = b;
  state.cashed = false;

  // clear last cash display when a new bet is placed
  state.lastCashPayout = 0;
  state.lastCashMult = 0;

  syncUI();
});

// cashout
dom.cashBtn?.addEventListener("click", () => {
  if (state.phase !== PHASE.FLY) return;
  if (!state.joined || state.cashed) return;

  state.cashed = true;

  const payout = Math.floor(state.placedBet * state.mult);
  addCoins(payout);

  // show payout
  state.lastCashPayout = payout;
  state.lastCashMult = state.mult;

  state.toast = `✅ Забрал +${payout} 🪙 (x${fmt2(state.mult)})`;
  state.toastT = 2.6;

  syncUI();
});

// ---- Round control ----
function resetToWait() {
  state.phase = PHASE.WAIT;
  state.waitLeft = WAIT_SECONDS;

  state.mult = 1.0;
  state.t = 0;
  state.t0 = 0;

  state.crashPoint = genCrashPoint();

  state.joined = false;
  state.placedBet = 0;

  // keep lastCash on screen a bit until next action,
  // but clear the "in-round cashed" flag (it's already shown via lastCash values)
  state.cashed = state.lastCashPayout > 0;

  state.pts = [{ t: 0, m: 1.0 }];

  state.flash = 0;
  state.shake = 0;

  ctx.clearRect(0, 0, c.width, c.height);
  fctx.clearRect(0, 0, fxc.width, fxc.height);

  syncUI();
}

function startFlight() {
  state.phase = PHASE.FLY;
  state.t0 = performance.now();
  state.t = 0;
  state.mult = 1.0;
  state.pts = [{ t: 0, m: 1.0 }];

  // if someone had last payout, let it fade naturally via toast,
  // but keep lastCash values in the stat block.
  playStartSfx();

  syncUI();
}

function triggerCrash() {
  state.phase = PHASE.CRASH;
  state.mult = state.crashPoint;

  // FX
  state.flash = 1.0;
  state.shake = 10;

  // sound
  playCrashSfx();

  // if player was in round and didn't cash => lose (bet already deducted)
  state.joined = false;
  state.placedBet = 0;
  // if no last cash, show nothing
  // keep lastCash if exists from previous round

  // post countdown
  state.postLeft = POST_CRASH_SECONDS;

  syncUI();

  // hold crash screen a bit
  setTimeout(() => {}, CRASH_HOLD_MS);
}

// ---- Smooth multiplier curve ----
function multiplierAtTime(t) {
  const a = 0.70;
  const b = 0.11;
  const c = 0.015;
  const m = 1 + a * t + b * t * t + c * t * t * t;
  return m;
}

// ---- Drawing helpers ----
function drawChart() {
  const rect = c.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  const pad = 16;
  const x0 = pad, y0 = pad, x1 = w - pad, y1 = h - pad;
  const pw = x1 - x0, ph = y1 - y0;

  // trail effect only during fly
  if (state.phase === PHASE.FLY) {
    ctx.fillStyle = `rgba(0,0,0,${1 - state.trailAlpha})`;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.clearRect(0, 0, w, h);
  }

  const visibleT = Math.max(6, Math.min(14, state.t + 3));
  const visibleM = Math.min(120, Math.max(3.5, state.mult * 1.15));

  const toX = (t) => x0 + (t / visibleT) * pw;
  const toY = (m) => y1 - ((m - 1) / (visibleM - 1)) * ph;

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, x0, y0, pw, ph, 12);
  ctx.clip();

  const pts = state.pts;
  if (pts.length >= 2) {
    // Fill
    ctx.beginPath();
    ctx.moveTo(toX(pts[0].t), y1);
    for (let i = 0; i < pts.length; i++) ctx.lineTo(toX(pts[i].t), toY(pts[i].m));
    ctx.lineTo(toX(pts[pts.length - 1].t), y1);
    ctx.closePath();

    const fill = ctx.createLinearGradient(0, y0, 0, y1);
    fill.addColorStop(0, "rgba(255,90,106,0.18)");
    fill.addColorStop(1, "rgba(255,90,106,0.02)");
    ctx.fillStyle = fill;
    ctx.fill();

    // Glow line
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(toX(pts[0].t), toY(pts[0].m));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(toX(pts[i].t), toY(pts[i].m));

    ctx.strokeStyle = "rgba(255,90,106,0.28)";
    ctx.lineWidth = 7;
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,150,160,0.95)";
    ctx.lineWidth = 2.6;
    ctx.stroke();

    // End dot
    const last = pts[pts.length - 1];
    const lx = toX(last.t), ly = toY(last.m);

    ctx.beginPath();
    ctx.arc(lx, ly, 10, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,90,106,0.12)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(lx, ly, 4.3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,235,240,0.95)";
    ctx.fill();
  }

  ctx.restore();
}

function drawFX(dt) {
  const rect = fxc.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  fctx.clearRect(0, 0, w, h);

  // snow
  for (const s of state.snow) {
    s.p += dt * 0.9;
    s.y += s.s * dt;
    s.x += Math.sin(s.p) * s.d * dt;

    if (s.y > h + 10) { s.y = -10; s.x = randFloat() * w; }
    if (s.x < -20) s.x = w + 20;
    if (s.x > w + 20) s.x = -20;

    fctx.beginPath();
    fctx.fillStyle = `rgba(255,255,255,${s.a})`;
    fctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    fctx.fill();
  }

  // crash flash
  if (state.flash > 0) {
    const a = state.flash;
    const g = fctx.createRadialGradient(w * 0.55, h * 0.45, 10, w * 0.55, h * 0.45, Math.max(w, h));
    g.addColorStop(0, `rgba(255,90,106,${0.22 * a})`);
    g.addColorStop(1, `rgba(255,90,106,0)`);
    fctx.fillStyle = g;
    fctx.fillRect(0, 0, w, h);

    fctx.fillStyle = `rgba(255,255,255,${0.06 * a})`;
    fctx.fillRect(0, 0, w, h);

    state.flash = Math.max(0, state.flash - dt * 1.8);
  }
}

function applyShake() {
  if (!dom.chartWrap) return;
  if (state.shake <= 0) {
    dom.chartWrap.style.transform = "";
    return;
  }
  const s = state.shake;
  const dx = (randFloat() * 2 - 1) * s;
  const dy = (randFloat() * 2 - 1) * s;
  dom.chartWrap.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
  state.shake = Math.max(0, state.shake - 0.9);
}

// rounded rect
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---- Main loop ----
let last = performance.now();

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // toast timer
  if (state.toastT > 0) {
    state.toastT = Math.max(0, state.toastT - dt);
    if (state.toastT === 0) state.toast = "";
  }

  if (state.phase === PHASE.WAIT) {
    state.waitLeft -= dt;
    state.mult = 1.0;
    state.t = 0;

    if (state.waitLeft <= 0) {
      startFlight();
    }
  } else if (state.phase === PHASE.FLY) {
    state.t = (now - state.t0) / 1000;

    const m = multiplierAtTime(state.t);
    state.mult = m;

    const lastPt = state.pts[state.pts.length - 1];
    if (!lastPt || state.t - lastPt.t >= 0.03) {
      state.pts.push({ t: state.t, m: state.mult });
      if (state.pts.length > 700) state.pts.shift();
    }

    if (state.mult >= state.crashPoint) {
      state.mult = state.crashPoint;
      state.pts.push({ t: state.t, m: state.mult });
      triggerCrash();
    }
  } else if (state.phase === PHASE.CRASH) {
    state.postLeft -= dt;
    if (state.postLeft <= 0) {
      resetToWait();
    }
  }

  syncUI();
  drawChart();
  drawFX(dt);
  applyShake();

  requestAnimationFrame(loop);
}

// ---- Start ----
resetToWait();
syncUI();
requestAnimationFrame(loop);
