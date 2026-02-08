(() => {
  // ====== DOM ======
  const $ = (id) => document.getElementById(id);

  const tabNormal = $("tabNormal");
  const tabHard = $("tabHard");

  const betMinus = $("betMinus");
  const betPlus = $("betPlus");
  const betInput = $("betInput");
  const btnBet = $("btnBet");
  const btnCashout = $("btnCashout");

  const balanceValue = $("balanceValue");
  const statusValue = $("statusValue");
  const curXValue = $("curXValue");
  const potentialValue = $("potentialValue");

  const towerMeta = $("towerMeta");
  const towerGrid = $("towerGrid");
  const xScale = $("xScale");

  const lastResultValue = $("lastResultValue");
  const lastWinValue = $("lastWinValue");

  const modal = $("modal");
  const modalBackdrop = $("modalBackdrop");
  const modalTitle = $("modalTitle");
  const modalText = $("modalText");
  const modalOk = $("modalOk");

  const soundBtn = $("soundBtn");
  const soundDot = $("soundDot");
  const soundText = $("soundText");

  // ====== SETTINGS ======
  const ROWS = 7;        // по скрину у тебя Ряд 7 сверху в списке
  const COLS = 4;

  // Множители подкручены ниже, чтобы на "3 яйца" не было дюпа
  // (умеренные X, как на твоём скрине)
  const MULT_NORMAL = [1.17, 1.37, 1.60, 1.87, 2.19, 2.57, 3.00]; // Ряд 1..7
  const MULT_HARD   = [2.60, 3.40, 4.50, 5.90, 7.70, 10.10, 13.20];

  const MODE = {
    NORMAL: "normal",
    HARD: "hard",
  };

  // ====== STATE ======
  const LS_BAL = "dt_balance_v1";
  const LS_SOUND = "dt_sound_v1";

  let mode = MODE.NORMAL;

  let balance = loadBalance();
  let soundOn = loadSound();

  let inGame = false;
  let bet = 100;

  // rows indexed from 0 (нижний) до ROWS-1 (верхний)
  let currentRow = 0;
  let passedRows = 0; // сколько победных рядов прошёл
  let currentX = 1.0;

  // board[row] = { trapIndex: number, safeIndices: Set<number>, revealed: Set<number> }
  let board = [];

  // блокировка кликов на время анимации
  let lock = false;

  // ====== SOUND (простые тихие "пики") ======
  let audioCtx = null;
  const ensureAudio = () => {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  };
  const beep = (freq = 440, dur = 0.06, vol = 0.03) => {
    if (!soundOn) return;
    try {
      ensureAudio();
      const t0 = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start(t0);
      o.stop(t0 + dur);
    } catch {}
  };

  // ====== INIT ======
  function init() {
    renderBalance();
    setSoundUI();
    setModeUI();
    betInput.value = String(bet);

    buildBoard();
    buildGrid();
    renderXScale();
    setStatus("Ожидание");
    updateNumbers();

    // events
    tabNormal.addEventListener("click", () => switchMode(MODE.NORMAL));
    tabHard.addEventListener("click", () => switchMode(MODE.HARD));

    betMinus.addEventListener("click", () => setBet(bet - 10));
    betPlus.addEventListener("click", () => setBet(bet + 10));
    betInput.addEventListener("input", () => {
      const n = parseInt(String(betInput.value).replace(/\D/g, ""), 10);
      if (Number.isFinite(n)) bet = clamp(n, 10, 1_000_000);
      betInput.value = String(bet);
    });

    // chips
    document.querySelectorAll(".chip").forEach((b) => {
      b.addEventListener("click", () => {
        const v = b.getAttribute("data-v");
        if (v === "MAX") {
          setBet(balance);
        } else {
          setBet(parseInt(v, 10));
        }
        beep(520, 0.05, 0.02);
      });
    });

    // ВАЖНО: ставка должна нажиматься
    btnBet.addEventListener("click", onBetClick);
    btnCashout.addEventListener("click", onCashout);

    soundBtn.addEventListener("click", () => {
      soundOn = !soundOn;
      saveSound(soundOn);
      setSoundUI();
      beep(660, 0.05, 0.02);
    });

    modalOk.addEventListener("click", closeModal);
    modalBackdrop.addEventListener("click", closeModal);
  }

  // ====== MODE ======
  function switchMode(next) {
    if (mode === next) return;
    if (inGame) {
      showModal("Режим", "Нельзя менять режим во время игры. Сначала завершите раунд.");
      return;
    }
    mode = next;
    setModeUI();
    buildBoard();
    buildGrid();
    renderXScale();
    updateNumbers();
    beep(480, 0.05, 0.02);
  }

  function setModeUI() {
    tabNormal.classList.toggle("is-active", mode === MODE.NORMAL);
    tabHard.classList.toggle("is-active", mode === MODE.HARD);

    towerMeta.textContent =
      mode === MODE.NORMAL
        ? "Обычный: 3 яйца / 1 ловушка в ряду"
        : "Сложный: 1 яйцо / 3 ловушки в ряду";
  }

  // ====== BOARD GENERATION ======
  function buildBoard() {
    board = [];
    for (let r = 0; r < ROWS; r++) {
      const trapIndex = randInt(0, COLS - 1);

      const safeIndices = new Set();
      if (mode === MODE.NORMAL) {
        // 3 яйца (все кроме trap)
        for (let c = 0; c < COLS; c++) if (c !== trapIndex) safeIndices.add(c);
      } else {
        // Сложный: 1 яйцо в ряду
        const eggIndex = randInt(0, COLS - 1);
        safeIndices.add(eggIndex);
        // ловушка не обязана быть одна — считаем всё что не egg ловушка
        // trapIndex используется только для "эффекта" при проигрыше, но логика в safeIndices
      }

      board.push({
        trapIndex,
        safeIndices,
        revealed: new Set(),
      });
    }

    // reset run
    inGame = false;
    lock = false;
    passedRows = 0;
    currentRow = 0;
    currentX = 1.0;

    btnCashout.disabled = true;
    btnBet.disabled = false;

    setStatus("Ожидание");
    lastResultValue.textContent = "—";
    lastWinValue.textContent = "—";
  }

  // ====== GRID RENDER ======
  function buildGrid() {
    towerGrid.innerHTML = "";

    // рисуем сверху вниз визуально, но клики будем маппить на rowIndex (0 низ)
    for (let visualRow = ROWS - 1; visualRow >= 0; visualRow--) {
      for (let c = 0; c < COLS; c++) {
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = "tile";
        tile.setAttribute("data-row", String(visualRow));
        tile.setAttribute("data-col", String(c));
        tile.innerHTML = `<div class="mark"></div>`;

        tile.addEventListener("click", () => onTileClick(visualRow, c, tile));
        towerGrid.appendChild(tile);
      }
    }
    refreshActiveRowHighlight();
  }

  function refreshActiveRowHighlight() {
    const tiles = towerGrid.querySelectorAll(".tile");
    tiles.forEach((t) => {
      const r = parseInt(t.getAttribute("data-row"), 10);
      const isCurrent = inGame && r === currentRow && !lock;
      const isDisabled = !inGame || r !== currentRow || lock;

      t.classList.toggle("is-current", isCurrent);
      t.classList.toggle("is-disabled", isDisabled);
      t.disabled = isDisabled;
    });
  }

  // ====== X SCALE ======
  function getMultArr() {
    return mode === MODE.NORMAL ? MULT_NORMAL : MULT_HARD;
  }

  function renderXScale() {
    const arr = getMultArr();
    xScale.innerHTML = "";

    // показываем сверху (Ряд ROWS) -> вниз (Ряд 1)
    for (let i = ROWS; i >= 1; i--) {
      const mult = arr[i - 1];
      const row = document.createElement("div");
      row.className = "xRow";
      row.innerHTML = `<span>Ряд ${i}</span><b>x${mult.toFixed(2)}</b>`;
      xScale.appendChild(row);
    }

    markActiveXRow();
  }

  function markActiveXRow() {
    const rows = xScale.querySelectorAll(".xRow");
    rows.forEach((el) => el.classList.remove("is-active"));

    // активный следующий ряд = passedRows+1
    const nextRowNumber = passedRows + 1; // 1..ROWS
    if (nextRowNumber < 1 || nextRowNumber > ROWS) return;

    // В списке сверху ROWS, снизу 1 => индекс = ROWS - nextRowNumber
    const idx = ROWS - nextRowNumber;
    const el = rows[idx];
    if (el) el.classList.add("is-active");
  }

  // ====== GAME FLOW ======
  function onBetClick() {
    if (inGame) return;

    bet = clamp(parseInt(String(betInput.value).replace(/\D/g, ""), 10) || 100, 10, 1_000_000);
    betInput.value = String(bet);

    if (bet > balance) {
      showModal("Недостаточно средств", "Баланс меньше ставки.");
      beep(220, 0.08, 0.02);
      return;
    }

    // списываем 1 раз
    balance -= bet;
    saveBalance(balance);
    renderBalance();

    // старт
    inGame = true;
    lock = false;
    passedRows = 0;
    currentRow = 0;
    currentX = 1.0;

    btnBet.disabled = true;
    btnCashout.disabled = true;

    setStatus("Игра");
    updateNumbers();
    renderXScale();
    refreshActiveRowHighlight();
    beep(640, 0.05, 0.02);
  }

  async function onTileClick(r, c, tileEl) {
    if (!inGame || lock) return;
    if (r !== currentRow) return;

    lock = true;
    refreshActiveRowHighlight();

    // анимация "поп"
    tileEl.classList.add("pop");
    setTimeout(() => tileEl.classList.remove("pop"), 240);

    const rowData = board[r];
    if (rowData.revealed.has(c)) {
      lock = false;
      refreshActiveRowHighlight();
      return;
    }
    rowData.revealed.add(c);

    // определяем безопасно/ловушка
    const safe = rowData.safeIndices.has(c);

    // раскрываем выбранную
    revealTile(tileEl, safe ? "egg" : "trap");

    if (safe) {
      beep(720, 0.05, 0.02);

      passedRows += 1;
      currentX = getMultArr()[passedRows - 1];

      btnCashout.disabled = false;
      setStatus(`Ряд пройден (${passedRows}/${ROWS})`);
      updateNumbers();
      markActiveXRow();

      // ряд визуально подсветить? мы уже раскрыли плитку
      await sleep(260);

      if (passedRows >= ROWS) {
        // авто-кэшаут на вершине
        await sleep(250);
        doCashout(true);
        return;
      }

      // следующий ряд
      currentRow += 1;
      lock = false;
      refreshActiveRowHighlight();
      return;
    }

    // проигрыш: показать весь ряд
    beep(180, 0.10, 0.02);

    revealWholeRow(r);
    await sleep(450);

    inGame = false;
    btnCashout.disabled = true;
    btnBet.disabled = false;

    setStatus("Поражение");
    updateNumbers();

    lastResultValue.textContent = "Ловушка";
    lastWinValue.textContent = "0 ₽";

    showModal("Итог", `Ловушка! Ты проиграл. Ставка ${fmtMoney(bet)} сгорела.`);

    lock = false;
    refreshActiveRowHighlight();
  }

  function revealTile(tileEl, type) {
    tileEl.classList.add("revealed", type);
    const mark = tileEl.querySelector(".mark");
    if (!mark) return;

    // понятные метки (видно что яйцо/ловушка)
    mark.textContent = type === "egg" ? "ЯЙЦО" : "ЛОВУШКА";
  }

  function revealWholeRow(r) {
    const tiles = towerGrid.querySelectorAll(`.tile[data-row="${r}"]`);
    const rowData = board[r];

    tiles.forEach((t) => {
      const c = parseInt(t.getAttribute("data-col"), 10);
      if (t.classList.contains("revealed")) return;

      const safe = rowData.safeIndices.has(c);
      revealTile(t, safe ? "egg" : "trap");
    });
  }

  function onCashout() {
    if (!inGame) return;
    if (passedRows <= 0) return;
    doCashout(false);
  }

  function doCashout(autoTop) {
    const win = Math.floor(bet * currentX);

    balance += win;
    saveBalance(balance);
    renderBalance();

    inGame = false;
    btnCashout.disabled = true;
    btnBet.disabled = false;

    setStatus("Кэшаут");
    updateNumbers();

    lastResultValue.textContent = `Кэшаут x${currentX.toFixed(2)}`;
    lastWinValue.textContent = fmtMoney(win);

    // раскрыть текущий ряд (для красоты) — безопасные/ловушки
    revealWholeRow(currentRow);

    showModal(
      "Итог",
      autoTop
        ? `Вершина! Авто-кэшаут: x${currentX.toFixed(2)}. Выигрыш: ${fmtMoney(win)}.`
        : `Кэшаут: x${currentX.toFixed(2)}. Выигрыш: ${fmtMoney(win)}.`
    );

    beep(860, 0.06, 0.02);
    setTimeout(() => beep(980, 0.06, 0.02), 90);

    refreshActiveRowHighlight();
  }

  // ====== UI HELPERS ======
  function setStatus(t) {
    statusValue.textContent = t;
  }

  function updateNumbers() {
    curXValue.textContent = `x${currentX.toFixed(2)}`;
    const potential = inGame && passedRows > 0 ? Math.floor(bet * currentX) : 0;
    potentialValue.textContent = fmtMoney(potential);

    markActiveXRow();
  }

  function renderBalance() {
    balanceValue.textContent = fmtMoney(balance);
  }

  function setSoundUI() {
    soundDot.style.background = soundOn ? "var(--egg)" : "rgba(255,255,255,.25)";
    soundText.textContent = `Звук: ${soundOn ? "on" : "off"}`;
  }

  // ====== MODAL ======
  function showModal(title, text) {
    modalTitle.textContent = title;
    modalText.textContent = text;
    modal.classList.remove("hidden");
  }

  function closeModal() {
    modal.classList.add("hidden");
    // после закрытия итога — перегенерим поле (чтобы чисто было)
    if (!inGame) {
      buildBoard();
      buildGrid();
      renderXScale();
      updateNumbers();
      setModeUI();
    }
  }

  // ====== STORAGE ======
  function loadBalance() {
    const raw = localStorage.getItem(LS_BAL);
    const n = raw ? parseInt(raw, 10) : 1000;
    return Number.isFinite(n) && n >= 0 ? n : 1000;
  }
  function saveBalance(v) {
    localStorage.setItem(LS_BAL, String(v));
  }
  function loadSound() {
    const raw = localStorage.getItem(LS_SOUND);
    if (raw === null) return true;
    return raw === "1";
  }
  function saveSound(v) {
    localStorage.setItem(LS_SOUND, v ? "1" : "0");
  }

  // ====== UTIL ======
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function fmtMoney(v) { return `${Math.floor(v).toLocaleString("ru-RU")} ₽`; }
  function setBet(v) {
    bet = clamp(v, 10, 1_000_000);
    betInput.value = String(bet);
  }

  // старт
  init();
})();
