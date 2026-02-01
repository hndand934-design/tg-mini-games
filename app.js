/* app.js — Rocket Crash (только Crash)
   ✅ Ракета всегда ВНУТРИ квадрата (скейл по оси Y, не пропадает >20x)
   ✅ Линия графика рисуется сама (ракета НЕ “лежит” на линии)
   ✅ Ракета летит ПО ТРАЕКТОРИИ (угол по касательной, плавно)
   ✅ Раунды идут автоматически: ожидание -> полёт -> краш -> ожидание
   ✅ История/лог скрыт (ничего не пишем в DOM)
   ✅ Звуки: только запуск/полёт/краш (без музыки)
*/

(() => {
  // ---------- RNG (честный, как у тебя) ----------
  function randFloat() {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 2 ** 32;
  }

  // ---------- Telegram WebApp ----------
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  // ---------- Wallet ----------
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
  function addCoins(d) {
    setCoins(wallet.coins + d);
  }

  // ---------- DOM helpers (устойчиво к разметке) ----------
  const $ = (sel) => document.querySelector(sel);
  const setText = (el, txt) => { if (el) el.textContent = txt; };

  // Ищем элементы (если у тебя другие id — просто добавь такие же в index.html)
  const elBalance = $("#balance") || $("[data-balance]");
  const elTitle = $("#title") || $("[data-title]");
  const elMultSmall = $("#multSmall") || $("[data-mult-small]");
  const elStatusSmall = $("#statusSmall") || $("[data-status-small]");
  const elBetSmall = $("#betSmall") || $("[data-bet-small]");

  const elMultBig = $("#multBig") || $("[data-mult-big]");
  const elHint = $("#hint") || $("[data-hint]");

  const elEnterBtn = $("#enterBtn") || $("[data-enter]");
  const elCashBtn  = $("#cashBtn")  || $("[data-cash]");

  const elBetInput = $("#betInput") || $("[data-bet]");
  const elBetMinus = $("#betMinus") || $("[data-bet-minus]");
  const elBetPlus  = $("#betPlus")  || $("[data-bet-plus]");
  const elBonusBtn = $("#bonusBtn") || $("[data-bonus]");

  const elSoundToggle = $("#soundToggle") || $("[data-sound]");
  const presetBtns = document.querySelectorAll("[data-preset]"); // например: data-preset="50", "max"
  const canvas = $("#crashCanvas") || $("canvas");

  // на всякий случай
  if (elTitle) setText(elTitle, "Rocket Crash");

  // Скрыть любые блоки истории/лога, если они есть
  const logEl = $("#history") || $("[data-history]") || $(".history") || $(".log");
  if (logEl) logEl.style.display = "none";

  // ---------- Render top ----------
  function renderTop() {
    if (elBalance) setText(elBalance, String(wallet.coins));
  }
  renderTop();

  // ---------- Bet controls ----------
  function clampBet(v) {
    v = Math.floor(Number(v) || 0);
    if (v < 1) v = 1;
    if (v > wallet.coins) v = wallet.coins;
    return v;
  }
  function setBetUI(v) {
    v = clampBet(v);
    if (elBetInput) elBetInput.value = String(v);
    if (elBetSmall) setText(elBetSmall, v ? `${v} 🪙` : "—");
  }
  setBetUI(elBetInput?.value || 100);

  if (elBetInput) elBetInput.addEventListener("input", () => setBetUI(elBetInput.value));
  if (elBetMinus) elBetMinus.addEventListener("click", () => setBetUI((Number(elBetInput?.value) || 1) - 10));
  if (elBetPlus)  elBetPlus.addEventListener("click", () => setBetUI((Number(elBetInput?.value) || 1) + 10));
  if (elBonusBtn) elBonusBtn.addEventListener("click", () => addCoins(1000));

  presetBtns.forEach((b) => {
    b.addEventListener("click", () => {
      const p = b.getAttribute("data-preset");
      if (!p) return;
      if (p === "max") setBetUI(wallet.coins);
      else setBetUI(p);
    });
  });

  // ---------- Sound (WebAudio, без музыки) ----------
  let soundOn = true;
  let audioCtx = null;

  const S = {
    gain: null,
    flightOsc: null,
    flightGain: null,
    flightFilter: null,
    noiseSrc: null,
    noiseGain: null,
  };

  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (!S.gain) {
      S.gain = audioCtx.createGain();
      S.gain.gain.value = 0.55;
      S.gain.connect(audioCtx.destination);
    }
  }

  function now() { return audioCtx ? audioCtx.currentTime : 0; }

  function clickSafeResume() {
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  }

  function stopFlightSound() {
    if (!audioCtx) return;
    const t = now();
    try {
      if (S.flightGain) {
        S.flightGain.gain.cancelScheduledValues(t);
        S.flightGain.gain.setTargetAtTime(0.0001, t, 0.04);
      }
      if (S.noiseGain) {
        S.noiseGain.gain.cancelScheduledValues(t);
        S.noiseGain.gain.setTargetAtTime(0.0001, t, 0.06);
      }
    } catch {}
    setTimeout(() => {
      try { S.flightOsc?.stop(); } catch {}
      try { S.noiseSrc?.stop(); } catch {}
      S.flightOsc = null;
      S.flightGain = null;
      S.flightFilter = null;
      S.noiseSrc = null;
      S.noiseGain = null;
    }, 220);
  }

  function playLaunch() {
    if (!soundOn) return;
    ensureAudio(); clickSafeResume();
    const t = now();

    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(360, t + 0.18);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

    osc.connect(g); g.connect(S.gain);
    osc.start(t);
    osc.stop(t + 0.24);
  }

  function startFlightSound() {
    if (!soundOn) return;
    ensureAudio(); clickSafeResume();
    stopFlightSound();

    const t = now();

    // основной тон
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, t);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, t);
    filter.Q.setValueAtTime(0.8, t);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.10);

    osc.connect(filter);
    filter.connect(g);
    g.connect(S.gain);

    // шум “двигателя”
    const bufferSize = 2 * audioCtx.sampleRate;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const out = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) out[i] = (Math.random() * 2 - 1) * 0.55;

    const noise = audioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const noiseG = audioCtx.createGain();
    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(520, t);
    noiseFilter.Q.setValueAtTime(0.9, t);

    noiseG.gain.setValueAtTime(0.0001, t);
    noiseG.gain.exponentialRampToValueAtTime(0.10, t + 0.14);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseG);
    noiseG.connect(S.gain);

    osc.start(t);
    noise.start(t);

    S.flightOsc = osc;
    S.flightGain = g;
    S.flightFilter = filter;
    S.noiseSrc = noise;
    S.noiseGain = noiseG;
  }

  function updateFlightSound(mult) {
    if (!soundOn || !audioCtx || !S.flightOsc || !S.flightFilter) return;
    const t = now();
    // рост частоты/яркости по множителю (приятно и без писка)
    const freq = Math.min(520, 170 + mult * 22);
    const cut = Math.min(2200, 900 + mult * 95);
    S.flightOsc.frequency.setTargetAtTime(freq, t, 0.05);
    S.flightFilter.frequency.setTargetAtTime(cut, t, 0.07);
  }

  function playCrash() {
    if (!soundOn) return;
    ensureAudio(); clickSafeResume();
    const t = now();

    // “удар”
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.18);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

    osc.connect(g); g.connect(S.gain);
    osc.start(t);
    osc.stop(t + 0.24);
  }

  if (elSoundToggle) {
    elSoundToggle.addEventListener("click", () => {
      soundOn = !soundOn;
      // текст/статус — если у тебя есть
      elSoundToggle.textContent = soundOn ? "Звук: on" : "Звук: off";
      if (!soundOn) stopFlightSound();
    });
    // на старте подстроим подпись
    if (!elSoundToggle.textContent?.trim()) {
      elSoundToggle.textContent = soundOn ? "Звук: on" : "Звук: off";
    }
  }

  // ---------- Crash math ----------
  // честная “crash-point” модель: 1 / (1 - r) с отсечкой
  function sampleCrashPoint() {
    const r = randFloat();
    const x = 1 / Math.max(1e-9, (1 - r));
    return Math.max(1.03, Math.min(250, x));
  }

  // рост множителя (плавно)
  function multFromTime(t) {
    // быстрый старт и более плавный разгон
    return 1 + t * 0.85 + t * t * 0.13;
  }

  // ---------- State machine ----------
  const PHASE = { WAIT: "WAIT", FLY: "FLY", CRASH: "CRASH" };

  const state = {
    phase: PHASE.WAIT,
    countdown: 3,
    crashPoint: sampleCrashPoint(),
    t0: 0,
    t: 0,
    mult: 1.00,
    inRound: false,
    bet: 0,
    entered: false,
    cashed: false,
    payout: 0,
    autoTimer: null,
  };

  function setUIPhase() {
    // small boxes
    setText(elMultSmall, `x${state.mult.toFixed(2)}`);
    setText(elStatusSmall, state.phase === PHASE.FLY ? "Полёт" : "Ожидание");
    setText(elMultBig, `${state.mult.toFixed(2)}x`);

    // hints
    if (elHint) {
      if (state.phase === PHASE.WAIT) setText(elHint, `Старт через ${state.countdown}s`);
      else if (state.phase === PHASE.FLY) setText(elHint, state.entered ? "Ты в раунде" : "Ты не в раунде");
      else setText(elHint, "Краш!");
    }

    // buttons
    if (elEnterBtn) {
      const canEnter = state.phase === PHASE.WAIT && !state.entered;
      elEnterBtn.disabled = !canEnter;
      elEnterBtn.textContent = canEnter ? "Войти в раунд" : "Вход закрыт";
    }
    if (elCashBtn) {
      const canCash = state.phase === PHASE.FLY && state.entered && !state.cashed;
      elCashBtn.disabled = !canCash;
      elCashBtn.textContent = "Забрать";
    }

    renderTop();
  }

  // ---------- Canvas drawing (график + ракета) ----------
  const ctx = canvas ? canvas.getContext("2d") : null;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // Координаты графика (логика такая: X = время, Y = множитель)
  // Чтобы ракета НЕ вылетала при больших x — мы делаем DYNAMIC SCALE по Y относительно текущего mult.
  function computeScaleY() {
    // верх шкалы чуть выше текущего множителя (чтобы ракета всегда была в зоне)
    const top = Math.max(2.0, state.mult * 1.15);
    // ограничим, чтобы при огромных x не было “плоско”
    return Math.min(300, top);
  }

  // х-ось: показываем, например, окно 0..10 секунд, но если t больше — окно сдвигается (камера следует)
  function computeScaleX() {
    const windowSec = 10;
    const t = state.phase === PHASE.FLY ? state.t : 0;
    const x0 = Math.max(0, t - windowSec * 0.15); // немного “ведём” камеру
    const x1 = x0 + windowSec;
    return { x0, x1 };
  }

  // Красивый фон “зима/звёзды” — без картинок: точки + мягкие градиенты
  function drawBackground(w, h) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "rgba(12,18,40,1)");
    g.addColorStop(1, "rgba(8,12,28,1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // “снег/звёзды”
    ctx.globalAlpha = 0.65;
    for (let i = 0; i < 90; i++) {
      const x = (i * 97) % w;
      const y = (i * 53) % h;
      const r = ((i * 17) % 20) / 20 + 0.6;
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawGrid(x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;

    const cols = 8;
    const rows = 6;
    for (let i = 0; i <= cols; i++) {
      const xx = x + (w * i) / cols;
      ctx.beginPath();
      ctx.moveTo(xx, y);
      ctx.lineTo(xx, y + h);
      ctx.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      const yy = y + (h * j) / rows;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
      ctx.stroke();
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // Рисуем сам график: ЛИНИЯ растёт
  function drawCurve(x, y, w, h) {
    const { x0, x1 } = computeScaleX();
    const yTop = computeScaleY();

    // функция перевода в пиксели
    const px = (t) => x + ((t - x0) / (x1 - x0)) * w;
    const py = (m) => y + (1 - (m / yTop)) * h;

    // кривая (по времени)
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    const tMax = state.phase === PHASE.FLY ? state.t : 0;
    const steps = 80;

    // светящийся слой
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(255,92,92,0.20)";
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const tt = lerp(Math.max(x0, 0), Math.min(x1, tMax), i / steps);
      const mm = multFromTime(tt - state.t0);
      const X = px(tt);
      const Y = py(mm);
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    }
    ctx.stroke();

    // основной слой
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "rgba(255,92,92,0.95)";
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const tt = lerp(Math.max(x0, 0), Math.min(x1, tMax), i / steps);
      const mm = multFromTime(tt - state.t0);
      const X = px(tt);
      const Y = py(mm);
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    }
    ctx.stroke();

    ctx.restore();

    return { px, py, x0, x1, yTop };
  }

  // простая “2D ракета” (без ассетов)
  function drawRocket(X, Y, angleRad) {
    ctx.save();
    ctx.translate(X, Y);
    ctx.rotate(angleRad);

    // тень/обводка
    ctx.globalAlpha = 0.95;

    // корпус
    ctx.fillStyle = "rgba(245,248,255,0.95)";
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.quadraticCurveTo(0, -16, 14, 0);    // нос
    ctx.quadraticCurveTo(0, 16, -10, 0);   // хвост
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // окно
    ctx.fillStyle = "rgba(120,165,255,0.55)";
    ctx.beginPath();
    ctx.arc(2, -2, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // крылья
    ctx.fillStyle = "rgba(210,220,245,0.85)";
    ctx.beginPath();
    ctx.moveTo(-6, 2);
    ctx.lineTo(-15, 10);
    ctx.lineTo(-3, 9);
    ctx.closePath();
    ctx.fill();

    // огонь (не музыка — визуал)
    ctx.globalAlpha = 0.9;
    const flame = 10 + Math.sin(performance.now() / 70) * 2.2;
    ctx.fillStyle = "rgba(255,170,60,0.95)";
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.quadraticCurveTo(-18, 0, -12 - flame, 0);
    ctx.quadraticCurveTo(-18, -4, -12, -2);
    ctx.quadraticCurveTo(-18, 4, -12, 2);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // угол ракеты по касательной (производная)
  let rocketAngle = -Math.PI / 8; // сглаживаем
  function computeRocketAngle(px, py, tWorld) {
    const eps = 0.04;
    const m1 = multFromTime((tWorld - eps) - state.t0);
    const m2 = multFromTime((tWorld + eps) - state.t0);
    const x1 = px(tWorld - eps);
    const x2 = px(tWorld + eps);
    const y1 = py(m1);
    const y2 = py(m2);
    const dx = x2 - x1;
    const dy = y2 - y1;

    // В canvas ось Y вниз, поэтому dy -> переворачиваем
    const ang = Math.atan2(dy, dx);
    // направляем “вперёд” чуть вверх (rocket nose)
    return ang;
  }

  function renderCanvas() {
    if (!ctx || !canvas) return;

    const w = canvas.width = canvas.clientWidth || canvas.width || 900;
    const h = canvas.height = canvas.clientHeight || canvas.height || 520;

    drawBackground(w, h);

    // зона графика: с отступами
    const pad = 22;
    const gx = pad;
    const gy = pad;
    const gw = w - pad * 2;
    const gh = h - pad * 2;

    // рамка
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(gx, gy, gw, gh, 16);
    ctx.fill();
    ctx.stroke();

    drawGrid(gx + 8, gy + 8, gw - 16, gh - 16);

    // кривая
    const scale = drawCurve(gx + 8, gy + 8, gw - 16, gh - 16);

    // ракета — только в полёте (и чуть в ожидании можно оставить внизу)
    const { px, py } = scale;

    let tWorld;
    if (state.phase === PHASE.FLY) {
      tWorld = state.t;
    } else {
      // в ожидании “припаркована” внизу слева (НЕ улетает за границы)
      tWorld = scale.x0 + 0.15;
    }

    const m = state.phase === PHASE.FLY ? state.mult : 1.0;
    let X = px(tWorld);
    let Y = py(m);

    // гарантируем внутри квадрата (чтобы никогда не пропадала)
    const margin = 18;
    X = clamp(X, gx + margin, gx + gw - margin);
    Y = clamp(Y, gy + margin, gy + gh - margin);

    const targetAngle = state.phase === PHASE.FLY
      ? computeRocketAngle(px, py, tWorld)
      : (-Math.PI / 10);

    // сглаживание угла
    rocketAngle = lerp(rocketAngle, targetAngle, 0.12);

    drawRocket(X, Y, rocketAngle);

    // центральный текст
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "700 56px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 14;

    const big = `${state.mult.toFixed(2)}x`;
    ctx.fillText(big, w / 2, h / 2 - 6);

    ctx.shadowBlur = 0;
    ctx.font = "600 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.70)";

    let sub = "";
    if (state.phase === PHASE.WAIT) sub = `Старт через ${state.countdown}s`;
    else if (state.phase === PHASE.FLY) sub = state.entered ? "Ты в раунде" : "Ты не в раунде";
    else sub = "Краш!";

    ctx.fillText(sub, w / 2, h / 2 + 42);
  }

  // roundRect polyfill-ish for older
  if (CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      this.beginPath();
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
      return this;
    };
  }

  // ---------- Game flow ----------
  function resetRound() {
    state.phase = PHASE.WAIT;
    state.countdown = 3;
    state.crashPoint = sampleCrashPoint();

    state.t0 = 0;
    state.t = 0;
    state.mult = 1.0;

    state.entered = false;
    state.cashed = false;
    state.bet = 0;
    state.payout = 0;

    stopFlightSound();
    setUIPhase();
    renderCanvas();
  }

  function startCountdown() {
    if (state.autoTimer) clearInterval(state.autoTimer);
    state.phase = PHASE.WAIT;
    state.countdown = 3;
    setUIPhase();
    renderCanvas();

    state.autoTimer = setInterval(() => {
      state.countdown -= 1;
      if (state.countdown <= 0) {
        clearInterval(state.autoTimer);
        state.autoTimer = null;
        startFlight();
        return;
      }
      setUIPhase();
      renderCanvas();
    }, 1000);
  }

  let raf = 0;
  function startFlight() {
    // старт полёта
    state.phase = PHASE.FLY;
    state.t0 = performance.now() / 1000;
    state.t = state.t0;
    state.mult = 1.0;

    playLaunch();
    startFlightSound();
    setUIPhase();

    const tick = () => {
      const tNow = performance.now() / 1000;
      state.t = tNow;
      const dt = tNow - state.t0;
      state.mult = multFromTime(dt);

      updateFlightSound(state.mult);

      // краш?
      if (state.mult >= state.crashPoint) {
        state.mult = state.crashPoint; // фикс в точке краша
        crashNow();
        return;
      }

      setUIPhase();
      renderCanvas();
      raf = requestAnimationFrame(tick);
    };

    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function crashNow() {
    cancelAnimationFrame(raf);
    stopFlightSound();
    playCrash();

    // если игрок вошёл и не забрал — проиграл ставку
    state.phase = PHASE.CRASH;

    // ничего не списываем тут: ставка списывается при входе
    // payout только при cashout

    setUIPhase();
    renderCanvas();

    // пауза и новый раунд
    setTimeout(() => {
      resetRound();
      startCountdown();
    }, 1400);
  }

  function enterRound() {
    if (state.phase !== PHASE.WAIT || state.entered) return;

    const bet = clampBet(elBetInput?.value || 0);
    if (bet <= 0) return alert("Ставка должна быть больше 0");
    if (bet > wallet.coins) return alert("Недостаточно монет");

    // списать ставку
    addCoins(-bet);

    state.bet = bet;
    state.entered = true;
    state.cashed = false;
    state.payout = 0;

    setBetUI(bet);
    setUIPhase();
    renderCanvas();
  }

  function cashOut() {
    if (state.phase !== PHASE.FLY) return;
    if (!state.entered || state.cashed) return;

    state.cashed = true;

    const payout = Math.floor(state.bet * state.mult);
    state.payout = payout;
    addCoins(payout);

    // после cashout продолжаем полёт визуально (как на многих крашах) —
    // но кнопка “Забрать” станет disabled, и ты уже в плюсе
    setUIPhase();
    renderCanvas();
  }

  // ---------- Bind buttons ----------
  if (elEnterBtn) elEnterBtn.addEventListener("click", () => {
    // чтобы аудио точно разрешилось
    ensureAudio(); clickSafeResume();
    enterRound();
  });

  if (elCashBtn) elCashBtn.addEventListener("click", () => {
    ensureAudio(); clickSafeResume();
    cashOut();
  });

  // ---------- Start ----------
  resetRound();
  startCountdown();

  // ---------- Resize handling ----------
  let rto = 0;
  window.addEventListener("resize", () => {
    clearTimeout(rto);
    rto = setTimeout(() => renderCanvas(), 80);
  });
})();
