/* =========================
   Rocket Crash — Crash only
   GitHub Pages friendly
   ========================= */

/* ---------- RNG (crypto) ---------- */
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

/* Provably-fair-ish crash point (simple, client-side demo):
   crash = max(1.01, floor( (0.99/(1-u)) * 100 ) / 100 )
   This gives rare big multipliers. */
function rollCrashPoint() {
  const u = randFloat();
  const v = 0.99 / (1 - u);
  const cp = Math.floor(v * 100) / 100;
  return Math.max(1.01, Math.min(cp, 500)); // cap for sanity
}

/* ---------- Telegram WebApp ---------- */
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

/* ---------- Wallet (local) ---------- */
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

/* ---------- DOM helpers ---------- */
const $ = (id) => document.getElementById(id);

const elBalance = $("balanceValue");
const elMult = $("multValue");
const elStatus = $("statusValue");
const elMyBet = $("myBetValue");

const elCenterBig = $("centerBig");
const elCenterSmall = $("centerSmall");

const elBetInput = $("betInput");
const elJoin = $("joinBtn");
const elCash = $("cashBtn");
const elPlus = $("plusBtn");
const elMinus = $("minusBtn");
const elBonus = $("bonusBtn");
const elSound = $("soundBtn");
const elChips = $("chipsRow");

const canvas = $("chartCanvas");
const ctx = canvas?.getContext?.("2d");

/* If something missing — fail gracefully */
function mustHave() {
  const ids = [
    "balanceValue","multValue","statusValue","myBetValue",
    "centerBig","centerSmall","betInput","joinBtn","cashBtn",
    "plusBtn","minusBtn","bonusBtn","soundBtn","chipsRow","chartCanvas"
  ];
  const missing = ids.filter((x) => !$(x));
  if (missing.length) {
    console.warn("Missing elements:", missing.join(", "));
  }
}
mustHave();

/* ---------- UI render ---------- */
function renderBalance() {
  if (!elBalance) return;
  elBalance.textContent = `🪙 ${wallet.coins}`;
}
renderBalance();

/* ---------- Canvas sizing ---------- */
function fitCanvasToCSS() {
  if (!canvas || !ctx) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", () => {
  fitCanvasToCSS();
});
fitCanvasToCSS();

/* ---------- Game state ---------- */
const STATE = {
  WAIT: "wait",
  FLY: "fly",
  CRASH: "crash",
};

let game = {
  state: STATE.WAIT,
  countdownMs: 3500,
  waitLeftMs: 3500,

  inRound: false,
  bet: 100,
  cashed: false,

  crashPoint: 1.5,
  mult: 1.0,
  t0: 0,
  raf: 0,

  // stored real points (time, mult)
  points: [],

  // dynamic scaling so rocket stays inside
  scale: {
    yMax: 4,     // max multiplier visible on chart
    xMax: 6.0,   // max seconds visible on chart
    yMaxTarget: 4,
    xMaxTarget: 6.0,
  },

  // rocket visual
  rocket: {
    visible: true,
    x: 0,
    y: 0,
    angle: 0,
  },

  soundOn: true,
};

const BET_PRESETS = [10, 50, 100, 250, 500];

/* ---------- Sounds (WebAudio, no files) ---------- */
let audioCtx = null;
let master = null;
let engineOsc = null;
let engineGain = null;
let windOsc = null;
let windGain = null;

function ensureAudio() {
  if (!game.soundOn) return false;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    master = audioCtx.createGain();
    master.gain.value = 0.7;
    master.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return true;
}

function stopEngine() {
  try {
    if (engineOsc) engineOsc.stop();
  } catch {}
  try {
    if (windOsc) windOsc.stop();
  } catch {}
  engineOsc = null;
  windOsc = null;
  engineGain = null;
  windGain = null;
}

