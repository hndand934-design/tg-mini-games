(() => {
  "use strict";

  // ===== Telegram WebApp (optional) =====
  const tg = window.Telegram?.WebApp;
  try { tg?.ready?.(); tg?.expand?.(); } catch {}

  // ===== Helpers =====
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round2 = (n) => Math.round(n * 100) / 100;

  // ===== DOM =====
  const balanceEl = $("balance");

  const hudStatus = $("hudStatus");
  const hudYou = $("hudYou");
  const hudBot = $("hudBot");
  const hudResult = $("hudResult");

  const seriesText = $("seriesText");
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

  const add1000 = $("add1000");
  const betInput = $("betInput");
  const betMinus = $("betMinus");
  const betPlus = $("betPlus");
  const chips = Array.from(document.querySelectorAll(".chip[data-bet]"));

  const btnPlay = $("btnPlay");
  const btnReset = $("btnReset");

  const winText = $("winText");
  const btnSound = $("btnSound");

  // ===== State =====
  const LS_BAL = "rps_balance_v1";
  const LS_SOUND = "rps_sound_v1";

  const MOVES = ["rock", "scissors", "paper"];
  const MOVE_LABEL = { rock: "Камень", scissors: "Ножницы", paper: "Бумага" };
  const MOVE_EMOJI = { rock: "✊", scissors: "✌️", paper: "✋" };

  let balance = Number(localStorage.getItem(LS_BAL) || 0);
  if (!Number.isFinite(balance)) balance = 0;

  let soundOn = (localStorage.getItem(LS_SOUND) || "0") === "1";

  // серия: до 3 побед
  let scoreYou = 0;
  let scoreBot = 0;

  let selectedMove = null;
  let inRound = false;

  // ===== WebAudio (simple + quiet) =====
  let audioCtx = null;

  function ensureAudio() {
    if (!soundOn) return null;
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function beep(freq, dur = 0.08, type = "sine", vol = 0.02) {
    const ctx = ensureAudio();
    if (!ctx) return;

    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;

    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    o.connect(g);
    g.connect(ctx.destination);

    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function sfxClick() { beep(520, 0.06, "sine", 0.016); }
  function sfxStart() { beep(440, 0.07, "triangle", 0.018); setTimeout(() => beep(660, 0.06, "triangle", 0.016), 90); }
  function sfxReveal() { beep(740, 0.06, "sine", 0.014); }
  function sfxWin() { beep(660, 0.08, "triangle", 0.02); setTimeout(() => beep(880, 0.09, "triangle", 0.018), 90); }
  function sfxLose() { beep(220, 0.10, "sawtooth", 0.012); }
  function sfxDraw() { beep(420, 0.08, "square", 0.012); }

  // ===== UI =====
  function setBalance(v) {
    balance = Math.max(0, Math.floor(v));
    localStorage.setItem(LS_BAL, String(balance));
    balanceEl.textContent = String(balance);
  }

  function setSoundUI() {
    btnSound.textContent = `Звук: ${soundOn ? "on" : "off"}`;
  }

  function setSeriesUI() {
    seriesText.textContent = `Серия: ${scoreBot}–${scoreYou} (до 3 побед)`;
  }

  function clearArenaClasses() {
    arena.classList.remove("isWin", "isLose", "isDraw");
  }

  function setStatus(text) { hudStatus.textContent = text; }
  function setHudMoves(you, bot) {
    hudYou.textContent = you ?? "—";
    hudBot.textContent = bot ?? "—";
  }
  function setResult(text) { hudResult.textContent = text; }

  function setFaces(you = "?", bot = "?") {
    youFace.textContent = you;
    botFace.textContent = bot;
  }

  function setHints(you = "Готов", bot = "Готов") {
    youHint.textContent = you;
    botHint.textContent = bot;
  }

  function setPickActive() {
    [pickRock, pickScissors, pickPaper].forEach((b) => b.classList.remove("isActive"));
    if (selectedMove === "rock") pickRock.classList.add("isActive");
    if (selectedMove === "scissors") pickScissors.classList.add("isActive");
    if (selectedMove === "paper") pickPaper.classList.add("isActive");
  }

  function setWinText(v) {
    winText.textContent = v;
  }

  function disablePlay(disabled) {
    btnPlay.disabled = disabled;
  }

  function sanitizeBet() {
    let v = Number(betInput.value);
    if (!Number.isFinite(v)) v = 1;
    v = Math.floor(v);
    v = clamp(v, 1, 1_000_000);
    betInput.value = String(v);
    return v;
  }

  function resetRoundUI() {
    inRound = false;
    clearArenaClasses();
    setStatus("Ожидание");
    setHudMoves("—", "—");
    setResult("—");
    setFaces("?", "?");
    setHints("Готов", "Готов");
    setWinText("—");
    note.textContent = "Выбирай ход и жми “Играть”. Серия — до 3 побед.";
    disablePlay(false);

    botCard.classList.remove("isShuffle", "isReveal");
    youCard.classList.remove("isShuffle", "isReveal");
  }

  // ===== Game logic =====
  function randMove() {
    return MOVES[Math.floor(Math.random() * MOVES.length)];
  }

  function outcome(you, bot) {
    if (you === bot) return "draw";
    if (
      (you === "rock" && bot === "scissors") ||
      (you === "scissors" && bot === "paper") ||
      (you === "paper" && bot === "rock")
    ) return "win";
    return "lose";
  }

  function payByResult(res, bet) {
    // win: +bet (профит, т.к. ставка уже списана)
    // draw: +bet (возврат)
    // lose: +0
    if (res === "win") return bet * 2; // возвращаем ставку + прибыль
    if (res === "draw") return bet;    // возвращаем ставку
    return 0;
  }

  function isMatchOver() {
    return scoreYou >= 3 || scoreBot >= 3;
  }

  function matchWinner() {
    if (scoreYou >= 3) return "you";
    if (scoreBot >= 3) return "bot";
    return null;
  }

  function hardResetSeries() {
    scoreYou = 0;
    scoreBot = 0;
    setSeriesUI();
  }

  // ===== Animations =====
  function shuffleAnim() {
    botCard.classList.remove("isShuffle");
    youCard.classList.remove("isShuffle");
    // reflow
    void botCard.offsetWidth;
    void youCard.offsetWidth;
    botCard.classList.add("isShuffle");
    youCard.classList.add("isShuffle");
  }

  function revealAnim() {
    botCard.classList.remove("isReveal");
    youCard.classList.remove("isReveal");
    void botCard.offsetWidth;
    void youCard.offsetWidth;
    botCard.classList.add("isReveal");
    youCard.classList.add("isReveal");
  }

  // ===== Main round =====
  async function playRound() {
    if (inRound) return;
    if (!selectedMove) {
      note.textContent = "Сначала выбери ход снизу 👇";
      sfxClick();
      return;
    }

    const bet = sanitizeBet();
    if (bet > balance) {
      note.textContent = "Недостаточно монет. Нажми +1000 🪙 или уменьши ставку.";
      sfxClick();
      return;
    }

    inRound = true;
    disablePlay(true);
    clearArenaClasses();

    setStatus("Идёт раунд");
    setResult("...");
    setHudMoves(`${MOVE_EMOJI[selectedMove]} ${MOVE_LABEL[selectedMove]}`, "—");
    setHints("Выбрано", "Думает...");
    setWinText("—");

    // списываем ставку сразу
    setBalance(balance - bet);

    sfxStart();

    // shuffle phase
    shuffleAnim();
    note.textContent = "Перемешивание...";
    await new Promise((r) => setTimeout(r, 550));

    const botMove = randMove();
    const res = outcome(selectedMove, botMove);

    // reveal
    setHints("Готово", "Готово");
    setHudMoves(
      `${MOVE_EMOJI[selectedMove]} ${MOVE_LABEL[selectedMove]}`,
      `${MOVE_EMOJI[botMove]} ${MOVE_LABEL[botMove]}`
    );
    setFaces(MOVE_EMOJI[selectedMove], MOVE_EMOJI[botMove]);
    revealAnim();
    sfxReveal();

    await new Promise((r) => setTimeout(r, 180));

    // apply result
    if (res === "win") {
      scoreYou += 1;
      arena.classList.add("isWin");
      setResult("Победа ✅");
      note.textContent = "Ты выиграл раунд!";
      sfxWin();
    } else if (res === "lose") {
      scoreBot += 1;
      arena.classList.add("isLose");
      setResult("Поражение ❌");
      note.textContent = "Бот выиграл раунд.";
      sfxLose();
    } else {
      arena.classList.add("isDraw");
      setResult("Ничья 🤝");
      note.textContent = "Ничья — ставка возвращается.";
      sfxDraw();
    }

    setSeriesUI();

    // payout
    const payout = payByResult(res, bet);
    if (payout > 0) setBalance(balance + payout);

    // show money text
    if (res === "win") {
      // ставка bet списана, вернули bet*2 -> чистая прибыль = bet
      setWinText(`+${bet} 🪙 (x2)`);
    } else if (res === "draw") {
      setWinText(`0 🪙 (возврат)`);
    } else {
      setWinText(`-${bet} 🪙`);
    }

    await new Promise((r) => setTimeout(r, 650));

    // match end
    if (isMatchOver()) {
      const w = matchWinner();
      if (w === "you") {
        setStatus("Серия завершена");
        note.textContent = "🎉 Ты выиграл серию! Нажми «Сброс», чтобы начать заново.";
      } else {
        setStatus("Серия завершена");
        note.textContent = "😵 Бот выиграл серию. Нажми «Сброс», чтобы начать заново.";
      }
      disablePlay(true);
      inRound = false;
      return;
    }

    // back to waiting
    setStatus("Ожидание");
    note.textContent = "Выбирай следующий ход и жми “Играть”.";
    disablePlay(false);
    inRound = false;
  }

  // ===== Events =====
  function choose(move) {
    selectedMove = move;
    setPickActive();
    setHudMoves(`${MOVE_EMOJI[move]} ${MOVE_LABEL[move]}`, "—");
    setStatus("Ожидание");
    setResult("—");
    setFaces("?", "?");
    setHints("Готов", "Готов");
    setWinText("—");
    clearArenaClasses();
    note.textContent = "Теперь жми “Играть”.";
    sfxClick();
  }

  pickRock.addEventListener("click", () => choose("rock"));
  pickScissors.addEventListener("click", () => choose("scissors"));
  pickPaper.addEventListener("click", () => choose("paper"));

  btnPlay.addEventListener("click", () => playRound());

  btnReset.addEventListener("click", () => {
    sfxClick();
    selectedMove = null;
    setPickActive();
    hardResetSeries();
    resetRoundUI();
    disablePlay(false);
  });

  // Chips
  chips.forEach((c) => {
    c.addEventListener("click", () => {
      const v = c.dataset.bet;
      if (v === "max") {
        betInput.value = String(Math.max(1, balance));
      } else {
        betInput.value = String(Number(v));
      }
      sanitizeBet();
      sfxClick();
    });
  });

  // Bet +/- and input
  betMinus.addEventListener("click", () => {
    const v = sanitizeBet();
    betInput.value = String(Math.max(1, v - 10));
    sanitizeBet();
    sfxClick();
  });
  betPlus.addEventListener("click", () => {
    const v = sanitizeBet();
    betInput.value = String(v + 10);
    sanitizeBet();
    sfxClick();
  });
  betInput.addEventListener("change", () => sanitizeBet());
  betInput.addEventListener("input", () => {
    // keep it clean while typing (but don't annoy)
    if (betInput.value === "") return;
    sanitizeBet();
  });

  add1000.addEventListener("click", () => {
    sfxClick();
    setBalance(balance + 1000);
  });

  // Sound toggle
  btnSound.addEventListener("click", async () => {
    soundOn = !soundOn;
    localStorage.setItem(LS_SOUND, soundOn ? "1" : "0");
    setSoundUI();

    // "unlock" audio on user gesture
    if (soundOn) {
      ensureAudio();
      // very quiet confirm
      setTimeout(() => beep(600, 0.06, "sine", 0.012), 30);
    }
  });

  // Keyboard shortcuts (optional)
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.key === "1") choose("rock");
    if (e.key === "2") choose("scissors");
    if (e.key === "3") choose("paper");
    if (e.key === "Enter") playRound();
  });

  // ===== Init =====
  setBalance(balance);     // updates UI + clamps
  setSoundUI();
  setSeriesUI();
  resetRoundUI();
})();
