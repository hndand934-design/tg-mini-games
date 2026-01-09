// --- RNG (честный) ---
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function randInt(min, max) {
  return Math.floor(randFloat() * (max - min + 1)) + min;
}

// --- Telegram WebApp ---
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const screenEl = document.getElementById("screen");
const userEl = document.getElementById("user");
const user = tg?.initDataUnsafe?.user;

// ===============================
// Virtual Coins (local)
// ===============================
const WALLET_KEY = "mini_wallet_v2";
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
// SFX (без файлов) — WebAudio
// ===============================
let _ac = null;
function audioCtx() {
  if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
  return _ac;
}
function playClick() {
  try {
    const ac = audioCtx();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(600, ac.currentTime);
    g.gain.setValueAtTime(0.07, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.05);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + 0.06);
  } catch {}
}
function playRoll() {
  // мягкий "шорох" броска
  try {
    const ac = audioCtx();
    const o = ac.createOscillator();
    const g = ac.createGain();
    const f = ac.createBiquadFilter();
    o.type = "triangle";
    o.frequency.setValueAtTime(220, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(90, ac.currentTime + 0.6);
    f.type = "lowpass";
    f.frequency.setValueAtTime(900, ac.currentTime);
    f.frequency.exponentialRampToValueAtTime(240, ac.currentTime + 0.6);
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.09, ac.currentTime + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0008, ac.currentTime + 0.7);
    o.connect(f).connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + 0.72);
  } catch {}
}
function playWin() {
  try {
    const ac = audioCtx();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(440, ac.currentTime);
    o.frequency.setValueAtTime(660, ac.currentTime + 0.08);
    o.frequency.setValueAtTime(880, ac.currentTime + 0.16);
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, ac.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.28);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + 0.3);
  } catch {}
}
function playLose() {
  try {
    const ac = audioCtx();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(220, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(120, ac.currentTime + 0.25);
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.10, ac.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.28);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + 0.3);
  } catch {}
}
function playMine() {
  // "удар + хлопок"
  try {
    const ac = audioCtx();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(90, ac.currentTime);
    o.frequency.setValueAtTime(60, ac.currentTime + 0.08);
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.16, ac.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + 0.20);
  } catch {}
}

// ===============================
// Навигация
// ===============================
function setScreen(name) {
  const screens = {
    menu: renderMenu,
    coin: renderCoin,
    dice: renderDice,
    mines: renderMines,
    bj: renderBJ,
    crash: renderCrash,
  };
  (screens[name] || renderMenu)();
}
document.querySelectorAll(".nav button").forEach((btn) => {
  btn.addEventListener("click", () => {
    playClick();
    setScreen(btn.dataset.screen);
  });
});

// ===============================
// Global UI styles for new modes
// ===============================
if (!document.getElementById("mini-pro-style")) {
  const st = document.createElement("style");
  st.id = "mini-pro-style";
  st.textContent = `
    .badge2{padding:8px 10px;border-radius:999px;background:rgba(255,255,255,.06);
      border:1px solid rgba(255,255,255,.10);font-weight:800;font-size:12px;}
    .chip{padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.06);color:#e8eefc;cursor:pointer;font-weight:800;font-size:12px;}
    .chip.active{outline:2px solid rgba(76,133,255,.85);}
    .ghost{background:rgba(255,255,255,.06)!important;}
    .input{width:100%;padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,.10);
      background:rgba(255,255,255,.06);color:#e8eefc;outline:none;}
    .range{width:100%;margin-top:8px;accent-color:#4c7dff;}
    .kpiGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px;}
    .kpi{padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.10);}
    .kpi .t{opacity:.75;font-size:11px;}
    .kpi .v{font-size:16px;font-weight:900;margin-top:4px;}
    .bigNums{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;align-items:center;}
    .bigNum{padding:12px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.10);
      text-align:center;}
    .bigNum .n{font-size:44px;font-weight:950;letter-spacing:1px;}
    .bigNum .s{opacity:.75;font-size:12px;margin-top:2px;}
    .btnWide{width:100%;}
    .msgLine{min-height:20px;font-weight:900;margin-top:8px;}
  `;
  document.head.appendChild(st);
}

// ===============================
// MENU
// ===============================
function renderMenu() {
  screenEl.innerHTML = `
    <div class="card">
      <div style="font-weight:900; font-size:16px; margin-bottom:6px;">Выбери режим</div>
      <div class="row">
        <span class="badge">Coin Flip</span>
        <span class="badge">Dice</span>
        <span class="badge">Mines</span>
        <span class="badge">Black Jack</span>
        <span class="badge">Lucky Jet</span>
      </div>
      <div style="opacity:.82; margin-top:10px; font-size:13px;">
        Везде: виртуальные монеты 🪙, без вывода.
      </div>
    </div>
  `;
}

