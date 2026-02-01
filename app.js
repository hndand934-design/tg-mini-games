// Rocket Crash — app.js (only Crash mode) — v8
(() => {
  // ---------- RNG (fair-ish) ----------
  function randFloat() {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 2 ** 32;
  }

  // Crash point: heavy tail
  function sampleCrashPoint() {
    // 1/(1-u) => (1..inf). Clamp to sane max
    const u = Math.min(0.999999, Math.max(0.000001, randFloat()));
    const x = 1 / (1 - u);
    return Math.max(1.05, Math.min(200, x));
  }

  // ---------- Telegram ----------
  const tg = window.Telegram?.WebApp;
  if (tg) {
    try { tg.ready(); tg.expand(); } catch {}
  }
  const tgUser = tg?.initDataUnsafe?.user;

  // ---------- Wallet ----------
  const WALLET_KEY = "rc_wallet_v1";
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
    renderTopbar();
  }
  function addCoins(d) { setCoins(wallet.coins + d); }

  // ---------- UI Mount ----------
  const mount = document.getElementById("app") || document.body;

  // Build base layout (matches your CSS)
  mount.innerHTML = `
    <div class="app">
      <div class="topbar">
        <div>
          <div class="title">Rocket Crash</div>
          <div class="subtitle" id="subtitle">Открыто вне Telegram</div>
        </div>
        <div class="balance">
          <div style="opacity:.7;font-size:11px;">Баланс</div>
          <div style="font-weight:900;font-size:18px;">🪙 <span id="bal">0</span></div>
        </div>
      </div>

      <div class="layout">
        <div class="panel">
          <div class="miniCards">
            <div class="miniCard">
              <div class="miniLabel">Множитель</div>
              <div class="miniValue" id="miniMult">x1.00</div>
              <div class="miniHint" id="miniMultHint">Ожидание…</div>
            </div>
            <div class="miniCard">
              <div class="miniLabel">Раунд</div>
              <div class="miniValue" id="miniRound">1</div>
              <div class="miniHint" id="miniRoundHint">Идёт отсчёт</div>
            </div>
            <div class="miniCard">
              <div class="miniLabel">Твоя ставка</div>
              <div class="miniValue" id="miniBet">—</div>
              <div class="miniHint" id="miniBetHint">не в раунде</div>
            </div>
          </div>

          <div class="chartWrap">
            <canvas id="chart"></canvas>

            <!-- rocket is INSIDE this window, no duplicates below -->
            <div class="rocket" id="rocket" aria-hidden="true"></div>

            <div class="centerMult">
              <div class="centerMultVal" id="centerMult">1.00x</div>
              <div class="centerMultSub" id="centerSub">Ожидание следующего раунда</div>
            </div>

            <div class="fairTag">Краш-поинт скрыт (честный RNG)</div>
            <button class="soundBtn" id="soundBtn">Звук: on</button>
          </div>

          <div class="chartFooter">
            <div class="footerHint" id="footerHint">
              Вход в раунд — только до старта (ожидание). В полёте можно “Забрать” в любой момент.
            </div>
            <div class="ver">v8 · только режим Crash</div>
          </div>
        </div>

        <div class="panel">
          <div class="betHeader">
            <div class="betTitle">Ставка</div>
            <button class="chip ghost" id="bonus">+1000 🪙</button>
          </div>

          <div class="chipsRow" id="chipsRow"></div>

          <div class="betRow">
            <button class="btnSmall" id="minus">-</button>
            <input class="betInput" id="betInput" type="number" min="1" step="1" value="50" />
            <button class="btnSmall" id="plus">+</button>
          </div>

          <div class="actions">
            <button class="btn primary" id="joinBtn">Войти в раунд</button>
            <button class="btn danger" id="cashBtn" disabled>Забрать</button>
          </div>

          <div class="rightHint" id="rightHint">
            Монеты виртуальные, без вывода.
          </div>
        </div>
      </div>
    </div>
  `;

  // Elements
  const elSubtitle = document.getElementById("subtitle");
  const elBal = document.getElementById("bal");

  const miniMult = document.getElementById("miniMult");
  const miniMultHint = document.getElementById("miniMultHint");
  const miniRound = document.getElementById("miniRound");
  const miniRoundHint = document.getElementById("miniRoundHint");
  const miniBet = document.getElementById("miniBet");
  const miniBetHint = document.getElementById("miniBetHint");

  const centerMult = document.getElementById("centerMult");
  const centerSub = document.getElementById("centerSub");

  const canvas = document.getElementById("chart");
  const rocket = document.getElementById("rocket");

  const soundBtn = document.getElementById("soundBtn");

  const chipsRow = document.getElementById("chipsRow");
  const betInput = document.getElementById("betInput");
  const btnMinus = document.getElementById("minus");
  const btnPlus = document.getElementById("plus");
  const joinBtn = document.getElementById("joinBtn");
  const cashBtn = document.getElementById("cashBtn");
  const bonusBtn = document.getElementById("bonus");

  // ---------- Topbar render ----------
  function renderTopbar() {
    const name = tgUser?.first_name ? `Привет, ${tgUser.first_name}` : `Открыто вне Telegram`;
    elSubtitle.textContent = name;
    elBal.textContent = String(wallet.coins);
  }
  renderTopbar();

  // ---------- Sound (WebAudio, no files needed) ----------
  let soundOn = true;
  let audioCtx = null;

  function beep(freq = 660, dur = 0.06, type = "sine", vol = 0.04) {
    if (!soundOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime;
      o.start(t);
      o.stop(t + dur);
    } catch {}
  }

  soundBtn.onclick = () => {
    soundOn = !soundOn;
    soundBtn.textContent = `Звук: ${soundOn ? "on" : "off"}`;
    beep(soundOn ? 740 : 320, 0.08, "triangle", 0.05);
  };

  // ---------- Bet UI ----------
  const chips = [10, 50, 100, 250, 500];
  function renderChips() {
    chipsRow.innerHTML = chips.map(v => `<button class="chip" data-b="${v}">${v}</button>`).join("") +
      `<button class="chip" data-b="max">MAX</button>`;
    chipsRow.querySelectorAll(".chip").forEach(b => {
      b.onclick = () => {
        const val = b.dataset.b;
        if (val === "max") betInput.value = String(wallet.coins);
        else betInput.value = String(val);
        clampBet();
      };
    });
  }
  renderChips();

  function clampBet() {
    let v = Math.floor(Number(betInput.value) || 0);
    if (v < 1) v = 1;
    if (v > wallet.coins) v = wallet.coins;
    betInput.value = String(v);
    return v;
  }
  btnMinus.onclick = () => { betInput.value = String((Number(betInput.value) || 1) - 10); clampBet(); };
  btnPlus.onclick = () => { betInput.value = String((Number(betInput.value) || 1) + 10); clampBet(); };
  betInput.oninput = clampBet;

  bonusBtn.onclick = () => addCoins(1000);

  // ---------- Game State ----------
  const PHASE = { WAIT: "WAIT", FLY: "FLY", CRASH: "CRASH" };

  let phase = PHASE.WAIT;
  let round = 1;

  // timing
  let waitSeconds = 4;
  let waitLeft = waitSeconds;
  let waitLastTick = 0;

  // curve parameters
  const growth = 0.18; // multiplier growth speed
  let crashPoint = sampleCrashPoint();
  let t0 = 0;          // flight start time (ms)
  let tNow = 0;
  let tCrash = 0;      // seconds until crash
  let mult = 1.0;

  // player
  let inRound = false;
  let bet = 0;
  let cashed = false;
  let cashMult = 1.0;

  // visuals cache
  let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  let cw = 0, ch = 0;
  let padding = { l: 48, r: 18, t: 18, b: 34 };

  // ---------- Canvas Resize ----------
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    cw = Math.max(1, Math.floor(rect.width));
    ch = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", () => {
    resizeCanvas();
    draw(); // redraw on resize
  });
  resizeCanvas();

  // ---------- Helpers ----------
  function fmtMult(x) { return `x${x.toFixed(2)}`; }
  function fmtCoins(x) { return `${Math.floor(x)} 🪙`; }

  function setMini() {
    miniRound.textContent = String(round);

    if (phase === PHASE.WAIT) {
      miniMult.textContent = "x1.00";
      miniMultHint.textContent = `Старт через ${Math.ceil(waitLeft)}с`;
      miniRoundHint.textContent = "Идёт отсчёт";
      centerMult.textContent = "1.00x";
      centerSub.textContent = `Ожидание следующего раунда (${Math.ceil(waitLeft)}с)`;
    }

    if (phase === PHASE.FLY) {
      miniMult.textContent = fmtMult(mult);
      miniMultHint.textContent = "Полет…";
      miniRoundHint.textContent = "Идёт раунд";
      centerMult.textContent = `${mult.toFixed(2)}x`;
      centerSub.textContent = inRound ? (cashed ? "Ты забрал ✅" : "Ты в раунде") : "Ты не в раунде";
    }

    if (phase === PHASE.CRASH) {
      miniMult.textContent = fmtMult(mult);
      miniMultHint.textContent = "Краш!";
      miniRoundHint.textContent = "Раунд завершён";
      centerMult.textContent = `${mult.toFixed(2)}x`;
      centerSub.textContent = "🚀 Улетела… новый раунд скоро";
    }

    miniBet.textContent = inRound ? fmtCoins(bet) : "—";
    if (!inRound) miniBetHint.textContent = "не в раунде";
    else if (phase === PHASE.WAIT) miniBetHint.textContent = "вход подтверждён";
    else if (phase === PHASE.FLY) miniBetHint.textContent = cashed ? `забрал на ${cashMult.toFixed(2)}x` : "в полёте";
    else miniBetHint.textContent = cashed ? "профит ✅" : "не успел ❌";
  }

  // ---------- Flight math ----------
  function multAt(tSec) {
    // exponential growth
    return Math.exp(growth * tSec);
  }

  // ---------- Round control ----------
  function resetRound() {
    phase = PHASE.WAIT;
    waitLeft = waitSeconds;
    waitLastTick = performance.now();
    crashPoint = sampleCrashPoint();

    // clear flight
    mult = 1.0;
    cashed = false;
    cashMult = 1.0;

    // Player stays "inRound" only if he joined in WAIT;
    // After crash, auto-exit
    inRound = false;
    bet = 0;

    joinBtn.disabled = false;
    cashBtn.disabled = true;

    setMini();
    draw();
  }

  function startFlight() {
    phase = PHASE.FLY;
    t0 = performance.now();
    mult = 1.0;

    // compute crash time (seconds)
    tCrash = Math.log(crashPoint) / growth;

    joinBtn.disabled = true;
    cashBtn.disabled = !inRound || cashed;

    beep(880, 0.08, "triangle", 0.05);
    setMini();
  }

  function doCrash() {
    phase = PHASE.CRASH;
    mult = crashPoint;

    // If player was in and didn't cash — lose bet (already deducted on join)
    if (inRound && !cashed) {
      beep(220, 0.12, "sawtooth", 0.06);
    } else {
      beep(520, 0.08, "sine", 0.05);
    }

    joinBtn.disabled = true;
    cashBtn.disabled = true;
    setMini();
  }

  function scheduleNextRound() {
    // after short pause, new round
    setTimeout(() => {
      round += 1;
      resetRound();
    }, 1800);
  }

  // ---------- Player actions ----------
  function canJoin() {
    return phase === PHASE.WAIT && waitLeft > 0.3; // only before start
  }

  joinBtn.onclick = () => {
    if (!canJoin()) return;

    const v = clampBet();
    if (v <= 0) return;
    if (v > wallet.coins) return alert("Недостаточно монет");

    // enter
    bet = v;
    inRound = true;
    cashed = false;
    cashMult = 1.0;

    addCoins(-bet); // deduct at join
    beep(660, 0.06, "square", 0.04);

    // disable join once entered, but still can change bet if exit? we don't have exit now
    joinBtn.disabled = true;
    cashBtn.disabled = true;

    setMini();
  };

  cashBtn.onclick = () => {
    if (phase !== PHASE.FLY) return;
    if (!inRound || cashed) return;

    cashed = true;
    cashMult = mult;

    const payout = Math.floor(bet * cashMult);
    addCoins(payout);

    cashBtn.disabled = true;
    beep(980, 0.10, "triangle", 0.06);

    setMini();
  };

  // ---------- Drawing ----------
  function drawGrid(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "#a9b7ff";
    ctx.lineWidth = 1;

    const gx = 8;
    const gy = 5;
    const w = cw - padding.l - padding.r;
    const h = ch - padding.t - padding.b;

    for (let i = 0; i <= gx; i++) {
      const x = padding.l + (w * i) / gx;
      ctx.beginPath();
      ctx.moveTo(x, padding.t);
      ctx.lineTo(x, padding.t + h);
      ctx.stroke();
    }
    for (let j = 0; j <= gy; j++) {
      const y = padding.t + (h * j) / gy;
      ctx.beginPath();
      ctx.moveTo(padding.l, y);
      ctx.lineTo(padding.l + w, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function curvePointToCanvas(tSec, mVal, xMax, yMax) {
    const w = cw - padding.l - padding.r;
    const h = ch - padding.t - padding.b;

    const x = padding.l + (tSec / xMax) * w;

    // Use log scale to keep curve visible
    const yNorm = Math.log(mVal) / Math.log(yMax); // 0..1
    const y = padding.t + h - yNorm * h;
    return { x, y };
  }

  function drawCurve(ctx, xMax, yMax) {
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,110,110,.95)";
    ctx.shadowColor = "rgba(255,90,90,.55)";
    ctx.shadowBlur = 10;

    const steps = 140;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * xMax;
      const mVal = multAt(t);
      const p = curvePointToCanvas(t, mVal, xMax, yMax);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function setRocketAt(tSec, mVal, xMax, yMax) {
    const p = curvePointToCanvas(tSec, mVal, xMax, yMax);

    // rocket div (26x26). Convert canvas-space to CSS translate in chartWrap
    // canvas occupies full chartWrap, so coords match.
    const rx = p.x - 13;
    const ry = p.y - 13;
    rocket.style.transform = `translate(${rx}px, ${ry}px)`;

    // Hide rocket when waiting (show at start position), hide after crash for "улетела"
    if (phase === PHASE.WAIT) {
      rocket.style.opacity = "0";
    } else if (phase === PHASE.FLY) {
      rocket.style.opacity = "1";
    } else {
      // crash: hide rocket after short moment
      rocket.style.opacity = "0";
    }
  }

  function draw() {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, cw, ch);

    // Determine dynamic graph scales
    // xMax: show full flight duration; while flying show a bit ahead
    const xMax = (phase === PHASE.FLY) ? Math.max(4, Math.min(tCrash + 1.0, 14)) : 10;
    // yMax: cap to crashpoint (or 10)
    const yMax = (phase === PHASE.FLY) ? Math.max(6, Math.min(crashPoint * 1.15, 80)) : 10;

    drawGrid(ctx);
    drawCurve(ctx, xMax, yMax);

    // current point for rocket
    let tSec = 0;
    let mVal = 1;
    if (phase === PHASE.FLY) {
      tSec = (performance.now() - t0) / 1000;
      tSec = Math.max(0, Math.min(tSec, xMax));
      mVal = Math.max(1, mult);
    } else if (phase === PHASE.CRASH) {
      tSec = Math.min(tCrash, xMax);
      mVal = crashPoint;
    }
    setRocketAt(tSec, mVal, xMax, yMax);
  }

  // ---------- Main Loop ----------
  function tick(now) {
    if (phase === PHASE.WAIT) {
      const dt = (now - waitLastTick) / 1000;
      waitLastTick = now;
      waitLeft -= dt;

      // tick beep each second
      const secInt = Math.ceil(waitLeft);
      const prevSecInt = Math.ceil(waitLeft + dt);
      if (secInt !== prevSecInt && secInt > 0) beep(520, 0.05, "sine", 0.03);

      if (waitLeft <= 0) {
        // Start flight
        waitLeft = 0;
        startFlight();
      } else {
        // Enable join if not joined
        joinBtn.disabled = inRound || !canJoin();
        cashBtn.disabled = true;
        setMini();
      }
    }

    if (phase === PHASE.FLY) {
      tNow = now;
      const tSec = (tNow - t0) / 1000;
      mult = multAt(tSec);

      // cash available only if inRound and not cashed
      cashBtn.disabled = !(inRound && !cashed);

      if (tSec >= tCrash) {
        // Crash moment
        doCrash();
        scheduleNextRound();
      }
      setMini();
    }

    if (phase === PHASE.CRASH) {
      // nothing; waiting for reset timer
    }

    draw();
    requestAnimationFrame(tick);
  }

  // ---------- Initial state ----------
  function init() {
    // place rocket at start and hide
    rocket.style.opacity = "0";
    joinBtn.disabled = false;
    cashBtn.disabled = true;
    setMini();
    draw();
    requestAnimationFrame(tick);
  }

  init();
})();
