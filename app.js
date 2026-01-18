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
const WALLET_KEY = "mini_wallet_v3";
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
  const coins = wallet.coins;
  userEl.textContent = user
    ? `Привет, ${user.first_name} · открыто в Telegram`
    : `Открыто вне Telegram`;
  balancePill.textContent = `🪙 ${coins}`;
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
function tone({ type="sine", f=440, t=0.08, g=0.06, when=0, detune=0 }) {
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
  click(){ tone({type:"triangle", f:520, t:0.05, g:0.035}); tone({type:"triangle", f:320, t:0.06, g:0.02, when:0.01}); },
  coinStart(){ noise({t:0.12, g:0.02, hp:1200}); tone({type:"triangle", f:420, t:0.10, g:0.03, when:0.01}); },
  coinHit(){ tone({type:"sine", f:980, t:0.06, g:0.05}); tone({type:"sine", f:1560, t:0.05, g:0.03, when:0.01}); noise({t:0.06, g:0.012, hp:2400, when:0.005}); },
  win(){ tone({type:"sine", f:740, t:0.10, g:0.05}); tone({type:"sine", f:932, t:0.12, g:0.045, when:0.05}); tone({type:"sine", f:1244, t:0.14, g:0.04, when:0.10}); },
  lose(){ tone({type:"sine", f:220, t:0.16, g:0.06}); tone({type:"sine", f:165, t:0.18, g:0.05, when:0.06}); },
  roll(){ noise({t:0.10, g:0.014, hp:900}); tone({type:"square", f:220, t:0.06, g:0.03, when:0.02}); },
  mine(){ noise({t:0.16, g:0.03, hp:600}); tone({type:"sawtooth", f:140, t:0.18, g:0.05, when:0.02}); },
};
const app = { sfx: true, screen: "coin" };
function playClick(){ if(app.sfx) SFX.click(); }

// Глобально: клик по документу = unlock аудио
document.addEventListener("pointerdown", unlockAudio, { once:false });

// ===============================
// Nav
// ===============================
document.querySelectorAll(".navBtn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    playClick();
    setScreen(btn.dataset.screen);
  });
});
function setNavActive(name){
  document.querySelectorAll(".navBtn").forEach(b=>{
    b.classList.toggle("active", b.dataset.screen === name);
  });
}

// ===============================
// COIN FLIP
// ===============================
const coinState = {
  choice: "heads", // heads/tails
  bet: 50,
  spinning: false,
  streakOn: true,
  streakIndex: 0,
  streakSteps: [1.94, 3.88, 7.76, 15.52],
  lastResult: null,      // "heads"|"tails"|null
  skin: "neutral",       // "neutral"|"heads"|"tails"
  msg: "",
  msgKind: "",
};

function coinCurrentMult(){
  if(!coinState.streakOn) return 1.94;
  return coinState.streakSteps[Math.min(coinState.streakIndex, coinState.streakSteps.length-1)];
}
function coinResetToNeutral(){
  coinState.lastResult = null;
  coinState.skin = "neutral";
  const coinEl = document.getElementById("coin3d");
  if(coinEl) coinEl.style.transform = ""; // сброс поворота
}

