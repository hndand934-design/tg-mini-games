// app.js — Rocket Crash (v4) — только Crash режим

// ---------- RNG (честный, через crypto) ----------
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

// "Fair-ish" crash point: 1/(1-r), минимум 1.05
function genCrashPoint() {
  const r = randFloat();
  const v = 1 / (1 - Math.min(0.999999, Math.max(0.000001, r)));
  return Math.max(1.05, v);
}

// ---------- Telegram WebApp ----------
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// ---------- Wallet (local) ----------
const WALLET_KEY = "crash_wallet_v4";
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

// ---------- DOM helpers ----------
const $ = (id) => document.getElementById(id);

const el = {
  // top
  balance: $("balance"),            // баланс в правом верхнем углу
  // stats
  multValue: $("multValue"),        // "x1.00"
  multHint: $("multHint"),          // подпись под множителем
  statusValue: $("statusValue"),    // "Ожидание / Полёт / Краш"
  statusHint: $("statusHint"),      // подпись
  myBetValue: $("myBetValue"),      // "100 🪙" или "—"
  myBetHint: $("myBetHint"),        // подпись
  // inputs/buttons
  betInput: $("betInput"),
  btnMinus: $("btnMinus"),
  btnPlus: $("btnPlus"),
  btnJoin: $("btnJoin"),
  btnCash: $("btnCash"),
  btnBonus: $("btnBonus"),
  btnSound: $("btnSound"),
  // canvas
  canvas: $("crashCanvas"),
  centerTitle: $("centerTitle"),    // крупный текст в центре
  centerSub: $("centerSub"),        // мелкий текст в центре
};

function safeText(node, txt) {
  if (node) node.textContent = txt;
}
function safeDisabled(node, v) {
  if (node) node.disabled = !!v;
}

function renderTop() {
  if (el.balance) el.balance.textContent = `${wallet.coins} 🪙`;
}

renderTop();

// ---------- Audio (WebAudio) ----------
let audioOn = true;
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playStartSound() {
  if (!audioOn) return;
  ensureAudio();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(()=>{});

  const t0 = audioCtx.currentTime;

  // мягкий "взлёт": шум + тон вверх
  const noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.25, audioCtx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.35;

  const noise = audioCtx.createBufferSource();
  noise.buffer = noiseBuf;

  const noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = "highpass";
  noiseFilter.frequency.setValueAtTime(250, t0);
  noiseFilter.frequency.linearRampToValueAtTime(1100, t0 + 0.25);

  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(0.0, t0);
  noiseGain.gain.linearRampToValueAtTime(0.22, t0 + 0.03);
  noiseGain.gain.linearRampToValueAtTime(0.0, t0 + 0.25);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(audioCtx.destination);

  // тон
  const osc = audioCtx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(220, t0);
  osc.frequency.exponentialRampToValueAtTime(520, t0 + 0.25);

  const oscGain = audioCtx.createGain();
  oscGain.gain.setValueAtTime(0.0, t0);
  oscGain.gain.linearRampToValueAtTime(0.12, t0 + 0.03);
  oscGain.gain.linearRampToValueAtTime(0.0, t0 + 0.25);

  osc.connect(oscGain);
  oscGain.connect(audioCtx.destination);

  noise.start(t0);
  noise.stop(t0 + 0.25);

  osc.start(t0);
  osc.stop(t0 + 0.26);
}

function playCrashSound() {
  if (!audioOn) return;
  ensureAudio();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(()=>{});

  const t0 = audioCtx.currentTime;

  // "взрыв": короткий шум + низкий удар
  const noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.18, audioCtx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.7;

  const noise = audioCtx.createBufferSource();
  noise.buffer = noiseBuf;

  const bp = audioCtx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(200, t0);

  const ng = audioCtx.createGain();
  ng.gain.setValueAtTime(0.28, t0);
  ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);

  noise.connect(bp);
  bp.connect(ng);
  ng.connect(audioCtx.destination);

  const osc = audioCtx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(120, t0);
  osc.frequency.exponentialRampToValueAtTime(55, t0 + 0.18);

  const og = audioCtx.createGain();
  og.gain.setValueAtTime(0.22, t0);
  og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);

  osc.connect(og);
  og.connect(audioCtx.destination);

  noise.start(t0);
  noise.stop(t0 + 0.18);

  osc.start(t0);
  osc.stop(t0 + 0.19);
}

// кнопка звука
if (el.btnSound) {
  el.btnSound.addEventListener("click", () => {
    audioOn = !audioOn;
    el.btnSound.textContent = audioOn ? "Звук: on" : "Звук: off";
    // первый клик — чтобы браузер дал аудио
    if (audioOn) ensureAudio();
  });
}

