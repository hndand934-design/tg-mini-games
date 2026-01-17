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
const tgHint = document.getElementById("tgHint");
if (tg) {
  tg.ready();
  tg.expand();
  const u = tg.initDataUnsafe?.user;
  tgHint.textContent = u ? `Привет, ${u.first_name}` : "Открыто в Telegram";
} else {
  tgHint.textContent = "Открыто вне Telegram";
}

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
function saveWallet(w) { localStorage.setItem(WALLET_KEY, JSON.stringify(w)); }
let wallet = loadWallet();

const balancePill = document.getElementById("balancePill");
function setCoins(v) {
  wallet.coins = Math.max(0, Math.floor(v));
  saveWallet(wallet);
  balancePill.textContent = `🪙 ${wallet.coins}`;
}
function addCoins(d) { setCoins(wallet.coins + d); }
setCoins(wallet.coins);

// ===============================
// Modern SFX (WebAudio, no files)
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

  o.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
  o.start(now); o.stop(now + t + 0.02);
}
function noise({ t=0.08, g=0.02, when=0, hp=1200 }) {
  const ctx = audioCtx(); if (!ctx) return;
  const now = ctx.currentTime + when;
  const n = Math.floor(ctx.sampleRate * t);
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i=0;i<n;i++) data[i] = (Math.random()*2-1) * (1 - i/n);

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(g, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + t);

  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(hp, now);

  src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
  src.start(now); src.stop(now + t + 0.02);
}

const SFX = {
  click(){ tone({type:"triangle", f:520, t:0.05, g:0.04}); },
  whoosh(){ noise({t:0.13,g:0.03,hp:900}); tone({type:"triangle", f:340, t:0.12, g:0.03, when:0.01}); },
  impact(){ tone({type:"sine", f:980, t:0.06, g:0.05}); tone({type:"sine", f:1560, t:0.05, g:0.03, when:0.01}); noise({t:0.05,g:0.015,hp:2600,when:0.005}); },
  win(){ tone({type:"sine", f:740, t:0.10, g:0.05}); tone({type:"sine", f:932, t:0.12, g:0.045, when:0.05}); tone({type:"sine", f:1244, t:0.14, g:0.040, when:0.10}); },
  lose(){ tone({type:"sine", f:220, t:0.16, g:0.06}); tone({type:"sine", f:165, t:0.18, g:0.05, when:0.06}); },
  tick(){ tone({type:"square", f:820, t:0.03, g:0.02}); },
  mine(){ noise({t:0.14,g:0.05,hp:400}); tone({type:"sine", f:90, t:0.18, g:0.07}); },
  cash(){ tone({type:"sine", f:660, t:0.08, g:0.05}); tone({type:"sine", f:990, t:0.10, g:0.045, when:0.06}); },
};

// ===============================
// Navigation
// ===============================
const screenEl = document.getElementById("screen");
const navBtns = document.querySelectorAll(".nav__btn");

function setActiveNav(name){
  navBtns.forEach(b => b.classList.toggle("active", b.dataset.screen === name));
}
navBtns.forEach(btn=>{
  btn.addEventListener("click", async ()=>{
    await unlockAudio();
    SFX.click();
    setScreen(btn.dataset.screen);
  });
});

// ===============================
// COIN FLIP state
// ===============================
const CF = {
  choice: "heads",     // heads/tails
  bet: 50,
  spinning: false,
  sfx: true,
  streak: true,
  streakIndex: 0,
  streakSteps: [1.94, 3.88, 7.76, 15.52],
  coinState: "neutral", // neutral/heads/tails  (важно!)
  lastMsg: "",
};

function cfMult(){
  if (!CF.streak) return 1.94;
  return CF.streakSteps[Math.min(CF.streakIndex, CF.streakSteps.length - 1)];
}

// ===============================
// DICE state
// ===============================
const DICE = {
  sides: 6,          // 6/20/100
  mode: "below",     // below/above
  threshold: 3,
  bet: 50,
  rolling: false,
  lastRoll: null,
  lastMsg: "",
  sfx: true,
};

