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
const btnSfx = document.getElementById("btnSfx");
const user = tg?.initDataUnsafe?.user;

// ===============================
// Wallet (local)
// ===============================
const WALLET_KEY = "mini_wallet_v3";
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
  renderTop();
}
function addCoins(d){ setCoins(wallet.coins + d); }

function renderTop(){
  const coins = wallet.coins;
  userEl.textContent = user
    ? `Привет, ${user.first_name} · 🪙 ${coins}`
    : `Открыто вне Telegram · 🪙 ${coins}`;
}
renderTop();

// ===============================
// Audio (WebAudio, modern)
// ===============================
let SFX_ENABLED = true;
btnSfx.classList.toggle("on", SFX_ENABLED);

let _ctx = null;
function audioCtx() {
  if (_ctx) return _ctx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  _ctx = Ctx ? new Ctx() : null;
  return _ctx;
}
async function ensureAudio() {
  if (!SFX_ENABLED) return;
  const ctx = audioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") { try { await ctx.resume(); } catch {} }
}

function tone({type="sine", f=440, t=0.08, g=0.06, when=0, detune=0}) {
  if (!SFX_ENABLED) return;
  const ctx = audioCtx(); if (!ctx) return;
  const now = ctx.currentTime + when;

  const o = ctx.createOscillator();
  const gn = ctx.createGain();
  const filt = ctx.createBiquadFilter();

  o.type = type;
  o.frequency.setValueAtTime(f, now);
  o.detune.setValueAtTime(detune, now);

  filt.type = "lowpass";
  filt.frequency.setValueAtTime(12000, now);

  gn.gain.setValueAtTime(0.0001, now);
  gn.gain.exponentialRampToValueAtTime(g, now + 0.01);
  gn.gain.exponentialRampToValueAtTime(0.0001, now + t);

  o.connect(filt);
  filt.connect(gn);
  gn.connect(ctx.destination);

  o.start(now);
  o.stop(now + t + 0.02);
}

function noise({t=0.10, g=0.03, when=0, hp=900}) {
  if (!SFX_ENABLED) return;
  const ctx = audioCtx(); if (!ctx) return;
  const now = ctx.currentTime + when;

  const bufferSize = Math.floor(ctx.sampleRate * t);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * (1 - i/bufferSize);

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const gn = ctx.createGain();
  gn.gain.setValueAtTime(g, now);
  gn.gain.exponentialRampToValueAtTime(0.0001, now + t);

  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(hp, now);

  src.connect(filter);
  filter.connect(gn);
  gn.connect(ctx.destination);

  src.start(now);
  src.stop(now + t + 0.02);
}

// global UI clicks
function sfxClick(){ tone({type:"triangle", f:520, t:0.05, g:0.04}); }

// coin
function sfxCoinStart(){
  noise({t:0.12,g:0.026,hp:1200,when:0});
  tone({type:"triangle",f:420,t:0.11,g:0.03,when:0.01});
  tone({type:"triangle",f:320,t:0.11,g:0.02,when:0.02});
}
function sfxCoinImpact(){
  tone({type:"sine",f:980,t:0.06,g:0.05,when:0});
  tone({type:"sine",f:1560,t:0.05,g:0.03,when:0.01});
  noise({t:0.06,g:0.014,hp:2600,when:0.005});
}
function sfxWin(){
  tone({type:"sine", f:740, t:0.10, g:0.05, when:0});
  tone({type:"sine", f:932, t:0.12, g:0.045, when:0.05});
  tone({type:"sine", f:1244,t:0.14, g:0.040, when:0.10});
}
function sfxLose(){
  tone({type:"sine", f:220, t:0.16, g:0.06, when:0});
  tone({type:"sine", f:165, t:0.18, g:0.05, when:0.06});
}

// dice
function sfxRoll(){ noise({t:0.14,g:0.020,hp:900,when:0}); tone({type:"triangle",f:240,t:0.12,g:0.02,when:0}); }
function sfxHit(){ tone({type:"sine",f:220,t:0.06,g:0.06,when:0}); noise({t:0.05,g:0.012,hp:1800,when:0.005}); }