// ===============================
// COIN FLIP PRO (ставка + выбор + анимация)
// ===============================
if (!document.getElementById("coinflip-style")) {
  const st = document.createElement("style");
  st.id = "coinflip-style";
  st.textContent = `
    .coinWrap{display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:12px;}
    .coinStage{
      width:100%; height:140px; border-radius:18px;
      background: radial-gradient(120px 90px at 50% 20%, rgba(255,255,255,.08), rgba(255,255,255,.02));
      border:1px solid rgba(255,255,255,.08);
      position:relative; overflow:hidden;
      display:flex;align-items:center;justify-content:center;
    }
    .coinShadow{
      position:absolute; bottom:18px; left:50%;
      width:86px; height:16px; transform:translateX(-50%);
      background:rgba(0,0,0,.35); filter: blur(10px);
      border-radius:999px; opacity:.35;
      transition: transform .25s ease, opacity .25s ease;
    }
    .coin3d{
      width:96px;height:96px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.22), rgba(255,255,255,.06));
      border:1px solid rgba(255,255,255,.10);
      box-shadow: 0 10px 25px rgba(0,0,0,.35);
      font-size:44px;
      transform-style:preserve-3d;
      user-select:none;
      position:relative;
    }
    .coin3d.spin{ animation: coinspin 1.25s cubic-bezier(.2,.9,.2,1) both; }
    .coinShadow.spin{
      transform:translateX(-50%) scale(1.15);
      opacity:.55;
    }
    @keyframes coinspin{
      0%   { transform: translateY(10px) rotateY(0deg) rotateX(0deg) scale(1); }
      20%  { transform: translateY(-18px) rotateY(540deg) rotateX(120deg) scale(1.06); }
      55%  { transform: translateY(-26px) rotateY(1260deg) rotateX(240deg) scale(1.09); }
      85%  { transform: translateY(-10px) rotateY(1710deg) rotateX(330deg) scale(1.03); }
      100% { transform: translateY(10px) rotateY(1980deg) rotateX(360deg) scale(1); }
    }
    .seg{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;}
    .seg button{
      padding:10px 12px;border-radius:12px;
      background:rgba(255,255,255,.06);
      border:1px solid rgba(255,255,255,.10);
      color:#e8eefc;cursor:pointer;font-weight:900;
    }
    .seg button.active{outline:2px solid rgba(76,133,255,.85);}
    .small{opacity:.8;font-size:12px;line-height:1.25;}
  `;
  document.head.appendChild(st);
}

let coinState = {
  pick: "heads", // heads/tails
  bet: 50,
  spinning: false,
  last: null,
};

