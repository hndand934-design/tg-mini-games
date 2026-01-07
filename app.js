// --- RNG (честный) ---
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2**32;
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
userEl.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;

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

document.querySelectorAll(".nav button").forEach(btn => {
  btn.addEventListener("click", () => setScreen(btn.dataset.screen));
});

// --- ЭКРАНЫ ---
function renderMenu() {
  screenEl.innerHTML = `
    <div class="card">
      <div style="font-weight:700; font-size:16px; margin-bottom:6px;">Выбери режим</div>
      <div class="row">
        <span class="badge">Coin Flip</span>
        <span class="badge">Dice</span>
        <span class="badge">Mines</span>
        <span class="badge">Black Jack</span>
        <span class="badge">Lucky Jet</span>
      </div>
      <div style="opacity:.8; margin-top:10px; font-size:13px;">
        Это демо-миниигры без денег/ставок. Можно добавить рекорды и лидерборд позже.
      </div>
    </div>
  `;
}

// Coin Flip
function renderCoin() {
  screenEl.innerHTML = `
    <div class="card">
      <div style="font-weight:700; font-size:16px;">Coin Flip</div>
      <div id="coinResult" style="margin:12px 0; font-size:28px;">🪙</div>
      <button class="btn" id="flipBtn">Бросить</button>
    </div>
  `;
  document.getElementById("flipBtn").onclick = () => {
    const r = randFloat() < 0.5 ? "Орёл" : "Решка";
    document.getElementById("coinResult").textContent = r === "Орёл" ? "🦅 Орёл" : "🌙 Решка";
  };
}

// Dice
function renderDice() {
  screenEl.innerHTML = `
    <div class="card">
      <div style="font-weight:700; font-size:16px;">Dice</div>
      <div id="diceResult" style="margin:12px 0; font-size:28px;">🎲</div>
      <div class="row">
        <button class="btn" id="d6">D6</button>
        <button class="btn" id="d20">D20</button>
        <button class="btn" id="d100">D100</button>
      </div>
    </div>
  `;
  const out = document.getElementById("diceResult");
  const roll = (s) => out.textContent = `🎲 ${randInt(1, s)} (из ${s})`;
  document.getElementById("d6").onclick = () => roll(6);
  document.getElementById("d20").onclick = () => roll(20);
  document.getElementById("d100").onclick = () => roll(100);
}

// Mines (простая версия)
let minesState = null;
function renderMines() {
  const size = 25; // 5x5
  const minesCount = 5;

  function newGame() {
    const mines = new Set();
    while (mines.size < minesCount) mines.add(randInt(0, size - 1));
    minesState = { mines, opened: new Set(), over: false, score: 0 };
    draw();
  }

  function draw() {
    const cells = [];
    for (let i = 0; i < size; i++) {
      const opened = minesState.opened.has(i);
      let label = " ";
      if (opened) label = minesState.mines.has(i) ? "💣" : "✅";
      cells.push(`<button class="cell" data-i="${i}" ${minesState.over ? "disabled" : ""}>${label}</button>`);
    }

    screenEl.innerHTML = `
      <div class="card">
        <div style="font-weight:700; font-size:16px;">Mines (5x5)</div>
        <div style="opacity:.8; font-size:13px; margin-top:6px;">Мин: ${minesCount}. Открывай клетки — цель набрать очки.</div>
        <div style="margin:10px 0;">Очки: <b>${minesState.score}</b></div>
        <div class="grid">${cells.join("")}</div>
        <div class="row" style="margin-top:12px;">
          <button class="btn" id="newMines">Новая игра</button>
        </div>
      </div>
    `;

    document.getElementById("newMines").onclick = newGame;
    document.querySelectorAll(".cell").forEach(b => {
      b.onclick = () => {
        const i = Number(b.dataset.i);
        if (minesState.opened.has(i) || minesState.over) return;
        minesState.opened.add(i);
        if (minesState.mines.has(i)) {
          minesState.over = true;
        } else {
          minesState.score += 1;
        }
        draw();
      };
    });
  }

  // добавим стили grid локально
  if (!document.getElementById("mines-style")) {
    const st = document.createElement("style");
    st.id = "mines-style";
    st.textContent = `
      .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:10px;}
      .cell{height:48px;border-radius:12px;background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.08);color:#e8eefc;font-size:18px;cursor:pointer;}
      .cell:disabled{opacity:.7;cursor:not-allowed;}
    `;
    document.head.appendChild(st);
  }

  newGame();
}

// Black Jack (упрощенно)
function makeDeck() {
  const suits = ["♠","♥","♦","♣"];
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
    bj = {
      deck,
      player: [deck.pop(), deck.pop()],
      dealer: [deck.pop(), deck.pop()],
      over: false,
      msg: ""
    };
    draw();
  }
  function draw() {
    const pVal = handValue(bj.player);
    const dVal = handValue(bj.dealer);

    let dealerShown = bj.over ? renderCards(bj.dealer) : `${bj.dealer[0].r}${bj.dealer[0].s} ??`;
    let dealerText = bj.over ? `(${dVal})` : "";

    screenEl.innerHTML = `
      <div class="card">
        <div style="font-weight:700; font-size:16px;">Black Jack</div>
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
          <button class="btn" id="newbj">Новая</button>
        </div>
      </div>
    `;

    document.getElementById("newbj").onclick = newBJ;
    document.getElementById("hit").onclick = () => {
      bj.player.push(bj.deck.pop());
      const v = handValue(bj.player);
      if (v > 21) { bj.over = true; bj.msg = "Перебор. Ты проиграл."; }
      draw();
    };
    document.getElementById("stand").onclick = () => {
      // дилер добирает до 17
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

// Lucky Jet (демо без ставок)
let crash = null;
function renderCrash() {
  function newCrash() {
    // Случайный момент краша (чем больше — тем реже)
    // Это демо-модель: crashPoint ~ 1.0..10.0
    const crashPoint = Math.max(1.05, (1 / (1 - randFloat()))); // распределение с хвостом
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
      const now = performance.now();
      const dt = (now - startTime) / 1000;
      crash.t = dt;
      crash.mult = 1 + dt * 0.8 + dt * dt * 0.12; // рост
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
        <div style="font-weight:700; font-size:16px;">Lucky Jet (demo)</div>
        <div style="opacity:.8; font-size:13px; margin-top:6px;">Нажми “Забрать” до краша. Без денег, просто очки/фан.</div>
        <div style="font-size:44px; margin:14px 0; font-weight:800;">
          ${crash.mult.toFixed(2)}x
        </div>
        <div style="min-height:22px;"><b>${crash.msg || ""}</b></div>
        <div class="row" style="margin-top:12px;">
          <button class="btn" id="start" ${crash.running ? "disabled" : ""}>Старт</button>
          <button class="btn" id="cash" ${(!crash.running || crash.cashed) ? "disabled" : ""}>Забрать</button>
          <button class="btn" id="newc">Новая</button>
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