// чтобы аудио разрешилось после любого клика
window.addEventListener("pointerdown", () => {
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") audioCtx.resume().catch(()=>{});
}, { once: true });

// ---------- Game state ----------
const PHASE = {
  WAIT: "wait",
  FLY: "fly",
  CRASH: "crash",
};

const game = {
  phase: PHASE.WAIT,
  waitLeft: 3,         // сек до старта
  roundStartAt: 0,     // timestamp
  t: 0,                // время полёта (сек)
  mult: 1.0,
  crashPoint: genCrashPoint(),
  inRound: false,
  bet: 0,
  cashed: false,
  cashedAt: 0,
  lastFrame: performance.now(),
};

function setStatusUI() {
  safeText(el.multValue, `x${game.mult.toFixed(2)}`);

  if (game.phase === PHASE.WAIT) {
    safeText(el.statusValue, "Ожидание");
    safeText(el.statusHint, `Старт через ${Math.ceil(game.waitLeft)}с`);
    safeText(el.multHint, "Новый раунд скоро");
  } else if (game.phase === PHASE.FLY) {
    safeText(el.statusValue, "Полёт");
    safeText(el.statusHint, "Можно забрать");
    safeText(el.multHint, "Ракета летит");
  } else {
    safeText(el.statusValue, "Краш");
    safeText(el.statusHint, "Раунд завершён");
    safeText(el.multHint, "Ракета улетела");
  }

  safeText(el.myBetValue, game.inRound ? `${game.bet} 🪙` : "—");
  safeText(el.myBetHint, game.inRound ? (game.cashed ? `Забрано x${game.cashedAt.toFixed(2)}` : "в раунде") : "не в раунде");

  // кнопки
  const canJoin = (game.phase === PHASE.WAIT);
  safeDisabled(el.btnJoin, !canJoin);

  const canCash = (game.phase === PHASE.FLY) && game.inRound && !game.cashed;
  safeDisabled(el.btnCash, !canCash);

  // центр-тексты
  if (el.centerTitle) safeText(el.centerTitle, `${game.mult.toFixed(2)}x`);
  if (el.centerSub) {
    if (game.phase === PHASE.WAIT) safeText(el.centerSub, `Старт через ${Math.ceil(game.waitLeft)}с`);
    else if (game.phase === PHASE.FLY) safeText(el.centerSub, game.inRound ? (game.cashed ? "Ты уже забрал" : "Ты в раунде") : "Ты не в раунде");
    else safeText(el.centerSub, `Краш на x${game.crashPoint.toFixed(2)}`);
  }
}

