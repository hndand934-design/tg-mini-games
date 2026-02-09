(() => {
  // ====== helpers ======
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const fmt = (n) => `${Math.round(n)} ₽`;
  const fmtX = (x) => `x${x.toFixed(2)}`;

  // ====== elements ======
  const balanceText = $("#balanceText");
  const addBalanceBtn = $("#addBalanceBtn");

  const soundBtn = $("#soundBtn");
  const soundLed = $("#soundLed");
  const soundText = $("#soundText");

  const betMinus = $("#betMinus");
  const betPlus = $("#betPlus");
  const betValueEl = $("#betValue");
  const betRightText = $("#betRightText");

  const chips = $$(".chip[data-chip]");
  const halfBtn = $("#halfBtn");
  const doubleBtn = $("#doubleBtn");

  const riskGrid = $("#riskGrid");
  const riskBtns = $$(".risk");
  const seriesToggle = $("#seriesToggle");
  const streakText = $("#streakText");

  const stakeBtn = $("#stakeBtn");
  const cashoutBtn = $("#cashoutBtn");
  const resetBtn = $("#resetBtn");

  const statusText = $("#statusText");
  const xText = $("#xText");
  const xTopText = $("#xTopText");
  const stepText = $("#stepText");
  const potentialText = $("#potentialText");
  const cashoutRightText = $("#cashoutRightText");
  const hintText = $("#hintText");

  const zonesWrap = $("#zones");
  const gloves = $("#gloves");
  const ball = $("#ball");
  const fx = $("#fx");
  const field = $("#field");

  // ====== audio (tiny) ======
  let soundOn = true;
  let audioCtx = null;

  function beep(freq = 440, dur = 0.06, type = "sine", gain = 0.03) {
    if (!soundOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + dur);
    } catch {}
  }

  // ====== game params ======
  // Подняли сложность: вратарь часто угадывает выбранную зону
  const RISK_PRESETS = [
    { label: "1.35x", stepMul: 1.12, matchChance: 0.32 }, // легче, но меньше рост
    { label: "1.75x", stepMul: 1.16, matchChance: 0.36 },
    { label: "2.30x", stepMul: 1.22, matchChance: 0.40 },
    { label: "3.10x", stepMul: 1.30, matchChance: 0.44 },
    { label: "4.20x", stepMul: 1.40, matchChance: 0.48 }, // выше риск — чаще сейв
  ];

  const LS_BAL = "penalty_balance_v1";

  // ====== state ======
  let balance = Number(localStorage.getItem(LS_BAL) || 0);
  let bet = 100;

  let riskIndex = 0;
  let inRun = false;       // ставка сделана (попытка активна)
  let locked = false;      // блок анимаций
  let streak = 0;          // голов подряд
  let step = 0;            // шаги в текущей попытке
  let currentX = 1.0;
  let canCashout = false;

  let selectedZone = null; // {r,c, idx}
  let lastResult = null;   // "goal"|"save"|null

  // ====== UI init ======
  function syncBalance() {
    balanceText.textContent = fmt(balance);
    localStorage.setItem(LS_BAL, String(balance));
  }

  function syncBet() {
    betValueEl.textContent = String(bet);
    betRightText.textContent = `${bet} ₽`;
  }

  function setStatus(text) {
    statusText.textContent = text;
    hintText.innerHTML = text;
  }

  function syncX() {
    xText.textContent = fmtX(currentX);
    xTopText.textContent = fmtX(currentX);
    stepText.textContent = String(step);
    const pot = inRun ? bet * currentX : 0;
    potentialText.textContent = fmt(pot);
    cashoutRightText.textContent = canCashout ? fmt(pot) : "—";
  }

  function setSoundUI() {
    soundText.textContent = `Звук: ${soundOn ? "on" : "off"}`;
    soundLed.classList.toggle("on", soundOn);
  }

  function lockRiskButtons(lock) {
    riskBtns.forEach((b) => {
      b.disabled = lock;
      b.classList.toggle("disabled", lock);
    });
  }

  function setActiveRisk(idx) {
    riskIndex = idx;
    riskBtns.forEach((b) => b.classList.remove("active"));
    const btn = riskBtns.find((b) => Number(b.dataset.risk) === idx);
    if (btn) btn.classList.add("active");
  }

  // ====== zones (5x3) ======
  const Z_COLS = 5;
  const Z_ROWS = 3;

  function buildZones() {
    zonesWrap.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (let r = 0; r < Z_ROWS; r++) {
      for (let c = 0; c < Z_COLS; c++) {
        const idx = r * Z_COLS + c; // 0..14
        const d = document.createElement("div");
        d.className = "zone";
        d.dataset.r = String(r);
        d.dataset.c = String(c);
        d.dataset.idx = String(idx);
        d.addEventListener("click", () => onZoneClick(r, c, idx));
        frag.appendChild(d);
      }
    }
    zonesWrap.appendChild(frag);
  }

  function clearZoneSelection() {
    $$(".zone").forEach(z => z.classList.remove("sel"));
    selectedZone = null;
  }

  function selectZone(r, c, idx) {
    clearZoneSelection();
    const z = $(`.zone[data-idx="${idx}"]`);
    if (z) z.classList.add("sel");
    selectedZone = { r, c, idx };
    if (inRun) setStatus(`Выбрана зона удара: <b>${idx + 1}</b>. Кликни ещё раз по зоне — удар.`);
    else setStatus(`Выбрана зона удара: <b>${idx + 1}</b>. Нажми <b>Ставка</b>, затем кликай по зоне для удара.`);
  }

  // ====== ball & gloves animation helpers ======
  const ballHome = { x: 0.5, y: 0.86 }; // relative within field
  function setBallAt(relX, relY) {
    const rect = field.getBoundingClientRect();
    const x = rect.width * relX;
    const y = rect.height * relY;
    ball.style.left = `${x}px`;
    ball.style.top = `${y}px`;
    ball.style.bottom = "auto";
    ball.style.transform = "translate(-50%,-50%)";
  }

  function resetBallInstant() {
    const rect = field.getBoundingClientRect();
    ball.style.transition = "none";
    ball.style.left = `${rect.width * ballHome.x}px`;
    ball.style.top = `${rect.height * ballHome.y}px`;
    ball.style.transform = "translate(-50%,-50%)";
    // force reflow
    void ball.offsetWidth;
    ball.style.transition = "";
  }

  function zoneCenterRel(r, c) {
    // zone area is inside goal: approx map to field coords
    // goal box: centered, width 520, height 190, top 32
    const rect = field.getBoundingClientRect();
    const goalW = 520;
    const goalH = 190;
    const goalLeft = (rect.width / 2) - (goalW / 2);
    const goalTop = 32;

    const innerPad = 22 + 10; // net + zones padding
    const innerLeft = goalLeft + innerPad;
    const innerTop = goalTop + 24 + 10; // net top + padding
    const innerW = goalW - (innerPad * 2);
    const innerH = goalH - ((24 + 10) * 2);

    const cellW = innerW / Z_COLS;
    const cellH = innerH / Z_ROWS;

    const cx = innerLeft + (c + 0.5) * cellW;
    const cy = innerTop + (r + 0.5) * cellH;

    return { x: cx / rect.width, y: cy / rect.height };
  }

  function moveGlovesToZone(r, c) {
    // map gloves translate inside goal area
    const rel = zoneCenterRel(r, c);
    const rect = field.getBoundingClientRect();
    const targetX = rel.x * rect.width;
    const targetY = rel.y * rect.height;

    // gloves base position is centered; convert to translate
    const baseX = rect.width * 0.5;
    const baseY = 32 + 70; // approx
    const dx = targetX - baseX;
    const dy = targetY - baseY;
    gloves.style.transform = `translate(calc(-50% + ${dx}px), ${dy}px)`;
  }

  function resetGloves() {
    gloves.style.transform = "translateX(-50%)";
  }

  function flash(type) {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.inset = "0";
    el.style.borderRadius = "16px";
    el.style.background = type === "goal"
      ? "radial-gradient(600px 260px at 50% 40%, rgba(25,209,124,.22), transparent 60%)"
      : "radial-gradient(600px 260px at 50% 40%, rgba(255,59,74,.22), transparent 60%)";
    el.style.opacity = "0";
    el.style.transition = "opacity .12s ease";
    fx.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = "1";
      setTimeout(() => {
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 180);
      }, 160);
    });
  }

  // ====== core logic ======
  function ensureBalance() {
    if (balance < bet) {
      setStatus("Недостаточно баланса для ставки.");
      beep(220, 0.08, "square", 0.03);
      return false;
    }
    return true;
  }

  function startRun() {
    if (inRun) return;
    if (!ensureBalance()) return;

    balance -= bet;
    syncBalance();

    inRun = true;
    locked = false;
    step = 0;
    streak = 0;
    currentX = 1.0;
    canCashout = false;
    lastResult = null;

    lockRiskButtons(true); // нельзя менять множитель после ставки
    streakText.textContent = "0";
    setStatus("Ставка принята. Выбери зону удара (5×3) и кликай по ней.");
    syncX();

    cashoutBtn.disabled = true;
    beep(520, 0.06, "sine", 0.04);
    beep(720, 0.06, "sine", 0.03);
  }

  function endRunSave() {
    // проигрыш: ставка сгорела, попытка закончена
    inRun = false;
    locked = false;
    canCashout = false;
    cashoutBtn.disabled = true;
    setStatus("Сейв! Ставка сгорела. Нажми <b>Ставка</b>, чтобы начать заново.");
    lockRiskButtons(false);
    clearZoneSelection();
    syncX();
  }

  function doCashout() {
    if (!inRun || !canCashout) return;
    const win = bet * currentX;
    balance += win;
    syncBalance();

    inRun = false;
    locked = false;
    canCashout = false;
    cashoutBtn.disabled = true;

    setStatus(`Кэшаут: <b>+${fmt(win)}</b>. Нажми <b>Ставка</b>, чтобы начать снова.`);
    lockRiskButtons(false);
    clearZoneSelection();
    currentX = 1.0;
    step = 0;
    streak = 0;
    streakText.textContent = "0";
    syncX();

    beep(880, 0.08, "sine", 0.05);
    beep(660, 0.10, "sine", 0.04);
  }

  function fullReset() {
    inRun = false;
    locked = false;
    canCashout = false;
    step = 0;
    streak = 0;
    currentX = 1.0;
    lastResult = null;

    cashoutBtn.disabled = true;
    lockRiskButtons(false);
    clearZoneSelection();
    resetBallInstant();
    resetGloves();

    setStatus("Ожидание. Нажми <b>Ставка</b>, затем кликай по зоне удара.");
    syncX();
    beep(300, 0.06, "triangle", 0.03);
  }

  function goaliePickZone(userIdx) {
    // УСЛОЖНЕНИЕ: часто угадывает выбранную зону
    const p = RISK_PRESETS[riskIndex].matchChance; // 0.32..0.48
    if (Math.random() < p) return userIdx;

    // иначе равномерно по остальным
    const all = [...Array(15)].map((_, i) => i).filter(i => i !== userIdx);
    return all[Math.floor(Math.random() * all.length)];
  }

  function idxToRC(idx) {
    return { r: Math.floor(idx / Z_COLS), c: idx % Z_COLS };
  }

  function applyGoal() {
    lastResult = "goal";
    step += 1;
    streak += 1;
    streakText.textContent = String(streak);

    // рост X — по выбранному риску, но ниже, чем раньше (чтоб не дюпали)
    const stepMul = RISK_PRESETS[riskIndex].stepMul; // 1.12..1.40
    currentX = Math.max(1.0, currentX * stepMul);

    canCashout = true;
    cashoutBtn.disabled = false;

    syncX();
  }

  function onZoneClick(r, c, idx) {
    // selection always allowed, but удар — только если ставка активна
    if (!inRun) {
      selectZone(r, c, idx);
      beep(420, 0.05, "sine", 0.02);
      return;
    }
    if (locked) return;

    // если выбрал другую — просто выбрать
    if (!selectedZone || selectedZone.idx !== idx) {
      selectZone(r, c, idx);
      beep(420, 0.05, "sine", 0.02);
      return;
    }

    // удар
    kick(idx);
  }

  async function kick(userIdx) {
    if (!inRun) return;
    if (!selectedZone) return;

    locked = true;
    setStatus("Удар...");

    // выбрать сейв-зону
    const gIdx = goaliePickZone(userIdx);
    const gRC = idxToRC(gIdx);

    // двинуть перчатки в сторону (анимация)
    moveGlovesToZone(gRC.r, gRC.c);
    beep(520, 0.05, "square", 0.02);

    // полёт мяча по траектории (простая)
    const target = zoneCenterRel(selectedZone.r, selectedZone.c);
    const rect = field.getBoundingClientRect();

    ball.style.transition = "transform .0s, left .22s ease, top .22s ease";
    ball.style.left = `${rect.width * target.x}px`;
    ball.style.top = `${rect.height * target.y}px`;
    ball.style.transform = "translate(-50%,-50%) scale(0.85)";
    beep(900, 0.03, "triangle", 0.02);

    await wait(260);

    // результат
    const saved = (gIdx === userIdx);

    if (saved) {
      flash("save");
      beep(180, 0.12, "sawtooth", 0.04);
      setStatus("Сейв! Ставка сгорела.");
      await wait(220);
      resetBallInstant();
      resetGloves();
      locked = false;
      endRunSave();
      return;
    }

    // гол
    flash("goal");
    beep(760, 0.06, "sine", 0.04);
    beep(980, 0.08, "sine", 0.03);

    applyGoal();
    setStatus(`Гол! Можно бить дальше или нажать <b>Кэшаут</b>.`);

    // вернуть мяч вниз и открыть следующий удар
    await wait(200);
    resetBallInstant();
    // небольшая задержка, чтобы не спамили клики
    await wait(140);

    // перчатки возвращаем (как будто вратарь вернулся)
    resetGloves();
    locked = false;
  }

  function wait(ms) { return new Promise(res => setTimeout(res, ms)); }

  // ====== bet controls ======
  function setBet(n) {
    bet = clamp(Math.round(n), 10, 50000);
    syncBet();
    if (!inRun) syncX();
  }

  function applyChip(val) {
    if (val === "max") {
      setBet(balance > 0 ? balance : bet);
      return;
    }
    setBet(Number(val));
  }

  // ====== events (IMPORTANT: клики не должны теряться) ======
  function bindEvents() {
    soundBtn.addEventListener("click", () => {
      soundOn = !soundOn;
      setSoundUI();
      beep(600, 0.05, "sine", 0.02);
    });

    addBalanceBtn.addEventListener("click", () => {
      balance += 1000;
      syncBalance();
      beep(700, 0.05, "sine", 0.03);
    });

    betMinus.addEventListener("click", () => setBet(bet - 10));
    betPlus.addEventListener("click", () => setBet(bet + 10));

    chips.forEach(ch => ch.addEventListener("click", () => applyChip(ch.dataset.chip)));

    halfBtn.addEventListener("click", () => setBet(Math.floor(bet / 2)));
    doubleBtn.addEventListener("click", () => setBet(bet * 2));

    riskGrid.addEventListener("click", (e) => {
      const btn = e.target.closest(".risk");
      if (!btn) return;
      if (btn.disabled) return;
      const idx = Number(btn.dataset.risk);
      setActiveRisk(idx);
      beep(500, 0.05, "sine", 0.02);
    });

    stakeBtn.addEventListener("click", () => {
      startRun();
    });

    cashoutBtn.addEventListener("click", () => {
      doCashout();
    });

    resetBtn.addEventListener("click", () => {
      fullReset();
    });

    // touch safety
    [stakeBtn, cashoutBtn, resetBtn].forEach(b => {
      b.addEventListener("touchstart", () => {}, { passive: true });
    });

    // resize keeps ball at home
    window.addEventListener("resize", () => {
      resetBallInstant();
    });
  }

  // ====== init ======
  function init() {
    // balance default
    if (!Number.isFinite(balance)) balance = 0;
    syncBalance();

    // default bet
    setBet(100);

    // risk labels from presets + ensure white (не “почернели”)
    riskBtns.forEach((b, i) => {
      b.textContent = RISK_PRESETS[i]?.label ?? b.textContent;
      b.style.color = ""; // reset any accidental inline
    });
    setActiveRisk(0);

    buildZones();
    bindEvents();
    setSoundUI();

    // initial positions
    // place ball using absolute top/left to allow animation
    ball.style.position = "absolute";
    resetBallInstant();
    resetGloves();

    setStatus("Ожидание. Нажми <b>Ставка</b>, затем кликай по зоне удара.");
    syncX();
  }

  init();
})();
