(() => {
  "use strict";

  // ===== Storage / wallet =====
  const WALLET_KEY = "mini_wallet_penalty_v1";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const ui = {
    balance: $("#balance"),
    bonusBtn: $("#bonusBtn"),
    soundBtn: $("#soundBtn"),
    soundText: $("#soundText"),
    soundDot: $("#soundDot"),

    betInput: $("#betInput"),
    betMinus: $("#betMinus"),
    betPlus: $("#betPlus"),
    betMax: $("#betMax"),
    chips: $$(".chip[data-chip]"),

    diffEasy: $("#diffEasy"),
    diffHard: $("#diffHard"),
    infoDiff: $("#infoDiff"),
    infoBet: $("#infoBet"),
    infoCash: $("#infoCash"),
    infoSeries: $("#infoSeries"),

    ladder: $("#ladder"),
    stepText: $("#stepText"),
    xText: $("#xText"),
    potText: $("#potText"),
    miniStep: $("#miniStep"),
    miniX: $("#miniX"),
    msg: $("#msg"),

    startBtn: $("#startBtn"),
    cashoutBtn: $("#cashoutBtn"),
    resetBtn: $("#resetBtn"),

    zones: $("#zones"),
    hands: $("#hands"),
    ball: $("#ball"),
  };

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function fmtRub(n) { return `${Math.round(n)} ₽`; }
  function fmtX(x) { return `x${x.toFixed(2)}`; }

  // crypto RNG
  function rngInt(maxExclusive) {
    const u = new Uint32Array(1);
    crypto.getRandomValues(u);
    return u[0] % maxExclusive;
  }
  function rngFloat01() {
    const u = new Uint32Array(1);
    crypto.getRandomValues(u);
    return u[0] / 0xFFFFFFFF;
  }

  // ===== Sounds (tiny) =====
  let soundOn = true;
  let audioCtx = null;

  function getAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function beep(type) {
    if (!soundOn) return;
    const ctx = getAudio();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";

    // types: "start", "goal", "save", "cash"
    const now = ctx.currentTime;
    const seq = {
      start: [520, 740],
      goal: [660, 880, 990],
      save: [180, 140],
      cash: [520, 660, 520]
    }[type] || [440];

    o.connect(g);
    g.connect(ctx.destination);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.12, now + 0.01);

    let t = now;
    seq.forEach((f, i) => {
      o.frequency.setValueAtTime(f, t);
      t += 0.08;
    });

    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);

    o.start(now);
    o.stop(t + 0.12);
  }

  // ===== Multipliers (fixed ladders) =====
  const LADDER = {
    easy: [1.25, 1.55, 1.95, 2.50, 3.30, 4.40, 6.20, 9.10, 14.00, 22.50, 38.00, 70.00],
    hard: [1.35, 1.72, 2.20, 2.85, 3.75, 5.00, 7.20, 10.60, 16.50, 26.00, 45.00, 85.00],
  };

  // ===== State =====
  let wallet = loadWallet();
  let difficulty = "easy"; // easy|hard

  let inSeries = false;
  let bet = 100;

  let step = 0;      // goals in a row
  let currentX = 1;  // x1.00 base, after first goal use ladder[0]
  let seriesStake = 0; // bet value locked at start

  let busy = false;   // animating shot
  let roamingTimer = null;

  // hands coverage: row 0..2, col 0..3 covering col and col+1
  let cover = { r: 1, c: 2 };

  // ===== Build zones =====
  const ZROWS = 3, ZCOLS = 5;

  function buildZones() {
    ui.zones.innerHTML = "";
    for (let r = 0; r < ZROWS; r++) {
      for (let c = 0; c < ZCOLS; c++) {
        const b = document.createElement("button");
        b.className = "zone";
        b.type = "button";
        b.dataset.r = String(r);
        b.dataset.c = String(c);
        b.addEventListener("click", () => onZoneClick(r, c));
        ui.zones.appendChild(b);
      }
    }
  }

  // ===== Hands positioning =====
  function measureCell() {
    // calculate exact cell size & gap from CSS grid
    const rect = ui.zones.getBoundingClientRect();
    const styles = getComputedStyle(ui.zones);
    const gap = parseFloat(styles.gap || styles.columnGap || "12") || 12;

    const innerW = rect.width - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
    const innerH = rect.height - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom);

    const cellW = (innerW - gap * (ZCOLS - 1)) / ZCOLS;
    const cellH = (innerH - gap * (ZROWS - 1)) / ZROWS;

    return { rect, gap, cellW, cellH, padL: parseFloat(styles.paddingLeft), padT: parseFloat(styles.paddingTop) };
  }

  function handsTo(rc, durationMs = 260) {
    const { rect, gap, cellW, cellH, padL, padT } = measureCell();

    // hands cover two cells horizontally: width = 2*cellW + gap
    ui.hands.style.width = `${(cellW * 2 + gap)}px`;
    ui.hands.style.height = `${cellH}px`;
    ui.hands.style.transition = `transform ${durationMs}ms cubic-bezier(.2,.9,.2,1)`;

    // position by translating inside goalFrame absolute space
    const x = padL + rc.c * (cellW + gap) + (cellW * 2 + gap) / 2;
    const y = padT + rc.r * (cellH + gap) + cellH / 2;

    // hands is absolutely positioned relative to goalFrame, but we can place relative to zones container:
    // easiest: set hands inside goalFrame but we base on zones position.
    // We'll convert zones-local (x,y) into goalFrame-local by adding zones offset.
    const zonesRect = ui.zones.getBoundingClientRect();
    const goalRect = ui.hands.parentElement.getBoundingClientRect();

    const gx = (zonesRect.left - goalRect.left) + x;
    const gy = (zonesRect.top - goalRect.top) + y;

    ui.hands.style.left = `${gx}px`;
    ui.hands.style.top = `${gy}px`;
    ui.hands.style.transform = `translate(-50%,-50%)`;
  }

  // ===== Coverage logic =====
  function pickCoverForShot(targetR, targetC) {
    // Always choose adjacent pair (c 0..3) in some row.
    // In hard mode, bias towards the target row and near target col.
    if (difficulty === "easy") {
      // mostly random
      return { r: rngInt(3), c: rngInt(4) };
    }

    // hard: 60% choose a pair that includes target cell, otherwise near it
    const p = rngFloat01();
    if (p < 0.60) {
      let c = clamp(targetC === 4 ? 3 : targetC, 0, 3);
      // if targetC is 0, pair starts 0; if 4, pair starts 3; else either targetC-1 or targetC
      if (targetC >= 1 && targetC <= 3) c = (rngInt(2) === 0) ? (targetC - 1) : targetC;
      return { r: targetR, c };
    }

    // otherwise choose close
    const r = clamp(targetR + (rngInt(3) - 1), 0, 2);
    let cBase = clamp(targetC + (rngInt(3) - 1), 0, 4);
    let c = clamp(cBase === 4 ? 3 : cBase, 0, 3);
    return { r, c };
  }

  function isCovered(targetR, targetC, cov) {
    if (targetR !== cov.r) return false;
    return targetC === cov.c || targetC === cov.c + 1;
  }

  // ===== Ball animation =====
  function ballShootTo(r, c) {
    const { rect, gap, cellW, cellH, padL, padT } = measureCell();

    const zonesRect = ui.zones.getBoundingClientRect();
    const goalRect = ui.ball.parentElement.getBoundingClientRect();

    // target center in zones local
    const tx = padL + c * (cellW + gap) + cellW / 2;
    const ty = padT + r * (cellH + gap) + cellH / 2;

    // convert to goalFrame local
    const gx = (zonesRect.left - goalRect.left) + tx;
    const gy = (zonesRect.top - goalRect.top) + ty;

    // start at bottom center (ball's current via CSS)
    ui.ball.style.opacity = "1";
    ui.ball.style.transition = "none";
    ui.ball.style.transform = `translate(-50%,0)`;

    // force reflow
    void ui.ball.offsetWidth;

    // animate to target
    ui.ball.style.transition = "transform 420ms cubic-bezier(.2,.9,.2,1), opacity 220ms ease";
    // translate from center-bottom to (gx,gy) relative to ball anchor left:50% bottom:26px
    const startX = goalRect.width / 2;
    const startY = goalRect.height - 26 - 22; // bottom - radius
    const dx = gx - startX;
    const dy = gy - startY;

    ui.ball.style.transform = `translate(calc(-50% + ${dx}px), ${dy}px)`;

    // fade after
    setTimeout(() => {
      ui.ball.style.opacity = "0";
    }, 520);
  }

  // ===== UI ladder =====
  function renderLadder() {
    const arr = LADDER[difficulty];
    ui.ladder.innerHTML = "";
    arr.forEach((x, i) => {
      const d = document.createElement("div");
      d.className = "stepBox" + (step === i + 1 ? " active" : "");
      d.innerHTML = `<div class="sTitle">Шаг ${i + 1}</div><div class="sX">${fmtX(x)}</div>`;
      ui.ladder.appendChild(d);
    });
  }

  function updateUI() {
    ui.balance.textContent = fmtRub(wallet);
    ui.infoDiff.textContent = (difficulty === "easy") ? "Лёгкий" : "Сложный";

    bet = parseBet(ui.betInput.value);
    ui.betInput.value = String(bet);
    ui.infoBet.textContent = fmtRub(bet);

    ui.stepText.textContent = String(step);
    ui.miniStep.textContent = String(step);

    ui.xText.textContent = fmtX(currentX);
    ui.miniX.textContent = fmtX(currentX);

    const potential = inSeries ? Math.round(seriesStake * currentX) : 0;
    ui.potText.textContent = fmtRub(potential);

    ui.cashoutBtn.disabled = !(inSeries && step >= 1 && !busy);
    ui.startBtn.disabled = (inSeries || busy);

    ui.infoCash.textContent = (inSeries && step >= 1) ? fmtRub(potential) : "—";

    renderLadder();

    // zone enable
    $$(".zone").forEach(z => {
      z.classList.toggle("disabled", !inSeries || busy);
      if (!inSeries) {
        z.classList.remove("hitGood", "hitBad");
      }
    });
  }

  function parseBet(v) {
    const n = Math.floor(Number(String(v).replace(/[^\d]/g, "")) || 0);
    return clamp(n, 10, 999999);
  }

  function setMsg(t) { ui.msg.textContent = t; }

  // ===== Series flow =====
  function startSeries() {
    if (inSeries || busy) return;

    bet = parseBet(ui.betInput.value);
    if (bet <= 0) return;

    if (wallet < bet) {
      setMsg("Недостаточно баланса для ставки.");
      beep("save");
      return;
    }

    // deduct once
    wallet -= bet;
    saveWallet(wallet);

    inSeries = true;
    seriesStake = bet;
    step = 0;
    currentX = 1.00;

    setMsg("Серия началась. Выбери зону удара.");
    beep("start");

    clearHits();
    startRoaming();

    updateUI();
  }

  function clearHits() {
    $$(".zone").forEach(z => z.classList.remove("hitGood", "hitBad"));
  }

  function endSeriesLose() {
    inSeries = false;
    busy = false;
    stopRoaming();

    // lose stake (already deducted)
    seriesStake = 0;
    step = 0;
    currentX = 1.00;

    setMsg("Сейв! Ставка сгорела. Нажми «Ставка» чтобы начать снова.");
    updateUI();
  }

  function cashout() {
    if (!inSeries || busy || step < 1) return;

    const win = Math.round(seriesStake * currentX);
    wallet += win;
    saveWallet(wallet);

    inSeries = false;
    busy = false;
    stopRoaming();

    seriesStake = 0;
    step = 0;
    currentX = 1.00;

    beep("cash");
    setMsg(`Кэшаут: +${fmtRub(win)}. Можно начинать новую серию.`);
    updateUI();
  }

  function reset() {
    // if series started but no goal yet, refund stake (friendly)
    if (inSeries && step === 0 && !busy) {
      wallet += seriesStake;
      saveWallet(wallet);
      setMsg(`Сброс: ставка ${fmtRub(seriesStake)} возвращена.`);
    } else {
      setMsg("Сброс.");
    }

    inSeries = false;
    busy = false;
    stopRoaming();

    seriesStake = 0;
    step = 0;
    currentX = 1.00;

    clearHits();
    updateUI();
  }

  // ===== Roaming hands (stay inside goal) =====
  function startRoaming() {
    stopRoaming();

    // place immediately
    cover = { r: rngInt(3), c: rngInt(4) };
    handsTo(cover, 220);

    roamingTimer = setInterval(() => {
      if (!inSeries || busy) return;
      // random move
      cover = { r: rngInt(3), c: rngInt(4) };
      handsTo(cover, (difficulty === "hard") ? 220 : 280);
    }, (difficulty === "hard") ? 520 : 650);
  }

  function stopRoaming() {
    if (roamingTimer) clearInterval(roamingTimer);
    roamingTimer = null;
  }

  // ===== Shot handling =====
  async function onZoneClick(r, c) {
    if (!inSeries || busy) return;

    busy = true;
    updateUI();

    // choose cover for this shot and animate hands there
    stopRoaming();
    const cov = pickCoverForShot(r, c);

    // show shot animation: ball moves
    ballShootTo(r, c);

    // move hands quickly
    cover = cov;
    handsTo(cover, (difficulty === "hard") ? 190 : 230);

    // wait until hands movement mostly done (sync with ball)
    await wait((difficulty === "hard") ? 210 : 250);

    const saved = isCovered(r, c, cover);

    // mark only briefly (then clear) — user asked no “след” оставлять
    const z = findZone(r, c);
    if (z) z.classList.add(saved ? "hitBad" : "hitGood");

    await wait(260);
    if (z) z.classList.remove("hitBad", "hitGood");

    if (saved) {
      beep("save");
      endSeriesLose();
      return;
    }

    // goal
    beep("goal");
    step += 1;
    const ladderArr = LADDER[difficulty];
    currentX = ladderArr[Math.min(step - 1, ladderArr.length - 1)];

    if (step >= ladderArr.length) {
      // auto cashout
      const win = Math.round(seriesStake * currentX);
      wallet += win;
      saveWallet(wallet);

      inSeries = false;
      busy = false;
      seriesStake = 0;
      step = 0;
      currentX = 1.00;

      setMsg(`Максимальный шаг — авто-кэшаут: +${fmtRub(win)}.`);
      beep("cash");
      updateUI();
      return;
    }

    setMsg(`Гол! Шаг ${step}. Можно продолжать или нажать «Кэшаут».`);
    busy = false;

    // resume roaming
    startRoaming();
    updateUI();
  }

  function findZone(r, c) {
    return ui.zones.querySelector(`.zone[data-r="${r}"][data-c="${c}"]`);
  }

  function wait(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  // ===== Events =====
  function setDifficulty(next) {
    if (busy) return;
    difficulty = next;

    ui.diffEasy.classList.toggle("active", difficulty === "easy");
    ui.diffHard.classList.toggle("active", difficulty === "hard");

    // if series running, just change roaming speed (logic keeps same)
    if (inSeries) startRoaming();

    updateUI();
  }

  function toggleSound() {
    soundOn = !soundOn;
    ui.soundText.textContent = soundOn ? "Звук on" : "Звук off";
    ui.soundDot.classList.toggle("off", !soundOn);
    if (soundOn) beep("start");
  }

  function loadWallet() {
    const v = Number(localStorage.getItem(WALLET_KEY));
    return Number.isFinite(v) ? v : 1000;
  }
  function saveWallet(v) {
    localStorage.setItem(WALLET_KEY, String(Math.max(0, Math.round(v))));
    wallet = Math.max(0, Math.round(v));
  }

  // ===== Init =====
  function init() {
    buildZones();

    // set initial hands position after layout
    requestAnimationFrame(() => {
      cover = { r: 1, c: 2 };
      handsTo(cover, 0);
    });

    // sounds default on
    ui.soundText.textContent = "Звук on";
    ui.soundDot.classList.remove("off");

    ui.bonusBtn.addEventListener("click", () => {
      wallet += 1000;
      saveWallet(wallet);
      setMsg("+1000 ₽ начислено.");
      updateUI();
      beep("cash");
    });

    ui.soundBtn.addEventListener("click", toggleSound);

    ui.betMinus.addEventListener("click", () => {
      if (inSeries || busy) return;
      const n = parseBet(ui.betInput.value) - 10;
      ui.betInput.value = String(clamp(n, 10, 999999));
      updateUI();
    });

    ui.betPlus.addEventListener("click", () => {
      if (inSeries || busy) return;
      const n = parseBet(ui.betInput.value) + 10;
      ui.betInput.value = String(clamp(n, 10, 999999));
      updateUI();
    });

    ui.betMax.addEventListener("click", () => {
      if (inSeries || busy) return;
      ui.betInput.value = String(Math.max(10, wallet));
      updateUI();
    });

    ui.betInput.addEventListener("input", () => {
      if (inSeries || busy) return;
      updateUI();
    });

    ui.chips.forEach(btn => {
      btn.addEventListener("click", () => {
        if (inSeries || busy) return;
        ui.betInput.value = String(parseBet(btn.dataset.chip));
        updateUI();
      });
    });

    ui.diffEasy.addEventListener("click", () => setDifficulty("easy"));
    ui.diffHard.addEventListener("click", () => setDifficulty("hard"));

    ui.startBtn.addEventListener("click", startSeries);
    ui.cashoutBtn.addEventListener("click", cashout);
    ui.resetBtn.addEventListener("click", reset);

    window.addEventListener("resize", () => {
      // keep hands inside after resize
      if (inSeries || busy) handsTo(cover, 0);
      else handsTo(cover, 0);
    });

    // initial
    setDifficulty("easy");
    updateUI();
  }

  init();
})();
