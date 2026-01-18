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
// Telegram WebApp
// ===============================
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const screenEl = document.getElementById("screen");
const userEl = document.getElementById("user");
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
function saveWallet(w){ localStorage.setItem(WALLET_KEY, JSON.stringify(w)); }
let wallet = loadWallet();

function setCoins(v){
  wallet.coins = Math.max(0, Math.floor(v));
  saveWallet(wallet);
  renderTopBar();
}
function addCoins(d){ setCoins(wallet.coins + d); }

function renderTopBar(){
  userEl.textContent = user
    ? `Привет, ${user.first_name} · открыто в Telegram`
    : `Открыто вне Telegram`;
  balancePill.textContent = `🪙 ${wallet.coins}`;
}
renderTopBar();

// ===============================
// Audio (WebAudio, no files)
// ===============================
let _ctx = null;
function audioCtx(){
  if (_ctx) return _ctx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  _ctx = Ctx ? new Ctx() : null;
  return _ctx;
}
async function unlockAudio(){
  const ctx = audioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch {}
  }
}
document.addEventListener("pointerdown", unlockAudio, { passive:true });

function tone({type="sine", f=440, t=0.08, g=0.06, when=0, detune=0}){
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
function noise({t=0.10, g=0.02, when=0, hp=900}){
  const ctx = audioCtx(); if (!ctx) return;
  const now = ctx.currentTime + when;
  const bufferSize = Math.floor(ctx.sampleRate * t);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i=0;i<bufferSize;i++){
    data[i] = (Math.random()*2-1) * (1 - i/bufferSize);
  }
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
  click(){ tone({type:"triangle", f:520, t:0.05, g:0.035}); tone({type:"triangle", f:320, t:0.06, g:0.02, when:0.01}); },
  start(){ noise({t:0.10,g:0.014,hp:900}); tone({type:"square", f:240, t:0.07, g:0.03, when:0.02}); },
  tick(){ tone({type:"sine", f:720, t:0.03, g:0.02}); },
  cash(){ tone({type:"sine", f:740, t:0.10, g:0.05}); tone({type:"sine", f:932, t:0.12, g:0.045, when:0.05}); tone({type:"sine", f:1244, t:0.14, g:0.04, when:0.10}); },
  crash(){ noise({t:0.16,g:0.03,hp:550}); tone({type:"sawtooth", f:160, t:0.22, g:0.05, when:0.02}); },
};

const app = { sfx:true };

// ===============================
// Crash / Rocket game
// ===============================
const crash = {
  phase: "countdown",     // countdown | running | crashed
  countdown: 10,
  t0: 0,
  mult: 1.00,
  crashPoint: 2.00,       // random each round
  runningTimer: null,
  cdTimer: null,

  bet: 50,
  inBet: false,           // placed bet for current round
  betLocked: 0,
  cashed: false,
  cashMult: 0,
  msg: "",
  msgKind: "",
};

function newCrashPoint(){
  // "честный" распределённый краш: 1/(1-r) даёт длинные хвосты
  // ограничим сверху для UI
  const r = randFloat();
  const raw = 1 / (1 - Math.min(0.9995, r));
  const p = Math.max(1.05, Math.min(raw, 50));
  // чуть "красивее" округлим
  return Math.round(p * 100) / 100;
}

function resetRoundToCountdown(){
  crash.phase = "countdown";
  crash.countdown = 10;
  crash.mult = 1.00;
  crash.msg = "Новый раунд скоро…";
  crash.msgKind = "";
  crash.cashed = false;
  crash.cashMult = 0;

  // ставка: если человек НЕ зашёл — можно менять
  // если зашёл — ставка уже списана/зафиксирована на раунд
  crash.inBet = false;
  crash.betLocked = 0;

  crash.crashPoint = newCrashPoint();

  renderCrash();
  startCountdown();
}

function startCountdown(){
  clearInterval(crash.cdTimer);
  let lastInt = crash.countdown;

  crash.cdTimer = setInterval(()=>{
    crash.countdown -= 1;
    if (app.sfx && crash.countdown <= 5 && crash.countdown >= 1) SFX.tick();
    if (crash.countdown <= 0){
      clearInterval(crash.cdTimer);
      startRunning();
      return;
    }
    if (Math.floor(crash.countdown) !== lastInt){
      lastInt = Math.floor(crash.countdown);
    }
    renderCrashHudOnly();
  }, 1000);
}

