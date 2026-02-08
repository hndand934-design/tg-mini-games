/* app.js — Chicken (Stake-style) | GitHub Pages | без зависимостей
   ✅ Ставка 1 раз на старт
   ✅ Forward (прыжок) + Cashout
   ✅ Easy: только машины (мягкая математика)
   ✅ Hard: машины + огонь + провал (жёсткая математика)
   ✅ Плавные анимации на canvas
   ✅ X-лестница (видна заранее) + подсветка шага
   ✅ Звук (тихий) + тумблер
   ✅ localStorage баланс
*/

(() => {
  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const fmtRub = (n) => `${Math.max(0, Math.floor(n))} ₽`;
  const fmtX = (x) => `x${x.toFixed(2)}`;

  // ---------- DOM (без "магии": если id нет — подхватим по data-role) ----------
  const canvas = $("#gameCanvas") || $("[data-role='canvas']");
  const wrapArena = canvas?.parentElement;

  const soundBtn = $("#soundToggle") || $("[data-role='sound']");
  const soundText = $("#soundText") || $("[data-role='soundText']");
  const soundDot = $(".soundDot") || $("[data-role='soundDot']");

  const balanceEl = $("#balanceValue") || $("[data-role='balance']");
  const betInput = $("#betInput") || $("[data-role='bet']");
  const btnBet = $("#btnBet") || $("[data-role='betBtn']");
  const btnForward = $("#btnForward") || $("[data-role='forwardBtn']");
  const btnCashout = $("#btnCashout") || $("[data-role='cashoutBtn']");
  const difficultySel = $("#difficulty") || $("[data-role='difficulty']");

  const profitValueEl = $("#profitValue") || $("[data-role='profitValue']");
  const statusTextEl = $("#statusText") || $("[data-role='statusText']");
  const hudXEl = $("#hudX") || $("[data-role='hudX']");
  const hudStepEl = $("#hudStep") || $("[data-role='hudStep']");

  const multStrip = $("#multStrip") || $("[data-role='multStrip']");

  const chipBtns = $$("[data-amt], .chip");

  // ---------- safety: must have canvas ----------
  if (!canvas) {
    console.error("Canvas #gameCanvas not found. Проверь index.html");
    return;
  }

  const ctx = canvas.getContext("2d", { alpha: true });

  // ---------- persistent state ----------
  const LS_BAL = "oai_balance_chicken";
  const LS_SND = "oai_sound_chicken";

  let balance = Number(localStorage.getItem(LS_BAL) || "1000");
  if (!Number.isFinite(balance) || balance < 0) balance = 1000;

  let soundOn = (localStorage.getItem(LS_SND) ?? "1") === "1";

  // ---------- audio (тихо и приятно) ----------
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  }
  function beep({ f = 440, t = 0.06, type = "sine", v = 0.025, slide = 0, delay = 0 }) {
    if (!soundOn) return;
    ensureAudio();
    const ac = audioCtx;
    const now = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;

    o.frequency.setValueAtTime(f, now);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f * slide), now + t);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(v, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t);

    o.connect(g);
    g.connect(ac.destination);
    o.start(now);
    o.stop(now + t + 0.02);
  }
  function sfxStart() {
    beep({ f: 280, t: 0.08, type: "triangle", v: 0.02, slide: 1.6 });
    beep({ f: 520, t: 0.06, type: "sine", v: 0.018, delay: 0.06 });
  }
  function sfxJump() {
    beep({ f: 360, t: 0.05, type: "triangle", v: 0.016, slide: 1.25 });
  }
  function sfxSafe() {
    beep({ f: 640, t: 0.05, type: "sine", v: 0.018 });
    beep({ f: 880, t: 0.05, type: "sine", v: 0.012, delay: 0.045 });
  }
  function sfxHit() {
    beep({ f: 220, t: 0.10, type: "sawtooth", v: 0.018, slide: 0.55 });
    beep({ f: 110, t: 0.12, type: "square", v: 0.010, delay: 0.05 });
  }
  function sfxCashout() {
    beep({ f: 520, t: 0.06, type: "triangle", v: 0.017, slide: 1.3 });
    beep({ f: 740, t: 0.06, type: "triangle", v: 0.014, delay: 0.05 });
  }

  // ---------- game config ----------
  const MODES = {
    easy: {
      name: "Лёгкий",
      steps: 6,
      // мягкая математика, чтобы не дюпалось
      multipliers: [1.09, 1.15, 1.23, 1.31, 1.40, 1.55],
      // только машины: шанс умереть растёт
      deathChances: [0.08, 0.10, 0.12, 0.14, 0.16, 0.18],
      hazards: ["car"], // визуально — машина
    },
    hard: {
      name: "Эксперт",
      steps: 6,
      // близко к примеру со скринов (жёстко)
      multipliers: [1.96, 4.14, 9.31, 22.61, 60.29, 180.00],
      // тут опасности сильнее (машина/огонь/провал)
      deathChances: [0.22, 0.24, 0.26, 0.28, 0.30, 0.32],
      hazards: ["car", "fire", "hole"],
    },
  };

  // ---------- game state ----------
  const S = {
    modeKey: "easy",
    running: false,     // ставка принята и игра активна
    alive: false,       // ещё не проиграл
    anim: false,        // идёт анимация прыжка
    step: 0,            // пройдено шагов
    bet: 100,
    x: 1.0,
    payout: 0,          // total payout (ставка * X)
    lastMsg: "Ожидание",
    // path pre-roll outcomes for each forward step
    outcomes: [],       // 'safe' | 'dead'
    hazardType: [],     // 'car'|'fire'|'hole' for dead
    // visuals
    chicken: { x: 0, y: 0, vx: 0, vy: 0, bob: 0, scale: 1, rot: 0 },
    hit: { t: 0, type: null },
    cashBurst: { t: 0 },
  };

  // ---------- layout / canvas sizing ----------
  function resizeCanvas() {
    const w = Math.max(320, wrapArena?.clientWidth || 900);
    // высота как у stake панели (приятно)
    const h = clamp(Math.round(w * 0.58), 360, 560);
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // init chicken position
    placeChickenAtStep(S.step, true);
  }

  window.addEventListener("resize", resizeCanvas);

  // ---------- UI update ----------
  function setStatus(text) {
    S.lastMsg = text;
    if (statusTextEl) statusTextEl.textContent = text;
  }
  function setBalance(v) {
    balance = Math.max(0, Math.floor(v));
    localStorage.setItem(LS_BAL, String(balance));
    if (balanceEl) balanceEl.textContent = fmtRub(balance);
  }
  function setSoundUI() {
    if (soundText) soundText.textContent = soundOn ? "Звук: on" : "Звук: off";
    if (soundDot) {
      soundDot.style.background = soundOn ? "var(--green)" : "var(--red)";
      soundDot.style.boxShadow = soundOn
        ? "0 0 0 4px rgba(32,208,122,.15)"
        : "0 0 0 4px rgba(255,77,94,.14)";
    }
  }
  function setBetUI(v) {
    const val = clamp(Math.floor(v), 1, 999999);
    S.bet = val;
    if (betInput) betInput.value = String(val);
  }
  function updatePayout() {
    S.payout = S.bet * S.x;
    // показываем как "прибыль" — именно payout (как обычно у стейка в подобных)
    if (profitValueEl) profitValueEl.textContent = fmtRub(S.payout);
    if (hudXEl) hudXEl.textContent = fmtX(S.x);
    if (hudStepEl) hudStepEl.textContent = `${S.step}/${MODES[S.modeKey].steps}`;
  }

  function syncButtons() {
    // можно ставить только когда игра не в процессе анимации и нет активной серии
    const canBet = !S.anim && !S.running;
    const canForward = !S.anim && S.running && S.alive && S.step < MODES[S.modeKey].steps;
    const canCashout = !S.anim && S.running && S.alive && S.step > 0;

    if (btnBet) btnBet.disabled = !canBet;
    if (btnForward) btnForward.disabled = !canForward;
    if (btnCashout) btnCashout.disabled = !canCashout;

    // косметика: primary/ghost
    if (btnForward) {
      btnForward.classList.toggle("ghost", !canForward && S.running);
    }
    if (btnCashout) {
      btnCashout.classList.toggle("cashout", true);
    }
  }

  function buildMultiplierStrip() {
    if (!multStrip) return;
    multStrip.innerHTML = "";
    const m = MODES[S.modeKey].multipliers;
    m.forEach((xv, i) => {
      const pill = document.createElement("div");
      pill.className = "multPill";
      pill.textContent = fmtX(xv);
      pill.dataset.i = String(i + 1);
      multStrip.appendChild(pill);
    });
    refreshStripState();
  }

  function refreshStripState() {
    if (!multStrip) return;
    const pills = $$(".multPill", multStrip);
    pills.forEach((p, idx) => {
      const stepIndex = idx + 1; // 1..N
      p.classList.toggle("active", stepIndex === S.step + 1 && S.running && S.alive);
      p.classList.toggle("done", stepIndex <= S.step && S.running);
    });
  }

  // ---------- mode ----------
  function getModeKey() {
    const v = (difficultySel?.value || "").toLowerCase();
    if (v.includes("hard") || v.includes("эксп") || v.includes("expert")) return "hard";
    return "easy";
  }
  function setMode(key) {
    S.modeKey = key;
    // если во время игры переключили — сбрасываем (без багов)
    resetRound("Ожидание");
    buildMultiplierStrip();
    updatePayout();
    syncButtons();
  }

  // ---------- round / RNG ----------
  function rollOutcomes() {
    const mode = MODES[S.modeKey];
    S.outcomes = [];
    S.hazardType = [];
    for (let i = 0; i < mode.steps; i++) {
      const die = Math.random() < mode.deathChances[i];
      S.outcomes.push(die ? "dead" : "safe");
      if (die) {
        const ht = mode.hazards[Math.floor(Math.random() * mode.hazards.length)];
        S.hazardType.push(ht);
      } else {
        S.hazardType.push(null);
      }
    }
  }

  function resetRound(msg = "Ожидание") {
    S.running = false;
    S.alive = false;
    S.anim = false;
    S.step = 0;
    S.x = 1.0;
    S.payout = 0;
    S.outcomes = [];
    S.hazardType = [];
    S.hit.t = 0;
    S.hit.type = null;
    S.cashBurst.t = 0;
    placeChickenAtStep(0, true);
    setStatus(msg);
    updatePayout();
    refreshStripState();
    syncButtons();
  }

  function startRound() {
    const bet = clamp(Math.floor(Number(betInput?.value || S.bet)), 1, 999999);
    if (bet > balance) {
      setStatus("Недостаточно баланса");
      beep({ f: 200, t: 0.08, type: "square", v: 0.012 });
      return;
    }

    setBetUI(bet);
    setBalance(balance - bet);

    S.running = true;
    S.alive = true;
    S.anim = false;
    S.step = 0;
    S.x = 1.0;
    S.hit.t = 0;
    S.hit.type = null;
    S.cashBurst.t = 0;

    rollOutcomes();
    placeChickenAtStep(0, true);

    setStatus("Серия началась — жми «Вперёд»");
    sfxStart();
    updatePayout();
    refreshStripState();
    syncButtons();
  }

  function cashout() {
    if (!S.running || !S.alive || S.step <= 0 || S.anim) return;

    const payout = S.bet * S.x;
    setBalance(balance + payout);
    S.cashBurst.t = 1;
    setStatus(`Кэшаут: ${fmtRub(payout)} (${fmtX(S.x)})`);
    sfxCashout();

    // закрываем раунд
    S.running = false;
    S.alive = false;
    syncButtons();

    // мягкая пауза и сброс
    setTimeout(() => {
      resetRound("Ожидание");
    }, 750);
  }

  function lose(type) {
    S.alive = false;
    S.running = false;
    S.anim = false;

    S.hit.t = 1;
    S.hit.type = type || "car";
    setStatus("Проигрыш");
    sfxHit();
    syncButtons();

    setTimeout(() => {
      resetRound("Ожидание");
    }, 900);
  }

  // ---------- geometry ----------
  function geo() {
    const w = parseFloat(canvas.style.width || "900");
    const h = parseFloat(canvas.style.height || "520");

    // игровая дорожка справа от "стартовой зоны"
    const pad = 18;
    const leftArea = w * 0.20;
    const roadX = leftArea;
    const roadW = w - roadX - pad;
    const roadY = pad;
    const roadH = h - pad * 2;

    return { w, h, pad, leftArea, roadX, roadW, roadY, roadH };
  }

  function stepPos(stepIndex /*0..steps*/) {
    const g = geo();
    const mode = MODES[S.modeKey];
    const steps = mode.steps;
    // позиции лунок по X
    const x0 = g.roadX + g.roadW * 0.10;
    const x1 = g.roadX + g.roadW * 0.92;
    const t = steps === 0 ? 0 : stepIndex / steps;
    const x = lerp(x0, x1, t);
    const y = g.roadY + g.roadH * 0.64;
    return { x, y };
  }

  function placeChickenAtStep(stepIndex, hardSet = false) {
    const p = stepPos(stepIndex);
    if (hardSet) {
      S.chicken.x = p.x;
      S.chicken.y = p.y;
      S.chicken.vx = 0;
      S.chicken.vy = 0;
      S.chicken.rot = 0;
      S.chicken.scale = 1;
    }
  }

  // ---------- forward / animation ----------
  function forward() {
    if (!S.running || !S.alive || S.anim) return;

    const mode = MODES[S.modeKey];
    if (S.step >= mode.steps) return;

    S.anim = true;
    syncButtons();

    const nextStep = S.step + 1;
    const from = stepPos(S.step);
    const to = stepPos(nextStep);

    const outcome = S.outcomes[S.step]; // result for THIS move
    const hazard = S.hazardType[S.step];

    const dur = 380; // ms
    const start = performance.now();

    sfxJump();

    const jumpArc = (t) => Math.sin(Math.PI * t) * 28; // arc height

    function tick(now) {
      const t = clamp((now - start) / dur, 0, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      S.chicken.x = lerp(from.x, to.x, ease);
      S.chicken.y = lerp(from.y, to.y, ease) - jumpArc(ease);
      S.chicken.rot = lerp(0, 0.12, ease);

      if (t < 1) {
        requestAnimationFrame(tick);
        return;
      }

      // landing
      S.chicken.x = to.x;
      S.chicken.y = to.y;
      S.chicken.rot = 0;

      if (outcome === "safe") {
        S.step = nextStep;
        S.x = mode.multipliers[S.step - 1]; // step 1 => mult[0]
        updatePayout();
        refreshStripState();
        setStatus(`Успех • ${fmtX(S.x)}`);
        sfxSafe();

        // done?
        if (S.step >= mode.steps) {
          // авто-кэшаут в конце (как финиш)
          setTimeout(() => cashout(), 420);
          S.anim = false;
          return;
        }

        S.anim = false;
        syncButtons();
        return;
      }

      // dead
      S.anim = false;
      syncButtons();
      lose(hazard || "car");
    }

    requestAnimationFrame(tick);
  }

  // ---------- drawing ----------
  function drawRoundedRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawRoad() {
    const g = geo();

    // base
    drawRoundedRect(g.roadX, g.roadY, g.roadW, g.roadH, 18);
    const grd = ctx.createLinearGradient(g.roadX, g.roadY, g.roadX, g.roadY + g.roadH);
    grd.addColorStop(0, "rgba(0,0,0,.20)");
    grd.addColorStop(1, "rgba(0,0,0,.08)");
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.08)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // lane lines
    const lanes = 6;
    for (let i = 1; i < lanes; i++) {
      const y = g.roadY + (g.roadH / lanes) * i;
      ctx.strokeStyle = "rgba(255,255,255,.06)";
      ctx.setLineDash([6, 10]);
      ctx.beginPath();
      ctx.moveTo(g.roadX + 18, y);
      ctx.lineTo(g.roadX + g.roadW - 18, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // vertical "movement guide" faint
    ctx.strokeStyle = "rgba(255,255,255,.05)";
    ctx.setLineDash([2, 14]);
    for (let k = 0; k < 8; k++) {
      const x = g.roadX + 28 + (g.roadW - 56) * (k / 7);
      ctx.beginPath();
      ctx.moveTo(x, g.roadY + 18);
      ctx.lineTo(x, g.roadY + g.roadH - 18);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // left sidewalk decoration
    ctx.fillStyle = "rgba(255,255,255,.04)";
    drawRoundedRect(g.roadX - g.leftArea + 10, g.roadY, g.leftArea - 20, g.roadH, 18);
    ctx.fill();

    // traffic light small
    const tlx = g.roadX - g.leftArea / 2;
    const tly = g.roadY + g.roadH * 0.20;
    ctx.fillStyle = "rgba(0,0,0,.18)";
    drawRoundedRect(tlx - 18, tly - 26, 36, 52, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.10)";
    ctx.stroke();

    const r = 8;
    ctx.beginPath();
    ctx.arc(tlx, tly - 10, r, 0, Math.PI * 2);
    ctx.fillStyle = S.running && S.alive ? "rgba(255,210,80,.90)" : "rgba(255,255,255,.10)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(tlx, tly + 12, r, 0, Math.PI * 2);
    ctx.fillStyle = S.running && S.alive ? "rgba(255,255,255,.10)" : "rgba(255,255,255,.06)";
    ctx.fill();
  }

  function drawManholes() {
    const g = geo();
    const mode = MODES[S.modeKey];
    const steps = mode.steps;

    for (let i = 1; i <= steps; i++) {
      const p = stepPos(i);
      const rr = clamp(g.roadW * 0.035, 16, 24);
      // base lid
      ctx.save();
      ctx.translate(p.x, p.y);

      const base = ctx.createRadialGradient(0, -rr * 0.2, rr * 0.4, 0, 0, rr * 1.2);
      base.addColorStop(0, "rgba(255,255,255,.14)");
      base.addColorStop(1, "rgba(0,0,0,.22)");
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,.10)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, rr - 2, 0, Math.PI * 2);
      ctx.stroke();

      // highlight current next target
      const isNext = S.running && S.alive && (i === S.step + 1);
      const isDone = S.running && i <= S.step;
      if (isNext) {
        ctx.strokeStyle = "rgba(61,121,255,.75)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, rr + 3, 0, Math.PI * 2);
        ctx.stroke();
      } else if (isDone) {
        ctx.strokeStyle = "rgba(32,208,122,.35)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, rr + 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      // show label x on lid (subtle)
      ctx.fillStyle = "rgba(233,241,255,.60)";
      ctx.font = `800 ${Math.round(rr * 0.78)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${mode.multipliers[i - 1].toFixed(i === steps ? 0 : 2)}x`, 0, 0);

      ctx.restore();
    }
  }

  function drawChicken() {
    const g = geo();
    const p = S.chicken;
    const size = clamp(g.roadW * 0.05, 18, 26);

    ctx.save();
    ctx.translate(p.x, p.y - size * 0.85);
    ctx.rotate(p.rot);

    // shadow
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.beginPath();
    ctx.ellipse(0, size * 1.25, size * 0.9, size * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // body
    const body = ctx.createLinearGradient(0, -size, 0, size);
    body.addColorStop(0, "rgba(255,255,255,.95)");
    body.addColorStop(1, "rgba(230,240,255,.75)");
    ctx.fillStyle = body;
    drawRoundedRect(-size * 0.72, -size * 0.85, size * 1.44, size * 1.55, 14);
    ctx.fill();

    // head highlight
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.beginPath();
    ctx.ellipse(-size * 0.18, -size * 0.50, size * 0.45, size * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    // beak
    ctx.fillStyle = "rgba(255,210,80,.95)";
    ctx.beginPath();
    ctx.moveTo(size * 0.55, -size * 0.25);
    ctx.lineTo(size * 0.85, -size * 0.12);
    ctx.lineTo(size * 0.55, 0);
    ctx.closePath();
    ctx.fill();

    // eye
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.beginPath();
    ctx.arc(size * 0.28, -size * 0.42, size * 0.08, 0, Math.PI * 2);
    ctx.fill();

    // comb
    ctx.fillStyle = "rgba(255,80,110,.85)";
    ctx.beginPath();
    ctx.arc(-size * 0.20, -size * 0.95, size * 0.18, 0, Math.PI * 2);
    ctx.arc(0, -size * 1.02, size * 0.16, 0, Math.PI * 2);
    ctx.fill();

    // tiny feet
    ctx.strokeStyle = "rgba(255,210,80,.95)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-size * 0.15, size * 0.70);
    ctx.lineTo(-size * 0.28, size * 0.88);
    ctx.moveTo(size * 0.10, size * 0.70);
    ctx.lineTo(size * 0.00, size * 0.90);
    ctx.stroke();

    ctx.restore();
  }

  function drawHazardFX() {
    if (S.hit.t <= 0) return;
    const g = geo();
    const t = S.hit.t;
    const p = stepPos(S.step + 1); // приблизительно место смерти

    ctx.save();
    ctx.globalAlpha = t;

    if (S.hit.type === "fire") {
      const r = 18 + (1 - t) * 40;
      const grd = ctx.createRadialGradient(p.x, p.y, 5, p.x, p.y, r);
      grd.addColorStop(0, "rgba(255,120,60,.85)");
      grd.addColorStop(1, "rgba(255,60,90,0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (S.hit.type === "hole") {
      const r = 20 + (1 - t) * 20;
      ctx.fillStyle = "rgba(0,0,0,.65)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.10)";
      ctx.stroke();
    } else {
      // car hit / generic
      const r = 16 + (1 - t) * 55;
      const grd = ctx.createRadialGradient(p.x, p.y, 6, p.x, p.y, r);
      grd.addColorStop(0, "rgba(255,80,110,.85)");
      grd.addColorStop(1, "rgba(255,80,110,0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawCarGhost() {
    // для атмосферы: на hard иногда проезжает машина сверху
    const g = geo();
    if (!(S.running && S.alive)) return;

    const time = performance.now() * 0.001;
    const show = S.modeKey === "hard" ? 0.75 : 0.45;
    if (Math.sin(time * 1.2) < show) return;

    const laneY = g.roadY + g.roadH * 0.30;
    const x = g.roadX + ((time * 110) % (g.roadW + 220)) - 110;

    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.translate(x, laneY);
    const w = 54, h = 28;

    ctx.fillStyle = "rgba(61,121,255,.55)";
    drawRoundedRect(-w / 2, -h / 2, w, h, 10);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,.18)";
    drawRoundedRect(-w * 0.12, -h * 0.33, w * 0.5, h * 0.35, 8);
    ctx.fill();

    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.beginPath(); ctx.arc(-w * 0.28, h * 0.46, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.28, h * 0.46, 6, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  function drawCashBurst() {
    if (S.cashBurst.t <= 0) return;
    const g = geo();
    const t = S.cashBurst.t;
    const p = stepPos(S.step);

    ctx.save();
    ctx.globalAlpha = t;
    const r = 30 + (1 - t) * 90;
    const grd = ctx.createRadialGradient(p.x, p.y - 20, 10, p.x, p.y - 20, r);
    grd.addColorStop(0, "rgba(32,208,122,.35)");
    grd.addColorStop(1, "rgba(32,208,122,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 20, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function render() {
    const g = geo();
    ctx.clearRect(0, 0, g.w, g.h);

    drawRoad();
    drawCarGhost();
    drawManholes();
    drawCashBurst();
    drawChicken();
    drawHazardFX();

    // legend is in HTML (CSS). Here we just animate decay.
    const dt = 1 / 60;
    if (S.hit.t > 0) S.hit.t = Math.max(0, S.hit.t - dt * 2.4);
    if (S.cashBurst.t > 0) S.cashBurst.t = Math.max(0, S.cashBurst.t - dt * 1.6);

    requestAnimationFrame(render);
  }

  // ---------- events ----------
  function wire() {
    // sound
    if (soundBtn) {
      soundBtn.addEventListener("click", () => {
        soundOn = !soundOn;
        localStorage.setItem(LS_SND, soundOn ? "1" : "0");
        setSoundUI();
        if (soundOn) beep({ f: 520, t: 0.06, type: "triangle", v: 0.015 });
      });
    }

    // chips
    chipBtns.forEach((b) => {
      b.addEventListener("click", () => {
        const amt = Number(b.dataset.amt || b.textContent?.replace(/[^\d]/g, "") || "0");
        if (amt > 0) setBetUI(amt);
      });
    });

    // bet +/- buttons (если в index есть)
    const minus = $("#betMinus") || $("[data-role='betMinus']");
    const plus = $("#betPlus") || $("[data-role='betPlus']");
    if (minus) minus.addEventListener("click", () => setBetUI(S.bet - 10));
    if (plus) plus.addEventListener("click", () => setBetUI(S.bet + 10));

    // difficulty
    if (difficultySel) {
      difficultySel.addEventListener("change", () => {
        setMode(getModeKey());
      });
    }

    // main actions
    if (btnBet) {
      btnBet.addEventListener("click", () => startRound());
    }
    if (btnForward) {
      btnForward.addEventListener("click", () => forward());
    }
    if (btnCashout) {
      btnCashout.addEventListener("click", () => cashout());
    }

    // enter to bet/forward
    window.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      if (!S.running) startRound();
      else forward();
    });

    // unlock audio on first user interaction (mobile)
    window.addEventListener("pointerdown", () => {
      if (!soundOn) return;
      ensureAudio();
    }, { once: true });
  }

  // ---------- init ----------
  function init() {
    setBalance(balance);
    setSoundUI();
    setBetUI(Number(betInput?.value || 100) || 100);

    setMode(getModeKey());

    setStatus("Ожидание");
    updatePayout();
    syncButtons();

    resizeCanvas();
    wire();
    requestAnimationFrame(render);
  }

  init();
})();
