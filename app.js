// app.js — Wheel (GitHub Pages, без выбора количества секторов)
// Требуемые элементы в index.html (id):
// #balanceText, #betInput, #betMinus, #betPlus, #spinBtn, #wheel (canvas)
// Кнопки выбора фракции: .pickBtn с data-pick="green|lime|blue|purple|orange|red"
// Чипы ставок: .chip с data-bet="10|50|100|250|500|max"
// Центр-лейблы: #centerTitle, #centerSub
// Статы: #statMult, #statStatus, #statPick

// --- RNG (честный, crypto) ---
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

// --- Wallet (virtual, local) ---
const WALLET_KEY = "wheel_wallet_v1";
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

// --- DOM helpers ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const elBalance = $("#balanceText");
const elBet = $("#betInput");
const elBetMinus = $("#betMinus");
const elBetPlus = $("#betPlus");
const elSpin = $("#spinBtn");
const elCanvas = $("#wheel");
const elCenterTitle = $("#centerTitle");
const elCenterSub = $("#centerSub");

const elStatMult = $("#statMult");
const elStatStatus = $("#statStatus");
const elStatPick = $("#statPick");

if (!elCanvas || !elSpin || !elBet) {
  console.error("Не найден(ы) нужные элементы. Проверь index.html (id wheel/spinBtn/betInput).");
}

// --- Wheel config (фиксированное число секторов) ---
// Чем больше count — тем чаще сектор встречается по кругу
const FACTIONS = [
  { key: "green",  label: "x1.20", mult: 1.2,  color: "#3DFF8A", count: 16 },
  { key: "lime",   label: "x1.50", mult: 1.5,  color: "#B8FF3D", count: 10 },
  { key: "blue",   label: "x2.00", mult: 2.0,  color: "#44D7FF", count: 7  },
  { key: "purple", label: "x3.00", mult: 3.0,  color: "#A966FF", count: 4  },
  { key: "orange", label: "x5.00", mult: 5.0,  color: "#FFB03D", count: 2  },
  { key: "red",    label: "x20.0", mult: 20.0, color: "#FF4D4D", count: 1  },
];

// Собираем "кольцо" из N секторов (без выбора количества пользователем)
const SECTORS = [];
for (const f of FACTIONS) for (let i = 0; i < f.count; i++) SECTORS.push(f);
const N = SECTORS.length; // 40

// --- State ---
let selectedPick = "green";
let spinning = false;
let rotation = 0; // radians
let lastResult = null;

// --- UI init ---
function renderBalance() {
  if (elBalance) elBalance.textContent = `${wallet.coins} 🪙`;
}
renderBalance();

function clampBet() {
  let v = Math.floor(Number(elBet.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  elBet.value = String(v);
  return v;
}
clampBet();

function setStatus(status, sub = "") {
  if (elStatStatus) elStatStatus.textContent = status;
  if (elCenterSub) elCenterSub.textContent = sub || "";
}
function setMultText(t) {
  if (elStatMult) elStatMult.textContent = t;
}
function setPickText(t) {
  if (elStatPick) elStatPick.textContent = t;
}

function setPick(key) {
  selectedPick = key;
  const f = FACTIONS.find(x => x.key === key) || FACTIONS[0];
  setPickText(f.label);
  $$(".pickBtn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.pick === key);
  });
}
setPick(selectedPick);

// pick buttons
$$(".pickBtn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (spinning) return;
    setPick(btn.dataset.pick);
  });
});

// chips
$$(".chip").forEach(ch => {
  ch.addEventListener("click", () => {
    if (spinning) return;
    const b = ch.dataset.bet;
    if (!b) return;
    if (b === "max") {
      elBet.value = String(wallet.coins);
    } else {
      elBet.value = String(b);
    }
    clampBet();
  });
});

// bet +/- buttons
if (elBetMinus) {
  elBetMinus.addEventListener("click", () => {
    if (spinning) return;
    elBet.value = String((Number(elBet.value) || 1) - 10);
    clampBet();
  });
}
if (elBetPlus) {
  elBetPlus.addEventListener("click", () => {
    if (spinning) return;
    elBet.value = String((Number(elBet.value) || 1) + 10);
    clampBet();
  });
}
elBet.addEventListener("input", () => { if (!spinning) clampBet(); });

// --- Canvas draw ---
function getCanvasSize() {
  const rect = elCanvas.getBoundingClientRect();
  // Рисуем в DPR
  const dpr = Math.max(1, Math.min(2.25, window.devicePixelRatio || 1));
  const size = Math.floor(Math.min(rect.width, rect.height) * dpr);
  return { size, dpr };
}

function drawWheel() {
  if (!elCanvas) return;
  const ctx = elCanvas.getContext("2d");
  const { size } = getCanvasSize();

  // если canvas не совпадает — подгоним
  if (elCanvas.width !== size || elCanvas.height !== size) {
    elCanvas.width = size;
    elCanvas.height = size;
  }

  const w = elCanvas.width, h = elCanvas.height;
  const cx = w / 2, cy = h / 2;

  ctx.clearRect(0, 0, w, h);

  // outer ring
  const R = Math.min(cx, cy) * 0.96;
  const rInner = R * 0.74;

  // background disk
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  ctx.fill();

  // subtle rim
  ctx.lineWidth = Math.max(2, R * 0.02);
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.stroke();

  // sectors
  const a0 = -Math.PI / 2; // pointer at top
  const da = (Math.PI * 2) / N;

  for (let i = 0; i < N; i++) {
    const f = SECTORS[i];
    const start = a0 + rotation + i * da;
    const end = start + da;

    // slice
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.985, start, end);
    ctx.arc(cx, cy, rInner, end, start, true);
    ctx.closePath();

    // alternating lightness
    const alt = (i % 2 === 0) ? 0.92 : 0.78;
    ctx.fillStyle = hexToRgba(f.color, 0.85 * alt);
    ctx.fill();

    // small separators
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.stroke();
  }

  // inner disk
  ctx.beginPath();
  ctx.arc(cx, cy, rInner * 0.92, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(10,16,40,0.65)";
  ctx.fill();

  // inner rim
  ctx.lineWidth = Math.max(2, R * 0.015);
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.stroke();

  // glow highlight
  const g = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.25, R * 0.05, cx, cy, R);
  g.addColorStop(0, "rgba(255,255,255,0.14)");
  g.addColorStop(0.6, "rgba(255,255,255,0.04)");
  g.addColorStop(1, "rgba(255,255,255,0.00)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
}

