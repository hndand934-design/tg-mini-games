/* Rocket Crash v1 (only Crash)
   - Canvas строго внутри блока (не на весь экран)
   - Ракета летит по линии графика
   - При краше: ракета исчезает, надпись "УЛЕТЕЛА" / "КРАШ"
   - Звук on/off (WebAudio)
   - Вход в раунд только ДО старта (есть отсчёт)
   - Кеш-аут в полёте
   - Виртуальные монеты в localStorage
*/

(() => {
  // --- RNG (честный) ---
  function randFloat() {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 2 ** 32;
  }
  function randInt(min, max) {
    return Math.floor(randFloat() * (max - min + 1)) + min;
  }

  // --- Telegram WebApp ---
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  // --- DOM ---
  const elUser = document.getElementById("user");
  const elBalance = document.getElementById("balance");
  const elMultBig = document.getElementById("multBig");
  const elHint = document.getElementById("hint");
  const elMultSmall = document.getElementById("multSmall");
  const elYourBet = document.getElementById("yourBet");
  const elYourState = document.getElementById("yourState");

  const canvas = document.getElementById("chart");
  const ctx = canvas.getContext("2d");

  const rocketEl = document.getElementById("rocket");
  const btnSound = document.getElementById("soundBtn");

  const betInput = document.getElementById("bet");
  const btnMinus = document.getElementById("minus");
  const btnPlus = document.getElementById("plus");

  const btnJoin = document.getElementById("joinBtn");
  const btnCash = document.getElementById("cashBtn");
  const btnBonus = document.getElementById("bonusBtn");

  // --- User label ---
  const user = tg?.initDataUnsafe?.user;
  if (elUser) {
    elUser.textContent = user ? `Открыто в Telegram` : `Открыто вне Telegram`;
  }

  // --- Wallet ---
  const WALLET_KEY = "rocket_wallet_v1";
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
    renderBalance();
  }
  function addCoins(d) {
    setCoins(wallet.coins + d);
  }
  function renderBalance() {
    if (elBalance) elBalance.textContent = String(wallet.coins);
  }
  renderBalance();

  // --- Resize canvas to container ---
  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // рисуем в css-пикселях
    draw(); // перерисовать
  }
  window.addEventListener("resize", () => fitCanvas());
  fitCanvas();

  // --- Sound (WebAudio) ---
  let soundOn = true;
  let audioCtx = null;

  function beep(freq = 880, ms = 80, vol = 0.06) {
    if (!soundOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audioCtx.currentTime;

      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();

      o.type = "sine";
      o.frequency.setValueAtTime(freq, t0);

      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);

      o.connect(g);
      g.connect(audioCtx.destination);

      o.start(t0);
      o.stop(t0 + ms / 1000 + 0.02);
    } catch {}
  }

  function crashSound() {
    beep(220, 140, 0.08);
    setTimeout(() => beep(160, 180, 0.08), 80);
  }

  function winSound() {
    beep(980, 70, 0.07);
    setTimeout(() => beep(1320, 90, 0.07), 60);
  }

  function tickSound() {
    beep(740, 45, 0.04);
  }

  function setSoundUI() {
    btnSound.textContent = soundOn ? "Звук: on" : "Звук: off";
  }
  btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    setSoundUI();
    // на мобилах звук включится после клика — норм
    if (soundOn) beep(880, 40, 0.04);
  });
  setSoundUI();

  // --- Bet input helpers ---
  function clampBet() {
    let v = Math.floor(Number(betInput.value) || 0);
    if (v < 1) v = 1;
    if (v > wallet.coins) v = wallet.coins;
    betInput.value = String(v);
    return v;
  }

  document.querySelectorAll(".chip").forEach((b) => {
    b.addEventListener("click", () => {
      const val = b.dataset.bet;
      if (val === "max") betInput.value = String(wallet.coins);
      else betInput.value = String(val);
      clampBet();
    });
  });

  btnMinus.addEventListener("click", () => {
    betInput.value = String((Number(betInput.value) || 1) - 10);
    clampBet();
  });
  btnPlus.addEventListener("click", () => {
    betInput.value = String((Number(betInput.value) || 1) + 10);
    clampBet();
  });
  betInput.addEventListener("input", clampBet);

  btnBonus.addEventListener("click", () => addCoins(1000));

  // --- Game state ---
  const STATE = {
    phase: "waiting", // waiting | countdown | flying | crashed
    countdownLeft: 3.0,
    mult: 1.0,
    t: 0,
    crashPoint: 2.0,

    // игрок
    inRound: false,
    bet: 0,
    cashed: false,
    cashMult: 0,

    // анимация
    lastTs: 0,
    points: [], // {x,y,mult,t}
  };

  // --- Crash point (tail distribution) ---
  // 1/(1-r) даёт "хвост". Ограничим верх чтоб не улетало в космос.
  function generateCrashPoint() {
    const r = randFloat();
    const raw = 1 / (1 - r);
    const capped = Math.min(raw, 40);   // максимум 40x (можешь увеличить)
    return Math.max(1.05, capped);
  }

  // --- Mult curve (похоже на краш) ---
  function multAt(t) {
    // плавный рост, похожий на кривую; ускорение со временем
    // t в секундах
    const a = 0.22;
    const b = 0.085;
    return 1 + t * a + (t * t) * b;
  }

  // --- UI render ---
  function setCenter(multText, hintText) {
    elMultBig.textContent = multText;
    elHint.textContent = hintText;
  }

  function setTopSmall(multSmallText, yourBetText, yourStateText) {
    elMultSmall.textContent = multSmallText;
    elYourBet.textContent = yourBetText;
    elYourState.textContent = yourStateText;
  }

  function updateButtons() {
    if (STATE.phase === "waiting") {
      btnJoin.disabled = false;
      btnCash.disabled = true;
      btnJoin.textContent = STATE.inRound ? "В раунде" : "Войти в раунд";
    } else if (STATE.phase === "countdown") {
      // вход только до старта: в отсчёт можно войти (как у многих) — но ты просил ДО старта.
      // значит во время countdown закрываем вход:
      btnJoin.disabled = true;
      btnJoin.textContent = STATE.inRound ? "В раунде" : "Вход закрыт";
      btnCash.disabled = true;
    } else if (STATE.phase === "flying") {
      btnJoin.disabled = true;
      btnJoin.textContent = STATE.inRound ? "В раунде" : "Вход закрыт";
      btnCash.disabled = !STATE.inRound || STATE.cashed;
    } else if (STATE.phase === "crashed") {
      btnJoin.disabled = true;
      btnCash.disabled = true;
    }
  }

  function renderTexts() {
    const m = STATE.mult;
    const mStr = `${m.toFixed(2)}x`;

    if (STATE.phase === "waiting") {
      setCenter("1.00x", "Ожидание — старт скоро");
    } else if (STATE.phase === "countdown") {
      setCenter("1.00x", `Ожидание следующего раунда (${Math.ceil(STATE.countdownLeft)}с)`);
    } else if (STATE.phase === "flying") {
      setCenter(mStr, STATE.inRound ? "" : "Ты не в раунде");
    } else if (STATE.phase === "crashed") {
      setCenter(mStr, m >= STATE.crashPoint ? "💥 Краш!" : "💥 Краш!");
    }

    const yourBetText = STATE.inRound ? `${STATE.bet} 🪙` : "—";
    let yourStateText = "не в раунде";
    if (STATE.inRound && !STATE.cashed && STATE.phase === "flying") yourStateText = "в полёте";
    if (STATE.inRound && STATE.cashed) yourStateText = `забрал на ${STATE.cashMult.toFixed(2)}x`;
    if (STATE.inRound && !STATE.cashed && STATE.phase === "crashed") yourStateText = "сгорел";

    setTopSmall(mStr, yourBetText, yourStateText);
    updateButtons();
  }

  // --- Coordinate helpers (graph) ---
  function graphRect() {
    // рисуем внутри canvas (css px)
    const w = canvas.getBoundingClientRect().width;
    const h = canvas.getBoundingClientRect().height;
    const pad = 18;
    return {
      x: pad,
      y: pad,
      w: w - pad * 2,
      h: h - pad * 2,
      pad
    };
  }

  function niceMaxMult() {
    // чтобы график красиво масштабировался
    // берём максимум между текущим и crashPoint, округляем
    const v = Math.max(STATE.mult, STATE.crashPoint, 2);
    if (v < 3) return 3;
    if (v < 5) return 5;
    if (v < 10) return 10;
    if (v < 20) return 20;
    return 40;
  }

  function maxTime() {
    // время на оси X — по росту multiplier
    // ограничим чтобы линия не упиралась
    const target = niceMaxMult();
    // решим t из multAt(t)=target (приблизительно)
    // multAt(t)=1 + a t + b t^2 => b t^2 + a t + (1-target)=0
    const a = 0.22, b = 0.085;
    const c = 1 - target;
    const D = a * a - 4 * b * c;
    const t = (-a + Math.sqrt(Math.max(0, D))) / (2 * b);
    return Math.max(6, Math.min(18, t + 1)); // 6..18 сек
  }

  function toXY(t, mult) {
    const r = graphRect();
    const tMax = maxTime();
    const mMax = niceMaxMult();

    const x = r.x + (t / tMax) * r.w;
    // y: 1.0 внизу, mMax наверху
    const y = r.y + r.h - ((mult - 1) / (mMax - 1)) * r.h;
    return { x, y };
  }

  // --- Draw graph (grid + line + fill) ---
  function drawGrid() {
    const r = graphRect();

    // фон
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // grid
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "rgba(255,255,255,.18)";
    ctx.lineWidth = 1;

    const cols = 8;
    const rows = 6;

    for (let i = 0; i <= cols; i++) {
      const x = r.x + (r.w * i) / cols;
      ctx.beginPath();
      ctx.moveTo(x, r.y);
      ctx.lineTo(x, r.y + r.h);
      ctx.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      const y = r.y + (r.h * j) / rows;
      ctx.beginPath();
      ctx.moveTo(r.x, y);
      ctx.lineTo(r.x + r.w, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawLine() {
    const pts = STATE.points;
    if (pts.length < 2) return;

    // fill under curve
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "rgba(255,91,110,.35)";
    ctx.beginPath();
    const p0 = toXY(pts[0].t, pts[0].mult);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
      const p = toXY(pts[i].t, pts[i].mult);
      ctx.lineTo(p.x, p.y);
    }
    // вниз к оси
    const r = graphRect();
    const plast = toXY(pts[pts.length - 1].t, pts[pts.length - 1].mult);
    ctx.lineTo(plast.x, r.y + r.h);
    ctx.lineTo(p0.x, r.y + r.h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // stroke curve
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,91,110,.95)";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
      const p = toXY(pts[i].t, pts[i].mult);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function placeRocket() {
    // ракета только в полёте (и если есть точки)
    if (STATE.phase !== "flying" || STATE.points.length < 2) {
      rocketEl.classList.add("hide");
      return;
    }
    rocketEl.classList.remove("hide");

    const last = STATE.points[STATE.points.length - 1];
    const p = toXY(last.t, last.mult);

    // Поворот по направлению линии
    const prev = STATE.points[Math.max(0, STATE.points.length - 6)];
    const p2 = toXY(prev.t, prev.mult);
    const ang = Math.atan2(p.y - p2.y, p.x - p2.x);

    // 🧊 зимняя "ракетка" — можно заменить на SVG позже
    rocketEl.textContent = "🚀";
    rocketEl.style.left = `${p.x}px`;
    rocketEl.style.top = `${p.y}px`;
    rocketEl.style.transform = `translate(-12px, -18px) rotate(${ang}rad)`;
  }

  function draw() {
    drawGrid();
    drawLine();
    placeRocket();
  }

  // --- Round flow ---
  function resetRound() {
    STATE.phase = "countdown";
    STATE.countdownLeft = 3.0;

    STATE.mult = 1.0;
    STATE.t = 0;
    STATE.crashPoint = generateCrashPoint();

    STATE.points = [{ t: 0, mult: 1.0 }];

    // игрок на новый раунд:
    STATE.inRound = false;
    STATE.cashed = false;
    STATE.cashMult = 0;

    renderTexts();
    draw();
  }

  // стартуем с ожидания
  resetRound();

  // --- Enter round (bet) ---
  btnJoin.addEventListener("click", () => {
    if (STATE.phase !== "waiting") {
      // В текущей версии waiting не используется (мы сразу в countdown),
      // поэтому разрешим вход только до окончания countdown? но ты просил ДО старта.
      // Значит: разрешаем вход ТОЛЬКО когда countdownLeft > 0 и ещё не было "lock".
      // Чтобы проще: разрешаем вход в самом начале countdown, пока > 1.5с.
    }

    if (STATE.phase !== "countdown") return;

    // вход разрешён только если ещё далеко до старта
    if (STATE.countdownLeft < 2.0) return;

    const bet = clampBet();
    if (bet <= 0) return;
    if (bet > wallet.coins) return alert("Недостаточно монет");

    addCoins(-bet);

    STATE.inRound = true;
    STATE.bet = bet;
    STATE.cashed = false;
    STATE.cashMult = 0;

    tickSound();
    renderTexts();
  });

  // --- Cash out ---
  btnCash.addEventListener("click", () => {
    if (STATE.phase !== "flying") return;
    if (!STATE.inRound || STATE.cashed) return;

    STATE.cashed = true;
    STATE.cashMult = STATE.mult;

    const payout = Math.floor(STATE.bet * STATE.cashMult);
    addCoins(payout);

    winSound();
    renderTexts();
  });

  // --- Main loop ---
  function loop(ts) {
    const dt = Math.min(0.05, (ts - (STATE.lastTs || ts)) / 1000);
    STATE.lastTs = ts;

    if (STATE.phase === "countdown") {
      STATE.countdownLeft -= dt;
      if (STATE.countdownLeft <= 0) {
        STATE.phase = "flying";
        STATE.t = 0;
        STATE.mult = 1.0;
        STATE.points = [{ t: 0, mult: 1.0 }];
        renderTexts();
        draw();
      } else {
        // обновляем текст таймера раз в кадр, но без перерисовки линии
        renderTexts();
      }
    } else if (STATE.phase === "flying") {
      STATE.t += dt;
      STATE.mult = multAt(STATE.t);

      // добавляем точку (не слишком часто)
      const last = STATE.points[STATE.points.length - 1];
      if (!last || STATE.t - last.t >= 0.06) {
        STATE.points.push({ t: STATE.t, mult: STATE.mult });
        if (STATE.points.length > 420) STATE.points.shift();
      }

      // crash check
      if (STATE.mult >= STATE.crashPoint) {
        STATE.mult = STATE.crashPoint;
        STATE.points.push({ t: STATE.t, mult: STATE.mult });

        STATE.phase = "crashed";

        // ракета пропадает
        rocketEl.classList.add("hide");

        // если был в раунде и не забрал — сгорел (ставка уже списана)
        crashSound();
        renderTexts();
        draw();

        // пауза и новый раунд
        setTimeout(() => {
          resetRound();
        }, 2000);
      } else {
        renderTexts();
        draw();
      }
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Пояснение честности (по клику на бейдж можно показать crashPoint — опционально)
  // сейчас без лишних элементов, чтобы не было "квадратиков"
})();
