// app.js
// ===== RNG (честный) =====
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function randInt(max) { // 0..max-1
  return Math.floor(randFloat() * max);
}

// ===== Telegram WebApp =====
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

// ===== Wallet =====
const WALLET_KEY = "mini_wallet_wheel_v1";
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
  renderTop();
}
function addCoins(d) { setCoins(wallet.coins + d); }

// ===== Sound =====
let soundOn = true;
let audioCtx = null;
function getAC() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  return audioCtx;
}
function beep(freq = 520, ms = 45, vol = 0.03, type = "sine") {
  if (!soundOn) return;
  const ctx = getAC();
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = vol;
  o.connect(g); g.connect(ctx.destination);
  const t = ctx.currentTime;
  o.start(t);
  o.stop(t + ms / 1000);
}
function boom() {
  if (!soundOn) return;
  const ctx = getAC();
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(180, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.12);
  g.gain.setValueAtTime(0.06, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
  o.connect(g); g.connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + 0.16);
}

// ===== UI =====
const subTitle = document.getElementById("subTitle");
const balanceEl = document.getElementById("balance");
const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");

const resultsEl = document.getElementById("results");
const spinBtn = document.getElementById("spinBtn");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");

const chanceView = document.getElementById("chanceView");
const potView = document.getElementById("potView");

const statusView = document.getElementById("statusView");
const pickView = document.getElementById("pickView");
const resView = document.getElementById("resView");

// ===== Wheel config =====
// Сектора: “lose” серые + выигрышные. На серое ставить нельзя (и кнопки нет).
const MULTS = [1.5, 1.7, 2, 3, 4];
const COLORS = {
  lose: { a: "#556274", b: "#465365", tag: "l" },
  1.5:  { a: "#34d45a", b: "#1aa640", tag: "g" },
  1.7:  { a: "#e7f0ff", b: "#9fb2d6", tag: "w" },
  2:    { a: "#ffd34d", b: "#b78612", tag: "y" },
  3:    { a: "#8b5cff", b: "#5a2fe0", tag: "p" },
  4:    { a: "#ffb04a", b: "#c96e0d", tag: "o" },
};

// Раскладка (как “stake-подобно”: много серых + немного цветных)
const SECTORS = [
  ...Array.from({ length: 18 }, () => ({ kind: "lose" })), // 18 серых
  ...Array.from({ length: 10 }, () => ({ kind: 1.5 })),   // 10 зелёных
  ...Array.from({ length: 4  }, () => ({ kind: 1.7 })),   // 4 белых
  ...Array.from({ length: 2  }, () => ({ kind: 2 })),     // 2 жёлтых
  ...Array.from({ length: 1  }, () => ({ kind: 3 })),     // 1 фиолет
  ...Array.from({ length: 1  }, () => ({ kind: 4 })),     // 1 оранж
];
// Итого 36 секторов
const N = SECTORS.length;

// ===== Canvas render =====
const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d", { alpha: true });

let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
function resizeCanvas() {
  // canvas size fixed in html for aspect, но под DPR перерисуем
  const cssSize = canvas.clientWidth || 560;
  const px = Math.floor(cssSize * dpr);
  canvas.width = px;
  canvas.height = px;
  drawWheel(currentAngle);
}
window.addEventListener("resize", () => {
  dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  resizeCanvas();
});

// Угол (радианы). 0 = вверх (под указателем)
let currentAngle = 0;