// mines
function sfxTile(){ tone({type:"triangle",f:560,t:0.06,g:0.04}); }
function sfxMine(){ noise({t:0.16,g:0.035,hp:600,when:0}); tone({type:"sine",f:120,t:0.18,g:0.06,when:0.03}); }
function sfxCash(){ tone({type:"sine",f:660,t:0.10,g:0.05,when:0}); tone({type:"sine",f:880,t:0.12,g:0.045,when:0.06}); }

btnSfx.onclick = async () => {
  SFX_ENABLED = !SFX_ENABLED;
  btnSfx.classList.toggle("on", SFX_ENABLED);
  if (SFX_ENABLED) await ensureAudio();
  sfxClick();
};

// ===============================
// Navigation
// ===============================
let currentScreen = "coin";
document.querySelectorAll(".nav button").forEach(btn=>{
  btn.onclick = async ()=>{
    await ensureAudio();
    sfxClick();
    document.querySelectorAll(".nav button").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    setScreen(btn.dataset.screen);
  };
});

function setScreen(name){
  currentScreen = name;
  if (name === "coin") renderCoin();
  else if (name === "dice") renderDice();
  else renderMines();
}

// ===============================
// COIN FLIP
// ===============================
const coin = {
  choice: "heads",
  bet: 50,
  busy: false,
  streakOn: true,
  streakIndex: 0,
  steps: [1.94, 3.88, 7.76, 15.52],
  last: null,        // heads/tails
  msg: ""
};

function coinMult(){
  if (!coin.streakOn) return 1.94;
  return coin.steps[Math.min(coin.streakIndex, coin.steps.length - 1)];
}

