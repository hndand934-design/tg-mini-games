(() => {
  const $ = (s) => document.querySelector(s);

  // ---------- STORAGE ----------
  const LS_BAL = "penalty_balance_v1";
  const LS_SOUND = "penalty_sound_v1";

  // ---------- ELEMENTS ----------
  const balEl = $("#bal");
  const addBtn = $("#addBtn");
  const soundBtn = $("#soundBtn");
  const soundLed = $("#soundLed");
  const soundText = $("#soundText");

  const betInput = $("#betInput");
  const betMinus = $("#betMinus");
  const betPlus = $("#betPlus");
  const chipBtns = document.querySelectorAll(".chip[data-chip]");
  const halfBtn = $("#halfBtn");
  const x2Btn = $("#x2Btn");

  const multGrid = $("#multGrid");
  const curXEl = $("#curX");
  const xTopEl = $("#xTop");

  const seriesToggle = $("#seriesToggle");
  const streakEl = $("#streak");

  const betBtn = $("#betBtn");
  const cashBtn = $("#cashBtn");

  const statusText = $("#statusText");
  const lastText = $("#lastText");
  const potentialEl = $("#potential");

  const betView = $("#betView");
  const cashView = $("#cashView");

  const zonesEl = $("#zones");
  const keeperEl = $("#keeper");
  const ballEl = $("#ball");
  const toastEl = $("#toast");

  const stepEl = $("#step");

  // ---------- AUDIO (WebAudio) ----------
  let audioCtx = null;
  let soundOn = true;

  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function beep(type = "sine", freq = 440, dur = 0.08, gain = 0.06) {
    if (!soundOn) return;
    ensureAudio();
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = 0;

    o.connect(g);
    g.connect(audioCtx.destination);

    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function sfxClick(){ beep("triangle", 520, 0.05, 0.05); }
  function sfxKick(){ beep("sine", 160, 0.09, 0.08); setTimeout(()=>beep("sine", 120, 0.07, 0.05), 40); }
  function sfxGoal(){ beep("square", 740, 0.07, 0.06); setTimeout(()=>beep("square", 980, 0.08, 0.05), 80); }
  function sfxSave(){ beep("sawtooth", 210, 0.10, 0.06); setTimeout(()=>beep("sawtooth", 140, 0.10, 0.05), 90); }
  function sfxCash(){ beep("triangle", 600, 0.07, 0.06); setTimeout(()=>beep("triangle", 820, 0.07, 0.05), 90); }

  // ---------- GAME STATE ----------
  const MULTS = [1.76, 3.30, 7.08, 15.17, 45.52];

  let balance = 1000;
  let bet = 100;
  let selectedMult = MULTS[0];

  // round:
  // idle -> betPlaced -> resolved (goal/save) (cashout allowed only after goal)
  let phase = "idle";
  let step = 0;
  let streak = 0;

  let awaitingShot = false;
  let animLock = false;

  // keeper rng: picks one of 15 zones, equals hit => save
  // zones index: 0..14 (row-major)
  let keeperPick = 0;

  // ---------- HELPERS ----------
  const clampInt = (n, min, max) => Math.max(min, Math.min(max, n|0));
  const fmt = (n) => String(Math.round(n));

  function setBalance(n){
    balance = Math.max(0, Math.floor(n));
    balEl.textContent = fmt(balance);
    localStorage.setItem(LS_BAL, String(balance));
  }

  function setSound(on){
    soundOn = !!on;
    soundLed.style.background = soundOn ? "var(--green)" : "rgba(255,255,255,.25)";
    soundLed.style.boxShadow = soundOn ? "0 0 10px rgba(31,224,138,.45)" : "none";
    soundText.textContent = `Звук: ${soundOn ? "on" : "off"}`;
    localStorage.setItem(LS_SOUND, soundOn ? "1" : "0");
  }

  function setStatus(s){ statusText.textContent = s; }
  function setLast(s){ lastText.textContent = s; }

  function setPotential(){
    const pot = (phase === "betPlaced" || phase === "resolvedGoal") ? Math.floor(bet * selectedMult) : 0;
    potentialEl.textContent = fmt(pot);
    cashView.textContent = (phase === "resolvedGoal") ? `${fmt(pot)} ₽` : "—";
  }

  function showToast(title, subtitle){
    toastEl.innerHTML = `<b>${title}</b>${subtitle ? `<span class="small">${subtitle}</span>` : ""}`;
    toastEl.classList.add("show");
    setTimeout(()=>toastEl.classList.remove("show"), 1100);
  }

  function setPhase(p){
    phase = p;

    if (phase === "idle"){
      awaitingShot = false;
      betBtn.disabled = false;
      cashBtn.disabled = true;
      setStatus("Ожидание");
      setLast("—");
      step = 0;
      stepEl.textContent = String(step);
    }

    if (phase === "betPlaced"){
      awaitingShot = true;
      betBtn.disabled = true;
      cashBtn.disabled = true;
      setStatus("Выбери точку удара");
      setLast("Ставка принята");
    }

    if (phase === "resolvedGoal"){
      awaitingShot = false;
      betBtn.disabled = true;
      cashBtn.disabled = false;
      setStatus("Гол! Можно кэшаут");
      setLast("Гол");
    }

    if (phase === "resolvedSave"){
      awaitingShot = false;
      betBtn.disabled = false;
      cashBtn.disabled = true;
      setStatus("Сейв — попытка проиграна");
      setLast("Сейв");
    }

    setPotential();
    betView.textContent = fmt(bet);
    curXEl.textContent = `x${selectedMult.toFixed(2)}`;
    xTopEl.textContent = `x${selectedMult.toFixed(2)}`;
  }

  function enableZones(on){
    document.querySelectorAll(".zone").forEach(z=>{
      z.classList.toggle("disabled", !on);
    });
  }

  function resetZoneMarks(){
    document.querySelectorAll(".zone").forEach(z=>{
      z.classList.remove("hitGoal", "hitSave");
    });
  }

  // Convert zone center to absolute px within .goal
  function getZoneCenter(zoneEl){
    const goalRect = zoneEl.closest(".goal").getBoundingClientRect();
    const r = zoneEl.getBoundingClientRect();
    const x = (r.left - goalRect.left) + r.width/2;
    const y = (r.top - goalRect.top) + r.height/2;
    return {x,y};
  }

  function setKeeperTo(x, y){
    // keeper element is positioned with left:50%, top:170px; we move via translate
    // Compute delta relative to its "home" center point
    const goal = keeperEl.closest(".goal");
    const goalRect = goal.getBoundingClientRect();
    const keeperRect = keeperEl.getBoundingClientRect();
    const home = {
      x: (goalRect.width/2),
      y: (170 + keeperRect.height/2)
    };
    const dx = x - home.x;
    const dy = y - home.y;
    keeperEl.style.transform = `translate(calc(-50% + ${dx}px), ${dy}px)`;
  }

  function resetKeeper(){
    keeperEl.style.transform = `translateX(-50%)`;
  }

  function setBallAt(x, y){
    ballEl.style.left = `${x}px`;
    ballEl.style.top = `${y}px`;
  }

  function getBallPos(){
    const goal = ballEl.closest(".goal").getBoundingClientRect();
    const r = ballEl.getBoundingClientRect();
    return {
      x: (r.left - goal.left) + r.width/2,
      y: (r.top - goal.top) + r.height/2
    };
  }

  function animateBallTo(target, ms=520){
    return new Promise((resolve)=>{
      const start = getBallPos();
      const control = {
        x: (start.x + target.x)/2,
        y: Math.min(start.y, target.y) - 110
      };

      const t0 = performance.now();

      function stepAnim(t){
        const p = Math.min(1, (t - t0)/ms);
        const ease = 1 - Math.pow(1 - p, 3);

        // Quadratic bezier
        const x = (1-ease)*(1-ease)*start.x + 2*(1-ease)*ease*control.x + ease*ease*target.x;
        const y = (1-ease)*(1-ease)*start.y + 2*(1-ease)*ease*control.y + ease*ease*target.y;

        setBallAt(x, y);

        // scale for depth
        const s = 1 - 0.22*ease;
        ballEl.style.transform = `translate(-50%, -50%) scale(${s})`;

        if (p < 1) requestAnimationFrame(stepAnim);
        else resolve();
      }
      requestAnimationFrame(stepAnim);
    });
  }

  function resetBallHome(){
    // home position is center bottom
    ballEl.style.transform = "translate(-50%, -50%) scale(1)";
    ballEl.style.left = "50%";
    ballEl.style.top = "390px";
  }

  function pickKeeper(){
    keeperPick = Math.floor(Math.random()*15);
  }

  // ---------- UI WIRING ----------
  function syncBetFromInput(){
    bet = clampInt(parseInt(betInput.value || "1", 10), 1, 9999999);
    betInput.value = String(bet);
    betView.textContent = fmt(bet);
    setPotential();
  }

  betMinus.addEventListener("click", ()=>{
    sfxClick();
    syncBetFromInput();
    bet = Math.max(1, bet - 10);
    betInput.value = String(bet);
    syncBetFromInput();
  });

  betPlus.addEventListener("click", ()=>{
    sfxClick();
    syncBetFromInput();
    bet = bet + 10;
    betInput.value = String(bet);
    syncBetFromInput();
  });

  betInput.addEventListener("input", ()=>{
    syncBetFromInput();
  });

  chipBtns.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      sfxClick();
      const v = btn.dataset.chip;
      syncBetFromInput();
      if (v === "max"){
        bet = Math.max(1, balance);
      } else {
        bet = clampInt(parseInt(v,10), 1, 9999999);
      }
      betInput.value = String(bet);
      syncBetFromInput();
    });
  });

  halfBtn.addEventListener("click", ()=>{
    sfxClick();
    syncBetFromInput();
    bet = Math.max(1, Math.floor(bet/2));
    betInput.value = String(bet);
    syncBetFromInput();
  });

  x2Btn.addEventListener("click", ()=>{
    sfxClick();
    syncBetFromInput();
    bet = Math.max(1, bet*2);
    betInput.value = String(bet);
    syncBetFromInput();
  });

  multGrid.addEventListener("click", (e)=>{
    const b = e.target.closest(".mBtn");
    if (!b) return;
    sfxClick();
    document.querySelectorAll(".mBtn").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    selectedMult = parseFloat(b.dataset.mult);
    curXEl.textContent = `x${selectedMult.toFixed(2)}`;
    xTopEl.textContent = `x${selectedMult.toFixed(2)}`;
    setPotential();
  });

  seriesToggle.addEventListener("change", ()=>{
    sfxClick();
    if (!seriesToggle.checked){
      streak = 0;
      streakEl.textContent = "0";
    }
  });

  addBtn.addEventListener("click", ()=>{
    sfxClick();
    setBalance(balance + 1000);
    showToast("+1000 ₽", "Пополнение баланса");
  });

  soundBtn.addEventListener("click", ()=>{
    setSound(!soundOn);
    sfxClick();
  });

  // ---------- GAME ACTIONS ----------
  betBtn.addEventListener("click", ()=>{
    sfxClick();
    syncBetFromInput();

    if (animLock) return;
    if (bet <= 0) return;

    if (balance < bet){
      showToast("Недостаточно средств", "Уменьши ставку или пополни баланс");
      setStatus("Недостаточно баланса");
      return;
    }

    // start round
    setBalance(balance - bet);
    resetZoneMarks();
    resetKeeper();
    resetBallHome();
    pickKeeper();

    step += 1;
    stepEl.textContent = String(step);

    setPhase("betPlaced");
    enableZones(true);
    showToast("Ставка принята", "Выбери зону удара (5×3)");
  });

  cashBtn.addEventListener("click", ()=>{
    if (animLock) return;
    if (phase !== "resolvedGoal") return;

    const win = Math.floor(bet * selectedMult);
    setBalance(balance + win);
    sfxCash();
    showToast("КЭШАУТ", `+${fmt(win)} ₽`);

    // reset attempt
    setLast(`Кэшаут +${fmt(win)} ₽`);
    setStatus("Ожидание");
    betBtn.disabled = false;
    cashBtn.disabled = true;

    enableZones(false);
    resetKeeper();
    resetBallHome();
    resetZoneMarks();

    // streak: cashout keeps streak as goal already counted (optional)
    setPhase("idle");
  });

  // ---------- BUILD ZONES ----------
  function buildZones(){
    zonesEl.innerHTML = "";
    for (let i=0;i<15;i++){
      const z = document.createElement("div");
      z.className = "zone disabled";
      z.dataset.idx = String(i);
      zonesEl.appendChild(z);
    }

    zonesEl.addEventListener("click", async (e)=>{
      const z = e.target.closest(".zone");
      if (!z) return;
      if (!awaitingShot) return;
      if (animLock) return;

      const idx = parseInt(z.dataset.idx, 10);
      await handleShot(idx, z);
    });
  }

  async function handleShot(idx, zoneEl){
    animLock = true;
    awaitingShot = false;
    enableZones(false);

    sfxKick();

    // compute target
    const target = getZoneCenter(zoneEl);

    // keeper decides if save
    const isSave = (idx === keeperPick);

    if (isSave){
      // move keeper to that zone slightly before ball arrives
      setTimeout(()=> setKeeperTo(target.x, target.y), 70);
    } else {
      // keeper goes somewhere else (near miss)
      const missIdx = (keeperPick + (Math.random() < 0.5 ? 1 : -1) + 15) % 15;
      const missZone = zonesEl.querySelector(`.zone[data-idx="${missIdx}"]`);
      if (missZone){
        const missTarget = getZoneCenter(missZone);
        setTimeout(()=> setKeeperTo(missTarget.x, missTarget.y), 70);
      }
    }

    // animate ball
    await animateBallTo(target, 520);

    // resolve
    if (isSave){
      zoneEl.classList.add("hitSave");
      sfxSave();
      showToast("СЕЙВ!", "Попробуй ещё раз");
      setLast("Сейв");
      setStatus("Сейв — ставка сгорела");

      if (seriesToggle.checked){
        streak = 0;
        streakEl.textContent = "0";
      }

      // reset to idle after short delay
      setTimeout(()=>{
        resetKeeper();
        resetBallHome();
        setPhase("idle");
        enableZones(false);
        animLock = false;
      }, 650);

      setPhase("resolvedSave");
      animLock = false;
      return;
    } else {
      zoneEl.classList.add("hitGoal");
      sfxGoal();
      showToast("ГОЛ!", `Потенциал: ${fmt(Math.floor(bet*selectedMult))} ₽`);

      setLast("Гол");
      setStatus("Гол — можно кэшаут");
      setPhase("resolvedGoal");

      if (seriesToggle.checked){
        streak += 1;
        streakEl.textContent = String(streak);
      }

      // small “net shake” feel: micro keeper bounce back
      setTimeout(()=> resetKeeper(), 420);

      animLock = false;
      return;
    }
  }

  // ---------- INIT ----------
  function init(){
    // load
    const b = parseInt(localStorage.getItem(LS_BAL) || "1000", 10);
    const s = localStorage.getItem(LS_SOUND);
    setBalance(Number.isFinite(b) ? b : 1000);
    setSound(s === null ? true : s === "1");

    syncBetFromInput();

    // set default multiplier button UI
    selectedMult = 1.76;
    curXEl.textContent = `x${selectedMult.toFixed(2)}`;
    xTopEl.textContent = `x${selectedMult.toFixed(2)}`;
    setPotential();

    buildZones();
    setPhase("idle");
    enableZones(false);

    // ensure audio unlock on first gesture
    document.addEventListener("pointerdown", () => {
      if (!soundOn) return;
      ensureAudio();
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    }, { once: true });
  }

  init();
})();
