(() => {
  // ====== DOM ======
  const el = (id) => document.getElementById(id);

  const balanceEl = el("balance");
  const statusEl  = el("status");
  const youPickEl = el("youPick");
  const botPickEl = el("botPick");
  const resultEl  = el("result");

  const ladderEl  = el("ladder");
  const streakEl  = el("streak");
  const currentXEl= el("currentX");
  const potentialEl = el("potential");

  const youHandEl = el("youHand");
  const botHandEl = el("botHand");
  const youCardEl = el("youCard");
  const botCardEl = el("botCard");
  const youReadyEl= el("youReady");

  const betInput  = el("bet");
  const playBtn   = el("play");
  const resetBtn  = el("reset");
  const cashoutBtn= el("cashout");
  const winViewEl = el("winView");

  const minusBtn  = el("minus");
  const plusBtn   = el("plus");
  const add1000Btn= el("add1000");
  const soundBtn  = el("soundBtn");
  const soundText = el("soundText");

  // ====== CONFIG ======
  // Лестница X: как Stake-логика (пример)
  const LADDER = [1.00, 1.20, 1.50, 2.00, 3.00, 5.00, 10.00];
  const MOVE_NAMES = {
    rock: "Камень",
    scissors: "Ножницы",
    paper: "Бумага",
  };
  const MOVES = ["rock", "scissors", "paper"];

  // ====== SIMPLE AUDIO (мягкий) ======
  let soundOn = true;
  let audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function blip(freq = 440, dur = 0.08, vol = 0.05, type = "sine") {
    if (!soundOn) return;
    try {
      ensureAudio();
      const t0 = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0);
      o.stop(t0 + dur);
    } catch {}
  }

  const sfx = {
    tap() { blip(520, 0.05, 0.035, "triangle"); },
    start() { blip(380, 0.08, 0.04, "sine"); setTimeout(()=>blip(520,0.08,0.04,"sine"), 90); },
    win() { blip(660, 0.10, 0.05, "triangle"); setTimeout(()=>blip(880,0.09,0.045,"triangle"), 110); },
    lose() { blip(220, 0.12, 0.05, "sine"); setTimeout(()=>blip(170,0.12,0.045,"sine"), 120); },
    draw() { blip(440, 0.07, 0.04, "sine"); },
    cash() { blip(740, 0.08, 0.05, "triangle"); setTimeout(()=>blip(990,0.10,0.05,"triangle"), 100); },
  };

  // ====== SVG HANDS (телесные, ровные) ======
  // Делаем аккуратный 2D-стиль: светлый skin + лёгкая тень + контур.
  const SKIN = "#F2C9A0";
  const SKIN2 = "#EAB98D";
  const OUT = "rgba(0,0,0,.25)";
  const SHADOW = "rgba(0,0,0,.18)";

  function svgWrap(pathD, extra = "") {
    return `
      <svg viewBox="0 0 128 128" width="96" height="96" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="${SKIN}"/>
            <stop offset="1" stop-color="${SKIN2}"/>
          </linearGradient>
          <filter id="ds" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="${SHADOW}"/>
          </filter>
        </defs>
        <g filter="url(#ds)">
          <path d="${pathD}" fill="url(#g)" stroke="${OUT}" stroke-width="2.5" stroke-linejoin="round"/>
          ${extra}
        </g>
      </svg>
    `;
  }

  // Кулак (камень)
  const SVG_ROCK = svgWrap(
    "M44 60c-6 0-10 5-10 12v16c0 10 8 18 18 18h28c10 0 18-8 18-18V74c0-7-4-12-10-12h-6c-2 0-4 1-5 2-1-2-3-4-6-4h-6c-2 0-4 1-5 2-1-2-3-4-6-4h-7z" +
    " M44 60h7c3 0 6 3 6 7v6H44v-13z" // чуть объёма
  );

  // Ножницы (V пальцы)
  const SVG_SCISSORS = svgWrap(
    "M45 92c-7 0-13-6-13-13 0-6 4-11 10-13l8-3V42c0-6 5-11 11-11 6 0 11 5 11 11v22l8-12c3-5 10-6 15-3 5 3 6 10 3 15L79 90c-2 4-6 6-10 6H45z" ,
    `<path d="M62 32c6 0 11 5 11 11v25" fill="none" stroke="rgba(255,255,255,.20)" stroke-width="4" stroke-linecap="round"/>`
  );

  // Ладонь (бумага)
  const SVG_PAPER = svgWrap(
    "M44 104c-8 0-14-6-14-14V64c0-6 4-11 10-13V39c0-6 5-11 11-11 6 0 11 5 11 11v10h4V35c0-6 5-11 11-11 6 0 11 5 11 11v18h4V41c0-6 5-11 11-11 6 0 11 5 11 11v34c0 16-13 29-29 29H44z",
    `<path d="M45 52v20M66 49v22M86 52v20" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="4" stroke-linecap="round"/>`
  );

  function svgForMove(move) {
    if (move === "rock") return SVG_ROCK;
    if (move === "scissors") return SVG_SCISSORS;
    return SVG_PAPER;
  }

  function setHand(elWrap, moveOrNull) {
    elWrap.innerHTML = moveOrNull ? svgForMove(moveOrNull) : `<div class="qmark">?</div>`;
    // анимация входа
    elWrap.classList.remove("flipIn");
    void elWrap.offsetWidth;
    elWrap.classList.add("flipIn");
  }

  // ====== STATE ======
  let balance = Number(localStorage.getItem("rps_balance") || 1000);

  // Серия: ставка списывается один раз при старте серии.
  let seriesActive = false;
  let seriesBet = 0;
  let step = 0;            // индекс в LADDER (0 = x1.00, 1 = x1.20 ...)
  let winsInRow = 0;       // побед подряд
  let selectedMove = null; // выбор игрока
  let busy = false;        // идёт анимация

  function saveBalance() {
    localStorage.setItem("rps_balance", String(balance));
  }

  // ====== UI HELPERS ======
  function fmt(n) { return Math.round(n); }

  function setStatus(text) {
    statusEl.textContent = text;
    statusEl.classList.remove("pop");
    void statusEl.offsetWidth;
    statusEl.classList.add("pop");
  }

  function setResult(text, cls = "") {
    resultEl.textContent = text;
    resultEl.className = "big " + cls;
    resultEl.classList.remove("pop");
    void resultEl.offsetWidth;
    resultEl.classList.add("pop");
  }

  function updateTop() {
    balanceEl.textContent = fmt(balance);
  }

  function updateLadder() {
    ladderEl.innerHTML = "";
    LADDER.forEach((x, i) => {
      const d = document.createElement("div");
      d.className = "step" + (i === step ? " active" : "");
      d.innerHTML = `<div class="sTop">${i === 0 ? "Старт" : `Шаг ${i}`}</div><div class="sX">x${x.toFixed(2)}</div>`;
      ladderEl.appendChild(d);
    });
  }

  function currentX() {
    return LADDER[step] ?? 1.00;
  }

  function potentialPayout() {
    if (!seriesActive) return 0;
    return seriesBet * currentX();
  }

  function updateArenaNumbers() {
    streakEl.textContent = String(winsInRow);
    currentXEl.textContent = `x${currentX().toFixed(2)}`;
    potentialEl.textContent = String(fmt(potentialPayout()));
    winViewEl.textContent = seriesActive ? `${fmt(potentialPayout())} ₽` : "—";
    cashoutBtn.disabled = !(seriesActive && step > 0 && !busy);
  }

  function resetHandsToUnknown() {
    setHand(youHandEl, null);
    setHand(botHandEl, null);
  }

  function renderChoiceActive() {
    document.querySelectorAll(".choice").forEach(b => b.classList.toggle("active", b.dataset.move === selectedMove));
    youPickEl.textContent = selectedMove ? `✋ ${MOVE_NAMES[selectedMove]}` : "—";
    youReadyEl.textContent = selectedMove ? "Готов" : "Выбери ход";
  }

  function clampBet(v) {
    v = Number(String(v).replace(/[^\d]/g, "")) || 0;
    if (v < 0) v = 0;
    if (v > 999999) v = 999999;
    return v;
  }

  function setBetValue(v) {
    betInput.value = String(clampBet(v));
  }

  // ====== GAME RULES ======
  function compare(you, bot) {
    if (you === bot) return "draw";
    if (
      (you === "rock" && bot === "scissors") ||
      (you === "scissors" && bot === "paper") ||
      (you === "paper" && bot === "rock")
    ) return "win";
    return "lose";
  }

  function botRandomMove() {
    return MOVES[(Math.random() * MOVES.length) | 0];
  }

  // ====== FLOW ======
  function startSeriesIfNeeded() {
    if (seriesActive) return true;

    const bet = clampBet(betInput.value);
    if (bet <= 0) { setStatus("Укажи ставку"); return false; }
    if (bet > balance) { setStatus("Не хватает баланса"); return false; }

    seriesActive = true;
    seriesBet = bet;
    step = 0;
    winsInRow = 0;

    balance -= bet;
    saveBalance();
    updateTop();

    setStatus("Серия началась");
    setResult("—");
    return true;
  }

  function endSeriesLose() {
    seriesActive = false;
    seriesBet = 0;
    step = 0;
    winsInRow = 0;
    updateLadder();
    updateArenaNumbers();
  }

  function cashout() {
    if (!(seriesActive && step > 0) || busy) return;

    const payout = potentialPayout();
    balance += payout;
    saveBalance();
    updateTop();

    sfx.cash();
    setStatus("Cashout ✅");
    setResult(`Забрал: +${fmt(payout)} ₽`, "good");

    seriesActive = false;
    seriesBet = 0;
    step = 0;
    winsInRow = 0;

    updateLadder();
    updateArenaNumbers();
    resetHandsToUnknown();
    youPickEl.textContent = "—";
    botPickEl.textContent = "—";
    selectedMove = null;
    renderChoiceActive();
  }

  async function playRound() {
    if (busy) return;
    if (!selectedMove) { setStatus("Выбери ход"); youCardEl.classList.add("shake"); setTimeout(()=>youCardEl.classList.remove("shake"), 260); return; }

    // Авто-старт серии при первом "Играть"
    if (!startSeriesIfNeeded()) return;

    busy = true;
    cashoutBtn.disabled = true;

    sfx.start();
    setStatus("Идёт раунд...");
    setResult("—");

    // анимация "перемешивания"
    resetHandsToUnknown();
    botPickEl.textContent = "—";

    // небольшая драматургия
    await sleep(180);
    youCardEl.classList.add("shake");
    botCardEl.classList.add("shake");
    await sleep(260);
    youCardEl.classList.remove("shake");
    botCardEl.classList.remove("shake");

    // показываем выборы
    const botMove = botRandomMove();
    setHand(youHandEl, selectedMove);
    setHand(botHandEl, botMove);
    botPickEl.textContent = `🤖 ${MOVE_NAMES[botMove]}`;

    const outcome = compare(selectedMove, botMove);

    await sleep(240);

    if (outcome === "win") {
      winsInRow += 1;
      step = Math.min(step + 1, LADDER.length - 1);

      sfx.win();
      setStatus("Победа!");
      setResult("Победа ✅", "good");

      // если дошли до максимума — авто-cashout
      if (step === LADDER.length - 1) {
        await sleep(250);
        cashout(); // вернёт и сбросит серию
        busy = false;
        return;
      }
    }

    if (outcome === "lose") {
      sfx.lose();
      setStatus("Проигрыш");
      setResult("Поражение ✖", "bad");

      // серия сгорает (ставка уже списана при старте)
      endSeriesLose();
      // сброс потенциала/лестницы
    }

    if (outcome === "draw") {
      sfx.draw();
      setStatus("Ничья");
      setResult("Ничья •", "");
      // серия не меняется
    }

    updateLadder();
    updateArenaNumbers();

    busy = false;
    cashoutBtn.disabled = !(seriesActive && step > 0);
  }

  function resetAll() {
    if (busy) return;

    // если серия активна — вернём ставку? (по твоей логике можно не возвращать)
    // Но чтобы не бесило — вернём, если серия не началась (step==0).
    if (seriesActive) {
      // если ещё не было побед — вернём ставку назад
      if (step === 0) {
        balance += seriesBet;
        saveBalance();
        updateTop();
      }
    }

    seriesActive = false;
    seriesBet = 0;
    step = 0;
    winsInRow = 0;
    selectedMove = null;

    setStatus("Ожидание");
    setResult("—");
    youPickEl.textContent = "—";
    botPickEl.textContent = "—";
    resetHandsToUnknown();

    renderChoiceActive();
    updateLadder();
    updateArenaNumbers();
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ====== EVENTS ======
  document.querySelectorAll(".choice").forEach(btn => {
    btn.addEventListener("click", () => {
      if (busy) return;
      selectedMove = btn.dataset.move;
      sfx.tap();
      renderChoiceActive();
    });
  });

  playBtn.addEventListener("click", playRound);
  resetBtn.addEventListener("click", resetAll);
  cashoutBtn.addEventListener("click", cashout);

  // bet controls
  minusBtn.addEventListener("click", () => { setBetValue(clampBet(betInput.value) - 10); sfx.tap(); });
  plusBtn.addEventListener("click", () => { setBetValue(clampBet(betInput.value) + 10); sfx.tap(); });
  add1000Btn.addEventListener("click", () => { setBetValue(clampBet(betInput.value) + 1000); sfx.tap(); });

  document.querySelectorAll(".q").forEach(b => {
    b.addEventListener("click", () => {
      const v = b.dataset.add;
      if (v === "max") {
        setBetValue(balance);
      } else {
        setBetValue(clampBet(betInput.value) + Number(v));
      }
      sfx.tap();
    });
  });

  betInput.addEventListener("input", () => setBetValue(betInput.value));

  soundBtn.addEventListener("click", async () => {
    soundOn = !soundOn;
    soundText.textContent = `Звук: ${soundOn ? "on" : "off"}`;
    soundBtn.querySelector(".dot").style.background = soundOn ? "var(--green)" : "rgba(255,255,255,.35)";
    if (soundOn) {
      // на некоторых браузерах нужен user gesture — уже есть
      try { ensureAudio(); await audioCtx.resume(); } catch {}
      sfx.tap();
    }
  });

  // ====== INIT ======
  function init() {
    updateTop();
    updateLadder();
    resetHandsToUnknown();
    renderChoiceActive();
    updateArenaNumbers();

    soundText.textContent = `Звук: ${soundOn ? "on" : "off"}`;
    setStatus("Ожидание");
    setResult("—");
  }

  init();
})();
