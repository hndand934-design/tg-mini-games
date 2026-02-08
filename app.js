(() => {
  // ======= Telegram WebApp safe init (optional) =======
  const tg = window.Telegram?.WebApp;
  if (tg) { try { tg.ready(); tg.expand(); } catch {} }

  // ======= Helpers =======
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt2 = (n) => (Math.round(n * 100) / 100).toFixed(2);

  // ======= DOM =======
  const el = {
    balance: $("balance"),
    soundBtn: $("soundBtn"),
    soundLabel: $("soundLabel"),

    betMinus: $("betMinus"),
    betPlus: $("betPlus"),
    betInput: $("betInput"),
    difficulty: $("difficulty"),

    startBtn: $("startBtn"),
    cashoutBtn: $("cashoutBtn"),
    forwardBtn: $("forwardBtn"),

    profit: $("profit"),
    totalMul: $("totalMul"),

    currentX: $("currentX"),
    step: $("step"),

    manholes: $("manholes"),
    cars: $("cars"),
    fx: $("fx"),
    chicken: $("chicken"),

    ladderRow: $("ladderRow"),

    statusText: $("statusText"),
    modeLabel: $("modeLabel"),
    betView: $("betView"),
    cashoutView: $("cashoutView"),
  };

  // ======= Balance (virtual) =======
  const LS_BAL = "chicken_balance_v1";
  const DEFAULT_BAL = 1000;

  let balance = (() => {
    const raw = localStorage.getItem(LS_BAL);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : DEFAULT_BAL;
  })();

  function setBalance(v) {
    balance = Math.max(0, Math.floor(v));
    localStorage.setItem(LS_BAL, String(balance));
    if (el.balance) el.balance.textContent = String(balance);
  }
  setBalance(balance);

  // ======= Audio (quiet + toggle) =======
  let soundOn = true;
  let audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  function blip(freq = 520, dur = 0.06, type = "sine", vol = 0.03) {
    if (!soundOn) return;
    try {
      ensureAudio();
      const t0 = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch {}
  }
  function setSound(on) {
    soundOn = !!on;
    if (el.soundLabel) el.soundLabel.textContent = soundOn ? "Звук: on" : "Звук: off";
    const dot = el.soundBtn?.querySelector(".dot");
    if (dot) {
      dot.style.background = soundOn ? "var(--green)" : "rgba(255,255,255,.18)";
      dot.style.boxShadow = soundOn ? "0 0 14px rgba(42,211,122,.45)" : "none";
    }
  }
  setSound(true);

  // ======= Game tuning =======
  const COLS = 6;            // lanes/manholes per row
  const STEP_LIMIT = 12;     // ladder length
  const ROW_Y = 66;          // fixed visual Y of clickable row (px from top-ish via CSS; we’ll compute)
  const ROAD_PADDING_TOP_PCT = 28; // where row sits (percent), stable on all screens

  // Multipliers ladder (balanced: no crazy dupe)
  // Low grows slower, Expert faster but riskier.
  const LADDER_LOW = [1.08, 1.14, 1.22, 1.31, 1.42, 1.56, 1.74, 1.96, 2.25, 2.62, 3.12, 3.85];
  const LADDER_EX  = [1.22, 1.44, 1.72, 2.08, 2.55, 3.18, 4.05, 5.20, 6.80, 9.00, 12.2, 16.9];

  // Hazard chances per step (visual cars always move; logic uses RNG)
  // Low: only "car"
  const lowCarP = (s) => clamp(0.10 + s * 0.016, 0.10, 0.28);

  // Expert: car + fire + fall (sum capped)
  const exRisk = (s) => {
    const car  = clamp(0.12 + s * 0.022, 0.12, 0.36);
    const fire = clamp(0.06 + s * 0.014, 0.06, 0.24);
    const fall = clamp(0.05 + s * 0.012, 0.05, 0.20);
    const total = clamp(car + fire + fall, 0, 0.70);
    return { car, fire, fall, total };
  };

  // Cars spawn tuning (more cars, vertical)
  const carSpawnEvery = (mode) => mode === "expert" ? 0.45 : 0.65;
  const carSpeedRange = (mode) => mode === "expert" ? [240, 520] : [180, 380];

  // ======= State =======
  let mode = "low";         // low | expert
  let bet = 100;
  let inRun = false;
  let betLocked = false;    // bet deducted
  let step = 0;
  let currentX = 1.0;

  // player selected lane (0..COLS-1)
  let selectedLane = 0;

  // manholes DOM
  let mhWraps = []; // {wrap, hole, badge}
  let roadRect = null;

  // cars sim
  let carPool = [];
  let spawnAcc = 0;
  let lastTs = null;
  let rafId = null;

  // ======= UI helpers =======
  function setStatus(html) {
    if (el.statusText) el.statusText.innerHTML = html;
  }
  function updateMeta() {
    if (el.modeLabel) el.modeLabel.textContent = (mode === "expert" ? "Эксперт" : "Низкий");
    if (el.betView) el.betView.textContent = String(bet);
    if (el.currentX) el.currentX.textContent = `${fmt2(currentX)}x`;
    if (el.step) el.step.textContent = String(step);
    if (el.totalMul) el.totalMul.textContent = `x${fmt2(currentX)}`;
    if (el.profit) {
      const p = betLocked ? Math.floor(bet * currentX) : 0;
      el.profit.textContent = String(p);
    }
    if (el.cashoutView) {
      el.cashoutView.textContent = (inRun && step >= 1) ? `${Math.floor(bet * currentX)} ₽` : "—";
    }
  }
  function setButtons() {
    if (el.startBtn) el.startBtn.disabled = inRun;
    if (el.forwardBtn) el.forwardBtn.disabled = !inRun;
    if (el.cashoutBtn) el.cashoutBtn.disabled = !(inRun && step >= 1);
  }

  function ladderArr() {
    return mode === "expert" ? LADDER_EX : LADDER_LOW;
  }
  function nextX() {
    const arr = ladderArr();
    const idx = clamp(step, 0, arr.length - 1);
    return arr[idx];
  }
  function renderLadder() {
    if (!el.ladderRow) return;
    const arr = ladderArr();
    el.ladderRow.innerHTML = "";
    arr.forEach((x, i) => {
      const d = document.createElement("div");
      d.className = "ladderItem" + (i === step - 1 ? " active" : "");
      d.textContent = `${fmt2(x)}x`;
      el.ladderRow.appendChild(d);
    });
  }

  // ======= Road build (single clickable row like stake) =======
  function buildManholes() {
    if (!el.manholes) return;
    el.manholes.innerHTML = "";
    mhWraps = [];

    roadRect = el.manholes.getBoundingClientRect();

    // Create a single row centered vertically around ROAD_PADDING_TOP_PCT
    const row = document.createElement("div");
    row.className = "mhRow";
    row.style.top = `${ROAD_PADDING_TOP_PCT}%`;

    for (let i = 0; i < COLS; i++) {
      const wrap = document.createElement("div");
      wrap.className = "mhWrap";

      const hole = document.createElement("div");
      hole.className = "manhole";
      hole.dataset.lane = String(i);
      hole.title = "Выбери люк";

      const badge = document.createElement("div");
      badge.className = "mhBadge";
      badge.textContent = `${fmt2(nextX())}x`;

      wrap.appendChild(hole);
      wrap.appendChild(badge);
      row.appendChild(wrap);

      mhWraps.push({ wrap, hole, badge });
    }

    el.manholes.appendChild(row);

    // default selection
    setSelectedLane(selectedLane, true);
  }

  function updateBadges() {
    const nx = nextX();
    mhWraps.forEach(o => (o.badge.textContent = `${fmt2(nx)}x`));
  }

  function setSelectedLane(lane, silent = false) {
    selectedLane = clamp(lane, 0, COLS - 1);
    mhWraps.forEach(({ hole }, idx) => hole.classList.toggle("selected", idx === selectedLane));
    if (!silent) blip(640, 0.045, "sine", 0.02);
  }

  // ======= Chicken positioning + jump arc =======
  function roadLocalXYFromHole(laneIndex) {
    const road = el.manholes?.closest(".road");
    if (!road) return { x: 0, y: 0 };
    const rr = road.getBoundingClientRect();
    const hole = mhWraps[laneIndex]?.hole;
    if (!hole) return { x: rr.width / 2, y: rr.height * (ROAD_PADDING_TOP_PCT / 100) };

    const hr = hole.getBoundingClientRect();
    const x = (hr.left + hr.right) / 2 - rr.left;
    const y = (hr.top + hr.bottom) / 2 - rr.top - 10; // slightly above hole
    return { x, y };
  }

  function setChickenPos(x, y, immediate = false) {
    if (!el.chicken) return;
    if (immediate) {
      el.chicken.style.transition = "none";
      el.chicken.style.left = `${x}px`;
      el.chicken.style.top = `${y}px`;
      requestAnimationFrame(() => {
        el.chicken.style.transition = "left .28s ease, top .28s ease, transform .18s ease";
      });
    } else {
      el.chicken.style.left = `${x}px`;
      el.chicken.style.top = `${y}px`;
    }
  }

  function jumpChickenToLane(laneIndex) {
    // simple arc illusion: scale + quick mid bump
    const { x, y } = roadLocalXYFromHole(laneIndex);
    if (!el.chicken) return;

    el.chicken.classList.add("jump");
    setChickenPos(x, y, false);

    setTimeout(() => el.chicken && el.chicken.classList.remove("jump"), 230);
  }

  // ======= Cars =======
  function clearCars() {
    carPool.forEach(c => c.el.remove());
    carPool = [];
    if (el.cars) el.cars.innerHTML = "";
  }

  function spawnCar() {
    if (!el.cars) return;
    const road = el.cars.closest(".road");
    if (!road) return;

    const rr = road.getBoundingClientRect();
    const lanes = [0.26, 0.42, 0.58, 0.74, 0.88]; // 5 visual lanes across
    const lane = lanes[Math.floor(Math.random() * lanes.length)];

    const fromTop = Math.random() < 0.5;
    const x = lane * rr.width;
    const y0 = fromTop ? -70 : rr.height + 70;
    const y1 = fromTop ? rr.height + 90 : -90;

    const [sMin, sMax] = carSpeedRange(mode);
    const speed = sMin + Math.random() * (sMax - sMin);

    const r = Math.random();
    const color = r < 0.45 ? "blue" : (r < 0.75 ? "taxi" : "red");

    const div = document.createElement("div");
    div.className = `car ${color}`;
    div.style.left = `${x}px`;
    div.style.top = `${y0}px`;
    el.cars.appendChild(div);

    carPool.push({ el: div, x, y: y0, yEnd: y1, dir: fromTop ? 1 : -1, speed });
  }

  function tickCars(dt) {
    if (!el.cars) return;
    const road = el.cars.closest(".road");
    if (!road) return;
    const h = road.getBoundingClientRect().height;

    for (let i = carPool.length - 1; i >= 0; i--) {
      const c = carPool[i];
      c.y += c.dir * c.speed * dt;
      c.el.style.top = `${c.y}px`;

      const out = c.dir > 0 ? c.y > h + 120 : c.y < -140;
      if (out) {
        c.el.remove();
        carPool.splice(i, 1);
      }
    }
  }

  // ======= FX =======
  function fx(className, x, y) {
    if (!el.fx) return;
    const d = document.createElement("div");
    d.className = className;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    el.fx.appendChild(d);
    setTimeout(() => d.remove(), 800);
  }

  function chickenCenter() {
    const road = el.chicken?.closest(".road");
    if (!road || !el.chicken) return { x: 0, y: 0 };
    const rr = road.getBoundingClientRect();
    const cr = el.chicken.getBoundingClientRect();
    return { x: (cr.left + cr.right) / 2 - rr.left, y: (cr.top + cr.bottom) / 2 - rr.top };
  }

  // ======= Hazard logic (visual cars are for vibe; logic ensures balance) =======
  function resolveOutcome() {
    const s = step; // current step index before success
    const roll = Math.random();

    if (mode === "low") {
      const pCar = lowCarP(s);
      return (roll < pCar) ? "car" : "safe";
    } else {
      const r = exRisk(s);
      if (roll < r.car) return "car";
      if (roll < r.car + r.fire) return "fire";
      if (roll < r.car + r.fire + r.fall) return "fall";
      return "safe";
    }
  }

  // ======= Run control =======
  function resetRun() {
    inRun = false;
    betLocked = false;
    step = 0;
    currentX = 1.0;

    updateBadges();
    renderLadder();
    updateMeta();
    setButtons();

    clearCars();
    spawnAcc = 0;
    lastTs = null;

    setStatus(`Нажми <b>Ставка</b> чтобы начать. Затем выбери люк кликом и жми <b>Вперёд</b>.`);
    if (el.cashoutView) el.cashoutView.textContent = "—";

    // reset chicken to selected lane (bottom-ish)
    const { x, y } = roadLocalXYFromHole(selectedLane);
    setChickenPos(x, y + 120, true); // start a bit below row
    // then ease into row to feel alive
    setTimeout(() => setChickenPos(x, y, false), 120);
  }

  function startRun() {
    if (inRun) return;

    bet = Math.floor(Number(el.betInput?.value || bet) || 0);
    if (bet <= 0) { blip(200, 0.08, "square", 0.03); return; }
    if (bet > balance) { setStatus(`<b>Недостаточно средств</b> для ставки.`); blip(200, 0.09, "square", 0.03); return; }

    // lock mode
    mode = (el.difficulty?.value === "expert") ? "expert" : "low";
    if (el.modeLabel) el.modeLabel.textContent = (mode === "expert" ? "Эксперт" : "Низкий");

    // deduct bet once
    setBalance(balance - bet);
    betLocked = true;

    inRun = true;
    step = 0;
    currentX = 1.0;

    updateBadges();
    renderLadder();
    updateMeta();
    setButtons();

    setStatus(`Серия началась. Выбери люк и жми <b>Вперёд</b>.`);

    // start cars loop
    rafId && cancelAnimationFrame(rafId);
    lastTs = null;
    spawnAcc = 0;

    // spawn initial cars burst
    clearCars();
    for (let i = 0; i < 4; i++) spawnCar();

    rafId = requestAnimationFrame(loop);

    blip(620, 0.06, "triangle", 0.03);
  }

  function endLose(kind) {
    inRun = false;
    betLocked = false;

    const c = chickenCenter();
    if (kind === "car") fx("boom", c.x, c.y);
    if (kind === "fire") fx("fireFx", c.x, c.y);
    if (kind === "fall") fx("boom", c.x, c.y + 10);

    // little shake
    const arena = document.querySelector(".arena");
    arena && arena.classList.add("roadShake");
    setTimeout(() => arena && arena.classList.remove("roadShake"), 420);

    if (kind === "car") setStatus(`<b>Столкновение!</b> Проигрыш.`);
    if (kind === "fire") setStatus(`<b>Пламя!</b> Проигрыш.`);
    if (kind === "fall") setStatus(`<b>Провал!</b> Проигрыш.`);

    blip(180, 0.10, "square", 0.03);

    clearCars();
    updateMeta();
    setButtons();

    // restart ready after short pause
    setTimeout(() => resetRun(), 900);
  }

  function cashout(auto = false) {
    if (!(inRun && betLocked && step >= 1)) return;

    const win = Math.floor(bet * currentX);
    setBalance(balance + win);

    setStatus(auto
      ? `Максимум! <b>Кэшаут</b> на <b>${fmt2(currentX)}x</b> (+${win} ₽)`
      : `Ты забрал: <b>${win} ₽</b> (x${fmt2(currentX)})`
    );

    const c = chickenCenter();
    fx("spark", c.x, c.y);
    blip(820, 0.07, "triangle", 0.03);

    inRun = false;
    betLocked = false;
    clearCars();

    updateMeta();
    setButtons();

    setTimeout(() => resetRun(), 950);
  }

  function doForward() {
    if (!inRun) return;

    // jump first (feel)
    jumpChickenToLane(selectedLane);

    // settle then resolve
    setTimeout(() => {
      if (!inRun) return;

      const outcome = resolveOutcome();

      if (outcome === "safe") {
        step += 1;
        currentX = nextX();

        const c = chickenCenter();
        fx("spark", c.x, c.y);

        blip(720, 0.05, "sine", 0.02);

        // allow cashout after 1 step
        updateBadges();
        renderLadder();
        updateMeta();
        setButtons();

        setStatus(`Удачно! Шаг <b>${step}</b>. X = <b>${fmt2(currentX)}x</b>`);

        // reached max ladder -> auto cashout
        if (step >= STEP_LIMIT || step >= ladderArr().length) {
          cashout(true);
        }
      } else {
        endLose(outcome);
      }
    }, 240);
  }

  // ======= RAF loop for cars =======
  function loop(ts) {
    if (!inRun) return;

    if (!lastTs) lastTs = ts;
    const dt = (ts - lastTs) / 1000;
    lastTs = ts;

    // spawn cars
    spawnAcc += dt;
    const every = carSpawnEvery(mode);
    if (spawnAcc >= every) {
      spawnAcc = 0;
      spawnCar();
      if (mode === "expert" && Math.random() < 0.45) spawnCar();
    }

    tickCars(dt);

    rafId = requestAnimationFrame(loop);
  }

  // ======= Events =======
  function bind() {
    // Sound toggle
    el.soundBtn?.addEventListener("click", () => {
      setSound(!soundOn);
      blip(soundOn ? 720 : 220, 0.05, "sine", 0.02);
    });

    // Bet controls
    el.betMinus?.addEventListener("click", () => {
      if (inRun) return;
      bet = Math.max(1, (Number(el.betInput.value) || bet) - 10);
      el.betInput.value = String(bet);
      if (el.betView) el.betView.textContent = String(bet);
      blip(520, 0.04, "sine", 0.015);
    });
    el.betPlus?.addEventListener("click", () => {
      if (inRun) return;
      bet = Math.max(1, (Number(el.betInput.value) || bet) + 10);
      el.betInput.value = String(bet);
      if (el.betView) el.betView.textContent = String(bet);
      blip(520, 0.04, "sine", 0.015);
    });

    document.querySelectorAll(".chip").forEach(btn => {
      btn.addEventListener("click", () => {
        if (inRun) return;
        const v = btn.dataset.chip;
        if (v === "max") bet = Math.max(1, balance);
        else bet = Math.max(1, Math.floor(Number(v) || 1));
        el.betInput.value = String(bet);
        if (el.betView) el.betView.textContent = String(bet);
        blip(620, 0.04, "triangle", 0.015);
      });
    });

    el.betInput?.addEventListener("input", () => {
      if (inRun) return;
      bet = Math.max(1, Math.floor(Number(el.betInput.value) || 1));
      el.betView && (el.betView.textContent = String(bet));
    });

    // Difficulty
    el.difficulty?.addEventListener("change", () => {
      if (inRun) {
        // revert
        el.difficulty.value = mode;
        blip(200, 0.06, "square", 0.02);
        return;
      }
      mode = (el.difficulty.value === "expert") ? "expert" : "low";
      el.modeLabel && (el.modeLabel.textContent = mode === "expert" ? "Эксперт" : "Низкий");
      updateBadges();
      renderLadder();
      updateMeta();
      blip(600, 0.05, "triangle", 0.015);
    });

    // Buttons
    el.startBtn?.addEventListener("click", startRun);
    el.cashoutBtn?.addEventListener("click", () => cashout(false));
    el.forwardBtn?.addEventListener("click", doForward);

    // Click on manholes
    el.manholes?.addEventListener("click", (e) => {
      const t = e.target;
      const hole = t?.closest?.(".manhole");
      if (!hole) return;
      const lane = Number(hole.dataset.lane);
      if (!Number.isFinite(lane)) return;
      setSelectedLane(lane, false);
    });

    // Keyboard shortcuts
    window.addEventListener("keydown", (e) => {
      if (e.code === "Enter") { if (!inRun) startRun(); }
      if (e.code === "Space") { e.preventDefault(); doForward(); }
      if (e.code === "KeyC") { cashout(false); }
      if (e.code === "ArrowLeft") { setSelectedLane(selectedLane - 1, false); }
      if (e.code === "ArrowRight") { setSelectedLane(selectedLane + 1, false); }
    });
  }

  // ======= Init =======
  function init() {
    // initial bet from input
    bet = Math.max(1, Math.floor(Number(el.betInput?.value || 100) || 100));
    if (el.betInput) el.betInput.value = String(bet);
    if (el.betView) el.betView.textContent = String(bet);

    mode = (el.difficulty?.value === "expert") ? "expert" : "low";
    if (el.modeLabel) el.modeLabel.textContent = (mode === "expert" ? "Эксперт" : "Низкий");

    buildManholes();
    renderLadder();
    updateMeta();
    setButtons();
    resetRun();

    // position chicken after layout
    requestAnimationFrame(() => {
      const { x, y } = roadLocalXYFromHole(selectedLane);
      setChickenPos(x, y + 120, true);
      setTimeout(() => setChickenPos(x, y, false), 120);
    });

    bind();
  }

  window.addEventListener("load", init);
  window.addEventListener("resize", () => {
    // rebuild row for correct center/coords
    buildManholes();
    const { x, y } = roadLocalXYFromHole(selectedLane);
    setChickenPos(x, y, true);
  });
})();
