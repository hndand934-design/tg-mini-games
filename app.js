(() => {
  // =========================
  // Utils
  // =========================
  const $ = (id) => document.getElementById(id);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const fmt = (n) => Math.round(n).toString();
  const fmtX = (x) => x.toFixed(2);

  // =========================
  // DOM
  // =========================
  const balEl = $("bal");
  const betInput = $("betInput");
  const betMinus = $("betMinus");
  const betPlus = $("betPlus");
  const chips = document.querySelectorAll(".chip");
  const diffSelect = $("diffSelect");

  const startBtn = $("startBtn");
  const cashBtn = $("cashBtn");
  const goBtn = $("goBtn");

  const profitEl = $("profit");
  const profitXEl = $("profitX");

  const curXEl = $("curX");
  const stepEl = $("step");

  const tipEl = $("tip");
  const hintLine = $("hintLine");

  const modeOut = $("modeOut");
  const betOut = $("betOut");
  const cashOut = $("cashOut");

  const laneArea = $("laneArea");
  const chickenEl = $("chicken");
  const fxEl = $("fx");

  const soundBtn = $("soundBtn");
  const soundLabel = $("soundLabel");

  // =========================
  // Audio (quiet)
  // =========================
  let audioCtx = null;
  let soundOn = true;

  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  function beep(freq = 520, dur = 0.06, gain = 0.05, type = "sine") {
    if (!soundOn) return;
    ensureAudio();
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function sStart(){ beep(420, .07, .05, "triangle"); beep(520, .07, .04, "triangle"); }
  function sHop(){ beep(650, .05, .035, "sine"); }
  function sWin(){ beep(520, .07, .05, "triangle"); beep(780, .08, .05, "triangle"); }
  function sLose(){ beep(240, .12, .05, "sawtooth"); }

  // =========================
  // Persist balance
  // =========================
  const LS_BAL = "chickenroad_balance_v1";
  function loadBal() {
    const v = Number(localStorage.getItem(LS_BAL));
    return Number.isFinite(v) ? v : 1000;
  }
  function saveBal(v) {
    localStorage.setItem(LS_BAL, String(v));
  }

  // =========================
  // Game config
  // =========================
  const LANES = 8;          // steps/rows
  const COLS = 6;           // hatches per lane
  const LANE_PADDING_TOP = 18;
  const LANE_PADDING_LEFT = 18;

  // Multipliers tuned to avoid “easy duping”
  // Low: slower growth (cars only)
  // Expert: faster growth (more hazards)
  const MULTI_LOW =    [1.08, 1.14, 1.22, 1.31, 1.42, 1.56, 1.74, 1.96];
  const MULTI_EXPERT = [1.12, 1.23, 1.40, 1.62, 1.90, 2.25, 2.70, 3.30];

  // Hazard chances per lane (not too harsh early)
  const HZ = {
    low:    { car: 0.20 },                         // per chosen hatch
    expert: { car: 0.24, fire: 0.10, hole: 0.08 }, // per chosen hatch
  };

  // =========================
  // State
  // =========================
  let balance = loadBal();
  let bet = 100;

  let running = false;
  let step = 0;           // 0..LANES
  let curX = 1.0;

  let difficulty = "low";
  let ladder = MULTI_LOW;

  let selectedCol = null; // 0..COLS-1
  let lockedThroughLane = -1;
  let animating = false;

  // Lanes DOM refs
  let laneRoot = null;
  let trafficLayer = null;
  let hatchGrid = []; // [laneIndex][col] => element
  let barriers = [];  // laneIndex => element
  let cars = [];      // active cars {el, lane, x, y, speed}

  // =========================
  // Render init
  // =========================
  function setBalanceUI() {
    balEl.textContent = fmt(balance);
    saveBal(balance);
  }

  function setBetUI() {
    betInput.value = String(bet);
    betOut.textContent = fmt(bet);
  }

  function setModeUI() {
    modeOut.textContent = difficulty === "low" ? "Низкий" : "Эксперт";
  }

  function setXUI() {
    curXEl.textContent = `${fmtX(curX)}x`;
    stepEl.textContent = String(step);
    profitXEl.textContent = `x${fmtX(curX)}`;
  }

  function setProfitUI(val = 0) {
    profitEl.textContent = fmt(val);
  }

  function setCashOutUI(text = "—") {
    cashOut.textContent = text;
  }

  function tip(text) {
    tipEl.innerHTML = text;
    hintLine.innerHTML = text.replace(/<[^>]+>/g, "");
  }

  function buildLadder() {
    const row = $("ladderRow");
    row.innerHTML = "";
    for (let i = 0; i < LANES; i++) {
      const d = document.createElement("div");
      d.className = "stepChip";
      d.textContent = `${ladder[i].toFixed(2)}x`;
      row.appendChild(d);
    }
    highlightLadder();
  }

  function highlightLadder() {
    const chips = Array.from($("ladderRow").children);
    chips.forEach((c, idx) => {
      c.classList.toggle("active", idx === Math.max(0, step - 1));
    });
  }

  function buildRoad() {
    laneArea.innerHTML = "";

    // Main lane root
    laneRoot = document.createElement("div");
    laneRoot.className = "lane";
    laneArea.appendChild(laneRoot);

    // dashed vertical separators
    const markings = document.createElement("div");
    markings.className = "markings";
    for (let i = 0; i < 5; i++) {
      const d = document.createElement("div");
      d.className = "dash";
      markings.appendChild(d);
    }
    laneArea.appendChild(markings);

    // Traffic underlay layer (cars)
    trafficLayer = document.createElement("div");
    trafficLayer.className = "traffic";
    laneArea.appendChild(trafficLayer);

    // Barriers (after each cleared lane)
    barriers = [];
    for (let l = 0; l < LANES; l++) {
      const b = document.createElement("div");
      b.className = "barrier";
      // y position between lanes: compute later in layout tick
      b.style.top = "0px";
      laneArea.appendChild(b);
      barriers.push(b);
    }

    // Hatches grid: one "active lane" at a time visually, но мы рисуем текущую линию как ряд люков.
    // Мы отрисуем все ряды по высоте, чтобы было “как дорога”.
    hatchGrid = Array.from({ length: LANES }, () => Array(COLS).fill(null));

    // Create rows positions
    const { laneW, laneH, cellW, rowY } = computeLayout();
    for (let r = 0; r < LANES; r++) {
      for (let c = 0; c < COLS; c++) {
        const h = document.createElement("div");
        h.className = "hatch";
        h.dataset.r = String(r);
        h.dataset.c = String(c);

        const ring = document.createElement("div");
        ring.className = "ring";
        h.appendChild(ring);

        const icon = document.createElement("div");
        icon.className = "icon";
        h.appendChild(icon);

        const lbl = document.createElement("div");
        lbl.className = "lbl";
        lbl.textContent = `${ladder[r].toFixed(2)}x`;
        h.appendChild(lbl);

        // position absolute manually so we can have multiple rows
        h.style.position = "absolute";
        h.style.left = `${LANE_PADDING_LEFT + c * (cellW)}px`;
        h.style.top  = `${rowY(r)}px`;
        h.style.width = `${cellW - 12}px`; // leave gap
        h.style.height = `62px`;

        h.addEventListener("click", onHatchClick);

        laneRoot.appendChild(h);
        hatchGrid[r][c] = h;
      }
    }

    positionBarriers();
    resetRoadVisual();
    spawnCars();
  }

  function computeLayout() {
    const rect = laneArea.getBoundingClientRect();
    const laneW = rect.width;
    const laneH = rect.height;
    const cellW = laneW / COLS; // columns evenly, gap handled in width
    const rowGap = 16;
    const rowHeight = 62;
    const totalH = LANES * rowHeight + (LANES - 1) * rowGap;
    const topBase = Math.max(18, (laneH - totalH) / 2);

    const rowY = (r) => topBase + r * (rowHeight + rowGap);
    return { laneW, laneH, cellW, rowY, rowHeight, rowGap, topBase };
  }

  function positionBarriers() {
    const { rowY, rowHeight } = computeLayout();
    for (let r = 0; r < LANES; r++) {
      const y = rowY(r) + rowHeight + 6; // between rows
      barriers[r].style.top = `${y}px`;
    }
  }

  window.addEventListener("resize", () => {
    if (!laneRoot) return;
    // recompute hatch positions and barriers
    const { cellW, rowY } = computeLayout();
    for (let r = 0; r < LANES; r++) {
      for (let c = 0; c < COLS; c++) {
        const h = hatchGrid[r][c];
        h.style.left = `${LANE_PADDING_LEFT + c * (cellW)}px`;
        h.style.top  = `${rowY(r)}px`;
        h.style.width = `${cellW - 12}px`;
      }
    }
    positionBarriers();
    // reposition chicken to current
    placeChickenAt(step, selectedCol ?? 0, true);
  });

  // =========================
  // Cars system (vertical)
  // =========================
  function spawnCars() {
    cars = [];
    trafficLayer.innerHTML = "";

    // Create 4 cars with randomized lanes and speeds
    const carCount = 4;
    for (let i = 0; i < carCount; i++) {
      const el = document.createElement("div");
      el.className = "car " + (i % 2 === 0 ? "taxi" : "blue");

      const laneIdx = Math.floor(Math.random() * COLS);
      const speed = 70 + Math.random() * 90; // px/s
      const y = -120 - Math.random() * 260;

      trafficLayer.appendChild(el);

      cars.push({ el, laneIdx, speed, y });
    }
  }

  function updateCars(dt) {
    if (!trafficLayer) return;
    const rect = laneArea.getBoundingClientRect();
    const { cellW } = computeLayout();
    const maxY = rect.height + 120;

    for (const car of cars) {
      car.y += car.speed * dt;
      if (car.y > maxY) {
        car.y = -140 - Math.random() * 240;
        // maybe change lane
        if (Math.random() < 0.35) car.laneIdx = Math.floor(Math.random() * COLS);
      }
      const x = LANE_PADDING_LEFT + car.laneIdx * cellW + (cellW / 2) - 6;
      car.el.style.left = `${x}px`;
      car.el.style.top = `${car.y}px`;
    }
  }

  // Collision check only with chosen target cell during landing moment
  function carCollisionAtCell(r, c) {
    // collision zone y equals hatch center
    const { rowY, rowHeight, cellW } = computeLayout();
    const hatchCenterY = rowY(r) + rowHeight / 2;
    const hatchCenterX = LANE_PADDING_LEFT + c * cellW + (cellW / 2);

    // if any car in same column and its y is near hatch y
    for (const car of cars) {
      if (car.laneIdx !== c) continue;
      const carCenterY = car.y + 32;
      if (Math.abs(carCenterY - hatchCenterY) < 34) return true;
    }
    return false;
  }

  // =========================
  // Road visuals and chicken placement
  // =========================
  function placeChickenAt(r, c, instant = false) {
    const { rowY, rowHeight, cellW } = computeLayout();
    const x = 88 + LANE_PADDING_LEFT + c * cellW + (cellW / 2) - 20; // road offset + cell center - chicken half
    const y = 28 + rowY(r) + rowHeight / 2 - 22;                    // road offset + row center - chicken half

    // use CSS var based hop animation
    chickenEl.style.setProperty("--x", `${x}px`);
    chickenEl.style.setProperty("--y", `${y}px`);

    if (instant) {
      chickenEl.style.transition = "none";
      chickenEl.style.transform = `translate(${x}px, ${y}px)`;
      // restore transition
      requestAnimationFrame(() => {
        chickenEl.style.transition = "";
      });
      return;
    }

    chickenEl.classList.remove("hop");
    // trigger hop (and move)
    chickenEl.style.transform = `translate(${x}px, ${y}px)`;
    chickenEl.classList.add("hop");
    setTimeout(() => chickenEl.classList.remove("hop"), 320);
  }

  function resetRoadVisual() {
    selectedCol = null;
    lockedThroughLane = -1;

    // clear selections & reveals
    for (let r = 0; r < LANES; r++) {
      for (let c = 0; c < COLS; c++) {
        const h = hatchGrid[r][c];
        h.classList.remove("sel", "revealed", "ok", "bad");
        const icon = h.querySelector(".icon");
        icon.className = "icon";
        icon.textContent = "";
      }
    }
    barriers.forEach(b => b.classList.remove("on"));

    // put chicken at "start" (lane 0, center)
    placeChickenAt(0, Math.floor(COLS/2), true);
  }

  function setActiveLaneUI() {
    // Only next lane (step) is clickable. Others are disabled
    for (let r = 0; r < LANES; r++) {
      for (let c = 0; c < COLS; c++) {
        const h = hatchGrid[r][c];
        const clickable = running && !animating && r === step && r >= 0 && r < LANES;
        h.style.pointerEvents = clickable ? "auto" : "none";
        h.style.opacity = (r < step) ? 0.55 : 1;
        h.style.filter = (r < step) ? "saturate(.9)" : "none";
      }
    }
  }

  // =========================
  // Game flow
  // =========================
  function setDifficulty(val) {
    difficulty = val;
    ladder = (difficulty === "low") ? MULTI_LOW : MULTI_EXPERT;
    buildLadder();
    setModeUI();
    // update labels on hatches
    if (hatchGrid.length) {
      for (let r = 0; r < LANES; r++) {
        for (let c = 0; c < COLS; c++) {
          const lbl = hatchGrid[r][c].querySelector(".lbl");
          lbl.textContent = `${ladder[r].toFixed(2)}x`;
        }
      }
    }
  }

  function canStart() {
    return !running && bet > 0 && bet <= balance;
  }

  function startGame() {
    if (!canStart()) {
      tip(bet > balance ? "Недостаточно баланса для ставки." : "Укажи ставку > 0.");
      beep(220, .10, .04, "sawtooth");
      return;
    }

    // take bet once
    balance -= bet;
    setBalanceUI();

    running = true;
    animating = false;
    step = 0;
    curX = 1.0;

    setXUI();
    setProfitUI(0);
    setCashOutUI("—");

    selectedCol = null;

    // buttons
    startBtn.disabled = true;
    cashBtn.disabled = true;
    goBtn.disabled = true;
    betInput.disabled = true;
    diffSelect.disabled = true;

    // reset visuals
    resetRoadVisual();
    highlightLadder();
    setActiveLaneUI();

    tip("Выбери люк в <b>первом ряду</b> и нажми <b>Вперёд</b>.");
    sStart();
  }

  function endGameLose(reasonText) {
    running = false;
    animating = false;

    fxEl.classList.remove("win");
    fxEl.classList.add("flash");
    setTimeout(() => fxEl.classList.remove("flash"), 500);

    tip(`<b>Поражение.</b> ${reasonText} Нажми <b>Ставка</b>, чтобы попробовать снова.`);
    sLose();

    // reset UI
    startBtn.disabled = false;
    cashBtn.disabled = true;
    goBtn.disabled = true;
    betInput.disabled = false;
    diffSelect.disabled = false;

    setCashOutUI("—");
    setProfitUI(0);
    setActiveLaneUI();
  }

  function endGameWinCashout() {
    running = false;
    animating = false;

    const payout = Math.floor(bet * curX);
    balance += payout;
    setBalanceUI();

    fxEl.classList.remove("flash");
    fxEl.classList.add("win");
    setTimeout(() => fxEl.classList.remove("win"), 650);

    tip(`<b>Кэшаут!</b> Ты забрал <b>${fmt(payout)} ₽</b> (x${fmtX(curX)}).`);
    sWin();

    startBtn.disabled = false;
    cashBtn.disabled = true;
    goBtn.disabled = true;
    betInput.disabled = false;
    diffSelect.disabled = false;

    setProfitUI(payout);
    setCashOutUI(`${fmt(payout)} ₽`);
    setActiveLaneUI();
  }

  function revealCell(r, c, kind) {
    const h = hatchGrid[r][c];
    h.classList.add("revealed");
    const icon = h.querySelector(".icon");

    if (kind === "egg") {
      h.classList.add("ok");
      icon.classList.add("egg");
      icon.textContent = "🥚";
    } else if (kind === "skull") {
      h.classList.add("bad");
      icon.classList.add("skull");
      icon.textContent = "💀";
    } else if (kind === "fire") {
      h.classList.add("bad");
      icon.classList.add("fire");
      icon.textContent = "🔥";
    } else if (kind === "hole") {
      h.classList.add("bad");
      icon.classList.add("hole");
      icon.textContent = "🕳️";
    }
  }

  function lockPreviousLane(prevLaneIdx) {
    if (prevLaneIdx < 0 || prevLaneIdx >= LANES) return;
    barriers[prevLaneIdx].classList.add("on");
    lockedThroughLane = Math.max(lockedThroughLane, prevLaneIdx);
  }

  function resolveHazard(r, c) {
    // Low: only car collision check and chance
    // Expert: extra hazards
    const cfg = HZ[difficulty];

    // car collision - physical + chance weight
    const hitByCar = carCollisionAtCell(r, c) && Math.random() < 0.75;
    if (hitByCar) return { ok: false, kind: "skull", reason: "Машина сбила курочку." };

    // base hazard chance based on mode
    if (difficulty === "low") {
      if (Math.random() < cfg.car) return { ok: false, kind: "skull", reason: "Неудача на люке (опасность)." };
      return { ok: true, kind: "egg" };
    }

    // expert: roll for hole/fire after car
    if (Math.random() < cfg.hole) return { ok: false, kind: "hole", reason: "Провал — люк оказался пустым." };
    if (Math.random() < cfg.fire) return { ok: false, kind: "fire", reason: "Огонь! Курочка обожглась." };
    if (Math.random() < cfg.car) return { ok: false, kind: "skull", reason: "Опасность на люке." };

    return { ok: true, kind: "egg" };
  }

  async function goForward() {
    if (!running || animating) return;
    if (selectedCol === null) {
      tip("Сначала <b>выбери люк</b> в текущем ряду.");
      beep(240, .06, .03, "sawtooth");
      return;
    }

    const r = step;
    const c = selectedCol;

    animating = true;
    setActiveLaneUI();
    goBtn.disabled = true;

    // hop
    sHop();
    placeChickenAt(r, c, false);

    // Wait landing moment
    await wait(280);

    // Resolve outcome
    const out = resolveHazard(r, c);
    revealCell(r, c, out.kind);

    if (!out.ok) {
      // lose
      animating = false;
      cashBtn.disabled = true;
      setActiveLaneUI();
      endGameLose(out.reason);
      return;
    }

    // success
    step += 1;
    curX = ladder[Math.max(0, step - 1)];
    setXUI();
    highlightLadder();

    const potential = Math.floor(bet * curX);
    setProfitUI(potential);
    setCashOutUI(`${fmt(potential)} ₽`);

    // lock previous lane with barrier (r)
    lockPreviousLane(r);

    // prepare next lane
    selectedCol = null;

    // enable cashout after 1 success
    cashBtn.disabled = step < 1;
    goBtn.disabled = step >= LANES; // no more steps

    // if completed all lanes => auto cashout (optional)
    if (step >= LANES) {
      animating = false;
      setActiveLaneUI();
      tip(`<b>Максимум!</b> Достигнут конец дороги. Авто-кэшаут: <b>${fmt(potential)} ₽</b>.`);
      sWin();
      // finish with payout
      running = false;
      balance += potential;
      setBalanceUI();

      startBtn.disabled = false;
      betInput.disabled = false;
      diffSelect.disabled = false;
      cashBtn.disabled = true;
      goBtn.disabled = true;
      return;
    }

    animating = false;
    setActiveLaneUI();
    tip("Выбери люк в <b>следующем ряду</b> и жми <b>Вперёд</b> — или забирай кэшаут.");
  }

  function cashout() {
    if (!running || animating) return;
    if (step < 1) return;
    endGameWinCashout();
  }

  function onHatchClick(e) {
    if (!running || animating) return;
    const h = e.currentTarget;
    const r = Number(h.dataset.r);
    const c = Number(h.dataset.c);

    if (r !== step) return;

    // select only one
    if (selectedCol !== null) {
      hatchGrid[r][selectedCol].classList.remove("sel");
    }
    selectedCol = c;
    h.classList.add("sel");
    goBtn.disabled = false;

    tip("Ок. Теперь жми <b>Вперёд</b>.");
    beep(520, .03, .02, "sine");
  }

  function wait(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  // =========================
  // UI bindings
  // =========================
  function readBet() {
    const v = Number(String(betInput.value).replace(/[^\d]/g, ""));
    bet = clamp(Number.isFinite(v) ? v : 0, 1, 1_000_000);
    setBetUI();
  }

  betInput.addEventListener("input", () => {
    if (betInput.disabled) return;
    readBet();
  });

  betMinus.addEventListener("click", () => {
    if (betInput.disabled) return;
    readBet();
    bet = clamp(bet - 10, 1, 1_000_000);
    setBetUI();
  });

  betPlus.addEventListener("click", () => {
    if (betInput.disabled) return;
    readBet();
    bet = clamp(bet + 10, 1, 1_000_000);
    setBetUI();
  });

  chips.forEach(ch => ch.addEventListener("click", () => {
    if (betInput.disabled) return;
    const v = ch.dataset.chip;
    if (v === "max") {
      bet = clamp(balance, 1, 1_000_000);
    } else {
      bet = clamp(Number(v), 1, 1_000_000);
    }
    setBetUI();
    beep(520, .03, .02, "sine");
  }));

  diffSelect.addEventListener("change", () => {
    if (diffSelect.disabled) return;
    setDifficulty(diffSelect.value);
    tip("Сложность изменена. Нажми <b>Ставка</b>, чтобы начать.");
  });

  startBtn.addEventListener("click", () => startGame());
  goBtn.addEventListener("click", () => goForward());
  cashBtn.addEventListener("click", () => cashout());

  soundBtn.addEventListener("click", async () => {
    soundOn = !soundOn;
    soundLabel.textContent = `Звук: ${soundOn ? "on" : "off"}`;
    soundBtn.querySelector(".dot").style.background = soundOn ? "var(--green)" : "rgba(255,255,255,.25)";
    soundBtn.querySelector(".dot").style.boxShadow = soundOn ? "0 0 0 4px rgba(39,214,127,.12)" : "none";
    if (soundOn) {
      ensureAudio();
      try { await audioCtx.resume(); } catch {}
      beep(650, .05, .03, "triangle");
    }
  });

  // =========================
  // Traffic light animation
  // =========================
  const tLight = $("tLight");
  let tPhase = 0; // 0=y,1=g,2=r
  function tickTrafficLight(dt) {
    // change every ~2.2s
    tAccum += dt;
    if (tAccum > 2.2) {
      tAccum = 0;
      tPhase = (tPhase + 1) % 3;
      const lamps = tLight.querySelectorAll(".lamp");
      lamps.forEach(l => l.classList.remove("on"));
      if (tPhase === 0) tLight.querySelector(".lamp.y").classList.add("on");
      if (tPhase === 1) tLight.querySelector(".lamp.g").classList.add("on");
      if (tPhase === 2) tLight.querySelector(".lamp.r").classList.add("on");
    }
  }
  let tAccum = 0;

  // =========================
  // Main loop
  // =========================
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    updateCars(dt);
    tickTrafficLight(dt);

    requestAnimationFrame(loop);
  }

  // =========================
  // Init
  // =========================
  function init() {
    // UI init
    setBalanceUI();
    setDifficulty(diffSelect.value);
    setBetUI();
    setModeUI();
    setXUI();
    setProfitUI(0);
    setCashOutUI("—");

    soundLabel.textContent = `Звук: ${soundOn ? "on" : "off"}`;

    // Build
    buildLadder();
    buildRoad();

    // initial tip
    tip("Нажми <b>Ставка</b>, затем выбери люк и жми <b>Вперёд</b>.");

    // loop
    requestAnimationFrame(loop);
  }

  init();
})();
