(() => {
  "use strict";

  const WALLET_KEY = "mini_wallet_penalty_v1";
  const SOUND_KEY  = "penalty_sound_on_v1";

  // 12 шагов (фиксированные лестницы)
  const LADDER = {
    easy: [1.25, 1.55, 1.95, 2.50, 3.30, 4.40, 6.20, 9.10, 14.00, 22.50, 38.00, 70.00],
    hard: [1.35, 1.75, 2.35, 3.20, 4.20, 5.50, 7.20, 9.40, 12.80, 18.50, 28.00, 45.00]
  };

  // DOM
  const $ = (id) => document.getElementById(id);

  const balEl = $("bal");
  const bonusBtn = $("bonusBtn");

  const soundBtn = $("soundBtn");
  const soundText = $("soundText");

  const betInput = $("betInput");
  const betMinus = $("betMinus");
  const betPlus = $("betPlus");
  const betMax = $("betMax");
  const chipBtns = [...document.querySelectorAll(".chip[data-chip]")];

  const diffEasyBtn = $("diffEasy");
  const diffHardBtn = $("diffHard");
  const diffDesc = $("diffDesc");

  const ladderEl = $("ladder");

  const stepVal = $("stepVal");
  const xVal = $("xVal");
  const potVal = $("potVal");

  const miniStep = $("miniStep");
  const miniX = $("miniX");

  const placeBetBtn = $("placeBetBtn");
  const cashoutBtn = $("cashoutBtn");
  const resetBtn = $("resetBtn");

  const statusText = $("statusText");

  const seriesToggle = $("seriesToggle");

  const infoDiff = $("infoDiff");
  const infoBet = $("infoBet");
  const infoCash = $("infoCash");
  const infoSeries = $("infoSeries");

  const goalGrid = $("goalGrid");
  const handsEl = $("hands");
  const gloveL = handsEl.querySelector(".gloveL");
  const gloveR = handsEl.querySelector(".gloveR");
  const ballEl = $("ball");

  // State
  let balance = loadBalance();
  let soundOn = loadSound();

  let diff = "easy"; // easy | hard
  let bet = 100;

  let inSeries = false;      // ставка принята (серия активна)
  let step = 0;              // 0..ladderLen
  let currentX = 1.0;        // x1.00 at step 0
  let locked = false;        // блок на анимацию/клик

  // keeper movement
  let keeperPair = [6, 7];   // 2 клетки (индексы 0..14)
  let keeperTimer = null;

  // grid cells
  const cells = [];
  buildGrid();

  // sounds (WebAudio, без файлов)
  const audio = makeAudio();

  // init UI
  syncBalance();
  setSoundUI();
  setBetUI(bet);
  renderLadder();
  updateAllNumbers();
  startKeeperMoving(); // до ставки пусть двигаются (красиво)

  // ======================
  // Helpers
  // ======================

  function loadBalance() {
    const raw = localStorage.getItem(WALLET_KEY);
    const n = raw ? Number(raw) : 1000;
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 1000;
  }
  function saveBalance() {
    localStorage.setItem(WALLET_KEY, String(balance));
  }

  function loadSound() {
    const raw = localStorage.getItem(SOUND_KEY);
    if (raw === null) return true;
    return raw === "1";
  }
  function saveSound() {
    localStorage.setItem(SOUND_KEY, soundOn ? "1" : "0");
  }

  function rngInt(maxExclusive) {
    // 0..maxExclusive-1
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % maxExclusive;
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function money(n) {
    return `${Math.floor(n)} ₽`;
  }

  function setStatus(txt) {
    statusText.textContent = txt;
  }

  function syncBalance() {
    balEl.textContent = String(balance);
    saveBalance();
  }

  function setSoundUI() {
    soundText.textContent = soundOn ? "Звук on" : "Звук off";
    soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
    const dot = soundBtn.querySelector(".dot");
    if (dot) dot.style.background = soundOn ? "var(--good1)" : "rgba(255,255,255,.35)";
  }

  function setBetUI(v) {
    bet = clamp(Math.floor(v || 0), 1, 10_000_000);
    betInput.value = String(bet);
    infoBet.textContent = money(bet);
  }

  function ladderArr() {
    return diff === "easy" ? LADDER.easy : LADDER.hard;
  }

  function currentPotential() {
    if (!inSeries || step === 0) return 0;
    return bet * currentX;
  }

  function updateAllNumbers() {
    stepVal.textContent = String(step);
    xVal.textContent = `x${currentX.toFixed(2)}`;
    potVal.textContent = money(currentPotential());

    miniStep.textContent = String(step);
    miniX.textContent = `x${currentX.toFixed(2)}`;

    infoDiff.textContent = diff === "easy" ? "Лёгкий" : "Сложный";
    infoSeries.textContent = seriesToggle.checked ? "ON" : "OFF";
    infoCash.textContent = (inSeries && step > 0) ? money(currentPotential()) : "—";

    cashoutBtn.disabled = !(inSeries && step > 0 && !locked);
    placeBetBtn.disabled = inSeries || locked;
  }

  function renderLadder() {
    const arr = ladderArr();
    ladderEl.innerHTML = "";
    arr.forEach((x, i) => {
      const el = document.createElement("div");
      el.className = "step";
      el.dataset.i = String(i + 1);
      el.innerHTML = `
        <div class="sTitle">Шаг ${i + 1}</div>
        <div class="sX">x${x.toFixed(2)}</div>
      `;
      ladderEl.appendChild(el);
    });
    highlightLadder();
  }

  function highlightLadder() {
    const steps = [...ladderEl.querySelectorAll(".step")];
    steps.forEach(s => s.classList.remove("active"));
    if (step > 0) {
      const active = ladderEl.querySelector(`.step[data-i="${step}"]`);
      if (active) active.classList.add("active");
    }
  }

  function resetCellsVisual() {
    cells.forEach(c => {
      c.classList.remove("showGoal", "showSave");
      const hit = c.querySelector(".hit");
      if (hit) hit.textContent = "";
    });
  }

  // ======================
  // Build grid + keeper geometry
  // ======================

  function buildGrid() {
    goalGrid.innerHTML = "";
    for (let i = 0; i < 15; i++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.idx = String(i);
      cell.innerHTML = `<div class="hit"></div>`;
      cell.addEventListener("click", () => onShoot(i));
      goalGrid.appendChild(cell);
      cells.push(cell);
    }
  }

  // Convert index -> row/col for 3x5
  function idxToRC(idx) {
    const r = Math.floor(idx / 5);
    const c = idx % 5;
    return { r, c };
  }

  // Keepers: 2 adjacent zones (horiz/vert) to look like two hands together
  function pickKeeperPair() {
    // hard = чаще около центра, easy = равномернее
    const candidates = [];
    for (let idx = 0; idx < 15; idx++) {
      const { r, c } = idxToRC(idx);
      // adjacency options (right, left, down, up) but we want two hands close: prefer horizontal pair
      const opts = [];
      if (c < 4) opts.push(idx + 1); // right
      if (r < 2) opts.push(idx + 5); // down
      for (const j of opts) {
        // score
        let score = 1;
        if (diff === "hard") {
          // bias to center-ish
          const { r: r2, c: c2 } = idxToRC(j);
          const centerBias = (3 - Math.abs(c - 2)) + (2 - Math.abs(r - 1))
                           + (3 - Math.abs(c2 - 2)) + (2 - Math.abs(r2 - 1));
          score += centerBias * 2;
          // prefer horizontal pair (looks like two hands)
          if (j === idx + 1) score += 4;
        } else {
          if (j === idx + 1) score += 2;
        }
        candidates.push({ a: idx, b: j, w: score });
      }
    }

    // weighted pick
    let total = 0;
    for (const x of candidates) total += x.w;
    let t = rngInt(total);
    for (const x of candidates) {
      t -= x.w;
      if (t < 0) return [x.a, x.b];
    }
    return [6, 7];
  }

  // Place gloves to cover exactly those two cells, never outside goalGrid
  function placeHands(pair, smooth = true) {
    keeperPair = pair.slice(0, 2);

    const a = cells[keeperPair[0]].getBoundingClientRect();
    const b = cells[keeperPair[1]].getBoundingClientRect();
    const p = goalGrid.getBoundingClientRect();

    const ax = a.left - p.left;
    const ay = a.top - p.top;
    const bx = b.left - p.left;
    const by = b.top - p.top;

    const w = a.width;
    const h = a.height;

    // Two gloves sit centered in their cells, with tiny jitter inside those cells (realistic), but never leaving
    const jitter = smooth ? 0.10 : 0.0; // fraction of cell
    const jx1 = (Math.random() - 0.5) * w * jitter;
    const jy1 = (Math.random() - 0.5) * h * jitter;
    const jx2 = (Math.random() - 0.5) * w * jitter;
    const jy2 = (Math.random() - 0.5) * h * jitter;

    const dur = diff === "hard" ? 220 : 280;
    gloveL.style.transition = `transform ${dur}ms cubic-bezier(.2,.9,.2,1)`;
    gloveR.style.transition = `transform ${dur}ms cubic-bezier(.2,.9,.2,1)`;

    gloveL.style.transform = `translate3d(${ax + jx1}px, ${ay + jy1}px, 0)`;
    gloveR.style.transform = `translate3d(${bx + jx2}px, ${by + jy2}px, 0)`;

    // slight tilt toward movement
    const dx = (bx - ax);
    const tilt = clamp(dx / w, -1, 1) * 6;
    gloveL.style.rotate = `${-tilt}deg`;
    gloveR.style.rotate = `${tilt}deg`;
  }

  function startKeeperMoving() {
    stopKeeperMoving();
    // place immediately
    placeHands(pickKeeperPair(), true);

    const interval = diff === "hard" ? 520 : 700;
    keeperTimer = setInterval(() => {
      if (locked) return;
      // Only move freely when waiting for a shot (or before bet too for vibe)
      placeHands(pickKeeperPair(), true);
    }, interval);
  }

  function stopKeeperMoving() {
    if (keeperTimer) {
      clearInterval(keeperTimer);
      keeperTimer = null;
    }
  }

  // ======================
  // Game actions
  // ======================

  function canPlaceBet() {
    return !inSeries && !locked && bet > 0 && bet <= balance;
  }

  function placeBet() {
    if (!canPlaceBet()) {
      if (bet > balance) setStatus("Недостаточно средств для ставки.");
      return;
    }
    balance -= bet;
    syncBalance();

    inSeries = true;
    step = 0;
    currentX = 1.0;

    resetCellsVisual();
    highlightLadder();
    updateAllNumbers();

    setStatus("Серия началась. Выбери зону удара в воротах.");
    if (soundOn) audio.click();
  }

  function cashout() {
    if (!(inSeries && step > 0) || locked) return;

    const win = Math.floor(bet * currentX);
    balance += win;
    syncBalance();

    setStatus(`Кэшаут: +${money(win)}. Можно начинать заново.`);
    if (soundOn) audio.cash();

    // End series
    inSeries = false;
    step = 0;
    currentX = 1.0;

    resetCellsVisual();
    highlightLadder();
    updateAllNumbers();
  }

  function resetAll() {
    // если серия активна и был старт — возвращаем ставку ТОЛЬКО если еще 0 шагов (не было голов)
    // (как в твоих других режимах: до результата можно вернуть)
    if (inSeries && step === 0 && !locked) {
      balance += bet;
      syncBalance();
      setStatus(`Сброс: ставка ${money(bet)} возвращена.`);
    } else {
      setStatus("Сброс: готово.");
    }

    inSeries = false;
    step = 0;
    currentX = 1.0;
    locked = false;

    resetCellsVisual();
    highlightLadder();
    updateAllNumbers();

    if (soundOn) audio.click();
  }

  function onShoot(idx) {
    if (!inSeries || locked) return;

    locked = true;
    updateAllNumbers();

    // lock keeper position at the moment of shot (no moving during)
    stopKeeperMoving();

    const saved = (idx === keeperPair[0] || idx === keeperPair[1]);

    // fly ball to target cell center
    flyBallToCell(idx);

    // reveal after short delay
    setTimeout(() => {
      showResultOnCell(idx, saved ? "save" : "goal");

      if (saved) {
        // lose
        if (soundOn) audio.save();
        setStatus(`Сейв! Ставка ${money(bet)} сгорела. Нажми «Ставка» для новой игры.`);

        inSeries = false;
        step = 0;
        currentX = 1.0;

        highlightLadder();
        updateAllNumbers();

        // resume keeper moving for vibe
        locked = false;
        startKeeperMoving();

        // clear cell marks shortly (без “следов”)
        setTimeout(() => {
          resetCellsVisual();
        }, 650);

        return;
      }

      // GOAL
      if (soundOn) audio.goal();
      step = step + 1;

      const arr = ladderArr();
      if (step > arr.length) step = arr.length;
      currentX = arr[step - 1];

      highlightLadder();
      updateAllNumbers();

      const pot = money(currentPotential());
      setStatus(`Гол! Шаг ${step}, текущий выигрыш: ${pot}.`);

      // if series toggle OFF => auto cashout after 1 goal
      if (!seriesToggle.checked) {
        setTimeout(() => {
          locked = false;
          cashout();
          startKeeperMoving();
        }, 350);
        return;
      }

      // if reached last step => auto cashout (по твоей логике “в финалах” это ок)
      if (step >= ladderArr().length) {
        setTimeout(() => {
          locked = false;
          setStatus("Максимальный шаг! Авто-кэшаут.");
          cashout();
          startKeeperMoving();
        }, 450);
        return;
      }

      // continue: unlock and keeper moves again
      locked = false;
      updateAllNumbers();
      startKeeperMoving();

      // clear cell marks shortly (чтобы не было “следов”)
      setTimeout(() => {
        resetCellsVisual();
      }, 520);
    }, 420);
  }

  function showResultOnCell(idx, type) {
    resetCellsVisual();
    const cell = cells[idx];
    const hit = cell.querySelector(".hit");
    if (type === "goal") {
      cell.classList.add("showGoal");
      if (hit) hit.textContent = "ГОЛ";
    } else {
      cell.classList.add("showSave");
      if (hit) hit.textContent = "СЕЙВ";
    }
  }

  function flyBallToCell(idx) {
    const c = cells[idx].getBoundingClientRect();
    const g = $("ball").offsetParent ? $("ball").offsetParent.getBoundingClientRect() : document.body.getBoundingClientRect();
    // We'll position ball relative to goalFrame
    const frame = document.querySelector(".goalFrame").getBoundingClientRect();

    const cx = (c.left + c.width / 2) - frame.left;
    const cy = (c.top + c.height / 2) - frame.top;

    ballEl.style.left = `${cx}px`;
    ballEl.style.top = `${cy}px`;
    ballEl.style.animation = "none";
    // restart animation
    // eslint-disable-next-line no-unused-expressions
    ballEl.offsetHeight;
    ballEl.style.animation = "fly 420ms cubic-bezier(.2,.9,.2,1) forwards";
  }

  // ======================
  // Events
  // ======================

  bonusBtn.addEventListener("click", () => {
    balance += 1000;
    syncBalance();
    setStatus("Бонус +1000 ₽ добавлен.");
    if (soundOn) audio.bonus();
  });

  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    saveSound();
    setSoundUI();
    if (soundOn) audio.click();
  });

  function applyDiff(newDiff) {
    diff = newDiff;
    diffEasyBtn.classList.toggle("active", diff === "easy");
    diffHardBtn.classList.toggle("active", diff === "hard");
    diffDesc.textContent = diff === "easy"
      ? "Лёгкий: руки двигаются спокойнее"
      : "Сложный: руки двигаются быстрее и чаще в центре";

    renderLadder();
    // update keeper movement speed immediately
    startKeeperMoving();
    updateAllNumbers();
    if (soundOn) audio.click();
  }

  diffEasyBtn.addEventListener("click", () => { if (!inSeries) applyDiff("easy"); });
  diffHardBtn.addEventListener("click", () => { if (!inSeries) applyDiff("hard"); });

  chipBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      setBetUI(Number(btn.dataset.chip));
      if (soundOn) audio.click();
    });
  });

  betMinus.addEventListener("click", () => { setBetUI(bet - 10); if (soundOn) audio.click(); });
  betPlus.addEventListener("click", () => { setBetUI(bet + 10); if (soundOn) audio.click(); });

  betMax.addEventListener("click", () => {
    setBetUI(balance);
    if (soundOn) audio.click();
  });

  betInput.addEventListener("input", () => {
    const v = Number(String(betInput.value).replace(/[^\d]/g, "")) || 0;
    setBetUI(v);
    updateAllNumbers();
  });

  placeBetBtn.addEventListener("click", () => {
    placeBet();
    updateAllNumbers();
  });

  cashoutBtn.addEventListener("click", () => {
    cashout();
    updateAllNumbers();
  });

  resetBtn.addEventListener("click", () => {
    resetAll();
  });

  seriesToggle.addEventListener("change", () => {
    updateAllNumbers();
    if (soundOn) audio.click();
  });

  // ======================
  // Audio (simple)
  // ======================
  function makeAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = Ctx ? new Ctx() : null;

    function beep(freq, dur, type="sine", gain=0.06) {
      if (!ctx || !soundOn) return;
      const now = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gain, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(now);
      o.stop(now + dur + 0.02);
    }

    function noise(dur=0.18, gain=0.05) {
      if (!ctx || !soundOn) return;
      const bufferSize = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * (1 - i/bufferSize);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g);
      g.connect(ctx.destination);
      src.start();
    }

    // public API
    return {
      click() { beep(520, 0.06, "triangle", 0.045); },
      bonus() { beep(740, 0.06, "triangle", 0.05); setTimeout(()=>beep(980,0.07,"triangle",0.05), 70); },
      goal()  { beep(660, 0.08, "sine", 0.055); setTimeout(()=>beep(880,0.10,"sine",0.06), 90); },
      save()  { noise(0.16, 0.06); setTimeout(()=>beep(220,0.10,"sawtooth",0.045), 40); },
      cash()  { beep(620,0.07,"triangle",0.05); setTimeout(()=>beep(780,0.09,"triangle",0.055), 90); }
    };
  }

  // First user interaction unlocks AudioContext on iOS
  window.addEventListener("pointerdown", () => {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      ctx.resume?.();
      ctx.close?.();
    } catch(_) {}
  }, { once:true });

})();