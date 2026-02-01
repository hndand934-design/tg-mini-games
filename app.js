// =====================
// Rocket Crash (solo mode) v7
// Works with index.html + style.css (v7)
// =====================

// --- RNG (честный) ---
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function randInt(min, max) {
  return Math.floor(randFloat() * (max - min + 1)) + min;
}

// --- Telegram WebApp ---
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// --- Wallet (local) ---
const WALLET_KEY = "rocket_wallet_v7";
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
  renderHeader();
}
function addCoins(d) {
  setCoins(wallet.coins + d);
}

// --- DOM refs ---
const $ = (id) => document.getElementById(id);

const userLine = $("userLine");
const balanceEl = $("balance");

const multText = $("multText");
const centerMult = $("centerMult");
const centerMsg = $("centerMsg");

const phaseText = $("phaseText");
const roundText = $("roundText");
const countdownText = $("countdownText");

const myBetText = $("myBetText");
const myStatusText = $("myStatusText");

const soundBtn = $("soundBtn");
const soundState = $("soundState");

const bonusBtn = $("bonusBtn");
const betInput = $("betInput");
const betMinus = $("betMinus");
const betPlus = $("betPlus");
const joinBtn = $("joinBtn");
const cashBtn = $("cashBtn");
const panelHint = $("panelHint");
const chipsWrap = $("chips");

const linePath = $("linePath");
const areaPath = $("areaPath");
const rocketEl = $("rocket");

// --- user line ---
const user = tg?.initDataUnsafe?.user;
function renderHeader() {
  const coins = wallet.coins;
  if (user) userLine.textContent = `Привет, ${user.first_name}`;
  else userLine.textContent = `Открыто вне Telegram`;
  balanceEl.textContent = String(coins);
}
renderHeader();

// --- sound toggle (stub, no audio files) ---
let soundOn = false;
function updateSoundUI() {
  soundState.textContent = soundOn ? "on" : "off";
}
updateSoundUI();
soundBtn?.addEventListener("click", () => {
  soundOn = !soundOn;
  updateSoundUI();
});

// --- Bet input helpers ---
function clampBet() {
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  return v;
}
function setBet(v) {
  betInput.value = String(v);
  clampBet();
}
betInput.addEventListener("input", clampBet);
betMinus.addEventListener("click", () => setBet((Number(betInput.value) || 1) - 10));
betPlus.addEventListener("click", () => setBet((Number(betInput.value) || 1) + 10));

chipsWrap.querySelectorAll(".chip").forEach((b) => {
  b.addEventListener("click", () => {
    chipsWrap.querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    const val = b.dataset.bet;
    if (val === "max") setBet(wallet.coins);
    else setBet(Number(val));
  });
});

bonusBtn.addEventListener("click", () => addCoins(1000));

// --- Crash math ---
// "tail" distribution similar to 1/(1-r), clamped.
function sampleCrashPoint() {
  // r in (0,1)
  const r = Math.min(0.999999, Math.max(0.000001, randFloat()));
  // heavy tail:
  let x = 1 / (1 - r); // 1..inf
  // clamp for UI sanity
  x = Math.min(x, 200);
  // small minimum
  x = Math.max(x, 1.05);
  return x;
}

// Multiplier growth curve (smooth, accelerating)
function multAtTime(t) {
  // tuned: starts gentle then accelerates
  // (keeps it close to typical crash feel)
  return 1 + t * 0.85 + t * t * 0.11;
}

// --- Game state ---
const PHASES = {
  WAIT: "WAIT",
  FLY: "FLY",
  CRASH: "CRASH",
};

let state = {
  roundId: 1,
  phase: PHASES.WAIT,
  waitLeft: 3.0,       // seconds
  t: 0,                // flight time
  mult: 1.0,
  crashPoint: sampleCrashPoint(),

  // player
  inRound: false,
  bet: 0,
  joined: false,
  cashed: false,
  cashMult: null,

  // visuals
  rocketVisible: true,
};

let raf = null;
let lastTs = null;

// --- Chart path building ---
const VIEW_W = 1000;
const VIEW_H = 520;

// Map multiplier to chart y (bigger mult => higher => smaller y)
function multToY(mult) {
  // We want x1 at bottom, x ~ 10 near top.
  // Use log scale feel.
  const m = Math.max(1, mult);
  const norm = Math.log(m) / Math.log(12); // ~ 0..1 around 12x
  const y = VIEW_H - (norm * (VIEW_H - 40)) - 30; // keep margins
  return Math.max(30, Math.min(VIEW_H - 20, y));
}

// Map time to X
function tToX(t) {
  // Cap at 14s for full width; longer just clamps
  const maxT = 14;
  const x = (Math.min(t, maxT) / maxT) * (VIEW_W - 80) + 40;
  return Math.max(40, Math.min(VIEW_W - 40, x));
}

