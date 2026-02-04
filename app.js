/* RPS v2 — Ladder X + SVG hands + smoother anim
   Требования:
   - GitHub Pages (без билдов)
   - localStorage баланс
   - Лестница X (подсветка шага)
   - Серия до 3 побед (best-of-5, кто первый до 3)
   - Визуально: белые “руки” в стиле Stake (SVG), без «детских» картинок
   - Звук уже есть в интерфейсе (если у тебя кнопка есть). Здесь оставил аккуратные тихие бипы.
*/

(() => {
  // ===== helpers =====
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const now = () => performance.now();

  // ===== DOM (ОЖИДАЕТСЯ что id совпадают с твоим index) =====
  const el = {
    balance: $("balanceValue"),
    status: $("status"),
    yourPick: $("yourPick"),
    botPick: $("botPick"),
    result: $("result"),

    // ladder container (внутри .ladder элементы .step)
    ladder: $("ladder"),

    // hands
    botHand: $("botHand"),
    youHand: $("youHand"),

    // choice buttons
    btnRock: $("pickRock"),
    btnPaper: $("pickPaper"),
    btnScissors: $("pickScissors"),

    // bet UI
    betInput: $("betInput"),
    btnPlay: $("btnPlay"),
    btnReset: $("btnReset"),

    // quick bet buttons (optional)
    q10: $("q10"),
    q50: $("q50"),
    q100: $("q100"),
    q250: $("q250"),
    q500: $("q500"),
    qMax: $("qMax"),
    btnMinus: $("btnMinus"),
    btnPlus: $("btnPlus"),

    // win panel
    winLine: $("winLine"),
    soundToggle: $("soundToggle")
  };

  // ===== config =====
  // Ladder X (как “лесенка”)
  // Старт x1.00; Победа 1 -> x1.20; 2 -> x1.50; 3 -> x2.00; 4 -> x3.00; 5 -> x5.00; 6 -> x10.00
  // Для best-of-5 (до 3 побед) хватит первых 4-5 шагов, но оставим красиво до x10.00.
  const LADDER = [1.00, 1.20, 1.50, 2.00, 3.00, 5.00, 10.00];

  const STORAGE_BAL = "rps_balance_v1";
  const STORAGE_SOUND = "rps_sound_v1";
  const DEFAULT_BAL = 1000;

  // серия: до 3 побед
  const SERIES_TARGET = 3;

  // ===== state =====
  let state = {
    balance: loadBalance(),
    soundOn: loadSound(),

    bet: 100,
    selected: null, // "rock" | "paper" | "scissors"

    inRound: false,
    // серия
    winsYou: 0,
    winsBot: 0,
    stepIndex: 0,   // индекс в LADDER (0=1.00)
    // текущий profit (условный, для отображения)
    lastDelta: 0
  };

  // ===== init =====
  function init() {
    // safety if some ids absent
    if (!el.balance || !el.btnPlay) {
      console.warn("RPS: some DOM ids are missing. Check index.html ids.");
      return;
    }

    setBalance(state.balance);
    setSoundUI(state.soundOn);
    setBetUI(state.bet);
    renderStatus("Ожидание");
    renderPicks(null, null);
    renderResult(null);
    renderWinLine(0);
    buildLadder();
    highlightLadder(0);

    // default hands: question
    setHand(el.botHand, "question");
    setHand(el.youHand, "question");

    // listeners
    el.btnRock?.addEventListener("click", () => choose("rock"));
    el.btnPaper?.addEventListener("click", () => choose("paper"));
    el.btnScissors?.addEventListener("click", () => choose("scissors"));

    el.btnPlay.addEventListener("click", onPlay);
    el.btnReset?.addEventListener("click", onResetSeries);

    // bet controls (optional)
    el.q10?.addEventListener("click", () => setBet(state.bet + 10));
    el.q50?.addEventListener("click", () => setBet(state.bet + 50));
    el.q100?.addEventListener("click", () => setBet(state.bet + 100));
    el.q250?.addEventListener("click", () => setBet(state.bet + 250));
    el.q500?.addEventListener("click", () => setBet(state.bet + 500));
    el.qMax?.addEventListener("click", () => setBet(state.balance));
    el.btnMinus?.addEventListener("click", () => setBet(state.bet - 10));
    el.btnPlus?.addEventListener("click", () => setBet(state.bet + 10));

    el.betInput?.addEventListener("input", () => {
      const v = parseInt(el.betInput.value || "0", 10);
      if (Number.isFinite(v)) setBet(v, { silent: true });
    });

    el.soundToggle?.addEventListener("click", () => {
      state.soundOn = !state.soundOn;
      saveSound(state.soundOn);
      setSoundUI(state.soundOn);
      beep("tick");
    });

    // initial disable play until pick
    syncButtons();
  }

  // ===== ladder render =====
  function buildLadder() {
    if (!el.ladder) return;

    el.ladder.innerHTML = "";
    LADDER.forEach((x, i) => {
      const d = document.createElement("div");
      d.className = "step";
      d.dataset.i = String(i);
      const label = i === 0 ? `Старт\nx${x.toFixed(2)}` : `Шаг ${i}\nx${x.toFixed(2)}`;
      d.textContent = label.replace("\n", " ");
      el.ladder.appendChild(d);
    });
  }

  function highlightLadder(idx) {
    if (!el.ladder) return;
    const steps = [...el.ladder.querySelectorAll(".step")];
    steps.forEach((s, i) => s.classList.toggle("active", i === idx));
  }

  // ===== UI helpers =====
  function setBalance(v) {
    state.balance = Math.max(0, Math.floor(v));
    saveBalance(state.balance);
    if (el.balance) el.balance.textContent = String(state.balance);
    syncButtons();
  }

  function setBet(v, opts = {}) {
    const vv = clamp(Math.floor(v || 0), 1, Math.max(1, state.balance));
    state.bet = vv;
    if (el.betInput && !opts.silent) el.betInput.value = String(vv);
    if (el.betInput && opts.silent) {
      // keep input as typed but clamp in state
      el.betInput.value = String(vv);
    }
    syncButtons();
  }

  function setBetUI(v) {
    if (el.betInput) el.betInput.value = String(v);
  }

  function renderStatus(txt) {
    if (el.status) el.status.textContent = txt;
  }

  function renderPicks(your, bot) {
    if (el.yourPick) el.yourPick.textContent = your ? labelOf(your) : "—";
    if (el.botPick) el.botPick.textContent = bot ? labelOf(bot) : "—";
  }

  function renderResult(kind) {
    if (!el.result) return;
    el.result.classList.remove("win", "lose", "draw");
    if (!kind) {
      el.result.textContent = "—";
      return;
    }
    if (kind === "win") {
      el.result.textContent = "Победа ✓";
      el.result.classList.add("win");
    } else if (kind === "lose") {
      el.result.textContent = "Поражение ✕";
      el.result.classList.add("lose");
    } else {
      el.result.textContent = "Ничья";
      el.result.classList.add("draw");
    }
  }

  function renderWinLine(delta) {
    if (!el.winLine) return;
    if (!delta) {
      el.winLine.textContent = "Выигрыш: —";
      return;
    }
    const sign = delta > 0 ? "+" : "";
    el.winLine.textContent = `Выигрыш: ${sign}${delta} Ⓒ`;
  }

  function syncButtons() {
    const canPlay = !state.inRound && !!state.selected && state.bet > 0 && state.bet <= state.balance;
    if (el.btnPlay) el.btnPlay.disabled = !canPlay;
    // reset always available
  }

  function choose(pick) {
    if (state.inRound) return;
    state.selected = pick;

    // active button styles
    el.btnRock?.classList.toggle("active", pick === "rock");
    el.btnPaper?.classList.toggle("active", pick === "paper");
    el.btnScissors?.classList.toggle("active", pick === "scissors");

    // show your chosen hand right away
    setHand(el.youHand, pick);
    setHand(el.botHand, "question");

    renderPicks(pick, null);
    renderResult(null);
    renderStatus(seriesText("Готово"));
    beep("tick");

    syncButtons();
  }

  function seriesText(prefix) {
    return `${prefix} · Серия: ${state.winsYou}-${state.winsBot} (до ${SERIES_TARGET} побед)`;
  }

  // ===== game flow =====
  async function onPlay() {
    if (state.inRound) return;
    if (!state.selected) return;

    // validate bet
    if (state.bet <= 0 || state.bet > state.balance) {
      renderStatus("Недостаточно баланса");
      beep("bad");
      return;
    }

    state.inRound = true;
    syncButtons();

    // take stake (заморозка ставки на раунд)
    // Логика как в stake-ish: если победа — прибыль = ставка*(x-1); если проигрыш — -ставка; ничья — 0
    setBalance(state.balance - state.bet);

    renderStatus("Идёт раунд...");
    renderResult(null);
    renderWinLine(0);

    // bot “thinking” animation
    await animateReveal();

    const bot = randomPick();
    const you = state.selected;
    renderPicks(you, bot);

    // reveal bot hand
    setHand(el.botHand, bot);

    const outcome = judge(you, bot);

    // handle ladder + payouts
    let delta = 0;

    if (outcome === "draw") {
      // return stake
      delta = 0;
      setBalance(state.balance + state.bet);
      renderStatus(seriesText("Ничья"));
      renderResult("draw");
      beep("tick");
    } else if (outcome === "win") {
      state.winsYou += 1;

      // step goes forward (cap)
      state.stepIndex = clamp(state.stepIndex + 1, 0, LADDER.length - 1);

      const x = LADDER[state.stepIndex];
      // payout includes returning stake + profit at x:
      // total return = bet * x
      // since bet already deducted, we add bet*x
      const totalReturn = Math.floor(state.bet * x);
      const profit = totalReturn - state.bet; // чистая прибыль
      setBalance(state.balance + totalReturn);
      delta = profit;

      renderStatus(seriesText(`Победа! x${x.toFixed(2)}`));
      renderResult("win");
      beep("good");
      flash("win");
    } else {
      // lose
      state.winsBot += 1;

      // reset step to start (как “лесенка” ломается)
      state.stepIndex = 0;
      delta = -state.bet;

      renderStatus(seriesText("Поражение"));
      renderResult("lose");
      beep("bad");
      flash("lose");
    }

    highlightLadder(state.stepIndex);
    renderWinLine(delta);

    // series end check
    if (state.winsYou >= SERIES_TARGET || state.winsBot >= SERIES_TARGET) {
      const youWon = state.winsYou > state.winsBot;
      renderStatus(youWon ? "Серия выиграна ✓ Нажми «Сброс» чтобы начать заново" : "Серия проиграна ✕ Нажми «Сброс» чтобы начать заново");
      // lock until reset
      state.inRound = false;
      state.selected = null;
      syncChoiceButtonsOff();
      syncButtons();
      return;
    }

    // unlock next round
    state.inRound = false;
    // keep selected (удобно — можно играть серией одной кнопкой)
    syncButtons();
  }

  function onResetSeries() {
    if (state.inRound) return;

    state.winsYou = 0;
    state.winsBot = 0;
    state.stepIndex = 0;
    state.selected = null;

    highlightLadder(0);
    renderStatus("Ожидание");
    renderPicks(null, null);
    renderResult(null);
    renderWinLine(0);

    setHand(el.botHand, "question");
    setHand(el.youHand, "question");

    syncChoiceButtonsOff();
    syncButtons();
    beep("tick");
  }

  function syncChoiceButtonsOff() {
    el.btnRock?.classList.remove("active");
    el.btnPaper?.classList.remove("active");
    el.btnScissors?.classList.remove("active");
  }

  // ===== animation =====
  async function animateReveal() {
    // smoother “shuffle” animation: flip both hands 3 times
    const rounds = 3;
    for (let i = 0; i < rounds; i++) {
      addAnim(el.youHand, "flip");
      addAnim(el.botHand, "flip");
      beep("tick", 0.012);
      await sleep(140);
      setHand(el.botHand, randomPick()); // fast random while flipping
      await sleep(120);
    }
    // final shake for punch
    addAnim(el.youHand, "shake");
    addAnim(el.botHand, "shake");
    await sleep(120);
  }

  function addAnim(node, cls) {
    if (!node) return;
    node.classList.remove(cls);
    // force reflow
    void node.offsetWidth;
    node.classList.add(cls);
  }

  function flash(kind) {
    const arena = document.querySelector(".arena");
    if (!arena) return;
    arena.classList.remove("flash-win", "flash-lose");
    void arena.offsetWidth;
    arena.classList.add(kind === "win" ? "flash-win" : "flash-lose");
    setTimeout(() => arena.classList.remove("flash-win", "flash-lose"), 320);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ===== logic =====
  function randomPick() {
    const a = ["rock", "paper", "scissors"];
    return a[(Math.random() * a.length) | 0];
  }

  function judge(you, bot) {
    if (you === bot) return "draw";
    if (
      (you === "rock" && bot === "scissors") ||
      (you === "scissors" && bot === "paper") ||
      (you === "paper" && bot === "rock")
    ) return "win";
    return "lose";
  }

  function labelOf(pick) {
    if (pick === "rock") return "Камень";
    if (pick === "paper") return "Бумага";
    if (pick === "scissors") return "Ножницы";
    return "—";
  }

  // ===== SVG hands (white, stake-like) =====
  // Делал максимально “чисто”, без детских эмодзи: белые формы + мягкая тень.
  // Если хочешь — потом дорисуем более “3д”.
  function setHand(node, pick) {
    if (!node) return;

    const wrap = (svg) => `
      <div class="svg-hand" style="width:72px;height:72px;display:grid;place-items:center;">
        ${svg}
      </div>
    `;

    if (pick === "question") {
      node.innerHTML = `<div style="font-weight:900;font-size:44px;opacity:.85;">?</div>`;
      return;
    }

    if (pick === "rock") {
      node.innerHTML = wrap(svgRock());
    } else if (pick === "paper") {
      node.innerHTML = wrap(svgPaper());
    } else if (pick === "scissors") {
      node.innerHTML = wrap(svgScissors());
    }
  }

  function svgCommon() {
    // Common filters defs
    return `
      <defs>
        <filter id="softShadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="rgba(0,0,0,.45)"/>
        </filter>
        <linearGradient id="handGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="rgba(255,255,255,.95)"/>
          <stop offset="1" stop-color="rgba(255,255,255,.75)"/>
        </linearGradient>
        <linearGradient id="edgeGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="rgba(255,255,255,.30)"/>
          <stop offset="1" stop-color="rgba(255,255,255,.05)"/>
        </linearGradient>
      </defs>
    `;
  }

  function svgRock() {
    return `
    <svg width="70" height="70" viewBox="0 0 70 70" xmlns="http://www.w3.org/2000/svg">
      ${svgCommon()}
      <g filter="url(#softShadow)">
        <path d="M22 28c2-7 7-10 13-10 8 0 13 4 15 11 2 6 2 12 0 18-2 6-8 11-15 11-8 0-15-4-16-11-1-6 0-13 3-19z"
              fill="url(#handGrad)" stroke="url(#edgeGrad)" stroke-width="2" stroke-linejoin="round"/>
        <path d="M27 31c1-3 4-5 7-5" stroke="rgba(0,0,0,.10)" stroke-width="2" stroke-linecap="round"/>
        <path d="M40 31c2-2 4-3 7-2" stroke="rgba(0,0,0,.10)" stroke-width="2" stroke-linecap="round"/>
      </g>
    </svg>`;
  }

  function svgPaper() {
    return `
    <svg width="70" height="70" viewBox="0 0 70 70" xmlns="http://www.w3.org/2000/svg">
      ${svgCommon()}
      <g filter="url(#softShadow)">
        <path d="M20 18c6-4 24-4 30 0 2 1 3 3 3 6v23c0 4-3 7-7 7H24c-4 0-7-3-7-7V24c0-3 1-5 3-6z"
              fill="url(#handGrad)" stroke="url(#edgeGrad)" stroke-width="2" stroke-linejoin="round"/>
        <path d="M26 26h18" stroke="rgba(0,0,0,.10)" stroke-width="2" stroke-linecap="round"/>
        <path d="M26 34h18" stroke="rgba(0,0,0,.08)" stroke-width="2" stroke-linecap="round"/>
        <path d="M26 42h14" stroke="rgba(0,0,0,.06)" stroke-width="2" stroke-linecap="round"/>
      </g>
    </svg>`;
  }

  function svgScissors() {
    return `
    <svg width="70" height="70" viewBox="0 0 70 70" xmlns="http://www.w3.org/2000/svg">
      ${svgCommon()}
      <g filter="url(#softShadow)">
        <path d="M22 44c0-6 5-11 11-11h4c6 0 11 5 11 11v1c0 6-5 11-11 11h-4c-6 0-11-5-11-11v-1z"
              fill="url(#handGrad)" stroke="url(#edgeGrad)" stroke-width="2" stroke-linejoin="round"/>
        <path d="M34 33l-10-16" stroke="rgba(255,255,255,.85)" stroke-width="5" stroke-linecap="round"/>
        <path d="M38 33l10-16" stroke="rgba(255,255,255,.85)" stroke-width="5" stroke-linecap="round"/>
        <path d="M34 33l-10-16" stroke="rgba(0,0,0,.10)" stroke-width="2" stroke-linecap="round"/>
        <path d="M38 33l10-16" stroke="rgba(0,0,0,.10)" stroke-width="2" stroke-linecap="round"/>
        <circle cx="32" cy="48" r="3.6" fill="rgba(0,0,0,.10)"/>
        <circle cx="38" cy="48" r="3.6" fill="rgba(0,0,0,.10)"/>
      </g>
    </svg>`;
  }

  // ===== sound (simple, тихий) =====
  let audioCtx = null;
  function beep(type, volOverride) {
    if (!state.soundOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g);
      g.connect(audioCtx.destination);

      let freq = 600, dur = 0.06, vol = 0.018;
      if (type === "good") { freq = 820; dur = 0.08; vol = 0.02; }
      if (type === "bad") { freq = 220; dur = 0.10; vol = 0.02; }
      if (type === "tick") { freq = 520; dur = 0.04; vol = 0.012; }

      if (typeof volOverride === "number") vol = volOverride;

      o.type = "sine";
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch {}
  }

  function setSoundUI(on) {
    if (!el.soundToggle) return;
    el.soundToggle.textContent = on ? "Звук: on" : "Звук: off";
    el.soundToggle.classList.toggle("off", !on);
  }

  // ===== storage =====
  function loadBalance() {
    const v = parseInt(localStorage.getItem(STORAGE_BAL) || "", 10);
    return Number.isFinite(v) ? v : DEFAULT_BAL;
  }
  function saveBalance(v) {
    localStorage.setItem(STORAGE_BAL, String(v));
  }

  function loadSound() {
    const v = localStorage.getItem(STORAGE_SOUND);
    if (v === null) return true;
    return v === "1";
  }
  function saveSound(on) {
    localStorage.setItem(STORAGE_SOUND, on ? "1" : "0");
  }

  // ===== small arena flash styles via JS (чтобы не трогать css лишний раз) =====
  // Добавим на лету нужные эффекты, если их нет.
  function injectFlashCSS() {
    const id = "rps_flash_css";
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `
      .arena.flash-win{ box-shadow: 0 0 0 1px rgba(44,230,168,.22) inset, 0 22px 70px rgba(44,230,168,.10); }
      .arena.flash-lose{ box-shadow: 0 0 0 1px rgba(255,77,109,.22) inset, 0 22px 70px rgba(255,77,109,.10); }
    `;
    document.head.appendChild(s);
  }

  // ===== start =====
  injectFlashCSS();
  init();
})();