function diceClampThreshold(){
  const s = DICE.sides;

  // убираем 100% шанс:
  // below: threshold не может быть == s
  // above: threshold не может быть == 1
  if (DICE.mode === "below") {
    const maxT = Math.max(1, s - 1);
    DICE.threshold = Math.min(Math.max(1, DICE.threshold), maxT);
  } else {
    const minT = Math.min(s, 2); // минимум 2
    DICE.threshold = Math.min(Math.max(minT, DICE.threshold), s);
  }
}

function diceChance(){
  const s = DICE.sides;
  const t = DICE.threshold;
  if (DICE.mode === "below") return t / s;          // win if roll <= t
  return (s - t + 1) / s;                           // win if roll >= t
}
function diceMult(){
  // house edge ~2%
  const edge = 0.98;
  return Math.max(1.02, edge / diceChance());
}

// ===============================
// MINES state
// ===============================
let MINES = null; // active round or null

function minesBuild(minesCount){
  const size = 25;
  const s = new Set();
  while (s.size < minesCount) s.add(randInt(0, size - 1));
  return s;
}

// простой “казиношный” рост (не точные шансы, но выглядит вкусно)
function minesMult(safeOpened, minesCount){
  const a = 0.10 + minesCount * 0.007;
  const b = 0.018 + minesCount * 0.0016;
  const m = 1 + safeOpened * a + (safeOpened*safeOpened) * b * 0.06;
  return Math.max(1, m);
}

// ===============================
// Screen router
// ===============================
function setScreen(name){
  setActiveNav(name);
  if (name === "coin") return renderCoin();
  if (name === "dice") return renderDice();
  if (name === "mines") return renderMines();
}
setScreen("coin");

