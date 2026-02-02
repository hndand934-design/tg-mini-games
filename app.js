// app.js — Wheel (GitHub Pages) v2
// Логика: выигрыш только если выпал выбранный сектор (фракция).
// Есть "0x" (проигрышный) сектор как отдельная фракция.
// Есть звук (tick во время вращения + stop), кнопка mute/unmute.

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
const WALLET_KEY = "wheel_wallet_v2";
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

const elCenterTitle = $("#centerTitle");
const elCenterSub = $("#centerSub");

const elStatMult = $("#statMult");
const elStatStatus = $("#statStatus");
const elStatPick = $("#statPick");
const elStatResult = $("#statResult"); // если есть отдельный блок результата (опц)
const elMuteBtn = $("#muteBtn"); // кнопка звука (если есть)

if (!elCanvas || !elSpin || !elBet) {
  console.error("Не найден(ы) нужные элементы. Проверь index.html (wheel/spinBtn/betInput).");
}

// ---------------- Sound (tiny, pleasant) ----------------
const SOUND_KEY = "wheel_sound_on_v1";
let soundOn = (localStorage.getItem(SOUND_KEY) ?? "1") === "1";

// WebAudio
let audioCtx = null;
function getAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}
function playTick() {
  if (!soundOn) return;
  const ctx = getAudio();
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime(720, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.03, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  o.connect(g); g.connect(ctx.destination);
  o.start(t);
  o.stop(t + 0.07);
}
function playStop() {
  if (!soundOn) return;
  const ctx = getAudio();
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(520, t);
  o.frequency.exponentialRampToValueAtTime(880, t + 0.08);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.connect(g); g.connect(ctx.destination);
  o.start(t);
  o.stop(t + 0.14);
}
function setSound(on) {
  soundOn = !!on;
  localStorage.setItem(SOUND_KEY, soundOn ? "1" : "0");
  if (elMuteBtn) elMuteBtn.textContent = soundOn ? "Звук: on" : "Звук: off";
}

// если кнопка есть — подключим
if (elMuteBtn) {
  setSound(soundOn);
  elMuteBtn.addEventListener("click", async () => {
    // чтобы в браузере аудио разрешилось
    try { await getAudio().resume(); } catch {}
    setSound(!soundOn);
  });
}

// ---------------- UI ----------------
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
  if (elCenterTitle) elCenterTitle.textContent = t;
}
function setPickText(t) {
  if (elStatPick) elStatPick.textContent = t;
}
function setResultText(t) {
  if (elStatResult) elStatResult.textContent = t;
}

// ---------------- Wheel model ----------------
// Добавили "lose" сектор (0x). Он делает игру НЕ безпроигрышной.
// Чем больше count у lose — тем чаще будет проигрыш.
const FACTIONS = [
  { key: "lose",   label: "0.00x", mult: 0.0,  color: "#A8B0C2", count: 16 }, // проигрышные
  { key: "green",  label: "1.20x", mult: 1.2,  color: "#3DFF8A", count: 12 },
  { key: "lime",   label: "1.50x", mult: 1.5,  color: "#B8FF3D", count: 7  },
  { key: "blue",   label: "2.00x", mult: 2.0,  color: "#44D7FF", count: 4  },
  { key: "purple", label: "3.00x", mult: 3.0,  color: "#A966FF", count: 2  },
  { key: "orange", label: "5.00x", mult: 5.0,  color: "#FFB03D", count: 1  },
  { key: "red",    label: "20.0x", mult: 20.0, color: "#FF4D4D", count: 1  },
];

// Секторы
const SECTORS = [];
for (const f of FACTIONS) for (let i = 0; i < f.count; i++) SECTORS.push(f);
const N = SECTORS.length;

// ---------------- State ----------------
let selectedPick = "green";   // что выбрал игрок
let spinning = false;
let rotation = 0;
let raf = null;

// Для тиков: будем тикать при прохождении границ секторов
let lastTickSector = 0;