function renderCoin() {
  const picks = [
    { key: "heads", label: "🦅 Орёл" },
    { key: "tails", label: "🌙 Решка" },
  ];

  screenEl.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div>
          <div style="font-weight:950; font-size:16px;">Coin Flip</div>
          <div class="small">Выбери Орёл/Решка, поставь 🪙 и бросай. Выигрыш: x2.</div>
        </div>
        <div class="badge2">Баланс: 🪙 <b>${wallet.coins}</b></div>
      </div>

      <div class="coinWrap">
        <div class="coinStage">
          <div class="coinShadow" id="coinShadow"></div>
          <div class="coin3d" id="coin3d">${coinState.last ? (coinState.last === "heads" ? "🦅" : "🌙") : "🪙"}</div>
        </div>

        <div class="seg">
          ${picks
            .map(
              (p) =>
                `<button class="${coinState.pick === p.key ? "active" : ""}" data-pick="${p.key}">${p.label}</button>`
            )
            .join("")}
        </div>

        <div style="width:100%;margin-top:6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-weight:900;">Ставка</div>
            <div class="badge2"><b id="coinBetShow">${coinState.bet}</b> 🪙</div>
          </div>

          <div class="row" style="margin-top:8px; gap:8px; flex-wrap:wrap;">
            ${[10, 50, 100, 250, 500]
              .map((v) => `<button class="chip" data-cbet="${v}">${v}</button>`)
              .join("")}
            <button class="chip" data-cbet="max">MAX</button>
          </div>

          <div class="row" style="margin-top:10px; gap:8px;">
            <button class="btn btnSmall" id="cMinus">-</button>
            <input id="coinBet" type="number" min="1" step="1" value="${coinState.bet}" class="input" style="flex:1;">
            <button class="btn btnSmall" id="cPlus">+</button>
          </div>
        </div>

        <button class="btn btnWide" id="coinThrow" ${coinState.spinning ? "disabled" : ""}>
          Бросить
        </button>

        <div class="row" style="margin-top:8px; width:100%; gap:8px;">
          <button class="btn ghost" id="coinBonus" style="flex:1;">+1000 🪙</button>
          <div class="msgLine" id="coinMsg" style="flex:2;"></div>
        </div>
      </div>
    </div>
  `;

  const betInput = document.getElementById("coinBet");
  const betShow = document.getElementById("coinBetShow");
  const msg = document.getElementById("coinMsg");
  const coin = document.getElementById("coin3d");
  const shadow = document.getElementById("coinShadow");

  function clampBet() {
    let v = Math.floor(Number(betInput.value) || 0);
    if (v < 1) v = 1;
    if (v > wallet.coins) v = wallet.coins;
    betInput.value = String(v);
    betShow.textContent = String(v);
    coinState.bet = v;
  }
  clampBet();
  betInput.oninput = clampBet;

  document.getElementById("cMinus").onclick = () => {
    playClick();
    betInput.value = String((Number(betInput.value) || 1) - 10);
    clampBet();
  };
  document.getElementById("cPlus").onclick = () => {
    playClick();
    betInput.value = String((Number(betInput.value) || 1) + 10);
    clampBet();
  };

  document.querySelectorAll("[data-pick]").forEach((b) => {
    b.onclick = () => {
      playClick();
      coinState.pick = b.dataset.pick;
      renderCoin();
    };
  });

  document.querySelectorAll("[data-cbet]").forEach((b) => {
    b.onclick = () => {
      playClick();
      const v = b.dataset.cbet;
      betInput.value = v === "max" ? String(wallet.coins) : String(v);
      clampBet();
    };
  });

  document.getElementById("coinBonus").onclick = () => {
    playClick();
    addCoins(1000);
    renderCoin();
  };

  document.getElementById("coinThrow").onclick = () => {
    clampBet();
    if (coinState.spinning) return;
    if (coinState.bet <= 0) return alert("Ставка должна быть больше 0");
    if (coinState.bet > wallet.coins) return alert("Недостаточно монет");

    addCoins(-coinState.bet);
    coinState.spinning = true;
    msg.textContent = "";
    playRoll();

    coin.classList.remove("spin");
    shadow.classList.remove("spin");
    void coin.offsetWidth; // restart anim
    coin.classList.add("spin");
    shadow.classList.add("spin");

    // исход определяется честно ДО анимации
    const result = randFloat() < 0.5 ? "heads" : "tails";

    setTimeout(() => {
      coinState.last = result;
      const win = result === coinState.pick;
      if (win) {
        const payout = coinState.bet * 2;
        addCoins(payout);
        playWin();
        msg.textContent = `✅ Выпало ${result === "heads" ? "Орёл" : "Решка"} · +${payout} 🪙`;
      } else {
        playLose();
        msg.textContent = `❌ Выпало ${result === "heads" ? "Орёл" : "Решка"} · -${coinState.bet} 🪙`;
      }
      coin.textContent = result === "heads" ? "🦅" : "🌙";
    }, 950);

    setTimeout(() => {
      coinState.spinning = false;
      renderCoin();
    }, 1300);
  };
}

// ===============================
// DICE PRO — “как бросок” + звук + задержка фиксации
// ===============================
if (!document.getElementById("dice-pro-style")) {
  const st = document.createElement("style");
  st.id = "dice-pro-style";
  st.textContent = `
    .diceArena{
      width:100%;
      height:150px;
      border-radius:18px;
      background: radial-gradient(140px 90px at 50% 15%, rgba(255,255,255,.08), rgba(255,255,255,.02));
      border:1px solid rgba(255,255,255,.08);
      position:relative;
      overflow:hidden;
      margin-top:10px;
    }
    .diceShadow{
      position:absolute;
      width:70px;height:18px;border-radius:999px;
      background:rgba(0,0,0,.45);
      filter: blur(12px);
      opacity:.22;
      left:50%; top:110px;
      transform: translateX(-50%);
      transition: opacity .2s ease, transform .2s ease;
    }
    .diceThrow{
      position:absolute;
      left:50%; top:62px;
      transform: translate(-50%, -50%);
      width:64px;height:64px;
      perspective: 600px;
    }
    /* 3D куб только для D6 */
    .cube{
      width:64px;height:64px; position:relative;
      transform-style:preserve-3d;
      transform: rotateX(-25deg) rotateY(35deg);
      transition: transform .35s cubic-bezier(.2,.9,.2,1);
    }
    .cubeFace{
      position:absolute; width:64px;height:64px;
      border-radius:14px;
      background: linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.06));
      border:1px solid rgba(255,255,255,.18);
      box-shadow: 0 8px 18px rgba(0,0,0,.25);
      display:flex; align-items:center; justify-content:center;
      color:#fff;
      font-size:18px;
      font-weight:900;
      backface-visibility:hidden;
    }
    .pipGrid{
      width:44px;height:44px; display:grid;
      grid-template-columns:repeat(3,1fr);
      grid-template-rows:repeat(3,1fr);
      gap:6px;
    }
    .pip{width:8px;height:8px;border-radius:50%; background:rgba(255,255,255,.92); box-shadow:0 1px 2px rgba(0,0,0,.35);}
    .pip.off{opacity:0;}
    .f1{transform: translateZ(32px);}
    .f6{transform: rotateY(180deg) translateZ(32px);}
    .f2{transform: rotateY(90deg) translateZ(32px);}
    .f5{transform: rotateY(-90deg) translateZ(32px);}
    .f3{transform: rotateX(90deg) translateZ(32px);}
    .f4{transform: rotateX(-90deg) translateZ(32px);}

    /* ориентации под итог (чтобы нужная грань была впереди) */
    .show-1{transform: rotateX(0deg) rotateY(0deg);}
    .show-2{transform: rotateX(0deg) rotateY(-90deg);}
    .show-3{transform: rotateX(-90deg) rotateY(0deg);}
    .show-4{transform: rotateX(90deg) rotateY(0deg);}
    .show-5{transform: rotateX(0deg) rotateY(90deg);}
    .show-6{transform: rotateX(0deg) rotateY(180deg);}

    /* Реалистичный бросок: полёт + удары + повороты */
    .throwing .cube{
      animation: cubeThrow 1.25s cubic-bezier(.2,.9,.2,1) both;
    }
    .throwing .diceShadow{
      animation: shadowThrow 1.25s cubic-bezier(.2,.9,.2,1) both;
    }
    @keyframes shadowThrow{
      0%{ opacity:.20; transform:translateX(-50%) scale(.85); }
      25%{ opacity:.45; transform:translateX(-50%) scale(1.15); }
      55%{ opacity:.30; transform:translateX(-50%) scale(.95); }
      80%{ opacity:.40; transform:translateX(-50%) scale(1.05); }
      100%{ opacity:.22; transform:translateX(-50%) scale(.9); }
    }
    @keyframes cubeThrow{
      0%{ transform: translateY(20px) rotateX(0deg) rotateY(0deg) rotateZ(0deg); }
      15%{ transform: translateY(-35px) rotateX(220deg) rotateY(300deg) rotateZ(90deg); }
      35%{ transform: translateY(-18px) rotateX(520deg) rotateY(620deg) rotateZ(180deg); }
      60%{ transform: translateY(-28px) rotateX(860deg) rotateY(980deg) rotateZ(280deg); }
      78%{ transform: translateY(-6px)  rotateX(1100deg) rotateY(1320deg) rotateZ(330deg); }
      100%{ transform: translateY(20px) rotateX(1260deg) rotateY(1600deg) rotateZ(360deg); }
    }

    /* Рулетка чисел (для D20/D100) */
    .rollStrip{
      position:absolute;
      left:50%; top:62px;
      transform:translate(-50%,-50%);
      width:120px; height:76px;
      border-radius:16px;
      background: rgba(255,255,255,.04);
      border:1px solid rgba(255,255,255,.10);
      display:flex;align-items:center;justify-content:center;
      overflow:hidden;
    }
    .rollStrip .num{
      font-size:44px; font-weight:950; letter-spacing:1px;
      opacity:.95;
    }
    .rollStrip .ghostL, .rollStrip .ghostR{
      position:absolute;
      font-size:38px;
      opacity:.18;
      top:50%;
      transform:translateY(-50%);
      filter: blur(.2px);
    }
    .rollStrip .ghostL{left:16px;}
    .rollStrip .ghostR{right:16px;}

    .hintLine{opacity:.78;font-size:12px;margin-top:6px;}
  `;
  document.head.appendChild(st);
}

let diceState = {
  sides: 6,         // 6/20/100
  mode: "below",    // below/above
  threshold: 3,     // порог
  bet: 50,
  rolling: false,
  lastRoll: null,
  lastMsg: "",
};

function diceChance(sides, mode, threshold) {
  // threshold — включительно
  if (mode === "below") return Math.max(1 / sides, Math.min(1, threshold / sides));
  // above: выигрыш если >= threshold
  return Math.max(1 / sides, Math.min(1, (sides - threshold + 1) / sides));
}
function diceMultiplier(chance) {
  // небольшой “edge” (2%)
  const edge = 0.98;
  return Math.max(1.02, edge / chance);
}

function renderDice() {
  // clamp threshold for selected sides
  const s = diceState.sides;
  if (diceState.threshold < 1) diceState.threshold = 1;
  if (diceState.threshold > s) diceState.threshold = s;

  // clamp bet
  diceState.bet = Math.floor(Number(diceState.bet) || 1);
  if (diceState.bet < 1) diceState.bet = 1;
  if (diceState.bet > wallet.coins) diceState.bet = wallet.coins;

  const chance = diceChance(s, diceState.mode, diceState.threshold);
  const mult = diceMultiplier(chance);
  const payout = Math.floor(diceState.bet * mult);

  const winText =
    diceState.mode === "below"
      ? `Выигрыш, если выпало ≤ ${diceState.threshold}`
      : `Выигрыш, если выпало ≥ ${diceState.threshold}`;

  screenEl.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div>
          <div style="font-weight:950; font-size:16px;">Dice</div>
          <div class="hintLine">Ставка 🪙 + режим «Меньше/Больше». Результат показываем “по-взрослому”.</div>
        </div>
        <div class="badge2">Баланс: 🪙 <b>${wallet.coins}</b></div>
      </div>

      <div class="row" style="margin-top:10px; gap:8px; flex-wrap:wrap;">
        <button class="chip ${s === 6 ? "active" : ""}" data-sides="6">D6</button>
        <button class="chip ${s === 20 ? "active" : ""}" data-sides="20">D20</button>
        <button class="chip ${s === 100 ? "active" : ""}" data-sides="100">D100</button>

        <span style="flex:1;"></span>

        <button class="chip ${diceState.mode === "below" ? "active" : ""}" data-mode="below">Меньше</button>
        <button class="chip ${diceState.mode === "above" ? "active" : ""}" data-mode="above">Больше</button>
      </div>

      <div class="bigNums">
        <div class="bigNum">
          <div class="n">${String(diceState.threshold).padStart(2, "0")}</div>
          <div class="s">твоё число</div>
        </div>
        <div class="bigNum">
          <div class="n">${diceState.lastRoll == null ? "00" : String(diceState.lastRoll).padStart(2, "0")}</div>
          <div class="s">выпавшее</div>
        </div>
      </div>

      <div class="kpiGrid">
        <div class="kpi"><div class="t">Множитель</div><div class="v">x${mult.toFixed(2)}</div></div>
        <div class="kpi"><div class="t">Возможный выигрыш</div><div class="v">+${payout} 🪙</div></div>
        <div class="kpi"><div class="t">Шанс выигрыша</div><div class="v">${(chance * 100).toFixed(1)}%</div></div>
      </div>

      <div style="margin-top:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-weight:900;">Порог: <b id="thLabel">${diceState.threshold}</b> из ${s}</div>
          <div class="badge2">Шанс: <b>${(chance * 100).toFixed(1)}%</b> · x<b>${mult.toFixed(2)}</b></div>
        </div>
        <input id="threshold" class="range" type="range" min="1" max="${s}" value="${diceState.threshold}">
        <div class="hintLine">${winText}</div>
      </div>

      <div class="diceArena" id="diceArena">
        <div class="diceShadow" id="diceShadow"></div>

        ${
          s === 6
            ? `
          <div class="diceThrow" id="diceThrow">
            <div class="cube ${diceState.lastRoll ? "show-" + diceState.lastRoll : ""}" id="cube">
              ${renderCubeFaceHTML(1)}
              ${renderCubeFaceHTML(2)}
              ${renderCubeFaceHTML(3)}
              ${renderCubeFaceHTML(4)}
              ${renderCubeFaceHTML(5)}
              ${renderCubeFaceHTML(6)}
            </div>
          </div>`
            : `
          <div class="rollStrip" id="rollStrip">
            <div class="ghostL" id="ghostL">17</div>
            <div class="num" id="stripNum">00</div>
            <div class="ghostR" id="ghostR">13</div>
          </div>`
        }
      </div>

      <div style="margin-top:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-weight:900;">Ставка</div>
          <div class="badge2"><b id="betShow">${diceState.bet}</b> 🪙</div>
        </div>

        <div class="row" style="margin-top:8px; gap:8px; flex-wrap:wrap;">
          ${[10, 50, 100, 250, 500].map((v) => `<button class="chip" data-bet="${v}">${v}</button>`).join("")}
          <button class="chip" data-bet="max">MAX</button>
        </div>

        <div class="row" style="margin-top:10px; gap:8px;">
          <button class="btn btnSmall" id="betMinus">-</button>
          <input id="bet" type="number" min="1" step="1" value="${diceState.bet}" class="input" style="flex:1;">
          <button class="btn btnSmall" id="betPlus">+</button>
        </div>
      </div>

      <div class="row" style="margin-top:12px; gap:10px;">
        <button class="btn btnWide" id="rollBtn" ${diceState.rolling ? "disabled" : ""}>
          Бросить ${diceState.rolling ? "..." : ""}
        </button>
        <button class="btn ghost" id="bonus">+1000 🪙</button>
      </div>

      <div class="msgLine" id="diceMsg">${diceState.lastMsg || ""}</div>
    </div>
  `;

  // handlers
  document.querySelectorAll("[data-sides]").forEach((b) => {
    b.onclick = () => {
      playClick();
      diceState.sides = Number(b.dataset.sides);
      // разумные дефолты
      if (diceState.sides === 6) diceState.threshold = 3;
      if (diceState.sides === 20) diceState.threshold = 10;
      if (diceState.sides === 100) diceState.threshold = 50;
      diceState.lastRoll = null;
      diceState.lastMsg = "";
      renderDice();
    };
  });
  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.onclick = () => {
      playClick();
      diceState.mode = b.dataset.mode;
      diceState.lastMsg = "";
      renderDice();
    };
  });

  const threshold = document.getElementById("threshold");
  threshold.oninput = () => {
    diceState.threshold = Number(threshold.value);
    document.getElementById("thLabel").textContent = String(diceState.threshold);
    diceState.lastMsg = "";
    // перерисуем без “прыжка” — только верх
    renderDice();
  };

  const betInput = document.getElementById("bet");
  const betShow = document.getElementById("betShow");

  function clampBet() {
    let v = Math.floor(Number(betInput.value) || 0);
    if (v < 1) v = 1;
    if (v > wallet.coins) v = wallet.coins;
    betInput.value = String(v);
    betShow.textContent = String(v);
    diceState.bet = v;
  }
  clampBet();
  betInput.oninput = clampBet;

  document.getElementById("betMinus").onclick = () => {
    playClick();
    betInput.value = String((Number(betInput.value) || 1) - 10);
    clampBet();
  };
  document.getElementById("betPlus").onclick = () => {
    playClick();
    betInput.value = String((Number(betInput.value) || 1) + 10);
    clampBet();
  };
  document.querySelectorAll("[data-bet]").forEach((b) => {
    b.onclick = () => {
      playClick();
      const v = b.dataset.bet;
      betInput.value = v === "max" ? String(wallet.coins) : String(v);
      clampBet();
    };
  });

  document.getElementById("bonus").onclick = () => {
    playClick();
    addCoins(1000);
    renderDice();
  };

  document.getElementById("rollBtn").onclick = async () => {
    // нужно для мобилок: разблок аудио
    try { await audioCtx().resume(); } catch {}

    clampBet();
    if (diceState.rolling) return;
    if (diceState.bet <= 0) return alert("Ставка должна быть больше 0");
    if (diceState.bet > wallet.coins) return alert("Недостаточно монет");

    addCoins(-diceState.bet);
    diceState.rolling = true;
    diceState.lastMsg = "";
    renderTopBar();

    const s = diceState.sides;
    const threshold = diceState.threshold;

    // честный результат заранее (до анимации)
    const roll = randInt(1, s);
    const win =
      diceState.mode === "below" ? roll <= threshold : roll >= threshold;

    playRoll();

    // Анимация: D6 — куб, D20/D100 — рулетка
    if (s === 6) {
      const arena = document.getElementById("diceArena");
      const cube = document.getElementById("cube");

      arena.classList.add("throwing");

      // небольшая “тряска” итогов
      diceState.lastRoll = null;
      renderTopBar();

      // задержка, чтобы "поначалу не видно", потом фикс
      setTimeout(() => {
        diceState.lastRoll = roll;
        // ставим ориентацию
        cube.className = "cube show-" + roll;
      }, 900);

      // завершение
      setTimeout(() => {
        arena.classList.remove("throwing");
        finishDice(win, roll);
      }, 1250);
    } else {
      const numEl = document.getElementById("stripNum");
      const gL = document.getElementById("ghostL");
      const gR = document.getElementById("ghostR");

      // быстро “крутит” цифры
      const start = performance.now();
      let lastSwap = 0;

      const spinTimer = setInterval(() => {
        const now = performance.now();
        if (now - start > 950) return;
        if (now - lastSwap > 55) {
          lastSwap = now;
          const a = randInt(1, s);
          const b = randInt(1, s);
          const c = randInt(1, s);
          gL.textContent = String(a).padStart(2, "0");
          numEl.textContent = String(b).padStart(2, "0");
          gR.textContent = String(c).padStart(2, "0");
        }
      }, 30);

      setTimeout(() => {
        clearInterval(spinTimer);
        // задержка перед фиксацией (чтобы было “ожидание”)
        gL.textContent = String(randInt(1, s)).padStart(2, "0");
        gR.textContent = String(randInt(1, s)).padStart(2, "0");
        numEl.textContent = "00";
      }, 950);

      setTimeout(() => {
        diceState.lastRoll = roll;
        renderDice(); // перерисуем верхние числа красиво
        finishDice(win, roll);
      }, 1250);
    }
  };

  function finishDice(win, roll) {
    const chance = diceChance(diceState.sides, diceState.mode, diceState.threshold);
    const mult = diceMultiplier(chance);
    const payout = Math.floor(diceState.bet * mult);

    if (win) {
      addCoins(payout);
      playWin();
      diceState.lastMsg = `✅ Выпало ${roll}. Выигрыш +${payout} 🪙 (x${mult.toFixed(2)})`;
    } else {
      playLose();
      diceState.lastMsg = `❌ Выпало ${roll}. Проигрыш -${diceState.bet} 🪙`;
    }

    diceState.rolling = false;
    renderTopBar();
    renderDice();
  }
}

