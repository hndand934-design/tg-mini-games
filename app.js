(() => {
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const fmtRub = (n) => `${Math.max(0, Math.round(n))} ₽`;

  // ====== DOM
  const balanceEl = $("balance");
  const statusTxt = $("statusTxt");
  const xTxt = $("xTxt");
  const potTxt = $("potTxt");
  const lastTxt = $("lastTxt");
  const winTxt = $("winTxt");

  const modeHint = $("modeHint");
  const boardEl = $("board");
  const ladderEl = $("ladder");

  const startBtn = $("startBtn");
  const cashoutBtn = $("cashoutBtn");

  const betInput = $("betInput");
  const betMinus = $("betMinus");
  const betPlus = $("betPlus");

  const modeNormalBtn = $("modeNormal");
  const modeHardBtn = $("modeHard");

  const soundBtn = $("soundBtn");
  const soundTxt = $("soundTxt");

  const fx = $("fx");
  const dragonSvg = $("dragonSvg");

  const toast = $("toast");
  const toastText = $("toastText");

  // ====== Storage
  const LS_BAL = "tgmini_dt_balance_v2";
  let balance = Number(localStorage.getItem(LS_BAL) || 1000);

  function saveBalance() {
    localStorage.setItem(LS_BAL, String(balance));
  }

  function renderBalance() {
    balanceEl.textContent = fmtRub(balance);
    saveBalance();
  }

  // ====== Sound (simple + safe)
  let soundOn = false;
  let ac = null;

  function ensureAC() {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume().catch(() => {});
  }

  function beep(freq = 440, ms = 80, type = "sine", gain = 0.05) {
    if (!soundOn) return;
    ensureAC();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g);
    g.connect(ac.destination);
    o.start();
    setTimeout(() => { try { o.stop(); } catch(e){} }, ms);
  }

  const sClick = () => beep(520, 35, "triangle", 0.03);
  const sWin = () => { beep(660, 70, "sine", 0.05); setTimeout(() => beep(880, 90, "sine", 0.05), 75); };
  const sLose = () => { beep(180, 120, "square", 0.045); setTimeout(() => beep(140, 140, "square", 0.04), 90); };

  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
    soundTxt.textContent = `Звук: ${soundOn ? "on" : "off"}`;
    if (soundOn) beep(620, 60, "sine", 0.05);
  });

  // ====== Toast (НЕ блокирует ничего)
  let toastTimer = null;
  function showToast(text) {
    toastText.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 1800);
  }

  // ====== Game constants
  const ROWS = 9;
  const COLS = 4;

  // Multipliers (Start + after each row)
  const X_NORMAL = [1.00, 1.29, 1.67, 2.16, 2.80, 3.62, 4.68, 6.05, 7.83, 10.20];
  const X_HARD   = [1.00, 1.65, 2.35, 3.45, 5.10, 7.60, 11.30, 16.80, 25.00, 37.50];

  // ====== State
  let mode = "normal"; // normal | hard
  let inGame = false;

  let bet = 100;
  let paidBet = 0;

  let currentRow = 0;    // 0..ROWS-1
  let currentX = 1.00;

  // rowsData[row] = { safe:[...], traps:[...] }
  let rowsData = [];

  function getLadder() {
    return mode === "hard" ? X_HARD : X_NORMAL;
  }

  // ====== UI small helpers
  function setStatus(t) { statusTxt.textContent = t; }
  function setX(x) { xTxt.textContent = `x${x.toFixed(2)}`; }
  function setPotential() {
    const pot = inGame ? Math.floor(paidBet * currentX) : 0;
    potTxt.textContent = fmtRub(pot);
  }

  // ====== Ladder
  function renderLadder(activeStep = 0) {
    ladderEl.innerHTML = "";
    const xs = getLadder();
    for (let r = ROWS; r >= 1; r--) {
      const stepIndex = r;
      const div = document.createElement("div");
      div.className = "step" + (stepIndex === activeStep ? " active" : "");
      div.innerHTML = `<div class="k">Ряд ${r}</div><div class="v">x${xs[stepIndex].toFixed(2)}</div>`;
      ladderEl.appendChild(div);
    }
  }

  // ====== Board
  function buildBoard() {
    boardEl.innerHTML = "";

    // Визуально снизу вверх: row 0 снизу, row 8 сверху.
    for (let vr = ROWS - 1; vr >= 0; vr--) {
      for (let c = 0; c < COLS; c++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "tile locked";
        b.disabled = true;
        b.dataset.row = String(vr);
        b.dataset.col = String(c);
        b.addEventListener("click", onTileClick);
        boardEl.appendChild(b);
      }
    }
  }

  function tilesOfRow(row) {
    return [...boardEl.querySelectorAll(`.tile[data-row="${row}"]`)];
  }

  function lockAllTiles() {
    boardEl.querySelectorAll(".tile").forEach(t => {
      t.classList.add("locked");
      t.classList.remove("current");
      t.disabled = true;
    });
  }

  function unlockRow(row) {
    tilesOfRow(row).forEach(t => {
      t.classList.remove("locked");
      t.classList.add("current");
      t.disabled = false;
    });
  }

  // ====== RNG prepare rows
  function prepareRows() {
    rowsData = [];
    const safeCount = (mode === "hard") ? 1 : 3; // eggs
    for (let r = 0; r < ROWS; r++) {
      const indices = [0,1,2,3].sort(() => Math.random() - 0.5);
      const safe = indices.slice(0, safeCount);
      const traps = indices.slice(safeCount);
      rowsData.push({ safe, traps });
    }
  }

  function isSafe(row, col) {
    return rowsData[row].safe.includes(col);
  }

  // ====== Bet controls
  function readBet() {
    let v = Number(betInput.value || 0);
    v = Math.floor(v);
    if (!Number.isFinite(v) || v < 1) v = 1;
    betInput.value = String(v);
    bet = v;
  }

  betInput.addEventListener("input", readBet);

  betMinus.addEventListener("click", () => {
    sClick();
    readBet();
    betInput.value = String(clamp(bet - 10, 1, 9999999));
    readBet();
  });

  betPlus.addEventListener("click", () => {
    sClick();
    readBet();
    betInput.value = String(clamp(bet + 10, 1, 9999999));
    readBet();
  });

  document.querySelectorAll(".chipbtn").forEach(btn => {
    btn.addEventListener("click", () => {
      sClick();
      readBet();
      const v = btn.dataset.chip;
      if (v === "max") betInput.value = String(Math.max(1, balance));
      else betInput.value = String(clamp(Number(v), 1, 9999999));
      readBet();
    });
  });

  // ====== Mode
  function setMode(newMode) {
    if (inGame) {
      showToast("Нельзя менять режим во время игры.");
      return;
    }
    mode = newMode;
    modeNormalBtn.classList.toggle("active", mode === "normal");
    modeHardBtn.classList.toggle("active", mode === "hard");
    modeHint.textContent = mode === "hard"
      ? "Сложный: 1 яйцо / 3 ловушки в ряду"
      : "Обычный: 3 яйца / 1 ловушка в ряду";
    renderLadder(0);
  }

  modeNormalBtn.addEventListener("click", () => { sClick(); setMode("normal"); });
  modeHardBtn.addEventListener("click", () => { sClick(); setMode("hard"); });

  // ====== Game flow
  function resetUI() {
    inGame = false;
    paidBet = 0;
    currentRow = 0;
    currentX = 1.00;

    setStatus("Ожидание");
    setX(1.00);
    potTxt.textContent = fmtRub(0);

    lastTxt.textContent = "—";
    winTxt.textContent = "—";

    startBtn.disabled = false;
    cashoutBtn.disabled = true;

    buildBoard();
    lockAllTiles();
  }

  function startGame() {
    readBet();
    if (inGame) return;

    if (bet > balance) {
      showToast("Недостаточно баланса для ставки.");
      return;
    }

    // списываем ставку один раз
    balance -= bet;
    paidBet = bet;
    renderBalance();

    prepareRows();
    inGame = true;
    currentRow = 0;
    currentX = 1.00;

    setStatus("Игра");
    setX(currentX);
    setPotential();

    startBtn.disabled = true;
    cashoutBtn.disabled = true;

    buildBoard();
    lockAllTiles();
    unlockRow(currentRow);

    renderLadder(0);
    showToast("Игра началась. Выбирай плитку снизу.");
  }

  function revealRow(row) {
    tilesOfRow(row).forEach(t => {
      t.disabled = true;
      t.classList.remove("current");
      t.classList.add("locked");
      const c = Number(t.dataset.col);
      const safe = isSafe(row, c);
      t.classList.add(safe ? "egg" : "trap");
      t.innerHTML = `<div class="reveal">${safe ? "🥚" : "💀"}</div>`;
    });
  }

  function fxPulse(type) {
    fx.className = "fx " + type;
    setTimeout(() => fx.className = "fx", type === "lose" ? 1050 : 850);
  }

  function dragonAnim(type) {
    dragonSvg.classList.remove("win","lose");
    dragonSvg.classList.add(type);
    setTimeout(() => dragonSvg.classList.remove(type), type === "lose" ? 700 : 550);
  }

  function endLose() {
    inGame = false;
    lockAllTiles();

    setStatus("Поражение");
    setPotential();

    startBtn.disabled = false;
    cashoutBtn.disabled = true;

    lastTxt.textContent = "Ловушка 💥";
    winTxt.textContent = fmtRub(0);

    fxPulse("lose");
    dragonAnim("lose");
    sLose();
    showToast("Ловушка! Ставка сгорела.");

    // Подготовим поле к новой игре (без модалок!)
    setTimeout(() => {
      if (!inGame) {
        buildBoard();
        lockAllTiles();
      }
    }, 250);
  }

  function endCashout() {
    if (!inGame) return;

    inGame = false;
    lockAllTiles();

    const payout = Math.floor(paidBet * currentX);
    balance += payout;
    renderBalance();

    setStatus("Кэшаут");
    setPotential();

    lastTxt.textContent = `Кэшаут x${currentX.toFixed(2)}`;
    winTxt.textContent = fmtRub(payout);

    fxPulse("win");
    dragonAnim("win");
    sWin();
    showToast(`Забрал: ${fmtRub(payout)} (x${currentX.toFixed(2)})`);

    startBtn.disabled = false;
    cashoutBtn.disabled = true;

    // сброс визуала без блокировок
    setTimeout(() => {
      buildBoard();
      lockAllTiles();
    }, 250);
  }

  function onTileClick(e) {
    if (!inGame) return;

    const tile = e.currentTarget;
    const row = Number(tile.dataset.row);
    const col = Number(tile.dataset.col);

    // только текущий ряд
    if (row !== currentRow) return;

    sClick();

    // блокируем ряд сразу
    tilesOfRow(currentRow).forEach(t => (t.disabled = true));

    const safe = isSafe(row, col);

    setTimeout(() => {
      revealRow(row);

      if (!safe) {
        renderLadder(currentRow);
        endLose();
        return;
      }

      // прошёл ряд
      currentRow += 1;

      const xs = getLadder();
      currentX = xs[currentRow];

      setStatus("Победа • выше");
      setX(currentX);
      setPotential();
      renderLadder(currentRow);

      // кэшаут доступен после 1 победы
      cashoutBtn.disabled = (currentRow <= 0);

      // если прошли все ряды — автокэшаут
      if (currentRow >= ROWS) {
        setTimeout(() => endCashout(), 350);
        return;
      }

      setTimeout(() => {
        lockAllTiles();
        unlockRow(currentRow);
      }, 220);

    }, 120);
  }

  // Buttons
  startBtn.addEventListener("click", () => {
    sClick();
    startGame();
  });

  cashoutBtn.addEventListener("click", () => {
    sClick();
    if (!inGame) return;
    if (currentRow <= 0) {
      showToast("Кэшаут доступен после первой победы.");
      return;
    }
    endCashout();
  });

  // ====== Boot
  function boot() {
    renderBalance();
    readBet();
    resetUI();
    setMode("normal");
    renderLadder(0);
  }

  window.addEventListener("load", boot);
})();