// ---------------- Pick buttons ----------------
// IMPORTANT: кнопки с data-pick должны существовать.
// Проигрышный сектор НЕ выбираем как ставку — поэтому игнорируем lose.
function setPick(key) {
  if (key === "lose") return;
  selectedPick = key;

  const f = FACTIONS.find(x => x.key === key) || FACTIONS.find(x => x.key === "green");
  setPickText(`${f.label}`);
  setStatus("Ожидание", "Выбери фракцию снизу и нажми «Крутить»");
  setMultText("—");
  setResultText("");

  $$(".pickBtn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.pick === key);
  });
}

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
    if (b === "max") elBet.value = String(wallet.coins);
    else elBet.value = String(b);
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

  // диск
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.035)";
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

    const alt = (i % 2 === 0) ? 0.92 : 0.78;
    ctx.fillStyle = hexToRgba(f.color, 0.88 * alt);
    ctx.fill();

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.stroke();
  }

  // внутренняя часть
  ctx.beginPath();
  ctx.arc(cx, cy, rInner * 0.92, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(10,16,40,0.65)";
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

// сектор под указателем
function sectorAtPointerIndex(rot) {
  const da = (Math.PI * 2) / N;
  let t = (-rot) / da;
  t = ((t % N) + N) % N;
  return Math.floor(t);
}

// ---------------- Animation ----------------
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// выбор случайного сектора (равномерно по массиву SECTORS)
function pickRandomSectorIndex() {
  return randInt(0, N - 1);
}

// ---------------- Spin ----------------
function lockUI(lock) {
  elSpin.disabled = lock;
  $$(".pickBtn, .chip, #betMinus, #betPlus").forEach(x => { if (x) x.disabled = lock; });
  if (elBet) elBet.disabled = lock;
}

async function spinOnce() {
  if (spinning) return;

  // чтобы звук работал после клика в браузере
  try { if (soundOn) await getAudio().resume(); } catch {}

  const bet = clampBet();
  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");

  const pick = FACTIONS.find(f => f.key === selectedPick) || FACTIONS.find(f => f.key === "green");

  // списываем ставку
  addCoins(-bet);

  spinning = true;
  lockUI(true);
  setStatus("Крутится…", "Ждём выпадение сектора");
  setMultText("—");
  setResultText("");

  const targetIndex = pickRandomSectorIndex();
  const targetFaction = SECTORS[targetIndex];

  const da = (Math.PI * 2) / N;
  const a0 = -Math.PI / 2;

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

    // tick sound при смене сектора
    const curSector = sectorAtPointerIndex(rotation);
    if (curSector !== lastTickSector) {
      // чем ближе к финалу — тем реже тики (не обязательно), но пусть будет мягко:
      playTick();
      lastTickSector = curSector;
    }

    drawWheel();

    if (p < 1) {
      raf = requestAnimationFrame(tick);
      return;
    }

    // финал нормализация
    rotation = ((rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    drawWheel();

    // итог
    const landedIndex = sectorAtPointerIndex(rotation);
    const landed = SECTORS[landedIndex];

    let payout = 0;
    let won = false;

    if (landed.key === pick.key && landed.key !== "lose") {
      payout = Math.floor(bet * landed.mult);
      addCoins(payout);
      won = true;
    } else {
      // проигрыш (в т.ч. если landed=lose или выбрал одно, выпало другое)
      payout = 0;
      won = false;
    }

    playStop();

    // UI
    setPickText(`${pick.label}`);
    // result
    const resultText = `${landed.label}`;
    if (elStatResult) elStatResult.textContent = resultText;

    if (won) {
      setStatus("Выигрыш!", `+${payout} 🪙 (ставка ${bet} 🪙)`);
      setMultText(`+${payout} 🪙`);
      setResultText(`Выпало: ${landed.label} · Ты выбрал: ${pick.label}`);
    } else {
      setStatus("Проигрыш", `Ставка ${bet} 🪙 сгорела`);
      setMultText(`${landed.label}`);
      setResultText(`Выпало: ${landed.label} · Ты выбрал: ${pick.label}`);
    }

    spinning = false;
    lockUI(false);
  };

  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

elSpin.addEventListener("click", spinOnce);

// ---------------- Resize ----------------
function onResize() { drawWheel(); }
window.addEventListener("resize", () => setTimeout(onResize, 60));

// ---------------- Init ----------------
function init() {
  // дефолт — green
  setPick(selectedPick);

  // mute text
  if (elMuteBtn) elMuteBtn.textContent = soundOn ? "Звук: on" : "Звук: off";

  drawWheel();
}
init();