// Create SVG path "M x0 y0 L ..."
function buildPaths(points) {
  if (!points.length) {
    linePath.setAttribute("d", "");
    areaPath.setAttribute("d", "");
    return;
  }
  const dLine = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");

  // area: go down to bottom, back to start
  const last = points[points.length - 1];
  const first = points[0];
  const dArea =
    dLine +
    ` L ${last.x.toFixed(2)} ${VIEW_H.toFixed(2)}` +
    ` L ${first.x.toFixed(2)} ${VIEW_H.toFixed(2)}` +
    " Z";

  linePath.setAttribute("d", dLine);
  areaPath.setAttribute("d", dArea);
}

// Place rocket using chart box metrics
function placeRocketOnPoint(x, y, angleDeg = 18) {
  // Convert SVG view coords to CSS pixels inside .chart element
  const svg = linePath.ownerSVGElement;
  if (!svg) return;

  const rect = svg.getBoundingClientRect();
  const sx = rect.width / VIEW_W;
  const sy = rect.height / VIEW_H;

  const px = rect.left + x * sx;
  const py = rect.top + y * sy;

  rocketEl.style.left = `${px}px`;
  rocketEl.style.top = `${py}px`;
  rocketEl.style.transform = `translate(-50%,-50%) rotate(${angleDeg}deg)`;
}

// Hide/show rocket
function setRocketVisible(v) {
  state.rocketVisible = v;
  rocketEl.style.display = v ? "block" : "none";
}

// --- UI rendering ---
function renderUI() {
  // top stats
  multText.textContent = `x${state.mult.toFixed(2)}`;
  centerMult.textContent = `${state.mult.toFixed(2)}x`;

  roundText.textContent = String(state.roundId);

  myBetText.textContent = state.inRound ? `${state.bet} 🪙` : "—";
  myStatusText.textContent = state.inRound
    ? (state.cashed ? `забрал на x${state.cashMult.toFixed(2)}` : "в раунде")
    : "не в раунде";

  // phase labels
  if (state.phase === PHASES.WAIT) {
    phaseText.textContent = "Ожидание — старт скоро";
    countdownText.textContent = `Старт через ${Math.max(0, state.waitLeft).toFixed(0)}с`;
    centerMsg.textContent = "Ожидание следующего раунда";
  } else if (state.phase === PHASES.FLY) {
    phaseText.textContent = "Полёт...";
    countdownText.textContent = "Идёт раунд";
    centerMsg.textContent = state.inRound
      ? "В полёте можно забрать в любой момент"
      : "Ты не в раунде";
  } else {
    phaseText.textContent = "Краш!";
    countdownText.textContent = "Новый раунд скоро";
    centerMsg.textContent = state.cashed ? "✅ Ты забрал" : "💥 Раунд завершён";
  }

  // buttons
  const canJoin = state.phase === PHASES.WAIT && !state.inRound;
  joinBtn.disabled = !canJoin;
  joinBtn.textContent = state.inRound ? "Ты в раунде" : "Войти в раунд";

  const canCash = state.phase === PHASES.FLY && state.inRound && !state.cashed;
  cashBtn.disabled = !canCash;

  panelHint.textContent =
    state.phase === PHASES.WAIT
      ? "Войти можно только до старта (ожидание). После старта вход закрыт."
      : (state.phase === PHASES.FLY
          ? "В полёте можно забрать в любой момент. Вход в раунд уже закрыт."
          : "Раунд завершён. Ждём следующий.");

  // rocket visibility rules
  if (state.phase === PHASES.WAIT) setRocketVisible(true);
  if (state.phase === PHASES.FLY) setRocketVisible(true);
  // in CRASH phase rocket may be hidden already (after fly-out)
}

// --- Actions ---
function joinRound() {
  if (state.phase !== PHASES.WAIT) return;
  if (state.inRound) return;

  const bet = clampBet();
  if (bet <= 0) return;
  if (bet > wallet.coins) {
    alert("Недостаточно монет");
    return;
  }

  addCoins(-bet);
  state.inRound = true;
  state.bet = bet;
  state.cashed = false;
  state.cashMult = null;

  renderUI();
}

function cashOut() {
  if (state.phase !== PHASES.FLY) return;
  if (!state.inRound || state.cashed) return;

  state.cashed = true;
  state.cashMult = state.mult;

  const payout = Math.floor(state.bet * state.cashMult);
  addCoins(payout);

  renderUI();
}

joinBtn.addEventListener("click", joinRound);
cashBtn.addEventListener("click", cashOut);

