/* =========================
   RPS — серия + лестница X + Cashout
   (без “сброса”, ставка списывается 1 раз на старт серии)
   ========================= */

(() => {
  "use strict";

  /* ---------- helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (n) => {
    const x = Math.round(n);
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  };

  /* ---------- DOM (ОЖИДАЕМЫЕ ID/классы из твоего индекса) ---------- */
  const el = {
    bal: $("#balanceValue"),
    soundBtn: $("#soundBtn"),
    soundDot: $("#soundDot"),
    soundText: $("#soundText"),

    // статус-плашки
    stStatus: $("#stStatusValue"),
    stYou: $("#stYouValue"),
    stBot: $("#stBotValue"),
    stRes: $("#stResValue"),

    // лестница X
    stepNodes: $$(".stepX"),
    ladderHint: $("#ladderHint"),

    // мета
    metaSeries: $("#metaSeriesValue"),
    metaX: $("#metaXValue"),
    metaPotential: $("#metaPotentialValue"),

    // арена
    botCard: $("#botCard"),
    youCard: $("#youCard"),
    botIcon: $("#botIcon"),
    youIcon: $("#youIcon"),
    botSub: $("#botSub"),
    youSub: $("#youSub"),

    // выбор
    pickBtns: $$(".pickBtn"),

    // ставка
    betInput: $("#betInput"),
    betMinus: $("#betMinus"),
    betPlus: $("#betPlus"),
    chips: $$(".chip[data-add]"),

    // кнопки
    playBtn: $("#playBtn"),
    cashoutBtn: $("#cashoutBtn"),

    // вывод
    payoutValue: $("#payoutValue"),
  };

  /* ---------- safety checks ---------- */
  // Если у тебя другой индекс — ты сразу увидишь в консоли что не найдено.
  const required = [
    "bal","soundBtn","soundDot","soundText",
    "stStatus","stYou","stBot","stRes",
    "ladderHint","metaSeries","metaX","metaPotential",
    "botCard","youCard","botIcon","youIcon","botSub","youSub",
    "betInput","betMinus","betPlus","playBtn","cashoutBtn","payoutValue"
  ];
  const missing = required.filter(k => !el[k]);
  if (missing.length) {
    console.warn("[RPS] Missing DOM nodes:", missing);
  }

  /* ---------- game config ---------- */
  const X_LADDER = [1.00, 1.20, 1.50, 2.00, 3.00, 5.00, 10.00]; // 0..6 (шаги)
  const MOVE = {
    rock:     { name: "Камень",   emoji: "✊🏻" },
    scissors: { name: "Ножницы",  emoji: "✌🏻" },
    paper:    { name: "Бумага",   emoji: "✋🏻" },
  };
  const MOVE_KEYS = Object.keys(MOVE);

  /* ---------- state ---------- */
  const LS_BAL = "tgmini_rps_balance";
  const LS_SOUND = "tgmini_rps_sound";

  let balance = Number(localStorage.getItem(LS_BAL) || "1000");
  if (!Number.isFinite(balance) || balance < 0) balance = 1000;

  let soundOn = (localStorage.getItem(LS_SOUND) ?? "1") === "1";

  // Серия
  let inSeries = false;
  let seriesBet = 0;         // ставка, списана 1 раз
  let wins = 0;              // подряд побед (0..6)
  let lastYou = null;
  let lastBot = null;

  // Блокировка кнопок во время анимации
  let locked = false;

  /* ---------- audio (тихо, без излишней громкости) ---------- */
  let audioCtx = null;
  const ensureAudio = () => {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  };

  const beep = (type = "click") => {
    if (!soundOn) return;
    try {
      ensureAudio();
      const t0 = audioCtx.currentTime;

      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g);
      g.connect(audioCtx.destination);

      // мягкие частоты
      let f1 = 440, f2 = 660, dur = 0.06, vol = 0.08;
      if (type === "click") { f1 = 420; f2 = 520; dur = 0.05; vol = 0.06; }
      if (type === "play")  { f1 = 520; f2 = 740; dur = 0.08; vol = 0.07; }
      if (type === "win")   { f1 = 660; f2 = 980; dur = 0.12; vol = 0.08; }
      if (type === "lose")  { f1 = 360; f2 = 220; dur = 0.12; vol = 0.08; }
      if (type === "cash")  { f1 = 740; f2 = 880; dur = 0.10; vol = 0.08; }

      o.type = "sine";
      o.frequency.setValueAtTime(f1, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(40, f2), t0 + dur);

      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch(e) {}
  };

  const setSoundUI = () => {
    if (!el.soundText || !el.soundDot) return;
    el.soundText.textContent = soundOn ? "Звук: on" : "Звук: off";
    el.soundDot.style.background = soundOn ? "var(--green1)" : "rgba(234,241,255,.35)";
    el.soundDot.style.boxShadow = soundOn
      ? "0 0 0 3px rgba(57,217,138,.18)"
      : "0 0 0 3px rgba(255,255,255,.08)";
  };

  /* ---------- UI update ---------- */
  const saveBalance = () => localStorage.setItem(LS_BAL, String(balance));
  const setBalanceUI = () => { if (el.bal) el.bal.textContent = `${fmt(balance)} ₽`; };

  const setStatus = (statusText, youText, botText, resText) => {
    if (el.stStatus) el.stStatus.textContent = statusText ?? "—";
    if (el.stYou) el.stYou.textContent = youText ?? "—";
    if (el.stBot) el.stBot.textContent = botText ?? "—";
    if (el.stRes) el.stRes.textContent = resText ?? "—";
  };

  const currentX = () => X_LADDER[clamp(wins, 0, X_LADDER.length - 1)];
  const potential = () => (inSeries ? seriesBet * currentX() : 0);

  const setMeta = () => {
    if (el.metaSeries) el.metaSeries.textContent = `${wins} побед`;
    if (el.metaX) el.metaX.textContent = `x${currentX().toFixed(2)}`;
    if (el.metaPotential) el.metaPotential.textContent = inSeries ? `${fmt(potential())} ₽` : "—";
    if (el.payoutValue) el.payoutValue.textContent = inSeries ? `${fmt(potential())} ₽` : "—";

    if (el.ladderHint) {
      el.ladderHint.textContent = inSeries
        ? `Серия идёт. Победа → X растёт. Проигрыш → серия в ноль.`
        : `Выбери ход и нажми “Играть”. После победы можно “Забрать”.`;
    }
  };

  const paintLadder = (mode = "none") => {
    // mode: none | win | lose
    if (!el.stepNodes?.length) return;
    el.stepNodes.forEach((n, i) => {
      n.classList.remove("active", "win", "lose");
      const isActive = i === clamp(wins, 0, X_LADDER.length - 1);
      if (isActive) n.classList.add("active");
      if (mode === "win" && isActive) n.classList.add("win");
      if (mode === "lose" && isActive) n.classList.add("lose");
    });
  };

  const setHands = (youKey, botKey, reveal = false) => {
    // reveal=false -> "?" у бота если нет хода
    if (!el.youIcon || !el.botIcon) return;

    if (youKey) el.youIcon.textContent = MOVE[youKey].emoji;
    else el.youIcon.textContent = "❔";

    if (reveal && botKey) el.botIcon.textContent = MOVE[botKey].emoji;
    else el.botIcon.textContent = "❔";

    if (el.youSub) el.youSub.textContent = youKey ? "Готов" : "Выбери ход";
    if (el.botSub) el.botSub.textContent = reveal && botKey ? "Готов" : "Думает…";
  };

  const setButtons = () => {
    const bet = getBet();
    if (el.playBtn) el.playBtn.disabled = locked || !lastYou || ( !inSeries && bet <= 0 );
    if (el.cashoutBtn) el.cashoutBtn.disabled = locked || !inSeries || wins <= 0; // cashout только если есть победа
  };

  const getBet = () => {
    const v = Number(String(el.betInput?.value ?? "0").replace(/[^\d.]/g, ""));
    if (!Number.isFinite(v)) return 0;
    return Math.floor(v);
  };
  const setBet = (v) => {
    v = clamp(Math.floor(v), 10, 1000000);
    if (el.betInput) el.betInput.value = String(v);
  };

  const selectMoveUI = (key) => {
    el.pickBtns?.forEach(btn => {
      const k = btn.getAttribute("data-move");
      btn.classList.toggle("selected", k === key);
    });
  };

  /* ---------- game logic ---------- */
  const botPick = () => MOVE_KEYS[Math.floor(Math.random() * MOVE_KEYS.length)];

  // returns "win" | "lose" | "draw"
  const judge = (you, bot) => {
    if (you === bot) return "draw";
    if (
      (you === "rock" && bot === "scissors") ||
      (you === "scissors" && bot === "paper") ||
      (you === "paper" && bot === "rock")
    ) return "win";
    return "lose";
  };

  const animateRound = async () => {
    if (!el.botCard || !el.youCard) return;

    // небольшая “перемешка” у обоих, чтобы выглядело живо
    const mix = () => {
      const r1 = MOVE_KEYS[(Math.random()*3)|0];
      const r2 = MOVE_KEYS[(Math.random()*3)|0];
      el.youIcon.textContent = MOVE[r1].emoji;
      el.botIcon.textContent = MOVE[r2].emoji;
    };

    el.youCard.classList.remove("pop", "shake");
    el.botCard.classList.remove("pop", "shake");

    // shake
    el.youCard.classList.add("shake");
    el.botCard.classList.add("shake");

    const t0 = performance.now();
    while (performance.now() - t0 < 380) {
      mix();
      await new Promise(r => setTimeout(r, 70));
    }

    el.youCard.classList.remove("shake");
    el.botCard.classList.remove("shake");

    // reveal with pop
    el.youCard.classList.add("pop");
    el.botCard.classList.add("pop");
    setHands(lastYou, lastBot, true);

    await new Promise(r => setTimeout(r, 160));
    el.youCard.classList.remove("pop");
    el.botCard.classList.remove("pop");
  };

  const startSeriesIfNeeded = () => {
    if (inSeries) return true;

    const bet = getBet();
    if (bet <= 0) return false;
    if (balance < bet) {
      setStatus("Недостаточно средств", MOVE[lastYou]?.name ?? "—", "—", "—");
      beep("lose");
      return false;
    }
    // списываем 1 раз при старте серии
    balance -= bet;
    saveBalance();
    setBalanceUI();

    inSeries = true;
    seriesBet = bet;
    wins = 0;

    return true;
  };

  const endSeries = (why = "reset") => {
    inSeries = false;
    seriesBet = 0;
    wins = 0;
    paintLadder("none");
    setMeta();
    if (why === "lose") paintLadder("lose");
  };

  const play = async () => {
    if (locked) return;
    if (!lastYou) return;

    locked = true;
    setButtons();

    beep("play");

    // старт серии (если надо)
    if (!startSeriesIfNeeded()) {
      locked = false;
      setButtons();
      return;
    }

    // бот выбирает
    lastBot = botPick();
    setStatus("Игра…", `${MOVE[lastYou].emoji} ${MOVE[lastYou].name}`, "Думает…", "—");
    setHands(lastYou, null, false);

    // анимация
    await animateRound();

    const result = judge(lastYou, lastBot);

    if (result === "draw") {
      setStatus("Ничья", `${MOVE[lastYou].emoji} ${MOVE[lastYou].name}`, `${MOVE[lastBot].emoji} ${MOVE[lastBot].name}`, "Ничья — серия продолжается");
      // wins не меняем
      paintLadder("none");
      setMeta();
      beep("click");
    }

    if (result === "win") {
      wins = clamp(wins + 1, 0, X_LADDER.length - 1);
      setStatus("Победа ✅", `${MOVE[lastYou].emoji} ${MOVE[lastYou].name}`, `${MOVE[lastBot].emoji} ${MOVE[lastBot].name}`, `Победа! Серия: ${wins}`);
      paintLadder("win");
      setMeta();
      beep("win");

      // если дошли до максимального шага — авто-cashout
      if (wins >= X_LADDER.length - 1) {
        await new Promise(r => setTimeout(r, 450));
        cashout(true);
      }
    }

    if (result === "lose") {
      setStatus("Поражение ❌", `${MOVE[lastYou].emoji} ${MOVE[lastYou].name}`, `${MOVE[lastBot].emoji} ${MOVE[lastBot].name}`, "Проигрыш — серия в ноль");
      paintLadder("lose");
      beep("lose");

      // серия обнуляется, ставка сгорает (по твоей логике)
      endSeries("lose");
      setMeta();
    }

    locked = false;
    setButtons();
  };

  const cashout = (auto = false) => {
    if (locked) return;
    if (!inSeries || wins <= 0) return;

    locked = true;
    setButtons();

    const winAmount = Math.floor(seriesBet * currentX());
    balance += winAmount;
    saveBalance();
    setBalanceUI();

    setStatus(auto ? "Авто-забор 🎉" : "Забрал 💰", `${MOVE[lastYou]?.emoji ?? "—"} ${MOVE[lastYou]?.name ?? "—"}`, `${MOVE[lastBot]?.emoji ?? "—"} ${MOVE[lastBot]?.name ?? "—"}`, `+${fmt(winAmount)} ₽ (x${currentX().toFixed(2)})`);
    beep("cash");

    // сбрасываем серию после кэшаута
    inSeries = false;
    seriesBet = 0;
    wins = 0;
    setMeta();
    paintLadder("none");

    // оставим выбранный ход, чтобы можно было продолжать быстро
    locked = false;
    setButtons();
  };

  /* ---------- events ---------- */
  const bind = () => {
    // звук
    if (el.soundBtn) {
      el.soundBtn.addEventListener("click", () => {
        soundOn = !soundOn;
        localStorage.setItem(LS_SOUND, soundOn ? "1" : "0");
        setSoundUI();
        beep("click");
      });
    }

    // chips
    el.chips?.forEach(ch => {
      ch.addEventListener("click", () => {
        beep("click");
        const add = Number(ch.getAttribute("data-add") || "0");
        if (add > 0) setBet(getBet() + add);
        setButtons();
      });
    });

    // bet +/- 
    if (el.betMinus) el.betMinus.addEventListener("click", () => { beep("click"); setBet(getBet() - 10); setButtons(); });
    if (el.betPlus) el.betPlus.addEventListener("click", () => { beep("click"); setBet(getBet() + 10); setButtons(); });
    if (el.betInput) el.betInput.addEventListener("input", () => setButtons());

    // picks
    el.pickBtns?.forEach(btn => {
      btn.addEventListener("click", () => {
        if (locked) return;
        beep("click");
        const k = btn.getAttribute("data-move");
        if (!MOVE[k]) return;
        lastYou = k;
        selectMoveUI(k);
        setHands(lastYou, lastBot, false);
        setStatus(inSeries ? "Серия идёт" : "Ожидание", `${MOVE[lastYou].emoji} ${MOVE[lastYou].name}`, "—", "—");
        setButtons();
      });
    });

    // play
    if (el.playBtn) el.playBtn.addEventListener("click", play);

    // cashout
    if (el.cashoutBtn) el.cashoutBtn.addEventListener("click", () => cashout(false));

    // UX: пробел = играть
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (!el.playBtn?.disabled) play();
      }
    });
  };

  /* ---------- init ---------- */
  const init = () => {
    // начальные значения ставки
    if (el.betInput && !el.betInput.value) el.betInput.value = "100";

    setBalanceUI();
    setSoundUI();

    // дефолт
    setHands(null, null, false);
    setStatus("Ожидание", "—", "—", "—");
    setMeta();
    paintLadder("none");
    setButtons();

    bind();
  };

  init();
})();
