// Rocket Crash FINAL — app.js
// Логика: ожидание -> старт -> полёт (рост X) -> краш
// Вход в раунд только в ожидании. Кэшаут — только в полёте.
// RNG: crypto.getRandomValues. Баланс: localStorage.

(() => {
  // ---- Telegram WebApp ----
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  // ---- Helpers ----
  const $ = (id) => document.getElementById(id);

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
  function saveWallet(w) { localStorage.setItem(WALLET_KEY, JSON.stringify(w)); }

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
    g.gain.value = vol;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.stop(t + ms / 1000);
  }

  function crashSound() {
    if (!soundOn) return;
    beep(180, 120, 0.05, "sawtooth");
    setTimeout(() => beep(120, 160, 0.04, "square"), 70);
  }

  function winSound() {
    if (!soundOn) return;
    beep(720, 70, 0.03);
    setTimeout(() => beep(940, 70, 0.03), 80);
  }

  // ---- UI refs ----
  const balanceEl = $("balance");

  const multVal = $("multVal");
  const multHint = $("multHint");
  const statusVal = $("statusVal");
  const statusHint = $("statusHint");
  const betStatVal = $("betStatVal");
  const betHint = $("betHint");

  const overlayX = $("overlayX");
  const overlayText = $("overlayText");

  const soundBadge = $("soundBadge");

  const betInput = $("betInput");
  const betMinus = $("betMinus");
  const betPlus = $("betPlus");

  const joinBtn = $("joinBtn");
  const cashBtn = $("cashBtn");

  const bonusBtn = $("bonusBtn");
  const chips = document.querySelectorAll(".chip");

  const canvas = $("graph");
  const ctx2d = canvas.getContext("2d", { alpha: false });

  // ---- Layout / canvas sizing ----
  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const w = Math.floor(rect.width * dpr);
    const h = Math.floor(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  window.addEventListener("resize", () => {
    resizeCanvas();
    draw();
  });

  // ---- Game state ----
  const STATE = { WAIT: "wait", FLY: "fly", CRASH: "crash" };
  let state = STATE.WAIT;

  let roundTimer = 0;        // countdown seconds
  let waitDuration = 4;      // seconds (как на скрине)
  let crashPoint = 1.0;      // target multiplier for crash
  let startTs = 0;

  let currentX = 1.0;
  let lastTick = 0;

  // player
  let inRound = false;
  let playerBet = 0;
  let cashed = false;
  let cashedAt = 0;

  // graph points
  let pts = []; // {t, x}
  let raf = 0;

  // ---- Crash RNG curve ----
  // Игровая формула: X растёт плавно, crashPoint выбирается заранее.
  // Распределение: с "длинным хвостом", как в краше (редко большие иксы).
  function genCrashPoint() {
    // U in (0,1)
    const u = Math.max(1e-12, randFloat());
    // heavy-tail:
    // x = 1 + (-ln u) ^ p  * k
    // пойдёт: чаще 1.2-3, иногда 10+
    const p = 1.35;
    const k = 1.55;
    const x = 1 + Math.pow(-Math.log(u), p) * k;

    // чуть-чуть ограничим "безумные" значения
    return clamp(x, 1.01, 200);
  }

  // ---- X growth over time ----
  // Простая красивая кривая: X(t) = 1 + a*t + b*t^2 (быстрее со временем)
  // подбираем так, чтобы не лагало.
  function xFromTime(t) {
    const a = 0.35;
    const b = 0.055;
    return 1 + a * t + b * t * t;
  }

  function tFromX(x) {
    // приближенно решаем b t^2 + a t + (1-x)=0
    const a = 0.35, b = 0.055;
    const c = 1 - x;
    const D = a * a - 4 * b * c;
    const t = (-a + Math.sqrt(Math.max(0, D))) / (2 * b);
    return Math.max(0, t);
  }

  // ---- Render top ----
  function renderTop() {
    balanceEl.textContent = String(wallet.coins);
  }

  // ---- Bet helpers ----
  function getBet() {
    return Math.floor(Number(betInput.value) || 0);
  }
  function setBet(v) {
    v = Math.floor(v);
    if (!Number.isFinite(v)) v = 0;
    v = Math.max(1, v);
    v = Math.min(v, wallet.coins);
    betInput.value = String(v);
    // show in bet stat (until joined)
    if (!inRound) betStatVal.textContent = `+${v} 🪙`;
  }
  function clampBetUI() {
    let v = getBet();
    if (v < 1) v = 1;
    if (v > wallet.coins) v = wallet.coins;
    betInput.value = String(v);
    if (!inRound) betStatVal.textContent = `+${v} 🪙`;
  }

  // ---- UI render by state ----
  function setState(s) {
    state = s;

    if (s === STATE.WAIT) {
      cashed = false;
      cashedAt = 0;
      currentX = 1.0;
      multVal.textContent = "x1.00";
      multHint.textContent = "Ожидание — старт скоро";
      overlayX.textContent = "1.00x";
      overlayText.textContent = inRound ? "Ты в раунде" : "Ты не в раунде";

      statusVal.textContent = "Раунд";
      statusHint.textContent = `Старт через ${roundTimer}s`;

      // join only in WAIT
      joinBtn.disabled = false;
      // cash only in FLY and if in round + not cashed
      cashBtn.disabled = true;

      // bet hint
      betHint.textContent = inRound ? `вошёл` : `не в раунде`;
    }

    if (s === STATE.FLY) {
      statusVal.textContent = "Полёт";
      statusHint.textContent = inRound ? "Ты в раунде" : "Ты не в раунде";
      multHint.textContent = "Растёт…";

      joinBtn.disabled = true;
      cashBtn.disabled = !(inRound && !cashed);

      overlayText.textContent = inRound ? "Ты в раунде" : "Ты не в раунде";
      betHint.textContent = inRound ? "можно забрать" : "не в раунде";
    }

    if (s === STATE.CRASH) {
      statusVal.textContent = "Краш";
      statusHint.textContent = "Раунд завершён";
      multHint.textContent = "Краш!";
      joinBtn.disabled = true;
      cashBtn.disabled = true;

      overlayText.textContent = "Ракета улетела";
      betHint.textContent = inRound ? (cashed ? `забрал x${fmt2(cashedAt)}` : "ставка сгорела") : "не в раунде";
    }
  }

  // ---- Round control ----
  function startWait() {
    pts = [];
    resizeCanvas();

    crashPoint = genCrashPoint();

    roundTimer = waitDuration;
    setState(STATE.WAIT);

    // фиксируем ставку в UI
    if (!inRound) betStatVal.textContent = `+${getBet()} 🪙`;

    // countdown tick
    const interval = setInterval(() => {
      if (state !== STATE.WAIT) { clearInterval(interval); return; }
      roundTimer -= 1;
      statusHint.textContent = `Старт через ${roundTimer}s`;

      if (roundTimer <= 0) {
        clearInterval(interval);
        startFly();
      }
    }, 1000);
  }

  function startFly() {
    setState(STATE.FLY);

    startTs = performance.now();
    lastTick = startTs;
    pts = [{ t: 0, x: 1.0 }];

    // маленький тик
    beep(520, 60, 0.02);

    loop();
  }

  function endCrash() {
    setState(STATE.CRASH);
    crashSound();

    // если был в раунде и не кэшаутнул — проиграл
    if (inRound && !cashed) {
      // ставка уже списана при входе, ничего не возвращаем
    }

    // после 3 сек — новый WAIT и сброс входа
    setTimeout(() => {
      // сброс состояния игрока на новый раунд
      inRound = false;
      playerBet = 0;
      cashed = false;
      cashedAt = 0;

      // UI bet stat
      betStatVal.textContent = "—";
      betHint.textContent = "не в раунде";

      startWait();
    }, 3000);
  }

  // ---- Player actions ----
  function joinRound() {
    if (state !== STATE.WAIT) return;
    if (inRound) return;

    const bet = getBet();
    if (bet <= 0) return alert("Ставка должна быть больше 0");
    if (bet > wallet.coins) return alert("Недостаточно монет");

    // списываем ставку один раз при входе
    addCoins(-bet);
    inRound = true;
    playerBet = bet;

    betStatVal.textContent = `+${bet} 🪙`;
    betHint.textContent = "вошёл";

    overlayText.textContent = "Ты в раунде";
    statusHint.textContent = `Старт через ${roundTimer}s`;

    beep(680, 70, 0.02);
  }

  function cashout() {
    if (state !== STATE.FLY) return;
    if (!inRound || cashed) return;

    cashed = true;
    cashedAt = currentX;

    const payout = Math.floor(playerBet * cashedAt);
    addCoins(payout);

    betHint.textContent = `забрал x${fmt2(cashedAt)}`;
    cashBtn.disabled = true;
    winSound();
  }

  // ---- Graph rendering ----
  function draw() {
    resizeCanvas();
    const w = canvas.width;
    const h = canvas.height;

    // bg
    ctx2d.fillStyle = "#000";
    ctx2d.fillRect(0, 0, w, h);

    // plot area padding
    const padL = Math.floor(w * 0.07);
    const padR = Math.floor(w * 0.04);
    const padT = Math.floor(h * 0.10);
    const padB = Math.floor(h * 0.12);

    const pw = w - padL - padR;
    const ph = h - padT - padB;

    // subtle grid
    ctx2d.globalAlpha = 1;
    ctx2d.strokeStyle = "rgba(255,255,255,.06)";
    ctx2d.lineWidth = Math.max(1, Math.floor(w * 0.0012));

    const gridX = 6;
    const gridY = 4;
    for (let i = 0; i <= gridX; i++) {
      const x = padL + (pw * i) / gridX;
      ctx2d.beginPath();
      ctx2d.moveTo(x, padT);
      ctx2d.lineTo(x, padT + ph);
      ctx2d.stroke();
    }
    for (let j = 0; j <= gridY; j++) {
      const y = padT + (ph * j) / gridY;
      ctx2d.beginPath();
      ctx2d.moveTo(padL, y);
      ctx2d.lineTo(padL + pw, y);
      ctx2d.stroke();
    }

    // curve data bounds
    const last = pts.length ? pts[pts.length - 1] : { t: 0, x: 1 };
    const maxT = Math.max(3, last.t);
    const maxX = Math.max(2, last.x);

    // map function
    const X = (t) => padL + (t / maxT) * pw;
    const Y = (x) => padT + ph - ((x - 1) / (maxX - 1)) * ph;

    // gradient area under curve
    if (pts.length >= 2) {
      // path
      const path = new Path2D();
      path.moveTo(X(pts[0].t), Y(pts[0].x));
      for (let i = 1; i < pts.length; i++) path.lineTo(X(pts[i].t), Y(pts[i].x));

      // area
      const area = new Path2D(path);
      area.lineTo(X(last.t), padT + ph);
      area.lineTo(X(pts[0].t), padT + ph);
      area.closePath();

      const grad = ctx2d.createLinearGradient(0, padT, 0, padT + ph);
      grad.addColorStop(0, "rgba(255,90,106,.35)");
      grad.addColorStop(1, "rgba(255,90,106,.00)");

      ctx2d.fillStyle = grad;
      ctx2d.fill(area);

      // curve stroke
      ctx2d.strokeStyle = "rgba(255,120,140,.95)";
      ctx2d.lineWidth = Math.max(2, Math.floor(w * 0.004));
      ctx2d.lineCap = "round";
      ctx2d.lineJoin = "round";
      ctx2d.stroke(path);

      // head dot
      ctx2d.fillStyle = "rgba(255,170,190,.95)";
      ctx2d.beginPath();
      ctx2d.arc(X(last.t), Y(last.x), Math.max(3, Math.floor(w * 0.007)), 0, Math.PI * 2);
      ctx2d.fill();
    }
  }

  // ---- Main loop ----
  function loop() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);

    if (state !== STATE.FLY) return;

    const now = performance.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;

    const t = (now - startTs) / 1000;

    // compute X
    let x = xFromTime(t);

    // crash check (crashPoint computed upfront)
    if (x >= crashPoint) {
      x = crashPoint;
      currentX = x;
      pts.push({ t: tFromX(x), x });

      // render final x
      multVal.textContent = `x${fmt2(x)}`;
      overlayX.textContent = `${fmt2(x)}x`;

      draw();
      endCrash();
      return;
    }

    currentX = x;

    // store point not too often
    const lastP = pts[pts.length - 1];
    if (!lastP || t - lastP.t >= 0.05) pts.push({ t, x });

    // update UI
    multVal.textContent = `x${fmt2(x)}`;
    overlayX.textContent = `${fmt2(x)}x`;

    // cash availability
    cashBtn.disabled = !(inRound && !cashed);

    // small tick sound occasionally
    if (soundOn && (Math.floor(t * 10) % 10 === 0) && dt > 0) {
      // очень тихо и редко
      // beep(520, 35, 0.008);
    }

    draw();
  }

  // ---- Wire UI ----
  function init() {
    renderTop();

    // subtitle (optional)
    const sub = document.getElementById("subTitle");
    if (sub) {
      const user = tg?.initDataUnsafe?.user;
      sub.textContent = user ? `Привет, ${user.first_name}` : "Открыто вне Telegram";
    }

    // bet events
    betInput.addEventListener("input", clampBetUI);
    betMinus.onclick = () => { betInput.value = String(getBet() - 10); clampBetUI(); };
    betPlus.onclick  = () => { betInput.value = String(getBet() + 10); clampBetUI(); };

    chips.forEach((b) => {
      b.addEventListener("click", () => {
        const v = b.dataset.bet;
        if (v === "max") setBet(wallet.coins || 1);
        else setBet(Number(v));
        beep(540, 55, 0.02);
      });
    });

    // buttons
    joinBtn.onclick = joinRound;
    cashBtn.onclick = cashout;

    // bonus
    if (bonusBtn) {
      bonusBtn.onclick = () => { addCoins(1000); beep(760, 70, 0.03); };
    }

    // sound toggle (badge)
    soundBadge.onclick = () => {
      soundOn = !soundOn;
      soundBadge.textContent = soundOn ? "Звук: on" : "Звук: off";
      beep(soundOn ? 640 : 240, 60, 0.03);
    };

    // defaults
    setBet(100);
    betStatVal.textContent = "—";
    betHint.textContent = "не в раунде";

    // first wait
    startWait();

    // initial draw
    draw();
  }

  init();
})();
