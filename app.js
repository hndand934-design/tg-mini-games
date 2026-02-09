(() => {
  // ===== Helpers =====
  const $ = (s) => document.querySelector(s);
  const fmtRub = (n) => `${Math.max(0, Math.floor(n))} ₽`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ===== Local balance =====
  const LS_BAL = "penalty_balance_v1";
  const LS_SOUND = "penalty_sound_v1";

  let balance = Number(localStorage.getItem(LS_BAL) || 1000);
  let soundOn = (localStorage.getItem(LS_SOUND) ?? "1") === "1";

  // ===== Game state =====
  const MULTIS = [1.76, 3.30, 7.08, 15.17, 45.52];
  let selectedMulti = MULTIS[0];

  let inRound = false;      // ставка поставлена, игра активна
  let shotLock = false;     // блок на время анимации
  let bet = 100;
  let step = 0;
  let streak = 0;
  let bank = 0;             // банк для кэшаута
  let canCashout = false;

  // Series logic:
  // - series ON: каждый гол умножает банк на X (компаунд)
  // - series OFF: первый гол = bet * X, дальше можно бить ради фана (банк не растёт)
  const seriesToggle = $("#seriesToggle");

  // ===== UI =====
  const balanceText = $("#balanceText");
  const soundLed = $("#soundLed");
  const soundText = $("#soundText");
  const hintText = $("#hintText");

  const betInput = $("#betInput");
  const uiBetText = $("#uiBetText");
  const uiCashText = $("#uiCashText");

  const statusText = $("#statusText");
  const lastText = $("#lastText");
  const xText = $("#xText");
  const potentialText = $("#potentialText");
  const streakText = $("#streakText");
  const stepText = $("#stepText");
  const hudXText = $("#hudXText");

  const stakeBtn = $("#stakeBtn");
  const cashoutBtn = $("#cashoutBtn");

  const multiList = $("#multiList");

  const goalBox = $("#goalBox");
  const targets = $("#targets");
  const keeper = $("#keeper");
  const ball = $("#ball");
  const badge = $("#badge");
  const badgeTitle = $("#badgeTitle");
  const badgeSub = $("#badgeSub");

  // ===== Sounds (tiny synth) =====
  let audioCtx = null;
  function beep(freq = 440, dur = 0.07, type = "sine", gain = 0.04) {
    if (!soundOn) return;
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + dur);
  }
  const sClick = () => beep(520, 0.05, "triangle", 0.035);
  const sKick  = () => { beep(180, 0.06, "sine", 0.06); setTimeout(()=>beep(120,0.05,"sine",0.05), 30); };
  const sGoal  = () => { beep(740,0.08,"square",0.05); setTimeout(()=>beep(980,0.10,"square",0.05), 90); };
  const sSave  = () => { beep(220,0.10,"sawtooth",0.06); setTimeout(()=>beep(160,0.12,"sawtooth",0.05), 70); };

  // ===== Render =====
  function setBalance(n) {
    balance = Math.max(0, Math.floor(n));
    localStorage.setItem(LS_BAL, String(balance));
    balanceText.textContent = fmtRub(balance);
  }

  function setSound(on) {
    soundOn = !!on;
    localStorage.setItem(LS_SOUND, soundOn ? "1" : "0");
    soundLed.style.background = soundOn ? "var(--green)" : "var(--red)";
    soundLed.style.boxShadow = soundOn ? "0 0 12px rgba(54,211,154,.6)" : "0 0 12px rgba(255,59,87,.45)";
    soundText.textContent = soundOn ? "Звук: on" : "Звук: off";
  }

  function parseBetInput() {
    const raw = String(betInput.value || "").replace(/[^\d]/g, "");
    const n = clamp(Number(raw || 0), 1, 1_000_000);
    bet = n;
    betInput.value = String(n);
    uiBetText.textContent = fmtRub(bet);
  }

  function calcPotential() {
    if (!inRound) {
      potentialText.textContent = fmtRub(0);
      uiCashText.textContent = "—";
      return;
    }
    potentialText.textContent = fmtRub(bank);
    uiCashText.textContent = canCashout ? fmtRub(bank) : "—";
  }

  function setStatus(text, last = null) {
    statusText.textContent = text;
    if (last !== null) lastText.textContent = last;
  }

  function updateHud() {
    stepText.textContent = String(step);
    streakText.textContent = String(streak);
    xText.textContent = `x${selectedMulti.toFixed(2)}`;
    hudXText.textContent = `x${selectedMulti.toFixed(2)}`;
    calcPotential();
  }

  function showBadge(title, sub) {
    badgeTitle.textContent = title;
    badgeSub.textContent = sub;
    badge.hidden = false;
    badge.style.opacity = "0";
    badge.style.transform = "translate(-50%,-50%) scale(0.96)";
    requestAnimationFrame(() => {
      badge.style.transition = "opacity 180ms ease, transform 180ms ease";
      badge.style.opacity = "1";
      badge.style.transform = "translate(-50%,-50%) scale(1)";
    });
    setTimeout(() => {
      badge.style.transition = "opacity 220ms ease, transform 220ms ease";
      badge.style.opacity = "0";
      badge.style.transform = "translate(-50%,-50%) scale(0.98)";
      setTimeout(() => (badge.hidden = true), 230);
    }, 650);
  }

  // ===== Build multiplier buttons =====
  function renderMultis() {
    multiList.innerHTML = "";
    MULTIS.forEach((m) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "multi";
      b.textContent = `${m.toFixed(2)}x`;
      if (m === selectedMulti) b.classList.add("on");
      b.addEventListener("click", () => {
        if (shotLock) return;
        sClick();
        selectedMulti = m;
        [...multiList.querySelectorAll(".multi")].forEach(x => x.classList.remove("on"));
        b.classList.add("on");
        updateHud();
      });
      multiList.appendChild(b);
    });
    updateHud();
  }

  // ===== Build 15 target zones (5x3) =====
  function buildTargets() {
    targets.innerHTML = "";
    for (let i = 0; i < 15; i++) {
      const z = document.createElement("div");
      z.className = "zone";
      z.dataset.idx = String(i);
      z.title = "Удар";
      z.addEventListener("click", () => onZoneClick(i, z));
      targets.appendChild(z);
    }
  }

  function clearZoneSelection() {
    targets.querySelectorAll(".zone.sel").forEach(el => el.classList.remove("sel"));
  }

  // ===== Game flow =====
  function resetPositionsInstant() {
    // keeper center
    keeper.style.transition = "none";
    keeper.style.transform = "translateX(-50%) translateY(0px)";
    // ball start
    ball.style.transition = "none";
    ball.style.left = "50%";
    ball.style.bottom = "42px";
    ball.style.top = "auto";
    ball.style.transform = "translateX(-50%)";
    // force reflow
    keeper.offsetHeight; ball.offsetHeight;
    keeper.style.transition = "transform 260ms cubic-bezier(.2,.9,.2,1)";
    ball.style.transition =
      "transform 480ms cubic-bezier(.2,.9,.2,1), left 480ms cubic-bezier(.2,.9,.2,1), top 480ms cubic-bezier(.2,.9,.2,1), bottom 480ms cubic-bezier(.2,.9,.2,1)";
  }

  function startRound() {
    parseBetInput();

    if (bet <= 0) {
      hintText.innerHTML = "Введите ставку больше 0.";
      return;
    }
    if (balance < bet) {
      hintText.innerHTML = "Недостаточно баланса для ставки.";
      sSave();
      return;
    }

    // списываем 1 раз
    setBalance(balance - bet);

    inRound = true;
    shotLock = false;
    step = 0;
    streak = 0;
    bank = bet;             // база
    canCashout = false;
    cashoutBtn.disabled = true;

    clearZoneSelection();
    resetPositionsInstant();

    setStatus("Выбери точку удара", "—");
    hintText.innerHTML = "Кликни по зоне (5×3) — мяч полетит туда.";
    updateHud();
  }

  function endRoundLose() {
    inRound = false;
    shotLock = false;
    canCashout = false;
    cashoutBtn.disabled = true;

    setStatus("Проигрыш (сэйв)", "Сэйв");
    hintText.innerHTML = "Сэйв. Нажми <b>Ставка</b>, чтобы начать заново.";
    bank = 0;
    streak = 0;
    step = 0;
    updateHud();
  }

  function cashout() {
    if (!inRound || !canCashout) return;
    sGoal();
    setBalance(balance + bank);
    inRound = false;
    canCashout = false;
    cashoutBtn.disabled = true;

    setStatus("Кэшаут", `+${fmtRub(bank)}`);
    hintText.innerHTML = "Кэшаут успешен. Нажми <b>Ставка</b>, чтобы начать заново.";
    bank = 0;
    updateHud();
  }

  function keeperMoveToZone(zoneEl) {
    const wrap = goalBox.getBoundingClientRect();
    const zr = zoneEl.getBoundingClientRect();

    // target point near top-mid of zone
    const tx = (zr.left + zr.width / 2) - (wrap.left + wrap.width / 2);
    const ty = (zr.top + zr.height / 2) - (wrap.top + 70); // keeper base y around 60px

    keeper.style.transform = `translateX(calc(-50% + ${tx}px)) translateY(${ty}px)`;
  }

  function ballFlyToZone(zoneEl) {
    const wrap = goalBox.getBoundingClientRect();
    const zr = zoneEl.getBoundingClientRect();

    const targetX = (zr.left + zr.width / 2) - wrap.left;
    const targetY = (zr.top + zr.height / 2) - wrap.top;

    // move ball by setting left/top (switch from bottom to top)
    ball.style.left = `${targetX}px`;
    ball.style.top = `${targetY}px`;
    ball.style.bottom = "auto";
    ball.style.transform = "translate(-50%,-50%) scale(0.92)";
  }

  function ballResetBack() {
    // back to start
    ball.style.left = "50%";
    ball.style.top = "auto";
    ball.style.bottom = "42px";
    ball.style.transform = "translateX(-50%) scale(1)";
    // keeper back to center
    keeper.style.transform = "translateX(-50%) translateY(0px)";
  }

  function onZoneClick(idx, zoneEl) {
    if (!inRound) {
      hintText.innerHTML = "Сначала нажми <b>Ставка</b>.";
      sSave();
      return;
    }
    if (shotLock) return;

    clearZoneSelection();
    zoneEl.classList.add("sel");

    // lock during animation
    shotLock = true;
    step += 1;
    updateHud();

    // RNG keeper guess
    const keeperGuess = Math.floor(Math.random() * 15);
    const isSave = keeperGuess === idx;

    // animate
    sKick();
    keeperMoveToZone(targets.children[keeperGuess]);
    ballFlyToZone(zoneEl);

    setTimeout(() => {
      if (isSave) {
        sSave();
        showBadge("СЭЙВ", "ставка сгорела");
        setTimeout(() => {
          resetPositionsInstant();
          endRoundLose();
        }, 220);
        return;
      }

      // GOAL
      sGoal();

      // bank logic
      // series ON => compounding bank *= X
      // series OFF => only first goal sets bank = bet*X, дальше банк не растёт
      if (seriesToggle.checked) {
        bank = Math.floor(bank * selectedMulti);
        streak += 1;
      } else {
        if (streak === 0) bank = Math.floor(bet * selectedMulti);
        streak = streak + 1; // чисто чтобы видно было голы подряд
      }

      canCashout = true;
      cashoutBtn.disabled = false;

      setStatus("Гол! Можно бить дальше", "Гол");
      hintText.innerHTML = "Гол! Мяч вернётся — можешь бить дальше или нажать <b>Кэшаут</b>.";
      showBadge("ГОЛ!", `банк: ${fmtRub(bank)}`);
      updateHud();

      // reset for next shot
      setTimeout(() => {
        ballResetBack();
        clearZoneSelection();
        // unlock after ball returns
        setTimeout(() => {
          shotLock = false;
        }, 520);
      }, 520);
    }, 520);
  }

  // ===== Bet controls =====
  function setBetSafe(n) {
    bet = clamp(Math.floor(n), 1, 1_000_000);
    betInput.value = String(bet);
    uiBetText.textContent = fmtRub(bet);
  }

  // ===== Events =====
  $("#soundToggle").addEventListener("click", () => {
    setSound(!soundOn);
    sClick();
  });

  $("#addBalanceBtn").addEventListener("click", () => {
    setBalance(balance + 1000);
    sClick();
  });

  $("#betMinus").addEventListener("click", () => { sClick(); setBetSafe(bet - 10); });
  $("#betPlus").addEventListener("click", () => { sClick(); setBetSafe(bet + 10); });

  betInput.addEventListener("input", () => {
    const raw = String(betInput.value || "").replace(/[^\d]/g, "");
    betInput.value = raw;
    setBetSafe(Number(raw || 1));
  });

  document.querySelectorAll(".chip[data-chip]").forEach((b) => {
    b.addEventListener("click", () => {
      sClick();
      const v = b.dataset.chip;
      if (v === "max") setBetSafe(Math.max(1, balance)); // MAX = весь баланс
      else setBetSafe(Number(v));
    });
  });

  $("#betHalf").addEventListener("click", () => { sClick(); setBetSafe(Math.max(1, Math.floor(bet / 2))); });
  $("#betDouble").addEventListener("click", () => { sClick(); setBetSafe(Math.min(1_000_000, bet * 2)); });

  stakeBtn.addEventListener("click", () => {
    sClick();
    startRound();
  });

  cashoutBtn.addEventListener("click", () => {
    cashout();
  });

  seriesToggle.addEventListener("change", () => {
    sClick();
  });

  // ===== Init =====
  setSound(soundOn);
  setBalance(balance);
  setBetSafe(bet);
  renderMultis();
  buildTargets();
  resetPositionsInstant();
})();
