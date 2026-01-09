// --- RNG (честный) ---
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function randInt(min, max) {
  return Math.floor(randFloat() * (max - min + 1)) + min;
}

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const screenEl = document.getElementById("screen");
const userEl = document.getElementById("user");
const user = tg?.initDataUnsafe?.user;

// --- Virtual Coins (local) ---
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

// --- Навигация ---
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
  btn.addEventListener("click", () => setScreen(btn.dataset.screen));
});

// --- ЭКРАНЫ ---
function renderMenu() {
  screenEl.innerHTML = `
    <div class="card">
      <div style="font-weight:800; font-size:16px; margin-bottom:6px;">Выбери режим</div>
      <div class="row">
        <span class="badge">Coin Flip</span>
        <span class="badge">Dice</span>
        <span class="badge">Mines</span>
        <span class="badge">Black Jack</span>
        <span class="badge">Lucky Jet</span>
      </div>
      <div style="opacity:.82; margin-top:10px; font-size:13px;">
        В Mines: виртуальные монеты 🪙, ставка, множитель и “Забрать”.
      </div>
    </div>
  `;
}

/* =========================
   COIN FLIP (анимация + ставка)
   ========================= */

// --- CoinFlip styles (one-time) ---
if (!document.getElementById("coinflip-style")) {
  const st = document.createElement("style");
  st.id = "coinflip-style";
  st.textContent = `
    .coinWrap{display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:12px;}
    .coin3d{
      width:96px;height:96px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.22), rgba(255,255,255,.06));
      border:1px solid rgba(255,255,255,.10);
      box-shadow: 0 10px 25px rgba(0,0,0,.35);
      font-size:44px;
      transform-style:preserve-3d;
      user-select:none;
    }
    .coin3d.spin{ animation: coinspin 1.1s ease-in-out both; }
    @keyframes coinspin{
      0%   { transform: rotateY(0deg)   rotateX(0deg)   scale(1);   filter: blur(0px); }
      20%  { transform: rotateY(360deg) rotateX(90deg)  scale(1.05);filter: blur(.2px);}
      50%  { transform: rotateY(900deg) rotateX(180deg) scale(1.08);filter: blur(.6px);}
      80%  { transform: rotateY(1440deg)rotateX(270deg) scale(1.03);filter: blur(.2px);}
      100% { transform: rotateY(1800deg)rotateX(360deg) scale(1);   filter: blur(0px); }
    }
    .seg{display:flex;gap:8px;flex-wrap:wrap;}
    .seg button{
      padding:10px 12px;border-radius:12px;
      background:rgba(255,255,255,.06);
      border:1px solid rgba(255,255,255,.10);
      color:#e8eefc;cursor:pointer;font-weight:800;
    }
    .seg button.active{outline:2px solid rgba(76,133,255,.85);}
    .small{opacity:.8;font-size:12px;line-height:1.25;}
    .msg{min-height:20px;font-weight:900;margin-top:6px;}
  `;
  document.head.appendChild(st);
}

let coinState = {
  pick: "heads", // heads / tails
  bet: 50,
  busy: false,
};

