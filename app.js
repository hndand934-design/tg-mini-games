// ===== RNG (честный) =====
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function randInt(n) { return Math.floor(randFloat() * n); }

// ===== Telegram =====
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

// ===== Wallet =====
const WALLET_KEY = "mini_wallet_dragontower_v1";
function loadWallet() {
  try {
    const w = JSON.parse(localStorage.getItem(WALLET_KEY) || "null");
    if (w && typeof w.coins === "number") return w;
  } catch {}
  return { coins: 1000 };
}
function saveWallet(w) { localStorage.setItem(WALLET_KEY, JSON.stringify(w)); }
let wallet = loadWallet();
function setCoins(v){
  wallet.coins = Math.max(0, Math.floor(v));
  saveWallet(wallet);
  renderTop();
}
function addCoins(d){ setCoins(wallet.coins + d); }

// ===== Sound (лёгкий) =====
let soundOn = true;
function beep(freq = 520, ms = 55, vol = 0.03) {
  if (!soundOn) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, ms);
  } catch {}
}
function sfxEgg(){ beep(740, 55, 0.028); beep(980, 55, 0.022); }
function sfxSkull(){ beep(220, 90, 0.03); beep(160, 110, 0.028); }

// ===== UI refs =====
const subTitle = document.getElementById("subTitle");
const balanceEl = document.getElementById("balance");
const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");

const modeNormal = document.getElementById("modeNormal");
const modeHard = document.getElementById("modeHard");
const modeHint = document.getElementById("modeHint");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");
const startBtn = document.getElementById("startBtn");
const cashBtn = document.getElementById("cashBtn");

const statusView = document.getElementById("statusView");
const xView = document.getElementById("xView");
const potView = document.getElementById("potView");

const towerEl = document.getElementById("tower");
const scaleEl = document.getElementById("scale");

// ===== config =====
const COLS_DESKTOP = 4;     // как было (в мобиле CSS сжимает до 3)
const ROWS = 8;
const THEME = {
  normal: { eggs: 3, skulls: 1, label: "Обычный: 3 яйца / 1 череп" },
  hard:   { eggs: 1, skulls: 3, label: "Сложный: 1 яйцо / 3 черепа" },
};

// лестница X (пример как в финале: растёт по рядам)
const X_LADDER = {
  normal: [1.18, 1.42, 1.72, 2.10, 2.60, 3.30, 4.20, 5.50],
  hard:   [1.35, 1.75, 2.35, 3.20, 4.20, 5.50, 7.20, 9.40],
};

// ===== state =====
let mode = "normal";
let inGame = false;
let currentRow = 0;       // 0..ROWS-1
let bet = 100;
let currentX = 1.0;
let reservedBet = 0;      // списана ставка
let rowMaps = [];         // массив рядов: для каждого ряда массив из "egg"/"skull" по колонкам
let busy = false;

// ===== render top =====
function renderTop(){
  const user = tg?.initDataUnsafe?.user;
  subTitle.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
  balanceEl.textContent = String(wallet.coins);
}
renderTop();

// ===== sound toggle =====
soundBtn.onclick = () => {
  soundOn = !soundOn;
  soundText.textContent = soundOn ? "Звук on" : "Звук off";
  const dot = soundBtn.querySelector(".dot");
  dot.style.background = soundOn ? "#26d47b" : "#ff5a6a";
  dot.style.boxShadow = soundOn
    ? "0 0 0 3px rgba(38,212,123,.14)"
    : "0 0 0 3px rgba(255,90,106,.14)";
  beep(soundOn ? 640 : 240, 60, 0.03);
};

// ===== bonus =====
bonusBtn.onclick = () => { addCoins(1000); beep(760, 70, 0.03); };

// ===== mode =====
function setMode(m){
  if (inGame) return; // как в финале: во время раунда режим не меняем
  mode = m;
  modeNormal.classList.toggle("active", mode === "normal");
  modeHard.classList.toggle("active", mode === "hard");
  modeHint.textContent = THEME[mode].label;
  buildScale();
  beep(520, 50, 0.02);
}
modeNormal.onclick = () => setMode("normal");
modeHard.onclick = () => setMode("hard");

// ===== bet =====
function clampBet(){
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  bet = v;
  updatePotential();
}
betInput.addEventListener("input", clampBet);
betMinus.onclick = () => { betInput.value = String((Number(betInput.value)||1) - 10); clampBet(); };
betPlus.onclick  = () => { betInput.value = String((Number(betInput.value)||1) + 10); clampBet(); };
document.querySelectorAll(".chip").forEach((b) => {
  b.onclick = () => {
    const val = b.dataset.bet;
    betInput.value = (val === "max") ? String(wallet.coins) : String(val);
    clampBet();
    beep(540, 55, 0.02);
  };
});
clampBet();

// ===== scale (X ladder) =====
function buildScale(){
  scaleEl.innerHTML = "";
  const arr = X_LADDER[mode];
  // сверху самый высокий ряд
  for (let i = ROWS - 1; i >= 0; i--){
    const rowNum = i + 1;
    const x = arr[i] ?? 1.0;
    const row = document.createElement("div");
    row.className = "scaleRow";
    row.dataset.row = String(i);
    row.innerHTML = `
      <div class="left">Ряд ${rowNum}</div>
      <div class="right">x${x.toFixed(2)}</div>
    `;
    scaleEl.appendChild(row);
  }
  highlightScale();
}
function highlightScale(){
  const activeIdx = currentRow; // текущий ряд (0 снизу)
  [...scaleEl.querySelectorAll(".scaleRow")].forEach((r) => {
    const idx = Number(r.dataset.row);
    r.classList.toggle("active", inGame && idx === activeIdx);
  });
}
buildScale();

