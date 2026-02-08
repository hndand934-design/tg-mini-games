/* =========================
   Dragon Tower — app.js (FINAL)
   Фиксы:
   1) Башни не мешают — это в CSS (pointer-events:none + размер)
   2) На плитках видно ЯЙЦО/ЛОВУШКУ после клика (классы is-egg / is-trap + mark)
   3) Кнопки/ставка работают чётко
   4) Модалка "Итог" не залипает (ок кликается + закрытие по backdrop/ESC)
   5) Шкала X: без лишних "ползунков" (скролл обычный — в CSS)
   6) Баланс localStorage
   ========================= */

(() => {
  // ---------- helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const r2 = (n) => Math.round(n * 100) / 100;
  const fmt = (n) => `${Math.max(0, Math.floor(n))} ₽`;

  // ---------- storage ----------
  const LS_BAL = "dt_balance_v1";
  const LS_SND = "dt_sound_v1";

  // ---------- DOM (ожидаемые id из индекса) ----------
  const el = {
    balance: $("#balanceValue"),
    soundBtn: $("#soundBtn"),
    soundDot: $("#soundDot"),

    tabNormal: $("#tabNormal"),
    tabHard: $("#tabHard"),

    betInput: $("#betInput"),
    betMinus: $("#betMinus"),
    betPlus: $("#betPlus"),
    chips: $$(".chip"),

    btnBet: $("#btnBet"),
    btnCashout: $("#btnCashout"),

    status: $("#statusValue"),
    curX: $("#curXValue"),
    potential: $("#potentialValue"),

    towerMeta: $("#towerMeta"),
    towerGrid: $("#towerGrid"),

    xScale: $("#xScale"),
    lastResult: $("#lastResultValue"),
    lastWin: $("#lastWinValue"),

    modal: $("#modal"),
    modalTitle: $("#modalTitle"),
    modalText: $("#modalText"),
    modalOk: $("#modalOk"),
    modalBackdrop: $("#modalBackdrop"),
  };

  // ---------- guard (если индексы чуть разные — покажем в консоли) ----------
  const required = Object.entries(el).filter(([k, v]) => v == null && !["chips"].includes(k));
  if (required.length) {
    console.warn("Dragon Tower: missing DOM nodes:", required.map(([k]) => k));
  }

  // ---------- audio (простые тихие сигналы) ----------
  let audioCtx = null;
  let soundOn = (localStorage.getItem(LS_SND) ?? "1") === "1";

  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  function beep({ freq = 440, dur = 0.06, type = "sine", gain = 0.05 } = {}) {
    if (!soundOn) return;
    ensureAudio();
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  function sClick() { beep({ freq: 520, dur: 0.05, type: "triangle", gain: 0.035 }); }
  function sWin() {
    beep({ freq: 660, dur: 0.06, type: "sine", gain: 0.05 });
    setTimeout(() => beep({ freq: 880, dur: 0.08, type: "sine", gain: 0.05 }), 70);
  }
  function sLose() {
    beep({ freq: 220, dur: 0.10, type: "sawtooth", gain: 0.035 });
    setTimeout(() => beep({ freq: 160, dur: 0.12, type: "sawtooth", gain: 0.03 }), 70);
  }

  function syncSoundUI() {
    if (!el.soundBtn) return;
    el.soundBtn.textContent = soundOn ? "Звук: on" : "Звук: off";
    if (el.soundDot) el.soundDot.style.opacity = soundOn ? "1" : ".35";
  }

  // ---------- game config ----------
  // 9 рядов, 4 плитки в ряду
  const ROWS = 9;
  const COLS = 4;

  // Вероятности:
  // normal: 3 яйца (safe) + 1 ловушка
  // hard:   1 яйцо + 3 ловушки
  const MODES = {
    normal: { name: "Обычный", safe: 3, trap: 1 },
    hard: { name: "Сложный", safe: 1, trap: 3 },
  };

  // Математика множителей (чуть "срезанная", чтобы меньше дюпа при 3 яйцах)
  // Мультипликатор растёт по рядам: baseFactor^(rowIndex)
  // baseFactor подбираем так, чтобы к верху было ~4.25x (как на твоём скрине)
  // Для normal делаем мягче.
  const MULT = {
    normal: { base: 1.17 }, // мягче
    hard: { base: 1.28 },   // жёстче/выше
  };

  // ---------- state ----------
  const state = {
    mode: "normal",
    balance: 1000,
    bet: 100,
    inRun: false,
    started: false,     // ставка списана
    row: 0,             // текущий ряд (0..ROWS-1)
    curX: 1.0,
    plan: [],           // [row] => { trapIdx:Set, safeIdx:Set }
    revealed: [],       // [row] => Set(clicked indices)
    last: { text: "—", win: "—" },
  };

  // ---------- init ----------
  function loadBalance() {
    const v = Number(localStorage.getItem(LS_BAL));
    state.balance = Number.isFinite(v) ? v : 1000;
    renderBalance();
  }
  function saveBalance() {
    localStorage.setItem(LS_BAL, String(state.balance));
  }
  function renderBalance() {
    if (el.balance) el.balance.textContent = fmt(state.balance);
  }

  function setMode(m) {
    state.mode = m;
    if (el.tabNormal) el.tabNormal.classList.toggle("is-active", m === "normal");
    if (el.tabHard) el.tabHard.classList.toggle("is-active", m === "hard");

    if (el.towerMeta) {
      const cfg = MODES[m];
      el.towerMeta.textContent = `${cfg.name}: ${cfg.safe} яйца / ${cfg.trap} ловушка в ряду`;
    }
    buildXScale();
    resetRoundUI(true);
  }

  function setBet(v) {
    state.bet = clamp(Math.floor(v || 0), 1, 1000000);
    if (el.betInput) el.betInput.value = state.bet;
  }

  // ---------- multipliers ----------
  function rowMultiplier(mode, rowPassed /*1..ROWS*/) {
    const base = MULT[mode].base;
    // x = base^rowPassed
    return r2(Math.pow(base, rowPassed));
  }

  function buildXScale() {
    if (!el.xScale) return;
    el.xScale.innerHTML = "";
    for (let r = ROWS; r >= 1; r--) {
      const x = rowMultiplier(state.mode, r);
      const row = document.createElement("div");
      row.className = "xRow";
      row.dataset.row = String(r);
      row.innerHTML = `<span>Ряд ${r}</span><b>x${x.toFixed(2)}</b>`;
      el.xScale.appendChild(row);
    }
    highlightXRow(0);
  }

  function highlightXRow(passedRows) {
    // passedRows: 0..ROWS
    if (!el.xScale) return;
    const rows = $$(".xRow");
    rows.forEach((n) => n.classList.remove("is-current"));
    const currentRowNumber = passedRows; // сколько пройдено
    // подсвечиваем следующий "целевой" ряд: currentRowNumber+1 (или последний пройденный)
    const target = clamp(currentRowNumber + 1, 1, ROWS);
    const node = rows.find((x) => Number(x.dataset.row) === target);
    if (node) node.classList.add("is-current");
  }

  // ---------- plan generation ----------
  function makePlan() {
    const cfg = MODES[state.mode];
    state.plan = [];
    state.revealed = [];
    for (let r = 0; r < ROWS; r++) {
      const indices = [...Array(COLS).keys()];
      // shuffle
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      const safeSet = new Set(indices.slice(0, cfg.safe));
      const trapSet = new Set(indices.slice(cfg.safe, cfg.safe + cfg.trap));
      state.plan.push({ safeSet, trapSet });
      state.revealed.push(new Set());
    }
  }

  // ---------- grid render ----------
  function buildGrid() {
    if (!el.towerGrid) return;
    el.towerGrid.innerHTML = "";

    // рисуем сверху вниз (ROW 0 снизу? на скрине снизу старт)
    // делаем ROW 0 = нижний ряд. Значит в DOM сначала верхние, потом нижние
    for (let r = ROWS - 1; r >= 0; r--) {
      for (let c = 0; c < COLS; c++) {
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = "tile";
        tile.dataset.row = String(r);
        tile.dataset.col = String(c);
        tile.innerHTML = `<span class="mark"></span>`;
        el.towerGrid.appendChild(tile);
      }
    }
    refreshActiveRow();
  }

  function refreshActiveRow() {
    if (!el.towerGrid) return;
    const tiles = $$(".tile");
    tiles.forEach((t) => {
      t.classList.remove("is-activeRow", "is-disabled");
      const r = Number(t.dataset.row);
      // доступен только текущий ряд и только если игра начата
      const enabled = state.inRun && r === state.row;
      if (!enabled) t.classList.add("is-disabled");
      if (enabled) t.classList.add("is-activeRow");
    });
  }

  // ---------- UI state ----------
  function resetRoundUI(keepBet = false) {
    state.inRun = false;
    state.started = false;
    state.row = 0;
    state.curX = 1.0;

    if (!keepBet) setBet(100);

    if (el.status) el.status.textContent = "Ожидание";
    if (el.curX) el.curX.textContent = "x1.00";
    if (el.potential) el.potential.textContent = fmt(0);
    if (el.lastResult) el.lastResult.textContent = state.last.text;
    if (el.lastWin) el.lastWin.textContent = state.last.win;

    if (el.btnBet) el.btnBet.disabled = false;
    if (el.btnCashout) el.btnCashout.disabled = true;

    makePlan();
    buildGrid();
  }

  function startRun() {
    // ставка списывается один раз на старте игры
    const b = state.bet;
    if (b <= 0) return showModal("Ошибка", "Ставка должна быть больше 0.");
    if (state.balance < b) return showModal("Недостаточно средств", "Попробуй уменьшить ставку.");

    state.balance -= b;
    saveBalance();
    renderBalance();

    state.inRun = true;
    state.started = true;
    state.row = 0;
    state.curX = 1.0;

    if (el.status) el.status.textContent = "Игра";
    if (el.curX) el.curX.textContent = "x1.00";
    if (el.potential) el.potential.textContent = fmt(0);

    if (el.btnBet) el.btnBet.disabled = true;
    if (el.btnCashout) el.btnCashout.disabled = true; // можно только после 1 победы

    highlightXRow(0);
    refreshActiveRow();
    sClick();
  }

  function updateAfterWin() {
    const passed = state.row + 1; // прошли этот ряд
    state.curX = rowMultiplier(state.mode, passed);

    if (el.curX) el.curX.textContent = `x${state.curX.toFixed(2)}`;
    const pot = Math.floor(state.bet * state.curX);
    if (el.potential) el.potential.textContent = fmt(pot);

    highlightXRow(passed);

    // cashout доступен после хотя бы одной победы
    if (el.btnCashout) el.btnCashout.disabled = false;

    // если достигли вершины — авто кэшаут
    if (passed >= ROWS) {
      cashout(true);
      return;
    }

    // следующий ряд
    state.row += 1;
    refreshActiveRow();
  }

  function revealRowAll(r) {
    // раскрыть весь ряд (после луз/кэшаут)
    if (!el.towerGrid) return;
    const tiles = $$(".tile").filter((t) => Number(t.dataset.row) === r);
    tiles.forEach((t) => {
      const col = Number(t.dataset.col);
      applyReveal(t, r, col);
    });
  }

  function applyReveal(tile, r, c) {
    tile.classList.add("revealed");
    const plan = state.plan[r];
    const mark = tile.querySelector(".mark");
    if (plan.safeSet.has(c)) {
      tile.classList.add("is-egg");
      tile.classList.remove("is-trap");
      if (mark) mark.textContent = ""; // emoji через CSS ::before
    } else {
      tile.classList.add("is-trap");
      tile.classList.remove("is-egg");
      if (mark) mark.textContent = "";
    }
  }

  function lose(r, clickedCol) {
    // показать весь текущий ряд
    revealRowAll(r);

    state.inRun = false;
    if (el.status) el.status.textContent = "Поражение";
    if (el.btnCashout) el.btnCashout.disabled = true;

    state.last = { text: "Ловушка 💀", win: fmt(0) };
    if (el.lastResult) el.lastResult.textContent = state.last.text;
    if (el.lastWin) el.lastWin.textContent = state.last.win;

    // ставка сгорела
    if (el.potential) el.potential.textContent = fmt(0);

    // вернуть возможность новой ставки
    if (el.btnBet) el.btnBet.disabled = false;

    refreshActiveRow();
    sLose();

    showModal("Итог", "Ловушка! Ставка сгорела. Попробуй ещё раз.");
  }

  function cashout(auto = false) {
    if (!state.started) return;
    const pot = Math.floor(state.bet * state.curX);
    state.balance += pot;
    saveBalance();
    renderBalance();

    state.inRun = false;

    if (el.status) el.status.textContent = auto ? "Финиш" : "Кэшаут";
    state.last = { text: `Кэшаут x${state.curX.toFixed(2)}`, win: fmt(pot) };
    if (el.lastResult) el.lastResult.textContent = state.last.text;
    if (el.lastWin) el.lastWin.textContent = state.last.win;

    if (el.btnBet) el.btnBet.disabled = false;
    if (el.btnCashout) el.btnCashout.disabled = true;

    // раскрыть текущий ряд для "красоты"
    // (если игра в процессе, покажем текущий активный ряд)
    if (state.row >= 0 && state.row < ROWS) revealRowAll(state.row);

    refreshActiveRow();
    sWin();

    showModal("Итог", `Ты забрал: ${fmt(pot)} (x${state.curX.toFixed(2)}).`);
  }

  // ---------- modal ----------
  function showModal(title, text) {
    if (!el.modal) return;
    el.modalTitle.textContent = title;
    el.modalText.textContent = text;
    el.modal.classList.remove("hidden");

    // фикс "залипания": гарантируем кликабельность кнопки
    // (если где-то был overlay — здесь мы не даём ему съесть клики)
    el.modal.style.pointerEvents = "auto";
  }
  function hideModal() {
    if (!el.modal) return;
    el.modal.classList.add("hidden");
  }

  // ---------- interactions ----------
  function onTileClick(e) {
    const tile = e.target.closest(".tile");
    if (!tile) return;
    if (!state.inRun) return;
    const r = Number(tile.dataset.row);
    const c = Number(tile.dataset.col);
    if (r !== state.row) return;

    // раскрыть выбранную
    applyReveal(tile, r, c);

    // если ловушка — луз
    if (state.plan[r].trapSet.has(c)) {
      lose(r, c);
      return;
    }

    // победа в ряду
    sClick();
    updateAfterWin();
  }

  function wireUI() {
    // sound toggle
    if (el.soundBtn) {
      el.soundBtn.addEventListener("click", async () => {
        soundOn = !soundOn;
        localStorage.setItem(LS_SND, soundOn ? "1" : "0");
        syncSoundUI();
        // короткий сигнал подтверждения (тихий)
        sClick();
        // iOS/Chrome — разблокировка аудио после клика
        try { ensureAudio(); await audioCtx.resume?.(); } catch {}
      });
    }

    // tabs
    if (el.tabNormal) el.tabNormal.addEventListener("click", () => { sClick(); setMode("normal"); });
    if (el.tabHard) el.tabHard.addEventListener("click", () => { sClick(); setMode("hard"); });

    // bet buttons
    if (el.betMinus) el.betMinus.addEventListener("click", () => { sClick(); setBet(state.bet - 10); });
    if (el.betPlus) el.betPlus.addEventListener("click", () => { sClick(); setBet(state.bet + 10); });

    if (el.betInput) {
      el.betInput.addEventListener("input", () => {
        // не ломаем ввод: только цифры
        const v = String(el.betInput.value).replace(/[^\d]/g, "");
        el.betInput.value = v;
        setBet(Number(v || 0));
      });
      el.betInput.addEventListener("blur", () => {
        if (!el.betInput.value) setBet(100);
      });
    }

    // chips
    el.chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const v = Number(chip.dataset.v);
        if (!Number.isFinite(v)) return;
        sClick();
        setBet(v);
      });
    });

    // actions
    if (el.btnBet) el.btnBet.addEventListener("click", () => startRun());
    if (el.btnCashout) el.btnCashout.addEventListener("click", () => cashout(false));

    // grid click
    if (el.towerGrid) el.towerGrid.addEventListener("click", onTileClick);

    // modal close
    if (el.modalOk) el.modalOk.addEventListener("click", () => hideModal());
    if (el.modalBackdrop) el.modalBackdrop.addEventListener("click", () => hideModal());
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.modal && !el.modal.classList.contains("hidden")) hideModal();
    });
  }

  // ---------- boot ----------
  function init() {
    loadBalance();
    syncSoundUI();
    setBet(100);
    setMode("normal");
    wireUI();
  }

  init();
})();