function renderCoin() {
  const presets = [10, 50, 100, 250, 500];

  screenEl.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div>
          <div style="font-weight:900; font-size:16px;">Coin Flip</div>
          <div class="small" style="margin-top:4px;">Выбери Орёл/Решка, поставь 🪙 и бросай. Выигрыш: <b>x2</b>.</div>
        </div>
        <div class="badge">Баланс: <b>🪙 ${wallet.coins}</b></div>
      </div>

      <div class="coinWrap">
        <div id="coin3d" class="coin3d">🪙</div>

        <div class="seg">
          <button id="pickHeads" class="${coinState.pick === "heads" ? "active" : ""}">🦅 Орёл</button>
          <button id="pickTails" class="${coinState.pick === "tails" ? "active" : ""}">🌙 Решка</button>
        </div>

        <div style="width:100%; margin-top:6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-weight:800;">Ставка</div>
            <div class="badge"><b id="betShow">${coinState.bet}</b> 🪙</div>
          </div>

          <div class="row" style="margin-top:8px; gap:8px; flex-wrap:wrap;">
            ${presets.map(v => `<button class="chip" data-bet="${v}">${v}</button>`).join("")}
            <button class="chip" data-bet="max">MAX</button>
          </div>

          <div class="row" style="margin-top:10px; gap:8px;">
            <button class="btn btnSmall" id="betMinus">-</button>
            <input id="bet" type="number" min="1" step="1" value="${coinState.bet}" class="input" style="flex:1;">
            <button class="btn btnSmall" id="betPlus">+</button>
          </div>
        </div>

        <button class="btn" id="flipBtn" style="width:100%; margin-top:6px;">Бросить</button>
        <div id="coinMsg" class="msg"></div>

        <button class="btn ghost" id="bonusCoins" style="width:100%;">+1000 🪙</button>
      </div>
    </div>
  `;

  const coinEl = document.getElementById("coin3d");
  const msgEl = document.getElementById("coinMsg");
  const betInput = document.getElementById("bet");
  const betShow = document.getElementById("betShow");

  // чтобы чипы/инпут работали (они есть в Mines-style, но на всякий случай)
  if (!document.getElementById("shared-input-style")) {
    const st = document.createElement("style");
    st.id = "shared-input-style";
    st.textContent = `
      .input{
        width:100%;
        padding:10px;
        border-radius:12px;
        border:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.06);
        color:#e8eefc;
        outline:none;
      }
      .chip{
        padding:8px 10px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.06);
        color:#e8eefc;
        cursor:pointer;
        font-weight:800;
        font-size:12px;
        transition: transform .08s ease, background .12s ease;
      }
      .chip:active{transform:scale(.98);}
      .btnSmall{padding:10px 12px; min-width:44px;}
      .ghost{background:rgba(255,255,255,.06)!important;}
    `;
    document.head.appendChild(st);
  }

  const clampBet = () => {
    let v = Math.floor(Number(betInput.value) || 0);
    if (v < 1) v = 1;
    if (v > wallet.coins) v = wallet.coins;
    betInput.value = String(v);
    betShow.textContent = String(v);
    coinState.bet = v;
  };
  clampBet();

  document.getElementById("pickHeads").onclick = () => {
    coinState.pick = "heads";
    renderCoin();
  };
  document.getElementById("pickTails").onclick = () => {
    coinState.pick = "tails";
    renderCoin();
  };

  document.querySelectorAll(".chip").forEach((b) => {
    b.onclick = () => {
      const val = b.dataset.bet;
      if (val === "max") betInput.value = String(wallet.coins);
      else betInput.value = String(val);
      clampBet();
    };
  });

  document.getElementById("betMinus").onclick = () => {
    betInput.value = String((Number(betInput.value) || 1) - 10);
    clampBet();
  };
  document.getElementById("betPlus").onclick = () => {
    betInput.value = String((Number(betInput.value) || 1) + 10);
    clampBet();
  };
  betInput.oninput = clampBet;

  document.getElementById("bonusCoins").onclick = () => addCoins(1000);

  document.getElementById("flipBtn").onclick = () => {
    if (coinState.busy) return;

    const bet = Math.floor(Number(betInput.value) || 0);
    if (bet <= 0) return alert("Ставка должна быть больше 0");
    if (bet > wallet.coins) return alert("Недостаточно монет");

    // списываем ставку
    addCoins(-bet);

    coinState.busy = true;
    msgEl.textContent = "";
    coinEl.textContent = "🪙";

    // перезапуск анимации
    coinEl.classList.remove("spin");
    void coinEl.offsetWidth;
    coinEl.classList.add("spin");

    // исход
    const result = randFloat() < 0.5 ? "heads" : "tails";

    setTimeout(() => {
      coinEl.classList.remove("spin");

      const win = result === coinState.pick;
      if (result === "heads") coinEl.textContent = "🦅";
      else coinEl.textContent = "🌙";

      if (win) {
        const payout = bet * 2;
        addCoins(payout);
        msgEl.textContent = `✅ Выигрыш +${payout} 🪙`;
      } else {
        msgEl.textContent = `❌ Проигрыш -${bet} 🪙`;
      }

      coinState.busy = false;
    }, 1100);
  };
}

// --- Dice FULL (реалистичный бросок + звук + отскоки + RU UI) ---
function renderDice() {
  // ---------- helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (n) => Math.floor(Number(n) || 0);

  // WebAudio: короткие “click/thud/win” без файлов
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  }
  function playClick(freq = 900, dur = 0.03, gain = 0.08) {
    try {
      ensureAudio();
      const t0 = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "square";
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0);
      o.stop(t0 + dur);
    } catch {}
  }
  function playThud(gain = 0.10) {
    // низкий “удар”
    try {
      ensureAudio();
      const t0 = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(140, t0);
      o.frequency.exponentialRampToValueAtTime(70, t0 + 0.08);
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0);
      o.stop(t0 + 0.1);
    } catch {}
  }
  function playWin() {
    // короткий “три-тон”
    playClick(880, 0.05, 0.08);
    setTimeout(() => playClick(1100, 0.06, 0.08), 70);
    setTimeout(() => playClick(1320, 0.08, 0.08), 140);
  }
  function playLose() {
    playClick(260, 0.10, 0.08);
  }

  // ---------- one-time styles ----------
  if (!document.getElementById("dice-full-style")) {
    const st = document.createElement("style");
    st.id = "dice-full-style";
    st.textContent = `
      .diceTop{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;}
      .diceTop .sub{opacity:.82;font-size:12px;line-height:1.25;margin-top:4px;}
      .badge2{padding:8px 10px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);}

      .segRow{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}
      .segBtn{
        padding:8px 10px;border-radius:999px;
        background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.10);
        color:#e8eefc;cursor:pointer;font-weight:900;font-size:12px;
      }
      .segBtn.active{outline:2px solid rgba(76,133,255,.85);}

      .diceLayout{display:grid;grid-template-columns: 1fr; gap:12px; margin-top:12px;}
      .panel{
        border-radius:18px;
        background: radial-gradient(circle at 30% 20%, rgba(255,255,255,.10), rgba(255,255,255,.03));
        border:1px solid rgba(255,255,255,.10);
        padding:14px;
      }

      /* Big numbers area (like your screenshot) */
      .bigNums{display:grid;grid-template-columns: 1fr 44px 1fr;gap:12px;align-items:center;}
      .bigCell{display:flex;flex-direction:column;gap:6px;align-items:center;justify-content:center;}
      .bigValue{font-size:46px;font-weight:1000;letter-spacing:1px;}
      .bigLabel{opacity:.75;font-size:12px;text-transform:uppercase;letter-spacing:.6px;}
      .midCube{
        width:44px;height:44px;border-radius:14px;
        display:flex;align-items:center;justify-content:center;
        background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.12);
        box-shadow:0 10px 25px rgba(0,0,0,.22);
      }
      .midCube::before{content:"⬛";opacity:.75;font-size:18px; transform: rotate(45deg);}

      .statRow{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;}
      .stat{
        flex:1; min-width:140px;
        padding:10px 12px;border-radius:14px;
        background:rgba(255,255,255,.05);
        border:1px solid rgba(255,255,255,.08);
      }
      .stat .k{opacity:.75;font-size:12px;}
      .stat .v{font-weight:1000;font-size:16px;margin-top:3px;}

      .range2{width:100%; margin-top:10px; accent-color:#4c7dff;}
      .small2{opacity:.82;font-size:12px;line-height:1.25;margin-top:6px;}

      .chip{padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.06);color:#e8eefc;cursor:pointer;font-weight:900;font-size:12px;}
      .chip:active{transform:scale(.98);}
      .input2{width:100%;padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.06);color:#e8eefc;outline:none;}
      .btnSmall{padding:10px 12px; min-width:44px;}
      .ghost{background:rgba(255,255,255,.06)!important;}

      /* ---------- REAL D6 THROW STAGE ---------- */
      .throwStage{
        width:100%;height:150px;border-radius:18px;position:relative; overflow:hidden;
        background: radial-gradient(circle at 30% 20%, rgba(255,255,255,.12), rgba(255,255,255,.03));
        border:1px solid rgba(255,255,255,.10);
      }
      .shadow{
        position:absolute;left:50%;top:76%;
        width:80px;height:24px;border-radius:999px;
        transform: translateX(-50%) scale(1);
        background: rgba(0,0,0,.35);
        filter: blur(12px);
        opacity:.35;
        will-change: transform, opacity;
      }
      .scene{
        position:absolute;inset:0;
        perspective: 1000px;
      }
      .wrap{
        position:absolute;
        left:50%; top:70%;
        transform: translate(-50%, -50%);
        transform-style: preserve-3d;
        will-change: transform;
      }
      .cube{
        width:86px;height:86px;position:relative;
        transform-style:preserve-3d;
        transform: rotateX(-18deg) rotateY(24deg);
        will-change: transform;
      }
      .face{
        position:absolute; inset:0;
        border-radius:18px;
        background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.22), rgba(255,255,255,.06));
        border:1px solid rgba(255,255,255,.14);
        box-shadow: 0 10px 24px rgba(0,0,0,.35);
        display:flex;align-items:center;justify-content:center;
        backface-visibility:hidden;
      }
      .pip{width:10px;height:10px;border-radius:50%;background: rgba(232,238,252,.95);box-shadow:0 1px 0 rgba(0,0,0,.25) inset;}
      .pips{display:grid;grid-template-columns:repeat(3, 16px);grid-template-rows:repeat(3, 16px);gap:8px;}
      .pips .empty{opacity:0;}

      .front  { transform: translateZ(43px); }
      .back   { transform: rotateY(180deg) translateZ(43px); }
      .right  { transform: rotateY(90deg)  translateZ(43px); }
      .left   { transform: rotateY(-90deg) translateZ(43px); }
      .top    { transform: rotateX(90deg)  translateZ(43px); }
      .bottom { transform: rotateX(-90deg) translateZ(43px); }

      @keyframes shadowFly {
        0%   { transform: translateX(-50%) scale(1); opacity:.35; }
        30%  { transform: translateX(-50%) scale(.72); opacity:.16; }
        60%  { transform: translateX(-50%) scale(.62); opacity:.12; }
        100% { transform: translateX(-50%) scale(1); opacity:.35; }
      }

      /* Wrap path with TWO bounces at landing */
      @keyframes wrapFlyBounce {
        0%   { transform: translate(-50%,-50%) translate3d(-40px, 0px, 0px) rotateZ(-18deg); }
        20%  { transform: translate(-50%,-50%) translate3d(-10px, -45px, 90px) rotateZ(-8deg); }
        45%  { transform: translate(-50%,-50%) translate3d(30px, -62px, 140px) rotateZ(14deg); }
        70%  { transform: translate(-50%,-50%) translate3d(20px, -18px, 60px) rotateZ(8deg); }
        82%  { transform: translate(-50%,-50%) translate3d(0px,  2px,  0px) rotateZ(0deg); }   /* first landing */
        90%  { transform: translate(-50%,-50%) translate3d(0px, -10px, 22px) rotateZ(0deg); }  /* bounce up */
        100% { transform: translate(-50%,-50%) translate3d(0px,  0px,  0px) rotateZ(0deg); }   /* settle */
      }

      /* ---------- D20/D100 ROLL (looks rich) ---------- */
      .rollBox{
        display:flex;align-items:center;justify-content:center;
        height:150px;border-radius:18px;
        background: radial-gradient(circle at 30% 20%, rgba(255,255,255,.12), rgba(255,255,255,.03));
        border:1px solid rgba(255,255,255,.10);
        overflow:hidden;
        position:relative;
      }
      .rollDigits{
        font-size:54px;font-weight:1100;letter-spacing:1px;
        display:flex;gap:12px;align-items:center;
      }
      .rollDigits .ghostNum{opacity:.18;}
      .rollAnim{
        position:absolute; inset:0;
        display:flex; align-items:center; justify-content:center;
        pointer-events:none;
        opacity:0;
      }
      .rollAnim.on{opacity:1;}
      .numWheel{
        width:240px;height:140px;
        border-radius:18px;
        background:rgba(255,255,255,.04);
        border:1px solid rgba(255,255,255,.08);
        display:flex;align-items:center;justify-content:center;
        box-shadow: 0 16px 35px rgba(0,0,0,.25);
        transform-style:preserve-3d;
      }
      .numWheel.on{
        animation: wheelSpin 1.2s cubic-bezier(.2,.9,.2,1) both;
      }
      @keyframes wheelSpin{
        0%{ transform: rotateX(0deg) rotateY(0deg) scale(1); filter: blur(0px); }
        25%{ transform: rotateX(120deg) rotateY(240deg) scale(1.05); filter: blur(.6px); }
        55%{ transform: rotateX(260deg) rotateY(520deg) scale(1.08); filter: blur(1.0px); }
        80%{ transform: rotateX(340deg) rotateY(680deg) scale(1.04); filter: blur(.4px); }
        100%{ transform: rotateX(360deg) rotateY(720deg) scale(1); filter: blur(0px); }
      }

      .msg2{min-height:22px;font-weight:1000;margin-top:10px;}
    `;
    document.head.appendChild(st);
  }

  // ---------- state ----------
  let sides = 6;          // 6/20/100
  let mode = "under";     // under/over
  let bet = 50;
  let target = 4;
  let rolling = false;

  const presets = [10, 50, 100, 250, 500];

  function defaultTarget(s) {
    if (s === 6) return 4;
    if (s === 20) return 10;
    return 50;
  }

  function winChance() {
    const t = clamp(fmt(target), 1, sides);
    const winCount = mode === "under" ? t : (sides - t + 1);
    return winCount / sides;
  }
  function payoutMult() {
    // house edge 5%
    const p = Math.max(0.0001, winChance());
    return Math.max(1.02, 0.95 / p);
  }

  // cube face mapping (same as before)
  function cubeRotFor(n) {
    switch (n) {
      case 1: return { x: 0, y: 0 };
      case 2: return { x: 0, y: -90 };
      case 3: return { x: -90, y: 0 };
      case 4: return { x: 90, y: 0 };
      case 5: return { x: 0, y: 90 };
      case 6: return { x: 0, y: 180 };
      default: return { x: 0, y: 0 };
    }
  }
  function faceHTML(cls, num) {
    const map = {
      1: [0,0,0, 0,1,0, 0,0,0],
      2: [1,0,0, 0,0,0, 0,0,1],
      3: [1,0,0, 0,1,0, 0,0,1],
      4: [1,0,1, 0,0,0, 1,0,1],
      5: [1,0,1, 0,1,0, 1,0,1],
      6: [1,0,1, 1,0,1, 1,0,1],
    };
    const grid = map[num] || map[1];
    const cells = grid.map(v => v ? `<span class="pip"></span>` : `<span class="pip empty"></span>`).join("");
    return `<div class="face ${cls}"><div class="pips">${cells}</div></div>`;
  }

  // ---------- render ----------
  function draw(last = null) {
    // clamp wallet/bet/target
    bet = clamp(fmt(bet), 1, wallet.coins || 1);
    target = clamp(fmt(target), 1, sides);

    const chance = winChance();
    const mult = payoutMult();
    const potential = Math.floor(bet * mult);

    const shownMy = target; // “твоё число”
    const shownRolled = last?.roll ?? 0;

    screenEl.innerHTML = `
      <div class="card">
        <div class="diceTop">
          <div>
            <div style="font-weight:1100;font-size:16px;">Dice</div>
            <div class="sub">Ставка 🪙 · режим <b>${mode === "under" ? "Меньше/Ниже" : "Больше/Выше"}</b> · красиво и “по-взрослому”.</div>
          </div>
          <div class="badge2">Баланс: <b>🪙 ${wallet.coins}</b></div>
        </div>

        <div class="panel" style="margin-top:12px;">
          <div class="segRow" style="margin-top:0;">
            <button class="segBtn ${sides===6?"active":""}" data-sides="6">D6</button>
            <button class="segBtn ${sides===20?"active":""}" data-sides="20">D20</button>
            <button class="segBtn ${sides===100?"active":""}" data-sides="100">D100</button>

            <span style="flex:1;"></span>

            <button class="segBtn ${mode==="under"?"active":""}" data-mode="under">Меньше</button>
            <button class="segBtn ${mode==="over"?"active":""}" data-mode="over">Больше</button>
          </div>

          <div class="bigNums" style="margin-top:12px;">
            <div class="bigCell">
              <div class="bigValue" id="myNum">${String(shownMy).padStart(2,"0")}</div>
              <div class="bigLabel">ТВОЁ ЧИСЛО</div>
            </div>

            <div class="midCube"></div>

            <div class="bigCell">
              <div class="bigValue" id="rolledNum">${String(shownRolled).padStart(2,"0")}</div>
              <div class="bigLabel">ВЫПАВШЕЕ</div>
            </div>
          </div>

          <div class="statRow">
            <div class="stat">
              <div class="k">Множитель</div>
              <div class="v">x${mult.toFixed(2)}</div>
            </div>
            <div class="stat">
              <div class="k">Возможный выигрыш</div>
              <div class="v">+${potential} 🪙</div>
            </div>
            <div class="stat">
              <div class="k">Шанс выигрыша</div>
              <div class="v">${(chance*100).toFixed(1)}%</div>
            </div>
          </div>

          <input class="range2" id="tRange" type="range" min="1" max="${sides}" value="${target}">
          <div class="small2">
            ${mode==="under"
              ? `Выигрыш если выпало <b>≤ ${target}</b> из ${sides}.`
              : `Выигрыш если выпало <b>≥ ${target}</b> из ${sides}.`
            }
          </div>

          <div style="margin-top:12px;">
            ${sides === 6 ? `
              <div class="throwStage">
                <div class="shadow" id="shadow"></div>
                <div class="scene">
                  <div class="wrap" id="wrap">
                    <div class="cube" id="cube">
                      ${faceHTML("front", 1)}
                      ${faceHTML("right", 2)}
                      ${faceHTML("back", 6)}
                      ${faceHTML("left", 5)}
                      ${faceHTML("top", 3)}
                      ${faceHTML("bottom", 4)}
                    </div>
                  </div>
                </div>
              </div>
            ` : `
              <div class="rollBox">
                <div class="rollDigits">
                  <span class="ghostNum">${String(randInt(1, sides)).padStart(2,"0")}</span>
                  <span id="finalBig">${String(shownRolled).padStart(2,"0")}</span>
                  <span class="ghostNum">${String(randInt(1, sides)).padStart(2,"0")}</span>
                </div>
                <div class="rollAnim" id="rollAnim">
                  <div class="numWheel" id="numWheel"></div>
                </div>
              </div>
            `}
          </div>
        </div>

        <div class="panel">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-weight:1100;">Ставка</div>
            <div class="badge2"><b id="betShow">${bet}</b> 🪙</div>
          </div>

          <div class="segRow" style="margin-top:10px;">
            ${presets.map(v => `<button class="chip" data-bet="${v}">${v}</button>`).join("")}
            <button class="chip" data-bet="max">MAX</button>
          </div>

          <div class="row" style="margin-top:10px; gap:8px;">
            <button class="btn btnSmall" id="betMinus">-</button>
            <input id="bet" type="number" min="1" step="1" value="${bet}" class="input2" style="flex:1;">
            <button class="btn btnSmall" id="betPlus">+</button>
          </div>

          <div class="row" style="margin-top:12px; gap:8px;">
            <button class="btn" id="rollBtn" style="flex:1;" ${rolling ? "disabled":""}>
              Бросить
            </button>
            <button class="btn ghost" id="bonus">+1000 🪙</button>
          </div>

          <div class="msg2" id="msg">${last?.msg || ""}</div>
        </div>
      </div>
    `;

    // bind buttons
    document.querySelectorAll("[data-sides]").forEach(btn => {
      btn.onclick = () => {
        if (rolling) return;
        sides = Number(btn.dataset.sides);
        target = defaultTarget(sides);
        draw(null);
      };
    });
    document.querySelectorAll("[data-mode]").forEach(btn => {
      btn.onclick = () => {
        if (rolling) return;
        mode = btn.dataset.mode;
        draw(last);
      };
    });

    const tRange = document.getElementById("tRange");
    tRange.oninput = () => {
      if (rolling) return;
      target = Number(tRange.value);
      // big “твоё число”
      document.getElementById("myNum").textContent = String(target).padStart(2, "0");
    };
    tRange.onchange = () => draw(last);

    // bet ui
    const betInput = document.getElementById("bet");
    const betShow = document.getElementById("betShow");
    document.querySelectorAll(".chip").forEach(b => {
      b.onclick = () => {
        if (rolling) return;
        const val = b.dataset.bet;
        bet = (val === "max") ? wallet.coins : Number(val);
        bet = clamp(fmt(bet), 1, wallet.coins || 1);
        betInput.value = String(bet);
        betShow.textContent = String(bet);
      };
    });
    document.getElementById("betMinus").onclick = () => {
      if (rolling) return;
      bet = (Number(betInput.value) || 1) - 10;
      bet = clamp(fmt(bet), 1, wallet.coins || 1);
      betInput.value = String(bet);
      betShow.textContent = String(bet);
    };
    document.getElementById("betPlus").onclick = () => {
      if (rolling) return;
      bet = (Number(betInput.value) || 1) + 10;
      bet = clamp(fmt(bet), 1, wallet.coins || 1);
      betInput.value = String(bet);
      betShow.textContent = String(bet);
    };
    betInput.oninput = () => {
      if (rolling) return;
      bet = clamp(fmt(betInput.value), 1, wallet.coins || 1);
      betInput.value = String(bet);
      betShow.textContent = String(bet);
    };

    document.getElementById("bonus").onclick = () => addCoins(1000);

    // D6 cube initial face (doesn't “snap” instantly after win)
    if (sides === 6) {
      const cube = document.getElementById("cube");
      if (cube && !rolling) {
        const rot = cubeRotFor(1);
        cube.style.transform = `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`;
      }
    }

    // roll action
    document.getElementById("rollBtn").onclick = async () => {
      if (rolling) return;

      // ⚠️ browsers block sound until user gesture → this click is OK
      playClick(980, 0.02, 0.06);

      bet = clamp(fmt(bet), 1, wallet.coins || 1);
      target = clamp(fmt(target), 1, sides);

      if (bet <= 0) return alert("Ставка должна быть больше 0");
      if (bet > wallet.coins) return alert("Недостаточно монет");

      addCoins(-bet);

      rolling = true;

      const roll = randInt(1, sides);
      const mult = payoutMult();
      const payout = Math.floor(bet * mult);
      const win = mode === "under" ? (roll <= target) : (roll >= target);

      // update big numbers live
      const rolledEl = document.getElementById("rolledNum");
      rolledEl.textContent = "00";

      if (sides === 6) {
        await animateD6Throw(roll, win);
      } else {
        await animateBigRoll(roll);
      }

      // show result
      rolledEl.textContent = String(roll).padStart(2, "0");

      let msg = "";
      if (win) {
        addCoins(payout);
        playWin();
        msg = `✅ Выпало ${roll}. Выигрыш +${payout} 🪙 (x${mult.toFixed(2)})`;
      } else {
        playLose();
        msg = `❌ Выпало ${roll}. Ставка ${bet} 🪙 проиграна`;
      }

      // держим “выигрышную грань” 1.2 сек, потом возвращаем в исходное (как ты просил)
      if (sides === 6) {
        await wait(1200);
        const cube = document.getElementById("cube");
        if (cube) {
          cube.style.transition = "transform 420ms cubic-bezier(.2,.9,.2,1)";
          const rot = cubeRotFor(1);
          cube.style.transform = `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`;
        }
      } else {
        await wait(900);
      }

      rolling = false;
      draw({ roll, msg });
    };
  }

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ---------- animations ----------
  async function animateD6Throw(finalNumber, win) {
    const wrap = document.getElementById("wrap");
    const cube = document.getElementById("cube");
    const shadow = document.getElementById("shadow");
    if (!wrap || !cube || !shadow) return;

    // reset animations
    wrap.style.animation = "none";
    shadow.style.animation = "none";
    void wrap.offsetWidth;

    // flight path + shadow
    wrap.style.animation = "wrapFlyBounce 1100ms cubic-bezier(.2,.9,.2,1) both";
    shadow.style.animation = "shadowFly 1100ms cubic-bezier(.2,.9,.2,1) both";

    // spinning while flying
    cube.style.transition = "none";
    const spinX = 720 + randInt(720, 1440);
    const spinY = 720 + randInt(720, 1440);
    const spinZ = randInt(-180, 180);
    cube.style.transform = `rotateX(${spinX}deg) rotateY(${spinY}deg) rotateZ(${spinZ}deg)`;

    // sound ticks in air
    setTimeout(() => playClick(850, 0.02, 0.05), 120);
    setTimeout(() => playClick(780, 0.02, 0.05), 260);
    setTimeout(() => playClick(720, 0.02, 0.05), 420);

    // landing 1
    setTimeout(() => playThud(0.10), 900);
    // bounce landing 2
    setTimeout(() => playThud(0.07), 1040);

    // snap to final face at landing
    await wait(900);
    const rot = cubeRotFor(finalNumber);

    // tiny settle (so it feels heavy)
    const settleX = rot.x + randInt(-6, 6);
    const settleY = rot.y + randInt(-6, 6);

    cube.style.transition = "transform 220ms cubic-bezier(.2,.9,.2,1)";
    cube.style.transform = `rotateX(${settleX}deg) rotateY(${settleY}deg)`;

    await wait(220);
    cube.style.transition = "transform 260ms cubic-bezier(.15,.85,.15,1)";
    cube.style.transform = `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`;

    // subtle “win glow” (без цветов мы не трогаем, но можем усилить тень)
    if (win) {
      shadow.style.opacity = "0.42";
      await wait(200);
      shadow.style.opacity = "";
    }
  }

  async function animateBigRoll(finalNumber) {
    const rollAnim = document.getElementById("rollAnim");
    const wheel = document.getElementById("numWheel");
    const finalBig = document.getElementById("finalBig");
    if (!rollAnim || !wheel || !finalBig) return;

    rollAnim.classList.add("on");
    wheel.classList.remove("on");
    wheel.innerHTML = "";

    // “богатый” эффект — быстро меняем числа + общий спин
    const start = performance.now();
    const dur = 1200;

    // звук “трещотки”
    let tick = 0;
    const timer = setInterval(() => {
      tick++;
      playClick(600 + (tick % 6) * 40, 0.01, 0.03);
    }, 70);

    wheel.classList.add("on");

    while (performance.now() - start < dur) {
      const v = randInt(1, sides);
      finalBig.textContent = String(v).padStart(2, "0");
      await wait(55);
    }

    clearInterval(timer);
    playThud(0.07);

    finalBig.textContent = String(finalNumber).padStart(2, "0");

    // hide overlay smoothly
    await wait(250);
    rollAnim.classList.remove("on");
    wheel.classList.remove("on");
  }

  // ---------- init ----------
  target = defaultTarget(sides);
  draw(null);
}


/* =========================
   MINES PRO
   ========================= */
let minesState = null;

function renderMines() {
  const size = 25; // 5x5

  function calcMultiplier(safeOpened, minesCount) {
    const m = minesCount;
    const a = 0.095 + m * 0.0075;
    const b = 0.018 + m * 0.0018;
    const mult = 1 + safeOpened * a + safeOpened * safeOpened * b * 0.06;
    return Math.max(1, mult);
  }

  function buildMines(minesCount) {
    const mines = new Set();
    while (mines.size < minesCount) mines.add(randInt(0, size - 1));
    return mines;
  }

  function startGame(bet, minesCount) {
    bet = Math.floor(Number(bet) || 0);
    minesCount = Math.floor(Number(minesCount) || 0);

    if (bet <= 0) return alert("Ставка должна быть больше 0");
    if (bet > wallet.coins) return alert("Недостаточно монет");
    if (minesCount < 1 || minesCount > size - 1)
      return alert(`Мин должно быть от 1 до ${size - 1}`);

    addCoins(-bet);

    minesState = {
      bet,
      minesCount,
      mines: buildMines(minesCount),
      opened: new Set(),
      over: false,
      safeOpened: 0,
      multiplier: 1,
      msg: "",
      lastHitMine: null,
      cashed: false,
    };

    draw();
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

    minesState.msg = `✅ Забрал: +${payout} 🪙 (x${minesState.multiplier.toFixed(2)})`;
    revealAll();
    draw();
  }

  function onCellClick(i) {
    if (!minesState || minesState.over) return;
    if (minesState.opened.has(i)) return;

    minesState.opened.add(i);

    if (minesState.mines.has(i)) {
      minesState.over = true;
      minesState.lastHitMine = i;
      minesState.msg = `💥 Мина! Ставка ${minesState.bet} 🪙 сгорела`;
      revealAll();
      draw();
      return;
    }

    minesState.safeOpened += 1;
    minesState.multiplier = calcMultiplier(minesState.safeOpened, minesState.minesCount);

    if (minesState.safeOpened >= size - minesState.minesCount) {
      minesState.msg = "🏁 Открыл все safe! Авто-забор.";
      cashOut();
      return;
    }

    draw();
  }

  function minesSetupScreen() {
    const presets = [10, 50, 100, 250, 500];

    screenEl.innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <div style="font-weight:900; font-size:16px;">Mines</div>
            <div style="opacity:.8; font-size:13px; margin-top:4px;">Ставка 🪙 + мин-слайдер + “Забрать”.</div>
          </div>
          <div class="badge">Баланс: <b>🪙 ${wallet.coins}</b></div>
        </div>

        <div style="margin-top:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-weight:800;">Ставка</div>
            <div class="badge"><b id="betShow">50</b> 🪙</div>
          </div>

          <div class="row" style="margin-top:8px; gap:8px; flex-wrap:wrap;">
            ${presets.map(v => `<button class="chip" data-bet="${v}">${v}</button>`).join("")}
            <button class="chip" data-bet="max">MAX</button>
          </div>

          <div class="row" style="margin-top:10px; gap:8px;">
            <button class="btn btnSmall" id="betMinus">-</button>
            <input id="bet" type="number" min="1" step="1" value="50" class="input" style="flex:1;">
            <button class="btn btnSmall" id="betPlus">+</button>
          </div>
        </div>

        <div style="margin-top:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-weight:800;">Количество мин</div>
            <div class="badge"><b id="minesShow">5</b></div>
          </div>

          <input id="minesCount" type="range" min="1" max="24" value="5" class="range">
          <div style="opacity:.8;font-size:12px;margin-top:6px;">
            Больше мин → быстрее растёт множитель, но сложнее.
          </div>
        </div>

        <div class="row" style="margin-top:14px;">
          <button class="btn" id="startMines" style="flex:1;">Start</button>
          <button class="btn ghost" id="bonusCoins">+1000 🪙</button>
        </div>

        <div style="opacity:.65;font-size:12px;margin-top:10px;">
          Монеты виртуальные, без вывода.
        </div>
      </div>
    `;

    const betInput = document.getElementById("bet");
    const betShow = document.getElementById("betShow");
    const minesRange = document.getElementById("minesCount");
    const minesShow = document.getElementById("minesShow");

    const clampBet = () => {
      let v = Math.floor(Number(betInput.value) || 0);
      if (v < 1) v = 1;
      if (v > wallet.coins) v = wallet.coins;
      betInput.value = String(v);
      betShow.textContent = String(v);
    };

    const clampMines = () => {
      const v = Math.floor(Number(minesRange.value) || 1);
      minesShow.textContent = String(v);
    };

    clampBet();
    clampMines();

    document.querySelectorAll(".chip").forEach((b) => {
      b.onclick = () => {
        const val = b.dataset.bet;
        if (val === "max") betInput.value = String(wallet.coins);
        else betInput.value = String(val);
        clampBet();
      };
    });

    document.getElementById("betMinus").onclick = () => {
      betInput.value = String((Number(betInput.value) || 1) - 10);
      clampBet();
    };
    document.getElementById("betPlus").onclick = () => {
      betInput.value = String((Number(betInput.value) || 1) + 10);
      clampBet();
    };

    betInput.oninput = clampBet;
    minesRange.oninput = clampMines;

    document.getElementById("startMines").onclick = () => {
      startGame(betInput.value, minesRange.value);
    };

    document.getElementById("bonusCoins").onclick = () => addCoins(1000);
  }

  function draw() {
    if (!minesState) {
      minesSetupScreen();
      return;
    }

    const cells = [];
    for (let i = 0; i < size; i++) {
      const opened = minesState.opened.has(i);
      const isMine = minesState.mines.has(i);

      let label = "";
      if (opened) label = isMine ? "💣" : "✅";

      let cls = "cell";
      if (opened && isMine) cls += " mine";
      if (opened && !isMine) cls += " safe";
      if (minesState.lastHitMine === i) cls += " boom";

      cells.push(
        `<button class="${cls}" data-i="${i}" ${minesState.over ? "disabled" : ""}>
          <span class="cellInner">${label}</span>
        </button>`
      );
    }

    const potential = Math.floor(minesState.bet * minesState.multiplier);

    screenEl.innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <div style="font-weight:900; font-size:16px;">Mines</div>
            <div style="opacity:.78; font-size:13px; margin-top:4px;">
              Safe: <b>${minesState.safeOpened}</b> · Мин: <b>${minesState.minesCount}</b> · Ставка: <b>${minesState.bet} 🪙</b>
            </div>
          </div>

          <div class="cashBox">
            <div style="opacity:.75;font-size:12px;">Сейчас</div>
            <div style="font-size:22px;font-weight:900;">x${minesState.multiplier.toFixed(2)}</div>
            <div style="opacity:.85;font-size:12px;margin-top:2px;">
              Забрать: <b>${potential} 🪙</b>
            </div>
          </div>
        </div>

        <div style="margin-top:10px; min-height:20px;"><b>${minesState.msg || ""}</b></div>

        <div class="grid">${cells.join("")}</div>

        <div class="row" style="margin-top:12px; gap:8px;">
          <button class="btn" id="cashOut" ${minesState.over ? "disabled" : ""} style="flex:1;">Забрать</button>
          <button class="btn ghost" id="newRound">Новый раунд</button>
        </div>
      </div>
    `;

    document.getElementById("cashOut").onclick = cashOut;
    document.getElementById("newRound").onclick = () => {
      minesState = null;
      draw();
    };

    document.querySelectorAll(".cell").forEach((b) => {
      b.onclick = () => onCellClick(Number(b.dataset.i));
    });
  }

  // --- Styles for Mines PRO ---
  if (!document.getElementById("mines-pro-style")) {
    const st = document.createElement("style");
    st.id = "mines-pro-style";
    st.textContent = `
      .range{ width:100%; margin-top:8px; accent-color:#4c7dff; }
      .input{
        width:100%; padding:10px; border-radius:12px;
        border:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.06);
        color:#e8eefc; outline:none;
      }
      .chip{
        padding:8px 10px; border-radius:999px;
        border:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.06);
        color:#e8eefc; cursor:pointer; font-weight:800; font-size:12px;
        transition: transform .08s ease, background .12s ease;
      }
      .chip:active{transform:scale(.98);}
      .btnSmall{padding:10px 12px; min-width:44px;}
      .ghost{background:rgba(255,255,255,.06)!important;}

      .cashBox{
        padding:10px 12px; border-radius:14px;
        background: linear-gradient(180deg, rgba(76,125,255,.18), rgba(76,125,255,.08));
        border:1px solid rgba(76,125,255,.25);
        min-width:150px; text-align:right;
      }

      .grid{ display:grid; grid-template-columns:repeat(5,1fr); gap:10px; margin-top:12px; }

      .cell{
        height:54px; border-radius:14px;
        background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.10);
        color:#e8eefc; cursor:pointer; position:relative;
        transform-style:preserve-3d;
        transition: transform .12s ease, background .12s ease, border-color .12s ease;
        overflow:hidden;
      }
      .cell:active{transform:scale(.98);}
      .cellInner{
        display:flex; height:100%; align-items:center; justify-content:center;
        font-size:18px; font-weight:900; transform: translateZ(1px);
      }

      .cell.safe, .cell.mine{
        transform: rotateX(8deg) rotateY(0deg);
        animation: pop .14s ease-out;
      }
      @keyframes pop { from { transform: scale(.92); } to { transform: scale(1); } }

      .cell.safe{
        background:rgba(42,102,255,.18);
        border-color:rgba(42,102,255,.35);
        box-shadow: 0 0 0 1px rgba(42,102,255,.10) inset;
      }
      .cell.mine{
        background:rgba(255,80,80,.18);
        border-color:rgba(255,80,80,.35);
        box-shadow: 0 0 0 1px rgba(255,80,80,.10) inset;
      }
      .cell.boom{ animation: boom .25s ease-out; }
      @keyframes boom { 0%{transform:scale(1);} 50%{transform:scale(1.05);} 100%{transform:scale(1);} }

      .cell:disabled{opacity:.88;cursor:not-allowed;}
    `;
    document.head.appendChild(st);
  }

  draw();
}

/* =========================
   BLACK JACK (без монет пока)
   ========================= */
function makeDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const deck = [];
  for (const s of suits) for (const r of ranks) deck.push({ r, s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
function handValue(cards) {
  let total = 0,
    aces = 0;
  for (const c of cards) {
    if (c.r === "A") {
      aces++;
      total += 11;
    } else if (["K", "Q", "J"].includes(c.r)) total += 10;
    else total += Number(c.r);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}
function renderCards(cards) {
  return cards.map((c) => `${c.r}${c.s}`).join(" ");
}
let bj = null;

function renderBJ() {
  function newBJ() {
    const deck = makeDeck();
    bj = {
      deck,
      player: [deck.pop(), deck.pop()],
      dealer: [deck.pop(), deck.pop()],
      over: false,
      msg: "",
    };
    draw();
  }

  function draw() {
    const pVal = handValue(bj.player);
    const dVal = handValue(bj.dealer);
    const dealerShown = bj.over ? renderCards(bj.dealer) : `${bj.dealer[0].r}${bj.dealer[0].s} ??`;
    const dealerText = bj.over ? `(${dVal})` : "";

    screenEl.innerHTML = `
      <div class="card">
        <div style="font-weight:900; font-size:16px;">Black Jack</div>
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

    document.getElementById("newbj").onclick = newBJ;
    document.getElementById("hit").onclick = () => {
      bj.player.push(bj.deck.pop());
      if (handValue(bj.player) > 21) {
        bj.over = true;
        bj.msg = "Перебор. Ты проиграл.";
      }
      draw();
    };
    document.getElementById("stand").onclick = () => {
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

/* =========================
   LUCKY JET (демо)
   ========================= */
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
    draw();
  }

  function draw() {
    screenEl.innerHTML = `
      <div class="card">
        <div style="font-weight:900; font-size:16px;">Lucky Jet (demo)</div>
        <div style="opacity:.8; font-size:13px; margin-top:6px;">Нажми “Забрать” до краша. Виртуально.</div>
        <div style="font-size:44px; margin:14px 0; font-weight:900;">
          ${crash.mult.toFixed(2)}x
        </div>
        <div style="min-height:22px;"><b>${crash.msg || ""}</b></div>
        <div class="row" style="margin-top:12px;">
          <button class="btn" id="start" ${crash.running ? "disabled" : ""}>Старт</button>
          <button class="btn" id="cash" ${!crash.running || crash.cashed ? "disabled" : ""}>Забрать</button>
          <button class="btn ghost" id="newc">Новая</button>
        </div>
      </div>
    `;
    document.getElementById("start").onclick = start;
    document.getElementById("cash").onclick = cashOut;
    document.getElementById("newc").onclick = newCrash;
  }

  newCrash();
}

setScreen("menu");