// кубик D6: точки
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

// ===============================
// MINES PRO — 3D + звук + ladder
// ===============================
let minesState = null;

if (!document.getElementById("mines-3d-style")) {
  const st = document.createElement("style");
  st.id = "mines-3d-style";
  st.textContent = `
    .minesGrid{
      display:grid;
      grid-template-columns:repeat(5,1fr);
      gap:10px;
      margin-top:12px;
    }
    .tile{
      height:56px;
      border-radius:16px;
      border:1px solid rgba(255,255,255,.10);
      background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03));
      box-shadow: 0 12px 22px rgba(0,0,0,.25);
      position:relative;
      overflow:hidden;
      cursor:pointer;
      transform-style:preserve-3d;
      transition: transform .12s ease, border-color .12s ease, background .12s ease;
    }
    .tile:active{transform: translateY(1px) scale(.985);}
    .tile:disabled{opacity:.9;cursor:not-allowed;}
    .tile::before{
      content:"";
      position:absolute; inset:0;
      background: radial-gradient(80px 60px at 30% 20%, rgba(255,255,255,.10), rgba(255,255,255,0));
      opacity:.9;
      pointer-events:none;
    }
    .tileInner{
      position:absolute; inset:0;
      display:flex;align-items:center;justify-content:center;
      font-weight:950;
      font-size:18px;
      transform: translateZ(2px);
    }
    .tile.open{
      animation: tileFlip .22s ease-out both;
    }
    @keyframes tileFlip{
      from{transform: rotateX(18deg) scale(.94);}
      to{transform: rotateX(0deg) scale(1);}
    }
    .tile.safe{
      background: linear-gradient(180deg, rgba(42,102,255,.20), rgba(42,102,255,.08));
      border-color: rgba(42,102,255,.38);
      box-shadow: 0 12px 22px rgba(0,0,0,.25), 0 0 0 1px rgba(42,102,255,.12) inset;
    }
    .tile.mine{
      background: linear-gradient(180deg, rgba(255,80,80,.22), rgba(255,80,80,.08));
      border-color: rgba(255,80,80,.38);
      box-shadow: 0 12px 22px rgba(0,0,0,.25), 0 0 0 1px rgba(255,80,80,.12) inset;
    }
    .tile.boom{animation: boom .25s ease-out;}
    @keyframes boom{0%{transform:scale(1);}50%{transform:scale(1.05);}100%{transform:scale(1);} }

    .ladder{
      margin-top:12px;
      padding:10px;
      border-radius:16px;
      background: rgba(255,255,255,.03);
      border:1px solid rgba(255,255,255,.08);
      overflow:auto;
      white-space:nowrap;
    }
    .step{
      display:inline-flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      width:58px;
      height:46px;
      border-radius:12px;
      border:1px solid rgba(255,255,255,.10);
      background: rgba(255,255,255,.05);
      margin-right:8px;
      font-weight:900;
      font-size:12px;
    }
    .step .x{font-size:11px;opacity:.8;font-weight:800;margin-top:2px;}
    .step.active{
      outline:2px solid rgba(76,133,255,.85);
      background: rgba(76,133,255,.14);
      border-color: rgba(76,133,255,.30);
    }
    .step.done{
      background: rgba(42,102,255,.10);
      border-color: rgba(42,102,255,.26);
    }
  `;
  document.head.appendChild(st);
}

