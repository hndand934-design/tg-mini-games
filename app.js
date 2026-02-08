/* Dragon Tower — GitHub Pages ready (no external assets)
   Modes:
   - easy: 4 tiles/row, 3 safe, 1 trap
   - hard: 4 tiles/row, 1 safe, 3 traps
*/

(() => {
  const $ = (id) => document.getElementById(id);

  // UI
  const balanceEl = $("balance");
  const soundBtn = $("soundBtn");
  const soundText = $("soundText");

  const modeEasyBtn = $("modeEasy");
  const modeHardBtn = $("modeHard");

  const betInput = $("betInput");
  const betMinus = $("betMinus");
  const betPlus = $("betPlus");
  const chips = Array.from(document.querySelectorAll(".chip"));

  const startBtn = $("startBtn");
  const cashoutBtn = $("cashoutBtn");

  const statusText = $("statusText");
  const currentXEl = $("currentX");
  const potentialEl = $("potential");
  const lastResultEl = $("lastResult");
  const lastPayoutEl = $("lastPayout");

  const boardEl = $("board");
  const ladderEl = $("ladder");
  const arenaSub = $("arenaSub");

  const overlay = $("overlay");
  const modalTitle = $("modalTitle");
  const modalText = $("modalText");
  const modalOk = $("modalOk");

  const dragonWrap = $("dragonWrap");
  const dragon = $("dragon");

  // Settings / state
  const STORAGE_BAL = "tg_dragon_balance_v1";
  const HOUSE_EDGE = 0.97; // friendly (virtual)
  const ROWS = 8;
  const COLS = 4;

  let soundOn = false;

  let mode = "easy"; // easy | hard
  let balance = loadBalance();
  let game = resetGameState();

  // -------- helpers ----------
  function loadBalance() {
    const v = Number(localStorage.getItem(STORAGE_BAL));
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 1000;
  }
  function saveBalance() {
    localStorage.setItem(STORAGE_BAL, String(balance));
  }
  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }
  function fmtRub(n) {
    const x = Math.max(0, Math.floor(n));
    return `${x} ₽`;
  }
  function fmtX(x) {
    return `x${x.toFixed(2)}`;
  }
  function randInt(max) {
    return Math.floor(Math.random() * max);
  }
  function sampleUnique(n, k) {
    const set = new Set();
    while (set.size < k) set.add(randInt(n));
    return Array.from(set);
  }

  function resetGameState() {
    return {
      active: false,
      ended: false,
      bet: 0,
      row: 0, // 0 = bottom row (clickable), goes up
      cleared: 0, // number of successful rows
      // per row: Set(traps)
      traps: [],
      revealed: Array.from({ length: ROWS }, () => Array(COLS).fill(null)), // null | "safe" | "trap"
      currentX: 1.0
    };
  }

  function safeCount() {
    return mode === "easy" ? 3 : 1;
  }

  function buildTraps() {
    // ROWS rows, each has (COLS - safeCount) traps
    const trapsPerRow = COLS - safeCount();
    const arr = [];
    for (let r = 0; r < ROWS; r++) {
      const traps = new Set(sampleUnique(COLS, trapsPerRow));
      arr.push(traps);
    }
    return arr;
  }

  function xForCleared(clearedRows) {
    // Each row multiplies expected multiplier by (COLS / safe) * HOUSE_EDGE
    const step = (COLS / safeCount()) * HOUSE_EDGE;
    return Math.max(1, Math.pow(step, clearedRows));
  }

  // -------- render ----------
  function renderBalance() {
    balanceEl.textContent = String(balance);
  }

  function setMode(next) {
    if (game.active) return; // don't switch mid-game
    mode = next;
    modeEasyBtn.classList.toggle("active", mode === "easy");
    modeHardBtn.classList.toggle("active", mode === "hard");
    arenaSub.textContent =
      mode === "easy"
        ? "Обычный: 3 яйца / 1 ловушка в ряду"
        : "Сложный: 1 яйцо / 3 ловушки в ряду";
    renderLadder();
    rebuildBoard();
    setStatus("Ожидание");
    updateXUI();
  }

  function setStatus(t) {
    statusText.textContent = t;
  }

  function updateXUI() {
    currentXEl.textContent = fmtX(game.currentX);
    const pot = game.active ? Math.floor(game.bet * game.currentX) : 0;
    potentialEl.textContent = fmtRub(pot);
  }

  function renderLadder() {
    ladderEl.innerHTML = "";
    // show from top to bottom
    for (let i = ROWS; i >= 1; i--) {
      const x = xForCleared(i);
      const div = document.createElement("div");
      div.className = "lstep";
      if (game.active) {
        if (i === game.cleared + 1) div.classList.add("active"); // next
        if (i <= game.cleared) div.classList.add("done");
      }
      div.innerHTML = `<div class="n">Ряд ${i}</div><div class="x mono">${fmtX(x)}</div>`;
      ladderEl.appendChild(div);
    }
  }

  function rebuildBoard() {
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateRows = `repeat(${ROWS}, auto)`;

    for (let r = ROWS - 1; r >= 0; r--) {
      // render top row first visually (like tower)
      const row = document.createElement("div");
      row.className = "row";
      row.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
      row.dataset.row = String(r);

      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);

        const icon = document.createElement("div");
        icon.className = "icon";
        icon.textContent = ""; // filled on reveal

        cell.appendChild(icon);
        row.appendChild(cell);
      }
      boardEl.appendChild(row);
    }

    refreshBoardInteractivity();
  }

  function refreshBoardInteractivity() {
    const cells = Array.from(boardEl.querySelectorAll(".cell"));
    cells.forEach((cell) => {
      const r = Number(cell.dataset.row);
      const c = Number(cell.dataset.col);
      cell.classList.remove("disabled", "current", "revealed", "safe", "trap", "pop", "shake");
      const state = game.revealed[r]?.[c];

      // set revealed visuals
      if (state === "safe" || state === "trap") {
        cell.classList.add("revealed");
        cell.classList.add(state);
        const icon = cell.querySelector(".icon");
        if (icon) icon.textContent = state === "safe" ? "🥚" : "💀";
      } else {
        const icon = cell.querySelector(".icon");
        if (icon) icon.textContent = "";
      }

      // current row clickable (only if game active and not ended)
      const isCurrent = game.active && !game.ended && r === game.row;
      if (isCurrent) cell.classList.add("current");
      if (!isCurrent) cell.classList.add("disabled");
    });

    renderLadder();
    updateXUI();

    // buttons
    startBtn.disabled = game.active && !game.ended;
    cashoutBtn.disabled = !(game.active && !game.ended && game.cleared >= 1);
  }

  // -------- animations ----------
  function dragonIdle() {
    dragon.classList.remove("active", "lose", "win");
    dragonWrap.classList.remove("breath", "spark");
  }
  function dragonOnPlay() {
    dragon.classList.add("active");
    dragon.classList.remove("lose", "win");
  }
  function dragonOnLose() {
    dragon.classList.add("lose");
    dragon.classList.remove("win");
    dragonWrap.classList.add("breath");
    setTimeout(() => dragonWrap.classList.remove("breath"), 1200);
  }
  function dragonOnWin() {
    dragon.classList.add("win");
    dragon.classList.remove("lose");
    dragonWrap.classList.add("spark");
    setTimeout(() => dragonWrap.classList.remove("spark"), 1100);
  }

  function popCell(r, c, cls) {
    const cell = boardEl.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
    if (!cell) return;
    cell.classList.remove("pop", "shake");
    void cell.offsetWidth; // reflow
    cell.classList.add(cls);
  }

  // -------- game flow ----------
  function readBet() {
    const n = Math.floor(Number(betInput.value));
    if (!Number.isFinite(n)) return 0;
    return clamp(n, 1, 1_000_000_000);
  }

  function startGame() {
    if (game.active && !game.ended) return;

    const bet = readBet();
    if (bet <= 0) return;

    if (bet > balance) {
      showModal("Недостаточно средств", `Баланс: ${fmtRub(balance)}. Уменьши ставку.`);
      return;
    }

    // reset
    game = resetGameState();
    game.bet = bet;
    game.active = true;
    game.ended = false;
    game.row = 0;
    game.cleared = 0;
    game.traps = buildTraps();
    game.currentX = 1.0;

    // deduct bet once
    balance -= bet;
    saveBalance();
    renderBalance();

    setStatus("Игра началась — выбирай плитку");
    arenaSub.textContent = "Текущий ряд подсвечен. Лови яйца, избегай ловушек.";
    lastResultEl.textContent = "—";
    lastPayoutEl.textContent = "—";

    dragonOnPlay();
    refreshBoardInteractivity();
  }

  function revealRow(r) {
    for (let c = 0; c < COLS; c++) {
      if (game.revealed[r][c] != null) continue;
      const isTrap = game.traps[r].has(c);
      game.revealed[r][c] = isTrap ? "trap" : "safe";
    }
  }

  function endGame(win, payout = 0) {
    game.ended = true;

    if (win) {
      setStatus("Победа / Кэшаут");
      lastResultEl.textContent = "✅ Кэшаут";
      lastPayoutEl.textContent = fmtRub(payout);
      showModal("Кэшаут!", `Ты забрал: ${fmtRub(payout)} (ставка ${fmtRub(game.bet)} × ${fmtX(game.currentX)}).`);
      dragonOnWin();
    } else {
      setStatus("Поражение");
      lastResultEl.textContent = "❌ Поражение";
      lastPayoutEl.textContent = "0 ₽";
      showModal("Поражение", "Попался на ловушку. Ставка сгорела.");
      dragonOnLose();
    }

    // reveal all remaining (for spectacle)
    for (let r = 0; r < ROWS; r++) revealRow(r);

    refreshBoardInteractivity();

    // allow restart
    setTimeout(() => {
      startBtn.disabled = false;
    }, 400);
  }

  function cashout() {
    if (!game.active || game.ended) return;
    if (game.cleared < 1) return;

    const payout = Math.floor(game.bet * game.currentX);
    balance += payout;
    saveBalance();
    renderBalance();

    endGame(true, payout);
  }

  function onCellClick(e) {
    const cell = e.target.closest(".cell");
    if (!cell) return;

    const r = Number(cell.dataset.row);
    const c = Number(cell.dataset.col);

    if (!game.active || game.ended) return;
    if (r !== game.row) return;
    if (game.revealed[r][c] != null) return;

    const isTrap = game.traps[r].has(c);

    if (isTrap) {
      // reveal selected + shake
      game.revealed[r][c] = "trap";
      popCell(r, c, "shake");
      setStatus("Ловушка! Игра окончена");
      endGame(false, 0);
      return;
    }

    // safe
    game.revealed[r][c] = "safe";
    popCell(r, c, "pop");

    game.cleared += 1;
    game.currentX = xForCleared(game.cleared);

    // move to next row
    game.row += 1;

    if (game.row >= ROWS) {
      // reached top -> auto cashout
      const payout = Math.floor(game.bet * game.currentX);
      balance += payout;
      saveBalance();
      renderBalance();
      endGame(true, payout);
      return;
    }

    setStatus(`Успех! Ряд ${game.cleared}/${ROWS}. Можно кэшаутить или идти дальше.`);
    refreshBoardInteractivity();
  }

  // -------- modal ----------
  function showModal(title, text) {
    modalTitle.textContent = title;
    modalText.textContent = text;
    overlay.hidden = false;
  }
  function hideModal() {
    overlay.hidden = true;
  }

  // -------- controls ----------
  function setBet(v) {
    betInput.value = String(clamp(Math.floor(v), 1, 1_000_000_000));
  }

  function applyChip(value) {
    const bet = readBet();
    if (value === "max") return setBet(Math.max(1, balance));
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    setBet(n);
  }

  function toggleSound() {
    soundOn = !soundOn;
    soundBtn.classList.toggle("on", soundOn);
    soundText.textContent = `Звук: ${soundOn ? "on" : "off"}`;
    // (Звук можно подключить позже, если нужно — сейчас делаем визуальную кнопку)
  }

  // -------- init ----------
  function init() {
    renderBalance();
    toggleSound(); // turn ON then OFF? no. We'll set to OFF explicitly:
    soundOn = false;
    soundBtn.classList.remove("on");
    soundText.textContent = "Звук: off";

    setMode("easy");
    setBet(100);
    updateXUI();
    dragonIdle();

    // listeners
    modeEasyBtn.addEventListener("click", () => setMode("easy"));
    modeHardBtn.addEventListener("click", () => setMode("hard"));

    betMinus.addEventListener("click", () => setBet(readBet() - 10));
    betPlus.addEventListener("click", () => setBet(readBet() + 10));

    chips.forEach((b) => b.addEventListener("click", () => applyChip(b.dataset.chip)));

    startBtn.addEventListener("click", startGame);
    cashoutBtn.addEventListener("click", cashout);
    soundBtn.addEventListener("click", toggleSound);

    boardEl.addEventListener("click", onCellClick);

    modalOk.addEventListener("click", () => {
      hideModal();
      // after end, reset state to idle but keep revealed board as "replay look"
      if (game.ended) {
        // soft reset to allow next start clean
        game.active = false;
        game.ended = false;
        game.bet = 0;
        game.row = 0;
        game.cleared = 0;
        game.traps = [];
        game.revealed = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
        game.currentX = 1.0;

        setStatus("Ожидание");
        arenaSub.textContent =
          mode === "easy"
            ? "Обычный: 3 яйца / 1 ловушка в ряду"
            : "Сложный: 1 яйцо / 3 ловушки в ряду";
        dragonIdle();
        rebuildBoard();
        refreshBoardInteractivity();
      }
    });

    // first paint
    rebuildBoard();
    refreshBoardInteractivity();
  }

  init();
})();
