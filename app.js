(() => {
  // =========================
  // Rocket Crash FINAL (stable UI + 60fps + sounds)
  // =========================

  const tg = window.Telegram?.WebApp;
  try { tg?.ready(); tg?.expand(); } catch {}

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);

  const subTitle   = $("subTitle");
  const balanceEl  = $("balance");

  const soundBtn   = $("soundBtn");
  const soundDot   = $("soundDot");
  const soundText  = $("soundText");
  const soundMini  = $("soundMini");

  const bonusBtn   = $("bonusBtn");

  const multVal    = $("multVal");
  const multHint   = $("multHint");
  const statusVal  = $("statusVal");
  const statusHint = $("statusHint");
  const betVal     = $("betVal");
  const betHint    = $("betHint");

  const overlayX   = $("overlayX");
  const overlayText= $("overlayText");
  const bottomLine = $("bottomLine");

  const betInput   = $("betInput");
  const betMinus   = $("betMinus");
  const betPlus    = $("betPlus");
  const joinBtn    = $("joinBtn");
  const cashBtn    = $("cashBtn");

  const canvas     = $("graph");
  const ctx2d      = canvas.getContext("2d", { alpha: false });

  const chips      = Array.from(document.querySelectorAll(".chip"));

  // ---- RNG ----
  function randFloat() {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 2 ** 32;
  }

  // ---- wallet ----
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
    balanceEl.textContent = String(wallet.coins);
  }
  function addCoins(d) { setCoins(wallet.coins + d); }

  // ---- sound ----
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

  function sStart() { beep(520, 45, 0.02); setTimeout(() => beep(760, 70, 0.03), 65); }
  function sCrash() { beep(170, 120, 0.05, "sawtooth"); setTimeout(() => beep(120, 160, 0.04, "square"), 60); }
  function sCash()  { beep(760, 60, 0.03); setTimeout(() => beep(920, 60, 0.03), 80); }

  function renderSoundUI() {
    soundText.textContent = soundOn ? "Звук on" : "Звук off";
    soundMini.textContent = soundOn ? "on" : "off";
    soundDot.style.background = soundOn ? "#26d47b" : "#ff5a6a";
    soundDot.style.boxShadow  = soundOn
      ? "0 0 0 3px rgba(38,212,123,.14)"
      : "0 0 0 3px rgba(255,90,106,.14)";
  }

  // ---- state ----
  const STATE = { WAIT:"wait", FLY:"fly", CRASH:"crash" };
  let state = STATE.WAIT;

  let waitDuration = 5;
  let waitLeft = waitDuration;
  let waitTimer = null;

  let raf = 0;
  let startTs = 0;
  let currentX = 1.0;
  let crashPoint = 1.01;

  let inRound = false;
  let bet = 100;
  let playerBet = 0;
  let cashed = false;
  let cashedAt = 0;

  let pts = [];

  // ---- helpers ----
  const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
  const fmt2 = (x)=> (Math.round(x*100)/100).toFixed(2);

  function setBigModeFlying(on){
    const gamePanel = document.querySelector(".panel--game");
    gamePanel.classList.toggle("fly", !!on);
  }

  function setUI(){
    // плашки — всегда синхроним
    multVal.textContent = `x${fmt2(currentX)}`;
    overlayX.textContent = `${fmt2(currentX)}x`;

    // ставка-плашка
    betVal.textContent = inRound ? `+${playerBet} 🪙` : "—";
    betHint.textContent = inRound
      ? (state === STATE.FLY ? (cashed ? `забрал x${fmt2(cashedAt)}` : "в раунде") : "вошёл")
      : "не в раунде";

    // статус
    if (state === STATE.WAIT) {
      multHint.textContent = "Ожидание";
      statusVal.textContent = "Раунд";
      statusHint.textContent = `Старт через ${waitLeft}с`;
      overlayText.textContent = inRound ? "Ты в раунде" : "Ты не в раунде";
      bottomLine.textContent = `Новый раунд через ${waitLeft}с…`;
    }

    if (state === STATE.FLY) {
      multHint.textContent = "Растёт…";
      statusVal.textContent = "Полёт";
      statusHint.textContent = inRound ? "Можно забрать" : "Ты не в раунде";
      overlayText.textContent = inRound ? "Ты в раунде" : "Ты не в раунде";
      bottomLine.textContent = "В полёте можно “Забрать”.";
    }

    if (state === STATE.CRASH) {
      multHint.textContent = "Краш!";
      statusVal.textContent = "Краш";
      statusHint.textContent = "Раунд завершён";
      overlayText.textContent = "Ракета улетела";
      bottomLine.textContent = "Скоро следующий раунд…";
    }

    // кнопки
    joinBtn.disabled = !(state === STATE.WAIT) || inRound;
    cashBtn.disabled = !(state === STATE.FLY && inRound && !cashed);
  }

  function stopAllTimers(){
    if (waitTimer) { clearInterval(waitTimer); waitTimer = null; }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  // ---- crash point RNG ----
  function genCrashPoint(){
    const u = Math.max(1e-12, randFloat());
    const p = 1.35;
    const k = 1.55;
    const x = 1 + Math.pow(-Math.log(u), p) * k;
    return clamp(x, 1.01, 200);
  }

  // ---- growth ----
  function xFromTime(t){
    const a = 0.35;
    const b = 0.055;
    return 1 + a*t + b*t*t;
  }

  // ---- canvas ----
  function resizeCanvas(){
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const r = canvas.getBoundingClientRect();
    const w = Math.floor(r.width * dpr);
    const h = Math.floor(r.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function draw(){
    resizeCanvas();
    const w = canvas.width, h = canvas.height;

    ctx2d.fillStyle = "#000";
    ctx2d.fillRect(0,0,w,h);

    const padL = Math.floor(w*0.07);
    const padR = Math.floor(w*0.04);
    const padT = Math.floor(h*0.10);
    const padB = Math.floor(h*0.12);
    const pw = w - padL - padR;
    const ph = h - padT - padB;

    // grid
    ctx2d.strokeStyle = "rgba(255,255,255,.06)";
    ctx2d.lineWidth = Math.max(1, Math.floor(w*0.0012));
    for (let i=0;i<=6;i++){
      const x = padL + (pw*i)/6;
      ctx2d.beginPath();
      ctx2d.moveTo(x,padT);
      ctx2d.lineTo(x,padT+ph);
      ctx2d.stroke();
    }
    for (let j=0;j<=4;j++){
      const y = padT + (ph*j)/4;
      ctx2d.beginPath();
      ctx2d.moveTo(padL,y);
      ctx2d.lineTo(padL+pw,y);
      ctx2d.stroke();
    }

    if (pts.length < 2) return;

    const last = pts[pts.length-1];
    const maxT = Math.max(3, last.t);
    const maxX = Math.max(2, last.x);

    const X = (t)=> padL + (t/maxT)*pw;
    const Y = (x)=> padT + ph - ((x-1)/(maxX-1))*ph;

    const path = new Path2D();
    path.moveTo(X(pts[0].t), Y(pts[0].x));
    for (let i=1;i<pts.length;i++) path.lineTo(X(pts[i].t), Y(pts[i].x));

    // area
    const area = new Path2D(path);
    area.lineTo(X(last.t), padT+ph);
    area.lineTo(X(pts[0].t), padT+ph);
    area.closePath();

    const grad = ctx2d.createLinearGradient(0, padT, 0, padT+ph);
    grad.addColorStop(0, "rgba(255,90,106,.35)");
    grad.addColorStop(1, "rgba(255,90,106,.00)");
    ctx2d.fillStyle = grad;
    ctx2d.fill(area);

    // line
    ctx2d.strokeStyle = "rgba(255,120,140,.95)";
    ctx2d.lineWidth = Math.max(2, Math.floor(w*0.004));
    ctx2d.lineCap = "round";
    ctx2d.lineJoin = "round";
    ctx2d.stroke(path);

    // “ракета-точка” в конце (чуть веселее)
    const lx = X(last.t), ly = Y(last.x);
    ctx2d.fillStyle = "rgba(255,170,190,.95)";
    ctx2d.beginPath();
    ctx2d.arc(lx, ly, Math.max(3, Math.floor(w*0.007)), 0, Math.PI*2);
    ctx2d.fill();

    // маленький “нос” (треугольник)
    ctx2d.fillStyle = "rgba(255,200,210,.92)";
    ctx2d.beginPath();
    ctx2d.moveTo(lx + 10, ly);
    ctx2d.lineTo(lx - 2, ly - 6);
    ctx2d.lineTo(lx - 2, ly + 6);
    ctx2d.closePath();
    ctx2d.fill();
  }

  // ---- flow ----
  function startWait(){
    stopAllTimers();
    setBigModeFlying(false);

    state = STATE.WAIT;
    currentX = 1.0;
    crashPoint = genCrashPoint();
    pts = [{t:0, x:1.0}];

    waitLeft = waitDuration;
    cashed = false;
    cashedAt = 0;

    setUI();
    draw();

    waitTimer = setInterval(() => {
      if (state !== STATE.WAIT) return;
      waitLeft -= 1;
      if (waitLeft <= 0){
        clearInterval(waitTimer);
        waitTimer = null;
        startFly();
        return;
      }
      setUI();
    }, 1000);
  }

  function startFly(){
    stopAllTimers();
    setBigModeFlying(true);

    state = STATE.FLY;
    startTs = performance.now();
    pts = [{t:0, x:1.0}];
    currentX = 1.0;

    sStart();
    setUI();

    const tick = () => {
      if (state !== STATE.FLY) return;

      const now = performance.now();
      const t = (now - startTs) / 1000;

      let x = xFromTime(t);
      if (x >= crashPoint) x = crashPoint;

      currentX = x;
      pts.push({t, x});
      if (pts.length > 1400) pts.shift();

      setUI();
      draw();

      if (x >= crashPoint){
        endCrash();
        return;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
  }

  function endCrash(){
    stopAllTimers();
    setBigModeFlying(false);

    state = STATE.CRASH;

    // если был в раунде и не забрал — сгорело
    if (inRound && !cashed) {
      betHint.textContent = "ставка сгорела";
    }

    sCrash();
    setUI();
    draw();

    setTimeout(() => {
      // новый раунд
      inRound = false;
      playerBet = 0;
      cashed = false;
      cashedAt = 0;
      startWait();
    }, 3000);
  }

  // ---- bet controls ----
  function setBet(v){
    v = Math.floor(Number(v) || 1);
    v = Math.max(1, v);
    v = Math.min(v, wallet.coins || 1);
    bet = v;
    betInput.value = String(v);
  }

  // ---- actions ----
  function joinRound(){
    if (state !== STATE.WAIT) return;
    if (inRound) return;

    const v = Math.floor(Number(betInput.value) || 0);
    if (v <= 0) return alert("Ставка должна быть больше 0");
    if (v > wallet.coins) return alert("Недостаточно монет");

    addCoins(-v);
    inRound = true;
    playerBet = v;
    cashed = false;
    cashedAt = 0;

    beep(680, 70, 0.02);
    setUI();
  }

  function cashout(){
    if (state !== STATE.FLY) return;
    if (!inRound || cashed) return;

    cashed = true;
    cashedAt = currentX;

    const payout = Math.floor(playerBet * cashedAt);
    addCoins(payout);

    sCash();
    setUI();
  }

  // ---- events ----
  window.addEventListener("resize", () => { draw(); });

  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    renderSoundUI();
    beep(soundOn ? 640 : 240, 60, 0.03);
  });

  bonusBtn.addEventListener("click", () => { addCoins(1000); beep(760, 70, 0.03); });

  betMinus.addEventListener("click", () => setBet((Number(betInput.value)||1) - 10));
  betPlus .addEventListener("click", () => setBet((Number(betInput.value)||1) + 10));
  betInput.addEventListener("input", () => setBet(betInput.value));

  chips.forEach((b) => {
    b.addEventListener("click", () => {
      const v = b.dataset.bet;
      if (v === "max") setBet(wallet.coins || 1);
      else setBet(v);
      beep(540, 55, 0.02);
    });
  });

  joinBtn.addEventListener("click", joinRound);
  cashBtn.addEventListener("click", cashout);

  // ---- init ----
  (function init(){
    // subtitle
    const user = tg?.initDataUnsafe?.user;
    subTitle.textContent = user ? `Привет, ${user.first_name}` : "Открыто вне Telegram";

    // wallet render
    balanceEl.textContent = String(wallet.coins);

    renderSoundUI();
    setBet(betInput.value || 100);

    // старт
    startWait();
  })();
})();