// ===============================
// COIN UI
// ===============================
function renderCoin(){
  const mult = cfMult();
  const possible = Math.floor(CF.bet * mult);

  screenEl.innerHTML = `
    <div class="card">
      <div class="rowBetween">
        <div>
          <div class="h1">Coin Flip</div>
          <div class="hint">Фиолетовая монета в полёте — после броска становится золотой (орёл) или серебряной (решка).</div>
        </div>
        <div class="pill">Баланс: <b>🪙 ${wallet.coins}</b></div>
      </div>

      <div class="grid2">
        <div class="panel">
          <div class="coinStage">
            <div class="coinShadow" id="cfShadow"></div>
            <div class="coin3d coin--${CF.coinState}" id="cfCoin">
              <div class="rim"></div>
              <div class="face front"><div class="label">ОРЁЛ</div></div>
              <div class="face back"><div class="label">РЕШКА</div></div>
            </div>
          </div>

          <div class="row" style="margin-top:12px">
            <button class="chip ${CF.choice==="heads"?"active":""}" id="cfHeads" ${CF.spinning?"disabled":""}>🦅 Орёл</button>
            <button class="chip ${CF.choice==="tails"?"active":""}" id="cfTails" ${CF.spinning?"disabled":""}>🌙 Решка</button>

            <div style="flex:1"></div>

            <button class="chip ${CF.sfx?"active":""}" id="cfSfx">Звук</button>
            <button class="chip ${CF.streak?"active":""}" id="cfStreak">Серия</button>
          </div>

          <div class="kpis">
            <div class="kpi"><div class="t">Множитель</div><div class="v">x${mult.toFixed(2)}</div></div>
            <div class="kpi"><div class="t">Возможный выигрыш</div><div class="v">+${possible} 🪙</div></div>
            <div class="kpi"><div class="t">Статус</div><div class="v">${CF.spinning ? "В полёте…" : "Готов"}</div></div>
          </div>

          <div class="row" style="margin-top:12px">
            <button class="btn" id="cfThrow" style="flex:1" ${CF.spinning?"disabled":""}>Бросить</button>
            <button class="btnGhost" id="cfCash" ${CF.streak && CF.streakIndex>0 && !CF.spinning ? "" : "disabled"}>Забрать</button>
          </div>

          <div class="msg ${CF.lastMsg.includes("✅")?"good":CF.lastMsg.includes("❌")?"bad":"dim"}" id="cfMsg">${CF.lastMsg||""}</div>
        </div>

        <div class="panel">
          <div class="rowBetween">
            <div class="h1" style="font-size:14px">Ставка</div>
            <button class="chip" id="cfBonus">+1000 🪙</button>
          </div>

          <div class="row" style="margin-top:10px">
            ${[10,50,100,250,500].map(v=>`<button class="chip" data-bet="${v}">${v}</button>`).join("")}
            <button class="chip" data-bet="max">MAX</button>
          </div>

          <div class="row" style="margin-top:10px">
            <button class="btnGhost" id="cfMinus" style="width:44px">-</button>
            <input class="input" id="cfBet" type="number" min="1" step="1" value="${CF.bet}">
            <button class="btnGhost" id="cfPlus" style="width:44px">+</button>
          </div>

          <div class="hint" style="margin-top:10px">
            Серия: при выигрыше шаг множителя растёт, при проигрыше сбрасывается. Сторону можно менять каждый бросок.
          </div>

          <div class="row" style="margin-top:10px">
            ${CF.streakSteps.map((m,i)=>`<span class="chip ${CF.streak && i===CF.streakIndex ? "active":""}" style="cursor:default">x${m.toFixed(2)}</span>`).join("")}
          </div>
        </div>
      </div>
    </div>
  `;

  const coinEl = document.getElementById("cfCoin");
  const shadowEl = document.getElementById("cfShadow");
  const betInput = document.getElementById("cfBet");

  function clampBet(){
    let v = Math.floor(Number(betInput.value)||0);
    if (v<1) v=1;
    if (v>wallet.coins) v=wallet.coins;
    CF.bet = v;
    betInput.value = String(v);
  }
  clampBet();

  document.getElementById("cfHeads").onclick = ()=>{ if(!CF.spinning){ CF.choice="heads"; renderCoin(); } };
  document.getElementById("cfTails").onclick = ()=>{ if(!CF.spinning){ CF.choice="tails"; renderCoin(); } };

  document.getElementById("cfSfx").onclick = async ()=>{
    await unlockAudio();
    CF.sfx = !CF.sfx;
    SFX.click();
    renderCoin();
  };
  document.getElementById("cfStreak").onclick = async ()=>{
    await unlockAudio();
    if (CF.spinning) return;
    CF.streak = !CF.streak;
    if (!CF.streak) CF.streakIndex = 0;
    SFX.click();
    renderCoin();
  };

  document.querySelectorAll("[data-bet]").forEach(b=>{
    b.onclick = async ()=>{
      await unlockAudio();
      SFX.click();
      const val = b.dataset.bet;
      betInput.value = val === "max" ? String(wallet.coins) : String(val);
      clampBet();
      renderCoin();
    };
  });

  document.getElementById("cfMinus").onclick = async ()=>{
    await unlockAudio(); SFX.click();
    betInput.value = String((Number(betInput.value)||1)-10);
    clampBet(); renderCoin();
  };
  document.getElementById("cfPlus").onclick = async ()=>{
    await unlockAudio(); SFX.click();
    betInput.value = String((Number(betInput.value)||1)+10);
    clampBet(); renderCoin();
  };
  betInput.oninput = ()=>{ clampBet(); };

  document.getElementById("cfBonus").onclick = async ()=>{
    await unlockAudio(); SFX.click();
    addCoins(1000);
    renderCoin();
  };

  document.getElementById("cfCash").onclick = async ()=>{
    await unlockAudio();
    if (!(CF.streak && CF.streakIndex>0)) return;
    const m = cfMult();
    const payout = Math.floor(CF.bet * m);
    addCoins(payout);
    if (CF.sfx) SFX.cash();
    CF.lastMsg = `✅ Забрал: +${payout} 🪙 (x${m.toFixed(2)})`;
    CF.streakIndex = 0;
    renderCoin();
  };

  document.getElementById("cfThrow").onclick = async ()=>{
    await unlockAudio();
    if (CF.spinning) return;

    clampBet();
    if (CF.bet <= 0) return;
    if (CF.bet > wallet.coins) return alert("Недостаточно монет");

    // списываем ставку
    addCoins(-CF.bet);

    CF.spinning = true;
    CF.lastMsg = "Монета в воздухе…";
    renderCoin();

    // монета в полете ВСЕГДА фиолетовая (как ты хочешь)
    CF.coinState = "neutral";

    const rz = randInt(420, 820);
    const rx = randInt(1400, 2400);

    coinEl.classList.remove("coinThrow");
    coinEl.style.setProperty("--rz", `${rz}deg`);
    coinEl.style.setProperty("--rx", `${rx}deg`);
    void coinEl.offsetWidth;
    coinEl.classList.add("coinThrow");

    shadowEl.style.transform = "scale(1.05)";
    shadowEl.style.opacity = ".70";

    if (CF.sfx) SFX.whoosh();

    // результат честный 50/50
    const res = randFloat() < 0.5 ? "heads" : "tails";

    setTimeout(()=>{ if (CF.sfx) SFX.impact(); }, 850);

    // ждём окончание
    await new Promise(r=>setTimeout(r, 1100));

    // фиксируем грань и цвет
    // heads -> золото, tails -> серебро (решка НЕ фиолетовая!)
    CF.coinState = (res === "heads") ? "heads" : "tails";

    // Поворачиваем к нужной стороне
    // heads: front (0deg), tails: back (180deg)
    coinEl.style.transform = (res==="heads") ? "rotateY(0deg)" : "rotateY(180deg)";

    const won = (CF.choice === res);
    const m = cfMult();

    if (won){
      const payout = Math.floor(CF.bet * m);
      addCoins(payout);

      if (CF.streak) CF.streakIndex = Math.min(CF.streakIndex+1, CF.streakSteps.length-1);
      CF.lastMsg = `✅ Выпало ${res==="heads"?"ОРЁЛ":"РЕШКА"} · +${payout} 🪙 (x${m.toFixed(2)})`;
      if (CF.sfx) SFX.win();
    } else {
      CF.streakIndex = 0;
      CF.lastMsg = `❌ Выпало ${res==="heads"?"ОРЁЛ":"РЕШКА"} · -${CF.bet} 🪙`;
      if (CF.sfx) SFX.lose();
    }

    CF.spinning = false;

    shadowEl.style.transform = "scale(.8)";
    shadowEl.style.opacity = ".55";

    renderCoin();
  };
}

