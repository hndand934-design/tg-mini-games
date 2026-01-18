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
const WALLET_KEY = "mini_wallet_dice_only_v1";
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
  renderTopBar();
}
function addCoins(d) { setCoins(wallet.coins + d); }

function renderTopBar() {
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
function audioCtx() {
  if (_ctx) return _ctx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  _ctx = Ctx ? new Ctx() : null;
  return _ctx;
}
async function unlockAudio() {
  const ctx = audioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch {}
  }
}
function tone({ type="sine", f=440, t=0.08, g=0.06, when=0 }) {
  const ctx = audioCtx(); if (!ctx) return;
  const now = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const gain = ctx.createGain();
  const filt = ctx.createBiquadFilter();

  o.type = type;
  o.frequency.setValueAtTime(f, now);

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
function noise({ t=0.10, g=0.02, when=0, hp=900 }) {
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
  roll(){
    noise({t:0.11, g:0.015, hp:800});
    tone({type:"square", f:220, t:0.06, g:0.03, when:0.02});
  },
  win(){
    tone({type:"sine", f:740, t:0.10, g:0.05});
    tone({type:"sine", f:932, t:0.12, g:0.045, when:0.05});
    tone({type:"sine", f:1244, t:0.14, g:0.04, when:0.10});
  },
  lose(){
    tone({type:"sine", f:220, t:0.16, g:0.06});
    tone({type:"sine", f:165, t:0.18, g:0.05, when:0.06});
  }
};
document.addEventListener("pointerdown", unlockAudio, { once:false });

// ===============================
// Dice state (D6 only for now)
// ===============================
const app = { sfx:true };

const diceState = {
  sides: 6,          // сейчас делаем D6 (как на твоём скрине). D2 можно добавить потом.
  mode: "below",     // below/above
  threshold: 5,      // как на скрине
  bet: 100,
  rolling: false,
  lastRoll: null,
  msg: "",
  msgKind: "",
};

// шанс
function diceChance(sides, mode, threshold){
  if(mode==="below") return threshold / sides;          // win if roll <= threshold
  return (sides - threshold + 1) / sides;              // win if roll >= threshold
}

// множитель с “house edge”
function diceMultiplier(chance){
  const edge = 0.98; // 2%
  // не даём меньше 1.02, чтобы не было “нулевых” коэффициентов
  return Math.max(1.02, edge / chance);
}

// запрет 100%
function diceClampThreshold(){
  const s = diceState.sides;
  if(diceState.mode==="below"){
    if(diceState.threshold >= s) diceState.threshold = s-1; // запрет 6/6
    if(diceState.threshold < 1) diceState.threshold = 1;
  } else {
    if(diceState.threshold <= 1) diceState.threshold = 2;   // запрет 1/6 в “>=”
    if(diceState.threshold > s) diceState.threshold = s;
  }
}

// кубик html (грани 1..6)
function facePips(n){
  const map = {
    1:[0,0,0,0,1,0,0,0,0],
    2:[1,0,0,0,0,0,0,0,1],
    3:[1,0,0,0,1,0,0,0,1],
    4:[1,0,1,0,0,0,1,0,1],
    5:[1,0,1,0,1,0,1,0,1],
    6:[1,0,1,1,0,1,1,0,1],
  };
  return map[n];
}
function renderCubeFace(n){
  const arr = facePips(n);
  return `
    <div class="face f${n}">
      <div class="pipGrid">
        ${arr.map(v=>`<div class="pip ${v?"":"off"}"></div>`).join("")}
      </div>
    </div>
  `;
}

function playClick(){ if(app.sfx) SFX.click(); }

// ===============================
// Render
// ===============================
function renderDice(){
  diceClampThreshold();

  // clamp bet
  diceState.bet = Math.floor(Number(diceState.bet)||1);
  if(diceState.bet < 1) diceState.bet = 1;
  if(diceState.bet > wallet.coins) diceState.bet = wallet.coins;

  const s = diceState.sides;
  const chance = diceChance(s, diceState.mode, diceState.threshold);
  const mult = diceMultiplier(chance);
  const payout = Math.floor(diceState.bet * mult);

  const winText = (diceState.mode==="below")
    ? `Выигрыш если выпало ≤ ${diceState.threshold}`
    : `Выигрыш если выпало ≥ ${diceState.threshold}`;

  screenEl.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <h2 class="h1">Dice</h2>
          <div class="hint">Непрозрачный 3D кубик. Выпало число — куб показывает эту грань (100% шанс запрещён).</div>
        </div>
        <div class="spacer"></div>
        <button class="chip ${app.sfx ? "active":""}" id="toggleSfx">Звук</button>
      </div>

      <div class="row" style="margin-top:10px;">
        <button class="chip ${diceState.mode==="below"?"active":""}" data-mode="below">Меньше</button>
        <button class="chip ${diceState.mode==="above"?"active":""}" data-mode="above">Больше</button>
        <div class="spacer"></div>
        <div class="rulePill">${winText}</div>
      </div>

      <div class="kpis">
        <div class="kpi"><div class="t">Множитель</div><div class="v">x${mult.toFixed(2)}</div></div>
        <div class="kpi"><div class="t">Возможный выигрыш</div><div class="v">+${payout} 🪙</div></div>
        <div class="kpi"><div class="t">Шанс</div><div class="v">${(chance*100).toFixed(1)}%</div></div>
      </div>

      <div style="margin-top:10px;">
        <div class="row" style="justify-content:space-between;">
          <div style="font-weight:950;">Порог: <b id="thLabel">${diceState.threshold}</b> из ${s}</div>
          <div class="pill">Выпало: <b>${diceState.lastRoll==null ? "—" : diceState.lastRoll}</b></div>
        </div>
        <input class="range" id="threshold" type="range" min="1" max="${s}" value="${diceState.threshold}">
        <div class="hint" id="limitHint" style="margin-top:6px;"></div>
      </div>

      <div class="diceArena" id="diceArena">
        <div class="diceShadow"></div>
        <div class="dice3dWrap">
          <div class="cube ${diceState.lastRoll ? "show-"+diceState.lastRoll : "show-1"}" id="cube">
            ${renderCubeFace(1)}
            ${renderCubeFace(2)}
            ${renderCubeFace(3)}
            ${renderCubeFace(4)}
            ${renderCubeFace(5)}
            ${renderCubeFace(6)}
          </div>
        </div>
      </div>

      <div class="row" style="margin-top:12px;">
        <div style="min-width:260px; width: 320px;">
          <div class="row" style="justify-content:space-between;">
            <div class="h1" style="font-size:14px;">Ставка</div>
            <button class="btnGhost" id="bonus">+1000 🪙</button>
          </div>
          <div class="chips" style="margin-top:8px;">
            ${[10,50,100,250,500].map(v=>`<button class="chip" data-bet="${v}">${v}</button>`).join("")}
            <button class="chip" data-bet="max">MAX</button>
          </div>
          <div class="row" style="margin-top:8px;">
            <button class="btnGhost" id="betMinus">-</button>
            <input class="input" id="bet" type="number" min="1" step="1" value="${diceState.bet}">
            <button class="btnGhost" id="betPlus">+</button>
          </div>
        </div>

        <div class="spacer"></div>

        <button class="btn" id="rollBtn" style="min-width:260px;" ${diceState.rolling?"disabled":""}>
          Бросить
        </button>
      </div>

      <div class="msg ${diceState.msgKind||""}" id="msg">${diceState.msg||""}</div>
    </div>
  `;

  // bind
  document.getElementById("toggleSfx").onclick = ()=>{ app.sfx = !app.sfx; renderDice(); };

  document.querySelectorAll("[data-mode]").forEach(b=>{
    b.onclick = ()=>{
      playClick();
      diceState.mode = b.dataset.mode;
      diceState.lastRoll = null;
      diceState.msg = "";
      diceState.msgKind = "";
      diceClampThreshold();
      renderDice();
    };
  });

  const th = document.getElementById("threshold");
  const thLabel = document.getElementById("thLabel");
  const limitHint = document.getElementById("limitHint");

  th.oninput = ()=>{
    diceState.threshold = Number(th.value);
    diceClampThreshold();
    th.value = String(diceState.threshold);
    thLabel.textContent = String(diceState.threshold);

    if(diceState.mode==="below" && diceState.threshold===diceState.sides-1){
      limitHint.textContent = "⚠️ 100% шанс запрещён: максимум порога = 5 (для D6).";
    } else if(diceState.mode==="above" && diceState.threshold===2){
      limitHint.textContent = "⚠️ 100% шанс запрещён: минимум порога = 2 (для D6).";
    } else {
      limitHint.textContent = "";
    }
    renderDice();
  };

  const betInput = document.getElementById("bet");
  const clampBet = ()=>{
    let v = Math.floor(Number(betInput.value)||0);
    if(v<1) v=1;
    if(v>wallet.coins) v=wallet.coins;
    betInput.value = String(v);
    diceState.bet = v;
  };
  betInput.oninput = clampBet;
  document.getElementById("betMinus").onclick = ()=>{ playClick(); betInput.value = String((Number(betInput.value)||1)-10); clampBet(); };
  document.getElementById("betPlus").onclick  = ()=>{ playClick(); betInput.value = String((Number(betInput.value)||1)+10); clampBet(); };

  document.querySelectorAll("[data-bet]").forEach(b=>{
    b.onclick = ()=>{
      playClick();
      const v = b.dataset.bet;
      betInput.value = (v==="max") ? String(wallet.coins) : String(v);
      clampBet();
    };
  });

  document.getElementById("bonus").onclick = ()=>{ playClick(); addCoins(1000); renderDice(); };

  document.getElementById("rollBtn").onclick = async ()=>{
    await unlockAudio();
    clampBet();
    diceClampThreshold();

    // жёсткая защита от 100%
    const chance = diceChance(diceState.sides, diceState.mode, diceState.threshold);
    if(chance >= 0.999){
      alert("Запрещено ставить с шансом 100% (иначе можно багать баланс).");
      return;
    }

    if(diceState.rolling) return;
    if(diceState.bet <= 0) return;
    if(diceState.bet > wallet.coins){ alert("Недостаточно монет"); return; }

    addCoins(-diceState.bet);

    diceState.rolling = true;
    diceState.msg = "Бросок...";
    diceState.msgKind = "";
    renderTopBar();

    if(app.sfx) SFX.roll();

    const roll = randInt(1, diceState.sides);
    const win = (diceState.mode==="below")
      ? (roll <= diceState.threshold)
      : (roll >= diceState.threshold);

    const arena = document.getElementById("diceArena");
    const cube = document.getElementById("cube");

    // старт анимации
    arena.classList.add("throwing");

    // выставляем правильную грань ближе к концу (гарантия совпадения)
    setTimeout(()=>{
      cube.className = "cube show-" + roll;
    }, 860);

    setTimeout(()=>{
      arena.classList.remove("throwing");
      finish(roll, win);
    }, 1120);
  };

  function finish(roll, win){
    const chance = diceChance(diceState.sides, diceState.mode, diceState.threshold);
    const mult = diceMultiplier(chance);
    const payout = Math.floor(diceState.bet * mult);

    diceState.lastRoll = roll;

    if(win){
      addCoins(payout);
      diceState.msg = `✅ Выпало ${roll}. Выигрыш +${payout} 🪙 (x${mult.toFixed(2)})`;
      diceState.msgKind = "ok";
      if(app.sfx) SFX.win();
    } else {
      diceState.msg = `❌ Выпало ${roll}. Проигрыш -${diceState.bet} 🪙`;
      diceState.msgKind = "bad";
      if(app.sfx) SFX.lose();
    }

    diceState.rolling = false;
    renderTopBar();
    renderDice();
  }
}

// init
renderDice();

// стартуем
renderCoinFlip();
