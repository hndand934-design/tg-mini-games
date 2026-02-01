// ===============================
// Rocket Crash — ONLY режим (GitHub Pages)
// - Ракета ВСЕГДА внутри графика (автоскейл)
// - Без истории/логов
// - Приятный звук: взлёт / полёт / краш (WebAudio)
// ===============================

// ---------- RNG ----------
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

// ---------- Telegram ----------
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}
const user = tg?.initDataUnsafe?.user;

// ---------- Wallet (local) ----------
const WALLET_KEY = "rocket_wallet_v2";
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
function addCoins(d) { setCoins(wallet.coins + d); }

// ---------- DOM ----------
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

const betInput = $("betInput");
const joinBtn = $("joinBtn");
const cashBtn = $("cashBtn");
const bonusBtn = $("bonusBtn");
const soundBtn = $("soundBtn");

const canvas = $("chart");
const ctx = canvas.getContext("2d");

// ---------- UI ----------
function renderTop() {
  balanceText.textContent = `🪙 ${wallet.coins}`;
  userText.textContent = user
    ? `Привет, ${user.first_name}`
    : `Открыто вне Telegram`;
}
renderTop();

// ---------- Resize canvas (HiDPI) ----------
function resizeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(300, Math.floor(rect.width));
  const h = Math.max(220, Math.floor(rect.height));
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
}
window.addEventListener("resize", () => {
  resizeCanvas();
  draw();
});

// ---------- Game state ----------
const PHASE = {
  WAIT: "wait",   // ожидание/отсчёт
  FLY: "fly",     // полёт
  CRASH: "crash"  // краш/итог
};

let state = {
  phase: PHASE.WAIT,
  waitLeft: 3,        // секунды до старта
  startAt: 0,

  t: 0,               // время полёта, сек
  mult: 1.0,
  crashPoint: 1.5,    // будет пересчитан
  crashed: false,

  // ставка игрока
  bet: 100,
  joined: false,
  joinedBet: 0,
  cashed: false,

  // график
  points: [],         // {t, m}
};

function clampBetToBalance() {
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  return v;
}

// ---------- Fair-ish crash point (скрыто) ----------
function genCrashPoint() {
  // классическая формула ~ 1/(1-r), ограничим разумно
  const r = Math.max(0.000001, Math.min(0.999999, randFloat()));
  const raw = 1 / (1 - r);
  // слегка "приземлим" редкие огромные значения
  const capped = Math.min(raw, 200);
  return Math.max(1.05, capped);
}

// ---------- WebAudio (Sound) ----------
let audio = {
  enabled: false,
  ctx: null,
  master: null,
  engineOsc: null,
  engineGain: null,
  windOsc: null,
  windGain: null,
  _started: false,
};

function ensureAudio() {
  if (audio.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  audio.ctx = new AC();
  audio.master = audio.ctx.createGain();
  audio.master.gain.value = 0.0; // включим при enabled
  audio.master.connect(audio.ctx.destination);
}

function setSoundEnabled(on) {
  ensureAudio();
  audio.enabled = on;
  audio.master.gain.setTargetAtTime(on ? 0.8 : 0.0, audio.ctx.currentTime, 0.03);
  soundBtn.textContent = `Звук: ${on ? "on" : "off"}`;
}

function beepLaunch() {
  if (!audio.enabled) return;
  const t0 = audio.ctx.currentTime;

  const o = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(140, t0);
  o.frequency.exponentialRampToValueAtTime(480, t0 + 0.25);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);

  // лёгкий фильтр (приятнее)
  const lp = audio.ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(900, t0);
  lp.frequency.exponentialRampToValueAtTime(1800, t0 + 0.25);

  o.connect(lp);
  lp.connect(g);
  g.connect(audio.master);

  o.start(t0);
  o.stop(t0 + 0.36);
}

