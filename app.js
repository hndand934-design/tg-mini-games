/* RPS v2 — fixed buttons + SVG white hands + smooth animations + ladder X + series (best of 3)
   Works on GitHub Pages. No external libs.
*/
(() => {
  "use strict";

  // --------- DOM ----------
  const $ = (id) => document.getElementById(id);

  const elBalance = $("balance");
  const elStatus = $("statusText");
  const elYourPick = $("yourPickText");
  const elBotPick = $("botPickText");
  const elResult = $("resultText");

  const elBetInput = $("betInput");
  const elPlus = $("plus");
  const elMinus = $("minus");
  const elSound = $("soundToggle");

  const btnPlay = $("playBtn");
  const btnReset = $("resetBtn");

  const btnRock = $("pickRock");
  const btnPaper = $("pickPaper");
  const btnScissors = $("pickScissors");

  const handBot = $("botHand");
  const handYou = $("youHand");

  const quickBtns = Array.from(document.querySelectorAll("[data-bet]"));

  const steps = Array.from(document.querySelectorAll(".step"));

  // If any required element missing — fail loudly in console (helps debug)
  const must = [
    elBalance, elStatus, elYourPick, elBotPick, elResult,
    elBetInput, elPlus, elMinus, elSound,
    btnPlay, btnReset,
    btnRock, btnPaper, btnScissors,
    handBot, handYou,
    ...steps
  ];
  if (must.some((x) => !x)) {
    console.error("RPS: Missing DOM elements. Check index.html ids/classes.");
  }

  // --------- STATE ----------
  const LS_BAL = "rps_balance_v1";
  const LS_SND = "rps_sound_v1";

  let balance = parseInt(localStorage.getItem(LS_BAL) || "1000", 10);
  if (!Number.isFinite(balance) || balance < 0) balance = 1000;

  let soundOn = (localStorage.getItem(LS_SND) ?? "1") === "1";

  // series: first to 3 wins
  let youWins = 0;
  let botWins = 0;
  let roundActive = false;

  // current selection
  let yourPick = null; // "rock"|"paper"|"scissors"
  let lastOutcome = null; // "win"|"lose"|"draw"

  // ladder multipliers (like stake-ish)
  const LADDER = [1.00, 1.20, 1.50, 2.00, 3.00, 5.00, 10.00];

  // --------- SVG HANDS (WHITE) ----------
  // Simple clean "stake-like" white icons, custom but similar feel.
  const SVG = {
    rock: `
      <svg viewBox="0 0 128 128" width="92" height="92" aria-label="rock">
        <defs>
          <linearGradient id="gW" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="rgba(255,255,255,.96)"/>
            <stop offset="1" stop-color="rgba(210,220,255,.92)"/>
          </linearGradient>
          <filter id="sh" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="rgba(0,0,0,.35)"/>
          </filter>
        </defs>
        <g filter="url(#sh)">
          <path fill="url(#gW)" d="M52 26c8 0 14 6 14 14v6c0 3 2 5 5 5s5-2 5-5V36c0-6 5-11 11-11s11 5 11 11v24c0 18-10 38-32 44l-10 3c-10 3-20-2-24-11l-8-17c-6-12 3-26 17-26h11V40c0-8 6-14 14-14z"/>
          <path fill="rgba(0,0,0,.12)" d="M35 74c8 9 20 15 33 15 10 0 18-2 26-8-7 12-18 20-32 24l-10 3c-10 3-20-2-24-11l-8-17c-3-6-2-12 2-17 2 5 5 8 13 11z"/>
        </g>
      </svg>`,
    paper: `
      <svg viewBox="0 0 128 128" width="92" height="92" aria-label="paper">
        <defs>
          <linearGradient id="gW2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="rgba(255,255,255,.98)"/>
            <stop offset="1" stop-color="rgba(225,235,255,.92)"/>
          </linearGradient>
          <filter id="sh2" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="rgba(0,0,0,.35)"/>
          </filter>
        </defs>
        <g filter="url(#sh2)">
          <path fill="url(#gW2)" d="M38 22c7 0 12 5 12 12v36c0 4 3 7 7 7s7-3 7-7V30c0-7 5-12 12-12s12 5 12 12v40c0 4 3 7 7 7s7-3 7-7V42c0-7 5-12 12-12s12 5 12 12v30c0 23-14 42-36 49l-14 4c-16 5-33-3-40-18L18 82c-5-10 3-22 14-22h6V34c0-7 5-12 12-12z"/>
          <path fill="rgba(0,0,0,.10)" d="M26 85c9 10 22 16 36 16 9 0 17-2 25-6-8 13-21 22-37 26l-14 4c-16 5-33-3-40-18L18 82c-3-6-1-13 3-17 1 6 4 12 5 13z"/>
        </g>
      </svg>`,
    scissors: `
      <svg viewBox="0 0 128 128" width="92" height="92" aria-label="scissors">
        <defs>
          <linearGradient id="gW3" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="rgba(255,255,255,.98)"/>
            <stop offset="1" stop-color="rgba(215,228,255,.92)"/>
          </linearGradient>
          <filter id="sh3" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="rgba(0,0,0,.35)"/>
          </filter>
        </defs>
        <g filter="url(#sh3)">
          <path fill="url(#gW3)" d="M40 28c7 0 12 5 12 12v14c0 4 3 7 7 7s7-3 7-7V34c0-7 5-12 12-12s12 5 12 12v20c0 4 3 7 7 7s7-3 7-7V44c0-7 5-12 12-12s12 5 12 12v22c0 17-9 32-24 40l-8 4 8 6c4 3 5 9 2 13-3 4-9 5-13 2l-22-16-22 16c-4 3-10 2-13-2-3-4-2-10 2-13l8-6-8-4c-15-8-24-23-24-40V40c0-7 5-12 12-12z"/>
          <path fill="rgba(0,0,0,.10)" d="M36 88c10 8 22 12 28 12s18-4 28-12c-4 8-11 14-19 18l-8 4 8 6c4 3 5 9 2 13-3 4-9 5-13 2l-22-16-22 16c-4 3-10 2-13-2-3-4-2-10 2-13l8-6-8-4c-8-4-15-10-19-18z"/>
        </g>
      </svg>`,
    unknown: `
      <div style="font-size:64px;font-weight:900;color:rgba(233,239,255,.85);text-shadow:0 10px 28px rgba(0,0,0,.45)">?</div>`
  };

  function setHand(el, pick) {
    el.innerHTML = SVG[pick] || SVG.unknown;
  }

  // --------- SOUND (very light, WebAudio) ----------
  let audioCtx = null;

  function getCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function beep({ f = 440, t = 0.08, type = "sine", gain = 0.06 } = {}) {
    if (!soundOn) return;
    const ctx = getCtx();
    const now = ctx.currentTime;

    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, now);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t);

    o.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    o.stop(now + t + 0.02);
  }

  function sWin() {
    beep({ f: 660, t: 0.07, type: "triangle", gain: 0.05 });
    setTimeout(() => beep({ f: 880, t: 0.09, type: "triangle", gain: 0.05 }), 75);
  }
  function sLose() {
    beep({ f: 260, t: 0.10, type: "sawtooth", gain: 0.035 });
    setTimeout(() => beep({ f: 180, t: 0.12, type: "sawtooth", gain: 0.03 }), 85);
  }
  function sDraw() {
    beep({ f: 420, t: 0.07, type: "sine", gain: 0.04 });
    setTimeout(() => beep({ f: 420, t: 0.07, type: "sine", gain: 0.03 }), 90);
  }
  function sClick() {
    beep({ f: 520, t: 0.045, type: "square", gain: 0.02 });
  }

  // --------- UI HELPERS ----------
  const fmt = (n) => `${Math.round(n)} ₼`;

  function clampInt(v, min, max) {
    v = parseInt(String(v).replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(v)) v = min;
    v = Math.max(min, Math.min(max, v));
    return v;
  }

  function updateBalance() {
    elBalance.textContent = fmt(balance);
    localStorage.setItem(LS_BAL, String(balance));
  }

  function updateSoundBtn() {
    elSound.textContent = soundOn ? "Звук: on" : "Звук: off";
    localStorage.setItem(LS_SND, soundOn ? "1" : "0");
  }

  function setStatus(text) {
    elStatus.textContent = text;
  }

  function setHeader() {
    // status line includes series score + next multiplier hint
    const nextIdx = Math.min(youWins + botWins + 1, LADDER.length - 1);
    const nextX = LADDER[nextIdx];
    const target = 3;

    // optional: you may have spans in index, but we keep as plain text here
    // Top pills:
    // - statusText
    // - yourPickText
    // - botPickText
    // - resultText
    elYourPick.textContent = yourPick ? humanPick(yourPick) : "—";
    elBotPick.textContent = (roundActive && lastOutcome === null) ? "..." : (botLastPick ? humanPick(botLastPick) : "—");

    // result: handled elsewhere

    // Ladder active step highlights
    paintLadder();

    // Can show series in status
    // If your HTML already shows series elsewhere, this is still fine.
    const score = `Серия: ${youWins}-${botWins} (до ${target} побед)`;
    const hint = `След. победа: x${nextX.toFixed(2)}`;
    setStatus(roundActive ? "Раунд..." : `${score} · ${hint}`);
  }

  function humanPick(p) {
    if (p === "rock") return "Камень";
    if (p === "paper") return "Бумага";
    return "Ножницы";
  }

  function disableControls(disabled) {
    [btnRock, btnPaper, btnScissors, btnPlay, btnReset, elBetInput, elPlus, elMinus, ...quickBtns].forEach((b) => {
      if (!b) return;
      b.disabled = disabled;
    });
  }

  function setActiveChoice() {
    [btnRock, btnPaper, btnScissors].forEach((b) => b.classList.remove("active"));
    if (yourPick === "rock") btnRock.classList.add("active");
    if (yourPick === "paper") btnPaper.classList.add("active");
    if (yourPick === "scissors") btnScissors.classList.add("active");
  }

  function clearHandFx() {
    [handBot, handYou].forEach((h) => {
      h.classList.remove("shake", "win", "lose", "draw", "ready");
    });
  }

  function paintLadder() {
    // Determine current stage by wins in series (only your wins matter for "progress")
    // But we also show last outcome by coloring current step.
    steps.forEach((s) => s.classList.remove("active", "won", "lost"));

    const stage = Math.min(youWins, LADDER.length - 1); // 0..6
    // "active" indicates current x for cashout if you win next? We'll highlight current stage.
    // Use stage index to highlight current multiplier.
    if (steps[stage]) steps[stage].classList.add("active");

    // last outcome feedback:
    if (lastOutcome === "win" && steps[stage]) steps[stage].classList.add("won");
    if (lastOutcome === "lose" && steps[Math.max(0, stage)] ) steps[Math.max(0, stage)].classList.add("lost");
  }

  // --------- GAME LOGIC ----------
  let botLastPick = null;

  function randomBotPick() {
    const r = Math.random();
    return r < 0.333 ? "rock" : r < 0.666 ? "paper" : "scissors";
  }

  function outcome(a, b) {
    // returns "win" if a beats b, else "lose" or "draw"
    if (a === b) return "draw";
    if (
      (a === "rock" && b === "scissors") ||
      (a === "paper" && b === "rock") ||
      (a === "scissors" && b === "paper")
    ) return "win";
    return "lose";
  }

  function getBet() {
    const v = clampInt(elBetInput.value, 10, 1000000);
    elBetInput.value = String(v);
    return v;
  }

  function currentMultiplierIfWin() {
    // When you win this round, the payout multiplier depends on ladder step for next win.
    // If youWins=0 -> next win gives 1.20; if youWins=1 -> 1.50 ... etc.
    const idx = Math.min(youWins + 1, LADDER.length - 1);
    return LADDER[idx];
  }

  function resetSeries(full = false) {
    youWins = 0;
    botWins = 0;
    lastOutcome = null;
    botLastPick = null;
    yourPick = null;
    roundActive = false;

    clearHandFx();
    setHand(handBot, "unknown");
    setHand(handYou, "unknown");

    setActiveChoice();

    elResult.textContent = "—";
    elBotPick.textContent = "—";
    elYourPick.textContent = "—";

    if (full) setStatus("Ожидание");
    paintLadder();
  }

  function setResultText(text, tone) {
    elResult.textContent = text;
    // optional: you can style result pill via data-attr if you want
    // Here we keep it simple.
  }

  function finishMatch(winner) {
    // winner: "you"|"bot"
    roundActive = false;
    disableControls(false);

    if (winner === "you") {
      setResultText("Победа в серии ✅", "win");
      sWin();
    } else {
      setResultText("Поражение в серии ❌", "lose");
      sLose();
    }

    // after short delay, auto reset series (keeps it flowing)
    setTimeout(() => {
      resetSeries(true);
      setStatus("Ожидание");
      setHeader();
    }, 1100);
  }

  async function playRound() {
    if (roundActive) return;
    if (!yourPick) {
      setStatus("Сначала выбери: камень / ножницы / бумага");
      return;
    }

    const bet = getBet();
    if (balance < bet) {
      setStatus("Недостаточно баланса");
      return;
    }

    // start
    roundActive = true;
    disableControls(true);
    lastOutcome = null;
    botLastPick = null;

    clearHandFx();
    handBot.classList.add("ready");
    handYou.classList.add("ready");

    setResultText("Играем...", "neutral");
    setStatus("Раунд...");
    setHeader();

    // pay bet upfront (like many games)
    balance -= bet;
    updateBalance();

    // reveal animation sequence
    sClick();

    // shake a bit
    handBot.classList.add("shake");
    handYou.classList.add("shake");

    // show unknown while shaking
    setHand(handBot, "unknown");
    setHand(handYou, "unknown");

    await wait(520);

    // decide bot
    botLastPick = randomBotPick();

    // set final hands
    setHand(handBot, botLastPick);
    setHand(handYou, yourPick);

    // compute outcome
    const out = outcome(yourPick, botLastPick);
    lastOutcome = out;

    clearHandFx();
    // keep them slightly "ready"
    handBot.classList.add("ready");
    handYou.classList.add("ready");

    if (out === "draw") {
      // return bet
      balance += bet;
      updateBalance();

      handBot.classList.add("draw");
      handYou.classList.add("draw");

      setResultText("Ничья 🤝", "draw");
      setStatus("Ничья — ставка возвращена");
      sDraw();
      // no score change
    }

    if (out === "lose") {
      botWins += 1;
      handBot.classList.add("win");
      handYou.classList.add("lose");

      setResultText("Поражение ❌", "lose");
      setStatus("Проигрыш — ставка сгорела");
      sLose();
    }

    if (out === "win") {
      youWins += 1;
      const mult = currentMultiplierIfWin(); // based on updated youWins? careful

      // Our function uses youWins + 1, but we already incremented.
      // Let's compute correctly: payout for this win should correspond to youWins (after increment).
      // If youWins=1 -> x1.20 ; if 2 -> x1.50 ... etc
      const idx = Math.min(youWins, LADDER.length - 1);
      const payoutX = LADDER[idx];

      const winAmount = bet * payoutX;
      balance += Math.round(winAmount);
      updateBalance();

      handBot.classList.add("lose");
      handYou.classList.add("win");

      setResultText(`Победа ✅ (+${Math.round(winAmount)} ₼)`, "win");
      setStatus(`Ты выиграл раунд! x${payoutX.toFixed(2)}`);
      sWin();
    }

    paintLadder();
    setHeader();

    await wait(650);

    // check series end
    const target = 3;
    if (youWins >= target) {
      finishMatch("you");
      return;
    }
    if (botWins >= target) {
      finishMatch("bot");
      return;
    }

    // next
    roundActive = false;
    disableControls(false);
    setStatus("Ожидание · выбери ход и нажми «Играть»");
    setHeader();
  }

  function wait(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  // --------- EVENTS ----------
  function pick(p) {
    if (roundActive) return;
    yourPick = p;
    setActiveChoice();
    setHand(handYou, p);
    elYourPick.textContent = humanPick(p);
    setStatus("Выбор сделан · нажми «Играть»");
    sClick();
    setHeader();
  }

  btnRock.addEventListener("click", () => pick("rock"));
  btnPaper.addEventListener("click", () => pick("paper"));
  btnScissors.addEventListener("click", () => pick("scissors"));

  btnPlay.addEventListener("click", () => playRound());
  btnReset.addEventListener("click", () => {
    if (roundActive) return;
    sClick();
    resetSeries(true);
    setStatus("Ожидание");
    setHeader();
  });

  elPlus.addEventListener("click", () => {
    const v = clampInt(elBetInput.value, 10, 1000000);
    elBetInput.value = String(v + 10);
    sClick();
  });
  elMinus.addEventListener("click", () => {
    const v = clampInt(elBetInput.value, 10, 1000000);
    elBetInput.value = String(Math.max(10, v - 10));
    sClick();
  });

  quickBtns.forEach((b) => {
    b.addEventListener("click", () => {
      const add = parseInt(b.getAttribute("data-bet"), 10);
      const v = clampInt(elBetInput.value, 10, 1000000);
      elBetInput.value = String(v + add);
      sClick();
    });
  });

  elBetInput.addEventListener("input", () => {
    elBetInput.value = String(clampInt(elBetInput.value, 10, 1000000));
  });

  elSound.addEventListener("click", async () => {
    soundOn = !soundOn;
    updateSoundBtn();
    // resume audio context after user gesture
    try {
      if (soundOn) {
        const ctx = getCtx();
        if (ctx.state === "suspended") await ctx.resume();
        sClick();
      }
    } catch {}
  });

  // --------- INIT ----------
  function init() {
    updateBalance();
    updateSoundBtn();

    // default bet
    if (!elBetInput.value) elBetInput.value = "100";
    elBetInput.value = String(clampInt(elBetInput.value, 10, 1000000));

    resetSeries(true);

    // initial hands
    setHand(handBot, "unknown");
    setHand(handYou, "unknown");

    setStatus("Ожидание · выбери ход");
    setHeader();

    // Ensure buttons really clickable (some old css could set pointer-events none)
    [btnRock, btnPaper, btnScissors, btnPlay, btnReset].forEach((b) => {
      if (b) b.style.pointerEvents = "auto";
    });
  }

  init();
})();