function hexToRgba(hex, a) {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

// --- Outcome selection ---
function pickRandomSectorIndex() {
  // равномерно по N секторам (за счет повторов count это уже "веса")
  return randInt(0, N - 1);
}

function sectorAtPointerIndex(rot) {
  // pointer at angle a0 (-90deg). We need which index ends up at pointer.
  // Our drawing uses: start = a0 + rotation + i*da
  // Pointer angle in world space is a0. Sector i covers [a0+rotation+i*da, ...]
  // We want i such that a0 lies inside that interval -> solve for i.
  const da = (Math.PI * 2) / N;
  let t = (-rot) / da; // because a0 cancels out
  t = ((t % N) + N) % N;
  return Math.floor(t);
}

// --- Animation ---
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

let raf = null;

function spinOnce() {
  if (spinning) return;

  const bet = clampBet();
  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");

  // выбранная фракция
  const pick = FACTIONS.find(f => f.key === selectedPick) || FACTIONS[0];

  // списываем ставку сразу
  addCoins(-bet);

  spinning = true;
  elSpin.disabled = true;
  $$(".pickBtn, .chip, #betMinus, #betPlus").forEach(x => { if (x) x.disabled = true; });
  setStatus("Крутится…", "Колесо вращается");
  setMultText("—");

  // выбираем сектор (индекс по кругу)
  const targetIndex = pickRandomSectorIndex();
  const targetFaction = SECTORS[targetIndex];

  // вычисляем конечный угол так, чтобы targetIndex попал под указатель (верх)
  const da = (Math.PI * 2) / N;
  const a0 = -Math.PI / 2;

  // Центр выбранного сектора
  const sectorCenter = a0 + (targetIndex + 0.5) * da;

  // Мы рисуем сектор с учетом rotation: start = a0 + rotation + i*da
  // Значит, чтобы центр сектора оказался на a0 (под указателем),
  // нужно: a0 + rotation + (targetIndex+0.5)*da = a0  => rotation = - (targetIndex+0.5)*da
  // Добавим случай внутри сектора (чуть сместим), и много оборотов.
  const jitter = (randFloat() - 0.5) * da * 0.70;
  const baseTargetRot = -((targetIndex + 0.5) * da) - jitter;

  const extraTurns = randInt(6, 9) * Math.PI * 2;
  const startRot = rotation;
  const endRot = baseTargetRot + extraTurns;

  const dur = 4200; // ms
  const t0 = performance.now();

  // анимируем
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const e = easeOutCubic(p);

    // плавно вращаем
    rotation = startRot + (endRot - startRot) * e;

    drawWheel();

    if (p < 1) {
      raf = requestAnimationFrame(tick);
      return;
    }

    // Фиксим rotation в пределах 0..2pi чтобы не рос бесконечно
    rotation = ((rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    drawWheel();

    // финал
    spinning = false;
    elSpin.disabled = false;
    $$(".pickBtn, .chip, #betMinus, #betPlus").forEach(x => { if (x) x.disabled = false; });

    // определяем сектор под указателем (на всякий)
    const landedIndex = sectorAtPointerIndex(rotation);
    const landedFaction = SECTORS[landedIndex];

    // считаем выплату
    let payout = 0;
    let won = false;
    if (landedFaction.key === pick.key) {
      payout = Math.floor(bet * landedFaction.mult);
      addCoins(payout);
      won = true;
    }

    lastResult = { bet, pick: pick.key, landed: landedFaction.key, payout, mult: landedFaction.mult };

    // UI texts
    setMultText(`x${landedFaction.mult.toFixed(2)}`);
    setStatus(won ? "Выигрыш!" : "Мимо", won ? `+${payout} 🪙` : `Выпало ${landedFaction.label}`);

    if (elCenterTitle) elCenterTitle.textContent = won ? `+${payout} 🪙` : `${landedFaction.label}`;
    if (elCenterSub) {
      elCenterSub.textContent = won
        ? `Попал в ${pick.label} · ставка ${bet} 🪙`
        : `Твоя ставка: ${pick.label} · ставка ${bet} 🪙`;
    }
  };

  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

// --- Button ---
elSpin.addEventListener("click", spinOnce);

// --- Resize redraw ---
function onResize() {
  drawWheel();
}
window.addEventListener("resize", () => {
  // маленькая задержка чтобы canvas успел получить новый размер
  setTimeout(onResize, 60);
});

// --- First draw / initial texts ---
function init() {
  // подставим стартовые тексты
  const f = FACTIONS.find(x => x.key === selectedPick) || FACTIONS[0];
  setPickText(f.label);
  setStatus("Готово", "Выбери цвет снизу и нажми «Крутить»");
  setMultText("—");
  if (elCenterTitle) elCenterTitle.textContent = "WHEEL";
  if (elCenterSub) elCenterSub.textContent = "Выбери фракцию снизу";
  drawWheel();
}
init();
