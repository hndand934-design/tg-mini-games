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
function tick() { beep(720, 18, 0.02, "square"); }
function winSound(){ beep(760, 70, 0.03); setTimeout(()=>beep(920, 70, 0.03), 80); }
function loseSound(){ beep(220, 110, 0.03, "sine"); }

// ===== UI =====
const subTitle = document.getElementById("subTitle");
const balanceEl = document.getElementById("balance");

const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");

const statusView = document.getElementById("statusView");
const pickView = document.getElementById("pickView");
const resultView = document.getElementById("resultView");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");
const spinBtn = document.getElementById("spinBtn");

const wheelCanvas = document.getElementById("wheel");
const ctx = wheelCanvas.getContext("2d");

// ===== Data (фиксированное колесо) =====
// Делим круг на сектора: больше шанс на маленькие X, меньше — на большие.
// Это “честно”: выбор игрока влияет только на шанс, не на результат.
const segments = [
  { m: 1.2, color: "#2ecc71", count: 18 },
  { m: 1.5, color: "#6ad7ff", count: 10 },
  { m: 2.0, color: "#3aa0ff", count: 7  },
  { m: 3.0, color: "#7c5cff", count: 4  },
  { m: 5.0, color: "#ffb02e", count: 2  },
  { m: 10.0, color:"#ff4d5f", count: 1  }
];

// разворачиваем в плоский список секторов
const wheel = [];
segments.forEach(s => { for (let i=0;i<s.count;i++) wheel.push({ m:s.m, color:s.color }); });
const N = wheel.length;

// ===== state =====
let pickedM = null; // number
let spinning = false;

// wheel rotation state
let angle = 0;          // текущий угол (радианы)
let targetAngle = 0;    // куда едем
let startAngle = 0;
let startTime = 0;
let spinDur = 0;

// ===== Helpers =====
function renderTop(){
  const user = tg?.initDataUnsafe?.user;
  subTitle.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
  balanceEl.textContent = String(wallet.coins);
}
renderTop();

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

// ===== Faction pick =====
function setPick(m){
  pickedM = m;
  document.querySelectorAll(".faction").forEach(btn=>{
    btn.classList.toggle("active", Number(btn.dataset.m) === m);
  });
  pickView.textContent = pickedM ? `${pickedM.toFixed(2)}x` : "—";
  statusView.textContent = "Ожидание";
  resultView.textContent = "—";
  beep(520, 50, 0.025);
}
document.querySelectorAll(".faction").forEach(btn=>{
  btn.onclick = () => setPick(Number(btn.dataset.m));
});

// ===== Draw wheel =====
function drawWheel(){
  const W = wheelCanvas.width;
  const H = wheelCanvas.height;
  const cx = W/2, cy = H/2;
  const rOuter = Math.min(W,H)*0.44;
  const rInner = rOuter*0.62;

  ctx.clearRect(0,0,W,H);

  // мягкий фон круга
  ctx.save();
  ctx.translate(cx,cy);
  ctx.rotate(angle);

  const step = (Math.PI*2)/N;

  for (let i=0;i<N;i++){
    const a0 = i*step;
    const a1 = a0 + step;

    // sector
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.arc(0,0,rOuter,a0,a1,false);
    ctx.closePath();
    ctx.fillStyle = wheel[i].color;
    ctx.globalAlpha = 0.95;
    ctx.fill();

    // separator
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "rgba(0,0,0,.65)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // label (редко, чтобы не было каши)
    if (N <= 60 ? (i % 3 === 0) : (i % 4 === 0)) {
      const mid = (a0+a1)/2;
      const tx = Math.cos(mid) * (rInner + (rOuter-rInner)*0.55);
      const ty = Math.sin(mid) * (rInner + (rOuter-rInner)*0.55);
      ctx.save();
      ctx.translate(tx,ty);
      ctx.rotate(mid + Math.PI/2);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.font = "900 20px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${wheel[i].m.toFixed(2)}x`, 0, 0);
      ctx.restore();
    }
  }

  // inner disc
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(0,0,rInner,0,Math.PI*2);
  ctx.closePath();
  const g = ctx.createRadialGradient(-rInner*0.3,-rInner*0.3, 20, 0,0,rInner);
  g.addColorStop(0,"rgba(255,255,255,.10)");
  g.addColorStop(1,"rgba(0,0,0,.22)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

// ===== Spin logic =====
function easeOutCubic(t){ return 1 - Math.pow(1-t,3); }

// индекс сектора под стрелкой (стрелка сверху, значит “вверх” = -PI/2)
function getIndexAtPointer(a){
  const step = (Math.PI*2)/N;
  // pointer direction in world space = -PI/2
  // wheel rotated by angle a, so we find which sector maps to pointer
  let x = (-Math.PI/2 - a);
  x = (x % (Math.PI*2) + Math.PI*2) % (Math.PI*2);
  const idx = Math.floor(x / step);
  return idx;
}

let lastTickIdx = -1;

function animate(ts){
  if (!spinning) return;

  const t = Math.min(1, (ts - startTime) / spinDur);
  const k = easeOutCubic(t);
  angle = startAngle + (targetAngle - startAngle) * k;

  drawWheel();

  // tick when sector changes
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

    resultView.textContent = `${landed.toFixed(2)}x`;

    const bet = Math.floor(Number(betInput.value) || 0);
    const win = pickedM !== null && Math.abs(landed - pickedM) < 1e-9;

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
  if (pickedM === null) return alert("Сначала выбери фракцию снизу.");
  const bet = Math.floor(Number(betInput.value) || 0);
  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");

  // списываем ставку сразу
  addCoins(-bet);

  statusView.textContent = "Крутится...";
  resultView.textContent = "—";

  // выберем честный сектор равновероятно по всем секторам
  const targetIdx = Math.floor(randFloat() * N);

  const step = (Math.PI*2)/N;
  // target angle so that targetIdx lands at pointer
  // want: getIndexAtPointer(targetAngle) == targetIdx
  // pointer equation approx -> set angle so that (-PI/2 - angle) in target sector range
  // pick middle of sector:
  const sectorMid = (targetIdx + 0.5) * step;
  // (-PI/2 - angle) == sectorMid  => angle == -PI/2 - sectorMid
  let base = (-Math.PI/2 - sectorMid);

  // add extra full turns for drama
  const turns = 7 + Math.floor(randFloat()*3); // 7..9
  targetAngle = base + turns * Math.PI*2;

  startAngle = angle;
  startTime = performance.now();
  spinDur = 2500 + Math.floor(randFloat()*450); // 2.5..2.95s

  spinning = true;
  spinBtn.disabled = true;
  lastTickIdx = getIndexAtPointer(angle);

  requestAnimationFrame(animate);
};

// init
drawWheel();
setPick(1.2);
