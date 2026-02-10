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

  const LS_BAL = "penalty_balance_v4";
  const LS_SOUND = "penalty_sound_v4";

  const DIFF = {
    // чуть сложнее, чтобы не дюпали: X ниже, сейв чаще, и растёт с голами
    easy: { name: "Низкий",  saveBase: 0.40, smart: 0.45, xStart: 1.14, xStep: 0.085, xCap: 2.45 },
    mid:  { name: "Средний", saveBase: 0.50, smart: 0.55, xStart: 1.16, xStep: 0.080, xCap: 2.35 },
    hard: { name: "Сложный", saveBase: 0.60, smart: 0.65, xStart: 1.18, xStep: 0.075, xCap: 2.25 },
    pro:  { name: "Эксперт", saveBase: 0.70, smart: 0.75, xStart: 1.20, xStep: 0.070, xCap: 2.15 },
  };

  const LADDER_STEPS = 12;

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

    keeperPair: null,  // [a,b]
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

  /* ---------------- audio (простые) ---------------- */
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

  /* ---------------- ladder ---------------- */
  function buildLadder(){
    el.ladder.innerHTML = "";
    for(let i=0;i<LADDER_STEPS;i++){
      const d = document.createElement("div");
      d.className = "lstep";
      d.textContent = "x1.00";
      el.ladder.appendChild(d);
    }
  }
  function calcXForGoals(goals, cfg){
    const x = cfg.xStart + cfg.xStep * (goals - 1);
    return clamp(x, 1.0, cfg.xCap);
  }
  function recalcX(){
    const cfg = DIFF[state.diffKey];
    state.currentX = state.goals === 0 ? 1.0 : calcXForGoals(state.goals, cfg);
  }
  function updateLadder(){
    const cfg = DIFF[state.diffKey];
    const nodes = Array.from(el.ladder.children);
    for(let i=0;i<nodes.length;i++){
      const x = calcXForGoals(i+1, cfg);
      nodes[i].textContent = fmtX(x);
      nodes[i].classList.toggle("active", state.goals === i+1);
      nodes[i].classList.toggle("done", state.goals > i+1);
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

  /* ---------------- keeper pair logic (2 zones) ---------------- */
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

  // ВАЖНО: если saveWanted=true => пара обязана включать shotIdx
  //         если false => пара гарантированно НЕ включает shotIdx
  function chooseKeeperPair(shotIdx, saveWanted){
    const cfg = DIFF[state.diffKey];
    state.memory[shotIdx] += 1;

    if(saveWanted){
      // “умнее”: иногда тянется к самым частым зонам, но shotIdx всё равно включён
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

    // saveWanted=false: выбери любую пару, но не включай shotIdx
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

  /* ---------------- hands exact animation (15 zones) ---------------- */
  // ставим руки в среднюю точку пары (по центрам зон)
  function setHandsToPair(pair, immediate=false){
    if(!pair) return;

    const a = zoneCenter(pair[0]);
    const b = zoneCenter(pair[1]);
    const mid = { x:(a.x+b.x)/2, y:(a.y+b.y)/2 };

    // перевод в проценты относительно stage (так стабильнее на ресайзе)
    const sr = stageRect();
    const px = clamp((mid.x / sr.width) * 100, 0, 100);
    const py = clamp((mid.y / sr.height) * 100, 0, 100);

    if(immediate){
      el.hands.style.transition = "none";
      el.hands.style.setProperty("--hx", String(px));
      el.hands.style.setProperty("--hy", String(py));
      // вернуть transition
      requestAnimationFrame(()=>{ el.hands.style.transition = ""; });
      return;
    }

    el.hands.style.setProperty("--hx", String(px));
    el.hands.style.setProperty("--hy", String(py));
  }

  // “хаотичное движение” в простое
  function startIdleHands(){
    stopIdleHands();
    state.idleLocked = false;

    const tick = () => {
      if(state.idleLocked) return;
      if(!state.inRound || state.animating) return;

      // гуляем по случайной паре
      const a = Math.floor(Math.random()*15);
      const b = neighborFor(a);
      const pair = normalizePair(a,b);

      state.keeperPair = pair; // только визуально
      setCoverPair(pair);
      setHandsToPair(pair);

      // следующий шаг
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
    // анти-дюп: каждый гол чуть повышает шанс сейва
    const anti = clamp(state.goals * 0.05, 0, 0.28);
    const p = clamp(cfg.saveBase + anti, 0.10, 0.92);
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

    // стартуем idle-движение рук
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

    // блокируем idle на время удара
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

    // Руки ВСЕГДА едут на реальную пару, которая и определяет сейв
    setHandsToPair(pair);

    // небольшая задержка, чтобы игрок видел движение рук “в момент удара”
    const target = zoneCenter(idx);
    sfx.kick();

    setTimeout(() => {
      animateKick(target, () => {
        zones[idx].classList.remove("pick");

        const saved = pair.includes(idx); // <= ИСТИНА: сейв только если попал в одну из 2 перекрытых зон

        if(saved){
          zones[idx].classList.add("save");
          state.last = `Сейв (зоны ${pair[0]+1}-${pair[1]+1})`;
          setStatus("Сейв");
          setHint(`Сейв! Вратарь перекрыл зоны ${pair[0]+1} и ${pair[1]+1}.`);
          sfx.save();

          setTimeout(finishLoss, 200);
          return;
        }

        // GOAL
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

          // после гола снова включаем хаотичное движение
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
      : key==="hard" ? "Сложный: сейвов больше, X ниже."
      : "Эксперт: максимум сейвов, X самый низкий.";

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

    // КНОПКИ 100% кликаются
    el.betBtn.addEventListener("click", (e)=>{ e.preventDefault(); startBet(); });
    el.cashoutBtn.addEventListener("click", (e)=>{ e.preventDefault(); cashout(); });
    el.resetBtn.addEventListener("click", (e)=>{ e.preventDefault(); resetAll(); });

    // ресайз: чтобы руки не “съезжали” при изменении размеров — мгновенно пересчитать позицию
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

    // стартовые позиции
    requestAnimationFrame(()=>{
      const h = ballHome();
      setBall(h.x,h.y);

      // центр руками (проценты)
      el.hands.style.setProperty("--hx", "50");
      el.hands.style.setProperty("--hy", "34");
    });

    setStatus("Ожидание");
    setHint("Нажми «Ставка», чтобы начать. Затем кликай по зоне в воротах (5×3).");
    updateUI();
  }

  init();
})();
