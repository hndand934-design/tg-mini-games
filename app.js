/* =========================================
   Penalty — app.js (final, stable)
   - 15 zones (5x3) clickable
   - Bet deducts once, then multiple kicks until SAVE or cashout
   - Cashout available after first GOAL
   - Risk cannot be changed after Bet (until Reset)
   - Harder math: lower base X + higher save chance
   - Hands "dive" to keeper target; ball flies by trajectory
   - Sounds (no external files): WebAudio beeps
   ========================================= */

(() => {
  "use strict";

  /* ---------------- DOM ---------------- */
  const $ = (s) => document.querySelector(s);

  const el = {
    // top
    soundBtn: $("#soundBtn"),
    soundLed: $("#soundLed"),
    balanceTop: $("#balanceTop"),
    addFundsBtn: $("#addFundsBtn"),

    // left: bet
    betMinus: $("#betMinus"),
    betPlus: $("#betPlus"),
    betValue: $("#betValue"),
    chips: Array.from(document.querySelectorAll(".chip[data-chip]")),
    halfBtn: $("#halfBtn"),
    doubleBtn: $("#doubleBtn"),
    maxBtn: $("#maxBtn"),

    // risk
    riskBtns: Array.from(document.querySelectorAll(".risk[data-risk]")),
    riskLabel: $("#riskLabel"),

    // series
    seriesToggle: $("#seriesToggle"),
    streakVal: $("#streakVal"),

    // actions
    betBtn: $("#betBtn"),
    cashoutBtn: $("#cashoutBtn"),
    resetBtn: $("#resetBtn"),

    // mini stats
    statusText: $("#statusText"),
    lastText: $("#lastText"),
    currentXText: $("#currentXText"),
    potentialText: $("#potentialText"),

    // center hud
    stepHud: $("#stepHud"),
    xHud: $("#xHud"),

    // arena
    zonesWrap: $("#zonesWrap"),
    zones: [],

    hands: $("#hands"),
    ball: $("#ball"),
    fx: $("#fx"),

    // right
    hintText: $("#hintText"),
    stMode: $("#stMode"),
    stStake: $("#stStake"),
    stCashout: $("#stCashout"),
  };

  /* ---------------- State ---------------- */
  const LS_BAL = "penalty_balance_v1";
  const LS_SOUND = "penalty_sound_v1";

  const RISK_PRESETS = {
    // по запросу: сложность выше, X ниже, сейв чаще
    low:    { name: "Низкий риск",   baseX: 1.18, stepX: 0.12, save: 0.42 },
    mid:    { name: "Средний риск",  baseX: 1.42, stepX: 0.18, save: 0.48 },
    high:   { name: "Высокий риск",  baseX: 1.76, stepX: 0.26, save: 0.55 },
    insane: { name: "Экстрим",       baseX: 2.40, stepX: 0.38, save: 0.62 },
  };

  const state = {
    soundOn: true,

    balance: 1000,
    bet: 100,
    riskKey: "high",

    inRound: false,     // ставка поставлена
    canShoot: false,    // можно выбрать зону и бить
    canCashout: false,  // после 1 гола
    lockedRisk: false,

    step: 0,            // шаги (удары)
    goals: 0,           // голов подряд в раунде
    streak: 0,          // серия (если включено)

    last: "—",
    currentX: 1.0,
    keeperIndex: null,  // куда прыгнул вратарь (0..14)
    selectedIndex: null,// куда бьём
    animating: false,
  };

  /* ---------------- Helpers ---------------- */
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const fmtRub = (n) => `${Math.max(0, Math.floor(n))} ₽`;
  const fmtX = (x) => `x${x.toFixed(2)}`;

  function load() {
    const bal = Number(localStorage.getItem(LS_BAL));
    if (Number.isFinite(bal) && bal >= 0) state.balance = Math.floor(bal);

    const snd = localStorage.getItem(LS_SOUND);
    if (snd === "0") state.soundOn = false;
    if (snd === "1") state.soundOn = true;
  }
  function saveBalance() {
    localStorage.setItem(LS_BAL, String(Math.floor(state.balance)));
  }
  function saveSound() {
    localStorage.setItem(LS_SOUND, state.soundOn ? "1" : "0");
  }

  /* ---------------- Tiny sounds (WebAudio) ---------------- */
  let audioCtx = null;
  function beep(freq = 440, dur = 0.06, type = "sine", gain = 0.04) {
    if (!state.soundOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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
  const sfx = {
    click() { beep(520, 0.03, "square", 0.03); },
    bet()   { beep(320, 0.08, "sine", 0.04); setTimeout(()=>beep(480,0.07,"sine",0.035), 70); },
    kick()  { beep(180, 0.06, "sawtooth", 0.03); },
    goal()  { beep(660,0.08,"sine",0.05); setTimeout(()=>beep(880,0.09,"sine",0.045), 90); },
    save()  { beep(120,0.12,"square",0.05); setTimeout(()=>beep(90,0.14,"square",0.05), 120); },
    cash()  { beep(740,0.07,"triangle",0.045); setTimeout(()=>beep(980,0.09,"triangle",0.04), 80); },
    error() { beep(110,0.12,"square",0.05); },
  };

  /* ---------------- UI update ---------------- */
  function applyRiskUI() {
    const preset = RISK_PRESETS[state.riskKey];
    el.riskLabel.textContent = preset ? preset.name : "—";

    el.riskBtns.forEach((b) => {
      const k = b.dataset.risk;
      const active = k === state.riskKey;
      b.classList.toggle("active", active);
      b.disabled = state.lockedRisk; // нельзя менять после ставки
      b.style.pointerEvents = state.lockedRisk ? "none" : "auto";
    });

    el.currentXText.textContent = fmtX(state.currentX);
    el.xHud.textContent = `X: ${fmtX(state.currentX)}`;
  }

  function setHint(text) {
    el.hintText.textContent = text;
  }

  function setStatus(text) {
    el.statusText.textContent = text;
  }

  function updateAll() {
    // top
    el.balanceTop.textContent = fmtRub(state.balance);
    el.soundLed.classList.toggle("on", state.soundOn);
    el.soundBtn.textContent = state.soundOn ? "Звук: on" : "Звук: off";

    // bet
    el.betValue.textContent = fmtRub(state.bet);

    // state panel right
    el.stMode.textContent = "Penalty";
    el.stStake.textContent = fmtRub(state.bet);
    el.stCashout.textContent = state.canCashout ? fmtRub(Math.floor(state.bet * state.currentX)) : "—";

    // hud
    el.stepHud.textContent = `Шаг: ${state.step}`;
    el.xHud.textContent = `X: ${fmtX(state.currentX)}`;

    // mini
    el.lastText.textContent = state.last;
    el.currentXText.textContent = fmtX(state.currentX);
    el.potentialText.textContent = fmtRub(Math.floor(state.bet * state.currentX));

    // series
    el.streakVal.textContent = String(state.seriesToggle && el.seriesToggle.checked ? state.streak : 0);

    // buttons
    el.betBtn.disabled = state.inRound;                      // ставка 1 раз
    el.cashoutBtn.disabled = !state.inRound || !state.canCashout || state.animating;
    el.resetBtn.disabled = state.animating;

    // allow shoot
    state.canShoot = state.inRound && !state.animating;
    el.zonesWrap.style.opacity = state.inRound ? "1" : "0.7";
    el.zonesWrap.style.filter = state.inRound ? "none" : "grayscale(.15)";

    // lock risk
    applyRiskUI();
  }

  /* ---------------- Build zones (5x3) ---------------- */
  function buildZones() {
    el.zonesWrap.innerHTML = "";
    el.zones = [];

    for (let i = 0; i < 15; i++) {
      const z = document.createElement("button");
      z.type = "button";
      z.className = "zone";
      z.setAttribute("aria-label", `Зона ${i + 1}`);
      z.dataset.idx = String(i);
      z.addEventListener("click", () => onPickZone(i));
      el.zonesWrap.appendChild(z);
      el.zones.push(z);
    }
  }

  function clearZoneClasses() {
    el.zones.forEach((z) => z.classList.remove("pick", "hit", "save"));
  }

  function onPickZone(i) {
    if (!state.canShoot || !state.inRound) {
      sfx.error();
      setHint("Сначала нажми «Ставка», чтобы начать.");
      return;
    }
    if (state.animating) return;

    clearZoneClasses();
    state.selectedIndex = i;
    el.zones[i].classList.add("pick");

    setHint("Отлично. Нажми по зоне ещё раз для удара (или выбери другую).");
    sfx.click();

    // Удар по второму клику по той же зоне — как просил: “нажал на секцию и полетит”
    // На практике удобнее: один клик = выбор, второй клик = удар.
    // Но также разрешим сразу удар, если уже выбрано.
    if (state.selectedIndex === i && el.zones[i].classList.contains("pick")) {
      // второй клик? проверяем таймштамп
      // проще: если pick уже стоит и прошло чуть-чуть — выполняем удар
      // (используем небольшой debounce через dataset)
      const now = Date.now();
      const last = Number(el.zones[i].dataset.lastClick || 0);
      el.zones[i].dataset.lastClick = String(now);
      if (now - last < 450) {
        shoot(i);
      }
    }
  }

  /* ---------------- Round logic ---------------- */
  function calcCurrentX() {
    const p = RISK_PRESETS[state.riskKey];
    // X растёт медленно, чтобы не “дюпали”
    // baseX применяется к выигрышу за гол, а не к каждому удару.
    const x = 1 + (p.stepX * state.goals);
    state.currentX = clamp(x, 1.0, 8.0); // ограничим верх, чтобы не улетало
  }

  function chooseKeeperIndex(playerIdx) {
    // Усложнение: не просто равновероятно.
    // Есть шанс, что вратарь угадает ту же зону (save chance), иначе выбирает рядом.
    const p = RISK_PRESETS[state.riskKey];
    const r = Math.random();

    if (r < p.save) return playerIdx;

    // иначе выбираем "похожую" зону поблизости (реалистичнее)
    const row = Math.floor(playerIdx / 5);
    const col = playerIdx % 5;

    const candidates = [];
    for (let rr = Math.max(0, row - 1); rr <= Math.min(2, row + 1); rr++) {
      for (let cc = Math.max(0, col - 1); cc <= Math.min(4, col + 1); cc++) {
        const idx = rr * 5 + cc;
        if (idx !== playerIdx) candidates.push(idx);
      }
    }
    if (!candidates.length) return (playerIdx + 1) % 15;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /* ---------------- Animations ---------------- */
  function zoneToTarget(idx) {
    // берем bounding box зоны внутри stage
    const z = el.zones[idx];
    const stage = $(".goal-stage");
    const zr = z.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();

    const cx = (zr.left - sr.left) + zr.width / 2;
    const cy = (zr.top - sr.top) + zr.height / 2;

    return { x: cx, y: cy };
  }

  function ballHome() {
    // исходная позиция мяча (низ)
    const stage = $(".goal-stage");
    const sr = stage.getBoundingClientRect();
    return { x: sr.width / 2, y: sr.height * 0.72 };
  }

  function setBallPos(x, y) {
    el.ball.style.left = `${x}px`;
    el.ball.style.top = `${y}px`;
  }

  function resetHandsClass() {
    el.hands.classList.remove("dive-left", "dive-right", "dive-up", "center");
  }

  function handsDiveTo(idx) {
    const col = idx % 5;
    const row = Math.floor(idx / 5);

    // простая логика направления
    if (row === 0) {
      el.hands.classList.add("dive-up");
    } else if (col <= 1) {
      el.hands.classList.add("dive-left");
    } else if (col >= 3) {
      el.hands.classList.add("dive-right");
    } else {
      el.hands.classList.add("center");
    }
  }

  function spawnFX(x, y) {
    const p = document.createElement("div");
    p.className = "pop";
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    el.fx.appendChild(p);
    setTimeout(() => p.remove(), 520);
  }

  function animateKick(to, onDone) {
    state.animating = true;
    updateAll();

    // старт/финиш
    const from = ballHome();
    setBallPos(from.x, from.y);

    el.ball.classList.remove("kick");
    void el.ball.offsetWidth;
    el.ball.classList.add("kick");

    // траектория: квадратичная Безье (простая)
    const mid = {
      x: (from.x + to.x) / 2,
      y: Math.min(from.y, to.y) - 120,
    };

    const dur = 520;
    const t0 = performance.now();

    const tick = (t) => {
      const k = clamp((t - t0) / dur, 0, 1);
      const inv = 1 - k;

      const x = inv*inv*from.x + 2*inv*k*mid.x + k*k*to.x;
      const y = inv*inv*from.y + 2*inv*k*mid.y + k*k*to.y;

      setBallPos(x, y);

      if (k < 1) {
        requestAnimationFrame(tick);
      } else {
        spawnFX(to.x, to.y);
        setTimeout(() => {
          state.animating = false;
          updateAll();
          onDone?.();
        }, 180);
      }
    };

    requestAnimationFrame(tick);
  }

  function animateResetBall() {
    const from = {
      x: parseFloat(el.ball.style.left || "0"),
      y: parseFloat(el.ball.style.top || "0"),
    };
    const to = ballHome();
    const dur = 320;
    const t0 = performance.now();

    const tick = (t) => {
      const k = clamp((t - t0) / dur, 0, 1);
      const x = from.x + (to.x - from.x) * k;
      const y = from.y + (to.y - from.y) * k;
      setBallPos(x, y);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ---------------- Gameplay ---------------- */
  function startBet() {
    if (state.inRound) return;

    if (state.bet <= 0) {
      sfx.error();
      setHint("Ставка должна быть больше 0.");
      return;
    }
    if (state.balance < state.bet) {
      sfx.error();
      setHint("Недостаточно баланса для ставки.");
      setStatus("Недостаточно баланса");
      return;
    }

    state.balance -= state.bet;
    saveBalance();

    state.inRound = true;
    state.lockedRisk = true;     // блокируем выбор риска после ставки
    state.step = 0;
    state.goals = 0;
    state.canCashout = false;
    state.last = "Ставка принята";
    state.selectedIndex = null;
    state.keeperIndex = null;

    calcCurrentX();
    clearZoneClasses();
    resetHandsClass();
    el.hands.classList.add("center");

    setStatus("Выбери точку удара");
    setHint("Кликни по зоне в воротах (5×3). Второй клик по той же зоне — удар.");
    sfx.bet();
    updateAll();
  }

  function finishRoundLost() {
    // проигрыш: ставка уже списана, раунд окончен
    state.inRound = false;
    state.canCashout = false;
    state.lockedRisk = false;
    state.selectedIndex = null;
    state.keeperIndex = null;
    state.step = 0;
    state.goals = 0;
    state.last = "Сейв — ставка сгорела";
    calcCurrentX();

    if (el.seriesToggle.checked) state.streak = 0;

    clearZoneClasses();
    resetHandsClass();
    el.hands.classList.add("center");

    setStatus("Проигрыш");
    setHint("Вратарь поймал. Нажми «Ставка», чтобы начать заново.");
    updateAll();
  }

  function cashout() {
    if (!state.inRound || !state.canCashout) return;

    const win = Math.floor(state.bet * state.currentX);
    state.balance += win;
    saveBalance();

    state.inRound = false;
    state.canCashout = false;
    state.lockedRisk = false;

    state.last = `Кэшаут: +${fmtRub(win)}`;
    setStatus("Кэшаут");
    setHint("Кэшаут успешен. Нажми «Ставка», чтобы начать заново.");
    sfx.cash();

    state.selectedIndex = null;
    state.keeperIndex = null;
    state.step = 0;
    state.goals = 0;
    calcCurrentX();

    clearZoneClasses();
    resetHandsClass();
    el.hands.classList.add("center");

    updateAll();
  }

  function resetAll() {
    state.inRound = false;
    state.canCashout = false;
    state.lockedRisk = false;
    state.step = 0;
    state.goals = 0;
    state.selectedIndex = null;
    state.keeperIndex = null;
    state.last = "Сброс";
    calcCurrentX();

    if (el.seriesToggle.checked) state.streak = 0;

    clearZoneClasses();
    resetHandsClass();
    el.hands.classList.add("center");
    setStatus("Ожидание");
    setHint("Нажми «Ставка», чтобы начать.");
    sfx.click();
    updateAll();
  }

  function shoot(idx) {
    if (!state.inRound || state.animating) return;

    // шаг
    state.step += 1;
    state.selectedIndex = idx;

    // выбрать вратаря
    const keeper = chooseKeeperIndex(idx);
    state.keeperIndex = keeper;

    // подготовка UI
    clearZoneClasses();
    el.zones[idx].classList.add("pick");

    resetHandsClass();
    handsDiveTo(keeper);

    // анимация мяча
    const target = zoneToTarget(idx);
    sfx.kick();
    animateKick(target, () => {
      const saved = keeper === idx;

      if (saved) {
        // save
        el.zones[idx].classList.remove("pick");
        el.zones[idx].classList.add("save");
        state.last = `Сейв (зона ${idx + 1})`;
        setStatus("Сейв");
        setHint("Сейв. Раунд завершён.");
        sfx.save();

        // серия
        if (el.seriesToggle.checked) state.streak = 0;

        // завершение
        setTimeout(() => finishRoundLost(), 250);
        return;
      }

      // goal
      el.zones[idx].classList.remove("pick");
      el.zones[idx].classList.add("hit");

      state.goals += 1;

      if (el.seriesToggle.checked) state.streak += 1;

      calcCurrentX();
      state.canCashout = true;

      state.last = `Гол (зона ${idx + 1})`;
      setStatus("Гол! Можно продолжать");
      setHint("Гол! Можешь бить дальше (риск: вратарь поймает) или нажать «Кэшаут».");

      sfx.goal();

      // вернуть мяч вниз и позволить продолжать
      setTimeout(() => {
        animateResetBall();
        resetHandsClass();
        el.hands.classList.add("center");
        state.selectedIndex = null;
        updateAll();
      }, 180);
    });

    updateAll();
  }

  /* ---------------- Controls ---------------- */
  function setBet(v) {
    state.bet = Math.max(1, Math.floor(v));
    updateAll();
  }

  function changeBet(delta) {
    setBet(state.bet + delta);
    sfx.click();
  }

  function addFunds(amount = 1000) {
    state.balance += amount;
    saveBalance();
    sfx.cash();
    updateAll();
  }

  function setRisk(key) {
    if (state.lockedRisk) {
      sfx.error();
      setHint("Нельзя менять множитель после «Ставка» (до сброса).");
      return;
    }
    if (!RISK_PRESETS[key]) return;
    state.riskKey = key;
    calcCurrentX();
    sfx.click();
    updateAll();
  }

  function toggleSound() {
    state.soundOn = !state.soundOn;
    saveSound();
    sfx.click();
    updateAll();
  }

  /* ---------------- Events ---------------- */
  function bind() {
    // sound
    el.soundBtn.addEventListener("click", toggleSound);

    // add funds
    el.addFundsBtn.addEventListener("click", () => addFunds(1000));

    // bet controls
    el.betMinus.addEventListener("click", () => changeBet(-10));
    el.betPlus.addEventListener("click", () => changeBet(+10));

    el.chips.forEach((c) => {
      c.addEventListener("click", () => {
        const v = Number(c.dataset.chip);
        if (!Number.isFinite(v)) return;
        setBet(v);
        sfx.click();
      });
    });

    el.halfBtn.addEventListener("click", () => {
      setBet(Math.max(1, Math.floor(state.bet / 2)));
      sfx.click();
    });
    el.doubleBtn.addEventListener("click", () => {
      setBet(Math.max(1, Math.floor(state.bet * 2)));
      sfx.click();
    });
    el.maxBtn.addEventListener("click", () => {
      setBet(Math.max(1, state.balance)); // max = баланс
      sfx.click();
    });

    // risk
    el.riskBtns.forEach((b) => {
      b.addEventListener("click", () => setRisk(b.dataset.risk));
    });

    // main actions
    el.betBtn.addEventListener("click", startBet);
    el.cashoutBtn.addEventListener("click", cashout);
    el.resetBtn.addEventListener("click", resetAll);

    // series toggle
    el.seriesToggle.addEventListener("change", () => {
      if (!el.seriesToggle.checked) state.streak = 0;
      updateAll();
    });

    // safety: pointer-events and overlay issues guard (common "не нажимается ставка")
    // если что-то перекрывает — обычно это z-index/overlay. Здесь дополнительно:
    [el.betBtn, el.cashoutBtn, el.resetBtn].forEach((btn) => {
      btn.style.pointerEvents = "auto";
    });
  }

  /* ---------------- Init ---------------- */
  function init() {
    load();
    buildZones();
    bind();

    // initial
    state.bet = 100;
    if (!RISK_PRESETS[state.riskKey]) state.riskKey = "high";
    calcCurrentX();

    // place ball at home
    // (нужно после первого layout)
    requestAnimationFrame(() => {
      const h = ballHome();
      setBallPos(h.x, h.y);
    });

    setStatus("Ожидание");
    setHint("Нажми «Ставка», чтобы начать. Затем кликай по зоне в воротах (5×3).");
    updateAll();
  }

  init();
})();
