/* app.js — RPS (Rock / Paper / Scissors) v2
   - кликабельные кнопки (без перекрытий)
   - SVG “руки” белые (в стиле Stake, без кривых картинок)
   - серия до N побед + лестница X
   - плавные анимации + звук (on/off)
   - GitHub Pages friendly, без библиотек
*/

(() => {
  "use strict";

  /* =======================
     CONFIG
  ======================= */
  const SERIES_WINS_TO_FINISH = 3; // серия до 3 побед
  // Лестница X: старт + шаги (как в Stake-стиле)
  const X_STEPS = [1.00, 1.20, 1.50, 2.00, 3.00, 5.00, 10.00];

  const LS_BAL = "rps_balance";
  const LS_SOUND = "rps_sound_on";

  /* =======================
     DOM helpers
  ======================= */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (n) => {
    const x = Math.round(n);
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  };

  /* =======================
     Find DOM (expects your current index.html ids/classes)
     If something is missing — safely fallback
  ======================= */

  // Top labels
  const elBal = $("#balanceValue") || $("#balance") || $('[data-balance]');
  const elStatus = $("#pillStatus") || $("#statusValue") || $('[data-status]');
  const elYour = $("#pillYour") || $("#yourPickValue") || $('[data-yourpick]');
  const elBot = $("#pillBot") || $("#botPickValue") || $('[data-botpick]');
  const elResult = $("#pillResult") || $("#resultValue") || $('[data-result]');

  // Ladder
  const elLadder = $("#xLadder") || $("#ladderRow") || $(".ladder__row");
  const elLadderHint = $("#ladderHint") || $(".ladder__hint");

  // Arena cards
  const cardBot = $("#botCard") || $("#botCardBox") || $(".handCard[data-side='bot']") || $(".handCard.bot");
  const cardYou = $("#youCard") || $("#youCardBox") || $(".handCard[data-side='you']") || $(".handCard.you");

  const svgBotWrap = $("#botSvg") || (cardBot ? $(".handSvg", cardBot) : null);
  const svgYouWrap = $("#youSvg") || (cardYou ? $(".handSvg", cardYou) : null);

  const botState = $("#botState") || (cardBot ? $(".handState", cardBot) : null);
  const youState = $("#youState") || (cardYou ? $(".handState", cardYou) : null);

  // Picks
  const pickBtns = $$(".pickBtn");
  const btnRock = $("#pickRock") || pickBtns.find(b => b.dataset.pick === "rock");
  const btnScissors = $("#pickScissors") || pickBtns.find(b => b.dataset.pick === "scissors");
  const btnPaper = $("#pickPaper") || pickBtns.find(b => b.dataset.pick === "paper");

  // Bet UI
  const betInput = $("#betInput") || $("input[type='number']") || $("input");
  const btnPlay = $("#btnPlay") || $("#playBtn") || $("button[data-action='play']") || $("button.btnPrimary");
  const btnReset = $("#btnReset") || $("#resetBtn") || $("button[data-action='reset']") || $("button.btnGhost");

  const chipBtns = $$(".chip"); // quick bet chips
  const btnMinus = $("#betMinus") || $("button[data-action='minus']");
  const btnPlus = $("#betPlus") || $("button[data-action='plus']");
  const btnSound = $("#soundBtn") || $(".soundBtn");

  const payoutValue = $("#payoutValue") || $("#winValue") || $('[data-win]');

  /* =======================
     Safety: if core elements missing, don't crash
  ======================= */
  const hasCore = !!(btnPlay && betInput);

  /* =======================
     SVG “Hands” (white, clean)
  ======================= */
  // base style for our icons: white fill + subtle shading
  const SVG_BASE = `
    <svg viewBox="0 0 128 128" width="112" height="112" aria-hidden="true">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="rgba(255,255,255,0.98)"/>
          <stop offset="1" stop-color="rgba(220,230,255,0.92)"/>
        </linearGradient>
        <filter id="s" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="10" stdDeviation="8" flood-color="rgba(0,0,0,0.45)"/>
        </filter>
      </defs>
      __PATH__
    </svg>
  `;

  // These are stylized “hand” silhouettes (not stock images)
  // rock: fist
  const SVG_ROCK = SVG_BASE.replace(
    "__PATH__",
    `
    <g filter="url(#s)">
      <path fill="url(#g)" d="M46 62c0-10 7-18 17-18h15c9 0 16 8 16 18v18c0 18-12 32-30 32S46 98 46 80V62z"/>
      <path fill="rgba(180,200,255,.35)" d="M54 64h40v6H54z"/>
      <path fill="rgba(180,200,255,.25)" d="M56 76h36v6H56z"/>
      <path fill="rgba(180,200,255,.18)" d="M58 88h32v6H58z"/>
      <path fill="url(#g)" d="M46 62c0-7 6-13 13-13h6v13H46z"/>
      <path fill="url(#g)" d="M69 49h6v13h-6z"/>
      <path fill="url(#g)" d="M79 49h6v13h-6z"/>
      <path fill="url(#g)" d="M89 49h6c7 0 13 6 13 13H89V49z"/>
      <path fill="rgba(0,0,0,.10)" d="M54 58h40v2H54z"/>
    </g>`
  );

  // paper: open palm
  const SVG_PAPER = SVG_BASE.replace(
    "__PATH__",
    `
    <g filter="url(#s)">
      <path fill="url(#g)" d="M44 64c0-8 6-14 14-14h12c8 0 14 6 14 14v28c0 18-12 30-28 30S44 110 44 92V64z"/>
      <path fill="url(#g)" d="M52 44c0-6 5-10 10-10 6 0 10 4 10 10v18H52V44z"/>
      <path fill="url(#g)" d="M74 44c0-6 5-10 10-10 6 0 10 4 10 10v22H74V44z"/>
      <path fill="url(#g)" d="M96 50c0-6 5-10 10-10 6 0 10 4 10 10v28H96V50z"/>
      <path fill="rgba(180,200,255,.25)" d="M50 78h44v6H50z"/>
      <path fill="rgba(180,200,255,.18)" d="M52 90h40v6H52z"/>
      <path fill="rgba(0,0,0,.10)" d="M50 70h46v2H50z"/>
    </g>`
  );

  // scissors: “V” fingers
  const SVG_SCISSORS = SVG_BASE.replace(
    "__PATH__",
    `
    <g filter="url(#s)">
      <path fill="url(#g)" d="M52 80c0-10 8-18 18-18h10c10 0 18 8 18 18v18c0 16-10 28-28 28S52 114 52 98V80z"/>
      <path fill="url(#g)" d="M58 40c0-6 5-10 10-10 6 0 10 4 10 10v36H58V40z"/>
      <path fill="url(#g)" d="M80 40c0-6 5-10 10-10 6 0 10 4 10 10v36H80V40z"/>
      <path fill="rgba(0,0,0,.10)" d="M60 74h46v2H60z"/>
      <path fill="rgba(180,200,255,.22)" d="M60 88h44v6H60z"/>
    </g>`
  );

  const SVG_Q = SVG_BASE.replace(
    "__PATH__",
    `
    <g filter="url(#s)">
      <circle cx="64" cy="64" r="46" fill="rgba(255,255,255,.10)"/>
      <text x="64" y="76" text-anchor="middle" font-size="64" font-weight="900" fill="rgba(255,255,255,.92)">?</text>
    </g>`
  );

  const SVG_BY_PICK = {
    rock: SVG_ROCK,
    paper: SVG_PAPER,
    scissors: SVG_SCISSORS
  };

  /* =======================
     Sound (simple WebAudio beeps, not громкие)
  ======================= */
  let audioCtx = null;
  let soundOn = true;

  function loadSoundPref() {
    const v = localStorage.getItem(LS_SOUND);
    soundOn = (v === null) ? true : (v === "1");
    syncSoundUI();
  }

  function syncSoundUI() {
    if (!btnSound) return;
    const dot = $(".dot", btnSound) || btnSound.querySelector(".dot");
    if (dot) {
      dot.style.background = soundOn ? "#4fe28a" : "#ff5d73";
      dot.style.boxShadow = soundOn ? "0 0 0 3px rgba(79,226,138,.15)" : "0 0 0 3px rgba(255,93,115,.15)";
    }
    btnSound.setAttribute("data-on", soundOn ? "1" : "0");
    btnSound.textContent = soundOn ? "Звук: on" : "Звук: off";
    // если в твоём HTML есть текст/иконка — лучше не трогать innerHTML.
    // Но у тебя часто кнопка текстовая — так надёжнее.
  }

  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function beep({ f = 440, t = 0.08, type = "sine", v = 0.08 } = {}) {
    if (!soundOn) return;
    try {
      ensureAudio();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.value = 0.0001;

      o.connect(g);
      g.connect(audioCtx.destination);

      const now = audioCtx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(v, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t);

      o.start(now);
      o.stop(now + t + 0.02);
    } catch (_) {}
  }

  function sClick() { beep({ f: 520, t: 0.06, type: "triangle", v: 0.06 }); }
  function sShuffle() { beep({ f: 260, t: 0.08, type: "sine", v: 0.05 }); }
  function sWin() { beep({ f: 740, t: 0.10, type: "triangle", v: 0.08 }); setTimeout(()=>beep({f: 980, t:0.09, type:"triangle", v:0.07}), 80); }
  function sLose() { beep({ f: 220, t: 0.12, type: "sine", v: 0.07 }); }
  function sTie() { beep({ f: 420, t: 0.09, type: "sine", v: 0.06 }); }

  /* =======================
     Balance
  ======================= */
  let balance = 1000;

  function loadBalance() {
    const v = localStorage.getItem(LS_BAL);
    const n = v ? Number(v) : NaN;
    balance = Number.isFinite(n) ? Math.max(0, n) : 1000;
    renderBalance();
  }
  function saveBalance() {
    localStorage.setItem(LS_BAL, String(balance));
  }
  function renderBalance() {
    if (!elBal) return;
    // support both simple text and nested layout
    if (elBal.dataset && elBal.dataset.balance !== undefined) {
      elBal.dataset.balance = String(balance);
    }
    elBal.textContent = `${fmt(balance)} ₽`;
  }

  /* =======================
     Game State
  ======================= */
  const Picks = ["rock", "paper", "scissors"];
  const PickName = { rock: "Камень", paper: "Бумага", scissors: "Ножницы" };
  const PickIcon = { rock: "✊", paper: "✋", scissors: "✌️" };

  let selectedPick = null;
  let busy = false;

  // Series
  let seriesWins = 0;   // your wins in current series
  let seriesLoss = 0;   // bot wins
  let roundIndex = 0;   // how many rounds played in series

  // bet
  let bet = 100;

  // payout (last)
  let lastPayout = 0;

  function setText(el, txt) { if (el) el.textContent = txt; }

  function setStatus(txt) { setText(elStatus, txt); }
  function setYour(txt) { setText(elYour, txt); }
  function setBot(txt) { setText(elBot, txt); }
  function setResult(txt) { setText(elResult, txt); }

  function setWinValue(v) {
    if (!payoutValue) return;
    payoutValue.textContent = v ? `${fmt(v)} ₽` : "—";
  }

  function renderHands(botPick, yourPick) {
    if (svgBotWrap) svgBotWrap.innerHTML = botPick ? SVG_BY_PICK[botPick] : SVG_Q;
    if (svgYouWrap) svgYouWrap.innerHTML = yourPick ? SVG_BY_PICK[yourPick] : SVG_Q;
  }

  function setHandStates(botTxt, youTxt) {
    setText(botState, botTxt || "");
    setText(youState, youTxt || "");
  }

  function clearActivePickButtons() {
    pickBtns.forEach(b => b.classList.remove("is-active"));
  }

  function setActivePickButton(pick) {
    clearActivePickButtons();
    const btn = pickBtns.find(b => b.dataset.pick === pick) || null;
    if (btn) btn.classList.add("is-active");
  }

  function setBusy(v) {
    busy = v;
    if (btnPlay) btnPlay.disabled = v;
    if (btnReset) btnReset.disabled = v;
    pickBtns.forEach(b => (b.disabled = v));
  }

  /* =======================
     Ladder UI
  ======================= */
  function buildLadder() {
    if (!elLadder) return;
    elLadder.innerHTML = "";
    X_STEPS.forEach((x, i) => {
      const div = document.createElement("div");
      div.className = "xChip";
      div.dataset.i = String(i);
      div.textContent = `x${x.toFixed(2)}`;
      elLadder.appendChild(div);
    });
    highlightLadder(0);
    updateLadderHint();
  }

  function highlightLadder(stepIdx) {
    if (!elLadder) return;
    $$(".xChip", elLadder).forEach((c, i) => {
      c.classList.toggle("is-active", i === stepIdx);
    });
  }

  function currentStepIndex() {
    // step is your wins count mapped to X_STEPS: 0 = x1.00, 1 = x1.20, ...
    return clamp(seriesWins, 0, X_STEPS.length - 1);
  }

  function updateLadderHint() {
    const stepIdx = currentStepIndex();
    const nextIdx = clamp(stepIdx + 1, 0, X_STEPS.length - 1);
    const cur = X_STEPS[stepIdx];
    const next = X_STEPS[nextIdx];
    const txt = `Серия: ${seriesWins}:${seriesLoss} (до ${SERIES_WINS_TO_FINISH} побед). След. победа: x${next.toFixed(
      2
    )}`;
    setText(elLadderHint, txt);
    highlightLadder(stepIdx);
  }

  /* =======================
     Bet UI
  ======================= */
  function readBetFromInput() {
    const n = Number(betInput?.value);
    if (!Number.isFinite(n)) return bet;
    return clamp(Math.floor(n), 1, 1_000_000);
  }
  function writeBetToInput(v) {
    if (betInput) betInput.value = String(v);
  }
  function setBet(v) {
    bet = clamp(Math.floor(v), 1, 1_000_000);
    writeBetToInput(bet);
  }

  function applyChip(v) {
    sClick();
    if (v === "MAX") setBet(balance > 0 ? balance : 1);
    else setBet(v);
  }

  /* =======================
     Rules
  ======================= */
  function judge(y, b) {
    if (y === b) return "tie";
    if (y === "rock" && b === "scissors") return "win";
    if (y === "paper" && b === "rock") return "win";
    if (y === "scissors" && b === "paper") return "win";
    return "lose";
  }

  function randomPick() {
    return Picks[Math.floor(Math.random() * Picks.length)];
  }

  /* =======================
     Animations (CSS classes)
  ======================= */
  function pop(el) {
    if (!el) return;
    el.classList.remove("is-pop");
    // reflow
    void el.offsetWidth;
    el.classList.add("is-pop");
  }
  function shake(el) {
    if (!el) return;
    el.classList.remove("is-shaking");
    void el.offsetWidth;
    el.classList.add("is-shaking");
  }

  function setArenaMessage(txt) {
    // optional: reuse center note if exists
    const note = $("#arenaNote") || $(".arenaNote");
    if (note) note.textContent = txt;
  }

  /* =======================
     Round flow
  ======================= */
  async function playRound() {
    if (!hasCore) return;
    if (busy) return;

    // require pick
    if (!selectedPick) {
      shake(cardYou);
      sClick();
      setArenaMessage("Сначала выбери: камень / ножницы / бумага");
      return;
    }

    // bet
    setBet(readBetFromInput());
    if (bet > balance) {
      shake($(".betPanel") || $("#betPanel") || document.body);
      setArenaMessage("Недостаточно баланса");
      return;
    }

    setBusy(true);
    setStatus("Раунд...");
    setResult("—");
    setWinValue(0);
    lastPayout = 0;

    // “Shuffle” animation
    renderHands(null, selectedPick);
    setHandStates("Думаю...", "Готов");
    pop(cardYou);
    pop(cardBot);
    setArenaMessage("Идёт выбор...");
    sShuffle();

    // small fake delay
    await sleep(550);

    const botPick = randomPick();

    // Reveal
    renderHands(botPick, selectedPick);
    setYour(`${PickIcon[selectedPick]} ${PickName[selectedPick]}`);
    setBot(`${PickIcon[botPick]} ${PickName[botPick]}`);

    pop(cardBot);
    pop(cardYou);

    const res = judge(selectedPick, botPick);

    roundIndex++;

    if (res === "win") {
      seriesWins++;
      setResult("Победа ✅");
      setStatus("Победа");
      sWin();
      // win payout based on next step X (or current?) — логика:
      // при победе выплата = ставка * текущий X после увеличения серии
      const stepIdx = currentStepIndex();
      const x = X_STEPS[stepIdx];
      const gain = Math.floor(bet * x); // total back
      const profit = gain - bet;

      balance += profit; // возвращаем ставку + профит -> проще: balance = balance - bet + gain => += gain - bet
      saveBalance();
      renderBalance();

      lastPayout = gain;
      setWinValue(gain);

      setHandStates("Проиграл", "Выиграл");
      updateLadderHint();

      // check series finish
      if (seriesWins >= SERIES_WINS_TO_FINISH) {
        await sleep(450);
        setStatus("Серия выиграна 🎉");
        setArenaMessage(`Серия завершена! Итоговый шаг: x${X_STEPS[currentStepIndex()].toFixed(2)}`);
      }
    } else if (res === "lose") {
      seriesLoss++;
      setResult("Поражение ❌");
      setStatus("Поражение");
      sLose();

      balance -= bet;
      if (balance < 0) balance = 0;
      saveBalance();
      renderBalance();

      setWinValue(0);
      setHandStates("Выиграл", "Проиграл");
      updateLadderHint();

      await sleep(250);
      shake(cardYou);

      // серия сбрасывается при поражении (как Stake-подобно)
      await sleep(300);
      resetSeries(false);
      setArenaMessage("Серия сброшена. Начни заново.");
    } else {
      setResult("Ничья 🤝");
      setStatus("Ничья");
      sTie();

      // tie: ставка возвращается, бал не меняем
      lastPayout = bet;
      setWinValue(bet);
      setHandStates("Ничья", "Ничья");
      updateLadderHint();
    }

    setBusy(false);
  }

  function resetSeries(full = true) {
    // reset ladder progression, not necessarily UI picks
    seriesWins = 0;
    seriesLoss = 0;
    roundIndex = 0;
    highlightLadder(0);
    updateLadderHint();

    if (full) {
      selectedPick = null;
      clearActivePickButtons();
      renderHands(null, null);
      setYour("—");
      setBot("—");
      setResult("—");
      setStatus("Ожидание");
      setWinValue(0);
      setHandStates("Готов", "Готов");
      setArenaMessage("Выбери ход и нажми «Играть»");
    }
  }

  /* =======================
     Wiring events
  ======================= */
  function bind() {
    // picks
    pickBtns.forEach((b) => {
      // ensure it’s clickable even if inside forms
      b.type = "button";
      b.addEventListener("click", (e) => {
        e.preventDefault();
        if (busy) return;
        const pick = b.dataset.pick;
        if (!pick) return;
        sClick();
        selectedPick = pick;
        setActivePickButton(pick);
        setYour(`${PickIcon[pick]} ${PickName[pick]}`);
        renderHands(null, pick);
        pop(cardYou);
        setHandStates("Готов", "Готов");
        setArenaMessage("Теперь нажми «Играть»");
      }, { passive: false });
    });

    // play
    if (btnPlay) {
      btnPlay.type = "button";
      btnPlay.addEventListener("click", (e) => {
        e.preventDefault();
        playRound();
      }, { passive: false });
    }

    // reset
    if (btnReset) {
      btnReset.type = "button";
      btnReset.addEventListener("click", (e) => {
        e.preventDefault();
        sClick();
        resetSeries(true);
      }, { passive: false });
    }

    // chips
    chipBtns.forEach((c) => {
      c.type = "button";
      c.addEventListener("click", (e) => {
        e.preventDefault();
        const t = (c.textContent || "").trim().toUpperCase();
        if (t.includes("MAX")) return applyChip("MAX");
        const n = Number((c.dataset.value || "").replace(",", "."));
        if (Number.isFinite(n)) return applyChip(n);
        // fallback parse from text like "100"
        const nn = Number(t.replace(/[^\d]/g, ""));
        if (Number.isFinite(nn) && nn > 0) applyChip(nn);
      }, { passive: false });
    });

    // +/- buttons
    if (btnMinus) {
      btnMinus.type = "button";
      btnMinus.addEventListener("click", (e) => {
        e.preventDefault();
        sClick();
        setBet(readBetFromInput() - 10);
      }, { passive: false });
    }
    if (btnPlus) {
      btnPlus.type = "button";
      btnPlus.addEventListener("click", (e) => {
        e.preventDefault();
        sClick();
        setBet(readBetFromInput() + 10);
      }, { passive: false });
    }

    // input
    if (betInput) {
      betInput.addEventListener("input", () => {
        const v = readBetFromInput();
        writeBetToInput(v);
      });
    }

    // sound
    if (btnSound) {
      btnSound.type = "button";
      btnSound.addEventListener("click", (e) => {
        e.preventDefault();
        soundOn = !soundOn;
        localStorage.setItem(LS_SOUND, soundOn ? "1" : "0");
        syncSoundUI();
        sClick();
      }, { passive: false });
    }

    // allow first user gesture to unlock audio on mobile
    window.addEventListener("pointerdown", () => {
      if (!soundOn) return;
      try {
        ensureAudio();
        if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
      } catch (_) {}
    }, { once: true, passive: true });
  }

  /* =======================
     Init
  ======================= */
  function init() {
    loadBalance();
    loadSoundPref();

    // set default bet
    setBet(bet);

    // ladder
    buildLadder();

    // init UI
    renderHands(null, null);
    setStatus("Ожидание");
    setYour("—");
    setBot("—");
    setResult("—");
    setWinValue(0);
    setHandStates("Готов", "Готов");
    setArenaMessage("Выбери ход и нажми «Играть»");

    bind();
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Run
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
