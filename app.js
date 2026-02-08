/* Chicken Road — app.js (FULL, clean, standalone)
   Вставляй целиком, заменив старый app.js.
   Требует элементы с id:
   bal, betInput, betMinus, betPlus, startBtn, cashoutBtn, forwardBtn,
   profit, profitMul, difficulty, stageSub, xNow, stepNow,
   holesRow, chicken, barrier, fxLayer, ladderRow, hint,
   betView, modeText, cashView,
   soundBtn, soundDot, soundText,
   lampRed, lampYellow, lampGreen,
   carsLayer,
   а также контейнеры: #road, .chips (с кнопками .chip[data-chip="..."])
*/

(() => {
  "use strict";

  // ---------- helpers ----------
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const fmt2 = (n) => (Math.round(n * 100) / 100).toFixed(2);

  // ---------- storage ----------
  const LS_BAL = "chickenroad_balance_v1";
  const loadBalance = () => {
    const v = Number(localStorage.getItem(LS_BAL));
    return Number.isFinite(v) ? v : 1000;
  };
  const saveBalance = (v) => localStorage.setItem(LS_BAL, String(v));

  // ---------- UI refs ----------
  const balEl = $("#bal");
  const betInput = $("#betInput");
  const betMinus = $("#betMinus");
  const betPlus = $("#betPlus");
  const startBtn = $("#startBtn");
  const cashoutBtn = $("#cashoutBtn");
  const forwardBtn = $("#forwardBtn");
  const profitEl = $("#profit");
  const profitMulEl = $("#profitMul");
  const difficultyEl = $("#difficulty");
  const stageSub = $("#stageSub");
  const xNowEl = $("#xNow");
  const stepNowEl = $("#stepNow");
  const holesRow = $("#holesRow");
  const chickenEl = $("#chicken");
  const barrierEl = $("#barrier");
  const fxLayer = $("#fxLayer");
  const ladderRow = $("#ladderRow");
  const hintEl = $("#hint");
  const betView = $("#betView");
  const modeText = $("#modeText");
  const cashView = $("#cashView");

  const lampRed = $("#lampRed");
  const lampYellow = $("#lampYellow");
  const lampGreen = $("#lampGreen");

  const carsLayer = $("#carsLayer");
  const roadEl = $("#road");
  const chipsWrap = $(".chips");

  // ---------- safety: must exist ----------
  const must = [
    balEl, betInput, betMinus, betPlus, startBtn, cashoutBtn, forwardBtn,
    profitEl, profitMulEl, difficultyEl, stageSub, xNowEl, stepNowEl,
    holesRow, chickenEl, barrierEl, fxLayer, ladderRow, hintEl,
    betView, modeText, cashView,
    lampRed, lampYellow, lampGreen,
    carsLayer, roadEl, chipsWrap,
    $("#soundBtn"), $("#soundDot"), $("#soundText")
  ];
  if (must.some((x) => !x)) {
    console.warn("[ChickenRoad] Missing required DOM nodes. Check index.html IDs.");
    return;
  }

  // ---------- sound (quiet) ----------
  let soundOn = true;
  const soundBtn = $("#soundBtn");
  const soundDot = $("#soundDot");
  const soundText = $("#soundText");

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audio = AudioCtx ? new AudioCtx() : null;

  async function ensureAudio() {
    if (!audio) return;
    if (audio.state === "suspended") {
      try { await audio.resume(); } catch {}
    }
  }

  function beep(freq = 420, dur = 0.06, type = "sine", gain = 0.03) {
    if (!soundOn || !audio) return;
    try {
      const t0 = audio.currentTime;
      const o = audio.createOscillator();
      const g = audio.createGain();

      o.type = type;
      o.frequency.setValueAtTime(freq, t0);

      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      o.connect(g);
      g.connect(audio.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch {}
  }

  function soundUI() {
    soundDot.className = "dot " + (soundOn ? "on" : "off");
    soundText.textContent = "Звук: " + (soundOn ? "on" : "off");
    soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
  }

  soundBtn.addEventListener("click", async () => {
    soundOn = !soundOn;
    soundUI();
    await ensureAudio();
    beep(soundOn ? 660 : 220, 0.06, "sine", 0.02);
  });

  // ---------- game config ----------
  const HOLES = 7;               // ряд люков (горизонтально)
  const MAX_STEPS = 12;

  // Лестница X (настраиваемая)
  const LADDERS = {
    low:   [1.08, 1.14, 1.22, 1.31, 1.42, 1.56, 1.74, 1.96, 2.25, 2.62, 3.12, 3.85],
    expert:[1.18, 1.32, 1.52, 1.78, 2.12, 2.58, 3.20, 4.14, 5.50, 7.20, 9.40, 12.80],
  };

  // Вероятность опасности по шагам (сдерживает “дюп”)
  const HAZARD_P = {
    low:   [0.12,0.13,0.14,0.15,0.16,0.17,0.18,0.19,0.20,0.21,0.22,0.23],
    expert:[0.24,0.26,0.28,0.30,0.32,0.34,0.36,0.38,0.40,0.42,0.44,0.46],
  };

  // ---------- state ----------
  let balance = loadBalance();
  let bet = 100;

  let running = false;
  let stakeLocked = false;  // ставка списана
  let busted = false;

  let step = 0;             // 0..MAX_STEPS
  let xNow = 1.0;

  let selected = 0;         // индекс люка
  let hazards = new Set();  // опасные люки на текущий шаг
  let hazardKind = new Map();

  // ---------- UI ----------
  function setBalance(v) {
    balance = Math.max(0, Math.floor(v));
    saveBalance(balance);
    balEl.textContent = String(balance);
  }

  function parseBet() {
    const raw = String(betInput.value).replace(/[^\d]/g, "");
    let v = Number(raw || "0");
    if (!Number.isFinite(v)) v = 0;
    v = clamp(v, 10, 1000000);
    return Math.floor(v);
  }

  function setBet(v) {
    bet = clamp(Math.floor(v), 10, 1000000);
    betInput.value = String(bet);
    betView.textContent = String(bet);
  }

  function modeKey() {
    return difficultyEl.value === "expert" ? "expert" : "low";
  }

  function setModeLabel() {
    modeText.textContent = modeKey() === "expert" ? "Эксперт" : "Низкий";
  }

  function setHint(html) {
    hintEl.innerHTML = html;
  }

  function fx(text, type = "good") {
    const el = document.createElement("div");
    el.className = `fx ${type}`;
    el.textContent = text;
    fxLayer.appendChild(el);
    setTimeout(() => el.remove(), 650);
  }

  function updateStats() {
    xNowEl.textContent = `${fmt2(xNow)}x`;
    stepNowEl.textContent = String(step);

    const profit = stakeLocked ? Math.floor(bet * xNow) : 0;
    profitEl.textContent = String(profit);
    profitMulEl.textContent = `(x${fmt2(xNow)})`;

    cashView.textContent = (running && stakeLocked && !busted && step > 0) ? `${profit} ₽` : "—";
  }

  function updateButtons() {
    // Ставка доступна только когда раунд не идёт и ставка не списана
    startBtn.disabled = running || stakeLocked || busted;

    // Вперёд доступен только во время раунда
    forwardBtn.disabled = !(running && stakeLocked && !busted);

    // Кэшаут после успешного шага
    cashoutBtn.disabled = !(running && stakeLocked && !busted && step > 0);

    // блокируем редактирование ставки во время раунда
    betInput.disabled = running || stakeLocked;
    betMinus.disabled = betInput.disabled;
    betPlus.disabled = betInput.disabled;
    difficultyEl.disabled = running || stakeLocked;
    chipsWrap.classList.toggle("disabled", betInput.disabled);
  }

  // ---------- traffic light ----------
  function setTraffic(state /* red|yellow|green */) {
    lampRed.classList.toggle("on", state === "red");
    lampYellow.classList.toggle("on", state === "yellow");
    lampGreen.classList.toggle("on", state === "green");
  }

  function trafficLoop() {
    const seq = ["red", "yellow", "green", "yellow"];
    let i = 0;
    setInterval(() => {
      if (!running) { setTraffic("green"); return; }
      setTraffic(seq[i % seq.length]);
      i++;
    }, 700);
  }

  // ---------- ladder ----------
  function buildLadder() {
    ladderRow.innerHTML = "";
    const arr = LADDERS[modeKey()];
    for (let i = 0; i < arr.length; i++) {
      const el = document.createElement("div");
      el.className = "lStep";
      el.textContent = `x${fmt2(arr[i])}`;
      ladderRow.appendChild(el);
    }
    markLadder();
  }

  function markLadder() {
    const els = [...ladderRow.querySelectorAll(".lStep")];
    els.forEach((el, idx) => el.classList.toggle("active", idx === step - 1));
  }

  // ---------- holes row ----------
  const holeEls = [];
  function nextMultiplier() {
    const arr = LADDERS[modeKey()];
    // шаг=0 => следующий будет arr[0]
    const idx = clamp(step, 0, arr.length - 1);
    return arr[idx];
  }

  function setHolesLabels() {
    const m = nextMultiplier();
    holeEls.forEach((h) => {
      const mul = h.querySelector(".mul");
      if (mul) mul.textContent = `x${fmt2(m)}`;
    });
  }

  function highlightSelected() {
    holeEls.forEach((h, idx) => h.classList.toggle("select", idx === selected));
  }

  function buildHolesRow() {
    holesRow.innerHTML = "";
    holeEls.length = 0;

    for (let i = 0; i < HOLES; i++) {
      const h = document.createElement("button");
      h.type = "button";
      h.className = "hole";
      h.dataset.idx = String(i);

      const mul = document.createElement("div");
      mul.className = "mul";
      h.appendChild(mul);

      h.addEventListener("click", async () => {
        await ensureAudio();
        if (!running && !stakeLocked) {
          selected = i;
          highlightSelected();
          placeChicken(true);
          beep(520, 0.04, "sine", 0.018);
          return;
        }
        if (running && stakeLocked && !busted) {
          selected = i;
          highlightSelected();
          beep(520, 0.04, "sine", 0.018);
        }
      });

      holesRow.appendChild(h);
      holeEls.push(h);
    }

    setHolesLabels();
    highlightSelected();
  }

  // ---------- chicken movement ----------
  function placeChicken(immediate = false) {
    const target = holeEls[selected];
    if (!target) return;

    const rRect = roadEl.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();

    const cx = (tRect.left + tRect.right) / 2 - rRect.left;
    const cy = (tRect.top + tRect.bottom) / 2 - rRect.top - 6;

    if (immediate) {
      chickenEl.style.left = `${cx}px`;
      chickenEl.style.top = `${cy}px`;
      return;
    }

    chickenEl.classList.remove("jump");
    void chickenEl.offsetWidth;
    chickenEl.classList.add("jump");
    chickenEl.style.left = `${cx}px`;
    chickenEl.style.top = `${cy}px`;
  }

  function revealRow() {
    // подсветить опасные/безопасные
    holeEls.forEach((h, idx) => {
      h.classList.remove("safe", "bad");
      if (hazards.has(idx)) h.classList.add("bad");
      else h.classList.add("safe");
    });

    // короткий “шлагбаум”
    barrierEl.classList.add("show");
    setTimeout(() => barrierEl.classList.remove("show"), 520);

    // затем очистить подсветки
    setTimeout(() => {
      holeEls.forEach((h) => h.classList.remove("safe", "bad"));
      highlightSelected();
      setHolesLabels();
    }, 760);
  }

  // ---------- hazard generation ----------
  function genHazardsForStep(stepIndex0) {
    hazards = new Set();
    hazardKind = new Map();

    const mk = modeKey();
    const p = HAZARD_P[mk][clamp(stepIndex0, 0, HAZARD_P[mk].length - 1)] ?? 0.2;

    // сколько опасных люков (минимум 1)
    const base = mk === "expert" ? 2 : 1;
    const extra = mk === "expert" ? (Math.random() < 0.35 ? 1 : 0) : (Math.random() < 0.22 ? 1 : 0);
    let dangerCount = clamp(base + extra, 1, HOLES - 2);

    // если “повезло” — иногда уменьшаем количество опасных
    if (Math.random() > p) dangerCount = clamp(dangerCount - 1, 1, HOLES - 2);

    // перемешать индексы
    const pool = [...Array(HOLES).keys()];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (let i = 0; i < dangerCount; i++) hazards.add(pool[i]);

    // тип опасности
    for (const idx of hazards) {
      if (mk === "low") hazardKind.set(idx, "car");
      else {
        const r = Math.random();
        if (r < 0.45) hazardKind.set(idx, "car");
        else if (r < 0.75) hazardKind.set(idx, "fire");
        else hazardKind.set(idx, "fall");
      }
    }
  }

  // ---------- cars (vertical) ----------
  function clearCars() {
    carsLayer.innerHTML = "";
  }

  function spawnCars() {
    clearCars();
    const mk = modeKey();
    const carCount = mk === "expert" ? 8 : 6;
    const lanesX = [20, 50, 80]; // %

    for (let i = 0; i < carCount; i++) {
      const car = document.createElement("div");
      const taxi = Math.random() < 0.35;
      car.className = "car " + (taxi ? "taxi" : "");
      const x = lanesX[(Math.random() * lanesX.length) | 0];
      car.style.left = `${x}%`;

      const dirUp = Math.random() < 0.5;
      car.classList.add(dirUp ? "moveUp" : "moveDown");

      const dur = mk === "expert" ? (2.2 + Math.random() * 2.2) : (3.0 + Math.random() * 2.6);
      const delay = Math.random() * 2.0;
      car.style.animationDuration = `${dur}s`;
      car.style.animationDelay = `${delay}s`;

      carsLayer.appendChild(car);
    }
  }

  // ---------- end states ----------
  function playLose(kind) {
    chickenEl.classList.remove("hit");
    void chickenEl.offsetWidth;
    chickenEl.classList.add("hit");

    if (kind === "car") {
      fx("СБИТА МАШИНОЙ", "bad");
      beep(180, 0.12, "square", 0.03);
      beep(120, 0.16, "sine", 0.025);
    } else if (kind === "fire") {
      fx("ОГОНЬ 🔥", "bad");
      beep(240, 0.10, "sawtooth", 0.02);
      beep(140, 0.14, "sawtooth", 0.018);
    } else {
      fx("ПРОВАЛ", "bad");
      beep(200, 0.10, "triangle", 0.02);
      beep(90, 0.18, "triangle", 0.018);
    }
  }

  function endLose(kind) {
    busted = true;
    running = false;
    stakeLocked = false;

    stageSub.textContent = "Поражение — ставка сгорела.";
    setHint(`<b>Поражение.</b> Нажми <b>Ставка</b>, чтобы начать заново.`);
    playLose(kind);

    // сброс лестницы
    step = 0;
    xNow = 1.0;
    buildLadder();
    setHolesLabels();

    updateStats();
    updateButtons();

    setTraffic("red");
    setTimeout(() => setTraffic("green"), 650);
  }

  function endCashout() {
    const win = Math.floor(bet * xNow);
    setBalance(balance + win);

    stageSub.textContent = `Кэшаут: +${win} ₽`;
    setHint(`<b>Кэшаут успешен.</b> Хочешь ещё — нажми <b>Ставка</b>.`);
    fx(`+${win} ₽`, "good");
    beep(740, 0.07, "sine", 0.02);
    beep(980, 0.08, "sine", 0.02);

    running = false;
    stakeLocked = false;
    busted = false;

    step = 0;
    xNow = 1.0;
    buildLadder();
    setHolesLabels();

    updateStats();
    updateButtons();
    setTraffic("green");
  }

  // ---------- actions ----------
  function canAfford(amount) {
    return balance >= amount;
  }

  async function startRound() {
    await ensureAudio();

    const b = parseBet();
    setBet(b);

    if (!canAfford(bet)) {
      stageSub.textContent = "Недостаточно баланса для ставки.";
      setHint(`<b>Недостаточно баланса</b> для ставки.`);
      beep(180, 0.08, "sine", 0.02);
      return;
    }

    setBalance(balance - bet);

    stakeLocked = true;
    running = true;
    busted = false;

    step = 0;
    xNow = 1.0;

    setModeLabel();
    buildLadder();
    setHolesLabels();
    highlightSelected();
    placeChicken(true);

    stageSub.textContent = "Серия началась — живи.";
    setHint(`Выбери люк и жми <b>Вперёд</b>. Кэшаут доступен после 1 удачного шага.`);

    spawnCars();
    setTraffic("red");
    setTimeout(() => setTraffic("green"), 650);

    updateStats();
    updateButtons();

    beep(520, 0.06, "sine", 0.02);
    beep(760, 0.05, "sine", 0.016);
  }

  async function forward() {
    await ensureAudio();
    if (!running || !stakeLocked || busted) return;

    // опасности для текущего шага (0-based)
    genHazardsForStep(step);

    // прыжок
    placeChicken(false);
    beep(520, 0.05, "sine", 0.016);

    setTimeout(() => {
      const bad = hazards.has(selected);
      revealRow();

      if (bad) {
        const kind = hazardKind.get(selected) || "car";
        endLose(kind);
        return;
      }

      // успех
      step += 1;
      const arr = LADDERS[modeKey()];
      xNow = arr[clamp(step - 1, 0, arr.length - 1)];

      stageSub.textContent = "Успех! X вырос.";
      fx("ЯЙЦО ✅", "good");
      beep(740, 0.05, "triangle", 0.018);

      markLadder();
      setHolesLabels();

      updateStats();
      updateButtons();

      setTraffic("yellow");
      setTimeout(() => setTraffic("green"), 360);

      if (step >= MAX_STEPS) {
        setTimeout(() => {
          stageSub.textContent = "Макс. шаг — авто-кэшаут.";
          endCashout();
        }, 420);
      }
    }, 170);
  }

  async function cashout() {
    await ensureAudio();
    if (cashoutBtn.disabled) return;
    endCashout();
  }

  // ---------- bet controls ----------
  betMinus.addEventListener("click", async () => {
    await ensureAudio();
    setBet(parseBet() - 10);
    beep(320, 0.03, "sine", 0.012);
  });

  betPlus.addEventListener("click", async () => {
    await ensureAudio();
    setBet(parseBet() + 10);
    beep(360, 0.03, "sine", 0.012);
  });

  betInput.addEventListener("input", () => {
    betInput.value = betInput.value.replace(/[^\d]/g, "");
    setBet(parseBet());
  });

  chipsWrap.addEventListener("click", async (e) => {
    const btn = e.target.closest(".chip");
    if (!btn || betInput.disabled) return;
    await ensureAudio();

    const v = btn.dataset.chip;
    if (v === "max") setBet(balance > 0 ? balance : 10);
    else setBet(Number(v));

    beep(420, 0.04, "sine", 0.014);
  });

  difficultyEl.addEventListener("change", async () => {
    await ensureAudio();
    setModeLabel();
    buildLadder();
    setHolesLabels();
    spawnCars();
    beep(520, 0.05, "sine", 0.014);
  });

  // ---------- main buttons ----------
  startBtn.addEventListener("click", startRound);
  forwardBtn.addEventListener("click", forward);
  cashoutBtn.addEventListener("click", cashout);

  // ---------- init ----------
  function resetUI() {
    stageSub.textContent = "Нажми “Ставка” чтобы начать.";
    setHint(`Нажми <b>Ставка</b> чтобы начать. Затем выбери люк и жми <b>Вперёд</b>.`);

    running = false;
    stakeLocked = false;
    busted = false;

    step = 0;
    xNow = 1.0;

    hazards = new Set();
    hazardKind = new Map();

    setModeLabel();
    buildLadder();
    buildHolesRow();
    placeChicken(true);

    spawnCars();
    setTraffic("green");

    updateStats();
    updateButtons();
  }

  function init() {
    setBalance(loadBalance());
    setBet(parseBet() || 100);
    soundUI();
    trafficLoop();
    resetUI();
  }

  init();
})();
