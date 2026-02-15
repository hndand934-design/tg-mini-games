(() => {
  // =========================
  //  Rocket Crash FINAL (stable)
  // =========================

  // ---- Telegram WebApp ----
  const tg = window.Telegram?.WebApp;
  try {
    tg?.ready();
    tg?.expand();
  } catch {}

  // ---- Helpers ----
  const qs = (sel) => document.querySelector(sel);

  // safe get element by multiple possible IDs/selectors
  function pickEl(candidates) {
    for (const c of candidates) {
      const el = c.startsWith("#") || c.startsWith(".") || c.includes("[") ? qs(c) : document.getElementById(c);
      if (el) return el;
    }
    return null;
  }

  function setText(el, txt) { if (el) el.textContent = String(txt); }
  function setDisabled(el, v) { if (el) el.disabled = !!v; }
  function addClass(el, c) { if (el) el.classList.add(c); }
  function remClass(el, c) { if (el) el.classList.remove(c); }

  function randFloat() {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 2 ** 32;
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function fmt2(x) { return (Math.round(x * 100) / 100).toFixed(2); }

  // ---- Wallet ----
  const WALLET_KEY = "mini_wallet_crash_v1";
  function loadWallet() {
    try {
      const w = JSON.parse(localStorage.getItem(WALLET_KEY) || "null");
      if (w && typeof w.coins === "number") return w;
    } catch {}
    return { coins: 1000 };
  }
  function saveWallet(w) {
    localStorage.setItem(WALLET_KEY, JSON.stringify(w));
  }
  let wallet = loadWallet();

  function setCoins(v) {
    wallet.coins = Math.max(0, Math.floor(v));
    saveWallet(wallet);
    renderTop();
  }
  function addCoins(d) { setCoins(wallet.coins + d); }

  // ---- Sound ----
  let soundOn = true;
  let audioCtx = null;
  function getCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    return audioCtx;
  }
  function beep(freq = 520, ms = 60, vol = 0.03, type = "sine") {
    if (!soundOn) return;
    const ctx = getCtx();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    g.connect(ctx.destination);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.start(t);
    o.stop(t + ms / 1000);
  }
  function winSound() {
    beep(740, 70, 0.03);
    setTimeout(() => beep(940, 70, 0.03), 80);
  }
  function crashSound() {
    beep(180, 120, 0.05, "sawtooth");
    setTimeout(() => beep(120, 160, 0.04, "square"), 70);
  }

  // ---- UI (ищем по нескольким ID/селектором) ----
  const balanceEl = pickEl(["balance", "bal", "#balance", "[data-balance]"]);
  const subTitleEl = pickEl(["subTitle", "#subTitle"]);

  const multVal = pickEl(["multVal", "mult", "#multVal", "[data-mult]"]);
  const multHint = pickEl(["multHint", "#multHint"]);
  const statusVal = pickEl(["statusVal", "status", "#statusVal", "[data-status]"]);
  const statusHint = pickEl(["statusHint", "#statusHint"]);

  const betStatVal = pickEl(["betStatVal", "#betStatVal"]);
  const betHint = pickEl(["betHint", "#betHint"]);

  const overlayX = pickEl(["overlayX", "#overlayX"]);
  const overlayText = pickEl(["overlayText", "#overlayText"]);

  const soundBadge = pickEl(["soundBadge", "soundBtn", "#soundBadge", "#soundBtn"]);
  const soundText = pickEl(["soundText", "#soundText"]);
  const bonusBtn = pickEl(["bonusBtn", "#bonusBtn"]);

  const betInput = pickEl(["betInput", "bet", "#betInput", "input[type='number']"]);
  const betMinus = pickEl(["betMinus", "#betMinus"]);
  const betPlus = pickEl(["betPlus", "#betPlus"]);
  const chipBtns = Array.from(document.querySelectorAll(".chip,[data-bet]"));

  const joinBtn = pickEl(["joinBtn", "enterBtn", "btnJoin", "#joinBtn", "#enterBtn", "#btnJoin"]);
  const cashBtn = pickEl(["cashBtn", "takeBtn", "btnCash", "#cashBtn", "#takeBtn", "#btnCash"]);

  const canvas = pickEl(["graph", "#graph", "canvas"]);

  // IMPORTANT: если canvas не найден — режим всё равно работает, просто без графика
  const ctx2d = canvas ? canvas.getContext("2d", { alpha: false }) : null;

  // ---- Debug info (чтобы сразу понять, если что-то не найдено) ----
  const required = [
    ["joinBtn", joinBtn],
    ["cashBtn", cashBtn],
    ["betInput", betInput],
    ["balanceEl", balanceEl],
  ];
  for (const [name, el] of required) {
    if (!el) console.warn(`[Crash] element not found: ${name}`);
  }

  // ---- Canvas sizing ----
  function resizeCanvas() {
    if (!canvas || !ctx2d) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const w = Math.floor(rect.width * dpr);
    const h = Math.floor(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  window.addEventListener("resize", () => { resizeCanvas(); draw(); });

  // ---- Game state ----
  const STATE = { WAIT: "wait", FLY: "fly", CRASH: "crash" };
  let state = STATE.WAIT;

  let waitDuration = 4; // секунды
  let waitLeft = waitDuration;

  let crashPoint = 1.0;
  let startTs = 0;
  let currentX = 1.0;

  let inRound = false;
  let playerBet = 0;
  let cashed = false;
  let cashedAt = 0;

  let pts = [];
  let raf = 0;
  let waitTimer = null;

  // ---- Crash RNG ----
  function genCrashPoint() {
    const u = Math.max(1e-12, randFloat());
    // heavy-tail, но адекватно
    const p = 1.35;
    const k = 1.55;
    const x = 1 + Math.pow(-Math.log(u), p) * k;
    return clamp(x, 1.01, 200);
  }

  // ---- Growth curve ----
  function xFromTime(t) {
    const a = 0.35;
    const b = 0.055;
    return 1 + a * t + b * t * t;
  }

  // ---- Render ----
  function renderTop() {
    setText(balanceEl, wallet.coins);
    if (subTitleEl) {
      const user = tg?.initDataUnsafe?.user;
      subTitleEl.textContent = user ? `Привет, ${user.first_name}` : "Открыто вне Telegram";
    }
  }

  function setOverlay() {
    setText(overlayX, `${fmt2(currentX)}x`);
    if (state === STATE.WAIT) setText(overlayText, inRound ? "Ты в раунде" : "Ты не в раунде");
    if (state === STATE.FLY) setText(overlayText, inRound ? "Ты в раунде" : "Ты не в раунде");
    if (state === STATE.CRASH) setText(overlayText, "Ракета улетела");
  }

  function syncButtons() {
    // join only in WAIT
    setDisabled(joinBtn, !(state === STATE.WAIT) || inRound);

    // cash only in FLY and if in round and not cashed
    setDisabled(cashBtn, !(state === STATE.FLY && inRound && !cashed));
  }

  function setState(s) {
    state = s;

    if (state === STATE.WAIT) {
      currentX = 1.0;
      setText(multVal, "x1.00");
      setText(multHint, "Ожидание — старт скоро");
      setText(statusVal, "Раунд");
      setText(statusHint, `Старт через ${waitLeft}s`);

      if (!inRound) {
        const bet = getBet();
        if (betStatVal) betStatVal.textContent = `+${bet} 🪙`;
        if (betHint) betHint.textContent = "не в раунде";
      } else {
        if (betHint) betHint.textContent = "вошёл";
      }
    }

    if (state === STATE.FLY) {
      setText(statusVal, "Полёт");
      setText(statusHint, inRound ? "Ты в раунде" : "Ты не в раунде");
      setText(multHint, "Растёт…");
      if (betHint) betHint.textContent = inRound ? "можно забрать" : "не в раунде";
    }

    if (state === STATE.CRASH) {
      setText(statusVal, "Краш");
      setText(statusHint, "Раунд завершён");
      setText(multHint, "Краш!");
      if (betHint) {
        if (!inRound) betHint.textContent = "не в раунде";
        else betHint.textContent = cashed ? `забрал x${fmt2(cashedAt)}` : "ставка сгорела";
      }
    }

    setOverlay();
    syncButtons();
    draw();
  }

  // ---- Bet ----
  function getBet() {
    let v = Math.floor(Number(betInput?.value || 0));
    if (!Number.isFinite(v) || v <= 0) v = 1;
    return v;
  }

  function setBet(v) {
    if (!betInput) return;
    v = Math.floor(Number(v) || 1);
    v = Math.max(1, v);
    v = Math.min(v, wallet.coins || 1);
    betInput.value = String(v);
    if (!inRound && betStatVal) betStatVal.textContent = `+${v} 🪙`;
  }

  function clampBet() {
    setBet(getBet());
  }

  // ---- Drawing ----
  function draw() {
    if (!canvas || !ctx2d) return;

    resizeCanvas();
    const w = canvas.width;
    const h = canvas.height;

    ctx2d.fillStyle = "#000";
    ctx2d.fillRect(0, 0, w, h);

    const padL = Math.floor(w * 0.07);
    const padR = Math.floor(w * 0.04);
    const padT = Math.floor(h * 0.10);
    const padB = Math.floor(h * 0.12);
    const pw = w - padL - padR;
    const ph = h - padT - padB;

    // grid
    ctx2d.strokeStyle = "rgba(255,255,255,.06)";
    ctx2d.lineWidth = Math.max(1, Math.floor(w * 0.0012));

    for (let i = 0; i <= 6; i++) {
      const x = padL + (pw * i) / 6;
      ctx2d.beginPath();
      ctx2d.moveTo(x, padT);
      ctx2d.lineTo(x, padT + ph);
      ctx2d.stroke();
    }
    for (let j = 0; j <= 4; j++) {
      const y = padT + (ph * j) / 4;
      ctx2d.beginPath();
      ctx2d.moveTo(padL, y);
      ctx2d.lineTo(padL + pw, y);
      ctx2d.stroke();
    }

    if (!pts.length) return;

    const last = pts[pts.length - 1];
    const maxT = Math.max(3, last.t);
    const maxX = Math.max(2, last.x);

    const X = (t) => padL + (t / maxT) * pw;
    const Y = (x) => padT + ph - ((x - 1) / (maxX - 1)) * ph;

    if (pts.length >= 2) {
      const path = new Path2D();
      path.moveTo(X(pts[0].t), Y(pts[0].x));
      for (let i = 1; i < pts.length; i++) path.lineTo(X(pts[i].t), Y(pts[i].x));

      const area = new Path2D(path);
      area.lineTo(X(last.t), padT + ph);
      area.lineTo(X(pts[0].t), padT + ph);
      area.closePath();

      const grad = ctx2d.createLinearGradient(0, padT, 0, padT + ph);
      grad.addColorStop(0, "rgba(255,90,106,.35)");
      grad.addColorStop(1, "rgba(255,90,106,.00)");
      ctx2d.fillStyle = grad;
      ctx2d.fill(area);

      ctx2d.strokeStyle = "rgba(255,120,140,.95)";
      ctx2d.lineWidth = Math.max(2, Math.floor(w * 0.004));
      ctx2d.lineCap = "round";
      ctx2d.lineJoin = "round";
      ctx2d.stroke(path);

      ctx2d.fillStyle = "rgba(255,170,190,.95)";
      ctx2d.beginPath();
      ctx2d.arc(X(last.t), Y(last.x), Math.max(3, Math.floor(w * 0.007)), 0, Math.PI * 2);
      ctx2d.fill();
    }
  }

  // ---- Round flow ----
  function clearWaitTimer() {
    if (waitTimer) {
      clearInterval(waitTimer);
      waitTimer = null;
    }
  }

  function startWait() {
    cancelAnimationFrame(raf);
    clearWaitTimer();

    pts = [];
    crashPoint = genCrashPoint();

    waitLeft = waitDuration;
    setState(STATE.WAIT);

    // countdown
    waitTimer = setInterval(() => {
      if (state !== STATE.WAIT) return;

      waitLeft -= 1;
      setText(statusHint, `Старт через ${waitLeft}s`);

      if (waitLeft <= 0) {
        clearWaitTimer();
        startFly();
      }
    }, 1000);
  }

  function startFly() {
    clearWaitTimer();
    setState(STATE.FLY);

    startTs = performance.now();
    pts = [{ t: 0, x: 1.0 }];
    currentX = 1.0;
    beep(520, 55, 0.02);

    const tick = () => {
      if (state !== STATE.FLY) return;

      const now = performance.now();
      const t = (now - startTs) / 1000;
      let x = xFromTime(t);

      if (x >= crashPoint) {
        x = crashPoint;
        currentX = x;
        pts.push({ t, x });

        setText(multVal, `x${fmt2(x)}`);
        setOverlay();
        draw();

        endCrash();
        return;
      }

      currentX = x;

      const last = pts[pts.length - 1];
      if (!last || t - last.t >= 0.05) pts.push({ t, x });

      setText(multVal, `x${fmt2(x)}`);
      setOverlay();
      syncButtons();
      draw();

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
  }

  function endCrash() {
    setState(STATE.CRASH);
    crashSound();

    // перезапуск раунда через 3 сек
    setTimeout(() => {
      inRound = false;
      playerBet = 0;
      cashed = false;
      cashedAt = 0;

      if (betStatVal) betStatVal.textContent = "—";
      if (betHint) betHint.textContent = "не в раунде";

      startWait();
    }, 3000);
  }

  // ---- Actions ----
  function joinRound() {
    if (state !== STATE.WAIT) return;
    if (inRound) return;

    const bet = getBet();
    if (bet <= 0) return alert("Ставка должна быть больше 0");
    if (bet > wallet.coins) return alert("Недостаточно монет");

    addCoins(-bet);
    inRound = true;
    playerBet = bet;
    cashed = false;
    cashedAt = 0;

    if (betStatVal) betStatVal.textContent = `+${bet} 🪙`;
    if (betHint) betHint.textContent = "вошёл";
    setOverlay();
    syncButtons();
    beep(680, 70, 0.02);
  }

  function cashout() {
    if (state !== STATE.FLY) return;
    if (!inRound || cashed) return;

    cashed = true;
    cashedAt = currentX;

    const payout = Math.floor(playerBet * cashedAt);
    addCoins(payout);

    if (betHint) betHint.textContent = `забрал x${fmt2(cashedAt)}`;
    syncButtons();
    winSound();
  }

  // ---- Bind UI ----
  function init() {
    renderTop();

    // bet input
    betInput?.addEventListener("input", clampBet);

    betMinus?.addEventListener("click", () => setBet(getBet() - 10));
    betPlus?.addEventListener("click", () => setBet(getBet() + 10));

    chipBtns.forEach((b) => {
      b.addEventListener("click", () => {
        const v = b.dataset.bet;
        if (v === "max") setBet(wallet.coins || 1);
        else setBet(Number(v));
        beep(540, 55, 0.02);
      });
    });

    joinBtn?.addEventListener("click", joinRound);
    cashBtn?.addEventListener("click", cashout);

    bonusBtn?.addEventListener("click", () => { addCoins(1000); beep(760, 70, 0.03); });

    (soundBadge || null)?.addEventListener("click", () => {
      soundOn = !soundOn;
      if (soundText) soundText.textContent = soundOn ? "Звук on" : "Звук off";
      if (!soundText && soundBadge) soundBadge.textContent = soundOn ? "Звук: on" : "Звук: off";
      beep(soundOn ? 640 : 240, 60, 0.03);
    });

    // defaults
    if (betInput && (!betInput.value || Number(betInput.value) <= 0)) betInput.value = "100";
    clampBet();

    if (betStatVal) betStatVal.textContent = "—";
    if (betHint) betHint.textContent = "не в раунде";
    setText(multVal, "x1.00");
    setOverlay();

    // START
    startWait();
  }

  init();
})();
