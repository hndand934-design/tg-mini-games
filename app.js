// app.js — Rocket Crash (night, snow, aurora, 3D rocket, auto rounds)

// ===============================
// RNG (crypto)
// ===============================
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function randInt(min, max) {
  return Math.floor(randFloat() * (max - min + 1)) + min;
}

// ===============================
// Telegram WebApp (optional)
// ===============================
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const userLine = document.getElementById("userLine");
const balancePill = document.getElementById("balancePill");
const user = tg?.initDataUnsafe?.user;

// ===============================
// Wallet (localStorage)
// ===============================
const WALLET_KEY = "mini_wallet_crash_v1";
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

function renderTop() {
  userLine.textContent = user
    ? `Привет, ${user.first_name} · открыто в Telegram`
    : `Открыто вне Telegram`;
  balancePill.textContent = `🪙 ${wallet.coins}`;
}
renderTop();

// ===============================
// Audio (WebAudio, no files)
// ===============================
let _ctx = null;
function audioCtx() {
  if (_ctx) return _ctx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  _ctx = Ctx ? new Ctx() : null;
  return _ctx;
}
async function unlockAudio() {
  const ctx = audioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") { try { await ctx.resume(); } catch {} }
}
document.addEventListener("pointerdown", unlockAudio, { once: false });