function startEngine() {
  if (!ensureAudio()) return;
  stopEngine();

  // Engine tone (saw) + wind (triangle)
  engineOsc = audioCtx.createOscillator();
  engineOsc.type = "sawtooth";
  engineGain = audioCtx.createGain();
  engineGain.gain.value = 0.0001;

  windOsc = audioCtx.createOscillator();
  windOsc.type = "triangle";
  windGain = audioCtx.createGain();
  windGain.gain.value = 0.0001;

  // filters for nicer sound
  const lp = audioCtx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900;

  const hp = audioCtx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 80;

  engineOsc.connect(engineGain);
  windOsc.connect(windGain);

  engineGain.connect(lp);
  windGain.connect(hp);

  lp.connect(master);
  hp.connect(master);

  engineOsc.frequency.value = 90;
  windOsc.frequency.value = 220;

  engineOsc.start();
  windOsc.start();

  // Fade-in
  const now = audioCtx.currentTime;
  engineGain.gain.setValueAtTime(0.0001, now);
  engineGain.gain.exponentialRampToValueAtTime(0.10, now + 0.25);

  windGain.gain.setValueAtTime(0.0001, now);
  windGain.gain.exponentialRampToValueAtTime(0.03, now + 0.30);
}

function updateEngine(mult) {
  if (!audioCtx || !engineOsc || !windOsc || !engineGain || !windGain) return;

  const now = audioCtx.currentTime;
  // scale frequencies with multiplier (pleasant)
  const eFreq = Math.min(520, 90 + Math.log(mult + 1) * 140);
  const wFreq = Math.min(900, 220 + Math.log(mult + 1) * 220);

  engineOsc.frequency.setTargetAtTime(eFreq, now, 0.06);
  windOsc.frequency.setTargetAtTime(wFreq, now, 0.08);

  const eGain = Math.min(0.16, 0.09 + Math.log(mult + 1) * 0.03);
  const wGain = Math.min(0.06, 0.03 + Math.log(mult + 1) * 0.02);

  engineGain.gain.setTargetAtTime(eGain, now, 0.10);
  windGain.gain.setTargetAtTime(wGain, now, 0.12);
}

function playCrash() {
  if (!ensureAudio()) return;

  // quick burst noise-like crash using square + filter sweep
  const osc = audioCtx.createOscillator();
  osc.type = "square";
  const g = audioCtx.createGain();
  const bp = audioCtx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1400;
  bp.Q.value = 1.2;

  osc.connect(g);
  g.connect(bp);
  bp.connect(master);

  const now = audioCtx.currentTime;
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.25);

  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.20, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

  bp.frequency.setValueAtTime(1800, now);
  bp.frequency.exponentialRampToValueAtTime(500, now + 0.28);

  osc.start(now);
  osc.stop(now + 0.40);
}

