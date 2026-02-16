// app.js — ОБНОВЛЕНО (пульс кнопки + микрооптимизация FPS)

function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function randInt(max) { return Math.floor(randFloat() * max); }

const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

// Wallet
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

// Sound
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

// UI
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

// Colors
const rootStyle = getComputedStyle(document.documentElement);
const COLORS = {
  lose: { a: rootStyle.getPropertyValue("--lose1").trim(), b: rootStyle.getPropertyValue("--lose2").trim(), tag:"l" },
  1.5:  { a: rootStyle.getPropertyValue("--g1").trim(),    b: rootStyle.getPropertyValue("--g2").trim(),    tag:"g" },
  1.7:  { a: rootStyle.getPropertyValue("--w1").trim(),    b: rootStyle.getPropertyValue("--w2").trim(),    tag:"w" },
  2:    { a: rootStyle.getPropertyValue("--y1").trim(),    b: rootStyle.getPropertyValue("--y2").trim(),    tag:"y" },
  3:    { a: rootStyle.getPropertyValue("--p1").trim(),    b: rootStyle.getPropertyValue("--p2").trim(),    tag:"p" },
  4:    { a: rootStyle.getPropertyValue("--o1").trim(),    b: rootStyle.getPropertyValue("--o2").trim(),    tag:"o" },
};

// Сектора: серый/цвет/серый/цвет...
const coloredPattern = [
  1.5,1.5,1.7,2, 1.5,1.7,2,3, 1.5,1.7,2,4, 1.5,1.7,2, 1.5,1.7,2
];
const SECTORS = [];
for (let i = 0; i < coloredPattern.length; i++) {
  SECTORS.push({ kind: "lose" });
  SECTORS.push({ kind: coloredPattern[i] });
}
const N = SECTORS.length;

// Canvas
const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d", { alpha: true });

// DPR ограничим (это реально уменьшает лаги на мобилках)
let dpr = Math.max(1, Math.min(1.75, window.devicePixelRatio || 1));
let currentAngle = 0;

function resizeCanvas() {
  const css = canvas.clientWidth || 560;
  const px = Math.floor(css * dpr);
  canvas.width = px;
  canvas.height = px;
  drawWheel(currentAngle);
}
window.addEventListener("resize", () => {
  dpr = Math.max(1, Math.min(1.75, window.devicePixelRatio || 1));
  resizeCanvas();
});

function drawWheel(angle) {
  const W = canvas.width, H = canvas.height;
  const cx = W/2, cy = H/2;
  ctx.clearRect(0,0,W,H);

  const outerR = Math.min(W,H)*0.48;
  const innerR = outerR*0.70;

  // shadow чуть легче (меньше blur = меньше лагов)
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, outerR + 6*dpr, 0, Math.PI*2);
  ctx.shadowColor = "rgba(0,0,0,.42)";
  ctx.shadowBlur = 18*dpr;
  ctx.fillStyle = "rgba(0,0,0,.10)";
  ctx.fill();
  ctx.restore();

  // base ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI*2);
  ctx.arc(cx, cy, innerR, 0, Math.PI*2, true);
  ctx.closePath();
  ctx.fillStyle = "rgba(0,0,0,.22)";
  ctx.fill();
  ctx.restore();

  const step = (Math.PI*2)/N;

  for (let i=0;i<N;i++){
    const kind = SECTORS[i].kind;
    const col = COLORS[kind] || COLORS.lose;

    const a0 = -Math.PI/2 + angle + i*step;
    const a1 = a0 + step;

    const g = ctx.createLinearGradient(cx, cy-outerR, cx, cy+outerR);
    g.addColorStop(0, col.a);
    g.addColorStop(1, col.b);

    ctx.beginPath();
    ctx.arc(cx, cy, outerR, a0, a1, false);
    ctx.arc(cx, cy, innerR, a1, a0, true);
    ctx.closePath();

    ctx.fillStyle = g;
    ctx.globalAlpha = (kind==="lose") ? 0.70 : 0.95;
    ctx.fill();

    // separators
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = "rgba(0,0,0,.55)";
    ctx.lineWidth = 2*dpr;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a0)*innerR, cy + Math.sin(a0)*innerR);
    ctx.lineTo(cx + Math.cos(a0)*outerR, cy + Math.sin(a0)*outerR);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // ring outline
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.lineWidth = 3*dpr;
  ctx.beginPath(); ctx.arc(cx, cy, outerR, 0, Math.PI*2); ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,.06)";
  ctx.lineWidth = 2*dpr;
  ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, Math.PI*2); ctx.stroke();
}

function angleToIndex(angle){
  const step = (Math.PI*2)/N;
  let a = (angle%(Math.PI*2) + Math.PI*2)%(Math.PI*2);
  const t = (a + Math.PI/2)%(Math.PI*2);
  return (N - 1 - Math.floor(t/step)) % N;
}

