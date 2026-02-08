(() => {
  // ===== Helpers
  const $ = (id) => document.getElementById(id);
  const fmtRub = (n) => `${Math.max(0, Math.round(n))} ₽`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round2 = (n) => Math.round(n * 100) / 100;

  // ===== Storage
  const LS_BAL = "tgmini_balance_dragontower_v1";
  let balance = Number(localStorage.getItem(LS_BAL) || 1000);

  // ===== Audio (simple + safe)
  let soundOn = false;
  let ac = null;
  const ensureAC = () => {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume().catch(()=>{});
  };
  const beep = (freq = 440, ms = 80, type = "sine", gain = 0.05) => {
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
  };
  const sWin = () => { beep(660, 70, "sine", 0.05); setTimeout(()=>beep(880, 90, "sine", 0.05), 75); };
  const sLose = () => { beep(190, 120, "square", 0.045); setTimeout(()=>beep(140, 140, "square", 0.04), 90); };
  const sClick = () => beep(520, 40, "triangle", 0.03);

  // ===== DOM
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
  const soundBtn = $("soundBtn");
  const soundTxt = $("soundTxt");
  const fxDragon = $("fxDragon");
  const modal = $("modal");
  const modalText = $("modalText");
  const modalOk = $("modalOk");
  const modeNormalBtn = $("modeNormal");
  const modeHardBtn = $("modeHard");

  // ===== Game state
  const ROWS = 9;
  const COLS = 4;

  let mode = "normal"; // normal | hard
  let inGame = false;
  let currentRow = 0;     // 0..ROWS-1
  let bet = 100;
  let paidBet = 0;
  let currentX = 1.0;
  let lastWin = 0;

  // For each row store arrangement
  // rowsData[row] = { trapIndex:number, safeIndices:number[] }
  let rowsData = [];

  // Multipliers (примерно как "желание играть", растёт заметно)
  const X_NORMAL = [1.00, 1.29, 1.67, 2.16, 2.80, 3.62, 4.68, 6.05, 7.83, 10.20]; // start + 9 rows (after each success)
  const X_HARD   = [1.00, 1.65, 2.35, 3.45, 5.10, 7.60, 11.30, 16.80, 25.00, 37.50];

  const getLadder = () => (mode === "hard" ? X_HARD : X_NORMAL);

  // ===== UI init
  function renderBalance() {
    balanceEl.textContent = fmtRub(balance);
    localStorage.setItem(LS_BAL, String(balance));
  }

  function setStatus(txt) { statusTxt.textContent = txt; }

  function setX(val) { xTxt.textContent = `x${val.toFixed(2)}`; }

  function setPotential() {
    const pot = inGame ? Math.floor(paidBet * currentX) : 0;
    potTxt.textContent = fmtRub(pot);
  }

  function openModal(text) {
    modalText.textContent = text;
    modal.hidden = false;
  }
  function closeModal() {
    modal.hidden = true;
  }

  modalOk.addEventListener("click", () => {
    sClick();
    closeModal();
  });

  function setMode(newMode) {
    if (inGame) return;
    mode = newMode;
    modeNormalBtn.classList.toggle("active", mode === "normal");
    modeHardBtn.classList.toggle("active", mode === "hard");

    modeHint.textContent = mode === "hard"
      ? "Сложный: 1 яйцо / 3 ловушки в ряду"
      : "Обычный: 3 яйца / 1 ловушка в ряду";

    renderLadder();
    resetBoardVisual();
  }

  modeNormalBtn.addEventListener("click", () => { sClick(); setMode("normal"); });
  modeHardBtn.addEventListener("click", () => { sClick(); setMode("hard"); });

  // ===== Ladder render
  function renderLadder(activeStep = 0) {
    const xs = getLadder();
    ladderEl.innerHTML = "";
    // rows shown like: Row 9..1 (top highest)
    for (let r = ROWS; r >= 1; r--) {
      const stepIndex = r; // after passing row r, X = xs[r]
      const div = document.createElement("div");
      div.className = "step" + (stepIndex === activeStep ? " active" : "");
      div.innerHTML = `<div class="k">Ряд ${r}</div><div class="v">x${xs[stepIndex].toFixed(2)}</div>`;
      ladderEl.appendChild(div);
    }
  }

  // ===== Board build
  function buildBoard() {
    boardEl.innerHTML = "";
    // top row visually is row 0? We'll render top->bottom or bottom->top:
    // Сделаем как на скрине: кликают снизу вверх (приятнее).
    // Значит визуально снизу — row 0, сверху — row ROWS-1.
    // Создаём DOM в обратном порядке.
    for (let vr = ROWS - 1; vr >= 0; vr--) {
      for (let c = 0; c < COLS; c++) {
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = "tile locked";
        tile.dataset.row = String(vr);
        tile.dataset.col = String(c);
        tile.setAttribute("aria-label", `row ${vr} col ${c}`);
        tile.addEventListener("click", onTileClick);
        boardEl.appendChild(tile);
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

  function resetBoardVisual() {
    buildBoard();
    lockAllTiles();
    // подсветим нижний ряд как "ожидание"
    unlockRow(0);
    lockAllTiles();
  }

  // ===== RNG prepare
  function prepareRows() {
    rowsData = [];
    const safeCount = (mode === "hard") ? 1 : 3;   // eggs
    const trapCount = COLS - safeCount;           // traps
    for (let r = 0; r < ROWS; r++) {
      const indices = [0,1,2,3].sort(() => Math.random() - 0.5);
      const safe = indices.slice(0, safeCount);
      const traps = indices.slice(safeCount, safeCount + trapCount);
      rowsData.push({ safe, traps });
    }
  }

  function isSafe(row, col) {
    return rowsData[row].safe.includes(col);
  }

  // ===== Controls
  function readBet() {
    let v = Number(betInput.value || 0);
    v = Math.floor(v);
    if (!Number.isFinite(v) || v < 1) v = 1;
    betInput.value = String(v);
    bet = v;
  }

  betInput.addEventListener("input", () => { readBet(); });
  betMinus.addEventListener("click", () => { sClick(); readBet(); betInput.value = String(clamp(bet - 10, 1, 9999999)); readBet(); });
  betPlus.addEventListener("click", () => { sClick(); readBet(); betInput.value = String(clamp(bet + 10, 1, 9999999)); readBet(); });

  document.querySelectorAll(".chipbtn").forEach(btn => {
    btn.addEventListener("click", () => {
      sClick();
      readBet();
      const v = btn.dataset.chip;
      if (v === "max") {
        betInput.value = String(Math.max(1, balance));
      } else {
        betInput.value = String(clamp(Number(v), 1, 9999999));
      }
      readBet();
    });
  });

  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
    soundTxt.textContent = `Звук: ${soundOn ? "on" : "off"}`;
    if (soundOn) beep(620, 60, "sine", 0.05);
  });

  // ===== Game flow
  function resetSessionUI() {
    inGame = false;
    currentRow = 0;
    paidBet = 0;
    currentX = 1.0;
    lastWin = 0;

    setStatus("Ожидание");
    setX(1.0);
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
      openModal("Недостаточно баланса для ставки.");
      return;
    }

    // списываем ставку один раз
    balance -= bet;
    paidBet = bet;
    renderBalance();

    prepareRows();
    inGame = true;
    currentRow = 0;
    currentX = 1.0;

    setStatus("Игра");
    setX(currentX);
    setPotential();

    startBtn.disabled = true;
    cashoutBtn.disabled = true;

    buildBoard();
    lockAllTiles();
    unlockRow(currentRow);

    renderLadder(0);
  }

  function endGameLose() {
    inGame = false;
    lockAllTiles();
    setStatus("Поражение");
    cashoutBtn.disabled = true;
    startBtn.disabled = false;

    fxDragon.className = "fx-dragon show-lose";
    setTimeout(() => fxDragon.className = "fx-dragon", 1100);

    lastTxt.textContent = "Ловушка 💥";
    winTxt.textContent = fmtRub(0);
    setPotential();

    sLose();
    openModal("Ловушка! Ставка сгорела.");
  }

  function endGameCashout() {
    inGame = false;
    lockAllTiles();

    const payout = Math.floor(paidBet * currentX);
    balance += payout;
    lastWin = payout;
    renderBalance();

    setStatus("Кэшаут");
    lastTxt.textContent = `Кэшаут x${currentX.toFixed(2)}`;
    winTxt.textContent = fmtRub(payout);

    fxDragon.className = "fx-dragon show-win";
    setTimeout(() => fxDragon.className = "fx-dragon", 900);

    sWin();
    openModal(`Ты забрал: ${fmtRub(payout)} (x${currentX.toFixed(2)})`);

    startBtn.disabled = false;
    cashoutBtn.disabled = true;

    // подготовим поле к следующей игре
    setTimeout(() => {
      if (!modal.hidden) return;
      resetSessionUI();
      renderLadder(0);
    }, 50);
  }

  startBtn.addEventListener("click", () => {
    sClick();
    startGame();
  });

  cashoutBtn.addEventListener("click", () => {
    sClick();
    if (!inGame) return;
    // кэшаут доступен только после хотя бы 1 победы (currentRow > 0)
    if (currentRow <= 0) return;
    endGameCashout();
  });

  // ===== Tile click
  function revealRow(row) {
    const rowTiles = tilesOfRow(row);
    rowTiles.forEach(t => {
      t.disabled = true;
      t.classList.remove("current");
      t.classList.add("locked");
      const c = Number(t.dataset.col);
      const safe = isSafe(row, c);
      t.classList.add(safe ? "egg" : "trap");
      const icon = safe ? "🥚" : "💀";
      t.innerHTML = `<div class="reveal">${icon}</div>`;
    });
  }

  function onTileClick(e) {
    const tile = e.currentTarget;
    if (!inGame) return;

    const row = Number(tile.dataset.row);
    const col = Number(tile.dataset.col);

    // только текущий ряд
    if (row !== currentRow) return;

    // блокируем ряд сразу
    tilesOfRow(currentRow).forEach(t => (t.disabled = true));
    sClick();

    const safe = isSafe(row, col);

    // раскрываем ряд с небольшой задержкой (приятнее)
    setTimeout(() => {
      revealRow(row);

      if (!safe) {
        renderLadder(currentRow); // оставим подсветку на достигнутом
        endGameLose();
        return;
      }

      // победа на ряду -> увеличиваем row, X и даём кэшаут
      currentRow += 1;

      const xs = getLadder();
      currentX = xs[currentRow]; // после прохождения currentRow ряда
      currentX = round2(currentX);

      setStatus("Победа • идёшь выше");
      setX(currentX);
      setPotential();
      renderLadder(currentRow);

      cashoutBtn.disabled = currentRow <= 0;

      // если прошёл все ряды -> авто кэшаут
      if (currentRow >= ROWS) {
        setTimeout(() => endGameCashout(), 450);
        return;
      }

      // следующий ряд активен
      setTimeout(() => {
        lockAllTiles();
        unlockRow(currentRow);
      }, 220);
    }, 140);
  }

  // ===== Boot
  function boot() {
    renderBalance();
    readBet();
    resetSessionUI();
    setMode("normal");
    renderLadder(0);
  }

  // фикс “не нажимаются кнопки” — убираем любые случайные блоки
  window.addEventListener("load", boot);
})();