// ===============================
// DICE UI
// ===============================
function renderDice(){
  diceClampThreshold();

  // bet clamp
  DICE.bet = Math.floor(Number(DICE.bet)||1);
  if (DICE.bet < 1) DICE.bet = 1;
  if (DICE.bet > wallet.coins) DICE.bet = wallet.coins;

  const chance = diceChance();
  const mult = diceMult();
  const payout = Math.floor(DICE.bet * mult);

  const winText = (DICE.mode==="below")
    ? `Выигрыш, если выпало ≤ ${DICE.threshold}`
    : `Выигрыш, если выпало ≥ ${DICE.threshold}`;

  // win zone percent (for bar)
  const s = DICE.sides;
  const t = DICE.threshold;
  const winPct = (DICE.mode==="below")
    ? (t / s) * 100
    : ((s - t + 1) / s) * 100;

  screenEl.innerHTML = `
    <div class="card">
      <div class="rowBetween">
        <div>
          <div class="h1">Dice</div>
          <div class="hint">D6/D20/D100 · понятная шкала + маркер результата. 100% шанс запрещён.</div>
        </div>
        <div class="pill">Баланс: <b>🪙 ${wallet.coins}</b></div>
      </div>

      <div class="panel" style="margin-top:12px">
        <div class="row">
          <button class="chip ${DICE.sides===6?"active":""}" data-sides="6">D6</button>
          <button class="chip ${DICE.sides===20?"active":""}" data-sides="20">D20</button>
          <button class="chip ${DICE.sides===100?"active":""}" data-sides="100">D100</button>

          <div style="flex:1"></div>

          <button class="chip ${DICE.mode==="below"?"active":""}" data-mode="below">Меньше</button>
          <button class="chip ${DICE.mode==="above"?"active":""}" data-mode="above">Больше</button>

          <button class="chip ${DICE.sfx?"active":""}" id="diceSfx">Звук</button>
        </div>

        <div class="kpis">
          <div class="kpi"><div class="t">Твоё число</div><div class="v">${String(DICE.threshold).padStart(2,"0")}</div></div>
          <div class="kpi"><div class="t">Выпало</div><div class="v" id="diceRolled">${DICE.lastRoll==null?"—":String(DICE.lastRoll).padStart(2,"0")}</div></div>
          <div class="kpi"><div class="t">Шанс</div><div class="v">${(chance*100).toFixed(1)}%</div></div>
        </div>

        <div class="diceBar">
          <div class="row">
            <div style="font-weight:950">Порог: <span id="thLabel">${DICE.threshold}</span> из ${s}</div>
            <div class="pillHint" id="pillHint">Шанс ${(chance*100).toFixed(1)}% · x${mult.toFixed(2)}</div>
          </div>

          <input class="range" id="threshold" type="range" min="1" max="${s}" value="${DICE.threshold}" ${DICE.rolling?"disabled":""}>

          <div class="hint" style="margin-top:8px">${winText}</div>

          <div class="barWrap" id="barWrap">
            <div class="barLose" style="left:0; right:0;"></div>
            <div class="barWin" id="barWin"></div>
            <div class="barMarker" id="barMarker" style="left:${DICE.lastRoll? ((DICE.lastRoll-1)/(s-1))*100 : 0}%"></div>
          </div>
        </div>

        <div class="panel" style="margin-top:12px">
          <div class="rowBetween">
            <div style="font-weight:950">Ставка</div>
            <div class="pill pill--mono"><b id="betShow">${DICE.bet}</b> 🪙</div>
          </div>

          <div class="row" style="margin-top:10px">
            ${[10,50,100,250,500].map(v=>`<button class="chip" data-bet="${v}">${v}</button>`).join("")}
            <button class="chip" data-bet="max">MAX</button>
          </div>

          <div class="row" style="margin-top:10px">
            <button class="btnGhost" id="dMinus" style="width:44px">-</button>
            <input class="input" id="dBet" type="number" min="1" step="1" value="${DICE.bet}">
            <button class="btnGhost" id="dPlus" style="width:44px">+</button>
          </div>

          <div class="kpis" style="margin-top:10px">
            <div class="kpi"><div class="t">Множитель</div><div class="v">x${mult.toFixed(2)}</div></div>
            <div class="kpi"><div class="t">Возможный выигрыш</div><div class="v">+${payout} 🪙</div></div>
            <div class="kpi"><div class="t">Статус</div><div class="v">${DICE.rolling?"Крутится…":"Готов"}</div></div>
          </div>

          <div class="row" style="margin-top:12px">
            <button class="btn" id="diceRoll" style="flex:1" ${DICE.rolling?"disabled":""}>Бросить</button>
            <button class="btnGhost" id="diceBonus">+1000 🪙</button>
          </div>

          <div class="msg ${DICE.lastMsg.includes("✅")?"good":DICE.lastMsg.includes("❌")?"bad":"dim"}">${DICE.lastMsg||""}</div>
        </div>
      </div>
    </div>
  `;

  // win zone paint
  const barWin = document.getElementById("barWin");
  if (DICE.mode === "below"){
    barWin.style.left = "0%";
    barWin.style.width = `${winPct}%`;
  } else {
    barWin.style.left = `${100 - winPct}%`;
    barWin.style.width = `${winPct}%`;
  }

  // handlers
  document.querySelectorAll("[data-sides]").forEach(b=>{
    b.onclick = async ()=>{
      await unlockAudio(); SFX.click();
      DICE.sides = Number(b.dataset.sides);
      if (DICE.sides === 6) DICE.threshold = 3;
      if (DICE.sides === 20) DICE.threshold = 10;
      if (DICE.sides === 100) DICE.threshold = 50;
      DICE.lastRoll = null;
      DICE.lastMsg = "";
      renderDice();
    };
  });
  document.querySelectorAll("[data-mode]").forEach(b=>{
    b.onclick = async ()=>{
      await unlockAudio(); SFX.click();
      DICE.mode = b.dataset.mode;
      DICE.lastRoll = null;
      DICE.lastMsg = "";
      renderDice();
    };
  });

  document.getElementById("diceSfx").onclick = async ()=>{
    await unlockAudio(); SFX.click();
    DICE.sfx = !DICE.sfx;
    renderDice();
  };

  const threshold = document.getElementById("threshold");
  threshold.oninput = ()=>{
    DICE.threshold = Number(threshold.value);
    diceClampThreshold();
    document.getElementById("thLabel").textContent = String(DICE.threshold);
    renderDice();
  };

  const betInput = document.getElementById("dBet");
  function clampBet(){
    let v = Math.floor(Number(betInput.value)||0);
    if (v<1) v=1;
    if (v>wallet.coins) v=wallet.coins;
    DICE.bet = v;
    betInput.value = String(v);
  }
  betInput.oninput = ()=>{ clampBet(); };

  document.querySelectorAll("[data-bet]").forEach(b=>{
    b.onclick = async ()=>{
      await unlockAudio(); SFX.click();
      const val = b.dataset.bet;
      betInput.value = val==="max" ? String(wallet.coins) : String(val);
      clampBet();
      renderDice();
    };
  });

  document.getElementById("dMinus").onclick = async ()=>{
    await unlockAudio(); SFX.click();
    betInput.value = String((Number(betInput.value)||1)-10);
    clampBet(); renderDice();
  };
  document.getElementById("dPlus").onclick = async ()=>{
    await unlockAudio(); SFX.click();
    betInput.value = String((Number(betInput.value)||1)+10);
    clampBet(); renderDice();
  };

  document.getElementById("diceBonus").onclick = async ()=>{
    await unlockAudio(); SFX.click();
    addCoins(1000);
    renderDice();
  };

  document.getElementById("diceRoll").onclick = async ()=>{
    await unlockAudio();
    if (DICE.rolling) return;

    diceClampThreshold();
    clampBet();

    if (DICE.bet <= 0) return;
    if (DICE.bet > wallet.coins) return alert("Недостаточно монет");

    // списываем ставку
    addCoins(-DICE.bet);

    DICE.rolling = true;
    DICE.lastMsg = "";
    renderDice();

    const s = DICE.sides;
    const roll = randInt(1, s);
    const win = (DICE.mode==="below") ? (roll <= DICE.threshold) : (roll >= DICE.threshold);

    const marker = document.getElementById("barMarker");
    const rolledEl = document.getElementById("diceRolled");

    // анимация маркера + цифры
    marker.classList.add("anim");
    marker.style.left = `${((roll-1)/(s-1))*100}%`;

    const t0 = performance.now();
    const dur = 700;
    const tickTimer = setInterval(()=>{
      if (!DICE.sfx) return;
      SFX.tick();
    }, 90);

    const numTimer = setInterval(()=>{
      const p = Math.min(1, (performance.now()-t0)/dur);
      if (p >= 1){
        clearInterval(numTimer);
        rolledEl.textContent = String(roll).padStart(2,"0");
        return;
      }
      rolledEl.textContent = String(randInt(1, s)).padStart(2,"0");
    }, 50);

    if (DICE.sfx) SFX.whoosh();

    setTimeout(()=>{
      clearInterval(tickTimer);

      const mult = diceMult();
      const payout = Math.floor(DICE.bet * mult);

      if (win){
        addCoins(payout);
        DICE.lastMsg = `✅ Выпало ${roll}. Выигрыш +${payout} 🪙 (x${mult.toFixed(2)})`;
        if (DICE.sfx) SFX.win();
      } else {
        DICE.lastMsg = `❌ Выпало ${roll}. Проигрыш -${DICE.bet} 🪙`;
        if (DICE.sfx) SFX.lose();
      }

      DICE.lastRoll = roll;
      DICE.rolling = false;
      renderDice();
    }, 820);
  };
}

