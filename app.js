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

  const LS_BAL = "penalty_balance_v2";
  const LS_SOUND = "penalty_sound_v2";

  // Сложность: чем выше, тем чаще сейв и медленнее рост X
  const DIFF = {
    easy: { name: "Низкий",   saveBase: 0.33, smart: 0.35, xStart: 1.15, xStep: 0.10, xCap: 3.40 },
    mid:  { name: "Средний",  saveBase: 0.42, smart: 0.45, xStart: 1.18, xStep: 0.09, xCap: 3.10 },
    hard: { name: "Сложный",  saveBase: 0.52, smart: 0.55, xStart: 1.22, xStep: 0.08, xCap: 2.85 },
    pro:  { name: "Эксперт",  saveBase: 0.62, smart: 0.68, xStart: 1.26, xStep: 0.07, xCap: 2.60 },
  };

  // Лесенка X (12 шагов) — красиво и гармонично
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
    keeperIdx: null,

    // чтобы вратарь "учился" (чуть умнее)
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

  /* ---------- audio (tiny) ---------- */
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
    zones.forEach(z=>z.classList.remove("pick","hit","save"));
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
  function updateLadder(){
    const cfg=DIFF[state.diffKey];
    const nodes=Array.from(el.ladder.children);
    for(let i=0;i<nodes.length;i++){
      const x = calcXForGoals(i+1, cfg); // шаг = (i+1) голов
      nodes[i].textContent = fmtX(x);
      nodes[i].classList.toggle("active", state.goals === i+1);
      nodes[i].classList.toggle("done", state.goals > i+1);
    }
  }

  /* ---------- math ---------- */
  function calcXForGoals(goals, cfg){
    // старт + шаги, ограничение (чтобы не “дюпали”)
    const x = cfg.xStart + cfg.xStep * (goals-1);
    return clamp(x, 1.0, cfg.xCap);
  }
  function recalcX(){
    const cfg=DIFF[state.diffKey];
    state.currentX = state.goals === 0 ? 1.0 : calcXForGoals(state.goals, cfg);
  }

  /* ---------- keeper AI (умнее) ---------- */
  function chooseKeeper(playerIdx){
    const cfg=DIFF[state.diffKey];

    // повышаем шанс сейва с ростом голов подряд (анти-дюп)
    const anti = clamp(state.goals * 0.03, 0, 0.18);
    const saveChance = clamp(cfg.saveBase + anti, 0.10, 0.88);

    // "ум": часть времени угадывает чаще именно популярные зоны игрока
    // + память по зонам
    state.memory[playerIdx] += 1;

    const r = Math.random();
    if (r < saveChance){
      // сейв: либо точное угадывание, либо "умный" выбор
      if (Math.random() < cfg.smart){
        // выбираем наиболее часто бьющуюся зону (из памяти)
        let best=0, bestV=-1;
        for(let i=0;i<15;i++){
          const v = state.memory[i] + (i===playerIdx?0.5:0);
          if(v>bestV){bestV=v; best=i;}
        }
        return best;
      }
      return playerIdx;
    }

    // если не сейвим — прыгаем рядом (реализм)
    const row=Math.floor(playerIdx/5), col=playerIdx%5;
    const cand=[];
    for(let rr=Math.max(0,row-1); rr<=Math.min(2,row+1); rr++){
      for(let cc=Math.max(0,col-1); cc<=Math.min(4,col+1); cc++){
        const idx=rr*5+cc;
        if(idx!==playerIdx) cand.push(idx);
      }
    }
    return cand.length ? cand[Math.floor(Math.random()*cand.length)] : (playerIdx+1)%15;
  }

  /* ---------- geometry ---------- */
  function stageRect(){
    return document.querySelector(".goal-stage").getBoundingClientRect();
  }
  function zoneCenter(idx){
    const zr = zones[idx].getBoundingClientRect();
    const sr = stageRect();
    return { x:(zr.left-sr.left)+zr.width/2, y:(zr.top-sr.top)+zr.height/2 };
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

  /* ---------- hands ---------- */
  function resetHands(){
    el.hands.classList.remove("dive-left","dive-right","dive-up","center");
  }
  function handsDive(idx){
    const col=idx%5, row=Math.floor(idx/5);
    if(row===0) el.hands.classList.add("dive-up");
    else if(col<=1) el.hands.classList.add("dive-left");
    else if(col>=3) el.hands.classList.add("dive-right");
    else el.hands.classList.add("center");
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

  function startBet(){
    if(state.inRound) return;

    if(state.bet<=0){ sfx.err(); setHint("Ставка должна быть > 0"); return; }
    if(state.balance < state.bet){
      sfx.err();
      setHint("Недостаточно баланса для ставки.");
      setStatus("Недостаточно баланса");
      return;
    }

    state.balance -= state.bet;
    saveBalance();

    state.inRound=true;
    state.lockedDiff=true;
    state.step=0;
    state.goals=0;
    state.selectedIdx=null;
    state.keeperIdx=null;
    state.last="Ставка принята";
    recalcX();

    clearZoneClasses();
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
    state.keeperIdx=null;
    state.step=0;
    state.goals=0;
    recalcX();

    if(el.seriesToggle.checked) state.streak=0;

    clearZoneClasses();
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
    resetHands(); el.hands.classList.add("center");
    updateUI();
  }

  function resetAll(){
    state.inRound=false;
    state.lockedDiff=false;
    state.step=0;
    state.goals=0;
    state.selectedIdx=null;
    state.keeperIdx=null;
    state.last="Сброс";
    recalcX();

    if(el.seriesToggle.checked) state.streak=0;

    clearZoneClasses();
    resetHands(); el.hands.classList.add("center");
    setStatus("Ожидание");
    setHint("Нажми «Ставка», чтобы начать.");
    sfx.click();
    updateUI();
  }

  function shoot(idx){
    if(!canShoot()){ sfx.err(); setHint("Сначала нажми «Ставка»."); return; }

    state.step += 1;
    state.selectedIdx = idx;

    clearZoneClasses();
    zones[idx].classList.add("pick");

    const keeper = chooseKeeper(idx);
    state.keeperIdx = keeper;

    resetHands();
    handsDive(keeper);

    const target = zoneCenter(idx);
    sfx.kick();

    animateKick(target, ()=>{
      const saved = keeper === idx;

      if(saved){
        zones[idx].classList.remove("pick");
        zones[idx].classList.add("save");

        state.last = `Сейв (зона ${idx+1})`;
        setStatus("Сейв");
        setHint("Сейв. Раунд завершён.");
        sfx.save();

        setTimeout(finishLoss, 220);
        return;
      }

      // GOAL
      zones[idx].classList.remove("pick");
      zones[idx].classList.add("hit");

      state.goals += 1;
      if(el.seriesToggle.checked) state.streak += 1;

      recalcX();
      state.last = `Гол (зона ${idx+1})`;
      setStatus("Гол! Можно бить дальше");
      setHint("Гол! Мяч возвращается. Можешь бить дальше или нажать «Кэшаут».");
      sfx.goal();

      // возврат мяча + руки в центр, продолжаем
      setTimeout(()=>{
        animateReturnBall();
        resetHands(); el.hands.classList.add("center");
        state.selectedIdx=null;
        updateUI();
      }, 160);
    });

    updateUI();
  }

  function onZone(idx){
    // сразу удар по клику — как ты просил
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

    // пересоберём X/лесенку
    state.goals=0; recalcX();
    updateUI();
    sfx.click();
  }

  /* ---------- UI ---------- */
  function updateUI(){
    el.balanceTop.textContent = fmtRub(state.balance);

    el.soundLed.classList.toggle("on", state.soundOn);
    el.soundBtn.innerHTML = `<span id="soundLed" class="led ${state.soundOn ? "on":""}"></span><span>Звук: ${state.soundOn ? "on":"off"}</span>`;
    // перепривязка led после innerHTML
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

    // кнопки
    el.betBtn.disabled = state.inRound; // ставка 1 раз на раунд
    el.cashoutBtn.disabled = !(state.inRound && state.goals>=1) || state.animating;
    el.resetBtn.disabled = state.animating;

    // сложность
    el.diffBtns.forEach(b=>{
      b.disabled = state.lockedDiff;
      b.style.pointerEvents = state.lockedDiff ? "none":"auto";
      b.style.opacity = state.lockedDiff ? ".55":"1";
    });

    // зоны слегка приглушены до старта
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
    // IMPORTANT: чтобы “Ставка” точно нажималась — никаких оверлеев поверх
    // Вся интерактивность на кнопках/зонах, у декора pointer-events:none.

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

    el.betBtn.addEventListener("click", startBet);
    el.cashoutBtn.addEventListener("click", cashout);
    el.resetBtn.addEventListener("click", resetAll);
  }

  /* ---------- init ---------- */
  function init(){
    load();
    buildZones();
    buildLadder();
    bind();

    // default
    setDiff("easy");
    recalcX();

    // place ball
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
