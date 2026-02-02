// app.js — Wheel v3 (цветные фракции без серого сектора)
// Логика: выигрыш ТОЛЬКО если выпал выбранный множитель.
// Не безпроигрышно за счет весов (дорогие множители реже).
// Плашки "Твой выбор" и "Результат" всегда обновляются.

// ---------------- RNG ----------------
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function randInt(min, max) {
  return Math.floor(randFloat() * (max - min + 1)) + min;
}

// ---------------- Telegram WebApp ----------------
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// ---------------- Wallet (virtual) ----------------
const WALLET_KEY = "wheel_wallet_v3";
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

// ---------------- DOM ----------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const elBalance = $("#balanceText");
const elBet = $("#betInput");
const elBetMinus = $("#betMinus");
const elBetPlus = $("#betPlus");
const elSpin = $("#spinBtn");
const elCanvas = $("#wheel");

// центр
const elCenterTitle = $("#centerTitle");
const elCenterSub = $("#centerSub");

// верхние плашки
const elStatStatus = $("#statStatus");
const elStatPick = $("#statPick");
const elStatResult = $("#statResult");
const elStatMult = $("#statMult"); // если есть

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

// ---------------- UI helpers ----------------
function pulse(el) {
  if (!el) return;
  el.classList.remove("pulse");
  // reflow
  void el.offsetWidth;
  el.classList.add("pulse");
}

function setStatus(title, sub = "") {
  if (elStatStatus) {
    elStatStatus.textContent = title;
    pulse(elStatStatus);
  }
  if (elCenterSub) elCenterSub.textContent = sub || "";
}

function setPickText(t) {
  if (elStatPick) {
    elStatPick.textContent = t;
    pulse(elStatPick);
  }
}

function setResultText(t) {
  if (elStatResult) {
    elStatResult.textContent = t;
    pulse(elStatResult);
  }
}

function setCenterTitle(t) {
  if (elCenterTitle) elCenterTitle.textContent = t;
}

function setMultText(t) {
  if (elStatMult) elStatMult.textContent = t;
}

// ---------------- Wheel model (NO GREY) ----------------
// Веса подобраны так, чтобы игра не была "в плюс" на дистанции.
// Total = 100
const FACTIONS = [
  { key: "x12", label: "1.20x", mult: 1.2,  color: "#3DFF8A", count: 55 },
  { key: "x15", label: "1.50x", mult: 1.5,  color: "#B8FF3D", count: 25 },
  { key: "x20", label: "2.00x", mult: 2.0,  color: "#44D7FF", count: 12 },
  { key: "x30", label: "3.00x", mult: 3.0,  color: "#A966FF", count: 5  },
  { key: "x50", label: "5.00x", mult: 5.0,  color: "#FFB03D", count: 2  },
  { key: "x200",label: "20.0x", mult: 20.0, color: "#FF4D4D", count: 1  },
];

const SECTORS = [];
for (const f of FACTIONS) for (let i = 0; i < f.count; i++) SECTORS.push(f);
const N = SECTORS.length;

// ---------------- State ----------------
let selectedPick = FACTIONS[0].key; // по умолчанию 1.2
let spinning = false;
let rotation = 0;
let raf = null;

// tick (чтобы “результат” жил во время вращения)
let lastTickSector = 0;

// ---------------- Pick buttons ----------------
// Кнопки должны иметь class="pickBtn" data-pick="x12" и т.д.
function getFaction(key) {
  return FACTIONS.find(f => f.key === key) || FACTIONS[0];
}

function setPick(key) {
  if (spinning) return;
  selectedPick = key;
  const f = getFaction(key);

  setPickText(`${f.label}`);
  setResultText("—");
  setStatus("Ожидание", "Выбери фракцию снизу и нажми «Крутить»");
  setCenterTitle(f.label);
  setMultText("—");

  $$(".pickBtn").forEach(btn => btn.classList.toggle("active", btn.dataset.pick === key));
}

$$(".pickBtn").forEach(btn => {
  btn.addEventListener("click", () => setPick(btn.dataset.pick));
});

// chips
$$(".chip").forEach(ch => {
  ch.addEventListener("click", () => {
    if (spinning) return;
    const b = ch.dataset.bet;
    if (!b) return;
    if (b === "max") elBet.value = String(wallet.coins);
    else elBet.value = String(b);
    clampBet();
  });
});

// bet +/- buttons
if (elBetMinus) elBetMinus.addEventListener("click", () => {
  if (spinning) return;
  elBet.value = String((Number(elBet.value) || 1) - 10);
  clampBet();
});
if (elBetPlus) elBetPlus.addEventListener("click", () => {
  if (spinning) return;
  elBet.value = String((Number(elBet.value) || 1) + 10);
  clampBet();
});
elBet.addEventListener("input", () => { if (!spinning) clampBet(); });