function tone({ type="sine", f=440, t=0.10, g=0.05, when=0, detune=0 }) {
  const ctx = audioCtx(); if (!ctx) return;
  const now = ctx.currentTime + when;

  const o = ctx.createOscillator();
  const gain = ctx.createGain();
  const filt = ctx.createBiquadFilter();

  o.type = type;
  o.frequency.setValueAtTime(f, now);
  o.detune.setValueAtTime(detune, now);

  filt.type = "lowpass";
  filt.frequency.setValueAtTime(12000, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(g, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + t);

  o.connect(filt);
  filt.connect(gain);
  gain.connect(ctx.destination);

  o.start(now);
  o.stop(now + t + 0.02);
}
function noise({ t=0.12, g=0.02, when=0, hp=900 }) {
  const ctx = audioCtx(); if (!ctx) return;
  const now = ctx.currentTime + when;

  const bufferSize = Math.floor(ctx.sampleRate * t);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(g, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + t);

  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(hp, now);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  src.start(now);
  src.stop(now + t + 0.02);
}

const SFX = {
  click(){
    tone({type:"triangle", f:520, t:0.05, g:0.035});
    tone({type:"triangle", f:320, t:0.06, g:0.02, when:0.01});
  },
  join(){
    tone({type:"sine", f:560, t:0.08, g:0.05});
    tone({type:"sine", f:740, t:0.10, g:0.04, when:0.05});
  },
  cash(){
    tone({type:"sine", f:740, t:0.10, g:0.05});
    tone({type:"sine", f:932, t:0.12, g:0.045, when:0.06});
    tone({type:"sine", f:1244, t:0.14, g:0.04, when:0.12});
  },
  lose(){
    tone({type:"sine", f:220, t:0.16, g:0.06});
    tone({type:"sine", f:165, t:0.18, g:0.05, when:0.07});
  },
  countdownTick(){
    tone({type:"square", f:520, t:0.04, g:0.02});
  },
  launch(){
    noise({t:0.16, g:0.028, hp:500});
    tone({type:"sawtooth", f:110, t:0.18, g:0.04, when:0.02});
  },
  engineLoop(){
    // called periodically during flight (light)
    noise({t:0.05, g:0.008, hp:700});
    tone({type:"sawtooth", f:95, t:0.06, g:0.012, detune: -20});
  },
  crash(){
    noise({t:0.22, g:0.05, hp:250});
    tone({type:"sawtooth", f:70, t:0.22, g:0.05, when:0.01});
    tone({type:"sine", f:280, t:0.10, g:0.03, when:0.06});
  }
};

// ===============================
// DOM
// ===============================
const multText = document.getElementById("multText");
const phaseText = document.getElementById("phaseText");
const roundText = document.getElementById("roundText");
const betStatus = document.getElementById("betStatus");
const ticker = document.getElementById("ticker");

const rocketWrap = document.getElementById("rocketWrap");
const rocket = document.getElementById("rocket");
const joinBtn = document.getElementById("joinBtn");
const cashBtn = document.getElementById("cashBtn");
const bonusBtn = document.getElementById("bonusBtn");
const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");
const toggleSfx = document.getElementById("toggleSfx");

const note = document.getElementById("note");

// ===============================
// Settings / State
// ===============================
const app = {
  sfx: true,
};

const state = {
  phase: "waiting",      // waiting | flying | crashed
  waitLeftMs: 10000,     // 10s
  mult: 1.00,
  startAt: 0,
  crashAt: 0,
  crashMult: 0,
  // player
  inRound: false,
  bet: 50,
  joinedBet: 0,
  cashedOut: false,
  cashMult: 0,
  // timers
  lastEngineTick: 0,
};

// ===============================
// Helpers
// ===============================
function clampBet(v){
  v = Math.floor(Number(v) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  return v;
}
function fmt2(x){ return "x" + Number(x).toFixed(2); }
function setRocketPose({ y=0, rot=0, tilt=0, scale=1 }){
  // y in px (up is negative)
  rocketWrap.style.transform = `translateX(-50%) translateY(${y}px)`;
  rocket.style.transform = `translateX(-50%) rotate(${rot}deg) rotateX(${tilt}deg) scale(${scale})`;
}

function resetRocketToPad(){
  rocket.classList.remove("shake");
  rocketWrap.classList.remove("launching");
  setRocketPose({ y:0, rot:-8, tilt:18, scale:1 });
}
resetRocketToPad();

// Crash multiplier distribution (simple “provably fair-like” feel, no server)
// Heavy tail; max cap to keep UX ok
function sampleCrashMultiplier(){
  // classic-style: m = 0.99 / (1 - r) (not exact PF, but similar curve)
  const r = Math.max(1e-9, randFloat());
  let m = 0.99 / (1 - r);
  // cap to avoid insane long rounds
  m = Math.min(m, 50);
  // round to 2 decimals
  return Math.max(1.01, Math.floor(m * 100) / 100);
}

function canJoin(){
  return state.phase === "waiting" && !state.inRound;
}
function canCash(){
  return state.phase === "flying" && state.inRound && !state.cashedOut;
}

// ===============================
// UI render
// ===============================
function render(){
  multText.textContent = fmt2(state.mult);

  if (state.phase === "waiting"){
    phaseText.textContent = "Ожидание — старт скоро";
    roundText.textContent = `Старт через ${Math.ceil(state.waitLeftMs/1000)}с`;
    ticker.textContent = `Новый раунд через ${Math.ceil(state.waitLeftMs/1000)}с…`;
  }
  if (state.phase === "flying"){
    phaseText.textContent = "Ракета набирает высоту…";
    roundText.textContent = "Раунд идёт";
    ticker.textContent = `🚀 Летим… текущий множитель ${fmt2(state.mult)}`;
  }
  if (state.phase === "crashed"){
    phaseText.textContent = `Краш на ${fmt2(state.crashMult)}`;
    roundText.textContent = "Краш";
    ticker.textContent = `💥 Краш на ${fmt2(state.crashMult)}. Новый раунд через 10с.`;
  }

  betStatus.textContent = state.inRound
    ? (state.cashedOut ? `забрал на ${fmt2(state.cashMult)}` : `${state.joinedBet} 🪙 в раунде`)
    : "не в раунде";

  joinBtn.disabled = !canJoin();
  cashBtn.disabled = !canCash();

  toggleSfx.classList.toggle("active", app.sfx);

  // keep bet input clamped
  const v = clampBet(betInput.value);
  betInput.value = String(v);
  state.bet = v;

  note.textContent = state.inRound
    ? (state.cashedOut ? "Ты уже забрал. Жди следующий раунд." : "Ты в раунде. Жми “Забрать” до краша.")
    : "Подсказка: вход только во время ожидания. В раунде можно забрать в любой момент.";
}

function hardResetPlayer(){
  state.inRound = false;
  state.joinedBet = 0;
  state.cashedOut = false;
  state.cashMult = 0;
}

// ===============================
// Round engine
// ===============================
function startWaiting(){
  state.phase = "waiting";
  state.waitLeftMs = 10000;
  state.mult = 1.00;
  state.crashMult = 0;
  state.startAt = 0;
  state.crashAt = 0;
  state.lastEngineTick = 0;

  resetRocketToPad();

  // new crash point prepared
  state.crashMult = sampleCrashMultiplier();

  // allow fresh join
  hardResetPlayer();

  render();
}

function startFlight(){
  state.phase = "flying";
  state.mult = 1.00;

  const now = performance.now();
  state.startAt = now;

  // derive time to crash based on crash multiplier:
  // growth curve: m(t) = 1 + a*t + b*t^2 (t in seconds)
  // Solve for t at crashMult
  const target = state.crashMult;
  const a = 0.35;   // linear grow
  const b = 0.045;  // accel grow
  // b t^2 + a t + (1 - target) = 0
  const c = (1 - target);
  let tCrash = 0;
  if (Math.abs(b) < 1e-9){
    tCrash = Math.max(0.4, (target-1)/a);
  } else {
    const D = a*a - 4*b*c;
    tCrash = (-a + Math.sqrt(Math.max(0, D))) / (2*b);
    tCrash = Math.max(0.6, tCrash);
  }
  state.crashAt = now + tCrash * 1000;

  // visuals
  rocketWrap.classList.add("launching");
  rocket.classList.add("shake");

  if (app.sfx) SFX.launch();

  render();
}

function endCrash(){
  state.phase = "crashed";
  state.mult = state.crashMult;

  // if player in round and not cashed out — lose bet (already deducted)
  if (state.inRound && !state.cashedOut){
    if (app.sfx) SFX.lose();
  }

  // stop visuals
  rocket.classList.remove("shake");
  rocketWrap.classList.remove("launching");

  // drop rocket slightly and fade flame
  setRocketPose({ y: 8, rot: 22, tilt: 28, scale: 1 });

  if (app.sfx) SFX.crash();

  render();

  // schedule next waiting
  setTimeout(startWaiting, 1000); // quick "crash moment"
}

// Main loop (RAF)
function tick(now){
  if (state.phase === "waiting"){
    const dt = 16; // approx
    state.waitLeftMs = Math.max(0, state.waitLeftMs - dt);

    // countdown tick sound each second boundary
    const secLeft = Math.ceil(state.waitLeftMs/1000);
    if (app.sfx && state.waitLeftMs > 0){
      // approximate per-second tick
      if (!tick._lastSecLeft) tick._lastSecLeft = secLeft;
      if (secLeft !== tick._lastSecLeft){
        tick._lastSecLeft = secLeft;
        SFX.countdownTick();
      }
    } else {
      tick._lastSecLeft = secLeft;
    }

    // idle rocket sway
    const sway = Math.sin(now/650) * 1.2;
    const bob = Math.sin(now/900) * 1.5;
    setRocketPose({ y: bob, rot: -8 + sway, tilt: 18, scale: 1 });

    state.mult = 1.00;

    if (state.waitLeftMs <= 0){
      tick._lastSecLeft = null;
      startFlight();
    }
    // UI
    render();
  }

  if (state.phase === "flying"){
    const t = Math.max(0, (now - state.startAt) / 1000);

    // growth curve
    const a = 0.35;
    const b = 0.045;
    const m = 1 + a*t + b*t*t;
    state.mult = Math.min(m, state.crashMult);

    // rocket flight path:
    // rise with multiplier, also drift slightly
    const height = Math.min(1, (state.mult-1) / Math.max(0.01, (state.crashMult-1)));
    const y = - (height * 320);                // up
    const rot = -12 + height * -10 + Math.sin(now/300)*0.6;
    const tilt = 18 + height * 20;
    const scale = 1 + height * 0.08;

    setRocketPose({ y, rot, tilt, scale });

    // engine loop sound
    if (app.sfx){
      if (now - state.lastEngineTick > 120){
        state.lastEngineTick = now;
        SFX.engineLoop();
      }
    }

    // if crash
    if (now >= state.crashAt - 1){
      endCrash();
    } else {
      render();
    }
  }

  requestAnimationFrame(tick);
}

// ===============================
// Controls
// ===============================
toggleSfx.addEventListener("click", async ()=>{
  await unlockAudio();
  app.sfx = !app.sfx;
  if (app.sfx) SFX.click();
  render();
});

bonusBtn.addEventListener("click", async ()=>{
  await unlockAudio();
  if (app.sfx) SFX.click();
  addCoins(1000);
  render();
});

document.querySelectorAll("[data-bet]").forEach(b=>{
  b.addEventListener("click", async ()=>{
    await unlockAudio();
    if (app.sfx) SFX.click();
    const v = b.dataset.bet;
    const next = (v==="max") ? wallet.coins : Number(v);
    betInput.value = String(clampBet(next));
    render();
  });
});

betMinus.addEventListener("click", async ()=>{
  await unlockAudio();
  if (app.sfx) SFX.click();
  betInput.value = String(clampBet((Number(betInput.value)||1) - 10));
  render();
});
betPlus.addEventListener("click", async ()=>{
  await unlockAudio();
  if (app.sfx) SFX.click();
  betInput.value = String(clampBet((Number(betInput.value)||1) + 10));
  render();
});
betInput.addEventListener("input", ()=> render());

joinBtn.addEventListener("click", async ()=>{
  await unlockAudio();
  if (!canJoin()) return;

  const bet = clampBet(betInput.value);
  if (bet <= 0) return;
  if (bet > wallet.coins){ alert("Недостаточно монет"); return; }

  // lock bet: deduct immediately
  addCoins(-bet);
  state.inRound = true;
  state.joinedBet = bet;
  state.cashedOut = false;
  state.cashMult = 0;

  if (app.sfx) SFX.join();
  render();
});

cashBtn.addEventListener("click", async ()=>{
  await unlockAudio();
  if (!canCash()) return;

  // payout = bet * current mult (rounded)
  const payout = Math.floor(state.joinedBet * state.mult);
  addCoins(payout);

  state.cashedOut = true;
  state.cashMult = state.mult;

  if (app.sfx) SFX.cash();
  render();
});

// ===============================
// Background: Aurora (canvas)
// ===============================
const aurora = document.getElementById("aurora");
const snow = document.getElementById("snow");
const aCtx = aurora.getContext("2d");
const sCtx = snow.getContext("2d");

function fitCanvas(c){
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const rect = c.getBoundingClientRect();
  c.width = Math.floor(rect.width * dpr);
  c.height = Math.floor(rect.height * dpr);
  return { w: c.width, h: c.height, dpr };
}

let A = fitCanvas(aurora);
let S = fitCanvas(snow);

window.addEventListener("resize", ()=>{
  A = fitCanvas(aurora);
  S = fitCanvas(snow);
  initSnow();
});

function drawAurora(t){
  const {w,h} = A;
  const ctx = aCtx;
  ctx.clearRect(0,0,w,h);

  // sky gradient
  const g = ctx.createLinearGradient(0,0,0,h);
  g.addColorStop(0, "rgba(10,14,35,1)");
  g.addColorStop(0.45, "rgba(8,10,18,1)");
  g.addColorStop(1, "rgba(5,6,12,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,w,h);

  // aurora ribbons
  const time = t/1000;
  for (let k=0;k<3;k++){
    const baseY = h*0.18 + k*h*0.08;
    const amp = h*(0.05 + k*0.01);
    const freq = 1.6 + k*0.4;
    const phase = time*(0.7 + k*0.25);

    ctx.beginPath();
    for (let x=0;x<=w;x+=10){
      const nx = x/w;
      const y = baseY
        + Math.sin(nx*freq*6.283 + phase)*amp
        + Math.sin(nx*(freq+0.7)*6.283 - phase*0.8)*amp*0.45;
      if (x===0) ctx.moveTo(x,y);
      else ctx.lineTo(x,y);
    }

    const col = [
      ["rgba(90,255,200,.0)","rgba(90,255,200,.22)","rgba(90,255,200,.0)"],
      ["rgba(120,120,255,.0)","rgba(120,120,255,.16)","rgba(120,120,255,.0)"],
      ["rgba(180,90,255,.0)","rgba(180,90,255,.14)","rgba(180,90,255,.0)"],
    ][k];

    ctx.lineWidth = h*0.11;
    ctx.lineCap = "round";
    const grad = ctx.createLinearGradient(0, baseY, 0, baseY + amp*2);
    grad.addColorStop(0, col[0]);
    grad.addColorStop(0.5, col[1]);
    grad.addColorStop(1, col[2]);
    ctx.strokeStyle = grad;
    ctx.stroke();
  }

  // stars
  ctx.globalAlpha = 0.9;
  for (let i=0;i<60;i++){
    const x = (i*977) % w;
    const y = ((i*541) % Math.floor(h*0.55));
    const tw = (Math.sin(time*2 + i)*0.5+0.5);
    ctx.fillStyle = `rgba(255,255,255,${0.15 + tw*0.25})`;
    ctx.fillRect(x,y,2,2);
  }
  ctx.globalAlpha = 1;
}

// ===============================
// Snow (canvas)
// ===============================
let flakes = [];
function initSnow(){
  const {w,h} = S;
  flakes = [];
  const count = Math.floor((w*h)/45000); // adaptive
  for (let i=0;i<count;i++){
    flakes.push({
      x: randFloat()*w,
      y: randFloat()*h,
      r: 0.8 + randFloat()*2.2,
      v: 0.25 + randFloat()*0.9,
      dx: -0.15 + randFloat()*0.3,
      a: 0.25 + randFloat()*0.55,
      p: randFloat()*Math.PI*2
    });
  }
}
initSnow();

function drawSnow(t){
  const {w,h} = S;
  const ctx = sCtx;
  ctx.clearRect(0,0,w,h);

  const wind = Math.sin(t/1400) * 0.35;

  for (const f of flakes){
    f.p += 0.01;
    f.x += (f.dx + wind) * (1.0 + f.r*0.08);
    f.y += f.v * (1.0 + f.r*0.10);

    if (f.x < -10) f.x = w + 10;
    if (f.x > w + 10) f.x = -10;
    if (f.y > h + 10){
      f.y = -10;
      f.x = randFloat()*w;
    }

    ctx.beginPath();
    ctx.fillStyle = `rgba(255,255,255,${f.a})`;
    ctx.arc(f.x, f.y, f.r + Math.sin(f.p)*0.15, 0, Math.PI*2);
    ctx.fill();
  }

  // low fog near ground
  const fog = ctx.createLinearGradient(0, h*0.55, 0, h);
  fog.addColorStop(0, "rgba(255,255,255,0)");
  fog.addColorStop(1, "rgba(255,255,255,0.06)");
  ctx.fillStyle = fog;
  ctx.fillRect(0, h*0.55, w, h*0.45);
}

// ===============================
// Start
// ===============================
function boot(){
  betInput.value = String(clampBet(betInput.value || 50));
  startWaiting();
  requestAnimationFrame(function loop(t){
    drawAurora(t);
    drawSnow(t);
    tick(t);
  });
}

// kick
boot();