function renderCoin(){
  const mult = coinCurrentMult();
  const possible = Math.floor(coinState.bet * mult);

  screenEl.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <h2 class="h1">Coin Flip</h2>
          <div class="hint">Фиолетовая монета в полёте → после броска становится золотой (орёл) или серебряной (решка). Цвет держится, пока ты не изменишь ставку.</div>
        </div>
        <div class="spacer"></div>
        <button class="chip ${app.sfx ? "active":""}" id="toggleSfx">Звук</button>
        <button class="chip ${coinState.streakOn ? "active":""}" id="toggleStreak">Серия</button>
      </div>

      <div class="grid2" style="margin-top:12px;">
        <div class="card" style="background:rgba(255,255,255,.03);">
          <div class="coinStage">
            <div class="coinGlow"></div>
            <div class="coinShadow" id="coinShadow"></div>

            <div class="coin3d" id="coin3d" data-skin="${coinState.skin}">
              <div class="rim"></div>
              <div class="face front"><div class="label" id="coinLabelFront">ОРЁЛ</div></div>
              <div class="face back"><div class="label" id="coinLabelBack">РЕШКА</div></div>
            </div>
          </div>

          <div class="row" style="margin-top:10px;">
            <button class="chip ${coinState.choice==="heads"?"active":""}" id="pickHeads" ${coinState.spinning?"disabled":""}>🦅 Орёл</button>
            <button class="chip ${coinState.choice==="tails"?"active":""}" id="pickTails" ${coinState.spinning?"disabled":""}>🌙 Решка</button>
            <div class="spacer"></div>
            <div class="pill">Баланс: <b>🪙 ${wallet.coins}</b></div>
          </div>

          <div class="kpis">
            <div class="kpi"><div class="t">Множитель</div><div class="v">x${mult.toFixed(2)}</div></div>
            <div class="kpi"><div class="t">Возможный выигрыш</div><div class="v">+${possible} 🪙</div></div>
            <div class="kpi"><div class="t">Статус</div><div class="v">${coinState.spinning ? "Бросок..." : "Готов"}</div></div>
          </div>

          <div class="row" style="margin-top:12px;">
            <button class="btn" id="coinThrow" style="flex:1;" ${coinState.spinning?"disabled":""}>Бросить</button>
            <button class="btnGhost" id="coinCash" ${coinState.streakOn && coinState.streakIndex>0 ? "" : "disabled"}>Забрать</button>
          </div>

          <div class="msg ${coinState.msgKind||""}" id="coinMsg">${coinState.msg||""}</div>
        </div>

        <div class="card" style="background:rgba(255,255,255,.03);">
          <div class="row" style="justify-content:space-between;">
            <div class="h1">Ставка</div>
            <button class="btnGhost" id="bonusCoin">+1000 🪙</button>
          </div>

          <div class="chips" style="margin-top:10px;">
            ${[10,50,100,250,500].map(v=>`<button class="chip" data-bet="${v}">${v}</button>`).join("")}
            <button class="chip" data-bet="max">MAX</button>
          </div>

          <div class="row" style="margin-top:10px;">
            <button class="btnGhost" id="betMinus">-</button>
            <input class="input" id="bet" type="number" min="1" step="1" value="${coinState.bet}">
            <button class="btnGhost" id="betPlus">+</button>
          </div>

          <div class="hint" style="margin-top:10px;">
            Серия: выиграл → шаг множителя растёт. Проиграл → серия сбрасывается.
          </div>

          <div class="chips" style="margin-top:10px;">
            ${coinState.streakSteps.map((m,i)=>{
              const active = coinState.streakOn && i===coinState.streakIndex;
              return `<span class="chip ${active?"active":""}">x${m.toFixed(2)}</span>`;
            }).join("")}
          </div>
        </div>
      </div>
    </div>
  `;

  // bind
  document.getElementById("toggleSfx").onclick = ()=>{ app.sfx = !app.sfx; renderCoin(); };
  document.getElementById("toggleStreak").onclick = ()=>{
    if(coinState.spinning) return;
    coinState.streakOn = !coinState.streakOn;
    if(!coinState.streakOn) coinState.streakIndex = 0;
    renderCoin();
  };
  document.getElementById("pickHeads").onclick = ()=>{ if(!coinState.spinning){ coinState.choice="heads"; playClick(); renderCoin(); } };
  document.getElementById("pickTails").onclick = ()=>{ if(!coinState.spinning){ coinState.choice="tails"; playClick(); renderCoin(); } };

  const betInput = document.getElementById("bet");
  const clampBet = (resetNeutralIfChanged=true)=>{
    let v = Math.floor(Number(betInput.value)||0);
    if(v<1) v = 1;
    if(v>wallet.coins) v = wallet.coins;
    const changed = (v !== coinState.bet);
    coinState.bet = v;
    betInput.value = String(v);

    if(resetNeutralIfChanged && changed){
      coinResetToNeutral(); // если ставку изменили — монета обратно фиолетовая
    }
  };
  clampBet(false);

  document.querySelectorAll("[data-bet]").forEach(b=>{
    b.onclick = ()=>{
      playClick();
      const val = b.dataset.bet;
      betInput.value = (val==="max") ? String(wallet.coins) : String(val);
      clampBet(true);
      renderCoin();
    };
  });

  document.getElementById("betMinus").onclick = ()=>{ playClick(); betInput.value = String((Number(betInput.value)||1)-10); clampBet(true); renderCoin(); };
  document.getElementById("betPlus").onclick = ()=>{ playClick(); betInput.value = String((Number(betInput.value)||1)+10); clampBet(true); renderCoin(); };
  betInput.oninput = ()=>{ clampBet(true); renderCoin(); };

  document.getElementById("bonusCoin").onclick = ()=>{ playClick(); addCoins(1000); renderCoin(); };

  document.getElementById("coinCash").onclick = ()=>{
    playClick();
    if(!(coinState.streakOn && coinState.streakIndex>0)) return;
    const m = coinCurrentMult();
    const payout = Math.floor(coinState.bet * m);
    addCoins(payout);
    coinState.msg = `💰 Забрал: +${payout} 🪙 (x${m.toFixed(2)})`;
    coinState.msgKind = "ok";
    coinState.streakIndex = 0;
    renderCoin();
  };

  document.getElementById("coinThrow").onclick = async ()=>{
    await unlockAudio();
    clampBet(false);

    const bet = coinState.bet;
    if(bet<=0) return;
    if(bet>wallet.coins) { alert("Недостаточно монет"); return; }

    addCoins(-bet);

    const coinEl = document.getElementById("coin3d");
    const shadow = document.getElementById("coinShadow");

    coinState.spinning = true;
    coinState.msg = "Монета в воздухе…";
    coinState.msgKind = "";
    renderTopBar();

    // на время броска — фиолетовая
    coinEl.dataset.skin = "neutral";

    if(app.sfx) SFX.coinStart();

    const rz = (Math.random() * 420 + 380) | 0;
    const rx = (Math.random() * 900 + 1300) | 0;
    coinEl.style.setProperty("--rz", `${rz}deg`);
    coinEl.style.setProperty("--rx", `${rx}deg`);

    coinEl.classList.remove("coinThrow");
    void coinEl.offsetWidth;
    coinEl.classList.add("coinThrow");

    shadow.style.opacity = "0.25";
    setTimeout(()=>{ shadow.style.opacity="0.45"; }, 820);

    const res = (randFloat() < 0.5) ? "heads" : "tails";
    setTimeout(()=>{ if(app.sfx) SFX.coinHit(); }, 860);

    await new Promise(r=>setTimeout(r, 1050));

    coinEl.style.transform = (res==="heads") ? "rotateY(0deg)" : "rotateY(180deg)";

    coinState.lastResult = res;
    coinState.skin = (res==="heads") ? "heads" : "tails";
    coinEl.dataset.skin = coinState.skin;

    const won = (coinState.choice === res);
    const m = coinCurrentMult();

    if(won){
      const payout = Math.floor(bet * m);
      addCoins(payout);

      if(coinState.streakOn){
        coinState.streakIndex = Math.min(coinState.streakIndex+1, coinState.streakSteps.length-1);
      }
      coinState.msg = `✅ Выпало ${res==="heads"?"ОРЁЛ":"РЕШКА"} · +${payout} 🪙 (x${m.toFixed(2)})`;
      coinState.msgKind = "ok";
      if(app.sfx) SFX.win();
    } else {
      coinState.msg = `❌ Выпало ${res==="heads"?"ОРЁЛ":"РЕШКА"} · -${bet} 🪙`;
      coinState.msgKind = "bad";
      coinState.streakIndex = 0;
      if(app.sfx) SFX.lose();
    }

    coinState.spinning = false;
    renderTopBar();
    renderCoin();
  };
}

// ===============================
// DICE
// ===============================
const diceState = {
  sides: 6,
  mode: "below",
  threshold: 3,
  bet: 50,
  rolling: false,
  lastRoll: null,
  msg: "",
  msgKind: "",
};

function diceChance(sides, mode, threshold){
  if(mode==="below") return threshold / sides;
  return (sides - threshold + 1) / sides;
}
function diceMultiplier(chance){
  const edge = 0.98; // 2% house edge
  return Math.max(1.02, edge / chance);
}

function diceClampThreshold(){
  const s = diceState.sides;
  if(diceState.mode==="below"){
    if(diceState.threshold >= s) diceState.threshold = s-1; // запрет 100%
    if(diceState.threshold < 1) diceState.threshold = 1;
  } else {
    if(diceState.threshold <= 1) diceState.threshold = 2;   // запрет 100%
    if(diceState.threshold > s) diceState.threshold = s;
  }
}

function renderCubeFaceHTML(n){
  const map = {
    1:[0,0,0,0,1,0,0,0,0],
    2:[1,0,0,0,0,0,0,0,1],
    3:[1,0,0,0,1,0,0,0,1],
    4:[1,0,1,0,0,0,1,0,1],
    5:[1,0,1,0,1,0,1,0,1],
    6:[1,0,1,1,0,1,1,0,1],
  };
  const arr = map[n];
  return `
    <div class="cubeFace f${n}">
      <div class="pipGrid">
        ${arr.map(v=>`<div class="pip ${v?"":"off"}"></div>`).join("")}
      </div>
    </div>
  `;
}

function renderDice(){
  diceClampThreshold();

  diceState.bet = Math.floor(Number(diceState.bet)||1);
  if(diceState.bet<1) diceState.bet=1;
  if(diceState.bet>wallet.coins) diceState.bet=wallet.coins;

  const chance = diceChance(diceState.sides, diceState.mode, diceState.threshold);
  const mult = diceMultiplier(chance);
  const payout = Math.floor(diceState.bet * mult);

  const winText = (diceState.mode==="below")
    ? `Выигрыш если выпало ≤ ${diceState.threshold}`
    : `Выигрыш если выпало ≥ ${diceState.threshold}`;

  const rangeMax = diceState.sides;
  const thresholdPct = (diceState.threshold-1) / (rangeMax-1) * 100;
  const resultPct = (diceState.lastRoll==null) ? 0 : ((diceState.lastRoll-1)/(rangeMax-1))*100;

  screenEl.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <h2 class="h1">Dice</h2>
          <div class="hint">D6 — 3D кубик. D20/D100 — шкала + анимация маркера (видно выиграл/нет).</div>
        </div>
        <div class="spacer"></div>
        <div class="pill">Баланс: <b>🪙 ${wallet.coins}</b></div>
        <button class="chip ${diceState.mode==="below"?"active":""}" data-mode="below">Меньше</button>
        <button class="chip ${diceState.mode==="above"?"active":""}" data-mode="above">Больше</button>
      </div>

      <div class="row" style="margin-top:10px;">
        <button class="chip ${diceState.sides===6?"active":""}" data-sides="6">D6</button>
        <button class="chip ${diceState.sides===20?"active":""}" data-sides="20">D20</button>
        <button class="chip ${diceState.sides===100?"active":""}" data-sides="100">D100</button>
        <div class="spacer"></div>
        <button class="chip ${app.sfx ? "active":""}" id="toggleSfx2">Звук</button>
      </div>

      <div class="kpis">
        <div class="kpi"><div class="t">Множитель</div><div class="v">x${mult.toFixed(2)}</div></div>
        <div class="kpi"><div class="t">Возможный выигрыш</div><div class="v">+${payout} 🪙</div></div>
        <div class="kpi"><div class="t">Шанс</div><div class="v">${(chance*100).toFixed(1)}%</div></div>
      </div>

      <div style="margin-top:10px;">
        <div class="row" style="justify-content:space-between;">
          <div style="font-weight:950;">Порог: <b id="thLabel">${diceState.threshold}</b> из ${diceState.sides}</div>
          <div class="pill">Условие: <b>${winText}</b></div>
        </div>
        <input class="range" id="threshold" type="range" min="1" max="${diceState.sides}" value="${diceState.threshold}">
        <div class="hint" id="limitHint" style="margin-top:6px;"></div>
      </div>

      <div class="diceArena" id="diceArena">
        <div class="diceShadow"></div>

        ${
          diceState.sides === 6
            ? `
              <div class="dice3dWrap">
                <div class="cube ${diceState.lastRoll ? "show-"+diceState.lastRoll : ""}" id="cube">
                  ${renderCubeFaceHTML(1)}
                  ${renderCubeFaceHTML(2)}
                  ${renderCubeFaceHTML(3)}
                  ${renderCubeFaceHTML(4)}
                  ${renderCubeFaceHTML(5)}
                  ${renderCubeFaceHTML(6)}
                </div>
              </div>
            `
            : `
              <div style="width:min(720px, 92%);">
                <div class="scaleWrap">
                  <div class="scaleBar" id="scaleBar">
                    <div class="scaleFill" id="scaleFill" style="width:${diceState.mode==="below" ? thresholdPct : (100-thresholdPct)}%;"></div>

                    <div class="marker" id="thMarker" style="left:${thresholdPct}%;"></div>
                    <div class="markerLabel" id="thLabel2" style="left:${thresholdPct}%;">Порог ${diceState.threshold}</div>

                    <div class="marker result" id="resMarker" style="left:${resultPct}%; display:${diceState.lastRoll==null?"none":"block"};"></div>
                    <div class="markerLabel" id="resLabel" style="left:${resultPct}%; display:${diceState.lastRoll==null?"none":"block"};">Выпало ${diceState.lastRoll}</div>
                  </div>
                </div>

                <div class="row" style="margin-top:10px;">
                  <div class="pill">Твоё число: <b>${diceState.threshold}</b></div>
                  <div class="pill">Выпало: <b>${diceState.lastRoll==null?"—":diceState.lastRoll}</b></div>
                </div>
              </div>
            `
        }
      </div>

      <div class="row" style="margin-top:12px;">
        <div style="min-width:220px;">
          <div class="row" style="justify-content:space-between;">
            <div class="h1" style="font-size:14px;">Ставка</div>
            <button class="btnGhost" id="bonusDice">+1000 🪙</button>
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

      <div class="msg ${diceState.msgKind||""}" id="diceMsg">${diceState.msg||""}</div>
    </div>
  `;

  document.getElementById("toggleSfx2").onclick = ()=>{ app.sfx = !app.sfx; renderDice(); };

  document.querySelectorAll("[data-sides]").forEach(b=>{
    b.onclick = ()=>{
      playClick();
      diceState.sides = Number(b.dataset.sides);
      diceState.lastRoll = null;
      diceState.msg = "";
      diceState.msgKind = "";
      if(diceState.sides===6) diceState.threshold = 3;
      if(diceState.sides===20) diceState.threshold = 11;
      if(diceState.sides===100) diceState.threshold = 55;
      diceClampThreshold();
      renderDice();
    };
  });
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
      limitHint.textContent = "⚠️ 100% шанс запрещён: максимум порога = sides-1.";
    } else if(diceState.mode==="above" && diceState.threshold===2){
      limitHint.textContent = "⚠️ 100% шанс запрещён: минимум порога = 2.";
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
  clampBet();
  betInput.oninput = ()=>{ clampBet(); };

  document.getElementById("betMinus").onclick = ()=>{ playClick(); betInput.value = String((Number(betInput.value)||1)-10); clampBet(); };
  document.getElementById("betPlus").onclick = ()=>{ playClick(); betInput.value = String((Number(betInput.value)||1)+10); clampBet(); };

  document.querySelectorAll("[data-bet]").forEach(b=>{
    b.onclick = ()=>{
      playClick();
      const v = b.dataset.bet;
      betInput.value = (v==="max") ? String(wallet.coins) : String(v);
      clampBet();
    };
  });

  document.getElementById("bonusDice").onclick = ()=>{ playClick(); addCoins(1000); renderDice(); };

  document.getElementById("rollBtn").onclick = async ()=>{
    await unlockAudio();
    clampBet();
    diceClampThreshold();

    if(diceState.rolling) return;

    const chance = diceChance(diceState.sides, diceState.mode, diceState.threshold);
    if(chance >= 0.999){
      alert("Запрещено ставить с шансом 100% (иначе можно багать баланс).");
      return;
    }

    if(diceState.bet <= 0) return;
    if(diceState.bet > wallet.coins) { alert("Недостаточно монет"); return; }

    addCoins(-diceState.bet);
    diceState.rolling = true;
    diceState.msg = "";
    diceState.msgKind = "";
    renderTopBar();

    const s = diceState.sides;
    const roll = randInt(1, s);
    const win = (diceState.mode==="below") ? (roll <= diceState.threshold) : (roll >= diceState.threshold);

    if(app.sfx) SFX.roll();

    if(s===6){
      const arena = document.getElementById("diceArena");
      const cube = document.getElementById("cube");
      arena.classList.add("throwing");

      setTimeout(()=>{ cube.className = "cube show-" + roll; }, 900);

      setTimeout(()=>{
        arena.classList.remove("throwing");
        finishDice(win, roll);
      }, 1200);
    } else {
      const duration = 980;
      const start = performance.now();
      const from = randInt(1, s);
      const to = roll;

      const resMarker = document.getElementById("resMarker");
      const resLabel = document.getElementById("resLabel");
      if(resMarker) resMarker.style.display = "block";
      if(resLabel) resLabel.style.display = "block";

      function pct(v){ return ((v-1)/(s-1))*100; }

      const tick = (now)=>{
        const t = Math.min(1, (now-start)/duration);
        const e = 1 - Math.pow(1-t, 3);

        const wobble = (t < 0.92) ? Math.sin(now/45)* (s>20? 2.0 : 1.4) : 0;
        const cur = Math.max(1, Math.min(s, Math.round(from + (to-from)*e + wobble)));

        const p = pct(cur);
        if(resMarker) resMarker.style.left = p + "%";
        if(resLabel) { resLabel.style.left = p + "%"; resLabel.textContent = "Выпало " + cur; }

        if(t < 1) requestAnimationFrame(tick);
        else {
          if(resMarker) resMarker.style.left = pct(to) + "%";
          if(resLabel) { resLabel.style.left = pct(to) + "%"; resLabel.textContent = "Выпало " + to; }
          finishDice(win, to);
        }
      };
      requestAnimationFrame(tick);
    }
  };

  function finishDice(win, roll){
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

// ===============================
// MINES
// ===============================
let minesGame = null;

function minesBuild(minesCount){
  const size = 25;
  const mines = new Set();
  while(mines.size < minesCount) mines.add(randInt(0, size-1));
  return mines;
}
function minesMult(openedSafe, minesCount){
  const a = 0.095 + minesCount * 0.0075;
  const b = 0.018 + minesCount * 0.0018;
  const m = 1 + openedSafe * a + (openedSafe*openedSafe) * b * 0.06;
  return Math.max(1, m);
}

function renderMines(){
  const size = 25;

  // setup screen
  if(!minesGame){
    const betDefault = Math.min(50, wallet.coins);
    screenEl.innerHTML = `
      <div class="card">
        <div class="row">
          <div>
            <h2 class="h1">Mines</h2>
            <div class="hint">Открывай safe клетки. Чем больше мин — тем быстрее растёт множитель. Можно “Забрать”.</div>
          </div>
          <div class="spacer"></div>
          <div class="pill">Баланс: <b>🪙 ${wallet.coins}</b></div>
          <button class="chip ${app.sfx ? "active":""}" id="toggleSfx3">Звук</button>
        </div>

        <div class="grid2" style="margin-top:12px;">
          <div class="card" style="background:rgba(255,255,255,.03);">
            <div class="row" style="justify-content:space-between;">
              <div class="h1">Ставка</div>
              <button class="btnGhost" id="bonusM">+1000 🪙</button>
            </div>
            <div class="chips" style="margin-top:10px;">
              ${[10,50,100,250,500].map(v=>`<button class="chip" data-bet="${v}">${v}</button>`).join("")}
              <button class="chip" data-bet="max">MAX</button>
            </div>
            <div class="row" style="margin-top:10px;">
              <button class="btnGhost" id="betMinus">-</button>
              <input class="input" id="bet" type="number" min="1" step="1" value="${betDefault}">
              <button class="btnGhost" id="betPlus">+</button>
            </div>

            <div style="margin-top:12px;">
              <div class="row" style="justify-content:space-between;">
                <div style="font-weight:950;">Количество мин</div>
                <div class="pill"><b id="mCountShow">5</b></div>
              </div>
              <input class="range" id="mCount" type="range" min="1" max="24" value="5">
              <div class="hint">Больше мин → выше риск, но множитель растёт быстрее.</div>
            </div>

            <div class="row" style="margin-top:12px;">
              <button class="btn" id="mStart" style="flex:1;">Start</button>
              <button class="btnGhost" id="mBack">Сброс</button>
            </div>
          </div>

          <div class="card" style="background:rgba(255,255,255,.03);">
            <div class="h1">Правила</div>
            <div class="hint" style="margin-top:8px;">
              Ставка списывается при старте. Открывай клетки: ✅ safe или 💣 мина.<br>
              Нажми “Забрать”, чтобы получить выигрыш по текущему x.
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById("toggleSfx3").onclick = ()=>{ app.sfx = !app.sfx; renderMines(); };

    const betInput = document.getElementById("bet");
    const clampBet = ()=>{
      let v = Math.floor(Number(betInput.value)||0);
      if(v<1) v=1;
      if(v>wallet.coins) v=wallet.coins;
      betInput.value = String(v);
      return v;
    };
    clampBet();

    document.querySelectorAll("[data-bet]").forEach(b=>{
      b.onclick = ()=>{
        playClick();
        const v = b.dataset.bet;
        betInput.value = (v==="max") ? String(wallet.coins) : String(v);
        clampBet();
      };
    });
    document.getElementById("betMinus").onclick = ()=>{ playClick(); betInput.value = String((Number(betInput.value)||1)-10); clampBet(); };
    document.getElementById("betPlus").onclick = ()=>{ playClick(); betInput.value = String((Number(betInput.value)||1)+10); clampBet(); };
    betInput.oninput = clampBet;

    const mCount = document.getElementById("mCount");
    const mCountShow = document.getElementById("mCountShow");
    mCount.oninput = ()=>{ playClick(); mCountShow.textContent = String(mCount.value); };

    document.getElementById("bonusM").onclick = ()=>{ playClick(); addCoins(1000); renderMines(); };
    document.getElementById("mBack").onclick = ()=>{ playClick(); minesGame = null; renderMines(); };

    document.getElementById("mStart").onclick = async ()=>{
      await unlockAudio();
      const bet = clampBet();
      const minesCount = Math.floor(Number(mCount.value)||5);

      if(bet > wallet.coins){ alert("Недостаточно монет"); return; }
      if(minesCount < 1 || minesCount > 24){ alert("Мин должно быть от 1 до 24"); return; }

      addCoins(-bet);

      minesGame = {
        bet,
        minesCount,
        mines: minesBuild(minesCount),
        opened: new Set(),
        over:false,
        msg:"",
        msgKind:"",
        safeOpened:0,
        mult:1,
      };
      renderMines();
    };

    return;
  }

  // game screen
  const maxSafe = size - minesGame.minesCount;
  const potential = Math.floor(minesGame.bet * minesGame.mult);

  const cells = [];
  for(let i=0;i<size;i++){
    const opened = minesGame.opened.has(i);
    const isMine = minesGame.mines.has(i);
    let cls = "tile";
    let label = "";
    if(opened) cls += " open";
    if(opened && isMine) cls += " mine";
    if(opened && !isMine) cls += " safe";
    if(opened) label = isMine ? "💣" : "✅";
    cells.push(`
      <button class="${cls}" data-i="${i}" ${minesGame.over?"disabled":""}>
        ${label}
      </button>
    `);
  }

  screenEl.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <h2 class="h1">Mines</h2>
          <div class="hint">Safe: <b>${minesGame.safeOpened}</b> · Мин: <b>${minesGame.minesCount}</b> · Ставка: <b>${minesGame.bet} 🪙</b></div>
        </div>
        <div class="spacer"></div>
        <div class="pill">Сейчас: <b>x${minesGame.mult.toFixed(2)}</b></div>
        <button class="chip ${app.sfx ? "active":""}" id="toggleSfx3">Звук</button>
      </div>

      <div class="kpis">
        <div class="kpi"><div class="t">Забрать сейчас</div><div class="v">${potential} 🪙</div></div>
        <div class="kpi"><div class="t">Осталось safe</div><div class="v">${maxSafe - minesGame.safeOpened}</div></div>
        <div class="kpi"><div class="t">Статус</div><div class="v">${minesGame.over ? "Раунд завершён" : "Идёт игра"}</div></div>
      </div>

      <div class="msg ${minesGame.msgKind||""}" id="mMsg">${minesGame.msg||""}</div>

      <div class="minesGrid" id="minesGrid">${cells.join("")}</div>

      <div class="row" style="margin-top:12px;">
        <button class="btn" id="mCash" style="flex:1;" ${minesGame.over?"disabled":""}>Забрать</button>
        <button class="btnGhost" id="mNew">Новый раунд</button>
        <button class="btnGhost" id="bonusM">+1000 🪙</button>
      </div>
    </div>
  `;

  document.getElementById("toggleSfx3").onclick = ()=>{ app.sfx = !app.sfx; renderMines(); };
  document.getElementById("bonusM").onclick = ()=>{ playClick(); addCoins(1000); renderMines(); };

  document.getElementById("mNew").onclick = ()=>{ playClick(); minesGame = null; renderMines(); };

  document.getElementById("mCash").onclick = ()=>{
    playClick();
    if(minesGame.over) return;
    minesGame.over = true;
    const payout = Math.floor(minesGame.bet * minesGame.mult);
    addCoins(payout);
    minesGame.msg = `💰 Забрал: +${payout} 🪙 (x${minesGame.mult.toFixed(2)})`;
    minesGame.msgKind = "ok";
    if(app.sfx) SFX.win();

    // reveal all
    for(let i=0;i<size;i++) minesGame.opened.add(i);
    renderMines();
  };

  document.querySelectorAll("#minesGrid button").forEach(btn=>{
    btn.onclick = ()=>{
      if(minesGame.over) return;
      const i = Number(btn.dataset.i);
      if(minesGame.opened.has(i)) return;

      minesGame.opened.add(i);
      const isMine = minesGame.mines.has(i);

      if(isMine){
        minesGame.over = true;
        minesGame.msg = `💥 Мина! Ставка ${minesGame.bet} 🪙 сгорела`;
        minesGame.msgKind = "bad";
        if(app.sfx) SFX.mine();

        for(let k=0;k<size;k++) minesGame.opened.add(k);
        renderMines();
        return;
      }

      if(app.sfx) SFX.click();
      minesGame.safeOpened += 1;
      minesGame.mult = minesMult(minesGame.safeOpened, minesGame.minesCount);

      if(minesGame.safeOpened >= maxSafe){
        minesGame.msg = "🏁 Открыл все safe! Авто-забор.";
        minesGame.msgKind = "ok";
        const payout = Math.floor(minesGame.bet * minesGame.mult);
        addCoins(payout);
        if(app.sfx) SFX.win();
        minesGame.over = true;
        for(let k=0;k<size;k++) minesGame.opened.add(k);
      }
      renderMines();
    };
  });
}

// ===============================
// Router
// ===============================
function setScreen(name){
  app.screen = name;
  setNavActive(name);

  if(name==="coin") renderCoin();
  else if(name==="dice") renderDice();
  else if(name==="mines") {
    // если игра была, оставляем; если нет — покажем setup
    renderMines();
  }
}

// старт
setScreen("coin");
setNavActive("coin");