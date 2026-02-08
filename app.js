(() => {
  // --------- helpers ----------
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const LS_BAL = "mini_balance_penalty_full_v1";
  const LS_SOUND = "mini_sound_penalty_full_v1";

  // --------- audio (WebAudio) ----------
  let soundOn = true;
  let ac = null;

  function ensureAC(){
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume().catch(()=>{});
  }

  function beep(freq=520, dur=0.06, type="sine", gain=0.04){
    if (!soundOn) return;
    ensureAC();
    const t0 = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    o.connect(g); g.connect(ac.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  const sClick = () => beep(640, 0.04, "sine", 0.02);
  const sKick  = () => beep(420, 0.07, "triangle", 0.035);
  const sGoal  = () => { beep(740,0.08,"sine",0.04); setTimeout(()=>beep(980,0.09,"sine",0.035),70); };
  const sSave  = () => { beep(180,0.10,"square",0.02); setTimeout(()=>beep(140,0.10,"square",0.02),90); };

  // --------- state ----------
  let balance = 1000;

  const state = {
    bet: 100,
    mul: 1.76,
    pWin: 0.70,        // шанс забить
    series: false,
    streak: 0,
    armed: false,      // ставка списана, ждём выбор точки
    busy: false,       // идёт анимация
    flag: "1W",
    step: 0,
    last: "—",
  };

  // --------- elements ----------
  const elBalance = $("#balance");
  const elSoundBtn = $("#soundBtn");
  const elSoundDot = $("#soundDot");
  const elSoundTxt = $("#soundTxt");
  const elAddFunds = $("#addFundsBtn");

  const elBet = $("#bet");
  const elBetMinus = $("#betMinus");
  const elBetPlus = $("#betPlus");
  const elChips = $$(".chip");
  const elHalf = $("#halfBtn");
  const elDouble = $("#doubleBtn");

  const elPlace = $("#placeBtn");
  const elCash = $("#cashoutBtn");

  const elMulNow = $("#mulNow");
  const elStreak = $("#streak");
  const elPotential = $("#potential");
  const elStatus = $("#statusNow");

  const elHint = $("#sceneHint");
  const elSideHint = $("#sideHint");
  const elSideBet = $("#sideBet");
  const elSideCash = $("#sideCash");

  const elPLabel = $("#pLabel");
  const mulBtns = $$(".mul");

  const elSeries = $("#seriesToggle");
  const flagBtns = $$(".flag");
  const elFlagBadge = $("#flagBadge");

  const targets = $$(".target");

  const elGoal = $("#goal");
  const elHands = $("#hands");
  const elTrail = $("#handTrail");
  const elBall = $("#ball");
  const elImpact = $("#impact");
  const elFxGoal = $("#fxGoal");
  const elFxSave = $("#fxSave");
  const elConfetti = $("#confetti");

  const elStep = $("#stepNow");
  const elLast = $("#lastNow");
  const elLog = $("#log");

  // --------- coords ----------
  const TARGETS = [
    { x: 18, y: 42 },   // t1
    { x: 40, y: 42 },   // t2
    { x: 62, y: 42 },   // t3
    { x: 28, y: 132 },  // t4
    { x: 52, y: 132 },  // t5
  ];

  // --------- storage ----------
  function load(){
    const b = Number(localStorage.getItem(LS_BAL));
    balance = (Number.isFinite(b) && b >= 0) ? Math.floor(b) : 1000;

    const so = localStorage.getItem(LS_SOUND);
    soundOn = (so === "0") ? false : true;

    renderAll();
    resetScene();
  }
  function saveBalance(){ localStorage.setItem(LS_BAL, String(Math.floor(balance))); }

  // --------- UI setters ----------
  function setSound(on){
    soundOn = !!on;
    localStorage.setItem(LS_SOUND, soundOn ? "1" : "0");
    elSoundDot.classList.toggle("on", soundOn);
    elSoundDot.classList.toggle("off", !soundOn);
    elSoundTxt.textContent = `Звук: ${soundOn ? "on" : "off"}`;
    if (soundOn) beep(520,0.05,"sine",0.02);
  }

  function setStatus(t){
    elStatus.textContent = t;
  }
  function setHint(html){
    elHint.innerHTML = html;
    elSideHint.innerHTML = html;
  }

  function pushLog(kind, text){
    const pill = document.createElement("div");
    pill.className = `pill ${kind}`;
    pill.textContent = text;
    elLog.prepend(pill);
    // лимит 6
    const pills = Array.from(elLog.querySelectorAll(".pill"));
    pills.slice(6).forEach(p=>p.remove());
  }

  function updatePotential(){
    const pot = Math.floor(state.bet * state.mul);
    elPotential.textContent = String(pot);
    elSideCash.textContent = state.armed ? `${pot} ₽` : "—";
  }

  function renderAll(){
    elBalance.textContent = String(balance);
    elBet.value = String(state.bet);
    elSideBet.textContent = String(state.bet);

    elMulNow.textContent = `x${state.mul.toFixed(2)}`;
    elStreak.textContent = String(state.streak);

    elStep.textContent = String(state.step);
    elLast.textContent = state.last;

    elFlagBadge.textContent = state.flag;

    elSeries.checked = state.series;
    setSound(soundOn);

    elPlace.disabled = state.busy;
    elCash.disabled = true; // кэшаут на пенальти как отдельная фича не нужен, держим disabled (если надо — включим)
    updatePotential();

    // шанс
    elPLabel.textContent = `шанс: ${(state.pWin*100).toFixed(0)}%`;
  }

  // --------- scene reset ----------
  function resetTargets(){
    targets.forEach(t=>{
      t.classList.remove("hit","miss");
      t.classList.toggle("enabled", state.armed && !state.busy);
    });
  }

  function clearFX(){
    elFxGoal.classList.remove("show");
    elFxSave.classList.remove("show");
  }

  function resetBallHands(){
    elBall.classList.remove("kick");
    elBall.style.transform = "translateX(-50%)";
    elBall.style.bottom = "74px";
    elHands.style.transform = "translate(-50%, -50%)";
    elHands.style.opacity = "0.95";
    elTrail.style.opacity = "0";
  }

  function resetScene(){
    state.busy = false;
    state.armed = false;

    resetTargets();
    clearFX();
    resetBallHands();

    setStatus("Ожидание");
    setHint(`Нажми <b>Ставка</b>, затем выбери точку удара.`);
    updatePotential();
    renderAll();
  }

  // --------- math / bet ----------
  function parseBet(){
    let v = Number(String(elBet.value).replace(/[^\d.]/g,""));
    if (!Number.isFinite(v)) v = state.bet;
    v = Math.floor(clamp(v, 1, 1_000_000));
    state.bet = v;
    elBet.value = String(v);
    elSideBet.textContent = String(v);
    updatePotential();
  }

  function placeBet(){
    if (state.busy) return;
    parseBet();

    if (balance < state.bet){
      setStatus("Недостаточно");
      setHint(`Недостаточно баланса для ставки.`);
      state.last = "Нет баланса";
      renderAll();
      sSave();
      return;
    }

    balance -= state.bet;
    saveBalance();

    state.armed = true;
    state.step += 1;

    setStatus("Выбор удара");
    setHint(`Выбери точку <b>в воротах</b>.`);
    state.last = "Ставка принята";
    renderAll();
    resetTargets();
    sClick();
  }

  // --------- animation helpers ----------
  function goalRect(){
    return elGoal.getBoundingClientRect();
  }

  function moveHands(idx){
    const r = goalRect();
    const x = (TARGETS[idx].x/100)*r.width;
    const y = TARGETS[idx].y;

    elTrail.style.opacity = "1";
    elHands.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }

  function showImpact(idx){
    const r = goalRect();
    const x = (TARGETS[idx].x/100)*r.width;
    const y = TARGETS[idx].y;

    elImpact.style.left = `${x + r.left - elGoal.getBoundingClientRect().left}px`;
    elImpact.style.top  = `${y}px`;

    elImpact.classList.remove("show");
    void elImpact.offsetWidth;
    elImpact.classList.add("show");
  }

  function kickBall(idx){
    const r = goalRect();
    const goalLeft = r.left;
    const goalCenterX = goalLeft + r.width/2;

    const tx = goalLeft + (TARGETS[idx].x/100)*r.width;
    const dx = tx - goalCenterX;

    elBall.classList.add("kick");
    elBall.style.transform = `translateX(calc(-50% + ${dx}px)) scale(0.82)`;
    elBall.style.bottom = "300px";
  }

  function showFX(type){
    if (type === "goal"){
      elFxGoal.classList.remove("show");
      void elFxGoal.offsetWidth;
      elFxGoal.classList.add("show");
    } else {
      elFxSave.classList.remove("show");
      void elFxSave.offsetWidth;
      elFxSave.classList.add("show");
    }
  }

  function confettiBurst(){
    // 18 частиц
    elConfetti.innerHTML = "";
    const colors = ["rgba(59,130,246,.95)","rgba(34,197,94,.95)","rgba(236,72,153,.95)","rgba(255,255,255,.75)"];
    for (let i=0;i<18;i++){
      const p = document.createElement("i");
      p.style.left = `${20 + Math.random()*60}%`;
      p.style.top  = `${10 + Math.random()*20}%`;
      p.style.background = colors[(Math.random()*colors.length)|0];
      p.style.animationDelay = `${Math.random()*0.12}s`;
      p.style.transform = `translateY(-20px) rotate(${(Math.random()*120)|0}deg)`;
      elConfetti.appendChild(p);
    }
  }

  // --------- keeper RNG ----------
  function roll(playerIdx){
    // если win -> keeper не туда; если lose -> keeper туда же
    const win = Math.random() < state.pWin;
    if (!win) return { win:false, keeperIdx: playerIdx };

    const others = [0,1,2,3,4].filter(i=>i!==playerIdx);
    const keeperIdx = others[(Math.random()*others.length)|0];
    return { win:true, keeperIdx };
  }

  // --------- main shot ----------
  async function shoot(playerIdx){
    if (!state.armed || state.busy) return;
    state.busy = true;
    resetTargets();
    clearFX();

    setStatus("Удар...");
    setHint(`Удар по воротам...`);
    renderAll();

    // визуальный выбор
    targets.forEach(t=>t.classList.remove("hit","miss"));

    // RNG
    const { win, keeperIdx } = roll(playerIdx);

    // анимации
    sKick();
    moveHands(keeperIdx);
    kickBall(playerIdx);
    showImpact(playerIdx);

    await sleep(580);

    if (win){
      targets[playerIdx].classList.add("hit");
      setStatus("ГОЛ!");
      showFX("goal");
      confettiBurst();
      elGoal.classList.add