function renderMines() {
  const size = 25; // 5x5

  function calcMultiplier(safeOpened, minesCount) {
    // тот же принцип, но чуть более “казиношный” рост
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

  function minesSetup() {
    const presets = [10, 50, 100, 250, 500];
    const betDefault = Math.min(50, wallet.coins);

    screenEl.innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <div style="font-weight:950; font-size:16px;">Mines</div>
            <div class="hintLine">Ставка 🪙, мин больше — множитель быстрее. Можно “Забрать”.</div>
          </div>
          <div class="badge2">Баланс: 🪙 <b>${wallet.coins}</b></div>
        </div>

        <div style="margin-top:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-weight:900;">Ставка</div>
            <div class="badge2"><b id="mBetShow">${betDefault}</b> 🪙</div>
          </div>
          <div class="row" style="margin-top:8px; gap:8px; flex-wrap:wrap;">
            ${presets.map(v => `<button class="chip" data-mbet="${v}">${v}</button>`).join("")}
            <button class="chip" data-mbet="max">MAX</button>
          </div>
          <div class="row" style="margin-top:10px; gap:8px;">
            <button class="btn btnSmall" id="mMinus">-</button>
            <input id="mBet" type="number" min="1" step="1" value="${betDefault}" class="input" style="flex:1;">
            <button class="btn btnSmall" id="mPlus">+</button>
          </div>
        </div>

        <div style="margin-top:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-weight:900;">Количество мин</div>
            <div class="badge2"><b id="mCountShow">5</b></div>
          </div>
          <input id="mCount" type="range" min="1" max="24" value="5" class="range">
          <div class="hintLine">Больше мин → выше риск, но множитель растёт быстрее.</div>
        </div>

        <div class="row" style="margin-top:14px; gap:10px;">
          <button class="btn btnWide" id="mStart">Start</button>
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
    clampBet();
    clampCount();

    document.querySelectorAll("[data-mbet]").forEach((b) => {
      b.onclick = () => {
        playClick();
        const v = b.dataset.mbet;
        bet.value = v === "max" ? String(wallet.coins) : String(v);
        clampBet();
      };
    });
    document.getElementById("mMinus").onclick = () => { playClick(); bet.value = String((Number(bet.value)||1)-10); clampBet(); };
    document.getElementById("mPlus").onclick = () => { playClick(); bet.value = String((Number(bet.value)||1)+10); clampBet(); };
    bet.oninput = clampBet;
    count.oninput = () => { playClick(); clampCount(); };

    document.getElementById("mBonus").onclick = () => { playClick(); addCoins(1000); renderMines(); };

    document.getElementById("mStart").onclick = async () => {
      try { await audioCtx().resume(); } catch {}
      clampBet();
      clampCount();

      const betV = Math.floor(Number(bet.value) || 0);
      const minesCount = Math.floor(Number(count.value) || 0);

      if (betV <= 0) return alert("Ставка должна быть больше 0");
      if (betV > wallet.coins) return alert("Недостаточно монет");
      if (minesCount < 1 || minesCount > size - 1) return alert(`Мин должно быть от 1 до ${size - 1}`);

      playClick();
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
      drawMines();
    };
  }

  function revealAll() {
    for (let i = 0; i < size; i++) minesState.opened.add(i);
  }

  function cashOut() {
    if (!minesState || minesState.over || minesState.cashed) return;
    minesState.cashed = true;
    minesState.over = true;

    const payout = Math.floor(minesState.bet * minesState.multiplier);
    addCoins(payout);
    playWin();

    minesState.msg = `✅ Забрал: +${payout} 🪙 (x${minesState.multiplier.toFixed(2)})`;
    revealAll();
    drawMines();
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
      playMine();
      revealAll();
      drawMines();
      return;
    }

    playClick();
    minesState.safeOpened += 1;
    minesState.multiplier = calcMultiplier(minesState.safeOpened, minesState.minesCount);

    const maxSafe = size - minesState.minesCount;
    if (minesState.safeOpened >= maxSafe) {
      minesState.msg = "🏁 Открыл все safe! Авто-забор.";
      cashOut();
      return;
    }

    drawMines();
  }

  function drawMines() {
    if (!minesState) return minesSetup();

    const maxSafe = size - minesState.minesCount;
    const ladder = [];
    for (let step = 1; step <= maxSafe; step++) {
      const x = calcMultiplier(step, minesState.minesCount);
      const cls =
        step === minesState.safeOpened
          ? "step active"
          : step < minesState.safeOpened
          ? "step done"
          : "step";
      ladder.push(`
        <div class="${cls}">
          <div>${step}</div>
          <div class="x">x${x.toFixed(2)}</div>
        </div>
      `);
    }

    const potential = Math.floor(minesState.bet * minesState.multiplier);

    const cells = [];
    for (let i = 0; i < size; i++) {
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
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <div style="font-weight:950; font-size:16px;">Mines</div>
            <div class="hintLine">
              Safe: <b>${minesState.safeOpened}</b> · Мин: <b>${minesState.minesCount}</b> · Ставка: <b>${minesState.bet} 🪙</b>
            </div>
          </div>
          <div class="badge2">Сейчас: <b>x${minesState.multiplier.toFixed(2)}</b></div>
        </div>

        <div class="kpiGrid">
          <div class="kpi"><div class="t">Забрать сейчас</div><div class="v">${potential} 🪙</div></div>
          <div class="kpi"><div class="t">Осталось safe</div><div class="v">${maxSafe - minesState.safeOpened}</div></div>
          <div class="kpi"><div class="t">Статус</div><div class="v">${minesState.over ? "Раунд завершён" : "Идёт игра"}</div></div>
        </div>

        <div class="msgLine"><b>${minesState.msg || ""}</b></div>

        <div class="minesGrid">${cells.join("")}</div>

        <div class="row" style="margin-top:12px; gap:10px;">
          <button class="btn btnWide" id="mCash" ${minesState.over ? "disabled" : ""}>Забрать</button>
          <button class="btn ghost" id="mNew">Новый раунд</button>
        </div>

        <div class="ladder" id="ladder">${ladder.join("")}</div>
      </div>
    `;

    document.getElementById("mCash").onclick = () => { playClick(); cashOut(); };
    document.getElementById("mNew").onclick = () => {
      playClick();
      minesState = null;
      drawMines();
    };

    document.querySelectorAll(".tile").forEach((b) => {
      b.onclick = () => onTile(Number(b.dataset.i));
    });

    // автоскролл ladder к текущему шагу
    const ladderEl = document.getElementById("ladder");
    const active = ladderEl.querySelector(".step.active");
    if (active) {
      const left = active.offsetLeft - ladderEl.clientWidth / 2 + active.clientWidth / 2;
      ladderEl.scrollLeft = Math.max(0, left);
    }
  }

  drawMines();
}

// ===============================
// Black Jack (как было)
// ===============================
function makeDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const ranks = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  const deck = [];
  for (const s of suits) for (const r of ranks) deck.push({ r, s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
function handValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    if (c.r === "A") { aces++; total += 11; }
    else if (["K","Q","J"].includes(c.r)) total += 10;
    else total += Number(c.r);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}
function renderCards(cards) {
  return cards.map(c => `${c.r}${c.s}`).join(" ");
}
let bj = null;
function renderBJ() {
  function newBJ() {
    const deck = makeDeck();
    bj = { deck, player: [deck.pop(), deck.pop()], dealer: [deck.pop(), deck.pop()], over: false, msg: "" };
    draw();
  }
  function draw() {
    const pVal = handValue(bj.player);
    const dVal = handValue(bj.dealer);
    let dealerShown = bj.over ? renderCards(bj.dealer) : `${bj.dealer[0].r}${bj.dealer[0].s} ??`;
    let dealerText = bj.over ? `(${dVal})` : "";

    screenEl.innerHTML = `
      <div class="card">
        <div style="font-weight:950; font-size:16px;">Black Jack</div>
        <div style="margin-top:10px;">
          <div style="opacity:.8">Дилер ${dealerText}</div>
          <div style="font-size:22px; margin:6px 0;">${dealerShown}</div>
          <hr style="border:0;border-top:1px solid rgba(255,255,255,.08); margin:10px 0;">
          <div style="opacity:.8">Ты (${pVal})</div>
          <div style="font-size:22px; margin:6px 0;">${renderCards(bj.player)}</div>
          <div style="margin-top:10px; min-height:20px;"><b>${bj.msg || ""}</b></div>
        </div>
        <div class="row" style="margin-top:12px;">
          <button class="btn" id="hit" ${bj.over ? "disabled" : ""}>Hit</button>
          <button class="btn" id="stand" ${bj.over ? "disabled" : ""}>Stand</button>
          <button class="btn ghost" id="newbj">Новая</button>
        </div>
      </div>
    `;

    document.getElementById("newbj").onclick = () => { playClick(); newBJ(); };
    document.getElementById("hit").onclick = () => {
      playClick();
      bj.player.push(bj.deck.pop());
      if (handValue(bj.player) > 21) { bj.over = true; bj.msg = "Перебор. Ты проиграл."; }
      draw();
    };
    document.getElementById("stand").onclick = () => {
      playClick();
      while (handValue(bj.dealer) < 17) bj.dealer.push(bj.deck.pop());
      bj.over = true;
      const pv = handValue(bj.player);
      const dv = handValue(bj.dealer);
      if (dv > 21 || pv > dv) bj.msg = "Ты выиграл!";
      else if (pv === dv) bj.msg = "Ничья.";
      else bj.msg = "Ты проиграл.";
      draw();
    };
  }
  newBJ();
}

// ===============================
// Lucky Jet demo (как было)
// ===============================
let crash = null;
function renderCrash() {
  function newCrash() {
    const crashPoint = Math.max(1.05, 1 / (1 - randFloat()));
    crash = { t: 0, mult: 1.0, crashPoint, running: false, cashed: false, msg: "" };
    draw();
  }
  let timer = null;

  function start() {
    if (crash.running) return;
    playRoll();
    crash.running = true;
    crash.cashed = false;
    crash.msg = "";
    const startTime = performance.now();

    timer = setInterval(() => {
      const dt = (performance.now() - startTime) / 1000;
      crash.t = dt;
      crash.mult = 1 + dt * 0.8 + dt * dt * 0.12;
      if (crash.mult >= crash.crashPoint) {
        crash.running = false;
        crash.msg = crash.cashed ? crash.msg : "💥 Краш! Не успел.";
        clearInterval(timer);
        playLose();
      }
      draw();
    }, 50);
  }

  function cashOut() {
    if (!crash.running || crash.cashed) return;
    crash.cashed = true;
    crash.running = false;
    crash.msg = `✅ Успел на ${crash.mult.toFixed(2)}x`;
    clearInterval(timer);
    playWin();
    draw();
  }

  function draw() {
    screenEl.innerHTML = `
      <div class="card">
        <div style="font-weight:950; font-size:16px;">Lucky Jet (demo)</div>
        <div style="opacity:.8; font-size:13px; margin-top:6px;">Нажми “Забрать” до краша. Виртуально.</div>
        <div style="font-size:44px; margin:14px 0; font-weight:950;">
          ${crash.mult.toFixed(2)}x
        </div>
        <div style="min-height:22px;"><b>${crash.msg || ""}</b></div>
        <div class="row" style="margin-top:12px;">
          <button class="btn" id="start" ${crash.running ? "disabled" : ""}>Старт</button>
          <button class="btn" id="cash" ${(!crash.running || crash.cashed) ? "disabled" : ""}>Забрать</button>
          <button class="btn ghost" id="newc">Новая</button>
        </div>
      </div>
    `;
    document.getElementById("start").onclick = () => { playClick(); start(); };
    document.getElementById("cash").onclick = () => { playClick(); cashOut(); };
    document.getElementById("newc").onclick = () => { playClick(); newCrash(); };
  }
  newCrash();
}

setScreen("menu");



