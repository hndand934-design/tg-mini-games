// ---------- RNG ----------
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function randInt(min, max) {
  return Math.floor(randFloat() * (max - min + 1)) + min;
}

// ---------- Telegram ----------
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

// ---------- Wallet (virtual) ----------
const WALLET_KEY = "mini_wallet_v2";
function loadWallet() {
  try {
    const w = JSON.parse(localStorage.getItem(WALLET_KEY) || "null");
    if (w && typeof w.coins === "number") return w;
  } catch {}
  return { coins: 1000 };
}
function saveWallet(w) { localStorage.setItem(WALLET_KEY, JSON.stringify(w)); }
let wallet = loadWallet();

const balanceVal = document.getElementById("balanceVal");
function setCoins(v) {
  wallet.coins = Math.max(0, Math.floor(v));
  saveWallet(wallet);
  renderBalance();
}
function addCoins(d) { setCoins(wallet.coins + d); }
function renderBalance() { balanceVal.textContent = `🪙 ${wallet.coins}`; }
renderBalance();

// ---------- UI refs ----------
const statusVal = document.getElementById("statusVal");
const pickVal = document.getElementById("pickVal");
const resultVal = document.getElementById("resultVal");
const stStatus = document.getElementById("stStatus");
const stPick = document.getElementById("stPick");
const stResult = document.getElementById("stResult");

const centerBig = document.getElementById("centerBig");
const centerSmall = document.getElementById("centerSmall");

const chanceBadge = document.getElementById("chanceBadge");

const picksEl = document.getElementById("picks");
const betInput = document.getElementById("betInput");
const spinBtn = document.getElementById("spinBtn");
const bonusBtn = document.getElementById("bonusBtn");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");

// ---------- Sound (simple WebAudio) ----------
let soundOn = true;
const soundBtn = document.getElementById("soundBtn");
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}
function beep(freq = 440, dur = 0.05, vol = 0.04, type = "sine") {
  if (!soundOn) return;
  ensureAudio();
  const t0 = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = 0.0001;

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.stop(t0 + dur + 0.02);
}
function tick() { beep(720, 0.03, 0.028, "square"); }
function winSound() { beep(880, 0.08, 0.045, "sine"); setTimeout(() => beep(1320, 0.08, 0.04, "sine"), 90); }
function loseSound() { beep(220, 0.10, 0.045, "triangle"); }

soundBtn.onclick = () => {
  soundOn = !soundOn;
  soundBtn.textContent = `Звук: ${soundOn ? "on" : "off"}`;
  // маленький тихий сигнал при включении
  if (soundOn) beep(520, 0.05, 0.03, "sine");
};

// ---------- Wheel setup (фиксированное число секторов, без выбора) ----------
// Важно: игра не безпроигрышная — ты выигрываешь ТОЛЬКО если попал в свой множитель.
const groups = [
  { mult: 1.2, color: "#33d17a", count: 18 },
  { mult: 1.5, color: "#a6e22e", count: 10 },
  { mult: 2.0, color: "#45a3ff", count: 6 },
  { mult: 3.0, color: "#9b5cff", count: 3 },
  { mult: 5.0, color: "#ffb020", count: 2 },
  { mult: 10.0, color: "#ff4d4d", count: 1 },
];

const segments = [];
for (const g of groups) {
  for (let i = 0; i < g.count; i++) segments.push({ mult: g.mult, color: g.color });
}
const N = segments.length; // фиксировано (например 40)

let selectedMult = null;

// ---------- Build pick buttons (bottom) ----------
function formatMult(m) {
  // 1.2 -> "1.20x"
  return `${m.toFixed(2)}x`;
}

function setPulse(el) {
  el.classList.remove("pulse");
  // reflow
  void el.offsetWidth;
  el.classList.add("pulse");
}

function updateChance() {
  if (!selectedMult) { chanceBadge.textContent = `Шанс: —`; return; }
  const hit = segments.filter(s => s.mult === selectedMult).length;
  chanceBadge.textContent = `Шанс: ${hit} / ${N}`;
}