// Визуал: кольцо
function drawWheel(angle) {
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  ctx.clearRect(0, 0, W, H);

  const outerR = Math.min(W, H) * 0.48;
  const innerR = outerR * 0.70;

  // мягкая тень кольца
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, outerR + 6 * dpr, 0, Math.PI * 2);
  ctx.shadowColor = "rgba(0,0,0,.45)";
  ctx.shadowBlur = 28 * dpr;
  ctx.fillStyle = "rgba(0,0,0,.12)";
  ctx.fill();
  ctx.restore();

  // базовое кольцо
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.fillStyle = "rgba(0,0,0,.24)";
  ctx.fill();
  ctx.restore();

  // сектора
  const step = (Math.PI * 2) / N;
  for (let i = 0; i < N; i++) {
    const s = SECTORS[i];
    const kind = s.kind;
    const col = COLORS[kind] || COLORS.lose;

    const a0 = -Math.PI / 2 + angle + i * step;
    const a1 = a0 + step;

    // градиент сектора
    const g = ctx.createLinearGradient(cx, cy - outerR, cx, cy + outerR);
    g.addColorStop(0, col.a);
    g.addColorStop(1, col.b);

    ctx.beginPath();
    ctx.arc(cx, cy, outerR, a0, a1, false);
    ctx.arc(cx, cy, innerR, a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.globalAlpha = (kind === "lose") ? 0.70 : 0.95;
    ctx.fill();

    // разделитель (как на stake — аккуратные грани)
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "rgba(0,0,0,.55)";
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, a0, a0, false);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // обводка кольца
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.lineWidth = 3 * dpr;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,.06)";
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.stroke();
}

// перевод угла -> индекс сектора под стрелкой
function angleToIndex(angle) {
  const step = (Math.PI * 2) / N;
  // стрелка “смотрит” вверх => базовый -PI/2 уже учтён в отрисовке
  // здесь вычисляем какой сектор попал в верхнюю точку
  let a = (angle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  // верх = -PI/2, поэтому сдвигаем
  const t = (a + Math.PI / 2) % (Math.PI * 2);
  const idx = (N - 1 - Math.floor(t / step)) % N;
  return idx;
}

// ===== Results chips =====
let lastResults = []; // array of {kind}
function pushResult(kind) {
  lastResults.unshift(kind);
  lastResults = lastResults.slice(0, 8);
  resultsEl.innerHTML = "";
  for (const k of lastResults) {
    const tag = (k === "lose") ? "l" : COLORS[k]?.tag || "l";
    const label = (k === "lose") ? "0.00x" : `${Number(k).toFixed(2)}x`.replace(".00","") + "x";
    const el = document.createElement("div");
    el.className = `rchip ${tag}`;
    el.textContent = label;
    resultsEl.appendChild(el);
  }
}

// ===== State =====
let picked = 1.5;
let spinning = false;

// ===== Top render =====
function renderTop(){
  const user = tg?.initDataUnsafe?.user;
  subTitle.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
  balanceEl.textContent = String(wallet.coins);
}
renderTop();

// ===== Sound toggle =====
soundBtn.onclick = () => {
  soundOn = !soundOn;
  soundText.textContent = soundOn ? "Звук on" : "Звук off";
  const dot = soundBtn.querySelector(".dot");
  dot.style.background = soundOn ? "#26d47b" : "#ff5a6a";
  dot.style.boxShadow = soundOn
    ? "0 0 0 3px rgba(38,212,123,.14)"
    : "0 0 0 3px rgba(255,90,106,.14)";
  beep(soundOn ? 640 : 240, 60, 0.03);
};

// bonus
bonusBtn.onclick = () => { addCoins(1000); beep(760, 70, 0.03); };

// ===== bet =====
function clampBet(){
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  updateSide();
}
betInput.addEventListener("input", clampBet);
betMinus.onclick = () => { betInput.value = String((Number(betInput.value)||1) - 10); clampBet(); };
betPlus.onclick  = () => { betInput.value = String((Number(betInput.value)||1) + 10); clampBet(); };

document.querySelectorAll(".chip").forEach((b) => {
  b.onclick = () => {
    const val = b.dataset.bet;
    betInput.value = (val === "max") ? String(wallet.coins) : String(val);
    clampBet();
    beep(540, 55, 0.02);
  };
});

// ===== picks =====
function setPick(v){
  picked = v;
  document.querySelectorAll(".pick").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.pick) === v);
  });
  pickView.textContent = `${v.toFixed(2)}x`.replace(".00","") + "x";
  statusView.textContent = "Ожидание";
  resView.textContent = "—";
  updateSide();
  beep(520, 50, 0.025);
}
document.querySelectorAll(".pick").forEach(btn => {
  btn.onclick = () => setPick(Number(btn.dataset.pick));
});
setPick(1.5);

