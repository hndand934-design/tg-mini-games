(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);

  const el = {
    soundBtn: $("#soundBtn"),
    soundLed: $("#soundLed"),
    soundText: $("#soundText"),
    balanceTop: $("#balanceTop"),
    addFundsBtn: $("#addFundsBtn"),

    betMinus: $("#betMinus"),
    betPlus: $("#betPlus"),
    betValue: $("#betValue"),
    chips: Array.from(document.querySelectorAll(".chip[data-chip]")),
    halfBtn: $("#halfBtn"),
    doubleBtn: $("#doubleBtn"),
    maxBtn: $("#maxBtn"),

    diffBtns: Array.from(document.querySelectorAll(".diff[data-diff]")),
    diffHint: $("#diffHint"),

    ladder: $("#ladder"),
    seriesToggle: $("#seriesToggle"),
    streakVal: $("#streakVal"),

    betBtn: $("#betBtn"),
    cashoutBtn: $("#cashoutBtn"),
    resetBtn: $("#resetBtn"),

    statusText: $("#statusText"),
    lastText: $("#lastText"),
    currentXText: $("#currentXText"),
    potentialText: $("#potentialText"),

    stepHud: $("#stepHud"),
    xHud: $("#xHud"),
    subtitle: $("#subtitle"),

    zonesWrap: $("#zonesWrap"),
    hintText: $("#hintText"),

    stDiff: $("#stDiff"),
    stStake: $("#stStake"),
    stCashout: $("#stCashout"),
    stSeries: $("#stSeries"),

    hands: $("#hands"),
    ball: $("#ball"),
    fx: $("#fx"),
  };

  const LS_BAL = "penalty_balance_v5";
  const LS_SOUND = "penalty_sound_v5";

  // Сложности (чем сложнее — тем выше шанс сейва)
  const DIFF = {
    easy: { name: "Низкий",  saveBase: 0.40, smart: 0.45 },
    mid:  { name: "Средний", saveBase: 0.52, smart: 0.58 },
    hard: { name: "Сложный", saveBase: 0.64, smart: 0.70 },
    pro:  { name: "Эксперт", saveBase: 0.74, smart: 0.80 },
  };

  // ФИКСИРОВАННЫЕ ЛЕСТНИЦЫ X (20 шагов)
  // Логика: на Expert X выше, но и сейвов больше (выше сложность).
  // Если хочешь "ещё азартнее" — увеличим значения или добавим шагов.
  const LADDER_BY_DIFF = {
    easy: [
      1.25, 1.45, 1.70, 2.00, 2.35,
      2.75, 3.25, 3.85, 4.55, 5.35,
      6.30, 7.40, 8.70, 10.20, 11.90,
      13.90, 16.20, 18.90, 22.00, 25.60
    ],
    mid: [
      1.30, 1.55, 1.85, 2.20, 2.65,
      3.15, 3.75, 4.45, 5.25, 6.20,
      7.35, 8.70, 10.30, 12.20, 14.40,
      17.00, 20.10, 23.70, 28.00, 33.00
    ],
    hard: [
      1.35, 1.65, 2.00, 2.45, 3.00,
      3.60, 4.30, 5.15, 6.15, 7.40,
      8.90, 10.70, 12.90, 15.50, 18.70,
      22.60, 27.30, 33.00, 39.80, 48.00
    ],
    pro: [
      1.40, 1.75, 2.20, 2.80, 3.50,
      4.25, 5.20, 6.35, 7.80, 9.60,
      11.80, 14.50, 17.80, 21.80, 26.70,
      32.70, 40.00, 49.00, 60.00, 73.00
    ],
  };

  // Сколько элементов отображаем в UI одновременно (чтобы не "вылазило")
  const LADDER_VIEW = 12;

  const state = {
    soundOn: true,
    balance: 1000,
    bet: 100,

    diffKey: "easy",
    lockedDiff: false,

    inRound: false,
    animating: false,

    step: 0,
    goals: 0,
    streak: 0,

    last: "—",
    currentX: 1.0,

    keeperPair: null,
    memory: new Array(15).fill(0),

    idleTimer: null,
    idleLocked: false,
  };

  /* ---------------- utils ---------------- */
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const fmtRub = (n) => `${Math.max(0, Math.floor(n))} ₽`;
  const fmtX = (x) => `x${x.toFixed(2)}`;

  function setHint(t){ el.hintText.textContent = t; }
  function setStatus(t){ el.statusText.textContent = t; }

  function load(){
    const b = Number(localStorage.getItem(LS_BAL));
    if (Number.isFinite(b) && b >= 0) state.balance = Math.floor(b);
    const snd = localStorage.getItem(LS_SOUND);
    if (snd === "0") state.soundOn = false;
    if (snd === "1") state.soundOn = true;
  }
  function saveBalance(){ localStorage.setItem(LS_BAL, String(Math.floor(state.balance))); }
  function saveSound(){ localStorage.setItem(LS_SOUND, state.soundOn ? "1" : "0"); }

  /* ---------------- audio ---------------- */
  let audioCtx = null;
  function beep(freq=440, dur=0.06, type="sine", gain=0.04){
    if(!state.soundOn) return;
    try{
      if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }catch{}
  }
  const sfx = {
    click(){ beep(520,0.03,"square",0.03); },
    bet(){ beep(320,0.08,"sine",0.04); setTimeout(()=>beep(480,0.07,"sine",0.035),70); },
    kick(){ beep(190,0.06,"sawtooth",0.03); },
    goal(){ beep(660,0.08,"sine",0.05); setTimeout(()=>beep(880,0.09,"sine",0.045),90); },
    save(){ beep(120,0.12,"square",0.05); setTimeout(()=>beep(90,0.14,"square",0.05),120); },
    cash(){ beep(740,0.07,"triangle",0.045); setTimeout(()=>beep(980,0.09,"triangle",0.04),80); },
    err(){ beep(110,0.12,"square",0.05); },
  };

  /* ---------------- zones ---------------- */
  let zones = [];
  function buildZones(){
    el.zonesWrap.innerHTML = "";
    zones = [];
    for(let i=0;i<15;i++){
      const z = document.createElement("button");
      z.type = "button";
      z.className = "zone";
      z.dataset.idx = String(i);
      z.addEventListener("click", ()=>onZone(i));
      el.zonesWrap.appendChild(z);
      zones.push(z);
    }
  }
  function clearZoneClasses(){
    zones.forEach(z=>z.classList.remove("pick","hit","save","cover"));
  }
  function setCoverPair(pair){
    zones.forEach(z=>z.classList.remove("cover"));
    if(!pair) return;
    pair.forEach(i=> zones[i]?.classList.add("cover"));
  }

  /* ---------------- FIXED LADDER ---------------- */
  function currentLadder(){
    return LADDER_BY_DIFF[state.diffKey] || LADDER_BY_DIFF.easy;
  }

  function recalcX(){
    if(state.goals <= 0){
      state.currentX = 1.0;
      return;
    }
    const ladder = currentLadder();
    const idx = Math.min(state.goals - 1, ladder.length - 1);
    state.currentX = ladder[idx];
  }

  function buildLadder(){
    el.ladder.innerHTML = "";
    for(let i=0;i<LADDER_VIEW;i++){
      const d = document.createElement("div");
      d.className = "lstep";
      d.textContent = "x1.00";
      el.ladder.appendChild(d);
    }
  }

  function updateLadder(){
    const ladder = currentLadder();
    const nodes = Array.from(el.ladder.children);

    // окно так, чтобы "активный" шаг всегда был виден, и ничего не вылезало
    const g = state.goals;
    const start = Math.max(0, Math.min((g - 1) - Math.floor(LADDER_VIEW/2), ladder.length - LADDER_VIEW));
    const safeStart = Number.isFinite(start) ? Math.max(0, start) : 0;

    for(let i=0;i<nodes.length;i++){
      const stepIndex = safeStart + i;          // 0-based
      const x = ladder[Math.min(stepIndex, ladder.length - 1)];
      nodes[i].textContent = fmtX(x);

      const stepNumber = stepIndex + 1;         // 1-based
      nodes[i].classList.toggle("active", g === stepNumber);
      nodes[i].classList.toggle("done", g > stepNumber);
    }
  }

  /* ---------------- geometry helpers ---------------- */
  function stageEl(){ return document.querySelector(".goal-stage"); }
  function stageRect(){ return stageEl().getBoundingClientRect(); }
  function ballHome(){
    const sr = stageRect();
    return { x: sr.width/2, y: sr.height*0.73 };
  }
  function setBall(x,y){
    el.ball.style.left = `${x}px`;
    el.ball.style.top  = `${y}px`;
    el.ball.style.transform = "translate(-50%,-50%)";
  }
  function zoneCenter(idx){
    const zr = zones[idx].getBoundingClientRect();
    const sr = stageRect();
    return {
      x: (zr.left - sr.left) + zr.width/2,
      y: (zr.top  - sr.top ) + zr.height/2
    };
  }

  /* ---------------- keeper pair logic ---------------- */
  function idxRC(idx){ return { r: Math.floor(idx/5), c: idx%5 }; }
  function rcIdx(r,c){ return r*5 + c; }
  function normalizePair(a,b){ return a<b ? [a,b] : [b,a]; }

  function neighborFor(idx){
    const {r,c} = idxRC(idx);
    const horiz = [];
    if(c>0) horiz.push(rcIdx(r,c-1));
    if(c<4) horiz.push(rcIdx(r,c+1));
    const all = [...horiz];
    if(r>0) all.push(rcIdx(r-1,c));
    if(r<2) all.push(rcIdx(r+1,c));

    if(horiz.length && Math.random() < 0.72){
      return horiz[Math.floor(Math.random()*horiz.length)];
    }
    return all[Math.floor(Math.random()*all.length)];
  }

  function bestIdxFromMemory(){
    let best=0, bestV=-1;
    for(let i=0;i<15;i++){
      const v = state.memory[i];
      if(v > bestV){ bestV=v; best=i; }
    }
    return best;
  }

  function chooseKeeperPair(shotIdx, saveWanted){
    const cfg = DIFF[state.diffKey];
    state.memory[shotIdx] += 1;

    if(saveWanted){
      const anchor = shotIdx;

      if(Math.random() < cfg.smart){
        const best = bestIdxFromMemory();
        const {r,c} = idxRC(anchor);
        const {r:br,c:bc} = idxRC(best);

        const cand = [];
        if(c>0) cand.push(rcIdx(r,c-1));
        if(c<4) cand.push(rcIdx(r,c+1));
        if(r>0) cand.push(rcIdx(r-1,c));
        if(r<2) cand.push(rcIdx(r+1,c));

        cand.sort((i1,i2)=>{
          const a=idxRC(i1), b=idxRC(i2);
          const d1 = Math.abs(a.r-br)+Math.abs(a.c-bc);
          const d2 = Math.abs(b.r-br)+Math.abs(b.c-bc);
          return d1 - d2;
        });

        return normalizePair(anchor, cand[0] ?? neighborFor(anchor));
      }

      return normalizePair(anchor, neighborFor(anchor));
    }

    let a = Math.floor(Math.random()*15);
    if(a===shotIdx) a=(a+1)%15;

    let b = neighborFor(a);

    let guard=0;
    while((a===shotIdx || b===shotIdx) && guard<40){
      a = Math.floor(Math.random()*15);
      if(a===shotIdx) a=(a+2)%15;
      b = neighborFor(a);
      guard++;
    }
    return normalizePair(a,b);
  }

  /* ---------------- hands animation (pair-accurate) ---------------- */
  function setHandsToPair(pair, immediate=false){
    if(!pair) return;

    const a = zoneCenter(pair[0]);
    const b = zoneCenter(pair[1]);
    const mid = { x:(a.x+b.x)/2, y:(a.y+b.y)/2 };

    const sr = stageRect();
    const px = clamp((mid.x / sr.width) * 100, 0, 100);
    const py = clamp((mid.y / sr.height) * 100, 0, 100);

    if(immediate){
      el.hands.style.transition = "none";
      el.hands.style.setProperty("--hx", String(px));
      el.hands.style.setProperty("--hy", String(py));
      requestAnimationFrame(()=>{ el.hands.style.transition = ""; });
      return;
    }

    el.hands.style.setProperty("--hx", String(px));
    el.hands.style.setProperty("--hy", String(py));
  }

  function startIdleHands(){
    stopIdleHands();
    state.idleLocked = false;

    const tick = () => {
      if(state.idleLocked) return;
      if(!state.inRound || state.animating) return;

      const a = Math.floor(Math.random()*15);
      const b = neighborFor(a);
      const pair = normalizePair(a,b);

      state.keeperPair = pair;
      setCoverPair(pair);
      setHandsToPair(pair);

      state.idleTimer = setTimeout(tick, 380 + Math.random()*380);
    };

    state.idleTimer = setTimeout(tick, 450);
  }

  function stopIdleHands(){
    if(state.idleTimer){
      clearTimeout(state.idleTimer);
      state.idleTimer = null;
    }
  }

  /* ---------------- fx ---------------- */
  function pop(x,y){
    const p = document.createElement("div");
    p.className = "pop";
    p.style.left = `${x}px`;
    p.style.top  = `${y}px`;
    el.fx.appendChild(p);
    setTimeout(()=>p.remove(), 520);
  }

  /* ---------------- ball animation ---------------- */
  function animateKick(to, done){
    state.animating = true;
    updateUI();

    const from = ballHome();
    setBall(from.x, from.y);

    const mid = { x:(from.x+to.x)/2, y: Math.min(from.y,to.y) - 120 };
    const dur = 520;
    const t0 = performance.now();

    const tick = (t) => {
      const k = clamp((t - t0)/dur, 0, 1);
      const inv = 1 - k;

      const x = inv*inv*from.x + 2*inv*k*mid.x + k*k*to.x;
      const y = inv*inv*from.y + 2*inv*k*mid.y + k*k*to.y;

      setBall(x,y);

      if(k < 1) requestAnimationFrame(tick);
      else{
        pop(to.x,to.y);
        setTimeout(()=>{
          state.animating = false;
          updateUI();
          done?.();
        }, 160);
      }
    };

    requestAnimationFrame(tick);
  }

  function animateReturnBall(){
    const from = {
      x: parseFloat(el.ball.style.left || "0"),
      y: parseFloat(el.ball.style.top  || "0"),
    };
    const to = ballHome();
    const dur = 320;
    const t0 = performance.now();

    const tick = (t) => {
      const k = clamp((t - t0)/dur, 0, 1);
      setBall(from.x + (to.x-from.x)*k, from.y + (to.y-from.y)*k);
      if(k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ---------------- gameplay ---------------- */
  function canShoot(){ return state.inRound && !state.animating; }

  function computeSaveWanted(){
    const cfg = DIFF[state.diffKey];
    // чем больше голов подряд — тем больше шанс сейва (анти-дюп)
    const anti = clamp(state.goals * 0.07, 0, 0.34);
    const p = clamp(cfg.saveBase + anti, 0.10, 0.93);
    return Math.random() < p;
  }

  function startBet(){
    if(state.inRound) return;

    if(state.bet <= 0){
      sfx.err();
      setHint("Ставка должна быть > 0");
      return;
    }
    if(state.balance < state.bet){
      sfx.err();
      setHint("Недостаточно баланса для ставки.");
      setStatus("Недостаточно баланса");
      updateUI();
      return;
    }

    state.balance -= state.bet;
    saveBalance();

    state.inRound = true;
    state.lockedDiff = true;
    state.step = 0;
    state.goals = 0;
    state.keeperPair = null;
    state.last = "Ставка принята";
    recalcX();

    clearZoneClasses();
    setCoverPair(null);

    setStatus("Выбери точку удара");
    setHint("Кликни по зоне в воротах (5×3) — мяч полетит туда.");
    sfx.bet();

    startIdleHands();
    updateUI();
  }

  function finishLoss(){
    state.inRound = false;
    state.lockedDiff = false;
    state.step = 0;
    state.goals = 0;
    state.keeperPair = null;
    recalcX();

    if(el.seriesToggle.checked) state.streak = 0;

    stopIdleHands();
    clearZoneClasses();
    setCoverPair(null);

    setStatus("Проигрыш");
    setHint("Сейв. Нажми «Ставка», чтобы начать заново.");
    updateUI();
  }

  function cashout(){
    if(!state.inRound) return;
    if(state.goals < 1 || state.animating) return;

    const win = Math.floor(state.bet * state.currentX);
    state.balance += win;
    saveBalance();

    state.inRound = false;
    state.lockedDiff = false;

    state.last = `Кэшаут +${fmtRub(win)}`;
    setStatus("Кэшаут");
    setHint("Кэшаут успешен. Нажми «Ставка», чтобы начать заново.");
    sfx.cash();

    state.step = 0; state.goals = 0;
    state.keeperPair = null;
    recalcX();

    stopIdleHands();
    clearZoneClasses();
    setCoverPair(null);

    updateUI();
  }

  function resetAll(){
    state.inRound = false;
    state.lockedDiff = false;
    state.step = 0;
    state.goals = 0;
    state.keeperPair = null;
    state.last = "Сброс";
    recalcX();

    if(el.seriesToggle.checked) state.streak = 0;

    stopIdleHands();
    clearZoneClasses();
    setCoverPair(null);

    setStatus("Ожидание");
    setHint("Нажми «Ставка», чтобы начать.");
    sfx.click();
    updateUI();
  }

  function shoot(idx){
    if(!canShoot()){
      sfx.err();
      setHint(state.inRound ? "Подожди завершения анимации." : "Сначала нажми «Ставка».");
      return;
    }

    state.idleLocked = true;
    stopIdleHands();

    state.step += 1;
    state.memory[idx] += 1;

    const saveWanted = computeSaveWanted();
    const pair = chooseKeeperPair(idx, saveWanted);
    state.keeperPair = pair;

    clearZoneClasses();
    setCoverPair(pair);
    zones[idx].classList.add("pick");

    setHandsToPair(pair);

    const target = zoneCenter(idx);
    sfx.kick();

    setTimeout(() => {
      animateKick(target, () => {
        zones[idx].classList.remove("pick");

        const saved = pair.includes(idx);

        if(saved){
          zones[idx].classList.add("save");
          state.last = `Сейв (зоны ${pair[0]+1}-${pair[1]+1})`;
          setStatus("Сейв");
          setHint(`Сейв! Вратарь перекрыл зоны ${pair[0]+1} и ${pair[1]+1}.`);
          sfx.save();

          setTimeout(finishLoss, 200);
          return;
        }

        zones[idx].classList.add("hit");
        state.goals += 1;
        if(el.seriesToggle.checked) state.streak += 1;

        recalcX();
        state.last = `Гол (руки: ${pair[0]+1}-${pair[1]+1})`;
        setStatus("Гол! Можно бить дальше");
        setHint("Гол! Мяч возвращается. Можешь бить дальше или нажать «Кэшаут».");
        sfx.goal();

        setTimeout(() => {
          animateReturnBall();
          state.idleLocked = false;
          startIdleHands();
          updateUI();
        }, 160);
      });
    }, 140);

    updateUI();
  }

  function onZone(idx){ shoot(idx); }

  /* ---------------- difficulty ---------------- */
  function setDiff(key){
    if(state.lockedDiff){
      sfx.err();
      setHint("Нельзя менять сложность после ставки (до сброса).");
      return;
    }
    if(!DIFF[key]) return;

    state.diffKey = key;
    el.diffBtns.forEach(b => b.classList.toggle("active", b.dataset.diff === key));

    el.diffHint.textContent =
      key==="easy" ? "Низкий: меньше сейвов, X ниже."
      : key==="mid" ? "Средний: баланс риска."
      : key==="hard" ? "Сложный: сейвов больше, X выше."
      : "Эксперт: максимум сейвов, X самый высокий.";

    state.goals = 0;
    recalcX();
    updateUI();
    sfx.click();
  }

  /* ---------------- UI ---------------- */
  function updateUI(){
    el.balanceTop.textContent = fmtRub(state.balance);
    el.betValue.textContent = fmtRub(state.bet);

    el.soundLed.classList.toggle("on", state.soundOn);
    el.soundText.textContent = `Звук: ${state.soundOn ? "on":"off"}`;

    el.stDiff.textContent = DIFF[state.diffKey].name;
    el.stStake.textContent = fmtRub(state.bet);
    el.stCashout.textContent = (state.inRound && state.goals>=1) ? fmtRub(Math.floor(state.bet * state.currentX)) : "—";
    el.stSeries.textContent = el.seriesToggle.checked ? "ON" : "OFF";

    el.stepHud.textContent = `Шаг: ${state.step}`;
    el.xHud.textContent = `X: ${fmtX(state.currentX)}`;

    el.lastText.textContent = state.last;
    el.currentXText.textContent = fmtX(state.currentX);
    el.potentialText.textContent = fmtRub(Math.floor(state.bet * state.currentX));

    el.streakVal.textContent = el.seriesToggle.checked ? String(state.streak) : "0";

    el.betBtn.disabled = state.inRound;
    el.cashoutBtn.disabled = !(state.inRound && state.goals>=1) || state.animating;
    el.resetBtn.disabled = state.animating;

    el.diffBtns.forEach(b=>{
      b.disabled = state.lockedDiff;
      b.style.pointerEvents = state.lockedDiff ? "none" : "auto";
      b.style.opacity = state.lockedDiff ? ".55" : "1";
    });

    el.zonesWrap.style.opacity = state.inRound ? "1" : "0.80";

    updateLadder();
  }

  /* ---------------- bet controls ---------------- */
  function setBet(v){
    state.bet = Math.max(1, Math.floor(v));
    updateUI();
  }
  function changeBet(d){
    setBet(state.bet + d);
    sfx.click();
  }
  function addFunds(n=1000){
    state.balance += n;
    saveBalance();
    sfx.cash();
    updateUI();
  }
  function toggleSound(){
    state.soundOn = !state.soundOn;
    saveSound();
    sfx.click();
    updateUI();
  }

  /* ---------------- bind ---------------- */
  function bind(){
    el.soundBtn.addEventListener("click", toggleSound);
    el.addFundsBtn.addEventListener("click", ()=>addFunds(1000));

    el.betMinus.addEventListener("click", ()=>changeBet(-10));
    el.betPlus.addEventListener("click", ()=>changeBet(+10));

    el.chips.forEach(c=>{
      c.addEventListener("click", ()=>{
        const v = Number(c.dataset.chip);
        if(Number.isFinite(v)) setBet(v);
        sfx.click();
      });
    });

    el.halfBtn.addEventListener("click", ()=>{ setBet(Math.floor(state.bet/2)); sfx.click(); });
    el.doubleBtn.addEventListener("click", ()=>{ setBet(state.bet*2); sfx.click(); });
    el.maxBtn.addEventListener("click", ()=>{ setBet(Math.max(1,state.balance)); sfx.click(); });

    el.diffBtns.forEach(b=>{
      b.addEventListener("click", ()=>setDiff(b.dataset.diff));
    });

    el.seriesToggle.addEventListener("change", ()=>{
      if(!el.seriesToggle.checked) state.streak = 0;
      updateUI();
      sfx.click();
    });

    el.betBtn.addEventListener("click", (e)=>{ e.preventDefault(); startBet(); });
    el.cashoutBtn.addEventListener("click", (e)=>{ e.preventDefault(); cashout(); });
    el.resetBtn.addEventListener("click", (e)=>{ e.preventDefault(); resetAll(); });

    window.addEventListener("resize", ()=>{
      if(state.keeperPair){
        setHandsToPair(state.keeperPair, true);
      }
      const h = ballHome();
      if(!state.inRound || !state.animating) setBall(h.x,h.y);
    });
  }

  /* ---------------- init ---------------- */
  function init(){
    load();
    buildZones();
    buildLadder();
    bind();

    setDiff("easy");
    recalcX();

    requestAnimationFrame(()=>{
      const h = ballHome();
      setBall(h.x,h.y);
      el.hands.style.setProperty("--hx", "50");
      el.hands.style.setProperty("--hy", "34");
    });

    setStatus("Ожидание");
    setHint("Нажми «Ставка», чтобы начать. Затем кликай по зоне в воротах (5×3).");
    updateUI();
  }

  init();
})();