function renderPicks() {
  picksEl.innerHTML = "";
  const uniq = [...new Set(segments.map(s => s.mult))].sort((a,b)=>a-b);
  for (const m of uniq) {
    const color = segments.find(s => s.mult === m).color;
    const btn = document.createElement("button");
    btn.className = "pickBtn";
    btn.type = "button";
    btn.innerHTML = `<span class="dot" style="background:${color}"></span>${formatMult(m)}`;
    btn.onclick = () => {
      if (state.spinning) return;
      selectedMult = m;
      document.querySelectorAll(".pickBtn").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");

      pickVal.textContent = formatMult(m);
      setPulse(stPick);
      centerBig.textContent = formatMult(m);
      centerSmall.textContent = `Шанс ${segments.filter(s => s.mult === m).length}/${N}`;
      updateChance();
    };
    picksEl.appendChild(btn);
  }
}
renderPicks();

// ---------- Bet UI ----------
function clampBet() {
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
}
clampBet();

document.getElementById("chips").querySelectorAll(".chip").forEach(btn=>{
  btn.onclick = () => {
    const b = btn.dataset.bet;
    if (b === "max") betInput.value = String(wallet.coins);
    else betInput.value = String(Number(b) || 1);
    clampBet();
  };
});

betMinus.onclick = () => { betInput.value = String((Number(betInput.value)||1) - 10); clampBet(); };
betPlus.onclick  = () => { betInput.value = String((Number(betInput.value)||1) + 10); clampBet(); };
betInput.oninput = clampBet;

bonusBtn.onclick = () => addCoins(1000);

// ---------- Canvas draw ----------
const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");

function dprFix() {
  const cssSize = Math.min(520, Math.floor(window.innerWidth * 0.82));
  const size = Math.max(360, Math.min(520, cssSize));
  // canvas fixed buffer for crisp
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.style.width = size + "px";
  canvas.style.height = size + "px";
  canvas.width = Math.floor(size * dpr);
  canvas.height = Math.floor(size * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", () => { dprFix(); draw(); });
dprFix();

// rotation in radians (0 means segment 0 starts at 3 o'clock, but we control pointer at top)
let rotation = 0;

function draw() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0,0,w,h);

  const cx = w/2, cy = h/2;
  const R = Math.min(w,h)*0.46;
  const ring = Math.min(w,h)*0.10;

  // outer shadow ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx,cy,R+10,0,Math.PI*2);
  ctx.fillStyle = "rgba(0,0,0,.18)";
  ctx.fill();
  ctx.restore();

  // segments
  const step = (Math.PI * 2) / N;

  // pointer is at top: angle = -90deg
  const pointerAngle = -Math.PI/2;

  for (let i=0;i<N;i++){
    const s = segments[i];
    const a0 = rotation + i*step;
    const a1 = a0 + step;

    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,R,a0,a1);
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.globalAlpha = 0.85;
    ctx.fill();

    // separators
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // inner cut (hole)
  ctx.beginPath();
  ctx.arc(cx,cy,R-ring,0,Math.PI*2);
  ctx.fillStyle = "rgba(10,14,30,.92)";
  ctx.fill();

  // inner subtle ring
  ctx.beginPath();
  ctx.arc(cx,cy,R-ring,0,Math.PI*2);
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // center disc
  ctx.beginPath();
  ctx.arc(cx,cy,R*0.36,0,Math.PI*2);
  ctx.fillStyle = "rgba(255,255,255,.06)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx,cy,R*0.36,0,Math.PI*2);
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // compute current segment under pointer to make tick detection consistent
  // pointerAngle corresponds to "top". We need index where pointerAngle falls into [a0,a1).
  // Normalize angle: relative = pointerAngle - rotation
  const rel = normalizeAngle(pointerAngle - rotation);
  const idx = (Math.floor(rel / step) % N + N) % N;
  state.currentIndex = idx;
}
function normalizeAngle(a){
  const two = Math.PI*2;
  a = a % two;
  if (a < 0) a += two;
  return a;
}