// ===== chance/potential =====
function calcChance(mult){
  const winCount = SECTORS.filter(s => s.kind === mult).length;
  const p = winCount / N;
  return p;
}
function updateSide(){
  const bet = Math.floor(Number(betInput.value) || 0);
  const p = calcChance(picked);
  chanceView.textContent = `${(p*100).toFixed(1)}%`;
  potView.textContent = bet > 0 ? `+${Math.floor(bet * picked - bet)} 🪙` : "—";
}
clampBet();

// ===== Spin animation (60fps, без CSS лагов) =====
function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

// тик по секторам
let lastTickIndex = null;
function tickIfNeeded(angle){
  const idx = angleToIndex(angle);
  if (idx !== lastTickIndex) {
    lastTickIndex = idx;
    beep(680, 25, 0.018, "square");
  }
}

async function spinToIndex(targetIdx){
  // вычисляем угол, при котором targetIdx окажется сверху
  // нам нужен angle такой, чтобы angleToIndex(angle) == targetIdx
  // возьмём текущий угол, добавим обороты + поправку
  const step = (Math.PI * 2) / N;

  // подберём угол перебором одного оборота (36 шагов) — стабильно и просто
  let desired = currentAngle;
  for (let k = 0; k < N; k++) {
    const a = currentAngle + k * step;
    if (angleToIndex(a) === targetIdx) { desired = a; break; }
  }

  const extraTurns = 6 + randInt(3); // 6-8 оборотов
  const start = currentAngle;
  const end = desired + extraTurns * Math.PI * 2;

  const dur = 2200; // 2.2s — плавно
  const t0 = performance.now();

  lastTickIndex = angleToIndex(start);

  return new Promise((resolve) => {
    function frame(now){
      const t = Math.min(1, (now - t0) / dur);
      const e = easeOutCubic(t);
      currentAngle = start + (end - start) * e;

      tickIfNeeded(currentAngle);
      drawWheel(currentAngle);

      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

// ===== Spin logic =====
spinBtn.onclick = async () => {
  if (spinning) return;

  const bet = Math.floor(Number(betInput.value) || 0);
  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");
  if (!MULTS.includes(picked)) return alert("Выбери множитель");

  spinning = true;
  spinBtn.disabled = true;

  statusView.textContent = "Крутим...";
  resView.textContent = "—";

  // списываем ставку
  addCoins(-bet);

  // выбираем сектор честно по равномерному индексу
  const landingIdx = randInt(N);
  const landingKind = SECTORS[landingIdx].kind;

  // стартовый звук
  beep(520, 60, 0.03);

  await spinToIndex(landingIdx);

  // результат
  pushResult(landingKind);

  if (landingKind === picked) {
    const payout = Math.floor(bet * picked);
    addCoins(payout);
    statusView.textContent = "Победа";
    resView.textContent = `${picked.toFixed(2)}x`.replace(".00","") + "x";
    beep(760, 70, 0.035);
    beep(920, 70, 0.035);
  } else {
    statusView.textContent = "Проигрыш";
    resView.textContent = (landingKind === "lose")
      ? "0.00x"
      : `${Number(landingKind).toFixed(2)}x`.replace(".00","") + "x";
    boom();
  }

  spinning = false;
  spinBtn.disabled = false;
};

// initial draw + initial results
resizeCanvas();
pushResult("lose");
pushResult(1.5);
pushResult(2);
pushResult(1.7);
pushResult(4);