// ===============================
// MINES UI
// ===============================
function renderMines(){
  // setup screen if no round
  if (!MINES) {
    const betDefault = Math.min(50, wallet.coins);
    const minesDefault = 5;

    screenEl.innerHTML = `
      <div class="card">
        <div class="rowBetween">
          <div>
            <div class="h1">Mines</div>
            <div class="hint">5x5 · выбери ставку и количество мин · открывай safe и забирай.</div>
          </div>
          <div class="pill">Баланс: <b>🪙 ${wallet.coins}</b></div>
        </div>

        <div class="panel" style="margin-top:12px">
          <div class="rowBetween">
            <div style="font-weight:950">Ставка</div>
            <div class="pill pill--mono"><b id="mBetShow">${betDefault}</b> 🪙</div>
          </div>

          <div class="row" style="margin-top:10px">
            ${[10,50,100,250,500].map(v=>`<button class="chip" data-mbet="${v}">${v}</button>`).join("")}
            <button class="chip" data-mbet="max">MAX</button>
          </div>

          <div class="row" style="margin-top:10px">
            <button class="btnGhost" id="mMinus" style="width:44px">-</button>
            <input class="input" id="mBet" type="number" min="1" step="1" value="${betDefault}">
            <button class="btnGhost" id="mPlus" style="width:44px">+</button>
          </div>

          <div style="margin-top:12px">
            <div class="rowBetween">
              <div style="font-weight:950">Количество мин</div>
              <div class="pill pill--mono"><b id="mCountShow">${minesDefault}</b></div>
            </div>
            <input class="range" id="mCount" type="range" min="1" max="24" value="${minesDefault}">
            <div class="hint">Больше мин → выше риск, но множитель растёт быстрее.</div>
          </div>

          <div class="row" style="margin-top:12px">
            <button class="btn" id="mStart" style="flex:1">Start</button>
            <button class="btnGhost" id="mBonus">+1000 🪙</button>
          </div>

          <div class="msg dim" id="mMsg"></div>
        </div>
      </div>
    `;

    const betEl = document.getElementById("mBet");
    const betShow = document.getElementById("mBetShow");
    const countEl = document.getElementById("mCount");
    const countShow = document.getElementById("mCountShow");

    function clampBet(){
      let v = Math.floor(Number(betEl.value)||0);
      if (v<1) v=1;
      if (v>wallet.coins) v=wallet.coins;
      betEl.value = String(v);
      betShow.textContent = String(v);
    }
    function clampCount(){
      let v = Math.floor(Number(countEl.value)||1);
      v = Math.min(24, Math.max(1, v));
      countEl.value = String(v);
      countShow.textContent = String(v);
    }

    clampBet(); clampCount();

    document.querySelectorAll("[data-mbet]").forEach(b=>{
      b.onclick = async ()=>{
        await unlockAudio(); SFX.click();
        const val = b.dataset.mbet;
        betEl.value = val==="max" ? String(wallet.coins) : String(val);
        clampBet();
      };
    });
    document.getElementById("mMinus").onclick = async ()=>{
      await unlockAudio(); SFX.click();
      betEl.value = String((Number(betEl.value)||1)-10);
      clampBet();
    };
    document.getElementById("mPlus").onclick = async ()=>{
      await unlockAudio(); SFX.click();
      betEl.value = String((Number(betEl.value)||1)+10);
      clampBet();
    };
    betEl.oninput = clampBet;

    countEl.oninput = async ()=>{
      await unlockAudio(); SFX.click();
      clampCount();
    };

    document.getElementById("mBonus").onclick = async ()=>{
      await unlockAudio(); SFX.click();
      addCoins(1000);
      renderMines();
    };

    document.getElementById("mStart").onclick = async ()=>{
      await unlockAudio(); SFX.click();
      clampBet(); clampCount();

      const bet = Math.floor(Number(betEl.value)||0);
      const minesCount = Math.floor(Number(countEl.value)||0);

      if (bet <= 0) return;
      if (bet > wallet.coins) return alert("Недостаточно монет");
      if (minesCount < 1 || minesCount > 24) return;

      addCoins(-bet);

      MINES = {
        bet,
        minesCount,
        mines: minesBuild(minesCount),
        opened: new Set(),
        over: false,
        cashed: false,
        safeOpened: 0,
        mult: 1,
        msg: "",
        lastMine: null,
      };
      renderMines();
    };

    return;
  }

  // active round
  const size = 25;
  const maxSafe = size - MINES.minesCount;
  const potential = Math.floor(MINES.bet * MINES.mult);

  // build tiles
  const tiles = [];
  for (let i=0;i<size;i++){
    const opened = MINES.opened.has(i);
    const isMine = MINES.mines.has(i);

    let cls = "tile";
    let label = "";
    if (opened) cls += " open";
    if (opened && isMine) { cls += " mine"; label = "💣"; }
    if (opened && !isMine) { cls += " safe"; label = "✅"; }
    if (MINES.lastMine === i) cls += " boom";

    tiles.push(`
      <button class="${cls}" data-i="${i}" ${MINES.over ? "disabled":""}>
        <div class="tileInner">${label}</div>
      </button>
    `);
  }

  screenEl.innerHTML = `
    <div class="card">
      <div class="rowBetween">
        <div>
          <div class="h1">Mines</div>
          <div class="hint">Safe: <b>${MINES.safeOpened}</b> · Мин: <b>${MINES.minesCount}</b> · Ставка: <b>${MINES.bet} 🪙</b></div>
        </div>
        <div class="pill">Сейчас: <b>x${MINES.mult.toFixed(2)}</b></div>
      </div>

      <div class="kpis" style="margin-top:12px">
        <div class="kpi"><div class="t">Забрать сейчас</div><div class="v">${potential} 🪙</div></div>
        <div class="kpi"><div class="t">Осталось safe</div><div class="v">${maxSafe - MINES.safeOpened}</div></div>
        <div class="kpi"><div class="t">Статус</div><div class="v">${MINES.over ? "Раунд завершён" : "Игра"}</div></div>
      </div>

      <div class="msg ${MINES.msg.includes("✅")?"good":MINES.msg.includes("💥")?"bad":"dim"}">${MINES.msg||""}</div>

      <div class="minesGrid">${tiles.join("")}</div>

      <div class="row" style="margin-top:12px">
        <button class="btn" id="mCash" style="flex:1" ${MINES.over ? "disabled":""}>Забрать</button>
        <button class="btnGhost" id="mNew">Новый раунд</button>
      </div>
    </div>
  `;

  function revealAll(){
    for (let i=0;i<size;i++) MINES.opened.add(i);
  }

  function cashOut(){
    if (MINES.over || MINES.cashed) return;
    MINES.cashed = true;
    MINES.over = true;
    const payout = Math.floor(MINES.bet * MINES.mult);
    addCoins(payout);
    MINES.msg = `✅ Забрал: +${payout} 🪙 (x${MINES.mult.toFixed(2)})`;
    if (true) SFX.cash();
    revealAll();
    renderMines();
  }

  function clickTile(i){
    if (MINES.over) return;
    if (MINES.opened.has(i)) return;

    MINES.opened.add(i);

    const isMine = MINES.mines.has(i);
    if (isMine){
      MINES.over = true;
      MINES.lastMine = i;
      MINES.msg = `💥 Мина! Ставка ${MINES.bet} 🪙 сгорела`;
      SFX.mine();
      revealAll();
      renderMines();
      return;
    }

    SFX.click();
    MINES.safeOpened += 1;
    MINES.mult = minesMult(MINES.safeOpened, MINES.minesCount);

    if (MINES.safeOpened >= maxSafe){
      MINES.msg = "✅ Открыл все safe — авто-забор.";
      cashOut();
      return;
    }

    MINES.msg = `✅ Safe! Сейчас x${MINES.mult.toFixed(2)} · можно забрать ${Math.floor(MINES.bet*MINES.mult)} 🪙`;
    renderMines();
  }

  document.getElementById("mCash").onclick = async ()=>{ await unlockAudio(); cashOut(); };
  document.getElementById("mNew").onclick = async ()=>{
    await unlockAudio(); SFX.click();
    MINES = null;
    renderMines();
  };

  document.querySelectorAll(".tile").forEach(b=>{
    b.onclick = async ()=>{
      await unlockAudio();
      clickTile(Number(b.dataset.i));
    };
  });
}

