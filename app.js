// ===== RNG (честный) =====
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

// ===== Telegram WebApp =====
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

// ===== Wallet =====
const WALLET_KEY = "mini_wallet_wheel_v2";
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
function beep(freq = 520, ms = 45, vol = 0.03, type = "sine") {
  if (!soundOn) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, ms);
  } catch {}
}
function tick(){ beep(760, 16, 0.02, "square"); }
function winSound(){ beep(760, 70, 0.03); setTimeout(()=>beep(920, 70, 0.03), 80); }
function loseSound(){ beep(210, 120, 0.03, "sine"); }

// ===== UI =====
const subTitle = document.getElementById("subTitle");
const balanceEl = document.getElementById("balance");
const balance2 = document.getElementById("balance2");

const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");

const statusView = document.getElementById("statusView");
const pickView = document.getElementById("pickView");
const resultView = document.getElementById("resultView");

const historyEl = document.getElementById("history");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");
const spinBtn = document.getElementById("spinBtn");

const wheelCanvas = document.getElementById("wheel");
const ctx = wheelCanvas.getContext("2d", { alpha: true });

// ===== Wheel definition (как на твоём скрине) =====
// Множители на кнопках: 0.00x, 1.50x, 1.70x, 2.00x, 3.00x, 4.00x
// Кольцо: много "пустых/0", больше зелёных, чуть белых, жёлтых, фиолет/оранж — редкие.
const COLORS = {
  0:  "#4a5a68",
  1.5:"#22d81b",
  1.7:"#e8f3ff",
  2:  "#ffd400",
  3:  "#7a4dff",
  4:  "#ff9b23"
};

// веса (можешь править, но это уже “как на скрине” по ощущениям)
const WHEEL_WEIGHTS = [
  { m: 0,   count: 10 },
  { m: 1.5, count: 7  },
  { m: 1.7, count: 2  },
  { m: 2,   count: 4  },
  { m: 3,   count: 1  },
  { m: 4,   count: 1  },
];

// разворачиваем в сектора
const wheel = [];
WHEEL_WEIGHTS.forEach(s => { for (let i=0;i<s.count;i++) wheel.push({ m:s.m, color: COLORS[s.m] }); });
const N = wheel.length;

// ===== History =====
const HISTORY_KEY = "mini_wheel_history_v2";
function loadHistory(){
  try {
    const h = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    if (Array.isArray(h)) return h.slice(0, 30);
  } catch {}
  return [];
}
function saveHistory(arr){
  localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, 30)));
}
let history = loadHistory();

function historyClass(m){
  if (m === 0) return "h0";
  if (m === 1.5) return "h15";
  if (m === 1.7) return "h17";
  if (m === 2) return "h20";
  if (m === 3) return "h30";
  return "h40";
}
function renderHistory(){
  const view = history.slice(0, 12);
  historyEl.innerHTML = "";
  view.forEach(m => {
    const d = document.createElement("div");
    d.className = `hItem ${historyClass(m)}`;
    d.textContent = `${Number(m).toFixed(2)}×`;
    historyEl.appendChild(d);
  });
}
renderHistory();