function startEngine() {
  if (!audio.enabled) return;
  const t0 = audio.ctx.currentTime;

  // Основной "двигатель"
  const osc = audio.ctx.createOscillator();
  const gain = audio.ctx.createGain();
  const lp = audio.ctx.createBiquadFilter();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(90, t0);

  lp.type = "lowpass";
  lp.frequency.setValueAtTime(600, t0);

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.25);

  osc.connect(lp);
  lp.connect(gain);
  gain.connect(audio.master);

  osc.start(t0);

  // "Ветер" (мягкий шум через osc+filter как псевдо-noise)
  const wind = audio.ctx.createOscillator();
  const wg = audio.ctx.createGain();
  const hp = audio.ctx.createBiquadFilter();

  wind.type = "sawtooth";
  wind.frequency.setValueAtTime(40, t0);

  hp.type = "highpass";
  hp.frequency.setValueAtTime(180, t0);

  wg.gain.setValueAtTime(0.0001, t0);
  wg.gain.exponentialRampToValueAtTime(0.09, t0 + 0.3);

  wind.connect(hp);
  hp.connect(wg);
  wg.connect(audio.master);

  wind.start(t0);

  audio.engineOsc = osc;
  audio.engineGain = gain;
  audio.windOsc = wind;
  audio.windGain = wg;
}

function updateEngine(mult) {
  if (!audio.enabled) return;
  if (!audio.engineOsc || !audio.engineGain) return;

  const t = audio.ctx.currentTime;
  // чем больше множитель — тем выше тон и громкость, но мягко
  const f = 90 + Math.min(260, (mult - 1) * 18);
  audio.engineOsc.frequency.setTargetAtTime(f, t, 0.08);

  const engVol = 0.22 + Math.min(0.16, (mult - 1) * 0.012);
  audio.engineGain.gain.setTargetAtTime(engVol, t, 0.12);

  const windF = 40 + Math.min(120, (mult - 1) * 6);
  audio.windOsc.frequency.setTargetAtTime(windF, t, 0.12);

  const windVol = 0.09 + Math.min(0.11, (mult - 1) * 0.006);
  audio.windGain.gain.setTargetAtTime(windVol, t, 0.18);
}

function stopEngine() {
  if (!audio.engineOsc) return;
  const t = audio.ctx.currentTime;
  audio.engineGain.gain.setTargetAtTime(0.0001, t, 0.05);
  audio.windGain.gain.setTargetAtTime(0.0001, t, 0.05);

  // стоп чуть позже, чтобы не щёлкало
  audio.engineOsc.stop(t + 0.12);
  audio.windOsc.stop(t + 0.12);

  audio.engineOsc = null;
  audio.engineGain = null;
  audio.windOsc = null;
  audio.windGain = null;
}

function crashBoom() {
  if (!audio.enabled) return;
  const t0 = audio.ctx.currentTime;

  const o = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();
  const lp = audio.ctx.createBiquadFilter();

  o.type = "square";
  o.frequency.setValueAtTime(180, t0);
  o.frequency.exponentialRampToValueAtTime(60, t0 + 0.28);

  lp.type = "lowpass";
  lp.frequency.setValueAtTime(700, t0);

  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.45, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);

  o.connect(lp);
  lp.connect(g);
  g.connect(audio.master);

  o.start(t0);
  o.stop(t0 + 0.34);
}

// ---------- Controls ----------
document.querySelectorAll(".chip").forEach((b) => {
  b.addEventListener("click", () => {
    const val = b.dataset.bet;
    if (val === "max") {
      betInput.value = String(wallet.coins);
    } else {
      betInput.value = String(val);
    }
    clampBetToBalance();
    syncBetStateText();
  });
});

$("betMinus").onclick = () => {
  betInput.value = String((Number(betInput.value) || 1) - 10);
  clampBetToBalance();
  syncBetStateText();
};
$("betPlus").onclick = () => {
  betInput.value = String((Number(betInput.value) || 1) + 10);
  clampBetToBalance();
  syncBetStateText();
};
betInput.oninput = () => {
  clampBetToBalance();
  syncBetStateText();
};

bonusBtn.onclick = () => addCoins(1000);

soundBtn.onclick = async () => {
  ensureAudio();
  // важно: резюм контекста только по клику
  if (audio.ctx.state === "suspended") await audio.ctx.resume();
  setSoundEnabled(!audio.enabled);
};

// ---------- Betting logic ----------
function syncBetStateText() {
  const bet = clampBetToBalance();
  state.bet = bet;

  if (!state.joined) {
    myBetText.textContent = "—";
    myStateText.textContent = "не в раунде";
  } else {
    myBetText.textContent = `${state.joinedBet} 🪙`;
    myStateText.textContent = state.phase === PHASE.FLY ? "в раунде" : "ждёшь старт";
  }
}

