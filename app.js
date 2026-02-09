// app.js — Penalty (15 зон, ставки/серия/кэшаут, анимация мяча+рук, без багов)
// Работает с индексом: элементы по id должны совпадать (см. ниже в комментариях).

/*
Ожидаемые id в index.html:
#soundToggleBtn, #soundDot, #soundText
#balanceEl, #addFundsBtn

#stakeMinus, #stakePlus, #stakeInput
кнопки-чипы: [data-chip] (10/50/100/250/500/max)
#halfBtn, #doubleBtn

кнопки множителей: [data-mult] (1.76, 3.30, 7.08, 15.17, 45.52)
#seriesToggle

#betBtn, #cashoutBtn

#statusText, #lastText, #xText, #potentialText

#stepEl, #currentXEl
#hintText

#zones (контейнер зон) или .zones
внутри зон создаём 15 .zone (если их нет)
#keeper (контейнер рук) + .handL .handR внутри
#ball
#flash

*/

(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ---------- storage ----------
  const LS_KEY_BAL = "penalty_balance_v1";
  const LS_KEY_SOUND = "penalty_sound_v1";

  // ---------- ui ----------
  const soundToggleBtn = $("#soundToggleBtn");
  const soundDot = $("#soundDot");
  const soundText = $("#soundText");
  const balanceEl = $("#balanceEl");
  const addFundsBtn = $("#addFundsBtn");

  const stakeMinus = $("#stakeMinus");
  const stakePlus = $("#stakePlus");
  const stakeInput = $("#stakeInput");
  const chipBtns = $$("[data-chip]");
  const halfBtn = $("#halfBtn");
  const doubleBtn = $("#doubleBtn");

  const multBtns = $$("[data-mult]");
  const seriesToggle = $("#seriesToggle");

  const betBtn = $("#betBtn");
  const cashoutBtn = $("#cashoutBtn");

  const statusText = $("#statusText");
  const lastText = $("#lastText");
  const xText = $("#xText");
  const potentialText = $("#potentialText");

  const stepEl = $("#stepEl");
  const currentXEl = $("#currentXEl");
  const hintText = $("#hintText");

  const zonesWrap = $("#zones") || $(".zones");
  const keeper = $("#keeper");
  const ball = $("#ball");
  const flash = $("#flash");

  // ---------- guards ----------
  const required = [
    soundToggleBtn, soundDot, soundText, balanceEl, addFundsBtn,
    stakeMinus, stakePlus, stakeInput, betBtn, cashoutBtn,
    statusText, lastText, xText, potentialText, stepEl, currentXEl, hintText,
    zonesWrap, keeper, ball, flash, seriesToggle
  ];
  if (required.some(v => !v)) {
    console.warn("app.js: Не найдены нужные элементы в index.html. Проверь id.");
    return;
  }

  // ---------- audio (без внешних файлов) ----------
  let soundOn = (localStorage.getItem(LS_KEY_SOUND) ?? "1") === "1";
  let audioCtx = null;

  const beep = (freq = 500, ms = 70, type = "sine", gainVal = 0.06) => {
    if (!soundOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(gainVal, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + ms / 1000 + 0.02);
    } catch {}
  };

  const sClick = () => beep(620, 45, "triangle", 0.045);
  const sGoal  = () => { beep(740, 80, "sine", 0.06); setTimeout(()=>beep(980, 90, "sine", 0.055), 90); };
  const sSave  = () => { beep(240, 110, "sawtooth", 0.05); setTimeout(()=>beep(190, 120, "sawtooth", 0.045), 110); };

  const setSoundUI = () => {
    soundDot.classList.toggle("on", soundOn);
    soundText.textContent = soundOn ? "Звук: on" : "Звук: off";
  };

  soundToggleBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    localStorage.setItem(LS_KEY_SOUND, soundOn ? "1" : "0");
    setSoundUI();
    sClick();
  });
  setSoundUI();

  // ---------- balance ----------
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const fmtR = (n) => `${Math.floor(n)} ₽`;

  let balance = Number(localStorage.getItem(LS_KEY_BAL) ?? "1000");
  if (!Number.isFinite(balance) || balance < 0) balance = 1000;

  const setBalance = (v) => {
    balance = Math.max(0, Math.floor(v));
    localStorage.setItem(LS_KEY_BAL, String(balance));
    balanceEl.textContent = fmtR(balance);
  };
  setBalance(balance);

  addFundsBtn.addEventListener("click", () => {
    setBalance(balance + 1000);
    sClick();
  });

  // ---------- game config ----------
  // Множители (и сложность): чтобы не было слишком легко — шанс сейва > 1/15
  // Также уменьшаем X (если раньше было "легко"): держим базовые, но поджимаем RTP.
  const MULTS = [
    { x: 1.55, saveChance: 0.32 }, // сложнее
    { x: 2.80, saveChance: 0.36 },
    { x: 5.60, saveChance: 0.43 },
    { x: 12.00, saveChance: 0.52 },
    { x: 30.00, saveChance: 0.62 },
  ];
  // отображаемые значения (как у тебя на скрине), но логика — поджата:
  const MULT_LABELS = [1.76, 3.30, 7.08, 15.17, 45.52];

  // 15 зон (3x5)
  const Z_ROWS = 3;
  const Z_COLS = 5;
  const Z_COUNT = Z_ROWS * Z_COLS;

  // ---------- state ----------
  let state = {
    stake: 100,
    multIndex: 0,
    inRound: false,      // ставка списана, можно бить
    animating: false,
    selectedZone: null,  // 0..14
    step: 0,             // серия голов подряд (если серия включена — просто счетчик)
    seriesOn: false,
    currentX: MULT_LABELS[0],
    potential: 0,
    last: "—",
  };

  // ---------- helpers ----------
  const setStatus = (t) => statusText.textContent = t;
  const setHint = (t) => hintText.textContent = t;

  const setX = (x) => {
    state.currentX = x;
    currentXEl.textContent = `${x.toFixed(2)}x`;
    xText.textContent = `${x.toFixed(2)}x`;
    state.potential = Math.floor(state.stake * x);
    potentialText.textContent = fmtR(state.potential);
  };

  const setStep = (n) => {
    state.step = n;
    stepEl.textContent = String(n);
  };

  const setLast = (t) => {
    state.last = t;
    lastText.textContent = t;
  };

  const setStakeUI = () => {
    stakeInput.value = String(state.stake);
  };

  const validateStake = () => {
    const v = Number(String(stakeInput.value).replace(/[^\d]/g, "")) || 0;
    state.stake = clamp(v, 10, 1_000_000);
    setStakeUI();
    setX(state.currentX);
  };

  const enableZones = (on) => {
    $$(".zone", zonesWrap).forEach(z => z.classList.toggle("disabled", !on));
  };

  const updateButtons = () => {
    // Важно: множитель менять нельзя после первой "Ставка" (списали деньги)
    const lockMult = state.inRound || state.animating;
    multBtns.forEach(btn => btn.classList.toggle("locked", lockMult));

    betBtn.disabled = state.animating || state.inRound; // ставка 1 раз
    cashoutBtn.disabled = state.animating || !state.inRound || state.step <= 0; // кэшаут доступен после первого гола

    // ставка/инпуты недоступны во время раунда
    const lockStake = state.inRound || state.animating;
    [stakeMinus, stakePlus, stakeInput, halfBtn, doubleBtn, ...chipBtns].forEach(el => {
      if (!el) return;
      el.disabled = lockStake;
      el.style.opacity = lockStake ? "0.55" : "";
      el.style.pointerEvents = lockStake ? "none" : "";
    });
  };

  const pickMultIndex = (idx) => {
    if (state.inRound || state.animating) return; // нельзя менять во время раунда
    state.multIndex = clamp(idx, 0, MULTS.length - 1);
    multBtns.forEach((b, i) => b.classList.toggle("active", i === state.multIndex));
    // В UI показываем "как в рефе"
    setX(MULT_LABELS[state.multIndex]);
  };

  // ---------- create zones if missing ----------
  const ensureZones = () => {
    if ($$(".zone", zonesWrap).length === Z_COUNT) return;
    zonesWrap.innerHTML = "";
    for (let i = 0; i < Z_COUNT; i++) {
      const z = document.createElement("button");
      z.type = "button";
      z.className = "zone";
      z.dataset.zone = String(i);
      zonesWrap.appendChild(z);
    }
  };
  ensureZones();

  // ---------- init multipliers (white text + correct labels) ----------
  const initMultUI = () => {
    multBtns.forEach((btn, i) => {
      btn.textContent = `${MULT_LABELS[i].toFixed(2)}x`;
    });
    pickMultIndex(0);
  };
  initMultUI();

  // ---------- stake controls ----------
  stakeMinus.addEventListener("click", () => { sClick(); state.stake = Math.max(10, state.stake - 10); setStakeUI(); setX(state.currentX); });
  stakePlus.addEventListener("click", () => { sClick(); state.stake = state.stake + 10; setStakeUI(); setX(state.currentX); });

  stakeInput.addEventListener("input", () => validateStake());
  stakeInput.addEventListener("blur", () => validateStake());

  chipBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      sClick();
      chipBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const val = String(btn.dataset.chip);
      if (val === "max") {
        state.stake = Math.max(10, balance);
      } else {
        state.stake = Number(val) || 100;
      }
      setStakeUI();
      setX(state.currentX);
    });
  });

  halfBtn?.addEventListener("click", () => { sClick(); state.stake = Math.max(10, Math.floor(state.stake / 2)); setStakeUI(); setX(state.currentX); });
  doubleBtn?.addEventListener("click", () => { sClick(); state.stake = Math.max(10, state.stake * 2); setStakeUI(); setX(state.currentX); });

  // ---------- series ----------
  seriesToggle.addEventListener("change", () => {
    state.seriesOn = !!seriesToggle.checked;
    sClick();
  });

  // ---------- multiplier buttons ----------
  multBtns.forEach((btn, idx) => {
    btn.addEventListener("click", () => {
      sClick();
      pickMultIndex(idx);
    });
  });

  // ---------- zones selection ----------
  const clearZonePick = () => {
    $$(".zone", zonesWrap).forEach(z => z.classList.remove("pick"));
    state.selectedZone = null;
  };

  const setZonePick = (idx) => {
    clearZonePick();
    const z = $(`.zone[data-zone="${idx}"]`, zonesWrap);
    if (!z) return;
    z.classList.add("pick");
    state.selectedZone = idx;
  };

  zonesWrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".zone");
    if (!btn) return;
    if (btn.classList.contains("disabled")) return;
    sClick();
    const idx = Number(btn.dataset.zone);
    if (!Number.isFinite(idx)) return;

    // Можно выбирать зону только если раунд активен (ставка списана)
    if (!state.inRound) {
      setHint("Сначала нажми «Ставка», затем выбери зону удара.");
      beep(320, 80, "sawtooth", 0.04);
      return;
    }
    if (state.animating) return;

    setZonePick(idx);
    // сразу бьём (без отдельной кнопки), как ты хотел
    shoot(idx);
  });

  // ---------- bet / cashout ----------
  const resetForNewTry = (keepStake = true) => {
    state.inRound = false;
    state.animating = false;
    clearZonePick();
    setStep(0);
    setLast("—");
    setStatus("Ожидание");
    setHint("Нажми «Ставка», затем кликай по зоне удара (5×3).");
    setX(MULT_LABELS[state.multIndex]);
    // вернуть мяч и руки
    ball.style.transition = "none";
    ball.style.transform = "translate(-50%, -50%)";
    keeper.className = "keeper pos-7"; // центр
    flash.className = "flash";
    enableZones(false);
    updateButtons();
    if (!keepStake) {
      state.stake = 100;
      setStakeUI();
    }
  };

  const startRound = () => {
    validateStake();
    if (state.stake <= 0) return;

    if (balance < state.stake) {
      setStatus("Недостаточно баланса");
      setHint("Попробуй уменьшить ставку или нажми +1000 ₽.");
      sSave();
      return;
    }

    // списываем 1 раз
    setBalance(balance - state.stake);
    state.inRound = true;
    state.animating = false;
    clearZonePick();
    setStep(0);
    setLast("—");
    setStatus("Выбери точку удара");
    setHint("Кликни по зоне (5×3) — мяч полетит туда.");
    enableZones(true);
    updateButtons();
    sClick();
  };

  betBtn.addEventListener("click", startRound);

  cashoutBtn.addEventListener("click", () => {
    if (!state.inRound || state.animating || state.step <= 0) return;
    sClick();
    // выплата = stake * текущий X (фикс)
    const payout = Math.floor(state.stake * MULT_LABELS[state.multIndex]);
    setBalance(balance + payout);
    setLast(`Кэшаут ${MULT_LABELS[state.multIndex].toFixed(2)}x • +${fmtR(payout)}`);
    setStatus("Кэшаут");
    setHint("Кэшаут успешен. Нажми «Ставка», чтобы начать заново.");
    // раунд заканчиваем
    state.inRound = false;
    enableZones(false);
    updateButtons();
  });

  // ---------- animation & logic ----------
  const zoneCenterInGoal = (idx) => {
    const row = Math.floor(idx / Z_COLS);
    const col = idx % Z_COLS;

    // координаты внутри goalFrame (проценты относительно области ворот)
    // Подгон под "net" и "zones" (они 10%..90% по ширине в зоне ворот)
    const x = 10 + (80 / Z_COLS) * (col + 0.5);
    const y = 12 + (48 / Z_ROWS) * (row + 0.5);
    return { x, y };
  };

  const setFlash = (type, text) => {
    flash.className = `flash show ${type}`;
    flash.textContent = text;
    setTimeout(() => { flash.className = "flash"; flash.textContent = ""; }, 650);
  };

  const shoot = async (zoneIdx) => {
    if (!state.inRound || state.animating) return;
    state.animating = true;
    updateButtons();

    const { x, y } = zoneCenterInGoal(zoneIdx);

    // вратарь "угадывает" (сложность повышена: шанс сейва больше)
    const saveChance = MULTS[state.multIndex].saveChance;
    let keeperGuess = zoneIdx;
    const willSave = Math.random() < saveChance;

    if (willSave) {
      keeperGuess = zoneIdx; // угадывает точно
    } else {
      // иногда двигается в соседнюю зону для правдоподобия
      const jitter = (Math.random() < 0.55) ? (Math.random() < 0.5 ? -1 : 1) : 0;
      keeperGuess = clamp(zoneIdx + jitter, 0, Z_COUNT - 1);
    }

    // двигаем руки
    keeper.className = `keeper pos-${keeperGuess}`;

    // траектория: летим в точку (проценты -> translate)
    // Мяч стартует из центра снизу (50%, 80%) в (x%, y%)
    const dx = x - 50;
    const dy = y - 80;

    // анимация
    ball.style.transition = "transform 520ms cubic-bezier(.2,.9,.2,1)";
    ball.style.transform = `translate(calc(-50% + ${dx}%), calc(-50% + ${dy}%)) scale(0.92)`;

    beep(520, 55, "triangle", 0.05);

    await wait(560);

    // результат: если вратарь угадал зону (willSave=true) — сейв, иначе гол
    if (willSave) {
      // проигрыш: ставка сгорает, раунд заканчивается
      sSave();
      setFlash("save", "СЕЙВ");
      setStatus("Сейв • проигрыш");
      setLast("Сейв");
      setHint("Вратарь поймал. Нажми «Ставка», чтобы начать заново.");
      state.inRound = false;
      enableZones(false);
      updateButtons();
      // вернуть мяч
      await wait(220);
      resetBallAndKeeper();
      // серия: обнуляем
      setStep(0);
      state.animating = false;
      updateButtons();
      return;
    } else {
      // гол: можно продолжать бить дальше (НЕ останавливаем игру)
      sGoal();
      setFlash("goal", "ГОЛ!");
      setStatus("Гол! Можно бить дальше");
      setLast("Гол");
      setHint("Кликай по следующей зоне (или жми «Кэшаут»).");

      // серия побед
      setStep(state.step + 1);

      // разрешаем кэшаут
      updateButtons();

      // вернуть мяч и руки в центр — и продолжить
      await wait(240);
      resetBallAndKeeper();

      state.animating = false;
      updateButtons();
      return;
    }
  };

  const resetBallAndKeeper = () => {
    // возвращаем центр
    ball.style.transition = "transform 280ms ease";
    ball.style.transform = "translate(-50%, -50%) scale(1)";
    keeper.className = "keeper pos-7";
    clearZonePick();
  };

  function wait(ms){ return new Promise(res => setTimeout(res, ms)); }

  // ---------- init ----------
  setStakeUI();
  setStep(0);
  setLast("—");
  setStatus("Ожидание");
  setHint("Нажми «Ставка», затем кликай по зоне удара (5×3).");
  enableZones(false);
  updateButtons();

  // страховка от “не нажимается” из-за overlay:
  // делаем flash полностью некликабельным (на случай если index меняли)
  flash.style.pointerEvents = "none";
})();
