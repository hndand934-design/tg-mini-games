(() => {
  // ====== CONFIG ======
  const WALLET_KEY = "mini_wallet_penalty_v1";

  // 12 шагов (как раньше по смыслу). ВАЖНО: сложный > лёгкий по максимуму.
  const LADDER_EASY = [1.25, 1.55, 1.95, 2.50, 3.30, 4.40, 6.20, 9.10, 14.00, 22.50, 38.00, 70.00];
  const LADDER_HARD = [1.35, 1.75, 2.30, 3.20, 4.60, 6.80, 10.50, 16.50, 26.00, 41.00, 70.00, 120.00];

  // goalie "агрессия": как часто двигается + как быстро
  const GOALIE = {
    easy: { moveEveryMs: 520, tweenMs: 220 },
    hard: { moveEveryMs: 340, tweenMs: 200 },
  };

  // ====== HELPERS ======
  const $ = (sel) => document.querySelector(sel);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtX = (x) => "x" + (Math.round(x * 100) / 100).toFixed(2);
  const fmtRub = (n) => Math.round(n) + " ₽";

  function rngInt(n) {
    // 0..n-1
    const u = new Uint32Array(1);
    crypto.getRandomValues(u);
    return u[0] % n;
  }

  // ====== AUDIO (tiny, no files) ======
  let soundOn = true;
  let audioCtx = null;

  function beep(type = "click") {
    if (!soundOn) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);

    const presets = {
      click: { f1: 520, f2: 420, dur: 0.07, vol: 0.08 },
      kick:  { f1: 220, f2: 140, dur: 0.10, vol: 0.11 },
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

  // ====== STATE ======
  const state = {
    wallet: 0,
    bet: 100,
    diff: "easy", // easy | hard
    inRound: false,   // ставка принята, серия идёт
    step: 0,          // 0..ladder.length
    currentX: 1.0,
    cashoutEnabled: false,

    goalieCells: [0, 1], // indexes 0..14 (2 соседние по одной линии движения)
    goalieTimer: null,
    goalRect: null,      // bounding rect for gloves movement
    zoneRects: [],

    animLock: false,     // чтобы клик не спамили во время полёта
  };

  // ====== DOM ======
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
  const potTxt = $("#potTxt");
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

  // ====== WALLET ======
  function loadWallet() {
    const raw = localStorage.getItem(WALLET_KEY);
    const n = raw ? Number(raw) : 1000;
    state.wallet = Number.isFinite(n) ? n : 1000;
  }
  function saveWallet() {
    localStorage.setItem(WALLET_KEY, String(state.wallet));
  }

  // ====== UI ======
  function ladderArr() {
    return state.diff === "hard" ? LADDER_HARD : LADDER_EASY;
  }

  function computeX(step) {
    const arr = ladderArr();
    if (step <= 0) return 1.0;
    const idx = clamp(step - 1, 0, arr.length - 1);
    return arr[idx];
  }

  function updateTexts() {
    balEl.textContent = Math.round(state.wallet);

    betEl.value = String(state.bet);
    betLabel.textContent = String(state.bet);

    diffLabel.textContent = state.diff === "hard" ? "Сложный" : "Лёгкий";
    diffHint.textContent = state.diff === "hard"
      ? "Сложный: вратарь двигается чаще и “умнее”."
      : "Лёгкий: вратарь “мягче” двигается по зонам.";

    stepTxt.textContent = String(state.step);
    xTxt.textContent = fmtX(state.currentX);
    stepMini.textContent = String(state.step);
    xMini.textContent = fmtX(state.currentX);

    const potential = state.inRound ? Math.round(state.bet * state.currentX) : 0;
    potTxt.textContent = fmtRub(potential);

    cashLabel.textContent = state.cashoutEnabled ? fmtRub(potential) : "—";

    placeBtn.disabled = state.inRound; // ставка 1 раз
    cashBtn.disabled = !state.cashoutEnabled;

    // bet controls disabled while inRound (как раньше)
    const lockBet = state.inRound;
    betEl.disabled = lockBet;
    minusBtn.disabled = lockBet;
    plusBtn.disabled = lockBet;
    chips.forEach(b => (b.disabled = lockBet));
    easyBtn.disabled = lockBet;
    hardBtn.disabled = lockBet;
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

  function setMsg(t) {
    msgEl.textContent = t;
  }

  // ====== ZONES / GOAL VISUAL ======
  function buildZones() {
    zonesEl.innerHTML = "";
    state.zoneRects = [];
    for (let i = 0; i < 15; i++) {
      const z = document.createElement("div");
      z.className = "zone";
      z.dataset.idx = String(i);
      z.addEventListener("click", () => onShoot(i));
      zonesEl.appendChild(z);
    }
  }

  function measureRects() {
    // compute rects inside goal (zones area)
    const zoneNodes = [...zonesEl.querySelectorAll(".zone")];
    state.zoneRects = zoneNodes.map(n => n.getBoundingClientRect());
    state.goalRect = zonesEl.getBoundingClientRect();
  }

  function zoneCenter(idx) {
    const r = state.zoneRects[idx];
    if (!r) return { x: 0, y: 0 };
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }

  function moveGlovesToPair(pair) {
    // move gloves group to the center between two cells
    // pair: [a,b] must be adjacent (we enforce)
    if (!state.goalRect || state.zoneRects.length !== 15) return;

    const a = zoneCenter(pair[0]);
    const b = zoneCenter(pair[1]);
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;

    const gx = cx - (state.goalRect.left + state.goalRect.width / 2);
    const gy = cy - (state.goalRect.top + state.goalRect.height / 2);

    // constrain within goal area a bit (safety)
    const maxX = state.goalRect.width * 0.38;
    const maxY = state.goalRect.height * 0.30;
    const tx = clamp(gx, -maxX, maxX);
    const ty = clamp(gy, -maxY, maxY);

    glovesEl.style.transitionDuration = (state.diff === "hard" ? GOALIE.hard.tweenMs : GOALIE.easy.tweenMs) + "ms";
    glovesEl.style.translate = `${tx}px ${ty}px`;
  }

  function setZonesEnabled(on) {
    zonesEl.querySelectorAll(".zone").forEach(z => {
      z.classList.toggle("disabled", !on);
    });
  }

  // ====== GOALIE AI (2 соседние клетки, вместе) ======
  function randomAdjacentPair() {
    // pick random cell and direction ensuring adjacency in grid 3x5
    // adjacency is 4-neighborhood
    const rows = 3, cols = 5;
    const base = rngInt(rows * cols);

    const r = Math.floor(base / cols);
    const c = base % cols;

    const neighbors = [];
    if (c > 0) neighbors.push(base - 1);
    if (c < cols - 1) neighbors.push(base + 1);
    if (r > 0) neighbors.push(base - cols);
    if (r < rows - 1) neighbors.push(base + cols);

    const nb = neighbors[rngInt(neighbors.length)];
    return base < nb ? [base, nb] : [nb, base];
  }

  function startGoalie() {
    stopGoalie();
    // initial
    state.goalieCells = randomAdjacentPair();
    moveGlovesToPair(state.goalieCells);

    const cfg = state.diff === "hard" ? GOALIE.hard : GOALIE.easy;
    state.goalieTimer = setInterval(() => {
      if (!state.inRound) return;
      // simple “умнее” на hard: чаще остаётся рядом с центром
      let pair = randomAdjacentPair();
      if (state.diff === "hard") {
        // bias to central cells
        if (rngInt(100) < 45) {
          const central = [6,7,8]; // middle row
          const base = central[rngInt(central.length)];
          const opts = [];
          if (base % 5 > 0) opts.push(base - 1);
          if (base % 5 < 4) opts.push(base + 1);
          if (Math.floor(base/5) > 0) opts.push(base - 5);
          if (Math.floor(base/5) < 2) opts.push(base + 5);
          const nb = opts[rngInt(opts.length)];
          pair = base < nb ? [base, nb] : [nb, base];
        }
      }
      state.goalieCells = pair;
      moveGlovesToPair(pair);
    }, cfg.moveEveryMs);
  }

  function stopGoalie() {
    if (state.goalieTimer) {
      clearInterval(state.goalieTimer);
      state.goalieTimer = null;
    }
  }

  // ====== ROUND FLOW ======
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
    setMsg("Серия началась. Кликни по зоне ворот (3×5).");
    renderLadder();
    updateTexts();

    // measure for movement
    requestAnimationFrame(() => {
      measureRects();
      startGoalie();
    });

    beep("click");
  }

  function endRoundLose() {
    // lose stake
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

    // auto-cashout on last step
    if (state.step >= arr.length) {
      doCashout(true);
    }
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

    // reset step/X after finish
    state.step = 0;
    state.currentX = 1.0;

    renderLadder();
    updateTexts();
    beep("goal");
  }

  function resetAll() {
    // если раунд идёт — возвращаем ставку (как просили раньше в подобных режимах? здесь безопасно)
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
  }

  // ====== SHOOT ======
  async function onShoot(idx) {
    if (!state.inRound) {
      setMsg("Сначала нажми «Ставка».");
      beep("click");
      return;
    }
    if (state.animLock) return;

    // disable spam
    state.animLock = true;

    // animate ball (no mark stays)
    ballEl.classList.remove("fly");
    void ballEl.offsetWidth;
    ballEl.classList.add("fly");
    beep("kick");

    // decide outcome vs goalie pair
    const saved = state.goalieCells.includes(idx);

    // small delay for feel
    await new Promise(r => setTimeout(r, 220));

    if (saved) {
      setMsg("Сейв! Ставка сгорела.");
      beep("save");
      endRoundLose();
      return;
    }

    // goal
    setMsg("ГОООЛ! X вырос — можно продолжать или «Кэшаут».");
    beep("goal");
    nextStepWin();

    // allow next shot
    state.animLock = false;
  }

  // ====== DIFFICULTY ======
  function setDiff(d) {
    if (state.inRound) return; // нельзя менять в раунде
    state.diff = d;
    easyBtn.classList.toggle("active", d === "easy");
    hardBtn.classList.toggle("active", d === "hard");

    // update ladder preview BEFORE start (важно)
    renderLadder();
    updateTexts();
    beep("click");
  }

  // ====== EVENTS ======
  function init() {
    loadWallet();
    buildZones();

    // initial
    state.bet = 100;
    betEl.value = "100";

    setZonesEnabled(false);
    setDiff("easy"); // renders ladder too
    state.currentX = 1.0;
    renderLadder();
    updateTexts();

    // measure on resize (for gloves)
    window.addEventListener("resize", () => {
      if (!state.inRound) return;
      measureRects();
      moveGlovesToPair(state.goalieCells);
    });

    // sound
    const sndRaw = localStorage.getItem("penalty_sound");
    if (sndRaw === "0") soundOn = false;
    updateSoundUI();

    soundBtn.addEventListener("click", async () => {
      soundOn = !soundOn;
      localStorage.setItem("penalty_sound", soundOn ? "1" : "0");
      updateSoundUI();
      beep("click");
      // iOS: resume on gesture
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

    // bet controls
    minusBtn.addEventListener("click", () => { state.bet = clamp(state.bet - 10, 1, 1e9); betEl.value = String(state.bet); updateTexts(); beep("click"); });
    plusBtn.addEventListener("click", () => { state.bet = clamp(state.bet + 10, 1, 1e9); betEl.value = String(state.bet); updateTexts(); beep("click"); });

    betEl.addEventListener("input", () => {
      const n = Math.round(Number(betEl.value || 0));
      state.bet = clamp(Number.isFinite(n) ? n : 100, 1, 1e9);
      updateTexts();
    });

    chips.forEach(btn => {
      btn.addEventListener("click", () => {
        const v = btn.dataset.chip;
        if (v === "max") state.bet = clamp(state.wallet, 1, 1e9);
        else state.bet = clamp(Number(v), 1, 1e9);
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

    // initial rects
    requestAnimationFrame(() => {
      measureRects();
      moveGlovesToPair(state.goalieCells);
    });
  }

  function updateSoundUI() {
    soundTxt.textContent = soundOn ? "Звук on" : "Звук off";
    soundDot.style.background = soundOn ? "var(--good)" : "rgba(255,255,255,.35)";
    soundDot.style.boxShadow = soundOn ? "0 0 0 3px rgba(38,212,123,.14)" : "none";
  }

  init();
})();