joinBtn.onclick = () => {
  const bet = clampBetToBalance();
  if (bet <= 0) return;

  if (state.phase !== PHASE.WAIT) {
    // Вход только в ожидании
    pulseHint("Вход закрыт. Жди следующий раунд.");
    return;
  }
  if (state.joined) {
    pulseHint("Ты уже в раунде.");
    return;
  }
  if (bet > wallet.coins) {
    pulseHint("Недостаточно монет.");
    return;
  }

  addCoins(-bet);
  state.joined = true;
  state.joinedBet = bet;
  state.cashed = false;

  syncBetStateText();
  pulseHint(`Вошёл в раунд: ставка ${bet} 🪙`);
};

cashBtn.onclick = () => {
  if (state.phase !== PHASE.FLY) return;
  if (!state.joined || state.cashed) return;

  state.cashed = true;
  state.phase = PHASE.CRASH; // фиксируем раунд как завершенный для игрока
  stopEngine();

  const payout = Math.floor(state.joinedBet * state.mult);
  addCoins(payout);

  statusText.textContent = "Забрал";
  countText.textContent = `+${payout} 🪙`;
  myStateText.textContent = "вышел";
  cashBtn.disabled = true;
  joinBtn.disabled = true;

  // через чуть-чуть перейдём к ожиданию следующего раунда
  setTimeout(() => newRound(), 900);
};

// ---------- Hints (без истории) ----------
let hintTimer = null;
function pulseHint(msg) {
  const el = $("betHint");
  el.textContent = msg;
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(() => (el.textContent = "Монеты виртуальные, без вывода."), 1800);
}

// ---------- Round flow ----------
let rafId = null;
let lastFrame = 0;

function newRound() {
  state.phase = PHASE.WAIT;
  state.waitLeft = 3; // коротко, чтобы не бесило
  state.startAt = performance.now();

  state.t = 0;
  state.mult = 1.0;
  state.crashPoint = genCrashPoint();
  state.crashed = false;

  state.points = [{ t: 0, m: 1.0 }];

  // игрок остаётся joined, если вошёл — иначе нет
  if (state.joined) {
    // он уже оплатил ставку, ждёт старт
    state.cashed = false;
  } else {
    state.joinedBet = 0;
  }

  joinBtn.disabled = false;
  cashBtn.disabled = true;

  renderTexts();
  draw();
}

function startFly() {
  state.phase = PHASE.FLY;
  state.t = 0;
  state.mult = 1.0;
  state.points = [{ t: 0, m: 1.0 }];
  lastFrame = performance.now();

  if (audio.enabled) {
    beepLaunch();
    startEngine();
  }

  renderTexts();
  loop();
}

function crashEnd() {
  state.phase = PHASE.CRASH;
  state.crashed = true;

  stopEngine();
  crashBoom();

  // если игрок был в раунде и НЕ успел забрать — проигрыш
  if (state.joined && !state.cashed) {
    myStateText.textContent = "проиграл";
  }

  renderTexts();
  draw();

  setTimeout(() => {
    // после краша игрок выходит из раунда автоматически
    state.joined = false;
    state.joinedBet = 0;
    state.cashed = false;
    syncBetStateText();
    newRound();
  }, 1400);
}

// ---------- Multiplier curve ----------
function computeMultiplier(t) {
  // мягкая кривая роста (как crash-игры)
  // mult = 1 + a*t + b*t^2
  const a = 0.75;
  const b = 0.12;
  return 1 + a * t + b * t * t;
}

// ---------- Main loop ----------
function loop() {
  cancelAnimationFrame(rafId);

  rafId = requestAnimationFrame(() => {
    if (state.phase !== PHASE.FLY) return;

    const now = performance.now();
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    state.t += dt;
    state.mult = computeMultiplier(state.t);

    // добавляем точки реже, чтобы красиво и не тяжело
    const last = state.points[state.points.length - 1];
    if (!last || state.t - last.t >= 0.06) {
      state.points.push({ t: state.t, m: state.mult });
    }

    if (audio.enabled) updateEngine(state.mult);

    // crash?
    if (state.mult >= state.crashPoint) {
      state.mult = state.crashPoint;
      state.points.push({ t: state.t, m: state.mult });
      crashEnd();
      return;
    }

    renderTexts();
    draw();
    loop();
  });
}

