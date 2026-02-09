/* =========================
   Penalty — app.js (v1)
   15 zones (5x3), ball trajectory, gloves move, series/cashout
   Works on GitHub Pages + localStorage
========================= */

(() => {
  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (n) => `${Math.round(n)} ₽`;

  // ---------- storage ----------
  const LS_BAL = "penalty_balance_v1";
  const LS_SND = "penalty_sound_v1";
  const LS_MULT = "penalty_mult_v1";
  const LS_SER = "penalty_series_v1";

  // ---------- DOM (ids expected; has fallbacks) ----------
  const el = {
    balance: $("#balance") || $("#balanceText") || $("[data-balance]"),
    soundBtn: $("#soundBtn") || $("#soundToggle") || $("[data-sound]"),
    betInput: $("#betInput") || $("#stakeInput") || $("#bet"),
    betMinus: $("#betMinus") || $("#stakeMinus"),
    betPlus: $("#betPlus") || $("#stakePlus"),
    chipBtns: $$("[data-chip]"),
    halfBtn: $("#halfBtn") || $("[data-half]"),
    dblBtn: $("#dblBtn") || $("[data-double]"),
    betBtn: $("#btnBet") || $("#betBtn") || $("[data-bet]"),
    cashoutBtn: $("#btnCashout") || $("#cashoutBtn") || $("[data-cashout]"),
    resetBtn: $("#btnReset") || $("#resetBtn") || $("[data-reset]"),

    multBtns: $$("[data-mult]"),
    seriesToggle: $("#seriesToggle") || $("#series") || $("[data-series]"),

    status: $("#statusText") || $("#status") || $("[data-status]"),
    last: $("#lastText") || $("#last") || $("[data-last]"),
    step: $("#stepText") || $("#step") || $("[data-step]"),
    xText: $("#xText") || $("#x") || $("[data-x]"),
    potential: $("#potentialText") || $("#potential") || $("[data-potential]"),

    goalWrap: $(".goalwrap") || $("#goalwrap") || $(".stage"),
    targets: $(".targets") || $("#targets"),
    ball: $(".ball") || $("#ball"),
    keeper: $(".keeper") || $("#keeper"),
    gloveL: $(".leftglove") || $("#gloveL"),
    gloveR: $(".rightglove") || $("#gloveR"),

    flash: $(".flash") || $("#flash"),
    flashTitle: $(".flash-title") || $("#flashTitle"),
    flashSub: $(".flash-sub") || $("#flashSub"),
  };

  // ---------- create targets if missing ----------
  function ensureTargets() {
    if (!el.goalWrap) return;
    if (!el.targets) {
      const t = document.createElement("div");
      t.className = "targets";
      el.goalWrap.appendChild(t);
      el.targets = t;
    }
    if ($$(".zone", el.targets).length !== 15) {
      el.targets.innerHTML = "";
      for (let i = 0; i < 15; i++) {
        const z = document.createElement("div");
        z.className = "zone";
        z.dataset.zone = String(i);
        z.title = `Зона ${i + 1}`;
        el.targets.appendChild(z);
      }
    }
  }

  ensureTargets();

  // ---------- state ----------
  const MULTS_DEFAULT = [1.76, 3.30, 7.08, 15.17, 45.52];

  const MATCH_PROB_BY_MULT = {
    1.76: 0.35,
    3.30: 0.25,
    7.08: 0.18,
    15.17: 0.12,
    45.52: 0.07,
  };

  const state = {
    balance: 1000,
    sound: true,

    stake: 100,
    mult: 1.76,
    series: false,

    inPlay: false,        // round started (stake deducted)
    canShoot: false,      // waiting for zone click
    lockedStake: 0,
    streak: 0,            // goals in current round
    step: 0,              // shots taken in current round

    chosenZone: null,
    animating: false,
  };

  // ---------- init from LS ----------
  const balLS = Number(localStorage.getItem(LS_BAL));
  if (Number.isFinite(balLS) && balLS >= 0) state.balance = balLS;

  const sndLS = localStorage.getItem(LS_SND);
  if (sndLS === "0" || sndLS === "1") state.sound = sndLS === "1";

  const multLS = Number(localStorage.getItem(LS_MULT));
  if (Number.isFinite(multLS) && multLS > 1) state.mult = multLS;

  const serLS = localStorage.getItem(LS_SER);
  if (serLS === "0" || serLS === "1") state.series = serLS === "1";

  // ---------- audio (simple webaudio beeps) ----------
  let audioCtx = null;
  function beep(freq, dur = 0.08, type = "sine", gain = 0.06) {
    if (!state.sound) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
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
    } catch {}
  }
  const sfx = {
    click: () => beep(520, 0.05, "triangle", 0.05),
    kick: () => beep(180, 0.10, "sine", 0.08),
    goal: () => { beep(740, 0.08, "square", 0.06); setTimeout(() => beep(980, 0.10, "square", 0.05), 80); },
    save: () => { beep(220, 0.10, "sawtooth", 0.07); setTimeout(() => beep(140, 0.10, "sawtooth", 0.05), 90); },
    cashout: () => { beep(600, 0.07, "triangle", 0.05); setTimeout(() => beep(820, 0.12, "triangle", 0.05), 70); },
  };

  // ---------- UI update ----------
  function setText(node, text) {
    if (!node) return;
    node.textContent = text;
  }

  function setSoundUI() {
    if (!el.soundBtn) return;
    const led = $(".led", el.soundBtn) || $(".led");
    if (led) led.style.background = state.sound ? "#3cff77" : "#ff4d4d";
    el.soundBtn.classList.toggle("muted", !state.sound);
    // if the button has text:
    const txt = el.soundBtn.querySelector(".txt");
    if (txt) txt.textContent = state.sound ? "Звук: on" : "Звук: off";
  }

  function getPotential() {
    if (!state.inPlay) return 0;
    if (!state.series) {
      // single-shot mode: potential after successful shot
      return state.lockedStake * state.mult;
    }
    // series: grows per goal
    // (геометрия, но мы держим умеренно тем, что вероятность сейва растёт с низкими множителями)
    return state.lockedStake * Math.pow(state.mult, Math.max(1, state.streak));
  }

  function updateUI() {
    // balance
    if (el.balance) setText(el.balance, fmt(state.balance));

    // bet input
    if (el.betInput) el.betInput.value = String(state.stake);

    // series toggle
    if (el.seriesToggle && "checked" in el.seriesToggle) el.seriesToggle.checked = state.series;

    // x & step
    setText(el.step, String(state.step));
    setText(el.xText, `x${state.mult.toFixed(2)}`);

    // potential
    const pot = state.inPlay ? getPotential() : 0;
    setText(el.potential, state.inPlay ? fmt(pot) : "—");

    // status
    if (!state.inPlay) {
      setText(el.status, "Ожидание");
      setText(el.last, "—");
    } else if (state.canShoot) {
      setText(el.status, "Выбери точку удара");
    } else if (state.animating) {
      setText(el.status, "Удар...");
    }

    // buttons enable
    if (el.betBtn) el.betBtn.disabled = state.inPlay; // ставка только до старта
    if (el.cashoutBtn) el.cashoutBtn.disabled = !(state.inPlay && state.series && state.streak > 0 && !state.animating);
    if (el.resetBtn) el.resetBtn.disabled = false;

    // multiplier buttons active
    if (el.multBtns?.length) {
      el.multBtns.forEach(b => {
        const m = Number(b.dataset.mult);
        b.classList.toggle("active", Math.abs(m - state.mult) < 1e-9);
      });
    }

    // zones active state
    if (el.targets) {
      $$(".zone", el.targets).forEach(z => {
        z.classList.toggle("disabled", !state.canShoot || state.animating);
      });
    }

    setSoundUI();
  }

  // ---------- geometry ----------
  function zoneCenter(zoneEl) {
    const wrapRect = el.goalWrap.getBoundingClientRect();
    const zr = zoneEl.getBoundingClientRect();
    return {
      x: (zr.left + zr.width / 2) - wrapRect.left,
      y: (zr.top + zr.height / 2) - wrapRect.top,
    };
  }

  function ballHome() {
    // bottom center relative to goalwrap
    const wrapRect = el.goalWrap.getBoundingClientRect();
    const bRect = el.ball.getBoundingClientRect();
    const x = wrapRect.width / 2 - bRect.width / 2;
    const y = wrapRect.height * 0.82 - bRect.height / 2;
    return { x, y };
  }

  function placeBallHome() {
    if (!el.ball || !el.goalWrap) return;
    const home = ballHome();
    el.ball.style.transform = `translate(${home.x}px, ${home.y}px)`;
  }

  function keeperHome() {
    if (!el.keeper || !el.goalWrap) return { x: 0, y: 0 };
    // center keeper above
    return { x: 0, y: 0 };
  }

  function placeKeeperHome() {
    if (!el.keeper) return;
    el.keeper.style.transform = `translate(-50%, 0px)`;
  }

  // ---------- flash (no "OK", never blocks clicks) ----------
  let flashTimer = null;
  function flash(title, sub, ok = true) {
    if (!el.flash) return;
    if (flashTimer) clearTimeout(flashTimer);

    el.flash.style.display = "flex";
    el.flash.style.pointerEvents = "none"; // IMPORTANT: never blocks
    if (el.flashTitle) el.flashTitle.textContent = title;
    if (el.flashSub) el.flashSub.textContent = sub || "";

    flashTimer = setTimeout(() => {
      el.flash.style.display = "none";
    }, 900);
  }

  // ---------- game logic ----------
  function setStake(v) {
    if (state.inPlay) return; // lock while in round
    state.stake = clamp(Math.round(v), 1, 1_000_000);
    updateUI();
  }

  function setMult(m) {
    if (state.inPlay) return;
    state.mult = m;
    localStorage.setItem(LS_MULT, String(m));
    updateUI();
  }

  function setSeries(on) {
    state.series = !!on;
    localStorage.setItem(LS_SER, state.series ? "1" : "0");
    updateUI();
  }

  function startRound() {
    if (state.inPlay) return;
    const s = state.stake;
    if (!Number.isFinite(s) || s <= 0) return;

    if (state.balance < s) {
      setText(el.status, "Недостаточно баланса");
      sfx.save();
      return;
    }

    state.balance -= s;
    localStorage.setItem(LS_BAL, String(state.balance));

    state.inPlay = true;
    state.canShoot = true;
    state.lockedStake = s;
    state.streak = 0;
    state.step = 0;
    state.chosenZone = null;

    setText(el.last, "—");
    setText(el.status, "Выбери точку удара");

    placeBallHome();
    placeKeeperHome();
    updateUI();
    sfx.click();
  }

  function endRoundLose() {
    state.inPlay = false;
    state.canShoot = false;
    state.animating = false;
    state.lockedStake = 0;
    state.streak = 0;
    state.step = 0;
    state.chosenZone = null;
    updateUI();
  }

  function cashout() {
    if (!(state.inPlay && state.series && state.streak > 0) || state.animating) return;
    const win = getPotential();
    state.balance += win;
    localStorage.setItem(LS_BAL, String(state.balance));
    setText(el.last, `Кэшаут ${fmt(win)}`);
    setText(el.status, "Кэшаут");
    flash("КЭШАУТ", `+${fmt(win)}`);
    sfx.cashout();
    // finish round
    state.inPlay = false;
    state.canShoot = false;
    state.animating = false;
    state.lockedStake = 0;
    state.streak = 0;
    state.step = 0;
    state.chosenZone = null;
    placeBallHome();
    placeKeeperHome();
    updateUI();
  }

  function resetAll() {
    // doesn't refund stake; it's just UI reset
    state.inPlay = false;
    state.canShoot = false;
    state.animating = false;
    state.lockedStake = 0;
    state.streak = 0;
    state.step = 0;
    state.chosenZone = null;
    setText(el.status, "Ожидание");
    setText(el.last, "—");
    placeBallHome();
    placeKeeperHome();
    updateUI();
    sfx.click();
  }

  // decide keeper zone & outcome
  function pickKeeperZone(mult) {
    const pMatch = MATCH_PROB_BY_MULT[mult] ?? 0.18;
    // If match, keeper guesses the same zone; else random different zone
    if (Math.random() < pMatch && state.chosenZone != null) return state.chosenZone;

    // choose random zone different
    const r = Math.floor(Math.random() * 15);
    if (state.chosenZone == null) return r;
    return r === state.chosenZone ? (r + 1) % 15 : r;
  }

  function moveKeeperToZone(zoneIndex) {
    if (!el.keeper || !el.targets) return;
    const zones = $$(".zone", el.targets);
    const z = zones[zoneIndex];
    if (!z) return;

    // move keeper horizontally/vertically slightly based on zone position
    const col = zoneIndex % 5;     // 0..4
    const row = Math.floor(zoneIndex / 5); // 0..2

    // tuning offsets (unique but close to stake)
    const x = (col - 2) * 34;      // -68..+68
    const y = (row - 1) * 18;      // -18..+18

    el.keeper.animate(
      [
        { transform: `translate(-50%, 0px)` },
        { transform: `translate(calc(-50% + ${x}px), ${y}px)` }
      ],
      { duration: 260, easing: "cubic-bezier(.2,.9,.2,1)", fill: "forwards" }
    );
  }

  function animateBallTo(zoneEl, onDone) {
    if (!el.ball || !el.goalWrap) return;
    const center = zoneCenter(zoneEl);
    const wrapRect = el.goalWrap.getBoundingClientRect();
    const bRect = el.ball.getBoundingClientRect();

    const home = ballHome();
    const targetX = center.x - bRect.width / 2;
    const targetY = center.y - bRect.height / 2;

    // arc control point (upwards a bit)
    const midX = (home.x + targetX) / 2;
    const midY = Math.min(home.y, targetY) - wrapRect.height * 0.18;

    // use WAAPI keyframes for smooth arc-like feel
    const anim = el.ball.animate(
      [
        { transform: `translate(${home.x}px, ${home.y}px) scale(1)` },
        { transform: `translate(${midX}px, ${midY}px) scale(0.92)` },
        { transform: `translate(${targetX}px, ${targetY}px) scale(0.86)` }
      ],
      { duration: 520, easing: "cubic-bezier(.2,.85,.2,1)", fill: "forwards" }
    );

    anim.onfinish = () => onDone?.({ targetX, targetY, center });
  }

  function animateBallBack() {
    if (!el.ball) return;
    const home = ballHome();
    el.ball.animate(
      [
        { transform: el.ball.style.transform || `translate(${home.x}px, ${home.y}px)` },
        { transform: `translate(${home.x}px, ${home.y}px) scale(1)` }
      ],
      { duration: 280, easing: "cubic-bezier(.2,.9,.2,1)", fill: "forwards" }
    );
  }

  async function shoot(zoneIndex) {
    if (!state.inPlay || !state.canShoot || state.animating) return;

    const zones = $$(".zone", el.targets);
    const zoneEl = zones[zoneIndex];
    if (!zoneEl) return;

    state.chosenZone = zoneIndex;
    state.canShoot = false;
    state.animating = true;
    state.step += 1;

    setText(el.status, "Удар...");
    updateUI();
    sfx.kick();

    // keeper choice & move
    const keeperZone = pickKeeperZone(state.mult);
    moveKeeperToZone(keeperZone);

    // ball anim
    animateBallTo(zoneEl, () => {
      const saved = keeperZone === zoneIndex;

      if (saved) {
        // SAVE
        sfx.save();
        setText(el.last, "Сейв");
        setText(el.status, "Поражение");
        flash("СЕЙВ", "Ставка сгорела");
        // end round (loss)
        setTimeout(() => {
          animateBallBack();
          placeKeeperHome();
          endRoundLose();
        }, 450);
        return;
      }

      // GOAL
      sfx.goal();
      state.streak += 1;
      setText(el.last, "Гол");

      if (!state.series) {
        // single-shot payout immediately
        const win = state.lockedStake * state.mult;
        state.balance += win;
        localStorage.setItem(LS_BAL, String(state.balance));
        flash("ГОЛ!", `+${fmt(win)}`);
        setText(el.status, "Выигрыш");
        state.inPlay = false;
        state.lockedStake = 0;
        state.streak = 0;
        state.step = 0;
        state.chosenZone = null;

        setTimeout(() => {
          animateBallBack();
          placeKeeperHome();
          state.animating = false;
          state.canShoot = false;
          updateUI();
        }, 520);

        return;
      }

      // series mode: continue until save or cashout
      const pot = getPotential();
      flash("ГОЛ!", `Потенциал: ${fmt(pot)}`);
      setText(el.status, "Гол! Можно продолжать или кэшаут");

      setTimeout(() => {
        animateBallBack();
        // keep keeper where it moved briefly, then reset
        setTimeout(() => placeKeeperHome(), 180);
        state.animating = false;
        state.canShoot = true; // allow next shot
        updateUI();
      }, 520);
    });
  }

  // ---------- events ----------
  function bindEvents() {
    // sound
    if (el.soundBtn) {
      el.soundBtn.addEventListener("click", () => {
        state.sound = !state.sound;
        localStorage.setItem(LS_SND, state.sound ? "1" : "0");
        sfx.click();
        updateUI();
      });
    }

    // stake +/- input
    if (el.betMinus) el.betMinus.addEventListener("click", () => (sfx.click(), setStake(state.stake - 10)));
    if (el.betPlus) el.betPlus.addEventListener("click", () => (sfx.click(), setStake(state.stake + 10)));

    if (el.betInput) {
      el.betInput.addEventListener("input", () => {
        const v = Number(el.betInput.value);
        if (Number.isFinite(v)) setStake(v);
      });
    }

    // chips
    el.chipBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        sfx.click();
        const v = Number(btn.dataset.chip);
        if (Number.isFinite(v)) setStake(v);
      });
    });

    // half/double
    if (el.halfBtn) el.halfBtn.addEventListener("click", () => (sfx.click(), setStake(Math.floor(state.stake / 2))));
    if (el.dblBtn) el.dblBtn.addEventListener("click", () => (sfx.click(), setStake(state.stake * 2)));

    // multipliers
    if (el.multBtns?.length) {
      el.multBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          sfx.click();
          const m = Number(btn.dataset.mult);
          if (Number.isFinite(m)) setMult(m);
        });
      });
    } else {
      // fallback: if no buttons exist, keep defaults
      state.mult = state.mult || 1.76;
    }

    // series
    if (el.seriesToggle) {
      el.seriesToggle.addEventListener("change", () => {
        sfx.click();
        setSeries(!!el.seriesToggle.checked);
      });
    }

    // bet / cashout / reset
    if (el.betBtn) el.betBtn.addEventListener("click", startRound);
    if (el.cashoutBtn) el.cashoutBtn.addEventListener("click", cashout);
    if (el.resetBtn) el.resetBtn.addEventListener("click", resetAll);

    // zones click
    if (el.targets) {
      el.targets.addEventListener("click", (e) => {
        const z = e.target.closest(".zone");
        if (!z) return;
        const idx = Number(z.dataset.zone);
        if (!Number.isFinite(idx)) return;
        shoot(idx);
      });
    }

    // resize to place ball correctly
    window.addEventListener("resize", () => {
      placeBallHome();
      placeKeeperHome();
    });

    // first place
    requestAnimationFrame(() => {
      placeBallHome();
      placeKeeperHome();
    });
  }

  // ---------- initial setup ----------
  function ensureMultiplierButtons() {
    // If multiplier buttons exist but have no dataset, try to set from text
    if (!el.multBtns?.length) return;
    el.multBtns.forEach(btn => {
      if (!btn.dataset.mult) {
        const t = (btn.textContent || "").trim().replace("x", "");
        const m = Number(t);
        if (Number.isFinite(m)) btn.dataset.mult = String(m);
      }
    });
  }

  ensureMultiplierButtons();

  // If there is a flash element, hide initially and make sure it never blocks clicks
  if (el.flash) {
    el.flash.style.display = "none";
    el.flash.style.pointerEvents = "none";
  }

  bindEvents();
  updateUI();

})();
