/* Dragon Tower (GitHub Pages) — v1
   - 2 режима: Обычный (3 safe / 1 trap), Сложный (1 safe / 3 trap)
   - Игра: ставка списывается 1 раз при старте. Кликаем плитки по рядам снизу вверх.
   - Выигрыш: cashout = bet * currentX
   - RNG: ловушки генерируются на старте игры для всех рядов (честно/стабильно внутри раунда)
   - Модал "Итог" НЕ блокируется: overlay z-index + pointer events в CSS уже исправлены
*/

(() => {
  // ------------------------------
  // Helpers
  // ------------------------------
  const $ = (sel) => document.querySelector(sel);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (n) => {
    const x = Math.round(n);
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  };
  const fmtX = (x) => x.toFixed(2).replace(/\.00$/, ".00");

  // ------------------------------
  // Elements (must exist in index)
  // ------------------------------
  const elBalance = $("#balanceValue");
  const elModeEasy = $("#modeEasy");
  const elModeHard = $("#modeHard");

  const elBetInput = $("#betInput");
  const elBetMinus = $("#betMinus");
  const elBetPlus = $("#betPlus");
  const elChipBtns = Array.from(document.querySelectorAll("[data-chip]"));

  const elBtnStart = $("#btnStart");
  const elBtnCashout = $("#btnCashout");

  const elStatStatus = $("#statStatus");
  const elStatX = $("#statX");
  const elStatPotential = $("#statPotential");

  const elBoard = $("#board");
  const elLadder = $("#ladder");
  const elLast = $("#resultLast");
  const elResultWin = $("#resultWin");

  const overlay = $("#overlay");
  const modalText = $("#modalText");
  const modalClose = $("#modalClose");
  const modalOk = $("#modalOk");

  // ------------------------------
  // Config
  // ------------------------------
  const ROWS = 9;      // как на скрине
  const COLS = 4;

  const MODE = {
    easy: { name: "Обычный", safePerRow: 3, trapPerRow: 1 },
    hard: { name: "Сложный", safePerRow: 1, trapPerRow: 3 },
  };

  // X ladder (пример как на скрине — растущая, вкусная)
  // ВАЖНО: X[0] = 1.00 до первой победы, затем за каждый пройденный ряд
  const X_TABLE = [1.00, 1.29, 1.67, 2.16, 2.80, 3.62, 4.68, 6.05, 7.83, 10.20];

  // ------------------------------
  // State
  // ------------------------------
  const storageKey = "DT_BALANCE_V1";
  let balance = Number(localStorage.getItem(storageKey) || 1000);

  let modeKey = "easy";

  let game = {
    active: false,
    row: 0,            // 0..ROWS-1 (сколько рядов уже пройдено)
    bet: 100,
    x: 1.00,
    potential: 0,
    // traps[row] = Set(indexes) where index in 0..COLS-1 is trap
    traps: [],
    // revealed[row][col] -> "safe" | "trap" | null
    revealed: [],
  };

  // ------------------------------
  // UI init
  // ------------------------------
  function saveBalance() {
    localStorage.setItem(storageKey, String(balance));
  }

  function renderBalance() {
    if (elBalance) elBalance.textContent = `${fmt(balance)} ₽`;
  }

  function setStatus(text) {
    if (elStatStatus) elStatStatus.textContent = text;
  }

  function setX(x) {
    if (elStatX) elStatX.textContent = `x${fmtX(x)}`;
  }

  function setPotential(val) {
    if (elStatPotential) elStatPotential.textContent = `${fmt(val)} ₽`;
  }

  function setLast(val) {
    if (elLast) elLast.textContent = val;
  }

  function setWin(val) {
    if (elResultWin) elResultWin.textContent = val;
  }

  function openModal(title, text) {
    if (!overlay) return;
    $(".modalTitle") && ($(".modalTitle").textContent = title || "Итог");
    if (modalText) modalText.textContent = text || "";
    overlay.hidden = false;
  }

  function closeModal() {
    if (!overlay) return;
    overlay.hidden = true;
  }

  // close modal handlers (FIX: buttons always clickable)
  if (modalClose) modalClose.addEventListener("click", closeModal);
  if (modalOk) modalOk.addEventListener("click", closeModal);
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      // click outside modal closes
      if (e.target === overlay) closeModal();
    });
  }

  function getBet() {
    const v = Number(elBetInput?.value || 0);
    return clamp(isFinite(v) ? v : 0, 1, 1_000_000);
  }

  function setBet(v) {
    const val = clamp(Math.round(v), 1, 1_000_000);
    if (elBetInput) elBetInput.value = String(val);
    game.bet = val;
  }

  // ------------------------------
  // Board build
  // ------------------------------
  function buildBoard() {
    if (!elBoard) return;

    elBoard.innerHTML = "";
    game.revealed = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));

    for (let r = 0; r < ROWS; r++) {
      const rowEl = document.createElement("div");
      rowEl.className = "row";
      rowEl.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
      rowEl.dataset.row = String(r);

      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);

        const icon = document.createElement("div");
        icon.className = "icon";
        icon.textContent = ""; // появится при reveal
        cell.appendChild(icon);

        cell.addEventListener("click", onCellClick);
        rowEl.appendChild(cell);
      }
      elBoard.appendChild(rowEl);
    }
  }

  function setRowClickable(rowIndex) {
    // rowIndex: текущий ряд, который нужно выбирать (снизу вверх)
    const rows = Array.from(elBoard.querySelectorAll(".row"));
    rows.forEach((rowEl) => {
      const r = Number(rowEl.dataset.row);
      const cells = Array.from(rowEl.querySelectorAll(".cell"));
      cells.forEach((cell) => {
        cell.classList.remove("clickable");
        cell.style.pointerEvents = "none";
      });

      if (game.active && r === rowIndex) {
        cells.forEach((cell) => {
          // не даём жать уже раскрытую
          const c = Number(cell.dataset.col);
          if (game.revealed[r][c] == null) {
            cell.classList.add("clickable");
            cell.style.pointerEvents = "auto";
          }
        });
      }
    });
  }

  function revealCell(r, c, kind) {
    const cell = getCell(r, c);
    if (!cell) return;

    const icon = cell.querySelector(".icon");
    cell.classList.add("revealed");
    cell.classList.add(kind);

    if (icon) {
      // эмодзи как временная иконка (яйцо / череп)
      icon.textContent = kind === "safe" ? "🥚" : "💀";
    }
  }

  function getCell(r, c) {
    return elBoard?.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`) || null;
  }

  // ------------------------------
  // Ladder
  // ------------------------------
  function buildLadder() {
    if (!elLadder) return;
    elLadder.innerHTML = "";

    // рисуем сверху вниз, чтобы "Ряд 9" был сверху
    for (let r = ROWS; r >= 1; r--) {
      const item = document.createElement("div");
      item.className = "ladderItem";
      item.dataset.r = String(r);

      const left = document.createElement("div");
      left.className = "r";
      left.textContent = `Ряд ${r}`;

      const right = document.createElement("div");
      right.className = "x";
      // X_TABLE индексируется количеством пройденных рядов: r
      const x = X_TABLE[r] ?? (X_TABLE[X_TABLE.length - 1] * (1 + (r - (X_TABLE.length - 1)) * 0.18));
      right.textContent = `x${fmtX(x)}`;

      item.appendChild(left);
      item.appendChild(right);

      elLadder.appendChild(item);
    }
    updateLadderActive();
  }

  function updateLadderActive() {
    if (!elLadder) return;
    const items = Array.from(elLadder.querySelectorAll(".ladderItem"));
    items.forEach((it) => it.classList.remove("active"));

    // активный = следующий ряд (game.row + 1) пока игра активна, иначе 1-й
    const nextR = game.active ? (game.row + 1) : 1;
    const target = elLadder.querySelector(`.ladderItem[data-r="${nextR}"]`);
    if (target) target.classList.add("active");
  }

  function getXForClearedRows(cleared) {
    // cleared = сколько рядов успешно пройдено
    if (cleared <= 0) return 1.00;
    return X_TABLE[cleared] ?? (X_TABLE[X_TABLE.length - 1] * (1 + (cleared - (X_TABLE.length - 1)) * 0.18));
  }

  // ------------------------------
  // RNG / Round generation
  // ------------------------------
  function genTraps() {
    const cfg = MODE[modeKey];
    const traps = [];

    for (let r = 0; r < ROWS; r++) {
      const set = new Set();
      while (set.size < cfg.trapPerRow) {
        set.add(Math.floor(Math.random() * COLS));
      }
      traps.push(set);
    }
    return traps;
  }

  // ------------------------------
  // Game flow
  // ------------------------------
  function resetToIdle() {
    game.active = false;
    game.row = 0;
    game.x = 1.00;
    game.potential = 0;
    game.traps = [];
    game.revealed = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));

    setStatus("Ожидание");
    setX(game.x);
    setPotential(0);
    setLast("—");
    setWin("—");

    if (elBtnStart) elBtnStart.disabled = false;
    if (elBtnCashout) elBtnCashout.disabled = true;

    // очистить доску визуально
    if (elBoard) {
      Array.from(elBoard.querySelectorAll(".cell")).forEach((cell) => {
        cell.classList.remove("revealed", "safe", "trap", "clickable");
        cell.style.pointerEvents = "none";
        const icon = cell.querySelector(".icon");
        if (icon) icon.textContent = "";
      });
    }
    updateLadderActive();
  }

  function startGame() {
    const bet = getBet();
    if (bet <= 0) return;

    if (balance < bet) {
      openModal("Итог", "Недостаточно средств для ставки.");
      return;
    }

    // списываем ставку 1 раз
    balance -= bet;
    saveBalance();
    renderBalance();

    // init game
    game.active = true;
    game.row = 0;
    game.bet = bet;
    game.x = 1.00;
    game.potential = 0;
    game.traps = genTraps();
    game.revealed = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));

    setStatus("Игра");
    setX(game.x);
    setPotential(0);
    setLast("—");
    setWin("—");

    if (elBtnStart) elBtnStart.disabled = true;
    if (elBtnCashout) elBtnCashout.disabled = true; // включим после 1 победы

    // Разрешаем клик по нижнему ряду (ROWS-1)
    setRowClickable(ROWS - 1);
    updateLadderActive();
  }

  function endGameWin() {
    // выигрыш фиксируем по текущему x (после последней победы)
    const payout = Math.floor(game.bet * game.x);
    balance += payout;
    saveBalance();
    renderBalance();

    setStatus("Кэшаут ✅");
    setWin(`${fmt(payout)} ₽`);
    setLast(`Кэшаут x${fmtX(game.x)}`);

    openModal("Итог", `Ты забрал: ${fmt(payout)} ₽ (x${fmtX(game.x)})`);

    resetToIdle();
  }

  function endGameLose() {
    setStatus("Поражение ❌");
    setLast("Ловушка 💀");
    setWin("0 ₽");

    openModal("Итог", "Ты попал на ловушку. Ставка сгорела.");

    resetToIdle();
  }

  function cashout() {
    if (!game.active) return;
    if (game.row <= 0) return; // нельзя кэшаут до 1 победы
    endGameWin();
  }

  // click handler
  function onCellClick(e) {
    if (!game.active) return;

    const cell = e.currentTarget;
    const r = Number(cell.dataset.row);
    const c = Number(cell.dataset.col);

    // можно выбирать только текущий ряд
    const currentRow = ROWS - 1 - game.row;
    if (r !== currentRow) return;
    if (game.revealed[r][c] != null) return;

    // disable clicks on this row momentarily
    setRowClickable(-1);

    const isTrap = game.traps[r].has(c);

    if (isTrap) {
      game.revealed[r][c] = "trap";
      revealCell(r, c, "trap");

      // подсветим остальные (по желанию — только визуально)
      for (let cc = 0; cc < COLS; cc++) {
        if (cc === c) continue;
        const kind = game.traps[r].has(cc) ? "trap" : "safe";
        game.revealed[r][cc] = kind;
        revealCell(r, cc, kind);
      }

      // "дракон" эффект (без звуков/сложной анимации) — просто краткая тряска
      shakeBoard();

      // завершение
      setTimeout(endGameLose, 550);
      return;
    }

    // safe
    game.revealed[r][c] = "safe";
    revealCell(r, c, "safe");

    // открыть остальные как яйца/ловушки (красиво)
    for (let cc = 0; cc < COLS; cc++) {
      if (cc === c) continue;
      const kind = game.traps[r].has(cc) ? "trap" : "safe";
      game.revealed[r][cc] = kind;
      revealCell(r, cc, kind);
    }

    // победа на ряду — увеличиваем прогресс
    game.row += 1;
    game.x = getXForClearedRows(game.row);
    game.potential = Math.floor(game.bet * game.x);

    setX(game.x);
    setPotential(game.potential);
    setLast(`Ряд ${game.row} пройден ✅`);

    // cashout теперь доступен
    if (elBtnCashout) elBtnCashout.disabled = false;

    updateLadderActive();

    // если прошли все ряды — авто-кэшаут
    if (game.row >= ROWS) {
      setTimeout(endGameWin, 650);
      return;
    }

    // следующий ряд (выше)
    setTimeout(() => {
      // очищаем видимость иконок предыдущего ряда можно оставить (как история),
      // но оставим раскрытые — игроку приятно.
      const nextRow = ROWS - 1 - game.row;
      setRowClickable(nextRow);
    }, 520);
  }

  function shakeBoard() {
    const arena = $("#arena");
    if (!arena) return;
    arena.animate(
      [
        { transform: "translate3d(0,0,0)" },
        { transform: "translate3d(-6px,0,0)" },
        { transform: "translate3d(6px,0,0)" },
        { transform: "translate3d(-4px,0,0)" },
        { transform: "translate3d(4px,0,0)" },
        { transform: "translate3d(0,0,0)" },
      ],
      { duration: 380, easing: "ease-out" }
    );
  }

  // ------------------------------
  // Mode switching
  // ------------------------------
  function setMode(key) {
    if (key !== "easy" && key !== "hard") return;
    modeKey = key;

    elModeEasy?.classList.toggle("active", key === "easy");
    elModeHard?.classList.toggle("active", key === "hard");

    // обновим подпись режима, если есть
    const arenaSub = $("#arenaSub");
    if (arenaSub) {
      const cfg = MODE[modeKey];
      const txt = (modeKey === "easy")
        ? `Обычный: ${cfg.safePerRow} яйца / ${cfg.trapPerRow} ловушка в ряду`
        : `Сложный: ${cfg.safePerRow} яйцо / ${cfg.trapPerRow} ловушки в ряду`;
      arenaSub.textContent = txt;
    }

    // если игра не активна — просто пересоберем доску/лестницу (на всякий)
    if (!game.active) {
      buildBoard();
      buildLadder();
      resetToIdle();
    }
  }

  // ------------------------------
  // Wire UI events
  // ------------------------------
  elModeEasy?.addEventListener("click", () => setMode("easy"));
  elModeHard?.addEventListener("click", () => setMode("hard"));

  elBetMinus?.addEventListener("click", () => setBet(getBet() - 10));
  elBetPlus?.addEventListener("click", () => setBet(getBet() + 10));
  elBetInput?.addEventListener("input", () => setBet(getBet()));

  elChipBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = Number(btn.dataset.chip || 0);
      if (!v) return;
      setBet(v);
    });
  });

  elBtnStart?.addEventListener("click", () => {
    if (game.active) return;
    startGame();
  });

  elBtnCashout?.addEventListener("click", () => {
    cashout();
  });

  // ------------------------------
  // Dragon art (simple but not "детский")
  // ------------------------------
  function injectDragonArt() {
    const host = $("#dragonEmblem");
    if (!host) return;

    // стильная "голова дракона" SVG (не мультяшный цыпленок)
    host.innerHTML = `
      <svg viewBox="0 0 520 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="g1" x1="0" x2="1">
            <stop offset="0" stop-color="#7dd3fc" stop-opacity=".95"/>
            <stop offset="1" stop-color="#2f6fff" stop-opacity=".85"/>
          </linearGradient>
          <linearGradient id="g2" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="#ffffff" stop-opacity=".18"/>
            <stop offset="1" stop-color="#000000" stop-opacity="0"/>
          </linearGradient>
          <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" result="b"/>
            <feColorMatrix in="b" type="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 0.8 0" result="c"/>
            <feMerge>
              <feMergeNode in="c"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <!-- horns -->
        <path d="M145 120 C70 90, 40 40, 62 20 C98 10, 120 52, 145 120 Z" fill="rgba(255,255,255,.10)"/>
        <path d="M375 120 C450 90, 480 40, 458 20 C422 10, 400 52, 375 120 Z" fill="rgba(255,255,255,.10)"/>

        <!-- head -->
        <path d="M260 40
                 C220 40, 190 62, 176 90
                 C155 135, 175 192, 230 214
                 C248 221, 272 221, 290 214
                 C345 192, 365 135, 344 90
                 C330 62, 300 40, 260 40 Z"
              fill="rgba(255,255,255,.10)" stroke="rgba(255,255,255,.15)" stroke-width="2"/>

        <!-- snout -->
        <path d="M210 130
                 C230 155, 240 170, 260 170
                 C280 170, 290 155, 310 130
                 C300 176, 282 196, 260 196
                 C238 196, 220 176, 210 130 Z"
              fill="rgba(0,0,0,.18)" stroke="rgba(255,255,255,.10)" stroke-width="2"/>

        <!-- eyes -->
        <circle cx="220" cy="115" r="6" fill="url(#g1)" filter="url(#glow)"/>
        <circle cx="300" cy="115" r="6" fill="url(#g1)" filter="url(#glow)"/>

        <!-- brow -->
        <path d="M205 98 C220 88, 235 86, 250 92" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="3" stroke-linecap="round"/>
        <path d="M270 92 C285 86, 300 88, 315 98" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="3" stroke-linecap="round"/>

        <!-- highlight -->
        <path d="M190 78 C230 54, 290 54, 330 78 C310 62, 290 52, 260 52 C230 52, 210 62, 190 78 Z"
łę        fill="url(#g2)"/>
      </svg>
    `;
  }

  // ------------------------------
  // Boot
  // ------------------------------
  function boot() {
    renderBalance();
    setBet(100);
    injectDragonArt();

    buildBoard();
    buildLadder();
    setMode("easy");   // default

    resetToIdle();
  }

  // expose small debug
  window.__DT__ = {
    getState: () => ({ balance, modeKey, game }),
    resetBalance: (v=1000) => { balance = v; saveBalance(); renderBalance(); }
  };

  boot();
})();