// ---------- Render texts/buttons ----------
function renderTexts() {
  multText.textContent = `x${state.mult.toFixed(2)}`;

  if (state.phase === PHASE.WAIT) {
    statusText.textContent = "Ожидание";
    const elapsed = (performance.now() - state.startAt) / 1000;
    const left = Math.max(0, state.waitLeft - elapsed);
    countText.textContent = `Старт через ${Math.ceil(left)}с`;
    phaseHint.textContent = "Новый раунд скоро";

    centerBig.textContent = "1.00x";
    centerSmall.textContent = `Ожидание следующего раунда (${Math.ceil(left)}с)`;

    joinBtn.textContent = state.joined ? "В раунде (ждёшь)" : "Войти в раунд";
    joinBtn.disabled = false;
    cashBtn.disabled = true;

  } else if (state.phase === PHASE.FLY) {
    statusText.textContent = "Полёт";
    countText.textContent = "Можно забрать";
    phaseHint.textContent = "Ракета летит…";

    centerBig.textContent = `${state.mult.toFixed(2)}x`;
    centerSmall.textContent = state.joined ? "Ты в раунде" : "Ты не в раунде";

    joinBtn.textContent = "Вход закрыт";
    joinBtn.disabled = true;

    cashBtn.disabled = !(state.joined && !state.cashed);
    cashBtn.textContent = state.joined && !state.cashed ? "Забрать" : "—";

  } else {
    statusText.textContent = "Краш";
    countText.textContent = `x${state.mult.toFixed(2)}`;
    phaseHint.textContent = "Раунд завершён";

    centerBig.textContent = `${state.mult.toFixed(2)}x`;
    centerSmall.textContent = "Ракета улетела";

    joinBtn.disabled = true;
    cashBtn.disabled = true;
  }

  if (!state.joined) {
    myBetText.textContent = "—";
    myStateText.textContent = "не в раунде";
  } else {
    myBetText.textContent = `${state.joinedBet} 🪙`;
    myStateText.textContent =
      state.phase === PHASE.FLY ? (state.cashed ? "вышел" : "в раунде") : "ждёшь старт";
  }
}

// ---------- Drawing helpers ----------
function roundedRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function lerp(a, b, t) { return a + (b - a) * t; }

// ---------- Rocket sprite (2D) ----------
function drawRocket(ctx, x, y, angleRad, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angleRad);
  ctx.scale(scale, scale);

  // корпус
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = "rgba(245,248,255,0.92)";
  ctx.strokeStyle = "rgba(255,255,255,0.20)";
  ctx.lineWidth = 1;

  // тело
  roundedRectPath(ctx, -10, -22, 20, 44, 10);
  ctx.fill();
  ctx.stroke();

  // иллюминатор
  ctx.fillStyle = "rgba(30,80,170,0.35)";
  ctx.beginPath();
  ctx.arc(0, -4, 6, 0, Math.PI * 2);
  ctx.fill();

  // нос
  ctx.fillStyle = "rgba(235,240,255,0.95)";
  ctx.beginPath();
  ctx.moveTo(-10, -22);
  ctx.lineTo(0, -36);
  ctx.lineTo(10, -22);
  ctx.closePath();
  ctx.fill();

  // крылья
  ctx.fillStyle = "rgba(255,90,90,0.55)";
  ctx.beginPath();
  ctx.moveTo(-10, 6);
  ctx.lineTo(-22, 16);
  ctx.lineTo(-10, 16);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(10, 6);
  ctx.lineTo(22, 16);
  ctx.lineTo(10, 16);
  ctx.closePath();
  ctx.fill();

  // огонь
  ctx.globalAlpha = 0.85;
  const flame = ctx.createLinearGradient(0, 22, 0, 44);
  flame.addColorStop(0, "rgba(255,230,140,0.95)");
  flame.addColorStop(0.5, "rgba(255,130,60,0.75)");
  flame.addColorStop(1, "rgba(255,60,60,0.0)");
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.moveTo(-6, 22);
  ctx.quadraticCurveTo(0, 34, 6, 22);
  ctx.quadraticCurveTo(0, 48, -6, 22);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// ---------- Draw chart ----------
