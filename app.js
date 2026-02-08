/* =========================
   Dragon Tower — app.js (WORKING)
   - ставка 100% запускает раунд
   - 2 режима: normal (3 safe), hard (1 safe)
   - честный RNG, фикс кликов
   - кэшаут считает payout = bet * currentX
   - модалка не залипает
   - декор (мини-башни) не перекрывает клики (CSS z-index уже)
   - тихие звуки + toggle
   ========================= */

(() => {
  "use strict";

  /* ---------- helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtRub = (n) => `${Math.max(0, Math.floor(n))} ₽`;
  const fmtX = (x) => `x${Number(x).toFixed(2)}`;

  /* ---------- DOM ---------- */
  const el = {
    modeNormal: $("modeNormal"),
    modeHard: $("modeHard"),
    towerHint: $("towerHint"),

    betInput: $("betInput"),
    betMinus: $("betMinus"),
    betPlus: $("betPlus"),
    chipMax: $("chipMax"),

    btnBet: $("btnBet"),
    btnCashout: $("btnCashout"),

    board: $("board"),
    xList: $("xList"),

    stStatus: $("stStatus"),
    stX: $("stX"),
    stPotential: $("stPotential"),

    rsLast: $("rsLast"),
    rsWin: $("rsWin"),

    balanceValue: $("balanceValue"),

    soundToggle: $("soundToggle"),

    modal: $("modal"),
    modalBackdrop: $("modalBackdrop"),
    modalText: $("modalText"),
    modalOk: $("modalOk"),
  };

  /* ---------- storage ---------- */
  const LS_BAL = "dt_balance_v2";
  const LS_SND = "dt_sound_v2";

  let balance = Number(localStorage.getItem(LS_BAL) ?? 1000);
  if (!Number.isFinite(balance) || balance < 0) balance = 1000;

  let soundOn = (localStorage.getItem(LS_SND) ?? "1") === "1";

  /* ---------- audio (quiet) ---------- */
  let ac = null;
  const ensureAudio = () => {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume().catch(() => {});
  };
  const tone = (f0, ms, type = "sine", gain = 0.03, f1 = null) => {
    if (!soundOn) return;
    try {
      ensureAudio();
      const t0 = ac.currentTime;

      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;

      o.frequency.setValueAtTime(f0, t0);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + ms / 1000);

      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);

      o.connect(g);
      g.connect(ac.destination);

      o.start(t0);
      o.stop(t0 + ms / 1000 + 0.02);
    } catch (_) {}
  };

  const sfx = {
    click: () => tone(520, 60, "triangle", 0.022, 420),
    start: () => tone(220, 140, "triangle", 0.028, 320),
    safe:  () => tone(440, 120, "triangle", 0.026, 660),
    cash:  () => { tone(330, 120, "triangle", 0.026, 520); setTimeout(() => tone(520, 120, "triangle", 0.026, 760), 85); },
    lose:  () => { tone(240, 170, "sawtooth", 0.022, 120); setTimeout(() => tone(120, 130, "sine", 0.02, 90), 90); },
  };

  /* ---------- game config ---------- */
  const COLS = 4;
  const ROWS = 9;

  const MODE = { NORMAL: "normal", HARD: "hard" };

  // ослабленный normal, чтобы не "дюпали"
  const MULT_NORMAL = [1.18, 1.36, 1.58, 1.86, 2.18, 2.56, 3.02, 3.58, 4.25];
  const MULT_HARD   = [1.55, 2.15, 3.00, 4.20, 5.90, 8.20, 11.40, 15.80, 22.00];

  /* ---------- state ---------- */
  let mode = MODE.NORMAL;

  let inRound = false;     // раунд идёт
  let betPlaced = false;   // ставка списана
  let bet = 100;

  let currentRow = 0;      // 0..ROWS-1 (играем снизу вверх)
  let currentX = 1.00;

  // trapsByRow[row] = Set(cols that are traps)
  let trapsByRow = [];

  // revealed keys "row,col"
  const revealed = new Set();

  /* ---------- UI ---------- */
  const setBalance = (v) => {
    balance = Math.max(0, Math.floor(v));
    localStorage.setItem(LS_BAL, String(balance));
    if (el.balanceValue) el.balanceValue.textContent = fmtRub(balance);
  };

  const setStatus = (t) => { if (el.stStatus) el.stStatus.textContent = t; };
  const setX = (x) => { if (el.stX) el.stX.textContent = fmtX(x); };

  const setPotential = () => {
    const pot = betPlaced ? Math.floor(bet * currentX) : 0;
    if (el.stPotential) el.stPotential.textContent = betPlaced ? fmtRub(pot) : "0 ₽";
  };

  const setResult = (last, win) => {
    if (el.rsLast) el.rsLast.textContent = last ?? "—";
    if (el.rsWin) el.rsWin.textContent = win ?? "—";
  };

  const setButtons = () => {
    if (el.btnBet) el.btnBet.disabled = betPlaced || inRound; // ставку можно только до старта
    if (el.btnCashout) el.btnCashout.disabled = !betPlaced || !inRound || currentRow === 0;
  };

  const getMults = () => (mode === MODE.HARD ? MULT_HARD : MULT_NORMAL);

  const setModeUI = () => {
    if (el.modeNormal) el.modeNormal.classList.toggle("is-active", mode === MODE.NORMAL);
    if (el.modeHard) el.modeHard.classList.toggle("is-active", mode === MODE.HARD);
    if (el.towerHint) {
      el.towerHint.textContent =
        mode === MODE.NORMAL
          ? "Обычный: 3 яйца / 1 ловушка в ряду"
          : "Сложный: 1 яйцо / 3 ловушки в ряду";
    }
  };

  const setSoundUI = () => {
    if (!el.soundToggle) return;
    el.soundToggle.setAttribute("aria-pressed", soundOn ? "true" : "false");
    const val = el.soundToggle.querySelector(".pill__value");
    if (val) val.textContent = soundOn ? "Звук: on" : "Звук: off";
  };

  /* ---------- modal (non-sticky) ---------- */
  const hideModal = () => {
    if (!el.modal) return;
    el.modal.classList.add("is-hidden");
    el.modal.setAttribute("aria-hidden", "true");
  };

  const showModal = (text) => {
    if (!el.modal) return;
    if (el.modalText) el.modalText.textContent = text;
    el.modal.classList.remove("is-hidden");
    el.modal.setAttribute("aria-hidden", "false");
  };

  /* ---------- build X list ---------- */
  const renderXList = () => {
    if (!el.xList) return;
    const mults = getMults();
    el.xList.innerHTML = "";
    // сверху ряд 9, снизу ряд 1
    for (let i = mults.length - 1; i >= 0; i--) {
      const rowNum = i + 1;
      const x = mults[i];
      const div = document.createElement("div");
      div.className = "xrow";
      div.dataset.rownum = String(rowNum);
      div.innerHTML = `<span class="muted">Ряд ${rowNum}</span><span class="strong">${fmtX(x)}</span>`;
      el.xList.appendChild(div);
    }
    updateXHighlight();
  };

  const updateXHighlight = () => {
    if (!el.xList) return;
    $$(".xrow", el.xList).forEach((n) => n.classList.remove("is-current"));
    if (!betPlaced || !inRound) return;

    // currentRow = какой ряд сейчас выбираем (0=1й ряд)
    // если currentRow==0 — пока не подсвечиваем
    const passed = currentRow; // сколько рядов пройдено
    if (passed <= 0) return;

    const rowNum = passed; // пройденный ряд = passed
    // find element
    const nodes = $$(".xrow", el.xList);
    // index from top: row9 at 0 => idx = ROWS - rowNum
    const idx = ROWS - rowNum;
    if (nodes[idx]) nodes[idx].classList.add("is-current");
  };

  /* ---------- board build ---------- */
  const buildBoard = () => {
    if (!el.board) return;
    el.board.innerHTML = "";
    el.board.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;

    // верхний ряд (visual) -> r=ROWS-1, нижний -> r=0
    for (let r = ROWS - 1; r >= 0; r--) {
      for (let c = 0; c < COLS; c++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "tile is-disabled";
        b.disabled = true;
        b.dataset.row = String(r);
        b.dataset.col = String(c);

        const shine = document.createElement("div");
        shine.className = "tile__shine";
        b.appendChild(shine);

        const rv = document.createElement("div");
        rv.className = "reveal";
        b.appendChild(rv);

        el.board.appendChild(b);
      }
    }
  };

  const keyOf = (r, c) => `${r},${c}`;

  const clearBoard = () => {
    revealed.clear();
    if (!el.board) return;
    $$(".tile", el.board).forEach((t) => {
      t.classList.remove("is-revealed", "is-active", "is-disabled");
      t.classList.add("is-disabled");
      t.disabled = true;
      const rv = $(".reveal", t);
      if (rv) {
        rv.className = "reveal";
        rv.innerHTML = "";
      }
    });
  };

  const enableRow = (row) => {
    if (!el.board) return;
    $$(".tile", el.board).forEach((t) => {
      const r = Number(t.dataset.row);
      const c = Number(t.dataset.col);
      const key = keyOf(r, c);
      const already = revealed.has(key);

      const active = inRound && betPlaced && r === row && !already;

      t.classList.toggle("is-active", active);
      t.classList.toggle("is-disabled", !active && !already);
      t.disabled = !active && !already;
    });
  };

  /* ---------- traps RNG ---------- */
  const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));

  const makeTraps = () => {
    trapsByRow = [];
    const safeCount = mode === MODE.NORMAL ? 3 : 1;
    const trapCount = COLS - safeCount;

    for (let r = 0; r < ROWS; r++) {
      const cols = [0,1,2,3];
      for (let i = cols.length - 1; i > 0; i--) {
        const j = randInt(0, i);
        [cols[i], cols[j]] = [cols[j], cols[i]];
      }
      trapsByRow[r] = new Set(cols.slice(0, trapCount));
    }
  };

  const isTrap = (row, col) => trapsByRow[row]?.has(col);

  /* ---------- gameplay ---------- */
  const resetRound = () => {
    inRound = false;
    betPlaced = false;
    currentRow = 0;
    currentX = 1.0;

    makeTraps();
    clearBoard();

    setStatus("Ожидание");
    setX(1.0);
    setPotential();
    setResult("—", "—");
    setButtons();
    updateXHighlight();
  };

  const readBet = () => {
    let v = String(el.betInput?.value ?? "").trim();
    v = v.replace(/[^\d]/g, "");
    let n = Math.floor(Number(v || 0));
    if (!Number.isFinite(n) || n < 1) n = 1;
    n = clamp(n, 1, Math.max(1, balance)); // нельзя больше баланса
    bet = n;
    if (el.betInput) el.betInput.value = String(n);
  };

  const startRound = () => {
    // ставка
    readBet();
    if (balance < bet) {
      showModal("Недостаточно баланса для ставки.");
      return;
    }

    setBalance(balance - bet);
    betPlaced = true;
    inRound = true;

    currentRow = 0;
    currentX = 1.0;

    setStatus("Игра");
    setX(currentX);
    setPotential();
    setResult("—", "—");

    // ре-рандом (чтобы каждый старт новый)
    makeTraps();
    clearBoard();

    enableRow(currentRow);
    setButtons();
    updateXHighlight();

    sfx.start();
  };

  const revealTile = (tile, trap) => {
    tile.classList.add("is-revealed");
    const rv = $(".reveal", tile);
    if (!rv) return;

    rv.innerHTML = `<div class="reveal__icon">${trap ? "💀" : "🥚"}</div>`;
    rv.classList.add(trap ? "reveal--trap" : "reveal--egg");
  };

  const revealRow = (row) => {
    // показать весь ряд (ощущение честности)
    $$(".tile", el.board).forEach((t) => {
      const r = Number(t.dataset.row);
      if (r !== row) return;
      const c = Number(t.dataset.col);
      const k = keyOf(r, c);
      if (revealed.has(k)) return;

      revealed.add(k);
      t.disabled = true;
      t.classList.remove("is-active");
      t.classList.add("is-disabled");
      revealTile(t, isTrap(row, c));
    });
  };

  const lose = () => {
    inRound = false;
    setStatus("Поражение");
    setButtons();
    updateXHighlight();
    setPotential();
    setResult("Ловушка 💀", "0 ₽");
    sfx.lose();
    showModal("Попался на ловушку. Ставка сгорела.");
  };

  const cashout = (auto = false) => {
    inRound = false;

    const win = Math.floor(bet * currentX);
    setBalance(balance + win);

    setStatus("Кэшаут");
    setButtons();
    updateXHighlight();
    setPotential();

    setResult(auto ? "Финиш ✅" : `Кэшаут ${fmtX(currentX)}`, fmtRub(win));
    sfx.cash();

    showModal(`Ты забрал: ${fmtRub(win)} (${fmtX(currentX)}).`);
  };

  const winStep = () => {
    const mults = getMults();

    // обновляем X на основе текущего пройденного ряда
    currentX = mults[currentRow]; // currentRow 0 => row1 multiplier
    setX(currentX);
    setPotential();

    currentRow += 1; // переходим на следующий ряд

    updateXHighlight();

    // авто финиш
    if (currentRow >= ROWS) {
      cashout(true);
      return;
    }

    // активируем следующий ряд
    enableRow(currentRow);
    setButtons();
    sfx.safe();
  };

  /* ---------- events ---------- */
  const bind = () => {
    // sound
    if (el.soundToggle) {
      el.soundToggle.addEventListener("click", () => {
        soundOn = !soundOn;
        localStorage.setItem(LS_SND, soundOn ? "1" : "0");
        setSoundUI();
        if (soundOn) sfx.click();
      });
    }

    // mode
    if (el.modeNormal) {
      el.modeNormal.addEventListener("click", () => {
        if (betPlaced) return;
        mode = MODE.NORMAL;
        setModeUI();
        renderXList();
        resetRound();
        sfx.click();
      });
    }
    if (el.modeHard) {
      el.modeHard.addEventListener("click", () => {
        if (betPlaced) return;
        mode = MODE.HARD;
        setModeUI();
        renderXList();
        resetRound();
        sfx.click();
      });
    }

    // bet controls
    if (el.betMinus) el.betMinus.addEventListener("click", () => {
      sfx.click();
      readBet();
      bet = Math.max(1, bet - 10);
      if (el.betInput) el.betInput.value = String(bet);
    });
    if (el.betPlus) el.betPlus.addEventListener("click", () => {
      sfx.click();
      readBet();
      bet = Math.min(balance, bet + 10);
      if (el.betInput) el.betInput.value = String(bet);
    });

    $$(".chip").forEach((b) => {
      b.addEventListener("click", () => {
        sfx.click();
        if (b.id === "chipMax") {
          bet = Math.max(1, balance);
          if (el.betInput) el.betInput.value = String(bet);
          return;
        }
        const add = Number(b.dataset.chip || 0);
        readBet();
        bet = clamp(bet + add, 1, balance);
        if (el.betInput) el.betInput.value = String(bet);
      });
    });

    if (el.betInput) {
      el.betInput.addEventListener("input", () => readBet());
      el.betInput.addEventListener("focus", () => {
        // на мобилках чтобы было удобнее
        if (el.betInput.value === "0") el.betInput.value = "";
      });
    }

    // start / cashout
    if (el.btnBet) el.btnBet.addEventListener("click", () => {
      // первая интеракция — разблокируем AudioContext
      ensureAudio();
      sfx.click();
      if (!betPlaced && !inRound) startRound();
    });

    if (el.btnCashout) el.btnCashout.addEventListener("click", () => {
      ensureAudio();
      sfx.click();
      if (betPlaced && inRound && currentRow > 0) cashout(false);
    });

    // board click (delegation)
    if (el.board) {
      el.board.addEventListener("click", (e) => {
        const tile = e.target.closest(".tile");
        if (!tile) return;

        ensureAudio();

        if (!betPlaced || !inRound) return;
        if (tile.disabled) return;

        const r = Number(tile.dataset.row);
        const c = Number(tile.dataset.col);

        // только текущий ряд
        if (r !== currentRow) return;

        sfx.click();

        const k = keyOf(r, c);
        if (revealed.has(k)) return;

        revealed.add(k);
        tile.disabled = true;
        tile.classList.remove("is-active");

        const trap = isTrap(r, c);
        revealTile(tile, trap);

        // показать весь ряд немного позже
        setTimeout(() => revealRow(r), 120);

        if (trap) {
          setTimeout(() => lose(), 260);
        } else {
          setTimeout(() => winStep(), 240);
        }
      });
    }

    // modal
    if (el.modalOk) el.modalOk.addEventListener("click", () => hideModal());
    if (el.modalBackdrop) el.modalBackdrop.addEventListener("click", () => hideModal());
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideModal();
    });
  };

  /* ---------- init ---------- */
  const init = () => {
    setBalance(balance);
    setSoundUI();
    setModeUI();

    hideModal();          // важно: чтобы "итог" не висел сверху
    buildBoard();
    makeTraps();
    renderXList();

    // default bet
    if (el.betInput) el.betInput.value = String(bet);

    setStatus("Ожидание");
    setX(1.0);
    setPotential();
    setResult("—", "—");
    setButtons();

    bind();
  };

  init();
})();