function renderCoin(){
  // clamp bet
  coin.bet = Math.max(1, Math.min(wallet.coins, Math.floor(Number(coin.bet)||50)));

  const m = coinMult();
  const pot = Math.floor(coin.bet * m);

  const coinClass =
    coin.last === "heads" ? "gold" :
    coin.last === "tails" ? "silver" :
    "purple";

  screenEl.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <div class="h1">Coin Flip</div>
          <div class="h2">Фиолетовая монета в полёте — после броска становится золотой (орёл) или серебряной (решка).</div>
        </div>
        <div class="spacer"></div>
        <span class="chip">Баланс: <b>🪙 ${wallet.coins}</b></span>
      </div>

      <div class="grid2" style="margin-top:12px;">
        <div class="card" style="margin:0;">
          <div class="stage">
            <div class="shadow" id="coinShadow"></div>
            <div class="coin3d ${coinClass}" id="coinEl">
              <div class="rim"></div>
              <div class="face front"><div class="coinLabel">ОРЁЛ</div></div>
              <div class="face back"><div class="coinLabel">РЕШКА</div></div>
            </div>
          </div>

          <div class="row" style="margin-top:10px;">
            <button class="chip ${coin.choice==="heads"?"active":""}" id="cHeads" ${coin.busy?"disabled":""}>🦅 Орёл</button>
            <button class="chip ${coin.choice==="tails"?"active":""}" id="cTails" ${coin.busy?"disabled":""}>🌙 Решка</button>

            <div class="spacer"></div>

            <button class="pill ${coin.streakOn?"on":""}" id="cStreak" ${coin.busy?"disabled":""}>Серия</button>
          </div>

          <div class="kpi">
            <div class="box"><div class="t">Множитель</div><div class="v">x${m.toFixed(2)}</div></div>
            <div class="box"><div class="t">Возможный выигрыш</div><div class="v">+${pot} 🪙</div></div>
            <div class="box"><div class="t">Статус</div><div class="v">${coin.busy?"В воздухе…":"Готов"}</div></div>
          </div>

          <div class="row" style="margin-top:10px;">
            <button class="btn" id="cThrow" style="flex:1;" ${coin.busy?"disabled":""}>Бросить</button>
            <button class="btn ghost" id="cCash" ${coin.streakOn && coin.streakIndex>0 && !coin.busy ? "" : "disabled"}>Забрать</button>
          </div>

          <div class="msg ${coin.msg.startsWith("✅")?"ok":coin.msg.startsWith("❌")?"bad":""}" id="cMsg">${coin.msg||""}</div>
        </div>

        <div class="card" style="margin:0;">
          <div class="row">
            <div class="h1">Ставка</div>
            <div class="spacer"></div>
            <button class="pill" id="cBonus">+1000 🪙</button>
          </div>

          <div class="row" style="margin-top:10px;">
            ${[10,50,100,250,500].map(v=>`<button class="chip" data-b="${v}">${v}</button>`).join("")}
            <button class="chip" data-b="max">MAX</button>
          </div>

          <div class="row" style="margin-top:10px;">
            <button class="miniBtn" id="cMinus">-</button>
            <input class="input" id="cBet" type="number" min="1" step="1" value="${coin.bet}">
            <button class="miniBtn" id="cPlus">+</button>
          </div>

          <div class="h2" style="margin-top:10px;">
            Серия: при выигрыше шаг множителя растёт, при проигрыше сбрасывается. Сторону можно менять каждый бросок.
          </div>

          <div class="row" style="margin-top:10px;">
            ${coin.steps.map((x,i)=>`<span class="chip ${coin.streakOn && i===coin.streakIndex?"active":""}">x${x.toFixed(2)}</span>`).join("")}
          </div>
        </div>
      </div>
    </div>
  `;

  // bindings
  const coinEl = document.getElementById("coinEl");

  document.getElementById("cHeads").onclick = async ()=>{ await ensureAudio(); sfxClick(); if(!coin.busy){ coin.choice="heads"; renderCoin(); } };
  document.getElementById("cTails").onclick = async ()=>{ await ensureAudio(); sfxClick(); if(!coin.busy){ coin.choice="tails"; renderCoin(); } };

  document.getElementById("cStreak").onclick = async ()=>{
    await ensureAudio(); sfxClick();
    if (coin.busy) return;
    coin.streakOn = !coin.streakOn;
    if (!coin.streakOn) coin.streakIndex = 0;
    renderCoin();
  };

  document.getElementById("cBonus").onclick = async ()=>{ await ensureAudio(); sfxClick(); addCoins(1000); renderCoin(); };

  const betInput = document.getElementById("cBet");
  const clamp = ()=>{
    let v = Math.floor(Number(betInput.value)||0);
    if (v<1) v=1;
    if (v>wallet.coins) v=wallet.coins;
    coin.bet = v;
    betInput.value = String(v);
  };

  document.querySelectorAll("[data-b]").forEach(b=>{
    b.onclick = async ()=>{
      await ensureAudio(); sfxClick();
      const v = b.dataset.b;
      betInput.value = v==="max" ? String(wallet.coins) : String(v);
      clamp(); renderCoin();
    };
  });
  document.getElementById("cMinus").onclick = async ()=>{ await ensureAudio(); sfxClick(); betInput.value=String((Number(betInput.value)||1)-10); clamp(); renderCoin(); };
  document.getElementById("cPlus").onclick  = async ()=>{ await ensureAudio(); sfxClick(); betInput.value=String((Number(betInput.value)||1)+10); clamp(); renderCoin(); };
  betInput.oninput = ()=>{ clamp(); };

  document.getElementById("cCash").onclick = async ()=>{
    await ensureAudio(); sfxClick();
    if (!(coin.streakOn && coin.streakIndex>0) || coin.busy) return;
    const payout = Math.floor(coin.bet * coinMult());
    addCoins(payout);
    coin.msg = `✅ Забрал: +${payout} 🪙 (x${coinMult().toFixed(2)})`;
    coin.streakIndex = 0;
    renderCoin();
  };

  document.getElementById("cThrow").onclick = async ()=>{
    await ensureAudio();
    clamp();
    if (coin.busy) return;
    if (coin.bet > wallet.coins) { coin.msg="❌ Недостаточно монет"; renderCoin(); return; }

    // списываем
    addCoins(-coin.bet);

    coin.busy = true;
    coin.msg = "";
    renderCoin();

    // на время полёта всегда фиолетовая
    coin.last = null;
    coinEl.classList.remove("gold","silver");
    coinEl.classList.add("purple");

    // random spins
    const rz = (Math.random()*420+380)|0;
    const rx = (Math.random()*900+1400)|0;
    coinEl.style.setProperty("--rz", `${rz}deg`);
    coinEl.style.setProperty("--rx", `${rx}deg`);

    // animate
    coinEl.classList.remove("coinThrow");
    void coinEl.offsetWidth;
    coinEl.classList.add("coinThrow");

    sfxCoinStart();
    setTimeout(()=>sfxCoinImpact(), 860);

    const result = randFloat()<0.5 ? "heads" : "tails";

    await new Promise(r=>setTimeout(r, 1100));

    // фиксируем сторону
    coinEl.classList.remove("coinThrow");
    coinEl.style.transform = result==="heads" ? "rotateY(0deg)" : "rotateY(180deg)";

    // IMPORTANT: цвет результата
    coin.last = result; // heads -> gold, tails -> silver

    const mNow = coinMult();
    const win = (coin.choice === result);

    if (win) {
      const payout = Math.floor(coin.bet * mNow);
      addCoins(payout);
      coin.msg = `✅ Выпало ${result==="heads"?"ОРЁЛ":"РЕШКА"} · +${payout} 🪙 (x${mNow.toFixed(2)})`;
      sfxWin();
      if (coin.streakOn) coin.streakIndex = Math.min(coin.streakIndex+1, coin.steps.length-1);
    } else {
      coin.msg = `❌ Выпало ${result==="heads"?"ОРЁЛ":"РЕШКА"} · -${coin.bet} 🪙`;
      sfxLose();
      coin.streakIndex = 0;
    }

    coin.busy = false;
    renderTop();
    renderCoin();
  };
}

// ===============================
// DICE
// ===============================
const dice = {
  sides: 6,         // 6/20/100
  mode: "below",    // below/above
  threshold: 3,
  bet: 50,
  rolling: false,
  lastRoll: null,
  msg: ""
};

function diceChance(sides, mode, threshold){
  if (mode === "below") return Math.max(1/sides, Math.min(1, threshold / sides));
  return Math.max(1/sides, Math.min(1, (sides - threshold + 1) / sides));
}
function diceMultiplier(chance){
  const edge = 0.98;
  // если вдруг chance==1 — не даём играть
  if (chance >= 0.999) return 0;
  return Math.max(1.05, edge / chance);
}
function diceClampThreshold(){
  const s = dice.sides;
  // анти-баг: нельзя 100% шанс
  if (dice.mode === "below") {
    dice.threshold = Math.min(Math.max(1, dice.threshold), s-1);
  } else {
    dice.threshold = Math.min(Math.max(2, dice.threshold), s);
  }
}

function renderDice(){
  diceClampThreshold();

  dice.bet = Math.max(1, Math.min(wallet.coins, Math.floor(Number(dice.bet)||50)));

  const chance = diceChance(dice.sides, dice.mode, dice.threshold);
  const mult = diceMultiplier(chance);
  const payout = mult ? Math.floor(dice.bet * mult) : 0;

  const winText = dice.mode==="below"
    ? `Выигрыш если выпало ≤ ${dice.threshold}`
    : `Выигрыш если выпало ≥ ${dice.threshold}`;

  screenEl.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <div class="h1">Dice</div>
          <div class="h2">D6 — куб. D20/D100 — понятный порог и результат. 100% шанс запрещён.</div>
        </div>
        <div class="spacer"></div>
        <span class="chip">Баланс: <b>🪙 ${wallet.coins}</b></span>
      </div>

      <div class="row" style="margin-top:10px;">
        <button class="chip ${dice.sides===6?"active":""}" data-s="6">D6</button>
        <button class="chip ${dice.sides===20?"active":""}" data-s="20">D20</button>
        <button class="chip ${dice.sides===100?"active":""}" data-s="100">D100</button>

        <div class="spacer"></div>

        <button class="chip ${dice.mode==="below"?"active":""}" data-m="below">Меньше</button>
        <button class="chip ${dice.mode==="above"?"active":""}" data-m="above">Больше</button>
      </div>

      <div class="bigNums">
        <div class="bigNum">
          <div class="n">${String(dice.threshold).padStart(2,"0")}</div>
          <div class="s">твоё число</div>
        </div>
        <div class="bigNum">
          <div class="n">${dice.lastRoll==null?"00":String(dice.lastRoll).padStart(2,"0")}</div>
          <div class="s">выпавшее</div>
        </div>
      </div>

      <div class="kpi">
        <div class="box"><div class="t">Множитель</div><div class="v">${mult?`x${mult.toFixed(2)}`:"—"}</div></div>
        <div class="box"><div class="t">Возможный выигрыш</div><div class="v">${mult?`+${payout} 🪙`:"—"}</div></div>
        <div class="box"><div class="t">Шанс</div><div class="v">${(chance*100).toFixed(1)}%</div></div>
      </div>

      <div class="rangeWrap">
        <div class="rangeTop">
          <div class="rangeLabel">Порог: ${dice.threshold} из ${dice.sides}</div>
          <div class="spacer"></div>
          <div class="bubble">Шанс ${(chance*100).toFixed(1)}% · ${mult?`x${mult.toFixed(2)}`:"—"}</div>
        </div>
        <input id="thr" class="range" type="range"
          min="${dice.mode==="below" ? 1 : 2}"
          max="${dice.mode==="below" ? dice.sides-1 : dice.sides}"
          value="${dice.threshold}">
        <div class="rangeHint">${winText}</div>
      </div>

      <div class="row" style="margin-top:12px;">
        <div style="font-weight:950;">Ставка</div>
        <div class="spacer"></div>
        <span class="chip"><b id="betShow">${dice.bet}</b> 🪙</span>
      </div>

      <div class="row" style="margin-top:8px;">
        ${[10,50,100,250,500].map(v=>`<button class="chip" data-b="${v}">${v}</button>`).join("")}
        <button class="chip" data-b="max">MAX</button>
        <div class="spacer"></div>
        <button class="pill" id="dBonus">+1000 🪙</button>
      </div>

      <div class="row" style="margin-top:10px;">
        <button class="miniBtn" id="dMinus">-</button>
        <input class="input" id="dBet" type="number" min="1" step="1" value="${dice.bet}">
        <button class="miniBtn" id="dPlus">+</button>
      </div>

      <div class="row" style="margin-top:12px;">
        <button class="btn" id="dRoll" style="flex:1;" ${dice.rolling || !mult ? "disabled":""}>
          Бросить ${dice.rolling?"...":""}
        </button>
      </div>

      <div class="msg ${dice.msg.startsWith("✅")?"ok":dice.msg.startsWith("❌")?"bad":""}" id="dMsg">${dice.msg||""}</div>
    </div>
  `;

  // handlers
  document.querySelectorAll("[data-s]").forEach(b=>{
    b.onclick = async ()=>{
      await ensureAudio(); sfxClick();
      dice.sides = Number(b.dataset.s);
      dice.lastRoll = null;
      dice.msg = "";
      if (dice.sides===6) dice.threshold = 3;
      if (dice.sides===20) dice.threshold = 11;
      if (dice.sides===100) dice.threshold = 55;
      renderDice();
    };
  });
  document.querySelectorAll("[data-m]").forEach(b=>{
    b.onclick = async ()=>{
      await ensureAudio(); sfxClick();
      dice.mode = b.dataset.m;
      dice.msg = "";
      diceClampThreshold();
      renderDice();
    };
  });

  document.getElementById("thr").oninput = async (e)=>{
    await ensureAudio();
    dice.threshold = Number(e.target.value);
    dice.msg = "";
    renderDice();
  };

  const betInput = document.getElementById("dBet");
  const clampBet = ()=>{
    let v = Math.floor(Number(betInput.value)||0);
    if (v<1) v=1;
    if (v>wallet.coins) v=wallet.coins;
    dice.bet = v;
    betInput.value = String(v);
    document.getElementById("betShow").textContent = String(v);
  };
  clampBet();

  document.querySelectorAll("[data-b]").forEach(b=>{
    b.onclick = async ()=>{
      await ensureAudio(); sfxClick();
      const v=b.dataset.b;
      betInput.value = v==="max" ? String(wallet.coins) : String(v);
      clampBet();
      renderDice();
    };
  });
  document.getElementById("dMinus").onclick = async ()=>{ await ensureAudio(); sfxClick(); betInput.value=String((Number(betInput.value)||1)-10); clampBet(); renderDice(); };
  document.getElementById("dPlus").onclick  = async ()=>{ await ensureAudio(); sfxClick(); betInput.value=String((Number(betInput.value)||1)+10); clampBet(); renderDice(); };
  betInput.oninput = ()=>{ clampBet(); };

  document.getElementById("dBonus").onclick = async ()=>{ await ensureAudio(); sfxClick(); addCoins(1000); renderDice(); };

  document.getElementById("dRoll").onclick = async ()=>{
    await ensureAudio();
    clampBet();
    diceClampThreshold();

    const chance = diceChance(dice.sides, dice.mode, dice.threshold);
    const mult = diceMultiplier(chance);
    if (!mult) { dice.msg="❌ Нельзя играть с 100% шансом"; renderDice(); return; }

    if (dice.rolling) return;
    if (dice.bet > wallet.coins) { dice.msg="❌ Недостаточно монет"; renderDice(); return; }

    addCoins(-dice.bet);
    dice.rolling = true;
    dice.msg = "";
    dice.lastRoll = null;
    renderTop();
    renderDice();

    sfxRoll();

    const roll = randInt(1, dice.sides);
    const win = dice.mode==="below" ? (roll <= dice.threshold) : (roll >= dice.threshold);

    // небольшая понятная задержка “как казино”
    setTimeout(()=>sfxHit(), 650);
    await new Promise(r=>setTimeout(r, 950));

    dice.lastRoll = roll;

    const payout = Math.floor(dice.bet * mult);
    if (win) {
      addCoins(payout);
      sfxWin();
      dice.msg = `✅ Выпало ${roll}. Выигрыш +${payout} 🪙 (x${mult.toFixed(2)})`;
    } else {
      sfxLose();
      dice.msg = `❌ Выпало ${roll}. Проигрыш -${dice.bet} 🪙`;
    }

    dice.rolling = false;
    renderTop();
    renderDice();
  };
}