// ===== tower build =====
function buildTower(){
  towerEl.innerHTML = "";

  // кол-во колонок берём “логически” 4 (как было), а на мобиле CSS сожмёт сетку в 3
  // чтобы на мобиле не ломалось, просто строим 4 колонки, CSS сделает 3 в ряд визуально.
  const cols = COLS_DESKTOP;

  // строим сверху вниз, чтобы визуально башня была как в примере
  for (let r = ROWS - 1; r >= 0; r--){
    for (let c = 0; c < cols; c++){
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "tile";
      tile.dataset.r = String(r);
      tile.dataset.c = String(c);

      tile.innerHTML = `
        <div class="tileInner">
          <div class="tileFace faceFront"></div>
          <div class="tileFace faceBack"><div class="icon"></div></div>
        </div>
      `;

      tile.onclick = () => onPickTile(r, c, tile);
      towerEl.appendChild(tile);
    }
  }

  setInteractableRow();
}
buildTower();

function setInteractableRow(){
  const tiles = [...towerEl.querySelectorAll(".tile")];
  tiles.forEach((t) => {
    const r = Number(t.dataset.r);
    const revealed = t.classList.contains("revealed");
    // кликаем только текущий ряд, и только если не раскрыта
    const ok = inGame && !busy && r === currentRow && !revealed;
    t.disabled = !ok;
  });
  highlightScale();
}

function updateHUD(){
  xView.textContent = `x${currentX.toFixed(2)}`;
  updatePotential();
}
function updatePotential(){
  const pot = inGame ? Math.floor(reservedBet * currentX) : 0;
  potView.textContent = String(pot);
}
function setStatus(s){ statusView.textContent = s; }

// ===== round generation =====
function generateRowMaps(){
  const cols = COLS_DESKTOP;
  rowMaps = [];
  const cfg = THEME[mode];

  for (let r = 0; r < ROWS; r++){
    const arr = new Array(cols).fill("egg");
    // ставим черепа
    for (let k = 0; k < cfg.skulls; k++){
      let idx;
      do { idx = randInt(cols); } while (arr[idx] === "skull");
      arr[idx] = "skull";
    }
    rowMaps.push(arr);
  }
}

// ===== start / cashout =====
startBtn.onclick = () => {
  if (inGame) return;
  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");

  // списываем 1 раз
  reservedBet = bet;
  addCoins(-bet);

  inGame = true;
  busy = false;
  currentRow = 0;
  currentX = 1.0;

  generateRowMaps();
  buildTower();
  buildScale();
  setStatus("Игра началась");
  updateHUD();

  startBtn.disabled = true;
  cashBtn.disabled = true;

  beep(520, 55, 0.02);
};

cashBtn.onclick = () => {
  if (!inGame) return;
  // кэшаут доступен только после победы ряда — мы так и включаем кнопку
  const payout = Math.floor(reservedBet * currentX);
  addCoins(payout);
  endRound(`Кэшаут: +${payout} 🪙`, true);
  beep(840, 70, 0.03);
  beep(980, 70, 0.03);
};

function endRound(msg, won){
  inGame = false;
  busy = false;

  startBtn.disabled = false;
  cashBtn.disabled = true;

  setStatus(msg);
  updateHUD();
  setInteractableRow();
}

// ===== reveal animation (egg/skull) =====
function revealTile(tile, type){
  tile.classList.add("revealed");
  tile.classList.toggle("egg", type === "egg");
  tile.classList.toggle("skull", type === "skull");

  const icon = tile.querySelector(".icon");
  icon.textContent = (type === "egg") ? "🥚" : "💀";
  icon.classList.remove("pop");
  // перезапуск поп-анимации
  void icon.offsetWidth;
  icon.classList.add("pop");
}

// ===== pick tile =====
async function onPickTile(r, c, tile){
  if (!inGame || busy) return;
  if (r !== currentRow) return;

  busy = true;
  setInteractableRow();

  const result = rowMaps[r][c]; // "egg" | "skull"

  // раскрываем выбранную клетку
  revealTile(tile, result);

  if (result === "egg"){
    sfxEgg();

    // победа ряда
    const newX = X_LADDER[mode][currentRow] ?? (currentX + 0.2);
    currentX = newX;

    updateHUD();
    setStatus(`Ряд ${currentRow + 1} пройден`);
    cashBtn.disabled = false;

    // переходим выше
    currentRow++;
    if (currentRow >= ROWS){
      // прошёл всё — автокэшаут
      const payout = Math.floor(reservedBet * currentX);
      addCoins(payout);
      endRound(`Башня пройдена! +${payout} 🪙`, true);
      return;
    }

    // небольшой тайминг, чтобы анимация успела сыграть
    setTimeout(() => {
      busy = false;
      setInteractableRow();
    }, 120);

  } else {
    // skull: раскрыть весь текущий ряд (чтобы было видно, как на примере)
    sfxSkull();

    // подсветим/раскроем оставшиеся клетки ряда
    const tiles = [...towerEl.querySelectorAll(".tile")].filter(t => Number(t.dataset.r) === r);
    tiles.forEach((t) => {
      if (t === tile) return;
      if (t.classList.contains("revealed")) return;
      const cc = Number(t.dataset.c);
      const tRes = rowMaps[r][cc];
      revealTile(t, tRes);
    });

    endRound("Череп! Ставка сгорела.", false);
  }
}

// ===== initial =====
setStatus("Ожидание");
updateHUD();
setInteractableRow();
