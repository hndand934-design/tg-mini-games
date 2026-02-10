(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);

  const el = {
    soundBtn: $("#soundBtn"),
    soundLed: $("#soundLed"),
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

  const LS_BAL = "penalty_balance_v3";
  const LS_SOUND = "penalty_sound_v3";

  // Сложность: выше = чаще сейв + X ниже
  const DIFF = {
    easy: { name: "Низкий",   saveBase: 0.35, smart: 0.40, xStart: 1.15, xStep: 0.10, xCap: 3.10 },
    mid:  { name: "Средний",  saveBase: 0.45, smart: 0.50, xStart: 1.18, xStep: 0.09, xCap: 2.90 },
    hard: { name: "Сложный",  saveBase: 0.56, smart: 0.60, xStart: 1.22, xStep: 0.08, xCap: 2.70 },
    pro:  { name: "Эксперт",  saveBase: 0.66, smart: 0.72, xStart: 1.26, xStep: 0.07, xCap: 2.55 },
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

    selectedIdx: null,

    // ДВЕ секции куда “руки перекрывают”
    keeperPair: null, // [a,b]
    memory: new Array(15).fill(0),
  };

  /* ---------- utils ---------- */
  const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
  const fmtRub = (n)=>`${Math.max(0, Math.floor(n))} ₽`;
  const fmtX = (x)=>`x${x.toFixed(2)}`;

  function setHint(t){ el.hintText.textContent = t; }
  function setStatus(t){ el.statusText.textContent = t; }

  function load(){
    const b = Number(localStorage.getItem(LS_BAL));
    if (Number.isFinite(b) && b>=0) state.balance = Math.floor(b);
    const snd = localStorage.getItem(LS_SOUND);
    if (snd === "0") state.soundOn = false;
    if (snd === "1") state.soundOn = true;
  }
  function saveBalance(){ localStorage.setItem(LS_BAL, String(Math.floor(state.balance))); }
  function saveSound(){ localStorage.setItem(LS_SOUND, state.soundOn ? "1":"0"); }

  /* ---------- audio ---------- */
  let audioCtx=null;
  function beep(freq=440,dur=0.06,type="sine",gain=0.04){
    if(!state.soundOn) return;
    try{
      if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type=type; o.frequency.value=freq;
      g.gain.value=gain;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime+dur);
    }catch{}
  }
  const sfx={
    click(){beep(520,0.03,"square",0.03);},
    bet(){beep(320,0.08,"sine",0.04); setTimeout(()=>beep(480,0.07,"sine",0.035),70);},
    kick(){beep(180,0.06,"sawtooth",0.03);},
    goal(){beep(660,0.08,"sine",0.05); setTimeout(()=>beep(880,0.09,"sine",0.045),90);},
    save(){beep(120,0.12,"square",0.05); setTimeout(()=>beep(90,0.14,"square",0.05),120);},
    cash(){beep(740,0.07,"triangle",0.045); setTimeout(()=>beep(980,0.09,"triangle",0.04),80);},
    err(){beep(110,0.12,"square",0.05);},
  };

  /* ---------- zones ---------- */
  let zones=[];
  function buildZones(){
    el.zonesWrap.innerHTML="";
    zones=[];
    for(let i=0;i<15;i++){
      const z=document.createElement("button");
      z.type="button";
      z.className="zone";
      z.dataset.idx=String(i);
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
    pair.forEach(i=>{
      if (zones[i]) zones[i].classList.add("cover");
    });
  }

  /* ---------- ladder ---------- */
  function buildLadder(){
    el.ladder.innerHTML="";
    for(let i=0;i<LADDER_STEPS;i++){
      const d=document.createElement("div");
      d.className="lstep";
      d.textContent="x1.00";
      el.ladder.appendChild(d);
    }
  }
  function calcXForGoals(goals, cfg){
    const x = cfg.xStart + cfg.xStep * (goals-1);
    return clamp(x, 1.0, cfg.xCap);
  }
  function recalcX(){
    const cfg=DIFF[state.diffKey];
    state.currentX = state.goals === 0 ? 1.0 : calcXForGoals(state.goals, cfg);
  }
  function updateLadder(){
    const cfg=DIFF[state.diffKey];
    const nodes=Array.from(el.ladder.children);
    for(let i=0;i<nodes.length;i++){
      const x = calcXForGoals(i+1, cfg);
      nodes[i].textContent = fmtX(x);
      nodes[i].classList.toggle("active", state.goals === i+1);
      nodes[i].classList.toggle("done", state.goals > i+1);
    }
  }

  /* ---------- keeper pair logic (2 секции) ---------- */
  function idxRC(idx){ return { r: Math.floor(idx/5), c: idx%5 }; }
  function rcIdx(r,c){ return r*5+c; }

  // выбираем “соседа” так, чтобы пара была логичной: чаще по горизонтали, иногда вертикаль
  function neighborFor(idx){
    const {r,c} = idxRC(idx);
    const choices = [];

    // горизонтальные соседи приоритет
    if(c>0) choices.push(rcIdx(r,c-1));
    if(c<4) choices.push(rcIdx(r,c+1));

    // вертикальные тоже возможны (реализм)
    if(r>0) choices.push(rcIdx(r-1,c));
    if(r<2) choices.push(rcIdx(r+1,c));

    // лёгкий вес: горизонталь чаще
    // сделаем простой выбор: если есть горизонталь — 70% берём её
    const horiz = [];
    if(c>0) horiz.push(rcIdx(r,c-1));
    if(c<4) horiz.push(rcIdx(r,c+1));
    if(horiz.length && Math.random() < 0.70){
      return horiz[Math.floor(Math.random()*horiz.length)];
    }
    return choices[Math.floor(Math.random()*choices.length)];
  }

  function normalizePair(a,b){
    if(a===b) return [a,b];
    return a<b ? [a,b] : [b,a];
  }

  // “умный” выбор: иногда “тянется” к часто выбираемым зонам игрока
  function bestIdxFromMemory(){
    let best=0, bestV=-1;
    for(let i=0;i<15;i++){
      const v = state.memory[i];
      if(v>bestV){bestV=v; best=i;}
    }
    return best;
  }

  // выбираем пару: если saveWanted=true => пара ОБЯЗАТЕЛЬНО включает shotIdx
  // если false => пара гарантированно НЕ включает shotIdx (чтобы не было “хаотичных” сейвов)
  function chooseKeeperPair(shotIdx, saveWanted){
    const cfg=DIFF[state.diffKey];

    // обновляем память ударов
    state.memory[shotIdx] += 1;

    if(saveWanted){
      // иногда “умный сейв” — вратарь заранее стоит в популярных зонах, но всё равно включает удар
      // (то есть если он “умный” — чаще перекрывает популярные пары, но всё равно в этих 2 будет удар)
      let anchor = shotIdx;

      if(Math.random() < cfg.smart){
        const best = bestIdxFromMemory();
        // если лучшая зона рядом — “сдвинем” anchor ближе к ней (но не ломаем include shot)
        // проще: оставим anchor=shotIdx, но соседа выберем к направлению best
        const {r,c} = idxRC(shotIdx);
        const {r:br,c:bc} = idxRC(best);

        // попробуем подобрать соседа в сторону best
        let neighbor = null;
        const candidates = [];
        if(c>0) candidates.push(rcIdx(r,c-1));
        if(c<4) candidates.push(rcIdx(r,c+1));
        if(r>0) candidates.push(rcIdx(r-1,c));
        if(r<2) candidates.push(rcIdx(r+1,c));

        candidates.sort((i1,i2)=>{
          const a=idxRC(i1), b=idxRC(i2);
          const d1 = Math.abs(a.r-br)+Math.abs(a.c-bc);
          const d2 = Math.abs(b.r-br)+Math.abs(b.c-bc);
          return d1-d2;
        });

        neighbor = candidates[0] ?? neighborFor(anchor);
        return normalizePair(anchor, neighbor);
      } else {
        return normalizePair(anchor, neighborFor(anchor));
      }
    }

    // saveWanted=false: выбрать любую пару, но чтобы shotIdx НЕ входил
    // берём случайный anchor, который не shotIdx
    let anchor = Math.floor(Math.random()*15);
    if(anchor===shotIdx) anchor = (anchor+1)%15;

    let nb = neighborFor(anchor);

    // гарантируем, что shotIdx не попал ни в anchor, ни в neighbor
    let guard = 0;
    while((anchor===shotIdx || nb===shotIdx) && guard<30){
      anchor = Math.floor(Math.random()*15);
      if(anchor===shotIdx) anchor=(anchor+2)%15;
      nb = neighborFor(anchor);
      guard++;
    }
    return normalizePair(anchor, nb);
  }

  function keeperDiveClassForPair(pair){
    // ориентируем “прыжок” по центру пары
    const a=pair[0], b=pair[1];
    const ca=idxRC(a), cb=idxRC(b);
    const c = (ca.c+cb.c)/2;
    const r = (ca.r+cb.r)/2;

    if(r <= 0.35) return "dive-up";
    if(c <= 1.6) return "dive-left";
    if(c >= 2.9) return "dive-right";
    return "center";
  }

  /* ---------- geometry ---------- */
  function stageRect(){
    return document.querySelector(".goal-stage").getBoundingClientRect();
  }
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
    return { x:(zr.left-sr.left)+zr.width/2, y:(zr.top-sr.top)+zr.height/2 };
  }

  /* ---------- hands ---------- */
  function resetHands(){
    el.hands.classList.remove("dive-left","dive-right","dive-up","center");
  }
  function applyHandsForPair(pair){
    resetHands();
    el.hands.classList.add(keeperDiveClassForPair(pair));
  }

  /* ---------- fx ---------- */
  function pop(x,y){
    const p=document.createElement("div");
    p.className="pop";
    p.style.left=`${x}px`;
    p.style.top=`${y}px`;
    el.fx.appendChild(p);
    setTimeout(()=>p.remove(),520);
  }

  /* ---------- animation ---------- */
  function animateKick(to, done){
    state.animating=true;
    updateUI();

    const from = ballHome();
    setBall(from.x, from.y);

    el.ball.classList.remove("kick");
    void el.ball.offsetWidth;
    el.ball.classList.add("kick");

    const mid = { x:(from.x+to.x)/2, y: Math.min(from.y,to.y) - 120 };
    const dur=520;
    const t0=performance.now();

    const tick=(t)=>{
      const k=clamp((t-t0)/dur,0,1);
      const inv=1-k;
      const x=inv*inv*from.x + 2*inv*k*mid.x + k*k*to.x;
      const y=inv*inv*from.y + 2*inv*k*mid.y + k*k*to.y;
      setBall(x,y);
      if(k<1) requestAnimationFrame(tick);
      else{
        pop(to.x,to.y);
        setTimeout(()=>{
          state.animating=false;
          updateUI();
          done?.();
        },180);
      }
    };
    requestAnimationFrame(tick);
  }

  function animateReturnBall(){
    const from = {
      x: parseFloat(el.ball.style.left || "0"),
      y: parseFloat(el.ball.style.top || "0"),
    };
    const to = ballHome();
    const dur=320;
    const t0=performance.now();

    const tick=(t)=>{
      const k=clamp((t-t0)/dur,0,1);
      setBall(from.x+(to.x-from.x)*k, from.y+(to.y-from.y)*k);
      if(k<1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ---------- gameplay ---------- */
  function canShoot(){
    return state.inRound && !state.animating;
  }

  function computeSaveWanted(){
    const cfg=DIFF[state.diffKey];

    // анти-дюп: чем больше голов в раунде, тем выше шанс сейва
    const anti = clamp(state.goals * 0.035, 0, 0.22);
    const p = clamp(cfg.saveBase + anti, 0.12, 0.90);
    return Math.random() < p;
  }

  function startBet(){
    if(state.inRound) return;

    if(state.bet<=0){ sfx.err(); setHint("Ставка должна быть > 0"); return; }
    if(state.balance < state.bet){
      sfx.err();
      setHint("Недостаточно баланса для ставки.");
      setStatus("Недостаточно баланса");
      updateUI();
      return;
    }

    state.balance -= state.bet;
    saveBalance();

    state.inRound=true;
    state.lockedDiff=true;
    state.step=0;
    state.goals=0;
    state.selectedIdx=null;
    state.keeperPair=null;
    state.last="Ставка принята";
    recalcX();

    clearZoneClasses();
    setCoverPair(null);

    resetHands(); el.hands.classList.add("center");

    setStatus("Выбери точку удара");
    setHint("Кликни по зоне в воротах (5×3) — мяч полетит туда.");
    sfx.bet();
    updateUI();
  }

  function finishLoss(){
    state.inRound=false;
    state.lockedDiff=false;
    state.selectedIdx=null;
    state.keeperPair=null;
    state.step=0;
    state.goals=0;
    recalcX();

    if(el.seriesToggle.checked) state.streak=0;

    clearZoneClasses();
    setCoverPair(null);
    resetHands(); el.hands.classList.add("center");

    setStatus("Проигрыш");
    setHint("Сейв. Нажми «Ставка», чтобы начать заново.");
    updateUI();
  }

  function cashout(){
    if(!state.inRound) return;
    if(state.goals<1 || state.animating) return;

    const win = Math.floor(state.bet * state.currentX);
    state.balance += win;
    saveBalance();

    state.inRound=false;
    state.lockedDiff=false;

    state.last=`Кэшаут +${fmtRub(win)}`;
    setStatus("Кэшаут");
    setHint("Кэшаут успешен. Нажми «Ставка», чтобы начать заново.");
    sfx.cash();

    state.step=0; state.goals=0; recalcX();
    clearZoneClasses();
    setCoverPair(null);
    resetHands(); el.hands.classList.add("center");
    updateUI();
  }

  function resetAll(){
    state.inRound=false;
    state.lockedDiff=false;
    state.step=0;
    state.goals=0;
    state.selectedIdx=null;
    state.keeperPair=null;
    state.last="Сброс";
    recalcX();

    if(el.seriesToggle.checked) state.streak=0;

    clearZoneClasses();
    setCoverPair(null);
    resetHands(); el.hands.classList.add("center");

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

    state.step += 1;
    state.selectedIdx = idx;

    // выбираем: хотим сейв или нет
    const saveWanted = computeSaveWanted();

    // выбираем пару рук по правилам:
    // saveWanted=true => пара включает idx
    // saveWanted=false => пара исключает idx
    const pair = chooseKeeperPair(idx, saveWanted);
    state.keeperPair = pair;

    clearZoneClasses();
    setCoverPair(pair);
    zones[idx].classList.add("pick");

    applyHandsForPair(pair);

    const target = zoneCenter(idx);
    sfx.kick();

    animateKick(target, ()=>{
      const saved = pair.includes(idx); // ВАЖНО: проигрыш строго если мяч в одной из 2 секций

      zones[idx].classList.remove("pick");

      if(saved){
        zones[idx].classList.add("save");
        state.last = `Сейв (зоны ${pair[0]+1}-${pair[1]+1})`;
        setStatus("Сейв");
        setHint(`Сейв! Вратарь перекрыл зоны ${pair[0]+1} и ${pair[1]+1}.`);
        sfx.save();

        setTimeout(finishLoss, 220);
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

      setTimeout(()=>{
        animateReturnBall();
        // руки возвращаем в центр после гола
        setCoverPair(null);
        resetHands(); el.hands.classList.add("center");
        state.selectedIdx=null;
        state.keeperPair=null;
        updateUI();
      }, 160);
    });

    updateUI();
  }

  function onZone(idx){
    shoot(idx);
  }

  /* ---------- difficulty ---------- */
  function setDiff(key){
    if(state.lockedDiff){
      sfx.err();
      setHint("Нельзя менять сложность после ставки (до сброса).");
      return;
    }
    if(!DIFF[key]) return;

    state.diffKey=key;
    el.diffBtns.forEach(b=>b.classList.toggle("active", b.dataset.diff===key));
    el.diffHint.textContent =
      key==="easy" ? "Низкий: меньше сейвов, X ниже."
      : key==="mid" ? "Средний: баланс риска."
      : key==="hard" ? "Сложный: сейвов больше, X ниже."
      : "Эксперт: максимум сейвов, самый низкий X.";

    state.goals=0;
    recalcX();
    updateUI();
    sfx.click();
  }

  /* ---------- UI ---------- */
  function updateUI(){
    el.balanceTop.textContent = fmtRub(state.balance);

    el.soundBtn.innerHTML = `<span id="soundLed" class="led ${state.soundOn ? "on":""}"></span><span>Звук: ${state.soundOn ? "on":"off"}</span>`;
    el.soundLed = $("#soundLed");

    el.betValue.textContent = fmtRub(state.bet);

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
      b.style.pointerEvents = state.lockedDiff ? "none":"auto";
      b.style.opacity = state.lockedDiff ? ".55":"1";
    });

    el.zonesWrap.style.opacity = state.inRound ? "1" : "0.78";

    updateLadder();
  }

  /* ---------- controls ---------- */
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

  /* ---------- bind ---------- */
  function bind(){
    el.soundBtn.addEventListener("click", toggleSound);
    el.addFundsBtn.addEventListener("click", ()=>addFunds(1000));

    el.betMinus.addEventListener("click", ()=>changeBet(-10));
    el.betPlus.addEventListener("click", ()=>changeBet(+10));

    el.chips.forEach(c=>{
      c.addEventListener("click", ()=>{
        const v=Number(c.dataset.chip);
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
      if(!el.seriesToggle.checked) state.streak=0;
      updateUI();
      sfx.click();
    });

    // КЛЮЧ: ставка обязана нажиматься
    el.betBtn.addEventListener("click", (e)=>{ e.preventDefault(); startBet(); });
    el.cashoutBtn.addEventListener("click", (e)=>{ e.preventDefault(); cashout(); });
    el.resetBtn.addEventListener("click", (e)=>{ e.preventDefault(); resetAll(); });
  }

  /* ---------- init ---------- */
  function init(){
    load();
    buildZones();
    buildLadder();
    bind();

    setDiff("easy");
    recalcX();

    requestAnimationFrame(()=>{
      const h=ballHome();
      setBall(h.x,h.y);
    });

    setStatus("Ожидание");
    setHint("Нажми «Ставка», чтобы начать. Затем кликай по зоне в воротах (5×3).");
    updateUI();
  }

  init();
})();