/* ---------- Controls wiring ---------- */
function clampBet() {
  if (!elBetInput) return 0;
  let v = Math.floor(Number(elBetInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  elBetInput.value = String(v);
  return v;
}

function setBet(v) {
  if (!elBetInput) return;
  elBetInput.value = String(v);
  clampBet();
}

function renderBetUI() {
  const b = clampBet();
  game.bet = b;

  if (elMyBet) {
    elMyBet.textContent = game.inRound ? `${game.bet} 🪙` : "—";
  }

  // button states
  if (elJoin) {
    if (game.state === STATE.WAIT) {
      elJoin.disabled = false;
      elJoin.textContent = game.inRound ? "В раунде (ждёшь)" : "Войти в раунд";
    } else {
      elJoin.disabled = true;
      elJoin.textContent = "Вход закрыт";
    }
  }

  if (elCash) {
    elCash.disabled = !(game.state === STATE.FLY && game.inRound && !game.cashed);
  }
}

if (elBetInput) {
  elBetInput.addEventListener("input", () => {
    clampBet();
    renderBetUI();
  });
}

if (elMinus) elMinus.onclick = () => { setBet((Number(elBetInput.value)||1) - 10); renderBetUI(); };
if (elPlus)  elPlus.onclick  = () => { setBet((Number(elBetInput.value)||1) + 10); renderBetUI(); };

if (elBonus) elBonus.onclick = () => addCoins(1000);

if (elSound) {
  elSound.onclick = () => {
    game.soundOn = !game.soundOn;
    elSound.textContent = game.soundOn ? "Звук: on" : "Звук: off";
    if (!game.soundOn) stopEngine();
    else ensureAudio();
  };
  elSound.textContent = game.soundOn ? "Звук: on" : "Звук: off";
}

if (elChips) {
  elChips.innerHTML = BET_PRESETS.map(v => `<button class="chip" data-v="${v}">${v}</button>`).join("") +
    `<button class="chip" data-v="max">MAX</button>`;

  elChips.querySelectorAll(".chip").forEach((btn) => {
    btn.onclick = () => {
      const dv = btn.getAttribute("data-v");
      if (dv === "max") setBet(wallet.coins);
      else setBet(Number(dv));
      renderBetUI();
    };
  });
}

if (elJoin) {
  elJoin.onclick = () => {
    // must be in WAIT
    if (game.state !== STATE.WAIT) return;

    const b = clampBet();
    if (b <= 0) return;
    if (b > wallet.coins) return alert("Недостаточно монет");

    game.inRound = true;
    game.cashed = false;
    game.bet = b;
    renderBetUI();
  };
}

if (elCash) {
  elCash.onclick = () => {
    if (!(game.state === STATE.FLY && game.inRound && !game.cashed)) return;

    game.cashed = true;
    const payout = Math.floor(game.bet * game.mult);
    addCoins(payout);

    // show small message in center
    if (elCenterSmall) elCenterSmall.textContent = `✅ Забрал: +${payout} 🪙`;
    renderBetUI();
  };
}

/* ---------- Multiplier growth model ---------- */
function multAtTime(t) {
  // smooth growth; feels like crash games
  // (t in seconds)
  return 1 + (t * 0.90) + (t * t * 0.18);
}

/* ---------- Dynamic scaling (keeps rocket inside) ---------- */
function updateScaleTargets(t, mult) {
  // target yMax around crashPoint, but also follow current mult
  const desiredY = Math.max(3.0, Math.min(500, Math.max(mult * 1.15, game.crashPoint * 1.08)));
  game.scale.yMaxTarget = desiredY;

  // time window: make sure x doesn't run away
  // estimate crash time roughly by solving multAtTime(t)=crashPoint
  // for our polynomial 1 + 0.9t + 0.18t^2 = cp
  const cp = game.crashPoint;
  const A = 0.18, B = 0.90, C = 1 - cp;
  const disc = Math.max(0, B*B - 4*A*C);
  const tCrash = (-B + Math.sqrt(disc)) / (2*A);
  const desiredX = Math.max(3.8, Math.min(14, tCrash * 1.10));
  game.scale.xMaxTarget = desiredX;

  // smooth lerp
  game.scale.yMax += (game.scale.yMaxTarget - game.scale.yMax) * 0.06;
  game.scale.xMax += (game.scale.xMaxTarget - game.scale.xMax) * 0.06;
}

/* ---------- Drawing ---------- */
function clearChart() {
  if (!ctx || !canvas) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
}

function drawCurveAndRocket() {
  if (!ctx || !canvas) return;

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  // margins inside chart
  const padL = 18, padR = 18, padT = 18, padB = 22;
  const X0 = padL, Y0 = padT;
  const X1 = w - padR, Y1 = h - padB;
  const CW = X1 - X0, CH = Y1 - Y0;

  // background vignette inside canvas (soft)
  ctx.save();
  const g = ctx.createRadialGradient(w*0.5, h*0.25, 10, w*0.5, h*0.25, w*0.9);
  g.addColorStop(0, "rgba(76,125,255,0.10)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,w,h);
  ctx.restore();

  // build points (recompute based on current scale)
  const xMax = game.scale.xMax;
  const yMax = game.scale.yMax;

  const pts = game.points.map(p => {
    const xn = Math.min(1, p.t / xMax);
    const yn = Math.min(1, p.m / yMax);
    const x = X0 + xn * CW;
    const y = Y1 - yn * CH; // invert
    return { x, y, t: p.t, m: p.m };
  });

  // curve
  if (pts.length >= 2) {
    ctx.save();
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // glow
    ctx.strokeStyle = "rgba(255,91,102,.18)";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    // main line
    ctx.strokeStyle = "rgba(255,91,102,.92)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();

    // rocket at last point
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];

    // direction vector -> angle
    const dx = last.x - prev.x;
    const dy = last.y - prev.y;
    const ang = Math.atan2(dy, dx); // canvas angle

    // keep inside bounds
    const rx = Math.min(X1, Math.max(X0, last.x));
    const ry = Math.min(Y1, Math.max(Y0, last.y));

    game.rocket.x = rx;
    game.rocket.y = ry;
    game.rocket.angle = ang;

    drawRocket(rx, ry, ang);
  } else {
    // initial rocket position near bottom-left (waiting)
    const rx = X0 + 6;
    const ry = Y1 - 6;
    drawRocket(rx, ry, -0.2);
  }
}

function drawRocket(x, y, ang) {
  if (!ctx) return;

  // style: simple 2D rocket (opaque)
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);

  // trail glow behind
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "rgba(76,125,255,.55)";
  ctx.beginPath();
  ctx.ellipse(-18, 0, 22, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // flame
  ctx.save();
  ctx.fillStyle = "rgba(255,170,60,.95)";
  ctx.beginPath();
  ctx.moveTo(-16, 0);
  ctx.quadraticCurveTo(-28, -6, -34, 0);
  ctx.quadraticCurveTo(-28, 6, -16, 0);
  ctx.fill();

  ctx.fillStyle = "rgba(255,70,70,.85)";
  ctx.beginPath();
  ctx.moveTo(-18, 0);
  ctx.quadraticCurveTo(-26, -4, -30, 0);
  ctx.quadraticCurveTo(-26, 4, -18, 0);
  ctx.fill();
  ctx.restore();

  // body
  ctx.save();
  ctx.fillStyle = "rgba(240,245,255,.98)";
  ctx.strokeStyle = "rgba(255,255,255,.22)";
  ctx.lineWidth = 1;

  // main capsule
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.quadraticCurveTo(6, -10, -6, -10);
  ctx.lineTo(-10, -6);
  ctx.lineTo(-10, 6);
  ctx.lineTo(-6, 10);
  ctx.quadraticCurveTo(6, 10, 10, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // window
  ctx.fillStyle = "rgba(30,60,120,.95)";
  ctx.beginPath();
  ctx.arc(1, -2, 3.4, 0, Math.PI*2);
  ctx.fill();

  // fin
  ctx.fillStyle = "rgba(200,210,230,.95)";
  ctx.beginPath();
  ctx.moveTo(-6, 8);
  ctx.lineTo(-14, 12);
  ctx.lineTo(-10, 5);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  ctx.restore();
}

/* ---------- UI status updates ---------- */
function setStatus(status, hint) {
  if (elStatus) elStatus.textContent = status;
  if (elCenterSmall) elCenterSmall.textContent = hint || "";
}

function setMult(v) {
  if (elMult) elMult.textContent = `x${v.toFixed(2)}`;
  if (elCenterBig) elCenterBig.textContent = `${v.toFixed(2)}x`;
}

/* ---------- Round loop ---------- */
function startNewWait() {
  cancelAnimationFrame(game.raf);
  stopEngine();

  game.state = STATE.WAIT;
  game.waitLeftMs = game.countdownMs;

  game.inRound = false;
  game.cashed = false;
  game.mult = 1.0;
  game.points = [{ t: 0, m: 1.0 }];

  game.crashPoint = rollCrashPoint();

  // reset scale (but not too jumpy)
  game.scale.yMax = 4;
  game.scale.xMax = 6.0;
  game.scale.yMaxTarget = 4;
  game.scale.xMaxTarget = 6.0;

  setMult(1.0);
  setStatus("Ожидание", `Старт через ${(game.waitLeftMs/1000).toFixed(0)}с`);
  renderBetUI();
  renderBalance();
  drawFrameStatic();
  waitTick();
}

function waitTick() {
  const start = performance.now();

  const step = () => {
    const now = performance.now();
    const dt = now - start;

    // compute left based on time since first tick call
    // to avoid drift, we keep decrement by animation delta
  };
}

function drawFrameStatic() {
  clearChart();
  drawCurveAndRocket();
}

/* Countdown uses RAF so it's smooth */
function runCountdown() {
  const tStart = performance.now();

  const loop = (t) => {
    const elapsed = t - tStart;
    const left = Math.max(0, game.countdownMs - elapsed);
    game.waitLeftMs = left;

    setMult(1.0);
    setStatus("Ожидание", `Старт через ${Math.ceil(left/1000)}с`);
    renderBetUI();

    drawFrameStatic();

    if (left <= 0) {
      startFlight();
      return;
    }
    game.raf = requestAnimationFrame(loop);
  };

  game.raf = requestAnimationFrame(loop);
}

function startFlight() {
  cancelAnimationFrame(game.raf);

  game.state = STATE.FLY;
  game.mult = 1.0;
  game.t0 = performance.now();
  game.points = [{ t: 0, m: 1.0 }];

  // if user joined — take bet now
  if (game.inRound) {
    // validate again
    const b = Math.floor(Number(elBetInput?.value) || game.bet || 0);
    if (b > 0 && b <= wallet.coins) {
      game.bet = b;
      addCoins(-b);
    } else {
      // can't afford => kicked from round
      game.inRound = false;
      game.cashed = false;
    }
  }

  setStatus("Полёт", game.inRound ? "Можно забрать" : "Ты не в раунде");
  setMult(1.0);
  renderBetUI();
  renderBalance();

  // start engine sound (needs user gesture sometimes; but sound toggle click counts)
  startEngine();

  flightLoop();
}

function startCrash(finalMult) {
  game.state = STATE.CRASH;

  stopEngine();
  playCrash();

  setMult(finalMult);
  setStatus("Краш", "💥 Ракета улетела");

  // if user was in round and not cashed => lose bet (already deducted)
  // just lock cash button
  renderBetUI();
  drawFrameStatic();

  // small pause then next wait
  setTimeout(() => {
    startNewWait();
    runCountdown();
  }, 1400);
}

function flightLoop() {
  const loop = (t) => {
    const dt = (t - game.t0) / 1000; // seconds
    const m = multAtTime(dt);

    game.mult = m;

    updateScaleTargets(dt, m);

    // store point
    const last = game.points[game.points.length - 1];
    // avoid too many points
    if (!last || dt - last.t >= 0.05) {
      game.points.push({ t: dt, m });
      if (game.points.length > 400) game.points.shift();
    }

    // update UI
    setMult(m);
    setStatus("Полёт", game.inRound ? (game.cashed ? "✅ Уже забрал" : "Можно забрать") : "Ты не в раунде");
    renderBetUI();

    // update sound
    updateEngine(m);

    // draw
    clearChart();
    drawCurveAndRocket();

    // crash check
    if (m >= game.crashPoint) {
      // freeze at crash point
      const finalMult = game.crashPoint;

      // push final point for clean end
      const tFinal = dt;
      game.points.push({ t: tFinal, m: finalMult });

      startCrash(finalMult);
      return;
    }

    game.raf = requestAnimationFrame(loop);
  };

  game.raf = requestAnimationFrame(loop);
}

/* ---------- Start ---------- */
function initDefaults() {
  if (elBetInput && !elBetInput.value) elBetInput.value = "100";
  clampBet();
  renderBetUI();
  renderBalance();
  setMult(1.0);
  setStatus("Ожидание", "Старт скоро");
  drawFrameStatic();
}

/* IMPORTANT:
   Autostart countdown immediately */
initDefaults();
startNewWait();
runCountdown();
