// ==============================
// Rocket Crash — app.js FINAL
// Crash only | NO SOUND
// Auto rounds: WAIT(5s)->FLY->CRASH(1.2s)->WAIT(5s)
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
  // houseEdge just for shape, still random
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
  const count = Math.floor((w * h) / 18000); // adaptive
  for (let i = 0; i < count; i++) {
    state.snow.push({
      x: randFloat() * w,
      y: randFloat() * h,
      r: 0.6 + randFloat() * 1.6,
      s: 12 + randFloat() * 26,         // fall speed
      d: 8 + randFloat() * 16,          // drift
      p: randFloat() * Math.PI * 2,     // phase
      a: 0.15 + randFloat() * 0.35      // alpha
    });
  }
}
initSnow();
window.addEventListener("resize", initSnow);

// ---- UI sync ----
function syncUI() {
  // top stats
  setText(dom.statMult, `x${fmt2(state.mult)}`);

  if (state.phase === PHASE.WAIT) {
    setText(dom.statMultHint, "Ожидание");
    setText(dom.statStatus, "Ожидание");
    setText(dom.statStatusHint, `Старт через ${Math.ceil(state.waitLeft)}с`);
    setText(dom.centerText, `Ожидание следующего раунда (${Math.ceil(state.waitLeft)}с)`);
  } else if (state.phase === PHASE.FLY) {
    setText(dom.statMultHint, "Растёт…");
    setText(dom.statStatus, "Полёт");
    setText(dom.statStatusHint, state.joined && !state.cashed ? "Можно забрать" : "Ты не в раунде");
    setText(dom.centerText, state.joined && !state.cashed ? "Нажми “Забрать” в любой момент" : "Ты не в раунде");
  } else {
    setText(dom.statMultHint, "Краш");
    setText(dom.statStatus, "Игра закончилась");
    setText(dom.statStatusHint, `Новый раунд через ${Math.ceil(state.postLeft)}с`);
    setText(dom.centerText, `Игра закончилась · новый раунд через ${Math.ceil(state.postLeft)}с`);
  }

  setText(dom.centerMult, `${fmt2(state.mult)}x`);

  // bet UI
  setText(dom.statBet, state.joined ? `${state.placedBet} 🪙` : "—");
  setText(dom.statBetHint, state.joined ? (state.cashed ? "забрал" : "в раунде") : "не в раунде");

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

  const b = clampBetUI();
  if (b <= 0) return;
  if (b > wallet.coins) return;

  addCoins(-b);
  state.joined = true;
  state.placedBet = b;
  state.cashed = false;
  syncUI();
});

// cashout
dom.cashBtn?.addEventListener("click", () => {
  if (state.phase !== PHASE.FLY) return;
  if (!state.joined || state.cashed) return;

  state.cashed = true;
  const payout = Math.floor(state.placedBet * state.mult);
  addCoins(payout);
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
  state.cashed = false;

  state.pts = [{ t: 0, m: 1.0 }];

  state.flash = 0;
  state.shake = 0;

  // clear canvases
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
  syncUI();
}
function triggerCrash() {
  state.phase = PHASE.CRASH;
  state.mult = state.crashPoint;

  // FX
  state.flash = 1.0;
  state.shake = 10; // px intensity

  // if player in round and not cashed => lose bet (already deducted)
  state.joined = false;
  state.placedBet = 0;
  state.cashed = false;

  // post countdown
  state.postLeft = POST_CRASH_SECONDS;

  syncUI();

  // hold crash a bit before countdown ticks visibly
  setTimeout(() => {
    // continue ticking in loop
  }, CRASH_HOLD_MS);
}

// ---- Smooth multiplier curve ----
// Smooth growth with accelerating feel but stable
function multiplierAtTime(t) {
  // mix linear + quadratic + slight exponential feel without exploding
  // Works nicely for visuals.
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

  // keep previous frame for trail effect
  if (state.phase === PHASE.FLY) {
    ctx.fillStyle = `rgba(0,0,0,${1 - state.trailAlpha})`;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.clearRect(0, 0, w, h);
  }

  // dynamic viewport based on time + mult
  const visibleT = Math.max(6, Math.min(14, state.t + 3));
  const visibleM = Math.min(120, Math.max(3.5, state.mult * 1.15));

  const toX = (t) => x0 + (t / visibleT) * pw;
  const toY = (m) => y1 - ((m - 1) / (visibleM - 1)) * ph;

  // Clip to rounded rect area
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, x0, y0, pw, ph, 12);
  ctx.clip();

  const pts = state.pts;
  if (pts.length >= 2) {
    // Fill under curve (stake-like)
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

  // clear FX each frame (fx is only effects)
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

    // slight white overlay
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
  state.shake = Math.max(0, state.shake - 0.9); // decay
}

// roundRect polyfill (for older canvas)
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

  // phase logic
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

    // collect points smoothly
    const lastPt = state.pts[state.pts.length - 1];
    if (!lastPt || state.t - lastPt.t >= 0.03) {
      state.pts.push({ t: state.t, m: state.mult });
      if (state.pts.length > 700) state.pts.shift();
    }

    // crash
    if (state.mult >= state.crashPoint) {
      state.mult = state.crashPoint;
      state.pts.push({ t: state.t, m: state.mult });
      triggerCrash();
    }
  } else if (state.phase === PHASE.CRASH) {
    // post countdown
    state.postLeft -= dt;
    if (state.postLeft <= 0) {
      resetToWait();
    }
  }

  // UI each frame (cheap)
  syncUI();

  // draw
  drawChart();
  drawFX(dt);
  applyShake();

  requestAnimationFrame(loop);
}

// ---- Start ----
resetToWait();
syncUI();
requestAnimationFrame(loop);
