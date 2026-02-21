(() => {
  const WALLET_KEY = "mini_wallet_penalty_v1";

  // лёгкий < сложный по макс X (исправлено ранее)
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

    goalieCells: [0, 1],
    goalieTimer: null,

    goalRect: null,
    zoneRects: [],
    ballHome: null, // {x,y} center in viewport
    animLock: false,
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
  const goalFrame = $("#goalFrame");

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
      ? "Сложный: вратарь двигается чаще и “умнее”."
      : "Лёгкий: вратарь “мягче” двигается по зонам.";

    stepTxt.textContent = String(state.step);
    xTxt.textContent = fmtX(state.currentX);
    stepMini.textContent = String(state.step);
    xMini.textContent = fmtX(state.currentX);

    const potential = state.inRound ? Math.round(state.bet * state.currentX) : 0;
    potTxt.textContent = fmtRub(potential);
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

    // ball "home" center
    const br = ballEl.getBoundingClientRect();
    state.ballHome = { x: br.left + br.width / 2, y: br.top + br.height / 2 };
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

  // ===== GOALIE =====
  function randomAdjacentPair() {
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
    state.goalieCells = randomAdjacentPair();
    moveGlovesToPair(state.goalieCells);

    const cfg = state.diff === "hard" ? GOALIE.hard : GOALIE.easy;
    state.goalieTimer = setInterval(() => {
      if (!state.inRound) return;

      let pair = randomAdjacentPair();
      if (state.diff === "hard") {
        if (rngInt(100) < 45) {
          const central = [6,7,8];
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

  // ===== BALL ANIMATION: from bottom to target =====
  async function animateBallToZone(idx) {
    measureRects(); // ensure fresh positions (important on mobile)

    if (!state.ballHome) return;

    const target = zoneCenter(idx);
    const dx = target.x - state.ballHome.x;
    const dy = target.y - state.ballHome.y;

    // reset
    ballEl.classList.remove("shoot");
    ballEl.style.transform = "translate3d(0,0,0) scale(1)";
    void ballEl.offsetWidth;

    // shoot
    ballEl.classList.add("shoot");
    // маленький “подъём” и уменьшение, чтобы выглядело как полёт в ворота
    ballEl.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(0.58)`;

    await new Promise(r => setTimeout(r, 260));

    // return home (без следов)
    ballEl.style.transform = "translate3d(0,0,0) scale(1)";
    await new Promise(r => setTimeout(r, 180));
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
    setMsg("Серия началась. Кликни по зоне ворот (3×5).");
    renderLadder();
    updateTexts();

    requestAnimationFrame(() => {
      measureRects();
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

    if (state.step >= arr.length) {
      doCashout(true);
    }
  }

  function doCashout(auto=false) {
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

    beep("kick");
    await animateBallToZone(idx);

    const saved = state.goalieCells.includes(idx);

    if (saved) {
      setMsg("Сейв! Ставка сгорела.");
      beep("save");
      endRoundLose();
      return;
    }

    setMsg("ГОООЛ! X вырос — можно продолжать или «Кэшаут».");
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

  // ===== SOUND UI =====
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

    // sound state
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

    // measure after paint
    requestAnimationFrame(() => measureRects());
    window.addEventListener("resize", () => {
      requestAnimationFrame(() => {
        measureRects();
        if (state.inRound) moveGlovesToPair(state.goalieCells);
      });
    });

    // safety: prevent ball transform issues if user scrolls
    window.addEventListener("scroll", () => {
      if (!state.animLock) requestAnimationFrame(() => measureRects());
    }, { passive: true });
  }

  init();
})();