function startRunning(){
  crash.phase = "running";
  crash.t0 = performance.now();
  crash.mult = 1.00;
  crash.msg = "Раунд начался! Забирай до краша.";
  crash.msgKind = "";
  if (app.sfx) SFX.start();

  renderCrash();

  clearInterval(crash.runningTimer);
  crash.runningTimer = setInterval(()=>{
    const t = (performance.now() - crash.t0) / 1000;
    // рост как "краш": плавно + ускорение
    const m = 1 + t * 0.9 + t * t * 0.16;
    crash.mult = Math.max(1.00, m);

    // проверка на краш
    if (crash.mult >= crash.crashPoint){
      crash.mult = crash.crashPoint;
      onCrash();
      return;
    }
    renderCrashHudOnly();
  }, 50);
}

function onCrash(){
  clearInterval(crash.runningTimer);
  crash.phase = "crashed";

  // если человек был в ставке и не успел
  if (crash.inBet && !crash.cashed){
    crash.msg = `💥 Краш на x${crash.crashPoint.toFixed(2)} — ты не успел. -${crash.betLocked} 🪙`;
    crash.msgKind = "bad";
  } else if (crash.cashed){
    crash.msg = `✅ Успел на x${crash.cashMult.toFixed(2)}. Новый раунд через 10с.`;
    crash.msgKind = "ok";
  } else {
    crash.msg = `💥 Краш на x${crash.crashPoint.toFixed(2)}. Новый раунд через 10с.`;
    crash.msgKind = "";
  }

  renderCrash(true);

  // следующий раунд через 10 сек
  setTimeout(()=> resetRoundToCountdown(), 1000);
}

function tryEnterBet(){
  // можно входить ТОЛЬКО в countdown
  if (crash.phase !== "countdown") return;

  const bet = Math.floor(Number(crash.bet) || 0);
  if (bet <= 0) { alert("Ставка должна быть больше 0"); return; }
  if (bet > wallet.coins) { alert("Недостаточно монет"); return; }

  addCoins(-bet);
  crash.inBet = true;
  crash.betLocked = bet;
  crash.cashed = false;
  crash.cashMult = 0;
  crash.msg = `Ты в игре: ставка ${bet} 🪙. Жди старт раунда.`;
  crash.msgKind = "";

  if (app.sfx) SFX.click();
  renderCrash();
}

function tryCashOut(){
  if (crash.phase !== "running") return;
  if (!crash.inBet || crash.cashed) return;

  crash.cashed = true;
  crash.cashMult = crash.mult;
  const payout = Math.floor(crash.betLocked * crash.cashMult);
  addCoins(payout);

  crash.msg = `💰 Забрал: +${payout} 🪙 (x${crash.cashMult.toFixed(2)})`;
  crash.msgKind = "ok";
  if (app.sfx) SFX.cash();

  renderCrash();
}

function setBetValue(v){
  crash.bet = v;
}

// ===============================
// Canvas background (snow + aurora)
// ===============================
let sky = null;
let skyCtx = null;
let W = 0, H = 0;
const snow = [];
const aurora = { t: 0 };