// ===============================
// MINES
// ===============================
let mines = null;

function minesMultiplier(openedSafe, minesCount){
  const a = 0.095 + minesCount * 0.0075;
  const b = 0.018 + minesCount * 0.0018;
  const mult = 1 + openedSafe * a + (openedSafe * openedSafe) * b * 0.06;
  return Math.max(1, mult);
}
function minesBuild(minesCount){
  const size=25;
  const set=new Set();
  while(set.size<minesCount) set.add(randInt(0,size-1));
  return set;
}

function renderMines(){
  const size = 25;

  if (!mines){
    const betDefault = Math.min(50, wallet.coins);
    screenEl.innerHTML = `
      <div class="card">
        <div class="row">
          <div>
            <div class="h1">Mines</div>
            <div class="h2">Открывай safe, множитель растёт. Можно забрать в любой момент.</div>
          </div>
          <div class="spacer"></div>
          <span class="chip">Баланс: <b>🪙 ${wallet.coins}</b></span>
        </div>

        <div class="row" style="margin-top:12px;">
          <div style="font-weight:950;">Ставка</div>
          <div class="spacer"></div>
          <span class="chip"><b id="mBetShow">${betDefault}</b> 🪙</span>
          <button class="pill" id="mBonus">+1000 🪙</button>
        </div>

        <div class="row" style="margin-top:8px;">
          ${[10,50,100,250,500].map(v=>`<button class="chip" data-b="${v}">${v}</button>`).join("")}
          <button class="chip" data-b="max">MAX</button>
        </div>

        <div class="row" style="margin-top:10px;">
          <button class="miniBtn" id="mMinus">-</button>
          <input class="input" id="mBet" type="number" min="1" step="1" value="${betDefault}">
          <button class="miniBtn" id="mPlus">+</button>
        </div>

        <div class="rangeWrap">
          <div class="rangeTop">
            <div class="rangeLabel">Мин: <b id="mCountShow">5</b></div>
            <div class="spacer"></div>
            <div class="rangeHint">Больше мин → выше риск, множитель растёт быстрее</div>
          </div>
          <input id="mCount" class="range" type="range" min="1" max="24" value="5">
        </div>

        <div class="row" style="margin-top:12px;">
          <button class="btn" id="mStart" style="flex:1;">Start</button>
        </div>
      </div>
    `;

    const betEl = document.getElementById("mBet");
    const betShow = document.getElementById("mBetShow");
    const countEl = document.getElementById("mCount");
    const countShow = document.getElementById("mCountShow");

    const clampBet = ()=>{
      let v=Math.floor(Number(betEl.value)||0);
      if(v<1)v=1;
      if(v>wallet.coins)v=wallet.coins;
      betEl.value=String(v);
      betShow.textContent=String(v);
      return v;
    };
    const clampCount=()=>{
      const v=Math.floor(Number(countEl.value)||5);
      countShow.textContent=String(v);
      return v;
    };
    clampBet(); clampCount();

    document.querySelectorAll("[data-b]").forEach(b=>{
      b.onclick = async ()=>{
        await ensureAudio(); sfxClick();
        const v=b.dataset.b;
        betEl.value = v==="max"?String(wallet.coins):String(v);
        clampBet();
      };
    });
    document.getElementById("mMinus").onclick = async ()=>{ await ensureAudio(); sfxClick(); betEl.value=String((Number(betEl.value)||1)-10); clampBet(); };
    document.getElementById("mPlus").onclick  = async ()=>{ await ensureAudio(); sfxClick(); betEl.value=String((Number(betEl.value)||1)+10); clampBet(); };
    betEl.oninput=()=>clampBet();
    countEl.oninput=async ()=>{ await ensureAudio(); sfxClick(); clampCount(); };

    document.getElementById("mBonus").onclick = async ()=>{
      await ensureAudio(); sfxClick();
      addCoins(1000);
      renderMines();
    };

    document.getElementById("mStart").onclick = async ()=>{
      await ensureAudio(); sfxClick();
      const betV=clampBet();
      const minesCount=clampCount();

      if (betV > wallet.coins){ alert("Недостаточно монет"); return; }
      addCoins(-betV);

      mines = {
        bet: betV,
        minesCount,
        mines: minesBuild(minesCount),
        opened: new Set(),
        over: false,
        cashed: false,
        safeOpened: 0,
        mult: 1,
        msg: ""
      };
      renderTop();
      renderMines();
    };

    return;
  }

  // game view
  const maxSafe = size - mines.minesCount;
  const potential = Math.floor(mines.bet * mines.mult);

  const ladder = [];
  for(let step=1; step<=maxSafe; step++){
    const x=minesMultiplier(step, mines.minesCount);
    const cls = step===mines.safeOpened ? "step active" : step<mines.safeOpened ? "step done" : "step";
    ladder.push(`<div class="${cls}"><div>${step}</div><div class="x">x${x.toFixed(2)}</div></div>`);
  }

  const cells = [];
  for(let i=0;i<size;i++){
    const opened = mines.opened.has(i);
    const isMine = mines.mines.has(i);
    let cls="tile";
    let label="";
    if (opened && isMine){ cls+=" mine"; label="💣"; }
    if (opened && !isMine){ cls+=" safe"; label="✅"; }
    cells.push(`<button class="${cls}" data-i="${i}" ${mines.over?"disabled":""}><div class="tileInner">${label}</div></button>`);
  }

  screenEl.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <div class="h1">Mines</div>
          <div class="h2">Safe: <b>${mines.safeOpened}</b> · Мин: <b>${mines.minesCount}</b> · Ставка: <b>${mines.bet} 🪙</b></div>
        </div>
        <div class="spacer"></div>
        <span class="chip">Сейчас: <b>x${mines.mult.toFixed(2)}</b></span>
      </div>

      <div class="kpi">
        <div class="box"><div class="t">Забрать сейчас</div><div class="v">${potential} 🪙</div></div>
        <div class="box"><div class="t">Осталось safe</div><div class="v">${maxSafe - mines.safeOpened}</div></div>
        <div class="box"><div class="t">Статус</div><div class="v">${mines.over?"Раунд завершён":"Идёт игра"}</div></div>
      </div>

      <div class="msg ${mines.msg.startsWith("✅")?"ok":mines.msg.startsWith("💥")?"bad":""}">${mines.msg||""}</div>

      <div class="minesGrid">${cells.join("")}</div>

      <div class="row" style="margin-top:12px;">
        <button class="btn" id="mCash" style="flex:1;" ${mines.over?"disabled":""}>Забрать</button>
        <button class="btn ghost" id="mNew">Новый раунд</button>
      </div>

      <div class="ladder" id="ladder">${ladder.join("")}</div>
    </div>
  `;

  // ladder scroll to active
  const ladderEl=document.getElementById("ladder");
  const active=ladderEl.querySelector(".step.active");
  if (active){
    const left = active.offsetLeft - ladderEl.clientWidth/2 + active.clientWidth/2;
    ladderEl.scrollLeft = Math.max(0,left);
  }

  function revealAll(){
    for(let i=0;i<size;i++) mines.opened.add(i);
  }

  document.getElementById("mCash").onclick = async ()=>{
    await ensureAudio(); sfxClick();
    if (mines.over) return;
    mines.over=true; mines.cashed=true;
    const payout = Math.floor(mines.bet * mines.mult);
    addCoins(payout);
    sfxCash(); sfxWin();
    mines.msg = `✅ Забрал: +${payout} 🪙 (x${mines.mult.toFixed(2)})`;
    revealAll();
    renderTop();
    renderMines();
  };
  document.getElementById("mNew").onclick = async ()=>{
    await ensureAudio(); sfxClick();
    mines=null;
    renderMines();
  };

  document.querySelectorAll(".tile").forEach(btn=>{
    btn.onclick = async ()=>{
      await ensureAudio();
      if (mines.over) return;
      const i=Number(btn.dataset.i);
      if (mines.opened.has(i)) return;
      mines.opened.add(i);

      if (mines.mines.has(i)){
        mines.over=true;
        mines.msg = `💥 Мина! Ставка ${mines.bet} 🪙 сгорела`;
        sfxMine(); sfxLose();
        revealAll();
        renderMines();
        return;
      }

      sfxTile();
      mines.safeOpened += 1;
      mines.mult = minesMultiplier(mines.safeOpened, mines.minesCount);

      if (mines.safeOpened >= (size - mines.minesCount)){
        // авто-забор
        mines.over=true; mines.cashed=true;
        const payout = Math.floor(mines.bet * mines.mult);
        addCoins(payout);
        sfxCash(); sfxWin();
        mines.msg = `✅ Все safe! Авто-забор: +${payout} 🪙 (x${mines.mult.toFixed(2)})`;
        revealAll();
        renderTop();
        renderMines();
        return;
      }

      renderMines();
    };
  });
}

// старт
setScreen("coin");