// ---------------- Canvas draw ----------------
function getCanvasSize() {
  const rect = elCanvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2.25, window.devicePixelRatio || 1));
  const size = Math.floor(Math.min(rect.width, rect.height) * dpr);
  return { size, dpr };
}
function hexToRgba(hex, a) {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function drawWheel() {
  if (!elCanvas) return;
  const ctx = elCanvas.getContext("2d");
  const { size } = getCanvasSize();

  if (elCanvas.width !== size || elCanvas.height !== size) {
    elCanvas.width = size;
    elCanvas.height = size;
  }

  const w = elCanvas.width, h = elCanvas.height;
  const cx = w / 2, cy = h / 2;

  ctx.clearRect(0, 0, w, h);

  const R = Math.min(cx, cy) * 0.96;
  const rInner = R * 0.74;

  // фон диска
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fill();

  // обод
  ctx.lineWidth = Math.max(2, R * 0.02);
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.stroke();

  const a0 = -Math.PI / 2; // указатель сверху
  const da = (Math.PI * 2) / N;

  for (let i = 0; i < N; i++) {
    const f = SECTORS[i];
    const start = a0 + rotation + i * da;
    const end = start + da;

    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.985, start, end);
    ctx.arc(cx, cy, rInner, end, start, true);
    ctx.closePath();

    const alt = (i % 2 === 0) ? 0.95 : 0.78;
    ctx.fillStyle = hexToRgba(f.color, 0.88 * alt);
    ctx.fill();

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.stroke();
  }

  // внутренняя часть
  ctx.beginPath();
  ctx.arc(cx, cy, rInner * 0.92, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(10,16,40,0.62)";
  ctx.fill();

  ctx.lineWidth = Math.max(2, R * 0.015);
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.stroke();

  // подсветка
  const g = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.25, R * 0.05, cx, cy, R);
  g.addColorStop(0, "rgba(255,255,255,0.14)");
  g.addColorStop(0.6, "rgba(255,255,255,0.04)");
  g.addColorStop(1, "rgba(255,255,255,0.00)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
}

// сектор под стрелкой
function sectorAtPointerIndex(rot) {
  const da = (Math.PI * 2) / N;
  let t = (-rot) / da;
  t = ((t % N) + N) % N;
  return Math.floor(t);
}

// ---------------- Spin ----------------
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function lockUI(lock) {
  elSpin.disabled = lock;
  $$(".pickBtn, .chip, #betMinus, #betPlus").forEach(x => { if (x) x.disabled = lock; });
  if (elBet) elBet.disabled = lock;
}

function pickRandomSectorIndex() {
  return randInt(0, N - 1); // равномерно по массиву SECTORS (а веса уже в count)
}

function spinOnce() {
  if (spinning) return;

  const bet = clampBet();
  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");

  const pick = getFaction(selectedPick);

  // списываем ставку
  addCoins(-bet);

  spinning = true;
  lockUI(true);

  setPickText(`${pick.label}`);
  setResultText("Крутится…");
  setStatus("Крутится…", "Ждём выпадение сектора");
  setCenterTitle("…");
  setMultText("—");

  const targetIndex = pickRandomSectorIndex();
  const targetFaction = SECTORS[targetIndex];

  const da = (Math.PI * 2) / N;
  const jitter = (randFloat() - 0.5) * da * 0.70;
  const baseTargetRot = -((targetIndex + 0.5) * da) - jitter;

  const extraTurns = randInt(7, 10) * Math.PI * 2;
  const startRot = rotation;
  const endRot = baseTargetRot + extraTurns;

  const dur = 4200;
  const t0 = performance.now();

  lastTickSector = sectorAtPointerIndex(rotation);

  const tick = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const e = easeOutCubic(p);

    rotation = startRot + (endRot - startRot) * e;

    // "живой" результат во время кручения
    const curSector = sectorAtPointerIndex(rotation);
    if (curSector !== lastTickSector) {
      lastTickSector = curSector;
      const curF = SECTORS[curSector];
      setCenterTitle(curF.label);
      // чтобы плашка результата “дышала”
      setResultText(`Крутится… (${curF.label})`);
    }

    drawWheel();

    if (p < 1) {
      raf = requestAnimationFrame(tick);
      return;
    }

    // финал нормализация
    rotation = ((rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    drawWheel();

    const landedIndex = sectorAtPointerIndex(rotation);
    const landed = SECTORS[landedIndex];

    // выигрыш только при совпадении
    let won = (landed.key === pick.key);
    let payout = 0;

    if (won) {
      payout = Math.floor(bet * landed.mult);
      addCoins(payout);
    }

    // UI итог
    setPickText(`${pick.label}`);
    setResultText(`${landed.label}`);
    setCenterTitle(`${landed.label}`);

    if (won) {
      setStatus("Выигрыш!", `+${payout} 🪙 (ставка ${bet} 🪙)`);
      setMultText(`+${payout} 🪙`);
      if (elCenterSub) elCenterSub.textContent = `Ты выбрал ${pick.label} · Выпало ${landed.label}`;
    } else {
      setStatus("Проигрыш", `Ставка ${bet} 🪙 сгорела`);
      setMultText("0 🪙");
      if (elCenterSub) elCenterSub.textContent = `Ты выбрал ${pick.label} · Выпало ${landed.label}`;
    }

    spinning = false;
    lockUI(false);
  };

  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

elSpin.addEventListener("click", spinOnce);

// ---------------- Resize ----------------
window.addEventListener("resize", () => setTimeout(drawWheel, 60));

// ---------------- Init ----------------
function init() {
  clampBet();
  setPick(selectedPick);
  drawWheel();
}
init();