function initSky(canvas){
  sky = canvas;
  skyCtx = canvas.getContext("2d", { alpha:true });

  const resize = ()=>{
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(2, Math.floor(r.width * devicePixelRatio));
    canvas.height = Math.max(2, Math.floor(r.height * devicePixelRatio));
    W = canvas.width;
    H = canvas.height;
  };
  resize();
  window.addEventListener("resize", resize);

  snow.length = 0;
  for (let i=0;i<140;i++){
    snow.push({
      x: randFloat() * W,
      y: randFloat() * H,
      r: 0.7 + randFloat()*2.2,
      v: 0.35 + randFloat()*1.25,
      drift: (randFloat()*2-1) * 0.35,
      a: 0.25 + randFloat()*0.65
    });
  }

  const loop = ()=>{
    drawSky();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function drawSky(){
  if (!skyCtx) return;
  const ctx = skyCtx;

  // clear
  ctx.clearRect(0,0,W,H);

  // aurora ribbons
  aurora.t += 0.008;
  const t = aurora.t;

  // gradient base
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0, "rgba(10,14,40,0.0)");
  g.addColorStop(0.25, "rgba(10,14,40,0.25)");
  g.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,W,H);

  // aurora curves
  for (let k=0;k<3;k++){
    ctx.save();
    ctx.globalAlpha = 0.16 + 0.06*k;

    const grad = ctx.createLinearGradient(0,0,W,0);
    grad.addColorStop(0, "rgba(60,255,181,0.00)");
    grad.addColorStop(0.35, "rgba(60,255,181,0.35)");
    grad.addColorStop(0.7, "rgba(76,133,255,0.28)");
    grad.addColorStop(1, "rgba(255,90,106,0.00)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = (18 + 10*k) * devicePixelRatio;
    ctx.lineCap = "round";

    ctx.beginPath();
    const y0 = (0.22 + k*0.10) * H;
    for (let x=0; x<=W; x+= Math.max(6, Math.floor(W/30))){
      const nx = x / W;
      const y = y0 + Math.sin(nx*4.2 + t*1.8 + k)* (28*devicePixelRatio)
                  + Math.sin(nx*11.2 + t*1.1 + k*2)* (12*devicePixelRatio);
      if (x===0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // stars
  ctx.save();
  ctx.globalAlpha = 0.35;
  for (let i=0;i<65;i++){
    const x = (i*131 % 997)/997 * W;
    const y = (i*271 % 887)/887 * H * 0.55;
    const tw = 0.35 + 0.65*Math.abs(Math.sin(t*1.7 + i));
    ctx.fillStyle = `rgba(255,255,255,${0.10 + 0.12*tw})`;
    ctx.fillRect(x, y, 1.2*devicePixelRatio, 1.2*devicePixelRatio);
  }
  ctx.restore();

  // snow
  for (const s of snow){
    s.y += s.v * devicePixelRatio;
    s.x += s.drift * devicePixelRatio;
    if (s.y > H + 5) { s.y = -10; s.x = randFloat()*W; }
    if (s.x < -10) s.x = W + 10;
    if (s.x > W + 10) s.x = -10;

    ctx.beginPath();
    ctx.fillStyle = `rgba(255,255,255,${s.a})`;
    ctx.arc(s.x, s.y, s.r*devicePixelRatio, 0, Math.PI*2);
    ctx.fill();
  }
}

// ===============================
// UI render
// ===============================
function renderCrash(forceFlash=false){
  screenEl.innerHTML = `
    <div class="card">
      <div class="grid2">
        <div class="card" style="background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.08);">
          <div class="arena">
            <canvas id="sky"></canvas>
            <div class="arenaOverlay"></div>

            <div class="hud">
              <div class="hudBox">
                <div class="hudBig" id="hudMult">x${crash.mult.toFixed(2)}</div>
                <div class="hudSmall" id="hudPhase">${phaseText()}</div>
              </div>

              <div class="hudBox">
                <div class="hudSmall">Раунд</div>
                <div style="font-weight:1000;font-size:14px;">
                  ${crash.phase==="countdown"
                    ? `Старт через <b id="hudCd">${crash.countdown}</b>с`
                    : (crash.phase==="running" ? `Идёт` : `Краш`)}
                </div>
              </div>

              <div class="hudBox">
                <div class="hudSmall">Твоя ставка</div>
                <div style="font-weight:1000;font-size:14px;">
                  ${crash.inBet ? `<b>${crash.betLocked} 🪙</b>` : `<span style="opacity:.75">не в раунде</span>`}
                </div>
              </div>
            </div>

            <div class="rocketWrap ${crash.phase==="running" ? "flying":""}">
              <div class="smoke"></div>
              <div class="rocket">
                <div class="rocketBody">
                  <div class="window"></div>
                </div>
                <div class="flame"></div>
              </div>
            </div>

            <div class="crashFlash ${forceFlash && crash.phase==="crashed" ? "on":""}" id="crashFlash"></div>
          </div>

          <div style="padding:12px;">
            <div class="row">
              <button class="chip ${app.sfx ? "active":""}" id="toggleSfx">Звук</button>
              <div class="spacer"></div>
              <div class="pill">Краш-поинт скрыт (честный RNG)</div>
            </div>

            <div class="msg ${crash.msgKind||""}" id="msg">${crash.msg||""}</div>
          </div>
        </div>

        <div class="card" style="background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.08); padding:12px;">
          <div class="row">
            <h2 class="h1">Ставка</h2>
            <div class="spacer"></div>
            <button class="btnGhost" id="bonus">+1000 🪙</button>
          </div>

          <div class="hint" style="margin-top:6px;">
            Вход в раунд — только во время ожидания (10 секунд).  
            В раунде жми “Забрать” до краша.
          </div>

          <div class="chips">
            ${[10,50,100,250,500].map(v=>`<button class="chip" data-bet="${v}">${v}</button>`).join("")}
            <button class="chip" data-bet="max">MAX</button>
          </div>

          <div class="row" style="margin-top:10px;">
            <button class="btnGhost" id="betMinus">-</button>
            <input class="input" id="bet" type="number" min="1" step="1" value="${crash.bet}">
            <button class="btnGhost" id="betPlus">+</button>
          </div>

          <div class="row" style="margin-top:12px;">
            <button class="btn" id="enter" style="flex:1;" ${crash.phase==="countdown" && !crash.inBet ? "" : "disabled"}>
              Войти в раунд
            </button>
            <button class="btnGhost" id="cash" style="flex:1;" ${crash.phase==="running" && crash.inBet && !crash.cashed ? "" : "disabled"}>
              Забрать
            </button>
          </div>

          <div class="hint" style="margin-top:10px;">
            Подсказка: если ты “в раунде”, ставка зафиксирована.  
            Новый раунд начнётся автоматически.
          </div>
        </div>
      </div>
    </div>
  `;

  // init canvas
  initSky(document.getElementById("sky"));

  // bind
  document.getElementById("toggleSfx").onclick = ()=>{ app.sfx = !app.sfx; if(app.sfx) SFX.click(); renderCrash(); };

  const betInput = document.getElementById("bet");
  const clampBet = ()=>{
    let v = Math.floor(Number(betInput.value)||0);
    if (v < 1) v = 1;
    if (v > wallet.coins) v = wallet.coins;
    betInput.value = String(v);
    setBetValue(v);
  };
  clampBet();

  document.querySelectorAll("[data-bet]").forEach(b=>{
    b.onclick = ()=>{
      if (app.sfx) SFX.click();
      const val = b.dataset.bet;
      betInput.value = (val==="max") ? String(wallet.coins) : String(val);
      clampBet();
      renderTopBar();
    };
  });

  document.getElementById("betMinus").onclick = ()=>{ if(app.sfx) SFX.click(); betInput.value = String((Number(betInput.value)||1)-10); clampBet(); };
  document.getElementById("betPlus").onclick  = ()=>{ if(app.sfx) SFX.click(); betInput.value = String((Number(betInput.value)||1)+10); clampBet(); };

  betInput.oninput = clampBet;

  document.getElementById("bonus").onclick = ()=>{ if(app.sfx) SFX.click(); addCoins(1000); renderCrash(); };

  document.getElementById("enter").onclick = async ()=>{ await unlockAudio(); tryEnterBet(); };
  document.getElementById("cash").onclick  = async ()=>{ await unlockAudio(); tryCashOut(); };
}

function phaseText(){
  if (crash.phase === "countdown") return `Ожидание · старт через ${crash.countdown}с`;
  if (crash.phase === "running") return `Игра идёт · успей забрать`;
  return `Краш на x${crash.crashPoint.toFixed(2)}`;
}

// лёгкое обновление без пересоздания canvas каждый тик
function renderCrashHudOnly(){
  const multEl = document.getElementById("hudMult");
  if (multEl) multEl.textContent = `x${crash.mult.toFixed(2)}`;

  const phaseEl = document.getElementById("hudPhase");
  if (phaseEl) phaseEl.textContent = phaseText();

  const cdEl = document.getElementById("hudCd");
  if (cdEl && crash.phase==="countdown") cdEl.textContent = String(crash.countdown);
}

// старт
crash.crashPoint = newCrashPoint();
crash.msg = "Готово. Входи в раунд во время ожидания.";
renderCrash();
startCountdown();

// init
resetRound();
render();
