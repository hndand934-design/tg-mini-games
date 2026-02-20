(() => {
  // ====== STORAGE / WALLET ======
  const WALLET_KEY = "mini_wallet_penalty_v1";

  const $ = (s) => document.querySelector(s);

  const elBalance = $("#balance");
  const soundBtn = $("#soundBtn");
  const soundText = $("#soundText");
  const soundDot = $("#soundDot");
  const bonusBtn = $("#bonusBtn");

  const betInput = $("#betInput");
  const betMinus = $("#betMinus");
  const betPlus = $("#betPlus");
  const chips = [...document.querySelectorAll(".chip")];

  const diffEasy = $("#diffEasy");
  const diffHard = $("#diffHard");

  const ladderEl = $("#ladder");

  const stepVal = $("#stepVal");
  const xVal = $("#xVal");
  const potVal = $("#potVal");

  const hudStep = $("#hudStep");
  const hudX = $("#hudX");

  const startBtn = $("#startBtn");
  const cashoutBtn = $("#cashoutBtn");
  const resetBtn = $("#resetBtn");
  const statusLine = $("#statusLine");

  const infoDiff = $("#infoDiff");
  const infoBet = $("#infoBet");
  const infoCash = $("#infoCash");
  const infoSeries = $("#infoSeries");

  const gridEl = $("#grid");
  const glovesEl = $("#gloves");
  const ballEl = $("#ball");

  // ====== AUDIO (simple WebAudio) ======
  let audioEnabled = true;
  let ac = null;

  function beep(type = "kick") {
    if (!audioEnabled) return;
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      const now = ac.currentTime;

      const o = ac.createOscillator();
      const g = ac.createGain();
      o.connect(g);
      g.connect(ac.destination);

      if (type === "kick") {
        o.type = "triangle";
        o.frequency.setValueAtTime(260, now);
        o.frequency.exponentialRampToValueAtTime(120, now + 0.08);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.10);
        o.start(now);
        o.stop(now + 0.11);
      } else if (type === "goal") {
        o.type = "sine";
        o.frequency.setValueAtTime(520, now);
        o.frequency.setValueAtTime(660, now + 0.06);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.16, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        o.start(now);
        o.stop(now + 0.20);
      } else if (type === "save") {
        o.type = "square";
        o.frequency.setValueAtTime(180, now);
        o.frequency.exponentialRampToValueAtTime(90, now + 0.12);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
        o.start(now);
        o.stop(now + 0.18);
      }
    } catch {}
  }

  function setSoundUI() {
    soundText.textContent = audioEnabled ? "Звук on" : "Звук off";
    soundDot.classList.toggle("off", !audioEnabled);
  }

  // ====== RNG ======
  function rngInt(min, max) {
    // inclusive min..max
    const range = max - min + 1;
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return min + (arr[0] % range);
  }

  // ====== GAME CONFIG ======
  const GRID_ROWS = 3;
  const GRID_COLS = 5;
  const CELLS = GRID_ROWS * GRID_COLS;

  // Fixed ladders (feel "arcade", like your other modes)
  // Step i (1-based) => multiplier
  const LADDER_EASY = [1.25, 1.55, 1.95, 2.50, 3.30, 4.40, 6.20, 9.10, 14.00, 22.50, 38.00, 70.00];
  const LADDER_HARD = [1.35, 1.75, 2.35, 3.20, 4.20, 5.50, 7.20, 9.40, 12.50, 17.00, 25.00, 40.00];

  // Easy covers 2 adjacent zones; Hard covers 3 adjacent zones
  const COVER_EASY = 2;
  const COVER_HARD = 3;

  // Movement speed (ms)
  const MOVE_EASY = 520;
  const MOVE_HARD = 420;

  // ====== STATE ======
  let wallet = loadWallet();
  let difficulty = "easy"; // "easy" | "hard"
  let inSeries = false;
  let bet = clampBet(parseInt(betInput.value || "100", 10));
  let step = 0; // goals in a row
  let betPaid = false; // bet deducted once per series
  let movingTimer = null;
  let lastGlovePos = null; // {r,c} top-left of glove group in cell coords
  let isAnimatingShot = false;

  // ====== INIT UI ======
  elBalance.textContent = String(wallet);

  buildGrid();
  renderAll();

  // ====== EVENTS ======
  soundBtn.addEventListener("click", () => {
    audioEnabled = !audioEnabled;
    setSoundUI();
  });
  setSoundUI();

  bonusBtn.addEventListener("click", () => {
    wallet += 1000;
    saveWallet(wallet);
    elBalance.textContent = String(wallet);
  });

  betMinus.addEventListener("click", () => setBet(bet - 10));
  betPlus.addEventListener("click", () => setBet(bet + 10));
  betInput.addEventListener("change", () => setBet(parseInt(betInput.value || "0", 10)));
  betInput.addEventListener("input", () => {
    // keep only digits
    betInput.value = betInput.value.replace(/[^\d]/g, "");
  });

  chips.forEach(btn => {
    btn.addEventListener("click", () => {
      const v = btn.dataset.chip;
      if (v === "max") setBet(wallet);
      else setBet(parseInt(v, 10));
    });
  });

  diffEasy.addEventListener("click", () => {
    if (inSeries) return; // locked during series
    difficulty = "easy";
    diffEasy.classList.add("active");
    diffHard.classList.remove("active");
    renderAll();
  });
  diffHard.addEventListener("click", () => {
    if (inSeries) return;
    difficulty = "hard";
    diffHard.classList.add("active");
    diffEasy.classList.remove("active");
    renderAll();
  });

  startBtn.addEventListener("click", () => {
    if (inSeries) return;
    bet = clampBet(parseInt(betInput.value || "0", 10));
    if (bet <= 0) return setStatus("Ставка должна быть больше 0.");
    if (bet > wallet) return setStatus("Недостаточно средств на балансе.");

    // Start series, deduct bet once
    wallet -= bet;
    saveWallet(wallet);
    elBalance.textContent = String(wallet);

    inSeries = true;
    betPaid = true;
    step = 0;
    isAnimatingShot = false;

    lockControls(true);
    setStatus("Серия началась. Выбери зону удара.");
    startGlovesMove();
    renderAll();
  });

  cashoutBtn.addEventListener("click", () => {
    if (!inSeries) return;
    if (step <= 0) return;
    const x = currentX();
    const win = Math.floor(bet * x);

    wallet += win;
    saveWallet(wallet);
    elBalance.textContent = String(wallet);

    setStatus(`Кэшаут: +${win} ₽ (x${x.toFixed(2)})`);
    endSeries();
  });

  resetBtn.addEventListener("click", () => {
    // If series started and player didn't score yet -> refund bet (quality of life)
    if (inSeries && betPaid && step === 0 && !isAnimatingShot) {
      wallet += bet;
      saveWallet(wallet);
      elBalance.textContent = String(wallet);
      setStatus("Сброс: ставка возвращена.");
    } else {
      setStatus("Сброс.");
    }
    endSeries(true);
  });

  // ====== GRID ======
  function buildGrid() {
    gridEl.innerHTML = "";
    for (let i = 0; i < CELLS; i++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.idx = String(i);

      const glow = document.createElement("div");
      glow.className = "hitGlow";
      cell.appendChild(glow);

      cell.addEventListener("click", () => onShoot(i));
      gridEl.appendChild(cell);
    }
  }

  function setGridEnabled(enabled) {
    [...gridEl.children].forEach(c => c.classList.toggle("disabled", !enabled));
  }

  // ====== GLOVES MOVEMENT ======
  function startGlovesMove() {
    stopGlovesMove();
    // Immediately place once
    moveGlovesRandom(true);

    const interval = (difficulty === "easy") ? MOVE_EASY : MOVE_HARD;
    movingTimer = setInterval(() => moveGlovesRandom(false), interval);
  }

  function stopGlovesMove() {
    if (movingTimer) clearInterval(movingTimer);
    movingTimer = null;
  }

  // We move a "group" that covers 2 or 3 adjacent cells horizontally in the same row.
  // The visual gloves are a pair, moving together.
  function moveGlovesRandom(force) {
    if (!inSeries) return;
    if (isAnimatingShot) return;

    const cover = (difficulty === "easy") ? COVER_EASY : COVER_HARD; // 2 or 3
    const maxStartCol = GRID_COLS - cover;
    const r = rngInt(0, GRID_ROWS - 1);
    const c = rngInt(0, maxStartCol);

    // Avoid repeating exact same position often
    if (!force && lastGlovePos && lastGlovePos.r === r && lastGlovePos.c === c) return;

    lastGlovePos = { r, c };

    // Convert to pixel translate inside goal frame using grid element geometry
    const gridRect = gridEl.getBoundingClientRect();
    const cell0 = gridEl.children[0].getBoundingClientRect();

    // We compute cell size including gap using gridRect width/cols approx
    const gapX = inferGapX();
    const gapY = inferGapY();

    const cellW = cell0.width;
    const cellH = cell0.height;

    const x = c * (cellW + gapX) + 10; // 10 is grid padding feel
    const y = r * (cellH + gapY) + 10;

    // Constrain inside grid area
    const maxX = gridRect.width - (cover * cellW + (cover - 1) * gapX) - 10;
    const maxY = gridRect.height - cellH - 10;

    const cx = clamp(x, 10, maxX);
    const cy = clamp(y, 10, maxY);

    glovesEl.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
  }

  function inferGapX() {
    // read from computed style of grid gap
    const cs = getComputedStyle(gridEl);
    const gap = cs.columnGap || cs.gap || "10px";
    return parseFloat(gap) || 10;
  }
  function inferGapY() {
    const cs = getComputedStyle(gridEl);
    const gap = cs.rowGap || cs.gap || "10px";
    return parseFloat(gap) || 10;
  }

  // ====== SHOT LOGIC ======
  async function onShoot(idx) {
    if (!inSeries) return setStatus("Сначала нажми «Ставка ⚽».");
    if (isAnimatingShot) return;

    // lock clicks during anim
    isAnimatingShot = true;
    setGridEnabled(false);

    // Stop movement so the gloves position is "real"
    stopGlovesMove();

    // Compute save zones based on glove position (cover size)
    const cover = (difficulty === "easy") ? COVER_EASY : COVER_HARD;
    const saveSet = computeSaveSetFromGloves(cover);

    // Animate ball to chosen cell
    beep("kick");
    await animateBallToCell(idx);

    // Resolve
    const saved = saveSet.has(idx);

    if (saved) {
      beep("save");
      setStatus("Сейв! Ставка сгорела. Серия завершена.");
      // lose: series ends
      endSeries();
      return;
    }

    // Goal
    beep("goal");
    step += 1;
    const x = currentX();

    // Auto-cashout at end of ladder
    const maxStep = ladderArr().length;
    if (step >= maxStep) {
      const win = Math.floor(bet * x);
      wallet += win;
      saveWallet(wallet);
      elBalance.textContent = String(wallet);

      setStatus(`ГОЛ! Авто-кэшаут: +${win} ₽ (x${x.toFixed(2)})`);
      endSeries();
      return;
    }

    setStatus(`ГОЛ! Шаг ${step}. Можно кэшаут.`);
    // Resume movement & enable grid
    isAnimatingShot = false;
    setGridEnabled(true);
    startGlovesMove();
    renderAll();
  }

  function computeSaveSetFromGloves(cover) {
    // If gloves never placed, fallback random cover
    if (!lastGlovePos) {
      const r = rngInt(0, GRID_ROWS - 1);
      const c = rngInt(0, GRID_COLS - cover);
      lastGlovePos = { r, c };
    }
    const set = new Set();
    const base = lastGlovePos.r * GRID_COLS + lastGlovePos.c;
    for (let i = 0; i < cover; i++) set.add(base + i);
    return set;
  }

  function animateBallToCell(idx) {
    return new Promise((resolve) => {
      // reset ball
      ballEl.style.opacity = "1";
      ballEl.style.transition = "none";
      ballEl.style.transform = "translate3d(0,0,0) scale(1)";

      // ball starts near bottom-left of goal (inside)
      const gridRect = gridEl.getBoundingClientRect();
      const cellRect = gridEl.children[idx].getBoundingClientRect();

      // start pos (relative to goalFrame)
      const frameRect = gridEl.parentElement.getBoundingClientRect();

      const startX = 18;
      const startY = frameRect.height - 46;

      const targetX = (cellRect.left - frameRect.left) + (cellRect.width / 2) - 11;
      const targetY = (cellRect.top - frameRect.top) + (cellRect.height / 2) - 11;

      // apply start position
      ballEl.style.left = `${startX}px`;
      ballEl.style.top = `${startY}px`;

      // force reflow
      ballEl.getBoundingClientRect();

      // animate with transition (no trails)
      const dx = targetX - startX;
      const dy = targetY - startY;

      ballEl.style.transition = "transform 320ms cubic-bezier(.2,.9,.2,1), opacity 220ms ease";
      ballEl.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(0.9)`;

      // finish
      setTimeout(() => {
        ballEl.style.opacity = "0";
        // clear instantly so next shot starts clean
        setTimeout(() => {
          ballEl.style.transition = "none";
          ballEl.style.transform = "translate3d(0,0,0) scale(1)";
          resolve();
        }, 60);
      }, 360);
    });
  }

  // ====== SERIES END ======
  function endSeries(isSoft = false) {
    stopGlovesMove();
    inSeries = false;
    betPaid = false;
    isAnimatingShot = false;

    // unlock
    lockControls(false);
    setGridEnabled(false);

    // reset values
    step = 0;

    // keep diff as is, keep bet
    renderAll();
  }

  function lockControls(locked) {
    // When series is active: lock bet & difficulty; enable cashout after step>=1
    betInput.disabled = locked;
    betMinus.disabled = locked;
    betPlus.disabled = locked;
    chips.forEach(c => c.disabled = locked);

    diffEasy.disabled = locked;
    diffHard.disabled = locked;

    startBtn.disabled = locked;

    cashoutBtn.disabled = !(locked && step >= 1);
  }

  // ====== RENDER ======
  function ladderArr() {
    return difficulty === "easy" ? LADDER_EASY : LADDER_HARD;
  }

  function currentX() {
    if (step <= 0) return 1.0;
    const arr = ladderArr();
    return arr[Math.min(step - 1, arr.length - 1)];
  }

  function renderAll() {
    // bet
    bet = clampBet(parseInt(betInput.value || "0", 10));
    infoBet.textContent = `${bet} ₽`;

    // difficulty
    infoDiff.textContent = (difficulty === "easy") ? "Лёгкий" : "Сложный";

    // series
    infoSeries.textContent = inSeries ? "ON" : "OFF";

    // step / x / potential
    const x = currentX();
    const potential = inSeries ? Math.floor(bet * x) : 0;

    stepVal.textContent = String(step);
    xVal.textContent = `x${x.toFixed(2)}`;
    potVal.textContent = `${potential} ₽`;

    hudStep.textContent = String(step);
    hudX.textContent = `x${x.toFixed(2)}`;

    infoCash.textContent = (step >= 1 && inSeries) ? `${potential} ₽` : "—";

    // cashout enabled?
    cashoutBtn.disabled = !(inSeries && step >= 1);

    // ladder render
    renderLadder();

    // grid enabled only when inSeries and not animating
    setGridEnabled(inSeries && !isAnimatingShot);

    // keep controls lock state in sync
    lockControls(inSeries);

    // active ladder highlight
    highlightStep(step);
  }

  function renderLadder() {
    const arr = ladderArr();
    ladderEl.innerHTML = "";
    for (let i = 0; i < arr.length; i++) {
      const d = document.createElement("div");
      d.className = "lStep";
      d.innerHTML = `
        <div class="t">Шаг ${i + 1}</div>
        <div class="x">x${arr[i].toFixed(2)}</div>
      `;
      ladderEl.appendChild(d);
    }
    highlightStep(step);
  }

  function highlightStep(s) {
    [...ladderEl.children].forEach((el, i) => {
      el.classList.toggle("active", (i === s - 1 && s > 0));
    });
  }

  function setStatus(text) {
    statusLine.textContent = text;
  }

  // ====== BET HELPERS ======
  function clampBet(v) {
    if (!Number.isFinite(v)) return 0;
    v = Math.floor(v);
    if (v < 0) v = 0;
    // cap to some large value to prevent overflow
    if (v > 1_000_000_000) v = 1_000_000_000;
    return v;
  }

  function setBet(v) {
    if (inSeries) return; // locked during series
    v = clampBet(v);
    betInput.value = String(v);
    bet = v;
    renderAll();
  }

  // ====== WALLET ======
  function loadWallet() {
    const raw = localStorage.getItem(WALLET_KEY);
    const n = parseInt(raw || "", 10);
    return Number.isFinite(n) && n >= 0 ? n : 1000;
  }
  function saveWallet(v) {
    localStorage.setItem(WALLET_KEY, String(v));
  }

  // ====== UTIL ======
  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

  // Initial UI state
  setGridEnabled(false);

  // Keep gloves inside on resize (recompute current translate)
  window.addEventListener("resize", () => {
    if (!inSeries) return;
    moveGlovesRandom(true);
  });
})();
