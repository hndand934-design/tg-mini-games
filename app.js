// ===============================
// RNG (честный, crypto)
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
if (tg) {
  tg.ready();
  tg.expand();
}

const screenEl = document.getElementById("screen");
const userEl = document.getElementById("user");
const btnFull = document.getElementById("btnFull");
const user = tg?.initDataUnsafe?.user;

btnFull?.addEventListener("click", () => {
  try { tg?.expand(); } catch {}
});

// ===============================
// Virtual Wallet (local)
// ===============================
const WALLET_KEY = "mini_wallet_v3";
function loadWallet() {
  try {
    const w = JSON.parse(localStorage.getItem(WALLET_KEY) || "null");
    if (w && typeof w.coins === "number") return w;
  } catch {}
  return { coins: 1000 };
}
function saveWallet(w) {
  localStorage.setItem(WALLET_KEY, JSON.stringify(w));
}
let wallet = loadWallet();

function setCoins(v) {
  wallet.coins = Math.max(0, Math.floor(v));
  saveWallet(wallet);
  renderTopBar();
}
function addCoins(d) {
  setCoins(wallet.coins + d);
}
function renderTopBar() {
  const coins = wallet.coins;
  userEl.textContent = user
    ? `Привет, ${user.first_name} · 🪙 ${coins}`
    : `Открыто вне Telegram · 🪙 ${coins}`;
}
renderTopBar();

// ===============================
// WebAudio SFX (современные)
// ===============================
let _audioCtx = null;
function getAudio() {
  if (_audioCtx) return _audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  _audioCtx = Ctx ? new Ctx() : null;
  return _audioCtx;
}
async function unlockAudio() {
  const ctx = getAudio();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch {}
  }
}
function playTone({ type="sine", f=440, t=0.08, g=0.06, detune=0, when=0 }) {
  const ctx = getAudio(); if (!ctx) return;
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
  o.start(now);
  o.stop(now + t + 0.02);
}
function playNoise({ t=0.10, g=0.03, when=0, hp=900 }) {
  const ctx = getAudio(); if (!ctx) return;
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
  src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
  src.start(now);
  src.stop(now + t + 0.02);
}

// --- SFX набор ---
const SFX = {
  click() {
    playTone({ type:"triangle", f:520, t:0.05, g:0.04 });
    playTone({ type:"sine", f:840, t:0.04, g:0.02, when:0.01 });
  },
  coinStart() {
    playNoise({ t:0.12, g:0.025, hp:1200, when:0 });
    playTone({ type:"triangle", f:420, t:0.11, g:0.03, when:0.01 });
    playTone({ type:"triangle", f:320, t:0.11, g:0.02, when:0.02 });
  },
  coinImpact() {
    playTone({ type:"sine", f:980, t:0.06, g:0.05, when:0 });
    playTone({ type:"sine", f:1560, t:0.05, g:0.03, when:0.01 });
    playNoise({ t:0.06, g:0.015, hp:2500, when:0.005 });
  },
  win() {
    playTone({ type:"sine", f:740, t:0.10, g:0.05, when:0 });
    playTone({ type:"sine", f:932, t:0.12, g:0.045, when:0.05 });
    playTone({ type:"sine", f:1244, t:0.14, g:0.040, when:0.10 });
  },
  lose() {
    playTone({ type:"sine", f:220, t:0.16, g:0.06, when:0 });
    playTone({ type:"sine", f:165, t:0.18, g:0.05, when:0.06 });
  },
  roll() {
    playNoise({ t:0.14, g:0.02, hp:1000, when:0 });
    playTone({ type:"triangle", f:240, t:0.12, g:0.02, when:0.02 });
  },
  mineBoom() {
    playNoise({ t:0.16, g:0.06, hp:120, when:0 });
    playTone({ type:"sine", f:120, t:0.20, g:0.07, when:0.01 });
  },
};

let globalSound = true;
function playClick() {
  if (!globalSound) return;
  unlockAudio();
  SFX.click();
}