// Results
let lastResults = [];
function pushResult(kind){
  lastResults.unshift(kind);
  lastResults = lastResults.slice(0,8);
  resultsEl.innerHTML = "";
  for (const k of lastResults){
    const tag = (k==="lose") ? "l" : (COLORS[k]?.tag || "l");
    const label = (k==="lose") ? "0.00x" : `${Number(k).toFixed(2)}x`.replace(".00","") + "x";
    const el = document.createElement("div");
    el.className = `rchip ${tag}`;
    el.textContent = label;
    resultsEl.appendChild(el);
  }
}

// State
let picked = 1.5;
let spinning = false;

// Top render
function renderTop(){
  const user = tg?.initDataUnsafe?.user;
  subTitle.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
  balanceEl.textContent = String(wallet.coins);
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
bonusBtn.onclick = () => { addCoins(1000); beep(760, 70, 0.03); };

// bet
function clampBet(){
  let v = Math.floor(Number(betInput.value)||0);
  if (v<1) v=1;
  if (v>wallet.coins) v=wallet.coins;
  betInput.value = String(v);
  updateSide();
}
betInput.addEventListener("input", clampBet);
betMinus.onclick = () => { betInput.value = String((Number(betInput.value)||1)-10); clampBet(); };
betPlus.onclick  = () => { betInput.value = String((Number(betInput.value)||1)+10); clampBet(); };

document.querySelectorAll(".chip").forEach(b=>{
  b.onclick=()=>{
    const val=b.dataset.bet;
    betInput.value = (val==="max") ? String(wallet.coins) : String(val);
    clampBet();
    beep(540,55,0.02);
  };
});

// pick
function setPick(v){
  picked = v;
  document.querySelectorAll(".pick").forEach(btn=>{
    btn.classList.toggle("active", Number(btn.dataset.pick)===v);
  });
  pickView.textContent = `${v.toFixed(2)}x`.replace(".00","") + "x";
  statusView.textContent = "Ожидание";
  resView.textContent = "—";
  updateSide();
  beep(520,50,0.025);
}
document.querySelectorAll(".pick").forEach(btn=>{
  btn.onclick=()=>setPick(Number(btn.dataset.pick));
});
setPick(1.5);

// chance/potential
function calcChance(mult){
  const win = SECTORS.filter(s=>s.kind===mult).length;
  return win / N;
}
function updateSide(){
  const bet = Math.floor(Number(betInput.value)||0);
  const p = calcChance(picked);
  chanceView.textContent = `${(p*100).toFixed(1)}%`;
  potView.textContent = bet>0 ? `+${Math.floor(bet*picked - bet)} 🪙` : "—";
}
clampBet();

// animation
function easeOutCubic(t){ return 1 - Math.pow(1-t,3); }
let lastTick = null;
function tickIfNeeded(angle){
  const idx = angleToIndex(angle);
  if (idx !== lastTick){
    lastTick = idx;
    beep(680, 22, 0.018, "square");
  }
}

async function spinToIndex(targetIdx){
  const step = (Math.PI*2)/N;

  let desired = currentAngle;
  for (let k=0;k<N;k++){
    const a = currentAngle + k*step;
    if (angleToIndex(a) === targetIdx){ desired = a; break; }
  }

  const extraTurns = 6 + randInt(3);
  const start = currentAngle;
  const end = desired + extraTurns*Math.PI*2;

  const dur = 2200;
  const t0 = performance.now();
  lastTick = angleToIndex(start);

  return new Promise(resolve=>{
    function frame(now){
      const t = Math.min(1, (now - t0)/dur);
      const e = easeOutCubic(t);
      currentAngle = start + (end-start)*e;
      tickIfNeeded(currentAngle);
      drawWheel(currentAngle);
      if (t<1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

// spin
spinBtn.onclick = async ()=>{
  if (spinning) return;

  const bet = Math.floor(Number(betInput.value)||0);
  if (bet<=0) return alert("Ставка должна быть больше 0");
  if (bet>wallet.coins) return alert("Недостаточно монет");

  spinning = true;
  spinBtn.disabled = true;
  spinBtn.classList.add("is-spinning");

  statusView.textContent = "Крутим...";
  resView.textContent = "—";

  addCoins(-bet);

  // честный выбор сектора
  const landingIdx = randInt(N);
  const landingKind = SECTORS[landingIdx].kind;

  beep(520,60,0.03);
  await spinToIndex(landingIdx);

  pushResult(landingKind);

  if (landingKind === picked){
    const payout = Math.floor(bet * picked);
    addCoins(payout);
    statusView.textContent = "Победа";
    resView.textContent = `${picked.toFixed(2)}x`.replace(".00","") + "x";
    beep(760,70,0.035);
    beep(920,70,0.035);
  } else {
    statusView.textContent = "Проигрыш";
    resView.textContent = (landingKind==="lose")
      ? "0.00x"
      : `${Number(landingKind).toFixed(2)}x`.replace(".00","") + "x";
    boom();
  }

  spinning = false;
  spinBtn.disabled = false;
  spinBtn.classList.remove("is-spinning");
};

// init
resizeCanvas();
pushResult("lose");
pushResult(1.5);
pushResult(2);
pushResult(1.7);
pushResult(4);
