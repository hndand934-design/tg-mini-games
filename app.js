// ===== RNG (честный) =====
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function randInt(n){
  return Math.floor(randFloat() * n);
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
function addCoins(d){ setCoins(wallet.coins + d); }

// ===== Sound (лёгкий) =====
let soundOn = true;
function beep(freq = 520, ms = 55, vol = 0.03) {
  if (!soundOn) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, ms);
  } catch {}
}

// ===== UI =====
const subTitle = document.getElementById("subTitle");
const balanceEl = document.getElementById("balance");
const balance2 = document.getElementById("balance2");

const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");

const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");

const spinBtn = document.getElementById("spinBtn");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");

const statusView = document.getElementById("statusView");
const pickView = document.getElementById("pickView");
const resultView = document.getElementById("resultView");

const pickBtns = Array.from(document.querySelectorAll(".pick"));

// ===== top render =====
function renderTop(){
  const user = tg?.initDataUnsafe?.user;
  subTitle.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
  balanceEl.textContent = String(wallet.coins);
  balance2.textContent = String(wallet.coins);
}
renderTop();

// sound toggle
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

// ===== Bet =====
function clampBet(){
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
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
clampBet();

// ===== Wheel model =====
// Сектора: чередуем цветной / серый.
// Серый (0.00x) - НЕ выбирается, но есть на колесе как “пусто”.
const SEGMENTS = [
  { key:"g", label:"1.50x", mult:1.5, color:"#2ddc5a" },
  { key:"z", label:"0.00x", mult:0.0, color:"#3a4656" },

  { key:"w", label:"1.70x", mult:1.7, color:"#e7efff" },
  { key:"z", label:"0.00x", mult:0.0, color:"#3a4656" },

  { key:"y", label:"2.00x", mult:2.0, color:"#ffd447" },
  { key:"z", label:"0.00x", mult:0.0, color:"#3a4656" },

  { key:"p", label:"3.00x", mult:3.0, color:"#7d4dff" },
  { key:"z", label:"0.00x", mult:0.0, color:"#3a4656" },

  { key:"o", label:"4.00x", mult:4.0, color:"#ff9a3c" },
  { key:"z", label:"0.00x", mult:0.0, color:"#3a4656" },

  // повторим, чтобы колесо было “богаче” (и тоже через серый)
  { key:"g", label:"1.50x", mult:1.5, color:"#2ddc5a" },
  { key:"z", label:"0.00x", mult:0.0, color:"#3a4656" },

  { key:"w", label:"1.70x", mult:1.7, color:"#e7efff" },
  { key:"z", label:"0.00x", mult:0.0, color:"#3a4656" },

  { key:"y", label:"2.00x", mult:2.0, color:"#ffd447" },
  { key:"z", label:"0.00x", mult:0.0, color:"#3a4656" },

  { key:"g", label:"1.50x", mult:1.5, color:"#2ddc5a" },
  { key:"z", label:"0.00x", mult:0.0, color:"#3a4656" },
];

const N = SEGMENTS.length;
const TAU = Math.PI * 2;

// rotation state
let rotation = 0; // radians
let spinning = false;
let pickedMult = null; // 1.5 / 1.7 / 2 / 3 / 4

// draw wheel
function drawWheel(){
  const w = canvas.width, h = canvas.height;
  const cx = w/2, cy = h/2;
  const rOuter = Math.min(w,h)*0.48;
  const rInner = rOuter*0.72;

  ctx.clearRect(0,0,w,h);

  // outer ring shadow
  ctx.save();
  ctx.translate(cx,cy);
  ctx.beginPath();
  ctx.arc(0,0,rOuter+10,0,TAU);
  ctx.fillStyle = "rgba(0,0,0,.22)";
  ctx.fill();
  ctx.restore();

  for(let i=0;i<N;i++){
    const a0 = rotation + (i * TAU/N);
    const a1 = rotation + ((i+1) * TAU/N);

    // sector
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,rOuter,a0,a1);
    ctx.closePath();
    ctx.fillStyle = SEGMENTS[i].color;
    ctx.fill();

    // inner cut (ring look)
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(cx,cy,rInner,0,TAU);
    ctx.fill();
    ctx.restore();

    // separators
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx,cy,rOuter,a0,a1);
    ctx.stroke();
    ctx.restore();
  }

  // inner ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx,cy,rInner,0,TAU);
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.restore();

  // center ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx,cy,rInner*0.55,0,TAU);
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
}
drawWheel();

// ===== picks =====
function setPick(mult){
  pickedMult = mult;
  pickBtns.forEach(b => b.classList.toggle("active", Number(b.dataset.pick) === mult));
  pickView.textContent = mult ? `${mult.toFixed(2)}x` : "—";
  spinBtn.disabled = !pickedMult || spinning;
  beep(520, 55, 0.02);
}
pickBtns.forEach(b => b.onclick = () => setPick(Number(b.dataset.pick)));

// ===== result from pointer =====
// Pointer at TOP (12 o’clock). We need segment under that point.
// Angle at pointer = -PI/2 in canvas polar.
// Convert to wheel local angle and map to index.
function segmentIndexAtPointer(){
  const pointerAngle = -Math.PI/2;
  let ang = pointerAngle - rotation;
  while (ang < 0) ang += TAU;
  while (ang >= TAU) ang -= TAU;
  const idx = Math.floor(ang / (TAU/N));
  return idx;
}

// ===== spin anim =====
function animateSpin(targetRotation, duration = 2600){
  return new Promise((resolve) => {
    const start = performance.now();
    const from = rotation;
    const delta = targetRotation - from;

    function easeOutCubic(t){ return 1 - Math.pow(1-t, 3); }

    function frame(now){
      const t = Math.min(1, (now - start) / duration);
      rotation = from + delta * easeOutCubic(t);
      drawWheel();

      // tick sound ~ when crossing segment boundaries
      if (soundOn && t < 0.98){
        // лёгкий тик по частоте (без тяжёлых вычислений)
        if (Math.random() < 0.12) beep(520 + Math.random()*120, 18, 0.015);
      }

      if (t < 1){
        requestAnimationFrame(frame);
      } else {
        resolve();
      }
    }

    requestAnimationFrame(frame);
  });
}

// ===== main spin =====
spinBtn.onclick = async () => {
  if (spinning) return;
  if (!pickedMult) return;

  const bet = Math.floor(Number(betInput.value) || 0);
  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");

  spinning = true;
  spinBtn.disabled = true;
  statusView.textContent = "Крутим...";
  resultView.textContent = "—";

  // списываем ставку сразу
  addCoins(-bet);

  // делаем цель: 6-10 оборотов + смещение в случайный сектор
  const spins = 6 + randInt(5);
  const extra = randFloat() * TAU;
  const target = rotation + spins*TAU + extra;

  beep(600, 60, 0.02);

  await animateSpin(target, 2600);

  // вычисляем результат по указателю
  const idx = segmentIndexAtPointer();
  const seg = SEGMENTS[idx];
  resultView.textContent = seg.label;

  if (seg.mult > 0 && Math.abs(seg.mult - pickedMult) < 0.001) {
    // WIN
    const win = Math.floor(bet * seg.mult);
    addCoins(win);
    statusView.textContent = "Победа";
    beep(820, 70, 0.03);
    beep(980, 70, 0.03);
  } else {
    statusView.textContent = "Проигрыш";
    beep(220, 110, 0.03);
  }

  spinning = false;
  spinBtn.disabled = !pickedMult;
};
