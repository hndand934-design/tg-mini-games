(() => {
  "use strict";

  // Telegram MiniApp safety
  const tg = window.Telegram?.WebApp;
  try { tg?.ready?.(); tg?.expand?.(); } catch {}

  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (n) => Math.round(n).toString();

  // ===== DOM =====
  const balanceEl = $("balance");

  const hudStatus = $("hudStatus");
  const hudYou = $("hudYou");
  const hudBot = $("hudBot");
  const hudResult = $("hudResult");

  const ladderMeta = $("ladderMeta");
  const ladderRow = $("ladderRow");

  const arena = $("arena");
  const note = $("note");

  const botCard = $("botCard");
  const youCard = $("youCard");
  const botFace = $("botFace");
  const youFace = $("youFace");
  const botHint = $("botHint");
  const youHint = $("youHint");

  const pickRock = $("pickRock");
  const pickScissors = $("pickScissors");
  const pickPaper = $("pickPaper");

  const pickIconRock = $("pickIconRock");
  const pickIconScissors = $("pickIconScissors");
  const pickIconPaper = $("pickIconPaper");

  const add1000 = $("add1000");
  const betInput = $("betInput");
  const betMinus = $("betMinus");
  const betPlus = $("betPlus");
  const chips = Array.from(document.querySelectorAll(".chip[data-bet]"));

  const btnPlay = $("btnPlay");
  const btnReset = $("btnReset");
  const btnSound = $("btnSound");

  const winText = $("winText");

  // ===== Storage =====
  const LS_BAL = "rps_balance_v1";
  const LS_SOUND = "rps_sound_v1";

  // ===== Game config =====
  // Это "шкала X как сверху" — ряд коэффициентов.
  // Можно подстроить под вкус:
  const LADDER = [1.00, 1.20, 1.50, 2.00, 3.00, 5.00, 10.00];
  // серия до N побед (как ты просил)
  const SERIES_TO_WIN = 3;

  // ===== State =====
  let balance = loadNumber(LS_BAL, 1000);
  let soundOn = loadBool(LS_SOUND, false);

  let selected = null; // "rock" | "paper" | "scissors"
  let busy = false;

  // серия
  let seriesWins = 0;  // побед в текущей серии
  let seriesLosses = 0;
  let seriesDraws = 0;

  // текущий шаг лестницы (зависит от seriesWins)
  // если побед 0 -> берем LADDER[1] как "след победа" (x1.20)
  // если побед 1 -> LADDER[2] (x1.50) и т.д.
  function nextXIndex() {
    return clamp(seriesWins + 1, 0, LADDER.length - 1);
  }
  function currentX() {
    return LADDER[nextXIndex()];
  }

  // ===== SVG icons (our own) =====
  function svgRock() {
    return `
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="gR" x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
            <stop stop-color="#FFE08A"/>
            <stop offset="1" stop-color="#FFB54D"/>
          </linearGradient>
        </defs>
        <path d="M22 12c4-6 16-6 20 0l6 8c4 6 4 14 0 20l-4 7c-2 4-6 7-12 7H28c-6 0-10-3-12-7l-4-7c-4-6-4-14 0-20l6-8Z"
              fill="url(#gR)" stroke="rgba(255,255,255,.35)" stroke-width="2" />
        <path d="M20 28c2-4 8-6 12-6s10 2 12 6" stroke="rgba(0,0,0,.18)" stroke-width="3" stroke-linecap="round"/>
      </svg>`;
  }

  function svgScissors() {
    return `
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="gS" x1="10" y1="12" x2="54" y2="52" gradientUnits="userSpaceOnUse">
            <stop stop-color="#C9D6FF"/>
            <stop offset="1" stop-color="#7FA6FF"/>
          </linearGradient>
        </defs>
        <path d="M18 40c0-6 5-10 11-8l6 2 6-2c6-2 11 2 11 8 0 7-6 10-12 8l-5-2-5 2c-6 2-12-1-12-8Z"
              fill="url(#gS)" stroke="rgba(255,255,255,.35)" stroke-width="2"/>
        <path d="M26 26l12 12" stroke="rgba(0,0,0,.18)" stroke-width="3" stroke-linecap="round"/>
        <path d="M38 26L26 38" stroke="rgba(0,0,0,.18)" stroke-width="3" stroke-linecap="round"/>
      </svg>`;
  }

  function svgPaper() {
    return `
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="gP" x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
            <stop stop-color="#B8FFD9"/>
            <stop offset="1" stop-color="#3DFC8B"/>
          </linearGradient>
        </defs>
        <path d="M18 10h20l8 8v30c0 4-3 6-7 6H18c-4 0-7-2-7-6V16c0-4 3-6 7-6Z"
              fill="url(#gP)" stroke="rgba(255,255,255,.35)" stroke-width="2"/>
        <path d="M38 10v10h10" stroke="rgba(0,0,0,.14)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M20 30h24" stroke="rgba(0,0,0,.14)" stroke-width="3" stroke-linecap="round"/>
        <path d="M20 38h20" stroke="rgba(0,0,0,.14)" stroke-width="3" stroke-linecap="round"/>
      </svg>`;
  }

  function svgQuestion() {
    return `
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="gQ" x1="14" y1="12" x2="50" y2="56" gradientUnits="userSpaceOnUse">
            <stop stop-color="rgba(255,255,255,.28)"/>
            <stop offset="1" stop-color="rgba(255,255,255,.10)"/>
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="22" fill="url(#gQ)" stroke="rgba(255,255,255,.22)" stroke-width="2"/>
        <path d="M26 27c1-4 4-6 8-6 5 0 8 3 8 7 0 3-2 5-4 6-2 1-3 2-3 4v1"
              stroke="rgba(255,255,255,.75)" stroke-width="3" stroke-linecap="round"/>
        <circle cx="32" cy="44" r="2.2" fill="rgba(255,255,255,.85)"/>
      </svg>`;
  }

  function iconFor(move) {
    if (move === "rock") return svgRock();
    if (move === "scissors") return svgScissors();
    if (move === "paper") return svgPaper();
    return svgQuestion();
  }

  // ===== Audio (simple + quiet) =====
  let actx = null;
  function audioCtx() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    return actx;
  }
  function beep(freq, dur = 0.06, vol = 0.04, type = "sine") {
    if (!soundOn) return;
    const ctx = audioCtx();
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  function sfx(type) {
    if (!soundOn) return;
    // тихие приятные сигналы
    if (type === "pick") { beep(560, 0.05, 0.03, "triangle"); }
    if (type === "shuffle") { beep(240, 0.06, 0.025, "sine"); beep(320, 0.06, 0.02, "sine"); }
    if (type === "win") { beep(520, 0.07, 0.04, "triangle"); beep(740, 0.08, 0.04, "triangle"); }
    if (type === "lose") { beep(220, 0.10, 0.04, "sine"); }
    if (type === "draw") { beep(420, 0.08, 0.03, "sine"); }
    if (type === "cash") { beep(660, 0.06, 0.03, "triangle"); }
  }

  // ===== Helpers =====
  function loadNumber(key, def) {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) ? v : def;
  }
  function loadBool(key, def) {
    const v = localStorage.getItem(key);
    if (v === null) return def;
    return v === "1";
  }
  function save() {
    localStorage.setItem(LS_BAL, String(balance));
    localStorage.setItem(LS_SOUND, soundOn ? "1" : "0");
  }

  function readBet() {
    const n = Number(String(betInput.value).replace(/[^\d]/g, ""));
    if (!Number.isFinite(n)) return 0;
    return clamp(n, 10, 999999999);
  }
  function setBet(n) {
    betInput.value = String(clamp(n, 10, 999999999));
  }

  function setStatus(text) { hudStatus.textContent = text; }
  function setHud() {
    hudYou.textContent = selected ? labelMove(selected) : "—";
    // bot and result are set after play
  }

  function labelMove(m) {
    if (m === "rock") return "🪨 Камень";
    if (m === "paper") return "📄 Бумага";
    if (m === "scissors") return "✂️ Ножницы";
    return "—";
  }

  // ===== Ladder (top X chips like Stake) =====
  function renderLadder() {
    ladderRow.innerHTML = "";
    const activeIdx = nextXIndex();

    LADDER.forEach((x, idx) => {
      const el = document.createElement("div");
      el.className = "step";
      if (idx === activeIdx) el.classList.add("isActive");
      if (idx <= seriesWins) el.classList.add("isDone");

      el.innerHTML = `
        <div class="sTop">${idx === 0 ? "Старт" : `Шаг ${idx}`}</div>
        <div class="sX">x${x.toFixed(2)}</div>
      `;
      ladderRow.appendChild(el);
    });

    ladderMeta.textContent =
      `Серия: ${seriesWins} побед • След. победа: x${currentX().toFixed(2)} • До цели: ${Math.max(0, SERIES_TO_WIN - seriesWins)}`;
  }

  function resetRoundVisuals() {
    arena.classList.remove("isWin", "isLose", "isDraw");
    hudBot.textContent = "—";
    hudResult.textContent = "—";
    botFace.innerHTML = iconFor(null);
    youFace.innerHTML = selected ? iconFor(selected) : iconFor(null);
    botHint.textContent = "Готов";
    youHint.textContent = "Готов";
    winText.textContent = "—";
    note.textContent = "Выбирай ход и жми “Играть”.";
  }

  function setPickActive(p) {
    selected = p;
    pickRock.classList.toggle("isActive", p === "rock");
    pickScissors.classList.toggle("isActive", p === "scissors");
    pickPaper.classList.toggle("isActive", p === "paper");
    youFace.innerHTML = iconFor(p);
    setHud();
    sfx("pick");
  }

  // ===== RPS logic =====
  function randomMove() {
    const a = ["rock", "paper", "scissors"];
    return a[(Math.random() * a.length) | 0];
  }

  function resultOf(you, bot) {
    if (you === bot) return "draw";
    if (you === "rock" && bot === "scissors") return "win";
    if (you === "paper" && bot === "rock") return "win";
    if (you === "scissors" && bot === "paper") return "win";
    return "lose";
  }

  async function playRound() {
    if (busy) return;
    if (!selected) {
      note.textContent = "Сначала выбери ход снизу.";
      return;
    }

    const bet = readBet();
    if (bet <= 0) return;

    if (balance < bet) {
      note.textContent = "Не хватает баланса. Нажми “+1000 🪙”.";
      return;
    }

    busy = true;
    btnPlay.disabled = true;

    // consume bet upfront (as Stake feeling), then refund on draw
    balance -= bet;
    updateBalance();

    setStatus("Игра...");
    note.textContent = "Перемешивание…";
    botHint.textContent = "Думает…";
    youHint.textContent = "Ждём…";

    // shuffle animation
    botCard.classList.add("isShuffle");
    youCard.classList.add("isShuffle");
    sfx("shuffle");
    await sleep(550);
    botCard.classList.remove("isShuffle");
    youCard.classList.remove("isShuffle");

    // bot chooses
    const bot = randomMove();

    // reveal animation
    note.textContent = "Открываем…";
    botCard.classList.add("isReveal");
    youCard.classList.add("isReveal");
    await sleep(250);

    botFace.innerHTML = iconFor(bot);
    youFace.innerHTML = iconFor(selected);

    await sleep(350);
    botCard.classList.remove("isReveal");
    youCard.classList.remove("isReveal");

    hudBot.textContent = labelMove(bot);

    const res = resultOf(selected, bot);
    let payout = 0;

    if (res === "win") {
      seriesWins += 1;
      const x = currentX(); // next step already based on increment, so compute with seriesWins now?
      // Важно: payout по ступени "победа, которую ты только что сделал".
      // Для этого используем индекс = seriesWins (после инкремента)
      const wonIdx = clamp(seriesWins, 0, LADDER.length - 1);
      const wonX = LADDER[wonIdx];

      payout = Math.round(bet * wonX);
      balance += payout;

      arena.classList.add("isWin");
      hudResult.textContent = "Победа ✅";
      botHint.textContent = "Проиграл";
      youHint.textContent = "Победа";
      note.textContent = seriesWins >= SERIES_TO_WIN
        ? "Серия закрыта! Можно начать новую."
        : "Победа! Жми ещё раз, чтобы продолжить серию.";

      winText.textContent = `+${fmt(payout)} 🪙 (x${wonX.toFixed(2)})`;
      sfx("win");

      // если серия достигнута — сбрасываем (как отдельная сессия)
      if (seriesWins >= SERIES_TO_WIN) {
        // маленькая пауза, потом сброс серии
        await sleep(450);
        seriesWins = 0; seriesLosses = 0; seriesDraws = 0;
        setStatus("Ожидание");
        note.textContent = "Серия завершена. Выбирай ход и жми “Играть”.";
      } else {
        setStatus("Ожидание");
      }
    }

    if (res === "lose") {
      seriesLosses += 1;
      seriesWins = 0; // серия обнуляется
      arena.classList.add("isLose");
      hudResult.textContent = "Поражение ❌";
      botHint.textContent = "Победа";
      youHint.textContent = "Проиграл";
      note.textContent = "Проигрыш. Серия сброшена.";
      winText.textContent = `-${fmt(bet)} 🪙`;
      sfx("lose");
      setStatus("Ожидание");
    }

    if (res === "draw") {
      seriesDraws += 1;
      // возврат ставки
      balance += bet;
      arena.classList.add("isDraw");
      hudResult.textContent = "Ничья 🤝";
      botHint.textContent = "Ничья";
      youHint.textContent = "Ничья";
      note.textContent = "Ничья — ставка возвращена. Жми ещё раз.";
      winText.textContent = `0 🪙 (возврат)`;
      sfx("draw");
      setStatus("Ожидание");
    }

    updateBalance();
    renderLadder();
    save();

    btnPlay.disabled = false;
    busy = false;
  }

  function resetAll() {
    if (busy) return;
    seriesWins = 0;
    seriesLosses = 0;
    seriesDraws = 0;
    setStatus("Ожидание");
    resetRoundVisuals();
    renderLadder();
    save();
  }

  function updateBalance() {
    balanceEl.textContent = fmt(balance);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ===== Bindings =====
  pickIconRock.innerHTML = svgRock();
  pickIconScissors.innerHTML = svgScissors();
  pickIconPaper.innerHTML = svgPaper();

  botFace.innerHTML = iconFor(null);
  youFace.innerHTML = iconFor(null);

  pickRock.addEventListener("click", () => setPickActive("rock"));
  pickScissors.addEventListener("click", () => setPickActive("scissors"));
  pickPaper.addEventListener("click", () => setPickActive("paper"));

  btnPlay.addEventListener("click", playRound);
  btnReset.addEventListener("click", resetAll);

  btnSound.addEventListener("click", async () => {
    soundOn = !soundOn;
    btnSound.textContent = `Звук: ${soundOn ? "on" : "off"}`;
    save();
    // to unlock audio on some browsers
    if (soundOn) {
      try { await audioCtx().resume(); } catch {}
      sfx("pick");
    }
  });

  add1000.addEventListener("click", () => {
    balance += 1000;
    updateBalance();
    save();
    sfx("cash");
  });

  chips.forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = btn.dataset.bet;
      if (v === "max") {
        setBet(balance > 0 ? balance : 10);
      } else {
        setBet(Number(v));
      }
    });
  });

  betMinus.addEventListener("click", () => setBet(readBet() - 10));
  betPlus.addEventListener("click", () => setBet(readBet() + 10));

  betInput.addEventListener("input", () => {
    const v = String(betInput.value).replace(/[^\d]/g, "");
    betInput.value = v ? String(Number(v)) : "";
  });
  betInput.addEventListener("blur", () => {
    const b = readBet();
    setBet(b || 100);
  });

  // ===== Init =====
  function init() {
    btnSound.textContent = `Звук: ${soundOn ? "on" : "off"}`;
    updateBalance();
    setStatus("Ожидание");
    resetRoundVisuals();
    renderLadder();
    setBet(readBet() || 100);
    save();
  }

  init();
})();
