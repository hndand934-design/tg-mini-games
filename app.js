(() => {
  const $ = (id) => document.getElementById(id);

  // Tabs
  const tabNormal = $("tabNormal");
  const tabHard = $("tabHard");

  // Bet controls
  const betMinus = $("betMinus");
  const betPlus = $("betPlus");
  const betInput = $("betInput");
  const btnBet = $("btnBet");
  const btnCashout = $("btnCashout");

  // Top
  const balanceValue = $("balanceValue");
  const soundBtn = $("soundBtn");
  const soundDot = $("soundDot");
  const soundText = $("soundText");

  // Center
  const towerMeta = $("towerMeta");
  const towerGrid = $("towerGrid");
  const fxLayer = $("fxLayer");

  // Right
  const xScale = $("xScale");
  const lastResultValue = $("lastResultValue");
  const lastWinValue = $("lastWinValue");

  // Status
  const statusValue = $("statusValue");
  const curXValue = $("curXValue");
  const potentialValue = $("potentialValue");

  // Modal
  const modal = $("modal");
  const modalBackdrop = $("modalBackdrop");
  const modalTitle = $("modalTitle");
  const modalText = $("modalText");
  const modalOk = $("modalOk");

  // ===== SETTINGS =====
  const ROWS = 7;
  const COLS = 4;

  // Чуть “прибито” чтобы 3 яйца не дюпились
  const MULT_NORMAL = [1.12, 1.28, 1.46, 1.66, 1.89, 2.15, 2.45];
  // Сложный — высокий риск, высокий X
  const MULT_HARD   = [2.45, 3.20, 4.20, 5.50, 7.20, 9.40, 12.30];

  const MODE = { NORMAL: "normal", HARD: "hard" };

  const LS_BAL = "dt_balance_v3";
  const LS_SOUND = "dt_sound_v3";

  // ===== STATE =====
  let mode = MODE.NORMAL;
  let balance = loadBalance();
  let soundOn = loadSound();

  let inGame = false;
  let lock = false;

  let bet = 100;

  // row index: 0 bottom -> ROWS-1 top
  let currentRow = 0;
  let passedRows = 0;
  let currentX = 1.0;

  // board[r] = { safe:Set(cols), revealed:Set(cols) }
  let board = [];

  // ===== SVG ICONS =====
  const EggSVG = `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="eg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#33f0c5"/>
          <stop offset="1" stop-color="#1bbd95"/>
        </linearGradient>
      </defs>
      <path d="M32 6c-11 0-19 12-19 27s8 25 19 25 19-10 19-25S43 6 32 6z"
            fill="url(#eg)" opacity="0.98"/>
      <path d="M23 22c2-6 6-10 10-10" stroke="rgba(255,255,255,.46)" stroke-width="4" stroke-linecap="round" fill="none"/>
    </svg>
  `;
  const SkullSVG = `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="sk" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ff6b86"/>
          <stop offset="1" stop-color="#cf2a49"/>
        </linearGradient>
      </defs>
      <path d="M32 8c-12 0-20 9-20 20 0 8 4 14 10 17v7c0 2 2 4 4 4h2v-5h8v5h2c2 0 4-2 4-4v-7c6-3 10-9 10-17 0-11-8-20-20-20z"
            fill="url(#sk)"/>
      <circle cx="24" cy="30" r="6" fill="rgba(0,0,0,.35)"/>
      <circle cx="40" cy="30" r="6" fill="rgba(0,0,0,.35)"/>
      <path d="M32 35c-3 2-4 4-4 7h8c0-3-1-5-4-7z" fill="rgba(0,0,0,.35)"/>
      <path d="M24 52h16" stroke="rgba(0,0,0,.35)" stroke-width="4" stroke-linecap="round"/>
    </svg>
  `;

  // ===== SOUND (Stake-like: clicks + reveal + win streak + lose thud) =====
  let audioCtx = null;
  const ensureAudio = () => {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  };

  const tone = (type, f0, f1, dur, vol = 0.03) => {
    if (!soundOn) return;
    try {
      ensureAudio();
      const t0 = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t0);
      if (f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t0); o.stop(t0 + dur);
    } catch {}
  };

  const clickSfx = () => tone("triangle", 520, 420, 0.045, 0.02);
  const betSfx = () => { tone("sine", 640, 780, 0.06, 0.025); setTimeout(()=>tone("sine", 920, 980, 0.05, 0.02), 55); };
  const eggSfx = () => tone("sine", 820, 1060, 0.06, 0.028);
  const skullSfx = () => tone("sawtooth", 220, 120, 0.10, 0.02);
  const cashoutSfx = () => {
    tone("sine", 820, 980, 0.06, 0.03);
    setTimeout(()=>tone("sine", 980, 1180, 0.06, 0.028), 70);
    setTimeout(()=>tone("sine", 1180, 1380, 0.06, 0.026), 140);
  };

  // ===== INIT =====
  function init() {
    renderBalance();
    setSoundUI();

    betInput.value = String(bet);

    resetBoard();
    buildGrid();
    renderXScale();
    setModeUI();
    setStatus("Ожидание");
    updateNumbers();

    // Events
    tabNormal.addEventListener("click", () => switchMode(MODE.NORMAL));
    tabHard.addEventListener("click", () => switchMode(MODE.HARD));

    betMinus.addEventListener("click", () => { setBet(bet - 10); clickSfx(); });
    betPlus.addEventListener("click", () => { setBet(bet + 10); clickSfx(); });

    betInput.addEventListener("input", () => {
      const n = parseInt(String(betInput.value).replace(/\D/g, ""), 10);
      if (Number.isFinite(n)) bet = clamp(n, 10, 1_000_000);
      betInput.value = String(bet);
    });

    document.querySelectorAll(".chip").forEach((b) => {
      b.addEventListener("click", () => {
        const v = b.getAttribute("data-v");
        if (v === "MAX") setBet(balance);
        else setBet(parseInt(v, 10));
        clickSfx();
      });
    });

    btnBet.addEventListener("click", onBetClick);
    btnCashout.addEventListener("click", onCashout);

    soundBtn.addEventListener("click", () => {
      soundOn = !soundOn;
      saveSound(soundOn);
      setSoundUI();
      clickSfx();
    });

    modalOk.addEventListener("click", closeModal);
    modalBackdrop.addEventListener("click", closeModal);
  }

  // ===== MODE =====
  function setModeUI() {
    tabNormal.classList.toggle("is-active", mode === MODE.NORMAL);
    tabHard.classList.toggle("is-active", mode === MODE.HARD);

    towerMeta.textContent =
      mode === MODE.NORMAL
        ? "Обычный: 3 яйца / 1 череп"
        : "Сложный: 1 яйцо / 3 черепа";
  }

  function switchMode(next) {
    if (mode === next) return;
    if (inGame) {
      showModal("Режим", "Нельзя менять режим во время игры. Сначала заверши раунд.");
      return;
    }
    mode = next;
    setModeUI();
    resetBoard();
    buildGrid();
    renderXScale();
    updateNumbers();
    clickSfx();
  }

  function getMultArr() {
    return mode === MODE.NORMAL ? MULT_NORMAL : MULT_HARD;
  }

  // ===== BOARD =====
  function resetBoard() {
    board = [];
    for (let r = 0; r < ROWS; r++) {
      const safe = new Set();
      if (mode === MODE.NORMAL) {
        const skullIndex = randInt(0, COLS - 1);
        for (let c = 0; c < COLS; c++) if (c !== skullIndex) safe.add(c);
      } else {
        const eggIndex = randInt(0, COLS - 1);
        safe.add(eggIndex);
      }
      board.push({ safe, revealed: new Set() });
    }

    inGame = false;
    lock = false;
    passedRows = 0;
    currentRow = 0;
    currentX = 1.0;

    btnCashout.disabled = true;
    btnBet.disabled = false;

    lastResultValue.textContent = "—";
    lastWinValue.textContent = "—";

    fxLayer.innerHTML = "";
  }

  // ===== GRID =====
  function buildGrid() {
    towerGrid.innerHTML = "";

    // render from top to bottom visually
    for (let visualRow = ROWS - 1; visualRow >= 0; visualRow--) {
      for (let c = 0; c < COLS; c++) {
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = "tile";
        tile.setAttribute("data-row", String(visualRow));
        tile.setAttribute("data-col", String(c));

        tile.innerHTML = `
          <div class="face front"><div class="frontHint"></div></div>
          <div class="face back"><div class="iconWrap"></div></div>
        `;

        tile.addEventListener("click", () => onTileClick(visualRow, c, tile));
        towerGrid.appendChild(tile);
      }
    }
    refreshActiveRow();
  }

  function refreshActiveRow() {
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

  // ===== X SCALE =====
  function renderXScale() {
    const arr = getMultArr();
    xScale.innerHTML = "";
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
    const nextRow = passedRows + 1;
    if (nextRow < 1 || nextRow > ROWS) return;
    const idx = ROWS - nextRow;
    if (rows[idx]) rows[idx].classList.add("is-active");
  }

  // ===== GAME =====
  function onBetClick() {
    if (inGame) return;

    bet = clamp(parseInt(String(betInput.value).replace(/\D/g, ""), 10) || 100, 10, 1_000_000);
    betInput.value = String(bet);

    if (bet > balance) {
      showModal("Недостаточно средств", "Баланс меньше ставки.");
      skullSfx();
      return;
    }

    balance -= bet;
    saveBalance(balance);
    renderBalance();

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
    refreshActiveRow();

    betSfx();
  }

  async function onTileClick(r, c, tileEl) {
    if (!inGame || lock) return;
    if (r !== currentRow) return;

    const rowData = board[r];
    if (rowData.revealed.has(c)) return;

    lock = true;
    refreshActiveRow();

    tileEl.classList.add("pop");
    setTimeout(() => tileEl.classList.remove("pop"), 220);

    rowData.revealed.add(c);

    const safe = rowData.safe.has(c);

    // дуга “как на стейке”
    spawnArcFX(tileEl, safe ? "egg" : "skull");

    // reveal selected
    reveal(tileEl, safe ? "egg" : "skull");

    if (safe) {
      eggSfx();

      passedRows += 1;
      currentX = getMultArr()[passedRows - 1];

      btnCashout.disabled = false;
      setStatus(`Ряд пройден (${passedRows}/${ROWS})`);
      updateNumbers();
      markActiveXRow();

      await sleep(320);

      if (passedRows >= ROWS) {
        await sleep(240);
        doCashout(true);
        return;
      }

      currentRow += 1;
      lock = false;
      refreshActiveRow();
      return;
    }

    // LOSE
    skullSfx();

    revealRow(r);
    await sleep(520);

    inGame = false;
    btnCashout.disabled = true;
    btnBet.disabled = false;

    setStatus("Поражение");
    updateNumbers();

    lastResultValue.textContent = "Череп";
    lastWinValue.textContent = "0 ₽";

    showModal("Итог", `Череп! Ставка ${fmtMoney(bet)} сгорела.`);

    lock = false;
    refreshActiveRow();
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

    revealRow(currentRow);

    showModal(
      "Итог",
      autoTop
        ? `Вершина! Авто-кэшаут: x${currentX.toFixed(2)}. Выигрыш: ${fmtMoney(win)}.`
        : `Кэшаут: x${currentX.toFixed(2)}. Выигрыш: ${fmtMoney(win)}.`
    );

    cashoutSfx();
    refreshActiveRow();
  }

  // ===== REVEAL =====
  function reveal(tileEl, type) {
    tileEl.classList.add("revealed", type);
    const wrap = tileEl.querySelector(".iconWrap");
    if (!wrap) return;
    wrap.innerHTML = type === "egg" ? EggSVG : SkullSVG;
  }

  function revealRow(r) {
    const tiles = towerGrid.querySelectorAll(`.tile[data-row="${r}"]`);
    const rowData = board[r];
    tiles.forEach((t) => {
      if (t.classList.contains("revealed")) return;
      const c = parseInt(t.getAttribute("data-col"), 10);
      const safe = rowData.safe.has(c);
      reveal(t, safe ? "egg" : "skull");
    });
  }

  // ===== FX ARC (duga egg/skull) =====
  function spawnArcFX(tileEl, type) {
    const rectTile = tileEl.getBoundingClientRect();
    const rectBoard = towerGrid.getBoundingClientRect();

    // позиция относительно board/grid
    const x = rectTile.left - rectBoard.left + rectTile.width / 2;
    const y = rectTile.top - rectBoard.top + rectTile.height / 2;

    const el = document.createElement("div");
    el.className = "fxItem " + (Math.random() < 0.5 ? "arcL" : "arcR");
    el.style.left = `${x - 22}px`;
    el.style.top = `${y - 22}px`;
    el.innerHTML = (type === "egg") ? EggSVG : SkullSVG;

    fxLayer.appendChild(el);
    setTimeout(() => el.remove(), 720);
  }

  // ===== UI =====
  function setStatus(t) { statusValue.textContent = t; }

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

  // ===== MODAL =====
  function showModal(title, text) {
    modalTitle.textContent = title;
    modalText.textContent = text;
    modal.classList.remove("hidden");
  }

  function closeModal() {
    modal.classList.add("hidden");
    // после итога: новый раунд, но режим сохраняем
    resetBoard();
    buildGrid();
    renderXScale();
    setModeUI();
    setStatus("Ожидание");
    updateNumbers();
  }

  // ===== STORAGE =====
  function loadBalance() {
    const raw = localStorage.getItem(LS_BAL);
    const n = raw ? parseInt(raw, 10) : 1000;
    return Number.isFinite(n) && n >= 0 ? n : 1000;
  }
  function saveBalance(v) { localStorage.setItem(LS_BAL, String(v)); }

  function loadSound() {
    const raw = localStorage.getItem(LS_SOUND);
    if (raw === null) return true;
    return raw === "1";
  }
  function saveSound(v) { localStorage.setItem(LS_SOUND, v ? "1" : "0"); }

  // ===== UTIL =====
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function fmtMoney(v) { return `${Math.floor(v).toLocaleString("ru-RU")} ₽`; }
  function setBet(v) {
    bet = clamp(v, 10, 1_000_000);
    betInput.value = String(bet);
  }

  // ===== START =====
  init();
})();