// ===============================
// NAV
// ===============================
const navButtons = Array.from(document.querySelectorAll(".navBtn"));
navButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    playClick();
    navButtons.forEach(b => b.classList.toggle("active", b === btn));
    setScreen(btn.dataset.screen);
  });
});

function setScreen(name) {
  if (name === "coin") return renderCoin();
  if (name === "dice") return renderDice();
  if (name === "mines") return renderMines();
  renderCoin();
}

// ===============================
// COIN FLIP
// ===============================
const coinState = {
  choice: "heads",
  bet: 50,
  spinning: false,
  sfx: true,
  streakOn: true,
  streakIndex: 0,
  streakSteps: [1.94, 3.88, 7.76, 15.52],
  lastMsg: ""
};

function renderCoin() {
  const mult = coinState.streakOn
    ? coinState.streakSteps[Math.min(coinState.streakIndex, coinState.streakSteps.length - 1)]
    : 1.94;
  const possibleWin = Math.floor(coinState.bet * mult);

  screenEl.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <div class="h1">Coin Flip</div>
          <div class="muted">Выбери сторону, сделай ставку и бросай монету. Серия даёт рост множителя.</div>
        </div>
        <div class="spacer"></div>
        <div class="badge">Баланс: <b>🪙 ${wallet.coins}</b></div>
      </div>

      <div class="cfGrid" style="margin-top:12px;">
        <div class="card" style="box-shadow:none;">
          <div class="coinStage">
            <div class="coinShadow"></div>
            <div class="coin3D coinBlank" id="coin3D">
              <div class="rim"></div>
              <div class="face front"><div class="coinLabel">ОРЁЛ</div></div>
              <div class="face back"><div class="coinLabel">РЕШКА</div></div>
            </div>
          </div>

          <div class="row" style="margin-top:10px;">
            <button class="chip ${coinState.choice==="heads"?"active":""}" id="pickHeads" ${coinState.spinning?"disabled":""}>🦅 Орёл</button>
            <button class="chip ${coinState.choice==="tails"?"active":""}" id="pickTails" ${coinState.spinning?"disabled":""}>🌙 Решка</button>
            <div class="spacer"></div>
            <button class="chip ${coinState.sfx?"active":""}" id="toggleSfx">Звук</button>
            <button class="chip ${coinState.streakOn?"active":""}" id="toggleStreak">Серия</button>
          </div>

          <div class="kpiGrid">
            <div class="kpi"><div class="t">Множитель</div><div class="v">x${mult.toFixed(2)}</div></div>
            <div class="kpi"><div class="t">Возможный выигрыш</div><div class="v">+${possibleWin} 🪙</div></div>
            <div class="kpi"><div class="t">Шаг серии</div><div class="v">${coinState.streakOn ? (coinState.streakIndex+1) : "—"}</div></div>
          </div>

          <div class="msgLine" id="coinMsg">${coinState.lastMsg || ""}</div>

          <div class="row" style="margin-top:10px;">
            <button class="btn" id="coinThrow" style="flex:1" ${coinState.spinning?"disabled":""}>Бросить</button>
            <button class="btn ghost" id="coinCash" ${coinState.streakOn && coinState.streakIndex>0 ? "" : "disabled"}>Забрать</button>
          </div>
        </div>

        <div class="card" style="box-shadow:none;">
          <div class="h1">Ставка</div>
          <div class="row" style="margin-top:8px;">
            ${[10,50,100,250,500].map(v=>`<button class="chip" data-bet="${v}">${v}</button>`).join("")}
            <button class="chip" data-bet="max">MAX</button>
          </div>

          <div class="row" style="margin-top:10px;">
            <button class="btn ghost small" id="betMinus">-</button>
            <input class="input" id="betInput" type="number" min="1" step="1" value="${coinState.bet}" />
            <button class="btn ghost small" id="betPlus">+</button>
          </div>

          <div class="muted" style="margin-top:10px;">
            Ставка списывается при броске. Серия: выиграл — множитель растёт, проиграл — сброс.
          </div>

          <div class="row" style="margin-top:12px;">
            <button class="btn ghost" id="bonusCoins" style="width:100%;">+1000 🪙</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const coinEl = document.getElementById("coin3D");
  const msgEl = document.getElementById("coinMsg");
  const betEl = document.getElementById("betInput");

  const clampBet = () => {
    let v = Math.floor(Number(betEl.value) || 0);
    if (v < 1) v = 1;
    if (v > wallet.coins) v = wallet.coins;
    coinState.bet = v;
    betEl.value = String(v);
  };
  clampBet();

  document.getElementById("pickHeads").onclick = () => { if(!coinState.spinning){ coinState.choice="heads"; renderCoin(); } };
  document.getElementById("pickTails").onclick = () => { if(!coinState.spinning){ coinState.choice="tails"; renderCoin(); } };

  document.getElementById("toggleSfx").onclick = () => { coinState.sfx = !coinState.sfx; renderCoin(); };
  document.getElementById("toggleStreak").onclick = () => {
    if (coinState.spinning) return;
    coinState.streakOn = !coinState.streakOn;
    if (!coinState.streakOn) coinState.streakIndex = 0;
    renderCoin();
  };

  document.querySelectorAll("[data-bet]").forEach(b=>{
    b.onclick = () => {
      const val = b.dataset.bet;
      betEl.value = val === "max" ? String(wallet.coins) : String(val);
      clampBet();
    };
  });
  document.getElementById("betMinus").onclick = () => { betEl.value = String((Number(betEl.value)||1) - 10); clampBet(); };
  document.getElementById("betPlus").onclick = () => { betEl.value = String((Number(betEl.value)||1) + 10); clampBet(); };
  betEl.oninput = clampBet;

  document.getElementById("bonusCoins").onclick = () => { addCoins(1000); renderCoin(); };

  function currentMult() {
    if (!coinState.streakOn) return 1.94;
    return coinState.streakSteps[Math.min(coinState.streakIndex, coinState.streakSteps.length - 1)];
  }

  document.getElementById("coinCash").onclick = () => {
    if (!(coinState.streakOn && coinState.streakIndex > 0)) return;
    const m = currentMult();
    const payout = Math.floor(coinState.bet * m);
    addCoins(payout);
    coinState.lastMsg = `✅ Забрал: +${payout} 🪙 (x${m.toFixed(2)})`;
    coinState.streakIndex = 0;
    renderCoin();
  };

  document.getElementById("coinThrow").onclick = async () => {
    await unlockAudio();
    clampBet();
    const bet = coinState.bet;
    if (bet <= 0) return alert("Ставка должна быть больше 0");
    if (bet > wallet.coins) return alert("Недостаточно монет");

    addCoins(-bet);

    coinState.spinning = true;
    msgEl.textContent = "Монета в воздухе…";

    if (coinState.sfx && globalSound) SFX.coinStart();

    coinEl.classList.add("coinBlank");
    const rz = (Math.random() * 420 + 380) | 0;
    const rx = (Math.random() * 900 + 1300) | 0;
    coinEl.style.setProperty("--rz", `${rz}deg`);
    coinEl.style.setProperty("--rx", `${rx}deg`);
    coinEl.classList.remove("coinAnim");
    void coinEl.offsetWidth;
    coinEl.classList.add("coinAnim");

    const res = randFloat() < 0.5 ? "heads" : "tails";

    setTimeout(() => { if (coinState.sfx && globalSound) SFX.coinImpact(); }, 850);
    await new Promise(r => setTimeout(r, 1050));

    coinEl.classList.remove("coinBlank");
    coinEl.style.transform = res === "heads" ? "rotateY(0deg)" : "rotateY(180deg)";

    const won = (coinState.choice === res);
    const m = currentMult();

    if (won) {
      const payout = Math.floor(bet * m);
      addCoins(payout);
      if (coinState.streakOn) {
        coinState.streakIndex = Math.min(coinState.streakIndex + 1, coinState.streakSteps.length - 1);
      }
      coinState.lastMsg = `✅ Выпало ${res==="heads"?"ОРЁЛ":"РЕШКА"} · +${payout} 🪙 (x${m.toFixed(2)})`;
      if (coinState.sfx && globalSound) SFX.win();
    } else {
      coinState.lastMsg = `❌ Выпало ${res==="heads"?"ОРЁЛ":"РЕШКА"} · -${bet} 🪙`;
      coinState.streakIndex = 0;
      if (coinState.sfx && globalSound) SFX.lose();
    }

    coinState.spinning = false;
    renderCoin();
  };
}