// ===== Top =====
function renderTop(){
  const user = tg?.initDataUnsafe?.user;
  subTitle.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
  balanceEl.textContent = String(wallet.coins);
  balance2.textContent = String(wallet.coins);
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

// ===== Picks =====
let pickedM = 1.5;
function setPick(m){
  pickedM = m;
  document.querySelectorAll(".pick").forEach(btn=>{
    btn.classList.toggle("active", Number(btn.dataset.m) === m);
  });
  pickView.textContent = `${pickedM.toFixed(2)}×`;
  statusView.textContent = "Ожидание";
  resultView.textContent = "—";
  beep(520, 45, 0.02);
}
document.querySelectorAll(".pick").forEach(btn=>{
  btn.onclick = () => setPick(Number(btn.dataset.m));
});
setPick(1.5);

// ===== Drawing (оптимизировано, без лагов) =====
let angle = 0; // radians
function drawWheel(){
  const W = wheelCanvas.width;
  const H = wheelCanvas.height;
  const cx = W/2, cy = H/2;

  ctx.clearRect(0,0,W,H);

  // размеры “как на скрине”: тонкое цветное кольцо на толстом тёмном ободе
  const rOuter = Math.min(W,H)*0.44;
  const ringW  = rOuter*0.12;
  const rMid   = rOuter - ringW*0.5;
  const rInner = rOuter - ringW;

  ctx.save();
  ctx.translate(cx,cy);
  ctx.rotate(angle);

  // внешний темный обод
  ctx.beginPath();
  ctx.arc(0,0,rOuter + ringW*0.55, 0, Math.PI*2);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,.07)";
  ctx.fill();

  // внутренний темный обод (под цветные сегменты)
  ctx.beginPath();
  ctx.arc(0,0,rOuter + ringW*0.08, 0, Math.PI*2);
  ctx.arc(0,0,rInner - ringW*0.10, 0, Math.PI*2, true);
  ctx.closePath();
  ctx.fillStyle = "rgba(0,0,0,.22)";
  ctx.fill();

  // сегменты
  const step = (Math.PI*2)/N;
  for (let i=0;i<N;i++){
    const a0 = i*step;
    const a1 = a0 + step;

    ctx.beginPath();
    ctx.arc(0,0,rOuter, a0, a1);
    ctx.arc(0,0,rInner, a1, a0, true);
    ctx.closePath();

    ctx.fillStyle = wheel[i].color;
    ctx.globalAlpha = 0.96;
    ctx.fill();

    // разделители (тонко)
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "rgba(0,0,0,.8)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // лёгкий “блик” поверх кольца
  ctx.globalAlpha = 0.20;
  const grad = ctx.createRadialGradient(-rMid*0.35, -rMid*0.35, 20, 0,0,rOuter*1.1);
  grad.addColorStop(0, "rgba(255,255,255,.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0,0,rOuter + ringW*0.25, 0, Math.PI*2);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}
drawWheel();

// ===== Spin =====
let spinning = false;
let startAngle = 0;
let targetAngle = 0;
let startTime = 0;
let spinDur = 0;
let lastTickIdx = -1;

function easeOutCubic(t){ return 1 - Math.pow(1-t,3); }

// индекс сектора под стрелкой (стрелка сверху => -PI/2)
function getIndexAtPointer(a){
  const step = (Math.PI*2)/N;
  let x = (-Math.PI/2 - a);
  x = (x % (Math.PI*2) + Math.PI*2) % (Math.PI*2);
  return Math.floor(x / step);
}

function animate(ts){
  if (!spinning) return;

  const t = Math.min(1, (ts - startTime) / spinDur);
  const k = easeOutCubic(t);
  angle = startAngle + (targetAngle - startAngle) * k;

  drawWheel();

  const idx = getIndexAtPointer(angle);
  if (idx !== lastTickIdx){
    lastTickIdx = idx;
    tick();
  }

  if (t < 1){
    requestAnimationFrame(animate);
  } else {
    spinning = false;
    spinBtn.disabled = false;

    const finalIdx = getIndexAtPointer(angle);
    const landed = wheel[finalIdx].m;

    // история
    history.unshift(landed);
    history = history.slice(0, 30);
    saveHistory(history);
    renderHistory();

    resultView.textContent = `${Number(landed).toFixed(2)}×`;

    const bet = Math.floor(Number(betInput.value) || 0);
    const win = Math.abs(landed - pickedM) < 1e-9;

    if (win){
      const payout = Math.floor(bet * landed);
      addCoins(payout);
      statusView.textContent = "Победа";
      winSound();
    } else {
      statusView.textContent = "Проигрыш";
      loseSound();
    }
  }
}

spinBtn.onclick = () => {
  if (spinning) return;

  const bet = Math.floor(Number(betInput.value) || 0);
  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");

  // списываем ставку
  addCoins(-bet);

  statusView.textContent = "Крутится...";
  resultView.textContent = "—";

  // честный выбор сектора (равновероятно по секторам, т.к. сектора повторяются)
  const targetIdx = Math.floor(randFloat() * N);
  const step = (Math.PI*2)/N;

  // середина выбранного сектора под стрелкой
  const sectorMid = (targetIdx + 0.5) * step;
  const base = (-Math.PI/2 - sectorMid);

  const turns = 7 + Math.floor(randFloat()*3); // 7..9 оборотов
  targetAngle = base + turns * Math.PI*2;

  startAngle = angle;
  startTime = performance.now();
  spinDur = 2300 + Math.floor(randFloat()*500); // 2.3..2.8с

  spinning = true;
  spinBtn.disabled = true;
  lastTickIdx = getIndexAtPointer(angle);

  requestAnimationFrame(animate);
};
