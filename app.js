/* Penalty FINAL — app.js
   - 3x5 ворота
   - 2 сложности: Лёгкий / Сложный
   - Вратарь ловит ТОЛЬКО 2 соседние клетки (визуально не палится)
   - Усложнение: heatmap (память ударов), весовой выбор пары, рост "умности" по шагам
   - Серия: ON/OFF
   - Лестница X, кэш-аут, сброс, звук
   - localStorage кошелёк
*/

(() => {
  "use strict";

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const WALLET_KEY = "mini_wallet_penalty_v1";

  function loadWallet() {
    const raw = localStorage.getItem(WALLET_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? Math.floor(n) : 1000;
  }
  function saveWallet(v) {
    localStorage.setItem(WALLET_KEY, String(Math.floor(v)));
  }

  // честный RNG
  function rngInt(maxExclusive) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] % maxExclusive;
  }

  function formatMoney(n) {
    return `${Math.floor(n)} ₽`;
  }

  // ---------- audio (тихо, без лагов) ----------
  const audio = {
    enabled: true,
    ctx: null,
  };

  function ensureAudio() {
    if (!audio.ctx) audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function beep(type = "click") {
    if (!audio.enabled) return;
    ensureAudio();

    const ctx = audio.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();

    // тихо
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);

    if (type === "kick") {
      o.type = "sine";
      o.frequency.setValueAtTime(190, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.12);
    } else if (type === "goal") {
      o.type = "triangle";
      o.frequency.setValueAtTime(620, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(920, ctx.currentTime + 0.08);
    } else if (type === "save") {
      o.type = "square";
      o.frequency.setValueAtTime(170, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.12);
    } else if (type === "start") {
      o.type = "triangle";
      o.frequency.setValueAtTime(420, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.08);
    } else {
      o.type = "sine";
      o.frequency.setValueAtTime(320, ctx.currentTime);
    }

    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.2);
  }

  // ---------- DOM map (устойчивый к разным id) ----------
  function pickEl(...sels) {
    for (const s of sels) {
      const el = $(s);
      if (el) return el;
    }
    return null;
  }

  const els = {
    // header
    bal: pickEl("#balance", "[data-balance]", ".pill--balance .value", ".balanceValue"),
    soundBtn: pickEl("#soundToggle", "[data-sound]", ".pill--sound", ".soundToggle"),

    // bet controls
    betInput: pickEl("#betInput", "input[name='bet']", ".betInput"),
    minusBet: pickEl("#betMinus", "[data-bet-minus]", ".btnBetMinus"),
    plusBet: pickEl("#betPlus", "[data-bet-plus]", ".btnBetPlus"),
    chips: $$(".chip,[data-chip]"),

    bonusBtn: pickEl("#bonusBtn", "[data-bonus]", ".pill--bonus"),

    // difficulty
    diffEasy: pickEl("#diffEasy", "[data-diff='easy']", ".diffEasy"),
    diffHard: pickEl("#diffHard", "[data-diff='hard']", ".diffHard"),

    // series toggle
    seriesToggle: pickEl("#seriesToggle", "input[name='series']", ".seriesToggle input"),

    // actions
    startBtn: pickEl("#startBtn", "[data-start]", ".btnStart"),
    cashBtn: pickEl("#cashoutBtn", "[data-cashout]", ".btnCashout"),
    resetBtn: pickEl("#resetBtn", "[data-reset]", ".btnReset"),

    // ladder container
    ladder: pickEl("#ladder", "[data-ladder]", ".ladder"),

    // stats
    statStep: pickEl("#statStep", "[data-step]", ".statStep"),
    statX: pickEl("#statX", "[data-x]", ".statX"),
    statPotential: pickEl("#statPotential", "[data-potential]", ".statPotential"),
    hintDiff: pickEl("#hintDiff", "[data-hint-diff]", ".hintDiff"),
    hintBet: pickEl("#hintBet", "[data-hint-bet]", ".hintBet"),
    hintCash: pickEl("#hintCash", "[data-hint-cash]", ".hintCash"),
    hintSeries: pickEl("#hintSeries", "[data-hint-series]", ".hintSeries"),

    // field
    grid: pickEl("#goalGrid", "[data-goal-grid]", ".goalGrid", ".grid"),
    gloves: pickEl("#gloves", "[data-gloves]", ".gloves"),
    ball: pickEl("#ball", "[data-ball]", ".ball"),

    statusLine: pickEl("#statusLine", "[data-status]", ".statusLine", ".status"),
  };

  // ---------- constants ----------
  const ROWS = 3;
  const COLS = 5;
  const CELL_COUNT = ROWS * COLS;

  // вратарь: интервал движения (база)
  const GOALIE = {
    easy: { moveEveryMs: 520 },
    hard: { moveEveryMs: 410 },
  };

  // ВАЖНО: ловит строго 2 клетки
  const COVER_COUNT = { easy: 2, hard: 2 };

  // множители (лестница X) — оставляю как у тебя на скрине (до 12 шагов)
  // ТЫ ПРОСИЛ "логику не менять", поэтому не трогаю форму лестницы, только сложность сейва.
  const LADDER_X = [1.25, 1.55, 1.95, 2.50, 3.30, 4.40, 6.20, 9.10, 14.00, 22.50, 38.00, 70.00];

  // ---------- state ----------
  const state = {
    wallet: loadWallet(),

    diff: "easy",   // easy | hard
    series: true,

    bet: 100,

    inRound: false,
    step: 0,        // 0..LADDER_X.length
    currentX: 1.0,
    potential: 0,

    animLock: false,

    goalieCover: [7, 8], // 2 cells indexes
    goalieTimer: null,

    // SMART GOALIE:
    heat: new Array(CELL_COUNT).fill(0),
  };

  // ===== SMART GOALIE (НЕ увеличиваем зону сейва, но делаем умнее) =====
  const HEAT_DECAY = 0.92;      // "забывает" старое
  const CENTER_BIAS = 0.25;     // чуть тянется к центру (естественно)
  const STEP_AGGRO_EASY = 0.06; // рост "умности" по шагу
  const STEP_AGGRO_HARD = 0.11;

  function idxToRC(idx) {
    return { r: Math.floor(idx / COLS), c: idx % COLS };
  }

  function neighbors(idx) {
    const { r, c } = idxToRC(idx);
    const out = [];
    if (r > 0) out.push((r - 1) * COLS + c);
    if (r < ROWS - 1) out.push((r + 1) * COLS + c);
    if (c > 0) out.push(r * COLS + (c - 1));
    if (c < COLS - 1) out.push(r * COLS + (c + 1));
    return out;
  }

  function decayHeat() {
    for (let i = 0; i < state.heat.length; i++) state.heat[i] *= HEAT_DECAY;
  }

  function bumpHeat(idx) {
    state.heat[idx] += 1.25;
    for (const nb of neighbors(idx)) state.heat[nb] += 0.35;
  }

  let ALL_PAIRS = null;
  function getAllPairs() {
    if (ALL_PAIRS) return ALL_PAIRS;
    const pairs = [];
    for (let i = 0; i < CELL_COUNT; i++) {
      for (const nb of neighbors(i)) {
        const a = Math.min(i, nb), b = Math.max(i, nb);
        if (!pairs.some(p => p[0] === a && p[1] === b)) pairs.push([a, b]);
      }
    }
    ALL_PAIRS = pairs;
    return pairs;
  }

  function pairWeight(pair) {
    const [a, b] = pair;

    // "умность" по памяти
    const heatScore = state.heat[a] + state.heat[b];

    // чуть к центру (натурально)
    const centerIdx = 7; // центр 3x5
    const distA = Math.abs(a - centerIdx);
    const distB = Math.abs(b - centerIdx);
    const centerScore = (1 / (1 + distA)) + (1 / (1 + distB));

    const stepAggro = (state.diff === "hard")
      ? (STEP_AGGRO_HARD * state.step)
      : (STEP_AGGRO_EASY * state.step);

    return 0.15 + (heatScore * (0.55 + stepAggro)) + (CENTER_BIAS * centerScore);
  }

  function weightedPickPair() {
    const pairs = getAllPairs();
    let sum = 0;
    const weights = new Array(pairs.length);
    for (let i = 0; i < pairs.length; i++) {
      const w = pairWeight(pairs[i]);
      weights[i] = w;
      sum += w;
    }
    const r = (rngInt(1_000_000) / 1_000_000) * sum;
    let acc = 0;
    for (let i = 0; i < pairs.length; i++) {
      acc += weights[i];
      if (acc >= r) return pairs[i];
    }
    return pairs[pairs.length - 1];
  }

  // ---------- UI build ----------
  function syncWalletUI() {
    if (els.bal) els.bal.textContent = formatMoney(state.wallet);
  }

  function syncBetUI() {
    if (els.betInput) els.betInput.value = String(state.bet);
    if (els.hintBet) els.hintBet.textContent = formatMoney(state.bet);
  }

  function setStatus(msg) {
    if (els.statusLine) els.statusLine.textContent = msg;
  }

  function syncHintUI() {
    if (els.hintDiff) els.hintDiff.textContent = (state.diff === "easy" ? "Лёгкий" : "Сложный");
    if (els.hintSeries) els.hintSeries.textContent = state.series ? "ON" : "OFF";
    if (els.hintCash) els.hintCash.textContent = (state.step > 0 ? formatMoney(state.potential) : "—");
  }

  function syncStatsUI() {
    if (els.statStep) els.statStep.textContent = String(state.step);
    if (els.statX) els.statX.textContent = `x${state.currentX.toFixed(2)}`;
    if (els.statPotential) els.statPotential.textContent = formatMoney(state.potential);
  }

  function buildGrid() {
    if (!els.grid) return;

    els.grid.innerHTML = "";
    els.grid.style.setProperty("--rows", ROWS);
    els.grid.style.setProperty("--cols", COLS);

    for (let i = 0; i < CELL_COUNT; i++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.idx = String(i);
      cell.addEventListener("click", () => onShoot(i));
      els.grid.appendChild(cell);
    }
  }

  function buildLadder() {
    if (!els.ladder) return;
    els.ladder.innerHTML = "";

    for (let i = 0; i < LADDER_X.length; i++) {
      const item = document.createElement("div");
      item.className = "lad";
      item.dataset.step = String(i + 1);

      const t = document.createElement("div");
      t.className = "lad__t";
      t.textContent = `Шаг ${i + 1}`;

      const x = document.createElement("div");
      x.className = "lad__x";
      x.textContent = `x${LADDER_X[i].toFixed(2)}`;

      item.appendChild(t);
      item.appendChild(x);
      els.ladder.appendChild(item);
    }

    highlightLadder();
  }

  function highlightLadder() {
    if (!els.ladder) return;
    $$(".lad", els.ladder).forEach(n => n.classList.remove("active"));
    if (state.step <= 0) return;
    const el = $(`.lad[data-step="${state.step}"]`, els.ladder);
    if (el) el.classList.add("active");
  }

  function lockUI() {
    const inPlay = state.inRound;
    if (els.startBtn) els.startBtn.disabled = inPlay;
    if (els.cashBtn) els.cashBtn.disabled = !(inPlay && state.step > 0);
    if (els.resetBtn) els.resetBtn.disabled = false;

    if (els.diffEasy) els.diffEasy.disabled = inPlay;
    if (els.diffHard) els.diffHard.disabled = inPlay;

    if (els.betInput) els.betInput.disabled = inPlay;
    if (els.minusBet) els.minusBet.disabled = inPlay;
    if (els.plusBet) els.plusBet.disabled = inPlay;
    els.chips.forEach(c => (c.disabled = inPlay));

    if (els.seriesToggle) els.seriesToggle.disabled = inPlay;
  }

  // ---------- goalie visuals ----------
  // Позиционирование перчаток внутри поля строго по клеткам
  function updateGoalieState(pair) {
    state.goalieCover = pair.slice();
    renderGloves(pair);
    renderCoverCells(pair);
  }

  function renderCoverCells(pair) {
    if (!els.grid) return;
    // только подсветка "опасных" клеток — можешь убрать если не хочешь подсказок
    // на скрине у тебя было без сильной подсветки, поэтому делаю очень мягко.
    const cells = $$(".cell", els.grid);
    cells.forEach(c => c.classList.remove("cover"));
    pair.forEach(idx => {
      const c = cells[idx];
      if (c) c.classList.add("cover");
    });
  }

  function renderGloves(pair) {
    if (!els.gloves) return;

    // создаём 2 перчатки внутри контейнера gloves, если нет
    let g1 = $(".glove.g1", els.gloves);
    let g2 = $(".glove.g2", els.gloves);
    if (!g1) {
      g1 = document.createElement("div");
      g1.className = "glove g1";
      els.gloves.appendChild(g1);
    }
    if (!g2) {
      g2 = document.createElement("div");
      g2.className = "glove g2";
      els.gloves.appendChild(g2);
    }

    // вычисляем координаты центров клеток
    const a = idxToRC(pair[0]);
    const b = idxToRC(pair[1]);

    // ставим перчатки в центры двух клеток
    // ВАЖНО: перемещение только через translate внутри контейнера ворот.
    const pos = (rc) => {
      const x = (rc.c + 0.5) / COLS * 100;
      const y = (rc.r + 0.5) / ROWS * 100;
      return { x, y };
    };

    const pA = pos(a);
    const pB = pos(b);

    g1.style.transform = `translate(${pA.x}%, ${pA.y}%) translate(-50%, -50%)`;
    g2.style.transform = `translate(${pB.x}%, ${pB.y}%) translate(-50%, -50%)`;

    // маленькая синхронная "дрожь" (реализм)
    g1.classList.remove("pulse");
    g2.classList.remove("pulse");
    // reflow
    void g1.offsetWidth;
    g1.classList.add("pulse");
    g2.classList.add("pulse");
  }

  function stopGoalie() {
    if (state.goalieTimer) clearInterval(state.goalieTimer);
    state.goalieTimer = null;
  }

  // ВРАТАРЬ "УМНЫЙ": ловит 2 клетки, но выбирает их всё лучше
  function startGoalie() {
    stopGoalie();

    // стартовая позиция — умная
    updateGoalieState(weightedPickPair());

    const cfgBase = (state.diff === "hard") ? GOALIE.hard : GOALIE.easy;

    state.goalieTimer = setInterval(() => {
      if (!state.inRound) return;

      decayHeat();

      // шанс "микро-переосмысления" растёт с шагом
      const extraMoveChance = (state.diff === "hard")
        ? clamp(0.10 + state.step * 0.06, 0.10, 0.55)
        : clamp(0.06 + state.step * 0.04, 0.06, 0.40);

      let pair = weightedPickPair();

      if ((rngInt(1000) / 1000) < extraMoveChance) {
        const pair2 = weightedPickPair();
        if (pairWeight(pair2) > pairWeight(pair)) pair = pair2;
      }

      updateGoalieState(pair);
    }, cfgBase.moveEveryMs);
  }

  // ---------- game flow ----------
  function setDiff(diff) {
    if (state.inRound) return;
    state.diff = diff;
    if (els.diffEasy) els.diffEasy.classList.toggle("active", diff === "easy");
    if (els.diffHard) els.diffHard.classList.toggle("active", diff === "hard");
    syncHintUI();
  }

  function setSeries(on) {
    if (state.inRound) return;
    state.series = !!on;
    syncHintUI();
  }

  function recalcPotential() {
    if (state.step <= 0) {
      state.currentX = 1.0;
      state.potential = state.bet;
      return;
    }
    state.currentX = LADDER_X[state.step - 1];
    state.potential = Math.floor(state.bet * state.currentX);
  }

  function startRound() {
    if (state.inRound) return;

    // минимальная защита
    if (state.bet <= 0) state.bet = 1;
    if (state.bet > state.wallet) {
      setStatus("Недостаточно средств.");
      return;
    }

    // списание ставки 1 раз (серия)
    state.wallet -= state.bet;
    saveWallet(state.wallet);
    syncWalletUI();

    state.inRound = true;
    state.step = 0;
    recalcPotential();
    syncStatsUI();
    syncHintUI();
    highlightLadder();

    // reset heat слегка (чтобы не было слишком "липко", но умность сохраним частично)
    for (let i = 0; i < state.heat.length; i++) state.heat[i] *= 0.35;

    setStatus("Серия началась. Выбери зону удара.");
    beep("start");

    clearShotMarks();
    resetBall();

    startGoalie();
    lockUI();
  }

  function endRoundLoss() {
    state.inRound = false;
    stopGoalie();
    lockUI();

    // ставка уже сгорела
    setStatus("Сейв! Ставка сгорела.");
    beep("save");

    // если серия выключена — просто конец
    // если серия включена — тоже конец серии
    state.step = 0;
    recalcPotential();
    syncStatsUI();
    syncHintUI();
    highlightLadder();
  }

  function endRoundWinAuto() {
    // авто-кэш на максимальном шаге
    cashout(true);
  }

  function cashout(isAuto = false) {
    if (!state.inRound) return;
    if (state.step <= 0) return;

    state.wallet += state.potential;
    saveWallet(state.wallet);
    syncWalletUI();

    state.inRound = false;
    stopGoalie();
    lockUI();

    setStatus(isAuto ? `Авто-кэшаут: +${formatMoney(state.potential)}` : `Кэшаут: +${formatMoney(state.potential)}`);
    beep("goal");

    state.step = 0;
    recalcPotential();
    syncStatsUI();
    syncHintUI();
    highlightLadder();

    clearShotMarks();
    resetBall();
  }

  function resetAll() {
    stopGoalie();
    state.inRound = false;
    state.step = 0;
    recalcPotential();
    syncStatsUI();
    syncHintUI();
    highlightLadder();
    lockUI();
    clearShotMarks();
    resetBall();
    setStatus("Выбери ставку и сложность, затем нажми «Ставка».");
  }

  // ---------- ball animation ----------
  function resetBall() {
    if (!els.ball) return;
    els.ball.classList.remove("fly");
    els.ball.style.transform = "translate(-50%, -50%) translateY(70px) scale(1)";
    els.ball.style.opacity = "1";
  }

  function clearShotMarks() {
    if (!els.grid) return;
    $$(".cell", els.grid).forEach(c => {
      c.classList.remove("hit", "goal", "save");
    });
  }

  function animateBallToZone(idx) {
    return new Promise((resolve) => {
      if (!els.ball || !els.grid) {
        resolve();
        return;
      }

      // координаты цели (центра клетки) в процентах контейнера ворот
      const { r, c } = idxToRC(idx);
      const x = (c + 0.5) / COLS * 100;
      const y = (r + 0.5) / ROWS * 100;

      els.ball.classList.add("fly");

      // старт ниже ворот (реализм) — мяч "летит" В ворота
      // translate(-50%, -50%) уже учитывается
      els.ball.style.transform = `translate(-50%, -50%) translate(${x - 50}%, ${y - 50}%) translateY(-10px) scale(0.92)`;

      const done = () => {
        els.ball.removeEventListener("transitionend", done);
        resolve();
      };
      els.ball.addEventListener("transitionend", done, { once: true });

      // fallback на случай без transitionend
      setTimeout(resolve, 420);
    });
  }

  // ---------- shoot ----------
  async function onShoot(idx) {
    if (!state.inRound) return;
    if (state.animLock) return;
    state.animLock = true;

    // ВРАТАРЬ "УЧИТСЯ" от ударов (незаметное усложнение)
    bumpHeat(idx);

    clearShotMarks();

    // отметка выбранной клетки
    const cells = els.grid ? $$(".cell", els.grid) : [];
    const cell = cells[idx];
    if (cell) cell.classList.add("hit");

    beep("kick");
    await animateBallToZone(idx);

    const saved = state.goalieCover.includes(idx);

    if (saved) {
      if (cell) cell.classList.add("save");
      endRoundLoss();
      state.animLock = false;
      return;
    }

    // гол
    if (cell) cell.classList.add("goal");
    beep("goal");

    state.step += 1;
    recalcPotential();
    syncStatsUI();
    syncHintUI();
    highlightLadder();

    setStatus(`Гол! Шаг: ${state.step} • Текущий X: x${state.currentX.toFixed(2)}`);

    // максимум — авто-кэш
    if (state.step >= LADDER_X.length) {
      endRoundWinAuto();
      state.animLock = false;
      return;
    }

    // продолжаем серию
    resetBall();
    state.animLock = false;
    lockUI();
  }

  // ---------- events ----------
  function bindEvents() {
    if (els.soundBtn) {
      els.soundBtn.addEventListener("click", async () => {
        audio.enabled = !audio.enabled;
        if (audio.enabled) {
          try { ensureAudio(); await audio.ctx.resume?.(); } catch {}
          setStatus("Звук: ON");
        } else {
          setStatus("Звук: OFF");
        }
        // если у кнопки есть текст
        if (els.soundBtn.textContent?.toLowerCase().includes("звук")) {
          els.soundBtn.innerHTML = `<span class="dot"></span> Звук ${audio.enabled ? "on" : "off"}`;
        }
      });
    }

    if (els.bonusBtn) {
      els.bonusBtn.addEventListener("click", () => {
        state.wallet += 1000;
        saveWallet(state.wallet);
        syncWalletUI();
        setStatus("+1000 ₽ добавлено.");
        beep("click");
      });
    }

    if (els.betInput) {
      els.betInput.addEventListener("change", () => {
        const v = Math.floor(Number(els.betInput.value));
        if (Number.isFinite(v)) state.bet = clamp(v, 1, 999999);
        syncBetUI();
        recalcPotential();
        syncStatsUI();
        syncHintUI();
      });
    }

    if (els.minusBet) {
      els.minusBet.addEventListener("click", () => {
        if (state.inRound) return;
        state.bet = clamp(state.bet - 10, 1, 999999);
        syncBetUI();
        recalcPotential();
        syncStatsUI();
        syncHintUI();
        beep("click");
      });
    }

    if (els.plusBet) {
      els.plusBet.addEventListener("click", () => {
        if (state.inRound) return;
        state.bet = clamp(state.bet + 10, 1, 999999);
        syncBetUI();
        recalcPotential();
        syncStatsUI();
        syncHintUI();
        beep("click");
      });
    }

    els.chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        if (state.inRound) return;
        const val = chip.dataset.chip ? Number(chip.dataset.chip) : Number(chip.textContent?.replace(/[^\d]/g, ""));
        if (Number.isFinite(val) && val > 0) {
          state.bet = clamp(val, 1, 999999);
          syncBetUI();
          recalcPotential();
          syncStatsUI();
          syncHintUI();
          beep("click");
        }
      });
    });

    if (els.diffEasy) els.diffEasy.addEventListener("click", () => { setDiff("easy"); beep("click"); });
    if (els.diffHard) els.diffHard.addEventListener("click", () => { setDiff("hard"); beep("click"); });

    if (els.seriesToggle) {
      els.seriesToggle.checked = state.series;
      els.seriesToggle.addEventListener("change", () => {
        setSeries(els.seriesToggle.checked);
        beep("click");
      });
    }

    if (els.startBtn) {
      els.startBtn.addEventListener("click", () => {
        if (state.inRound) return;
        startRound();
      });
    }

    if (els.cashBtn) {
      els.cashBtn.addEventListener("click", () => {
        cashout(false);
      });
    }

    if (els.resetBtn) {
      els.resetBtn.addEventListener("click", () => {
        resetAll();
        beep("click");
      });
    }
  }

  // ---------- init ----------
  function initDefaults() {
    // начальные элементы
    syncWalletUI();

    // bet initial
    if (Number.isFinite(state.bet) === false) state.bet = 100;
    syncBetUI();

    // diff
    setDiff(state.diff);

    // series toggle
    if (els.seriesToggle) els.seriesToggle.checked = state.series;

    // stats
    recalcPotential();
    syncStatsUI();
    syncHintUI();

    buildGrid();
    buildLadder();

    // стартовая позиция вратаря (но без таймера пока не началась серия)
    updateGoalieState(weightedPickPair());

    lockUI();
    setStatus("Выбери ставку и сложность, затем нажми «Ставка».");
  }

  // ---------- go ----------
  bindEvents();
  initDefaults();

})();