// --- Main loop ---
let points = []; // {x,y}
function resetRound() {
  state.roundId += 1;
  state.phase = PHASES.WAIT;
  state.waitLeft = 3.0;

  state.t = 0;
  state.mult = 1.0;
  state.crashPoint = sampleCrashPoint();

  // reset player (only "joined" state should be cleared after crash)
  state.inRound = false;
  state.bet = 0;
  state.cashed = false;
  state.cashMult = null;

  // visuals
  points = [];
  buildPaths(points);
  setRocketVisible(true);

  renderUI();
}

function startRound() {
  state.phase = PHASES.FLY;
  state.t = 0;
  state.mult = 1.0;
  points = [];

  // initialize first point
  const x0 = tToX(0);
  const y0 = multToY(1.0);
  points.push({ x: x0, y: y0 });
  buildPaths(points);
  placeRocketOnPoint(x0, y0, 18);

  renderUI();
}

// After crash: show "rocket flew away", hide rocket briefly, then new round
function finishRoundWithFlyOut() {
  state.phase = PHASES.CRASH;

  // If player didn't cash, they lose bet (already deducted)
  // If cashed, payout already added.

  renderUI();

  // animate rocket flying out (CSS-free, quick tween)
  const start = performance.now();
  const duration = 600; // ms
  const from = rocketEl.getBoundingClientRect();

  const targetX = from.left + 220;
  const targetY = from.top - 220;

  function step(now) {
    const p = Math.min(1, (now - start) / duration);
    const ease = 1 - Math.pow(1 - p, 3);

    rocketEl.style.left = `${from.left + (targetX - from.left) * ease}px`;
    rocketEl.style.top = `${from.top + (targetY - from.top) * ease}px`;
    rocketEl.style.transform = `translate(-50%,-50%) rotate(${18 + 28 * ease}deg)`;

    if (p < 1) {
      requestAnimationFrame(step);
    } else {
      // hide rocket after "fly away"
      setRocketVisible(false);

      // small pause then new round
      setTimeout(() => {
        // Start next round countdown again
        resetRound();
      }, 1400);
    }
  }
  requestAnimationFrame(step);
}

function tick(ts) {
  if (!lastTs) lastTs = ts;
  const dt = (ts - lastTs) / 1000;
  lastTs = ts;

  if (state.phase === PHASES.WAIT) {
    state.waitLeft -= dt;
    state.mult = 1.0;

    // show rocket at start position (fixed)
    const x = tToX(0);
    const y = multToY(1.0);
    if (points.length === 0) {
      points = [{ x, y }];
      buildPaths(points);
    }
    placeRocketOnPoint(x, y, 18);

    if (state.waitLeft <= 0) {
      // lock join after this moment automatically by changing phase
      startRound();
    }
  }

  if (state.phase === PHASES.FLY) {
    state.t += dt;

    state.mult = multAtTime(state.t);

    // add point
    const x = tToX(state.t);
    const y = multToY(state.mult);

    points.push({ x, y });

    // keep points count sane
    if (points.length > 220) points.shift();

    buildPaths(points);

    // rocket angle based on slope
    let angle = 18;
    if (points.length >= 2) {
      const a = points[points.length - 2];
      const b = points[points.length - 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      // slope up-right => negative dy
      angle = Math.max(-10, Math.min(45, (-dy / Math.max(1, dx)) * 28 + 12));
    }
    placeRocketOnPoint(x, y, angle);

    // crash check
    if (state.mult >= state.crashPoint) {
      // on crash, if user hasn't cashed — they lose
      // set mult exactly to crash point to display nice
      state.mult = state.crashPoint;

      // finalize last path point at crash
      points[points.length - 1] = { x, y: multToY(state.mult) };
      buildPaths(points);

      // if in round and not cashed -> they are out
      if (state.inRound && !state.cashed) {
        // bet already deducted; just mark status (no payout)
      }

      // show crash message and fly out
      centerMsg.textContent = `💥 Краш на ${state.mult.toFixed(2)}x`;
      finishRoundWithFlyOut();
    }
  }

  renderUI();
  raf = requestAnimationFrame(tick);
}

// --- Init ---
function init() {
  // default bet
  clampBet();

  // reset state to start round 1 wait
  state.roundId = 1;
  state.phase = PHASES.WAIT;
  state.waitLeft = 3.0;
  state.t = 0;
  state.mult = 1.0;
  state.crashPoint = sampleCrashPoint();
  state.inRound = false;
  state.bet = 0;
  state.cashed = false;
  state.cashMult = null;

  points = [];
  buildPaths(points);
  setRocketVisible(true);

  renderUI();

  if (raf) cancelAnimationFrame(raf);
  lastTs = null;
  raf = requestAnimationFrame(tick);
}

init();
