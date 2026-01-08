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

// Coin Flip
function renderCoin() {
  screenEl.innerHTML = `
    <div class="card">
      <div style="font-weight:800; font-size:16px;">Coin Flip</div>
      <div id="coinResult" style="margin:12px 0; font-size:28px;">🪙</div>
      <button class="btn" id="flipBtn">Бросить</button>
    </div>
  `;
  document.getElementById("flipBtn").onclick = () => {
    const r = randFloat() < 0.5 ? "Орёл" : "Решка";
    document.getElementById("coinResult").textContent =
      r === "Орёл" ? "🦅 Орёл" : "🌙 Решка";
  };
}

// Dice
function renderDice() {
  screenEl.innerHTML = `
    <div class="card">
      <div style="font-weight:800; font-size:16px;">Dice</div>
      <div id="diceResult" style="margin:12px 0; font-size:28px;">🎲</div>
      <div class="row">
        <button class="btn" id="d6">D6</button>
        <button class="btn" id="d20">D20</button>
        <button class="btn" id="d100">D100</button>
      </div>
    </div>
  `;
  const out = document.getElementById("diceResult");
  const roll = (s) => (out.textContent = `🎲 ${randInt(1, s)} (из ${s})`);
  document.getElementById("d6").onclick = () => roll(6);
  document.getElementById("d20").onclick = () => roll(20);
  document.getElementById("d100").onclick = () => roll(100);
}

// --- MINES PRO ---
let minesState = null;

function renderMines() {
  const size = 25; // 5x5
  const cols = 5;

  // “приятная” таблица роста множителя (без денег, только виртуальные монеты)
  function calcMultiplier(safeOpened, minesCount) {
    // Чем больше мин — тем быстрее растёт
    const m = minesCount;
    const a = 0.095 + m * 0.0075; // рост за safe
    const b = 0.018 + m * 0.0018; // ускорение
    const mult = 1 + safeOpened * a + (safeOpened * safeOpened) * b * 0.06;
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

    // если открыл все safe — авто-забор
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
        if (val === "max") {
          betInput.value = String(wallet.coins);
        } else {
          betInput.value = String(val);
        }
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
      .range{
        width:100%;
        margin-top:8px;
        accent-color: #4c7dff;
      }
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
        font-weight:700;
        font-size:12px;
        transition: transform .08s ease, background .12s ease;
      }
      .chip:active{transform:scale(.98);}
      .btnSmall{padding:10px 12px; min-width:44px;}
      .ghost{background:rgba(255,255,255,.06)!important;}

      .cashBox{
        padding:10px 12px;
        border-radius:14px;
        background: linear-gradient(180deg, rgba(76,125,255,.18), rgba(76,125,255,.08));
        border:1px solid rgba(76,125,255,.25);
        min-width:150px;
        text-align:right;
      }

      .grid{
        display:grid;
        grid-template-columns:repeat(5,1fr);
        gap:10px;
        margin-top:12px;
      }

      .cell{
        height:54px;
        border-radius:14px;
        background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.10);
        color:#e8eefc;
        cursor:pointer;
        position:relative;
        transform-style:preserve-3d;
        transition: transform .12s ease, background .12s ease, border-color .12s ease;
        overflow:hidden;
      }
      .cell:active{transform:scale(.98);}
      .cellInner{
        display:flex;
        height:100%;
        align-items:center;
        justify-content:center;
        font-size:18px;
        font-weight:900;
        transform: translateZ(1px);
      }

      /* Open animation */
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
      .cell.boom{
        animation: boom .25s ease-out;
      }
      @keyframes boom {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }

      .cell:disabled{opacity:.88;cursor:not-allowed;}
    `;
    document.head.appendChild(st);
  }

  draw();
}

// --- Black Jack (упрощенно, без монет пока) ---
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
      if (handValue(bj.player) > 21) { bj.over = true; bj.msg = "Перебор. Ты проиграл."; }
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

// --- Lucky Jet demo (без монет пока) ---
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
          <button class="btn" id="cash" ${(!crash.running || crash.cashed) ? "disabled" : ""}>Забрать</button>
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