// ===============================
// DICE
// ===============================
let diceState = {
  sides: 6,         // 6/20/100
  mode: "below",    // below/above
  threshold: 3,
  bet: 50,
  rolling: false,
  lastRoll: null,
  lastMsg: ""
};

function diceChance(sides, mode, threshold) {
  if (mode === "below") return Math.max(1 / sides, Math.min(1, threshold / sides));
  return Math.max(1 / sides, Math.min(1, (sides - threshold + 1) / sides));
}
function diceMultiplier(chance) {
  const edge = 0.98;
  return Math.max(1.02, edge / chance);
}
function renderCubeFaceHTML(n) {
  const map = {
    1: [0,0,0,0,1,0,0,0,0],
    2: [1,0,0,0,0,0,0,0,1],
    3: [1,0,0,0,1,0,0,0,1],
    4: [1,0,1,0,0,0,1,0,1],
    5: [1,0,1,0,1,0,1,0,1],
    6: [1,0,1,1,0,1,1,0,1],
  };
  const arr = map[n];
  return `
    <div class="cubeFace f${n}">
      <div class="pipGrid">
        ${arr.map(v => `<div class="pip ${v ? "" : "off"}"></div>`).join("")}
      </div>
    </div>
  `;
}

function renderDice() {
  const s = diceState.sides;
  diceState.threshold = Math.max(1, Math.min(s, diceState.threshold));
  diceState.bet = Math.max(1, Math.min(wallet.coins, Math.floor(Number(diceState.bet)||1)));

  const chance = diceChance(s, diceState.mode, diceState.threshold);
  const mult = diceMultiplier(chance);
  const payout = Math.floor(diceState.bet * mult);
  const winText = diceState.mode === "below"
    ? `Выигрыш, если выпало ≤ ${diceState.threshold}`
    : `Выигрыш, если выпало ≥ ${diceState.threshold}`;

  screenEl.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <div class="h1">Dice</div>
          <div class="muted">D6 — 3D кубик. D20/D100 — рулетка. Режим “Меньше/Больше”.</div>
        </div>
        <div class="spacer"></div>
        <div class="badge">Баланс: <b>🪙 ${wallet.coins}</b></div>
      </div>

      <div class="row" style="margin-top:10px;">
        <button class="chip ${s===6?"active":""}" data-sides="6">D6</button>
        <button class="chip ${s===20?"active":""}" data-sides="20">D20</button>
        <button class="chip ${s===100?"active":""}" data-sides="100">D100</button>
        <div class="spacer"></div>
        <button class="chip ${diceState.mode==="below"?"active":""}" data-mode="below">Меньше</button>
        <button class="chip ${diceState.mode==="above"?"active":""}" data-mode="above">Больше</button>
      </div>

      <div class="bigNums">
        <div class="bigNum">
          <div class="n">${String(diceState.threshold).padStart(2,"0")}</div>
          <div class="s">твоё число</div>
        </div>
        <div class="bigNum">
          <div class="n">${diceState.lastRoll==null ? "00" : String(diceState.lastRoll).padStart(2,"0")}</div>
          <div class="s">выпавшее</div>
        </div>
      </div>

      <div class="kpiGrid">
        <div class="kpi"><div class="t">Множитель</div><div class="v">x${mult.toFixed(2)}</div></div>
        <div class="kpi"><div class="t">Возможный выигрыш</div><div class="v">+${payout} 🪙</div></div>
        <div class="kpi"><div class="t">Шанс</div><div class="v">${(chance*100).toFixed(1)}%</div></div>
      </div>

      <div style="margin-top:10px;">
        <div class="row" style="justify-content:space-between;">
          <div style="font-weight:900;">Порог: <b id="thLabel">${diceState.threshold}</b> из ${s}</div>
          <div class="badge">Шанс <b>${(chance*100).toFixed(1)}%</b> · x<b>${mult.toFixed(2)}</b></div>
        </div>
        <input id="threshold" class="range" type="range" min="1" max="${s}" value="${diceState.threshold}">
        <div class="muted">${winText}</div>
      </div>

      <div class="diceArena" id="diceArena">
        <div class="diceShadow"></div>
        ${
          s===6
          ? `<div class="diceThrow">
              <div class="cube ${diceState.lastRoll ? "show-"+diceState.lastRoll : ""}" id="cube">
                ${renderCubeFaceHTML(1)}
                ${renderCubeFaceHTML(2)}
                ${renderCubeFaceHTML(3)}
                ${renderCubeFaceHTML(4)}
                ${renderCubeFaceHTML(5)}
                ${renderCubeFaceHTML(6)}
              </div>
            </div>`
          : `<div class="rollStrip">
              <div class="ghostL" id="gL">17</div>
              <div class="num" id="stripNum">00</div>
              <div class="ghostR" id="gR">13</div>
            </div>`
        }
      </div>

      <div style="margin-top:12px;">
        <div class="row" style="justify-content:space-between;">
          <div style="font-weight:900;">Ставка</div>
          <div class="badge"><b id="betShow">${diceState.bet}</b> 🪙</div>
        </div>

        <div class="row" style="margin-top:8px;">
          ${[10,50,100,250,500].map(v=>`<button class="chip" data-bet="${v}">${v}</button>`).join("")}
          <button class="chip" data-bet="max">MAX</button>
        </div>

        <div class="row" style="margin-top:10px;">
          <button class="btn ghost small" id="betMinus">-</button>
          <input id="bet" class="input" type="number" min="1" step="1" value="${diceState.bet}">
          <button class="btn ghost small" id="betPlus">+</button>
        </div>
      </div>

      <div class="row" style="margin-top:12px;">
        <button class="btn" id="rollBtn" style="flex:1" ${diceState.rolling?"disabled":""}>Бросить</button>
        <button class="btn ghost" id="bonus">+1000 🪙</button>
      </div>

      <div class="msgLine" id="diceMsg">${diceState.lastMsg || ""}</div>
    </div>
  `;

  // handlers
  document.querySelectorAll("[data-sides]").forEach(b=>{
    b.onclick = () => {
      playClick();
      diceState.sides = Number(b.dataset.sides);
      diceState.threshold = diceState.sides === 6 ? 3 : (diceState.sides === 20 ? 10 : 50);
      diceState.lastRoll = null;
      diceState.lastMsg = "";
      renderDice();
    };
  });
  document.querySelectorAll("[data-mode]").forEach(b=>{
    b.onclick = () => {
      playClick();
      diceState.mode = b.dataset.mode;
      diceState.lastMsg = "";
      renderDice();
    };
  });

  const th = document.getElementById("threshold");
  th.oninput = () => {
    diceState.threshold = Number(th.value);
    document.getElementById("thLabel").textContent = String(diceState.threshold);
    diceState.lastMsg = "";
    renderDice();
  };

  const betInput = document.getElementById("bet");
  const betShow = document.getElementById("betShow");
  const clampBet = () => {
    let v = Math.floor(Number(betInput.value)||0);
    if (v<1) v=1;
    if (v>wallet.coins) v=wallet.coins;
    betInput.value = String(v);
    betShow.textContent = String(v);
    diceState.bet = v;
  };
  clampBet();
  betInput.oninput = clampBet;
  document.getElementById("betMinus").onclick = ()=>{ betInput.value=String((Number(betInput.value)||1)-10); clampBet(); };
  document.getElementById("betPlus").onclick = ()=>{ betInput.value=String((Number(betInput.value)||1)+10); clampBet(); };
  document.querySelectorAll("[data-bet]").forEach(b=>{
    b.onclick = ()=>{ betInput.value = b.dataset.bet==="max" ? String(wallet.coins) : String(b.dataset.bet); clampBet(); };
  });

  document.getElementById("bonus").onclick = ()=>{ addCoins(1000); renderDice(); };

  document.getElementById("rollBtn").onclick = async () => {
    await unlockAudio();
    clampBet();
    if (diceState.rolling) return;
    if (diceState.bet > wallet.coins) return alert("Недостаточно монет");

    addCoins(-diceState.bet);
    diceState.rolling = true;
    diceState.lastMsg = "";

    const roll = randInt(1, diceState.sides);
    const win = diceState.mode==="below" ? (roll <= diceState.threshold) : (roll >= diceState.threshold);

    if (globalSound) SFX.roll();

    if (diceState.sides === 6) {
      const arena = document.getElementById("diceArena");
      const cube = document.getElementById("cube");
      arena.classList.add("throwing");
      setTimeout(() => {
        diceState.lastRoll = roll;
        cube.className = "cube show-" + roll;
      }, 900);

      setTimeout(() => {
        arena.classList.remove("throwing");
        finish();
      }, 1250);
    } else {
      const numEl = document.getElementById("stripNum");
      const gL = document.getElementById("gL");
      const gR = document.getElementById("gR");

      const start = performance.now();
      let lastSwap = 0;
      const spinTimer = setInterval(() => {
        const now = performance.now();
        if (now - start > 950) return;
        if (now - lastSwap > 55) {
          lastSwap = now;
          gL.textContent = String(randInt(1, diceState.sides)).padStart(2,"0");
          numEl.textContent = String(randInt(1, diceState.sides)).padStart(2,"0");
          gR.textContent = String(randInt(1, diceState.sides)).padStart(2,"0");
        }
      }, 30);

      setTimeout(() => {
        clearInterval(spinTimer);
        numEl.textContent = "00";
      }, 950);

      setTimeout(() => {
        diceState.lastRoll = roll;
        finish();
      }, 1250);
    }

    function finish() {
      const chance = diceChance(diceState.sides, diceState.mode, diceState.threshold);
      const mult = diceMultiplier(chance);
      const payout = Math.floor(diceState.bet * mult);

      if (win) {
        addCoins(payout);
        if (globalSound) SFX.win();
        diceState.lastMsg = `✅ Выпало ${roll}. Выигрыш +${payout} 🪙 (x${mult.toFixed(2)})`;
      } else {
        if (globalSound) SFX.lose();
        diceState.lastMsg = `❌ Выпало ${roll}. Проигрыш -${diceState.bet} 🪙`;
      }

      diceState.rolling = false;
      renderTopBar();
      renderDice();
    }
  };
}

// ===============================
// MINES
// ===============================
let minesState = null;

function renderMines() {
  const size = 25; // 5x5

  function calcMultiplier(safeOpened, minesCount) {
    const m = minesCount;
    const a = 0.095 + m * 0.0075;
    const b = 0.018 + m * 0.0018;
    const mult = 1 + safeOpened * a + (safeOpened * safeOpened) * b * 0.06;
    return Math.max(1, mult);
  }
  function buildMines(minesCount) {
    const mines = new Set();
    while (mines.size < minesCount) mines.add(randInt(0, size - 1));
    return mines;
  }

  function setup() {
    const betDefault = Math.min(50, wallet.coins);

    screenEl.innerHTML = `
      <div class="card">
        <div class="row">
          <div>
            <div class="h1">Mines</div>
            <div class="muted">Открывай safe, избегай мин. Можно “Забрать” в любой момент.</div>
          </div>
          <div class="spacer"></div>
          <div class="badge">Баланс: <b>🪙 ${wallet.coins}</b></div>
        </div>

        <div style="margin-top:14px;">
          <div class="row" style="justify-content:space-between;">
            <div style="font-weight:900;">Ставка</div>
            <div class="badge"><b id="mBetShow">${betDefault}</b> 🪙</div>
          </div>
          <div class="row" style="margin-top:8px;">
            ${[10,50,100,250,500].map(v=>`<button class="chip" data-mbet="${v}">${v}</button>`).join("")}
            <button class="chip" data-mbet="max">MAX</button>
          </div>
          <div class="row" style="margin-top:10px;">
            <button class="btn ghost small" id="mMinus">-</button>
            <input id="mBet" class="input" type="number" min="1" step="1" value="${betDefault}">
            <button class="btn ghost small" id="mPlus">+</button>
          </div>
        </div>

        <div style="margin-top:14px;">
          <div class="row" style="justify-content:space-between;">
            <div style="font-weight:900;">Количество мин</div>
            <div class="badge"><b id="mCountShow">5</b></div>
          </div>
          <input id="mCount" class="range" type="range" min="1" max="24" value="5">
          <div class="muted">Больше мин → выше риск, но множитель растёт быстрее.</div>
        </div>

        <div class="row" style="margin-top:14px;">
          <button class="btn" id="mStart" style="flex:1">Start</button>
          <button class="btn ghost" id="mBonus">+1000 🪙</button>
        </div>
      </div>
    `;

    const bet = document.getElementById("mBet");
    const betShow = document.getElementById("mBetShow");
    const count = document.getElementById("mCount");
    const countShow = document.getElementById("mCountShow");

    function clampBet() {
      let v = Math.floor(Number(bet.value) || 0);
      if (v < 1) v = 1;
      if (v > wallet.coins) v = wallet.coins;
      bet.value = String(v);
      betShow.textContent = String(v);
    }
    function clampCount() {
      const v = Math.floor(Number(count.value) || 1);
      countShow.textContent = String(v);
    }
    clampBet(); clampCount();

    document.querySelectorAll("[data-mbet]").forEach(b=>{
      b.onclick = () => {
        playClick();
        bet.value = b.dataset.mbet==="max" ? String(wallet.coins) : String(b.dataset.mbet);
        clampBet();
      };
    });
    document.getElementById("mMinus").onclick = ()=>{ bet.value=String((Number(bet.value)||1)-10); clampBet(); };
    document.getElementById("mPlus").onclick = ()=>{ bet.value=String((Number(bet.value)||1)+10); clampBet(); };
    bet.oninput = clampBet;
    count.oninput = ()=>{ playClick(); clampCount(); };

    document.getElementById("mBonus").onclick = ()=>{ addCoins(1000); renderMines(); };

    document.getElementById("mStart").onclick = async ()=> {
      await unlockAudio();
      clampBet(); clampCount();
      const betV = Math.floor(Number(bet.value)||0);
      const minesCount = Math.floor(Number(count.value)||0);

      if (betV <= 0) return alert("Ставка должна быть больше 0");
      if (betV > wallet.coins) return alert("Недостаточно монет");
      if (minesCount < 1 || minesCount > size - 1) return alert(`Мин должно быть от 1 до ${size-1}`);

      addCoins(-betV);

      minesState = {
        bet: betV,
        minesCount,
        mines: buildMines(minesCount),
        opened: new Set(),
        over: false,
        cashed: false,
        safeOpened: 0,
        multiplier: 1,
        msg: "",
        lastHitMine: null,
      };
      draw();
    };
  }

  function revealAll() {
    for (let i=0;i<size;i++) minesState.opened.add(i);
  }

  function cashOut() {
    if (!minesState || minesState.over || minesState.cashed) return;
    minesState.cashed = true;
    minesState.over = true;

    const payout = Math.floor(minesState.bet * minesState.multiplier);
    addCoins(payout);
    if (globalSound) SFX.win();

    minesState.msg = `✅ Забрал: +${payout} 🪙 (x${minesState.multiplier.toFixed(2)})`;
    revealAll();
    draw();
  }

  function onTile(i) {
    if (!minesState || minesState.over) return;
    if (minesState.opened.has(i)) return;

    minesState.opened.add(i);
    const isMine = minesState.mines.has(i);

    if (isMine) {
      minesState.over = true;
      minesState.lastHitMine = i;
      minesState.msg = `💥 Мина! Ставка ${minesState.bet} 🪙 сгорела`;
      if (globalSound) SFX.mineBoom();
      revealAll();
      draw();
      return;
    }

    if (globalSound) SFX.click();

    minesState.safeOpened += 1;
    minesState.multiplier = calcMultiplier(minesState.safeOpened, minesState.minesCount);

    const maxSafe = size - minesState.minesCount;
    if (minesState.safeOpened >= maxSafe) {
      minesState.msg = "🏁 Открыл все safe! Авто-забор.";
      cashOut();
      return;
    }
    draw();
  }

  function draw() {
    if (!minesState) return setup();

    const maxSafe = size - minesState.minesCount;
    const ladder = [];
    for (let step=1; step<=maxSafe; step++) {
      const x = calcMultiplier(step, minesState.minesCount);
      const cls =
        step === minesState.safeOpened ? "step active" :
        step < minesState.safeOpened ? "step done" : "step";
      ladder.push(`
        <div class="${cls}">
          <div>${step}</div>
          <div class="x">x${x.toFixed(2)}</div>
        </div>
      `);
    }

    const potential = Math.floor(minesState.bet * minesState.multiplier);

    const cells = [];
    for (let i=0;i<size;i++) {
      const opened = minesState.opened.has(i);
      const isMine = minesState.mines.has(i);

      let label = "";
      let cls = "tile";
      if (opened) cls += " open";
      if (opened && isMine) cls += " mine";
      if (opened && !isMine) cls += " safe";
      if (minesState.lastHitMine === i) cls += " boom";
      if (opened) label = isMine ? "💣" : "✅";

      cells.push(`
        <button class="${cls}" data-i="${i}" ${minesState.over ? "disabled" : ""}>
          <div class="tileInner">${label}</div>
        </button>
      `);
    }

    screenEl.innerHTML = `
      <div class="card">
        <div class="row">
          <div>
            <div class="h1">Mines</div>
            <div class="muted">Safe: <b>${minesState.safeOpened}</b> · Мин: <b>${minesState.minesCount}</b> · Ставка: <b>${minesState.bet} 🪙</b></div>
          </div>
          <div class="spacer"></div>
          <div class="badge">Сейчас: <b>x${minesState.multiplier.toFixed(2)}</b></div>
        </div>

        <div class="kpiGrid">
          <div class="kpi"><div class="t">Забрать сейчас</div><div class="v">${potential} 🪙</div></div>
          <div class="kpi"><div class="t">Осталось safe</div><div class="v">${maxSafe - minesState.safeOpened}</div></div>
          <div class="kpi"><div class="t">Статус</div><div class="v">${minesState.over ? "Раунд завершён" : "Идёт игра"}</div></div>
        </div>

        <div class="msgLine"><b>${minesState.msg || ""}</b></div>

        <div class="minesGrid">${cells.join("")}</div>

        <div class="row" style="margin-top:12px;">
          <button class="btn" id="mCash" style="flex:1" ${minesState.over ? "disabled" : ""}>Забрать</button>
          <button class="btn ghost" id="mNew">Новый раунд</button>
        </div>

        <div class="ladder" id="ladder">${ladder.join("")}</div>
      </div>
    `;

    document.getElementById("mCash").onclick = () => cashOut();
    document.getElementById("mNew").onclick = () => { minesState = null; draw(); };

    document.querySelectorAll(".tile").forEach(b=>{
      b.onclick = () => onTile(Number(b.dataset.i));
    });

    // автоскролл ladder к активному шагу
    const ladderEl = document.getElementById("ladder");
    const active = ladderEl.querySelector(".step.active");
    if (active) {
      const left = active.offsetLeft - ladderEl.clientWidth/2 + active.clientWidth/2;
      ladderEl.scrollLeft = Math.max(0, left);
    }
  }

  draw();
}

// старт по умолчанию
setScreen("coin");