function clampBetInput() {
  if (!el.betInput) return 100;
  let v = Math.floor(Number(el.betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  el.betInput.value = String(v);
  return v;
}

// join
if (el.btnJoin) {
  el.btnJoin.addEventListener("click", () => {
    const bet = clampBetInput();
    if (bet <= 0) return;
    if (bet > wallet.coins) return alert("Недостаточно монет");
    game.inRound = true;
    game.bet = bet;
    game.cashed = false;
    game.cashedAt = 0;
    setStatusUI();
  });
}

// cash
if (el.btnCash) {
  el.btnCash.addEventListener("click", () => {
    if (!(game.phase === PHASE.FLY && game.inRound && !game.cashed)) return;
    game.cashed = true;
    game.cashedAt = game.mult;

    const payout = Math.floor(game.bet * game.mult);
    addCoins(payout);

    setStatusUI();
  });
}

// plus/minus
if (el.btnMinus) {
  el.btnMinus.addEventListener("click", () => {
    if (!el.betInput) return;
    el.betInput.value = String((Number(el.betInput.value) || 1) - 10);
    clampBetInput();
  });
}
if (el.btnPlus) {
  el.btnPlus.addEventListener("click", () => {
    if (!el.betInput) return;
    el.betInput.value = String((Number(el.betInput.value) || 1) + 10);
    clampBetInput();
  });
}
if (el.betInput) {
  el.betInput.addEventListener("input", clampBetInput);
}

// bonus
if (el.btnBonus) {
  el.btnBonus.addEventListener("click", () => addCoins(1000));
}

// ---------- Round control ----------
function startFlying() {
  game.phase = PHASE.FLY;
  game.t = 0;
  game.mult = 1.0;
  game.roundStartAt = performance.now();
  game.crashPoint = genCrashPoint();

  // списываем ставку только в момент старта
  if (game.inRound) {
    if (game.bet > wallet.coins) {
      // если вдруг баланс не позволяет — снимаем участие
      game.inRound = false;
      game.bet = 0;
      game.cashed = false;
      game.cashedAt = 0;
    } else {
      addCoins(-game.bet);
    }
  }

  playStartSound();
  setStatusUI();
}

function doCrash() {
  game.phase = PHASE.CRASH;

  // если был в раунде и не забрал — проиграл (ставка уже списана)
  // если забрал — ок
  playCrashSound();

  setStatusUI();

  // короткая пауза и новый раунд
  setTimeout(() => {
    game.phase = PHASE.WAIT;
    game.waitLeft = 3;
    game.mult = 1.0;
    game.t = 0;

    // сбрасываем участие (как обычно после раунда)
    game.inRound = false;
    game.bet = 0;
    game.cashed = false;
    game.cashedAt = 0;

    setStatusUI();
  }, 1400);
}

// ---------- Canvas render ----------
let ctx = null;
let dpr = 1;

function setupCanvas() {
  if (!el.canvas) return;
  ctx = el.canvas.getContext("2d");

  const rect = el.canvas.getBoundingClientRect();
  dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  el.canvas.width = Math.floor(rect.width * dpr);
  el.canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", () => setupCanvas());
setupCanvas();

// mapping: log-scale so rocket always stays inside
function normY(mult, crashPoint) {
  const m = Math.max(1, mult);
  const cp = Math.max(1.05, crashPoint);
  const y = Math.log(m) / Math.log(cp);
  return Math.max(0, Math.min(1, y));
}

// curve function (feel like "stake"): grows faster over time
function multFromTime(t) {
  // smooth growth curve
  return 1 + t * 0.85 + (t * t) * 0.12;
}

function drawGrid(w, h, pad) {
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.lineWidth = 1;

  const cols = 8;
  const rows = 5;

  for (let i = 0; i <= cols; i++) {
    const x = pad + (w - pad * 2) * (i / cols);
    ctx.beginPath();
    ctx.moveTo(x, pad);
    ctx.lineTo(x, h - pad);
    ctx.stroke();
  }
  for (let j = 0; j <= rows; j++) {
    const y = pad + (h - pad * 2) * (j / rows);
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - pad, y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawFilledCurve(w, h, pad, progress01) {
  // рисуем кривую от 0..progress01 и заливку под ней (как на Stake)
  const left = pad;
  const right = w - pad;
  const top = pad;
  const bottom = h - pad;

  const steps = 120;
  const pts = [];

  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * progress01;
    const x = left + (right - left) * a;

    // "виртуальное время" по оси X:
    // чтобы форма была похожа на crash — используем easing
    const tt = a * 6.2; // условные секунды для формы
    const m = multFromTime(tt);
    const yN = normY(m, 18); // форма внутри графика (визуально)
    const y = bottom - (bottom - top) * yN;

    pts.push({ x, y, a, m });
  }

  // fill polygon
  ctx.save();
  const grad = ctx.createLinearGradient(0, top, 0, bottom);
  grad.addColorStop(0, "rgba(255,90,107,.18)");
  grad.addColorStop(1, "rgba(255,90,107,0)");

  ctx.beginPath();
  ctx.moveTo(left, bottom);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.lineTo(left + (right - left) * progress01, bottom);
  ctx.closePath();

  ctx.fillStyle = grad;
  ctx.fill();

  // curve line (НЕ красная!)
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = "rgba(255,255,255,.85)";
  ctx.lineWidth = 2;
  ctx.shadowColor = "rgba(255,255,255,.18)";
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.restore();

  return pts; // вернём точки для ракеты
}

function drawRocket(px, py, angleRad) {
  // простая 2D ракета на canvas (приятнее чем emoji, стабильно везде)
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angleRad);

  // ограничим масштаб
  const s = 1.0;
  ctx.scale(s, s);

  // body
  ctx.fillStyle = "rgba(240,246,255,.95)";
  ctx.strokeStyle = "rgba(255,255,255,.35)";
  ctx.lineWidth = 1;

  // корпус
  ctx.beginPath();
  ctx.moveTo(-10, -6);
  ctx.quadraticCurveTo(8, -8, 12, 0);
  ctx.quadraticCurveTo(8, 8, -10, 6);
  ctx.quadraticCurveTo(-2, 0, -10, -6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // окно
  ctx.fillStyle = "rgba(90,140,255,.85)";
  ctx.beginPath();
  ctx.arc(2, 0, 3.2, 0, Math.PI * 2);
  ctx.fill();

  // крыло
  ctx.fillStyle = "rgba(255,90,107,.80)";
  ctx.beginPath();
  ctx.moveTo(-5, 4);
  ctx.lineTo(-12, 10);
  ctx.lineTo(-2, 7);
  ctx.closePath();
  ctx.fill();

  // пламя
  ctx.fillStyle = "rgba(255,165,70,.95)";
  ctx.beginPath();
  ctx.moveTo(-10, 0);
  ctx.quadraticCurveTo(-18, 0, -22, 0);
  ctx.quadraticCurveTo(-18, -4, -12, -2);
  ctx.quadraticCurveTo(-16, 0, -12, 2);
  ctx.quadraticCurveTo(-18, 4, -22, 0);
  ctx.closePath();
  ctx.globalAlpha = 0.85;
  ctx.fill();

  ctx.restore();
}

// main draw
function renderCanvas() {
  if (!ctx || !el.canvas) return;

  const rect = el.canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  const pad = 18;

  // grid
  drawGrid(w, h, pad);

  // progress of "visual curve" (0..1)
  // During WAIT: show a tiny start segment; During FLY: progress grows with time; During CRASH: freeze at end.
  let prog = 0.06;
  if (game.phase === PHASE.FLY) {
    // scale time to progress; longer rounds progress further
    // use crashPoint to adjust: higher crash -> slower progress visually
    const cp = Math.min(120, Math.max(1.05, game.crashPoint));
    const k = 1 / (2.2 + Math.log(cp)); // higher cp => smaller k
    prog = Math.min(1, 0.06 + game.t * k);
  } else if (game.phase === PHASE.CRASH) {
    prog = 1;
  } else {
    // WAIT
    prog = 0.06;
  }

  const pts = drawFilledCurve(w, h, pad, prog);

  // rocket position: use actual multiplier log-mapped to always stay inside
  // choose progress x from time to crash, and y from mult
  const left = pad;
  const right = w - pad;
  const top = pad;
  const bottom = h - pad;

  let x01 = prog;
  let y01 = 0;

  if (game.phase === PHASE.FLY) {
    const cp = Math.max(1.05, game.crashPoint);
    // x grows smoothly
    x01 = Math.min(1, 0.06 + game.t * (1 / (2.2 + Math.log(cp))));
    // y from multiplier, clamped by log mapping against crashPoint so never выходит
    y01 = normY(game.mult, cp);
  } else if (game.phase === PHASE.WAIT) {
    x01 = 0.06;
    y01 = 0;
  } else {
    x01 = 1;
    y01 = 1;
  }

  const rx = left + (right - left) * x01;
  const ry = bottom - (bottom - top) * y01;

  // angle based on local slope (use neighbor points on curve if possible)
  // but do NOT allow rocket to tilt down after 20x; keep upward with clamp
  let angle = -Math.PI / 6; // default 30deg up
  if (pts && pts.length >= 2) {
    // find point near rx
    let idx = Math.floor((pts.length - 1) * Math.min(1, Math.max(0, x01 / Math.max(0.0001, prog))));
    idx = Math.max(1, Math.min(pts.length - 1, idx));
    const p0 = pts[idx - 1];
    const p1 = pts[idx];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    angle = Math.atan2(dy, dx);

    // ракета должна "вверх по графику": угол вверх => отрицательный dy (в canvas вверх -dy)
    // ограничим угол, чтобы не заваливалась
    const minAng = -Math.PI * 0.05; // почти горизонтально вверх-вправо
    const maxAng = -Math.PI * 0.55; // круто вверх
    // angle обычно отрицательный (подъём). Если вдруг стал положительным (вниз) — фикс
    if (angle > minAng) angle = minAng;
    if (angle < maxAng) angle = maxAng;

    // если множитель большой — не давать "перекручивать"
    if (game.mult >= 20) {
      const cap = -Math.PI * 0.18; // не слишком вертикально
      if (angle < -Math.PI * 0.50) angle = -Math.PI * 0.50;
      if (angle > cap) angle = cap;
    }
  }

  drawRocket(rx, ry, angle);
}

// ---------- Main loop ----------
function tick(now) {
  const dt = Math.min(0.08, Math.max(0, (now - game.lastFrame) / 1000));
  game.lastFrame = now;

  if (game.phase === PHASE.WAIT) {
    game.waitLeft -= dt;
    game.mult = 1.0;
    if (game.waitLeft <= 0) startFlying();
  } else if (game.phase === PHASE.FLY) {
    game.t += dt;

    // compute multiplier
    const m = multFromTime(game.t);
    game.mult = m;

    // crash?
    if (game.mult >= game.crashPoint) {
      game.mult = game.crashPoint;
      // если пользователь в раунде и не забрал — проигрыш (ничего делать не надо, ставка уже списана)
      doCrash();
    }
  } else {
    // PHASE.CRASH — ждём таймер в doCrash()
  }

  setStatusUI();
  renderCanvas();
  requestAnimationFrame(tick);
}

setStatusUI();
requestAnimationFrame((t) => {
  game.lastFrame = t;
  requestAnimationFrame(tick);
});