// ---------- Spin logic ----------
const state = {
  spinning: false,
  currentIndex: 0,
  lastTickIndex: -1
};

function setStatus(text){
  statusVal.textContent = text;
  setPulse(stStatus);
}

function setResult(text){
  resultVal.textContent = text;
  setPulse(stResult);
}

function angleForIndexAtPointer(index){
  // We want segment "index" to end up at pointerAngle (-90deg) at its center.
  const step = (Math.PI*2)/N;
  const pointerAngle = -Math.PI/2;
  const segCenter = index*step + step/2;
  // pointerAngle = rotation + segCenter  => rotation = pointerAngle - segCenter
  return pointerAngle - segCenter;
}

function pickRandomIndexWeighted(){
  // but wheel already has repeats per group (counts), so uniform index is already weighted
  return randInt(0, N-1);
}

function disableUI(dis){
  spinBtn.disabled = dis;
  document.querySelectorAll(".pickBtn").forEach(b=>b.disabled = dis);
  betInput.disabled = dis;
  betMinus.disabled = dis;
  betPlus.disabled = dis;
  document.querySelectorAll("#chips .chip").forEach(b=>b.disabled = dis);
}

function spin(){
  clampBet();
  const bet = Math.floor(Number(betInput.value)||0);
  if (bet <= 0) return;
  if (bet > wallet.coins) return;

  if (!selectedMult){
    setStatus("Выбери фракцию");
    centerBig.textContent = "Выбери фракцию";
    centerSmall.textContent = "снизу";
    return;
  }

  // списываем ставку сразу
  addCoins(-bet);

  state.spinning = true;
  disableUI(true);
  setStatus("Крутится…");
  centerBig.textContent = "Крутится…";
  centerSmall.textContent = "удачи";

  // выбор сектора (вес уже в массивах)
  const winIndex = pickRandomIndexWeighted();
  const landed = segments[winIndex];

  // target rotation:
  //  - we add big spins + align final rotation to land chosen index at pointer
  const baseTarget = angleForIndexAtPointer(winIndex);
  const spins = randInt(6, 9) * Math.PI * 2;
  const startRot = rotation;
  const endRot = baseTarget + spins;

  const dur = randInt(3200, 4200); // ms
  const tStart = performance.now();

  state.lastTickIndex = -1;

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  function frame(now){
    const t = Math.min(1, (now - tStart) / dur);
    const e = easeOutCubic(t);
    rotation = startRot + (endRot - startRot) * e;

    draw();

    // tick when passing into new segment
    if (state.currentIndex !== state.lastTickIndex) {
      state.lastTickIndex = state.currentIndex;
      // тихий тик только во время спина
      if (t < 0.98) tick();
    }

    if (t < 1){
      requestAnimationFrame(frame);
      return;
    }

    // finalize exact
    rotation = endRot;
    draw();

    state.spinning = false;
    disableUI(false);

    // outcome
    const win = landed.mult === selectedMult;
    if (win){
      const payout = Math.floor(bet * landed.mult);
      addCoins(payout);

      setStatus("Победа ✅");
      setResult(`${formatMult(landed.mult)} · +${payout} 🪙`);
      centerBig.textContent = "Победа ✅";
      centerSmall.textContent = `+${payout} 🪙`;
      winSound();
    } else {
      setStatus("Проигрыш ❌");
      setResult(`${formatMult(landed.mult)} · -${bet} 🪙`);
      centerBig.textContent = "Проигрыш ❌";
      centerSmall.textContent = `выпало ${formatMult(landed.mult)}`;
      loseSound();
    }
  }

  requestAnimationFrame(frame);
}

spinBtn.onclick = () => {
  // unlock audio on first user gesture
  if (!audioCtx && soundOn) ensureAudio();
  spin();
};

// initial UI
setStatus("Ожидание");
pickVal.textContent = "—";
setResult("—");
centerBig.textContent = "Выбери фракцию";
centerSmall.textContent = "и нажми “Крутить”";
updateChance();
draw();
