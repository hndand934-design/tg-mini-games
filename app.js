/* =========================
   Dragon Tower — app.js
   (финал: клики работают, модалка не залипает,
   X-скейл без "ползунка", 2 режима, честный RNG,
   математика в "Обычном" ослаблена, звук (тихий) + toggle)
   ========================= */

(() => {
  "use strict";

  /* ---------- DOM helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtRub = (n) => `${Math.max(0, Math.floor(n))} ₽`;
  const fmtX = (x) => `x${Number(x).toFixed(2)}`;

  /* ---------- Elements (ожидаемые id из index.html) ---------- */
  const el = {
    modeNormal: $("#modeNormal"),
    modeHard: $("#modeHard"),
    betInput: $("#betInput"),
    betMinus: $("#betMinus"),
    betPlus: $("#betPlus"),
    chips: $$("#betChips button[data-chip]"),
    chipMax: $("#chipMax"),

    btnBet: $("#btnBet"),
    btnCashout: $("#btnCashout"),

    board: $("#board"),
    dragonImg: $("#dragonImg"),
    dragonWrap: $("#dragonWrap"),

    xList: $("#xList"),

    status: $("#stStatus"),
    stX: $("#stX"),
    stPotential: $("#stPotential"),

    rsLast: $("#rsLast"),
    rsWin: $("#rsWin"),

    balance: $("#balanceValue"),

    soundToggle: $("#soundToggle"),

    // Modal
    modal: $("#modal"),
    modalText: $("#modalText"),
    modalOk: $("#modalOk"),
    modalBackdrop: $("#modalBackdrop"),
  };

  /* ---------- Safe guards ---------- */
  const must = [
    "modeNormal",
    "modeHard",
    "betInput",
    "btnBet",
    "btnCashout",
    "board",
    "xList",
    "balance",
    "soundToggle",
    "modal",
    "modalOk",
    "modalBackdrop",
  ];

  const missing = must.filter((k) => !el[k]);
  if (missing.length) {
    console.warn("[DragonTower] Missing elements:", missing);
  }

  /* ---------- Settings / Storage ---------- */
  const LS_BAL = "dt_balance_v1";
  const LS_SND = "dt_sound_v1";

  let balance = Number(localStorage.getItem(LS_BAL) ?? 1000);
  if (!Number.isFinite(balance) || balance < 0) balance = 1000;

  let soundOn = (localStorage.getItem(LS_SND) ?? "1") === "1";

  /* ---------- Audio (тихий) ---------- */
  let audioCtx = null;
  const ensureAudio = () => {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  };

  const playTone = (freq, durMs, type = "sine", gain = 0.04, glideTo = null) => {
    if (!soundOn) return;
    try {
      ensureAudio();
      const t0 = audioCtx.currentTime;

      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (glideTo) {
        osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + durMs / 1000);
      }

      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToToTime
      // Safe fade out:
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);

      osc.connect(g);
      g.connect(audioCtx.destination);

      osc.start(t0);
      osc.stop(t0 + durMs / 1000 + 0.02);
    } catch (_) {}
  };

  // Более приятные короткие сигналы
  const sfx = {
    start: () => playTone(220, 140, "triangle", 0.035, 320),
    click: () => playTone(520, 70, "sine", 0.03, 420),
    safe: () => playTone(440, 120, "triangle", 0.035, 660),
    lose: () => {
      playTone(240, 180, "sawtooth", 0.03, 120);
      setTimeout(() => playTone(120, 140, "sine", 0.025, 90), 90);
    },
    cashout: () => {
      playTone(330, 120, "triangle", 0.03, 520);
      setTimeout(() => playTone(520, 120, "triangle", 0.03, 760), 90);
    },
  };

  /* ---------- Game config ---------- */
  const COLS = 4;
  const ROWS = 9;

  // Мультипликаторы (ОБЫЧНЫЙ слегка занижен, чтобы не "дюпали")
  const MULT_NORMAL = [1.18, 1.36, 1.58, 1.86, 2.18, 2.56, 3.02, 3.58, 4.25];
  const MULT_HARD = [1.55, 2.15, 3.00, 4.20, 5.90, 8.20, 11.40, 15.80, 22.00];

  const MODE = {
    NORMAL: "normal", // 3 safe / 1 trap
    HARD: "hard",     // 1 safe / 3 trap
  };

  /* ---------- State ---------- */
  let mode = MODE.NORMAL;
  let bet = 100;

  let inRound = false;
  let started = false;   // ставка списана
  let currentRow = 0;    // 0 = нижний ряд, идём вверх
  let currentX = 1.0;
  let trapsByRow = [];   // array of Set(cols)
  let revealed = new Set(); // "r,c"

  /* ---------- UI ---------- */
  const setBalance = (v) => {
    balance = Math.max(0, Math.floor(v));
    localStorage.setItem(LS_BAL, String(balance));
    if (el.balance) el.balance.textContent = fmtRub(balance);
  };

  const setSoundUI = () => {
    if (!el.soundToggle) return;
    el.soundToggle.setAttribute("aria-pressed", soundOn ? "true" : "false");
    const label = el.soundToggle.querySelector(".pill__value");
    if (label) label.textContent = soundOn ? "Звук: on" : "Звук: off";
  };

  const setModeUI = () => {
    if (el.modeNormal) el.modeNormal.classList.toggle("is-active", mode === MODE.NORMAL);
    if (el.modeHard) el.modeHard.classList.toggle("is-active", mode === MODE.HARD);

    const hint = $("#towerHint");
    if (hint) {
      hint.textContent =
        mode === MODE.NORMAL
          ? "Обычный: 3 яйца / 1 ловушка в ряду"
          : "Сложный: 1 яйцо / 3 ловушки в ряду";
    }
  };

  const getMults = () => (mode === MODE.NORMAL ? MULT_NORMAL : MULT_HARD);

  const updateStatus = (text) => {
    if (el.status) el.status.textContent = text;
  };

  const updateXPotential = () => {
    const pot = started ? Math.floor(bet * currentX) : 0;
    if (el.stX) el.stX.textContent = fmtX(currentX);
    if (el.stPotential) el.stPotential.textContent = started ? fmtRub(pot) : "0 ₽";
  };

  const updateResult = (last, win) => {
    if (el.rsLast) el.rsLast.textContent = last ?? "—";
    if (el.rsWin) el.rsWin.textContent = win ?? "—";
  };

  const setButtons = () => {
    if (el.btnBet) el.btnBet.disabled = inRound || started; // ставку можно только до старта
    if (el.btnCashout) el.btnCashout.disabled = !started || !inRound || currentRow === 0; // после 1 победы
  };

  /* ---------- Modal (НЕ залипает) ---------- */
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

    // Гарантируем кликабельность
    if (el.modalOk) el.modalOk.disabled = false;
  };

  /* ---------- Board build ---------- */
  const buildBoard = () => {
    if (!el.board) return;
    el.board.innerHTML = "";
    el.board.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;

    // делаем 9 рядов по 4 плитки; визуально: верхний ряд - ROWS, нижний - 1
    for (let r = ROWS - 1; r >= 0; r--) {
      for (let c = 0; c < COLS; c++) {
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = "tile";
        tile.dataset.row = String(r); // 0..8 (0 снизу)
        tile.dataset.col = String(c);
        tile.setAttribute("aria-label", `Ряд ${r + 1}, плитка ${c + 1}`);

        // Shine layer
        const shine = document.createElement("div");
        shine.className = "tile__shine";
        tile.appendChild(shine);

        // Reveal layer
        const reveal = document.createElement("div");
        reveal.className = "reveal";
        tile.appendChild(reveal);

        el.board.appendChild(tile);
      }
    }
  };

  const clearBoardState = () => {
    revealed.clear();
    $$(".tile", el.board).forEach((t) => {
      t.classList.remove("is-revealed", "is-disabled", "is-active");
      const rv = $(".reveal", t);
      if (rv) {
        rv.className = "reveal";
        rv.innerHTML = "";
      }
    });
  };

  const setActiveRowUI = () => {
    if (!el.board) return;
    const tiles = $$(".tile", el.board);
    tiles.forEach((t) => {
      const r = Number(t.dataset.row);
      const key = `${r},${t.dataset.col}`;
      const already = revealed.has(key);

      // активен только текущий ряд и только если игра идёт
      const active = inRound && started && r === currentRow && !already;

      t.classList.toggle("is-active", active);
      t.classList.toggle("is-disabled", !active && !already && started); // чтобы видно было, что нельзя
      t.disabled = !active && !already;
    });
  };

  /* ---------- X list ---------- */
  const renderXList = () => {
    if (!el.xList) return;
    const mults = getMults();

    // top row shows highest multiplier
    el.xList.innerHTML = "";
    for (let i = mults.length - 1; i >= 0; i--) {
      const rowNum = i + 1;
      const x = mults[i];

      const row = document.createElement("div");
      row.className = "xrow";
      row.innerHTML = `
        <div class="xrow__k">Ряд ${rowNum}</div>
        <div class="xrow__v">${fmtX(x)}</div>
      `;
      el.xList.appendChild(row);
    }
    updateXListCurrent();
  };

  const updateXListCurrent = () => {
    if (!el.xList) return;
    const mults = getMults();
    const rows = $$(".xrow", el.xList);

    // rows are rendered from top (row 9) to bottom (row 1)
    rows.forEach((node) => node.classList.remove("is-current"));

    if (!started || !inRound) return;

    // currentRow is 0-based from bottom, so current "target multiplier" would be mults[currentRow] after you pass it
    // highlight next row if you win this row, but also feels nicer to highlight current step:
    // currentX corresponds to last passed row multiplier (or 1.0 at start)
    const passed = clamp(currentRow, 0, ROWS); // currentRow means next to play, so passed = currentRow
    const highlightRowNum = clamp(passed, 0, ROWS); // 0..9

    // if passed=0 => no highlight
    if (highlightRowNum === 0) return;

    // Find in list where rowNum == highlightRowNum
    // list nodes: index 0 = row9
    const idxFromTop = ROWS - highlightRowNum;
    const node = rows[idxFromTop];
    if (node) node.classList.add("is-current");
  };

  /* ---------- RNG traps ---------- */
  const randomInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));

  const makeTraps = () => {
    trapsByRow = [];
    const safeCount = mode === MODE.NORMAL ? 3 : 1;
    const trapCount = COLS - safeCount;

    for (let r = 0; r < ROWS; r++) {
      const cols = [...Array(COLS).keys()];
      // shuffle
      for (let i = cols.length - 1; i > 0; i--) {
        const j = randomInt(0, i);
        [cols[i], cols[j]] = [cols[j], cols[i]];
      }
      const traps = new Set(cols.slice(0, trapCount));
      trapsByRow.push(traps);
    }
  };

  /* ---------- Dragon decor image ---------- */
  const setDragon = () => {
    // IMPORTANT:
    // Положи PNG дракона в папку проекта рядом с index.html и назови: dragon.png
    // Тогда будет грузиться на GitHub Pages.
    if (!el.dragonImg) return;

    // Если юзер уже поменяет src в index — мы не трогаем.
    const already = el.dragonImg.getAttribute("src");
    if (already && already.trim() && !already.includes("broken")) return;

    el.dragonImg.src = "dragon.png";
    el.dragonImg.alt = "Dragon";

    // Fallback если dragon.png нет
    el.dragonImg.onerror = () => {
      // спрячем картинку, чтобы не было "битого" значка
      el.dragonImg.style.display = "none";

      // рисуем маленький SVG-логотип-дракон (вместо битой картинки)
      const fallback = $("#dragonFallback");
      if (fallback) {
        fallback.style.display = "block";
      } else if (el.dragonWrap) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 128 128");
        svg.setAttribute("width", "150");
        svg.setAttribute("height", "100");
        svg.style.display = "block";
        svg.style.margin = "0 auto";
        svg.style.opacity = "0.92";
        svg.innerHTML = `
          <path fill="rgba(233,238,252,.9)" d="M84 10c-12 4-20 14-22 28-1 8 2 14 6 19-7 2-13 8-14 17-1 10 6 19 18 21 7 1 13-1 18-5 2 9-2 18-11 27 20-6 33-21 34-41 0-13-5-23-14-30 2-3 3-6 3-10 0-12-7-21-18-26z"/>
          <path fill="rgba(64,122,255,.55)" d="M43 60c-8 6-13 13-14 22-2 19 12 34 34 36-7-5-11-10-12-16-4 2-8 3-13 2-9-2-14-9-13-17 1-7 6-12 18-15z"/>
        `;
        el.dragonWrap.appendChild(svg);
      }
    };
  };

  /* ---------- Round lifecycle ---------- */
  const resetRound = (keepBet = true) => {
    inRound = false;
    started = false;
    currentRow = 0;
    currentX = 1.0;
    makeTraps();
    clearBoardState();
    setActiveRowUI();

    updateStatus("Ожидание");
    updateXPotential();
    updateXListCurrent();
    updateResult("—", "—");

    if (!keepBet && el.betInput) el.betInput.value = "100";
    setButtons();
  };

  const startGame = () => {
    if (inRound || started) return;

    bet = Number(el.betInput?.value ?? bet);
    bet = Math.floor(bet);
    if (!Number.isFinite(bet) || bet <= 0) bet = 100;

    bet = clamp(bet, 1, balance);
    if (balance < bet) {
      showModal("Недостаточно баланса для ставки.");
      return;
    }

    // списываем 1 раз
    setBalance(balance - bet);
    started = true;
    inRound = true;
    currentRow = 0;
    currentX = 1.0;
    revealed.clear();
    clearBoardState();
    setActiveRowUI();
    updateStatus("Игра");
    updateXPotential();
    updateXListCurrent();
    updateResult("—", "—");
    setButtons();
    sfx.start();
  };

  const revealTile = (tile, isTrap) => {
    const rv = $(".reveal", tile);
    tile.classList.add("is-revealed");

    if (!rv) return;

    if (isTrap) {
      rv.classList.add("reveal--trap");
      rv.innerHTML = `<div class="reveal__icon">💀</div>`;
    } else {
      rv.classList.add("reveal--egg");
      rv.innerHTML = `<div class="reveal__icon">🥚</div>`;
    }
  };

  const revealWholeRow = (rowIdx) => {
    const rowTraps = trapsByRow[rowIdx] || new Set();
    $$(".tile", el.board).forEach((t) => {
      const r = Number(t.dataset.row);
      const c = Number(t.dataset.col);
      if (r !== rowIdx) return;

      const key = `${r},${c}`;
      if (revealed.has(key)) return;

      revealed.add(key);
      t.disabled = true;
      t.classList.remove("is-active");
      const isTrap = rowTraps.has(c);
      revealTile(t, isTrap);
    });
  };

  const endLose = () => {
    inRound = false;
    updateStatus("Поражение");
    setButtons();
    updateXListCurrent();
    updateResult("Ловушка 💀", "0 ₽");
    sfx.lose();

    // показать итог + сразу подготовка к новой игре
    showModal("Попался на ловушку. Ставка сгорела.");
  };

  const endCashout = (auto = false) => {
    inRound = false;
    const win = Math.floor(bet * currentX);
    setBalance(balance + win);

    updateStatus("Кэшаут");
    updateXPotential();
    setButtons();
    updateXListCurrent();
    updateResult(auto ? "Финиш ✅" : `Кэшаут ${fmtX(currentX)}`, fmtRub(win));
    sfx.cashout();

    // маленькая "анимация" дракона (класс — можно допилить в css при желании)
    if (el.dragonWrap) {
      el.dragonWrap.classList.remove("dragon-pop");
      // restart animation
      void el.dragonWrap.offsetWidth;
      el.dragonWrap.classList.add("dragon-pop");
      setTimeout(() => el.dragonWrap.classList.remove("dragon-pop"), 650);
    }

    showModal(`Ты забрал: ${fmtRub(win)} (${fmtX(currentX)}).`);
  };

  const stepWin = () => {
    // игрок прошёл текущий ряд => увеличиваем X и двигаемся вверх
    const mults = getMults();
    currentX = mults[currentRow]; // row 0 -> x for row1, etc.
    currentRow += 1;

    updateXPotential();
    updateXListCurrent();
    sfx.safe();

    if (currentRow >= ROWS) {
      // прошёл всё
      endCashout(true);
      return;
    }

    // следующий ряд активен
    setActiveRowUI();
  };

  /* ---------- Events ---------- */
  const bindEvents = () => {
    // Sound toggle
    if (el.soundToggle) {
      el.soundToggle.addEventListener("click", () => {
        soundOn = !soundOn;
        localStorage.setItem(LS_SND, soundOn ? "1" : "0");
        setSoundUI();
        if (soundOn) sfx.click();
      });
    }

    // Mode tabs
    if (el.modeNormal) {
      el.modeNormal.addEventListener("click", () => {
        if (started) return; // нельзя менять во время игры
        mode = MODE.NORMAL;
        setModeUI();
        renderXList();
        resetRound(true);
      });
    }
    if (el.modeHard) {
      el.modeHard.addEventListener("click", () => {
        if (started) return;
        mode = MODE.HARD;
        setModeUI();
        renderXList();
        resetRound(true);
      });
    }

    // Bet controls
    if (el.betMinus) el.betMinus.addEventListener("click", () => {
      sfx.click();
      let v = Math.floor(Number(el.betInput?.value ?? bet) || bet);
      v = Math.max(1, v - 10);
      if (el.betInput) el.betInput.value = String(v);
    });

    if (el.betPlus) el.betPlus.addEventListener("click", () => {
      sfx.click();
      let v = Math.floor(Number(el.betInput?.value ?? bet) || bet);
      v = Math.min(balance, v + 10);
      if (el.betInput) el.betInput.value = String(v);
    });

    if (el.chips?.length) {
      el.chips.forEach((b) => {
        b.addEventListener("click", () => {
          sfx.click();
          const add = Number(b.dataset.chip);
          let v = Math.floor(Number(el.betInput?.value ?? bet) || bet);
          v = Math.min(balance, v + add);
          if (el.betInput) el.betInput.value = String(v);
        });
      });
    }

    if (el.chipMax) {
      el.chipMax.addEventListener("click", () => {
        sfx.click();
        if (el.betInput) el.betInput.value = String(Math.max(1, balance));
      });
    }

    if (el.betInput) {
      el.betInput.addEventListener("input", () => {
        let v = Math.floor(Number(el.betInput.value) || 0);
        if (!Number.isFinite(v)) v = 0;
        v = clamp(v, 0, balance);
        el.betInput.value = v ? String(v) : "";
      });
    }

    // Start bet
    if (el.btnBet) {
      el.btnBet.addEventListener("click", () => startGame());
    }

    // Cashout
    if (el.btnCashout) {
      el.btnCashout.addEventListener("click", () => {
        if (!started || !inRound || currentRow === 0) return;
        endCashout(false);
      });
    }

    // Board click (delegation)
    if (el.board) {
      el.board.addEventListener("click", (e) => {
        const tile = e.target.closest(".tile");
        if (!tile) return;

        // ensure audio on first user gesture (browser policy)
        ensureAudio();

        const r = Number(tile.dataset.row);
        const c = Number(tile.dataset.col);
        const key = `${r},${c}`;

        // only current active
        if (!inRound || !started) return;
        if (r !== currentRow) return;
        if (revealed.has(key)) return;
        if (tile.disabled) return;

        sfx.click();

        revealed.add(key);
        tile.disabled = true;
        tile.classList.remove("is-active");

        const isTrap = (trapsByRow[r] || new Set()).has(c);
        revealTile(tile, isTrap);

        // показать остальное в ряду для ощущения "честности"
        setTimeout(() => revealWholeRow(r), 140);

        if (isTrap) {
          setTimeout(endLose, 280);
        } else {
          // win row
          setTimeout(stepWin, 260);
        }
      });
    }

    // Modal close
    if (el.modalOk) el.modalOk.addEventListener("click", () => hideModal());
    if (el.modalBackdrop) el.modalBackdrop.addEventListener("click", () => hideModal());

    // ESC closes modal
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideModal();
    });
  };

  /* ---------- Init ---------- */
  const init = () => {
    setBalance(balance);
    setSoundUI();
    setModeUI();

    // ВАЖНО: прячем модалку на старте — чтобы не было "Итог" поверх экрана
    hideModal();

    // Board + traps + list
    buildBoard();
    makeTraps();
    renderXList();
    setDragon();

    // default bet
    if (el.betInput) el.betInput.value = String(bet);

    updateStatus("Ожидание");
    updateXPotential();
    setButtons();

    // фикс: иногда поверх кликов бывает случайный слой — убедимся, что board вверху внутри stage
    if (el.board) el.board.style.position = "relative";

    bindEvents();
  };

  init();
})();

