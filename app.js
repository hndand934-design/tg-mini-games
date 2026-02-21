(() => {
  const WALLET_KEY = "mini_wallet_penalty_v1";

  const LADDER_EASY = [1.25, 1.55, 1.95, 2.50, 3.30, 4.40, 6.20, 9.10, 14.00, 22.50, 38.00, 70.00];
  const LADDER_HARD = [1.35, 1.75, 2.30, 3.20, 4.60, 6.80, 10.50, 16.50, 26.00, 41.00, 70.00, 120.00];

  const GOALIE = {
    easy: { moveEveryMs: 520, tweenMs: 220 },
    hard: { moveEveryMs: 340, tweenMs: 200 },
  };

  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtX = (x) => "x" + (Math.round(x * 100) / 100).toFixed(2);
  const fmtRub = (n) => Math.round(n) + " ₽";

  function rngInt(n) {
    const u = new Uint32Array(1);
    crypto.getRandomValues(u);
    return u[0] % n;
  }
  function rngFloat() {
    const u = new Uint32Array(1);
    crypto.getRandomValues(u);
    return u[0] / 2 ** 32;
  }

  // ===== AUDIO =====
  let soundOn = true;
  let audioCtx = null;

  function beep(type = "click") {
    if (!soundOn) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);

    const presets = {
      click: { f1: 520, f2: 420, dur: 0.07, vol: 0.08 },
      kick:  { f1: 240, f2: 150, dur: 0.10, vol: 0.11 },
      goal:  { f1: 660, f2: 920, dur: 0.14, vol: 0.10 },
      save:  { f1: 180, f2: 120, dur: 0.16, vol: 0.10 },
    };
    const p = presets[type] || presets.click;

    o.type = "sine";
    o.frequency.setValueAtTime(p.f1, t0);
    o.frequency.exponentialRampToValueAtTime(p.f2, t0 + p.dur);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(p.vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + p.dur);

    o.start(t0);
    o.stop(t0 + p.dur + 0.02);
  }

  // ===== STATE =====
  const state = {
    wallet: 0,
    bet: 100,
    diff: "easy",
    inRound: false,
    step: 0,
    currentX: 1.0,
    cashoutEnabled: false,

    // визуально всё равно 2 клетки
    goalieCells: [0, 1],
    goalieCover: [0, 1],

    goalieTimer: null,

    goalRect: null,
    zoneRects: [],
    ballHome: null,
    animLock: false,

    // “память” ударов игрока
    heat: new Array(15).fill(0),
  };

  // ===== DOM =====
  const balEl = $("#bal");
  const betEl = $("#bet");
  const betLabel = $("#betLabel");
  const diffLabel = $("#diffLabel");
  const diffHint = $("#diffHint");

  const easyBtn = $("#easyBtn");
  const hardBtn = $("#hardBtn");

  const minusBtn = $("#minus");
  const plusBtn = $("#plus");
  const chips = document.querySelectorAll(".chip");

  const ladderEl = $("#ladder");
  const stepTxt = $("#stepTxt");
  const xTxt = $("#xTxt");
  const potTxt = $("#potTxt"); // может отсутствовать — ок
  const stepMini = $("#stepMini");
  const xMini = $("#xMini");
  const cashLabel = $("#cashLabel");

  const placeBtn = $("#placeBtn");
  const cashBtn = $("#cashBtn");
  const resetBtn = $("#resetBtn");
  const msgEl = $("#msg");

  const zonesEl = $("#zones");
  const glovesEl = $("#gloves");
  const ballEl = $("#ball");

  const soundBtn = $("#soundBtn");
  const soundTxt = $("#soundTxt");
  const soundDot = $("#soundDot");
  const bonusBtn = $("#bonusBtn");

  // ===== WALLET =====
  function loadWallet() {
    const raw = localStorage.getItem(WALLET_KEY);
    const n = raw ? Number(raw) : 1000;
    state.wallet = Number.isFinite(n) ? n : 1000;
  }
  function saveWallet() {
    localStorage.setItem(WALLET_KEY, String(state.wallet));
  }

  // ===== UI =====
  function ladderArr() {
    return state.diff === "hard" ? LADDER_HARD : LADDER_EASY;
  }
  function computeX(step) {
    const arr = ladderArr();
    if (step <= 0) return 1.0;
    const idx = clamp(step - 1, 0, arr.length - 1);
    return arr[idx];
  }

  function renderLadder() {
    ladderEl.innerHTML = "";
    const arr = ladderArr();
    arr.forEach((x, i) => {
      const s = document.createElement("div");
      s.className = "lStep" + ((state.step === i + 1) ? " active" : "");
      s.innerHTML = `<div class="t">Шаг ${i + 1}</div><div class="x">${fmtX(x)}</div>`;
      ladderEl.appendChild(s);
    });
  }

  function setMsg(t) { msgEl.textContent = t; }

  function updateTexts() {
    balEl.textContent = Math.round(state.wallet);

    betEl.value = String(state.bet);
    betLabel.textContent = String(state.bet);

    diffLabel.textContent = state.diff === "hard" ? "Сложный" : "Лёгкий";
    diffHint.textContent = state.diff === "hard"
      ? "Сложный: вратарь угадывает чаще."
      : "Лёгкий: вратарь угадывает реже.";

    stepTxt.textContent = String(state.step);
    xTxt.textContent = fmtX(state.currentX);
    stepMini.textContent = String(state.step);
    xMini.textContent = fmtX(state.currentX);

    const potential = state.inRound ? Math.round(state.bet * state.currentX) : 0;
    if (potTxt) potTxt.textContent = fmtRub(potential);
    cashLabel.textContent = state.cashoutEnabled ? fmtRub(potential) : "—";

    placeBtn.disabled = state.inRound;
    cashBtn.disabled = !state.cashoutEnabled;

    const lockBet = state.inRound;
    betEl.disabled = lockBet;
    minusBtn.disabled = lockBet;
    plusBtn.disabled = lockBet;
    chips.forEach(b => (b.disabled = lockBet));
    easyBtn.disabled = lockBet;
    hardBtn.disabled = lockBet;
  }

  // ===== ZONES / MEASURE =====
  function buildZones() {
    zonesEl.innerHTML = "";
    for (let i = 0; i < 15; i++) {
      const z = document.createElement("div");
      z.className = "zone";
      z.dataset.idx = String(i);
      z.addEventListener("click", () => onShoot(i));
      zonesEl.appendChild(z);
    }
  }

  function measureRects() {
    const zoneNodes = [...zonesEl.querySelectorAll(".zone")];
    state.zoneRects = zoneNodes.map(n => n.getBoundingClientRect());
    state.goalRect = zonesEl.getBoundingClientRect();

    const gr = state.goalRect;
    const homeX = gr.left + gr.width / 2;
    const homeY = gr.top + gr.height + Math.min(92, gr.height * 0.45);
    state.ballHome = { x: homeX, y: homeY };
  }

  function zoneCenter(idx) {
    const r = state.zoneRects[idx];
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function moveGlovesToPair(pair) {
    if (!state.goalRect || state.zoneRects.length !== 15) return;

    const a = zoneCenter(pair[0]);
    const b = zoneCenter(pair[1]);
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;

    const gx = cx - (state.goalRect.left + state.goalRect.width / 2);
    const gy = cy - (state.goalRect.top + state.goalRect.height / 2);

    const maxX = state.goalRect.width * 0.38;
    const maxY = state.goalRect.height * 0.30;
    const tx = clamp(gx, -maxX, maxX);
    const ty = clamp(gy, -maxY, maxY);

    glovesEl.style.transitionDuration =
      (state.diff === "hard" ? GOALIE.hard.tweenMs : GOALIE.easy.tweenMs) + "ms";
    glovesEl.style.translate = `${tx}px ${ty}px`;
  }

  function setZonesEnabled(on) {
    zonesEl.querySelectorAll(".zone").forEach(z => z.classList.toggle("disabled", !on));
  }

  // ===== GRID HELPERS =====
  const ROWS = 3, COLS = 5;
  function neighbors(idx) {
    const r = Math.floor(idx / COLS);
    const c = idx % COLS;
    const out = [];
    if (c > 0) out.push(idx - 1);
    if (c < COLS - 1) out.push(idx + 1);
    if (r > 0) out.push(idx - COLS);
    if (r < ROWS - 1) out.push(idx + COLS);
    return out;
  }

  // ===== HARDER “BRAIN” SETTINGS (НЕ ВИЗУАЛЬНО) =====
  // 1) “память” ударов держится дольше (меньше затухает)
  const HEAT_DECAY = 0.88; // было ~0.92 (дольше помнит) => сложнее

  // 2) сильнее запоминает твой выбор
  function bumpHeat(idx) {
    state.heat[idx] += 1.65;               // было слабее
    for (const nb of neighbors(idx)) state.heat[nb] += 0.55;
  }
  function decayHeat() {
    for (let i = 0; i < state.heat.length; i++) state.heat[i] *= HEAT_DECAY;
  }

  // ===== base pair picker =====
  function randomAdjacentPair() {
    const base = rngInt(ROWS * COLS);
    const nbs = neighbors(base);
    const nb = nbs[rngInt(nbs.length)];
    return base < nb ? [base, nb] : [nb, base];
  }

  let ALL_PAIRS = null;
  function allPairs() {
    if (ALL_PAIRS) return ALL_PAIRS;
    const pairs = [];
    for (let i = 0; i < 15; i++) {
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
    const heat = state.heat[a] + state.heat[b];

    // лёгкий центр-бонус оставляем (чтобы выглядело естественно)
    const center = 7;
    const distA = Math.abs(a - center);
    const distB = Math.abs(b - center);
    const centerBias = (1 / (1 + distA)) + (1 / (1 + distB));

    // 3) сильнее “интеллект” с ростом шага
    const aggro = (state.diff === "hard")
      ? clamp(0.55 + state.step * 0.18, 0.55, 1.60)
      : clamp(0.38 + state.step * 0.12, 0.38, 1.20);

    return 0.18 + heat * aggro + centerBias * 0.16;
  }

  function weightedPickPair() {
    const pairs = allPairs();
    let sum = 0;
    const w = new Array(pairs.length);

    for (let i = 0; i < pairs.length; i++) {
      const ww = pairWeight(pairs[i]);
      w[i] = ww;
      sum += ww;
    }

    const r = rngFloat() * sum;
    let acc = 0;
    for (let i = 0; i < pairs.length; i++) {
      acc += w[i];
      if (acc >= r) return pairs[i];
    }
    return pairs[pairs.length - 1];
  }

  function updateGoalieState(pair) {
    state.goalieCells = pair;
    state.goalieCover = pair.slice(); // ВИЗУАЛ: 2 клетки, ЛОГИКА: тоже 2
    moveGlovesToPair(pair);
  }

  function startGoalie() {
    stopGoalie();
    updateGoalieState(weightedPickPair());

    const cfg = state.diff === "hard" ? GOALIE.hard : GOALIE.easy;

    state.goalieTimer = setInterval(() => {
      if (!state.inRound) return;

      decayHeat();

      let pair = weightedPickPair();

      // 4) меньше хаоса => умнее => сложнее
      const chaos = (state.diff === "hard") ? 0.12 : 0.24; // было больше
      if (rngFloat() < chaos) pair = randomAdjacentPair();

      updateGoalieState(pair);
    }, cfg.moveEveryMs);
  }

  function stopGoalie() {
    if (state.goalieTimer) {
      clearInterval(state.goalieTimer);
      state.goalieTimer = null;
    }
  }

  // ===== СКРЫТЫЙ “РЕФЛЕКС” СЕЙВА (НЕ ВИЗУАЛЬНО) =====
  // Иногда вратарь “угадывает” удар даже если не перекрывал эту клетку.
  // Визуально ничего не меняется (перчатки те же).
  function reflexSaveChance() {
    // Чем дальше серия — тем опаснее
    // Лёгкий: до ~28%
    // Сложный: до ~45%
    if (state.diff === "hard") {
      return clamp(0.18 + state.step * 0.05, 0.18, 0.45);
    }
    return clamp(0.10 + state.step * 0.03, 0.10, 0.28);
  }

  // ===== ball animation =====
  async function animateBallToZone(idx) {
    measureRects();
    if (!state.ballHome) return;

    const br = ballEl.getBoundingClientRect();
    const curX = br.left + br.width / 2;
    const curY = br.top + br.height / 2;

    const homeDx = state.ballHome.x - curX;
    const homeDy = state.ballHome.y - curY;

    ballEl.style.transition = "none";
    ballEl.style.transform = `translate3d(${homeDx}px, ${homeDy}px, 0) scale(1)`;
    void ballEl.offsetWidth;

    const target = zoneCenter(idx);
    const dx = target.x - state.ballHome.x;
    const dy = target.y - state.ballHome.y;

    ballEl.style.transition = "";
    ballEl.classList.remove("shoot");
    void ballEl.offsetWidth;

    ballEl.classList.add("shoot");
    ballEl.style.transform = `translate3d(${homeDx + dx}px, ${homeDy + dy}px, 0) scale(0.60)`;

    await new Promise(r => setTimeout(r, 280));

    ballEl.style.transform = `translate3d(${homeDx}px, ${homeDy}px, 0) scale(1)`;
    await new Promise(r => setTimeout(r, 170));

    ballEl.classList.remove("shoot");
  }

  // ===== FLOW =====
  function beginRound() {
    if (state.inRound) return;

    const b = Math.round(Number(betEl.value || state.bet));
    state.bet = clamp(Number.isFinite(b) ? b : 100, 1, 1e9);

    if (state.bet > state.wallet) {
      setMsg("Недостаточно баланса для ставки.");
      beep("save");
      updateTexts();
      return;
    }

    state.wallet -= state.bet;
    saveWallet();

    state.inRound = true;
    state.step = 0;
    state.currentX = 1.0;
    state.cashoutEnabled = false;
    state.animLock = false;

    setZonesEnabled(true);
    setMsg("Серия началась. Выбери зону удара.");
    renderLadder();
    updateTexts();

    requestAnimationFrame(() => {
      measureRects();
      for (let i = 0; i < state.heat.length; i++) state.heat[i] *= 0.30; // меньше сброса => сложнее
      startGoalie();
    });

    beep("click");
  }

  function endRoundLose() {
    state.inRound = false;
    state.cashoutEnabled = false;
    state.animLock = false;

    stopGoalie();
    setZonesEnabled(false);

    state.step = 0;
    state.currentX = 1.0;

    renderLadder();
    updateTexts();
  }

  function nextStepWin() {
    const arr = ladderArr();
    state.step = clamp(state.step + 1, 0, arr.length);
    state.currentX = computeX(state.step);
    state.cashoutEnabled = state.step >= 1;

    renderLadder();
    updateTexts();

    if (state.step >= arr.length) doCashout(true);
  }

  function doCashout(auto = false) {
    if (!state.inRound || !state.cashoutEnabled) return;

    const payout = Math.round(state.bet * state.currentX);
    state.wallet += payout;
    saveWallet();

    stopGoalie();
    setZonesEnabled(false);

    setMsg(auto ? `Авто-кэшаут: +${fmtRub(payout)}.` : `Кэшаут: +${fmtRub(payout)}.`);

    state.inRound = false;
    state.cashoutEnabled = false;
    state.animLock = false;

    state.step = 0;
    state.currentX = 1.0;

    renderLadder();
    updateTexts();
    beep("goal");
  }

  function resetAll() {
    if (state.inRound) {
      state.wallet += state.bet;
      saveWallet();
    }

    stopGoalie();
    setZonesEnabled(false);

    state.inRound = false;
    state.step = 0;
    state.currentX = 1.0;
    state.cashoutEnabled = false;
    state.animLock = false;

    setMsg("Выбери ставку и сложность, затем нажми «Ставка».");
    renderLadder();
    updateTexts();
    beep("click");

    requestAnimationFrame(() => measureRects());
  }

  async function onShoot(idx) {
    if (!state.inRound) {
      setMsg("Сначала нажми «Ставка».");
      beep("click");
      return;
    }
    if (state.animLock) return;
    state.animLock = true;

    // запоминаем твой выбор (чтобы дальше сложнее)
    bumpHeat(idx);

    beep("kick");
    await animateBallToZone(idx);

    // базовая проверка: стоит ли он в этой зоне
    let saved = state.goalieCover.includes(idx);

    // скрытый рефлекс: если НЕ перекрывал — иногда “угадывает”
    if (!saved) {
      const p = reflexSaveChance();
      if (rngFloat() < p) saved = true;
    }

    if (saved) {
      setMsg("Сейв! Ставка сгорела.");
      beep("save");
      endRoundLose();
      return;
    }

    setMsg("ГОООЛ! X вырос — можно продолжать или «Забрать».");
    beep("goal");
    nextStepWin();

    state.animLock = false;
  }

  function setDiff(d) {
    if (state.inRound) return;
    state.diff = d;

    easyBtn.classList.toggle("active", d === "easy");
    hardBtn.classList.toggle("active", d === "hard");

    renderLadder();
    updateTexts();
    beep("click");
  }

  function updateSoundUI() {
    soundTxt.textContent = soundOn ? "Звук on" : "Звук off";
    soundDot.style.background = soundOn ? "var(--good)" : "rgba(255,255,255,.35)";
    soundDot.style.boxShadow = soundOn ? "0 0 0 3px rgba(38,212,123,.14)" : "none";
  }

  // ===== INIT =====
  function init() {
    loadWallet();
    buildZones();

    state.bet = 100;
    betEl.value = "100";

    setZonesEnabled(false);
    setDiff("easy");
    state.currentX = 1.0;
    renderLadder();
    updateTexts();

    const sndRaw = localStorage.getItem("penalty_sound");
    if (sndRaw === "0") soundOn = false;
    updateSoundUI();

    soundBtn.addEventListener("click", async () => {
      soundOn = !soundOn;
      localStorage.setItem("penalty_sound", soundOn ? "1" : "0");
      updateSoundUI();
      beep("click");
      if (soundOn && audioCtx && audioCtx.state === "suspended") {
        try { await audioCtx.resume(); } catch {}
      }
    });

    bonusBtn.addEventListener("click", () => {
      state.wallet += 1000;
      saveWallet();
      updateTexts();
      beep("goal");
    });

    minusBtn.addEventListener("click", () => {
      state.bet = clamp(state.bet - 10, 1, 1e9);
      betEl.value = String(state.bet);
      updateTexts();
      beep("click");
    });
    plusBtn.addEventListener("click", () => {
      state.bet = clamp(state.bet + 10, 1, 1e9);
      betEl.value = String(state.bet);
      updateTexts();
      beep("click");
    });

    betEl.addEventListener("input", () => {
      const n = Math.round(Number(betEl.value || 0));
      state.bet = clamp(Number.isFinite(n) ? n : 100, 1, 1e9);
      updateTexts();
    });

    chips.forEach(btn => {
      btn.addEventListener("click", () => {
        const v = btn.dataset.chip;
        state.bet = (v === "max") ? clamp(state.wallet, 1, 1e9) : clamp(Number(v), 1, 1e9);
        betEl.value = String(state.bet);
        updateTexts();
        beep("click");
      });
    });

    easyBtn.addEventListener("click", () => setDiff("easy"));
    hardBtn.addEventListener("click", () => setDiff("hard"));

    placeBtn.addEventListener("click", beginRound);
    cashBtn.addEventListener("click", () => doCashout(false));
    resetBtn.addEventListener("click", resetAll);

    requestAnimationFrame(() => measureRects());
    window.addEventListener("resize", () => {
      requestAnimationFrame(() => {
        measureRects();
        if (state.inRound) moveGlovesToPair(state.goalieCells);
      });
    });

    window.addEventListener("scroll", () => {
      requestAnimationFrame(() => measureRects());
    }, { passive: true });
  }

  init();
})();