function draw() {
  resizeCanvas();

  const w = canvas.getBoundingClientRect().width;
  const h = canvas.getBoundingClientRect().height;

  // panel background
  ctx.clearRect(0, 0, w, h);

  // background gradient
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "rgba(10,18,40,0.85)");
  bg.addColorStop(1, "rgba(7,12,28,0.85)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // grid area padding
  const pad = 16;
  const gx = pad, gy = pad, gw = w - pad * 2, gh = h - pad * 2;

  // inner border
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  roundedRectPath(ctx, gx, gy, gw, gh, 12);
  ctx.stroke();

  // grid
  ctx.save();
  ctx.beginPath();
  roundedRectPath(ctx, gx, gy, gw, gh, 12);
  ctx.clip();

  const gridCols = 7;
  const gridRows = 5;
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  for (let i = 1; i < gridCols; i++) {
    const x = gx + (gw * i) / gridCols;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x, gy + gh);
    ctx.stroke();
  }
  for (let j = 1; j < gridRows; j++) {
    const y = gy + (gh * j) / gridRows;
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.lineTo(gx + gw, y);
    ctx.stroke();
  }

  // ---------- autoscale so rocket never leaves chart ----------
  const pts = state.points.length ? state.points : [{ t: 0, m: 1 }];
  const maxT = Math.max(1.6, pts[pts.length - 1].t); // по времени
  const maxM = Math.max(2.2, pts[pts.length - 1].m); // по множителю

  // даём "воздух", чтобы не прижималось к краю
  const tMax = maxT * 1.05;
  const mMax = maxM * 1.08;

  // mapping: t -> x ; m -> y (inverted)
  function X(t) {
    return gx + (t / tMax) * gw;
  }
  function Y(m) {
    const clamped = Math.min(mMax, Math.max(1, m));
    const norm = (clamped - 1) / (mMax - 1);
    return gy + gh - norm * gh;
  }

  // line path
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const grad = ctx.createLinearGradient(gx, gy + gh, gx + gw, gy);
  grad.addColorStop(0, "rgba(255,80,80,0.0)");
  grad.addColorStop(0.25, "rgba(255,90,90,0.65)");
  grad.addColorStop(1, "rgba(255,110,110,0.95)");
  ctx.strokeStyle = grad;

  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const x = X(p.t);
    const y = Y(p.m);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // soft fill under curve (like crash games)
  ctx.globalAlpha = 0.22;
  const fillGrad = ctx.createLinearGradient(gx, gy, gx, gy + gh);
  fillGrad.addColorStop(0, "rgba(255,90,90,0.45)");
  fillGrad.addColorStop(1, "rgba(255,90,90,0.0)");
  ctx.fillStyle = fillGrad;
  ctx.beginPath();
  ctx.moveTo(X(pts[0].t), gy + gh);
  for (let i = 0; i < pts.length; i++) {
    ctx.lineTo(X(pts[i].t), Y(pts[i].m));
  }
  ctx.lineTo(X(pts[pts.length - 1].t), gy + gh);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // rocket at last point (ALWAYS inside square)
  const last = pts[pts.length - 1];
  const rx = X(last.t);
  const ry = Y(last.m);

  // angle based on recent slope
  let ang = -Math.PI / 6;
  if (pts.length >= 2) {
    const p0 = pts[Math.max(0, pts.length - 6)];
    const dx = X(last.t) - X(p0.t);
    const dy = Y(last.m) - Y(p0.m);
    ang = Math.atan2(dy, dx);
  }

  // clamp rocket position to inside padding (so it never clips)
  const margin = 22;
  const crx = Math.min(gx + gw - margin, Math.max(gx + margin, rx));
  const cry = Math.min(gy + gh - margin, Math.max(gy + margin, ry));

  // small glow
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "rgba(255,160,120,0.35)";
  ctx.beginPath();
  ctx.arc(crx, cry, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawRocket(ctx, crx, cry, ang, 0.95);

  ctx.restore();
}

// ---------- Timer for WAIT phase ----------
let waitTimer = null;

function tickWait() {
  const elapsed = (performance.now() - state.startAt) / 1000;
  const left = Math.max(0, state.waitLeft - elapsed);

  // обновляем текст и рисуем
  renderTexts();
  draw();

  if (left <= 0) {
    clearInterval(waitTimer);
    waitTimer = null;
    startFly();
  }
}

// ---------- Init / start ----------
function start() {
  // init bet
  clampBetToBalance();
  syncBetStateText();

  resizeCanvas();

  // стартуем первый раунд
  newRound();

  // запускаем таймер ожидания
  if (waitTimer) clearInterval(waitTimer);
  waitTimer = setInterval(tickWait, 200);
}

function newRound() {
  state.phase = PHASE.WAIT;
  state.waitLeft = 3;
  state.startAt = performance.now();

  state.t = 0;
  state.mult = 1.0;
  state.crashPoint = genCrashPoint();
  state.crashed = false;

  state.points = [{ t: 0, m: 1.0 }];

  joinBtn.disabled = false;
  cashBtn.disabled = true;

  renderTexts();
  draw();
}

// ---------- Boot ----------
start();
