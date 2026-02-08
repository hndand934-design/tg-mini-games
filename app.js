(() => {
  // ---------- RNG ----------
  function rand() {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 2**32;
  }
  const rint = (n) => Math.floor(rand() * n);

  // ---------- DOM ----------
  const targetsEl = document.getElementById("targets");
  const sceneEl   = document.getElementById("scene");
  const keeperEl  = document.getElementById("keeper");
  const glovesEl  = document.getElementById("gloves");
  const ballEl    = document.getElementById("ball");
  const fxEl      = document.getElementById("fx");
  const bannerEl  = document.getElementById("banner");
  const netEl     = document.getElementById("net");

  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlaySub = document.getElementById("overlaySub");
  const overlayOk = document.getElementById("overlayOk");

  const soundBtn = document.getElementById("soundBtn");
  const soundDot = document.getElementById("soundDot");
  const soundText = document.getElementById("soundText");

  const betMinus = document.getElementById("betMinus");
  const betPlus  = document.getElementById("betPlus");
  const betHalf  = document.getElementById("betHalf");
  const betDouble= document.getElementById("betDouble");
  const betMax   = document.getElementById("betMax");
  const quickBtns= [...document.querySelectorAll(".pillBtn[data-add]")];

  const multiRow = document.getElementById("multiRow");
  const multiBtns= [...multiRow.querySelectorAll(".multiBtn")];

  const seriesToggle = document.getElementById("seriesToggle");
  const streakText = document.getElementById("streakText");

  const startBtn = document.getElementById("startBtn");
  const resetBtn = document.getElementById("resetBtn");
  const addMoneyBtn = document.getElementById("addMoneyBtn");

  const betText = document.getElementById("betText");
  const statusText = document.getElementById("statusText");
  const lastText = document.getElementById("lastText");
  const xText = document.getElementById("xText");
  const xTextTop = document.getElementById("xTextTop");
  const stepText = document.getElementById("stepText");

  const balTop = document.getElementById("balTop");
  const balSide = document.getElementById("balSide");

  const stateBet = document.getElementById("stateBet");
  const stateStreak = document.getElementById("stateStreak");
  const hintBox = document.getElementById("hintBox");

  // ---------- Storage ----------
  const LS_BAL = "mini_balance_penalty_v6";

  // ---------- State ----------
  const S = {
    odds: 1.76,
    bet: 100,
    balance: 1000,
    sound: true,

    inRound: false,     // ставка сделана, ждём удар
    animLock: false,    // идёт анимация
    picked: null,
    keeperPick: null,

    step: 0,
    streak: 0,
  };

  // ---------- Audio ----------
  let ac = null;
  function ensureAC(){ ac ||= new (window.AudioContext || window.webkitAudioContext)(); }
  function tone({freq=440, dur=0.08, type="sine", gain=0.03, slide=0}){
    if (!S.sound) return;
    try{
      ensureAC();
      const t0 = ac.currentTime;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t0 + dur);
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(t0); o.stop(t0 + dur);
    }catch(e){}
  }
  const clickSfx = () => tone({freq:520, dur:0.05, type:"triangle", gain:0.02});
  const kickSfx  = () => { tone({freq:180, dur:0.05, type:"square", gain:0.02}); tone({freq:430, dur:0.08, type:"sine", gain:0.02, slide:-140}); };
  const goalSfx  = () => { tone({freq:740, dur:0.11, type:"sine", gain:0.03}); setTimeout(()=>tone({freq:980, dur:0.12, type:"sine", gain:0.02}), 70); };
  const saveSfx  = () => { tone({freq:150, dur:0.11, type:"square", gain:0.03}); setTimeout(()=>tone({freq:240, dur:0.09, type:"square", gain:0.02}), 80); };

  // ---------- Helpers ----------
  const fmtRub = (n) => `${Math.floor(n)} ₽`;

  function render() {
    betText.textContent = fmtRub(S.bet);
    xText.textContent = `x${S.odds.toFixed(2)}`;
    xTextTop.textContent = `x${S.odds.toFixed(2)}`;
    stepText.textContent = String(S.step);

    balTop.textContent = fmtRub(S.balance);
    balSide.textContent = fmtRub(S.balance);

    streakText.textContent = String(S.streak);
    stateBet.textContent = fmtRub(S.bet);
    stateStreak.textContent = String(S.streak);

    startBtn.disabled = S.animLock; // важно: кнопку “Ставка” не лочим навсегда
  }

  function setBalance(n){
    S.balance = Math.max(0, Math.floor(n));
    localStorage.setItem(LS_BAL, String(S.balance));
    render();
  }

  function setStatus(t){ statusText.textContent = t; }
  function setLast(t){ lastText.textContent = t; }

  function lockInputs(lock){
    S.animLock = lock;

    // ставки/настройки нельзя менять во время активного раунда или анимации
    const blocked = lock || S.inRound;

    betMinus.disabled = blocked;
    betPlus.disabled = blocked;
    betHalf.disabled = blocked;
    betDouble.disabled = blocked;
    betMax.disabled = blocked;
    quickBtns.forEach(b => b.disabled = blocked);
    multiBtns.forEach(b => b.disabled = blocked);
  }

  function clearTargets(){
    [...targetsEl.querySelectorAll(".t")].forEach(t=>{
      t.classList.remove("sel","kp","good","bad","lock");
    });
  }

  function resetVisual(){
    clearTargets();
    fxEl.innerHTML = "";
    hideBanner();
    netEl.classList.remove("shake");

    S.picked = null;
    S.keeperPick = null;

    ballEl.style.opacity = "1";
    ballEl.style.transform = "translateX(-50%) translate(0px,0px) scale(1)";
    keeperEl.style.transform = "translateX(-50%) translate(0px,0px)";
    glovesEl.style.transform = "scale(1)";
  }

  // banner (не блокирует клики)
  function showBanner(text, good){
    bannerEl.textContent = text;
    bannerEl.classList.remove("good","bad","show");
    bannerEl.classList.add(good ? "good" : "bad");
    requestAnimationFrame(()=> bannerEl.classList.add("show"));
    setTimeout(()=> hideBanner(), 900);
  }
  function hideBanner(){
    bannerEl.classList.remove("show","good","bad");
    bannerEl.textContent = "";
  }

  // overlay
  function openOverlay(title, sub){
    overlayTitle.textContent = title;
    overlaySub.textContent = sub;
    overlay.hidden = false;
  }
  function closeOverlay(){
    overlay.hidden = true;
  }
  overlayOk.addEventListener("click", ()=>{ clickSfx(); closeOverlay(); });
  overlay.addEventListener("click", (e)=>{ if(e.target === overlay){ clickSfx(); closeOverlay(); } });
  window.addEventListener("keydown", (e)=>{ if(e.key==="Escape" && !overlay.hidden){ clickSfx(); closeOverlay(); } });

  function centerOf(el){
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
  }

  function spawnSparks(x, y, good=true){
    const count = good ? 10 : 7;
    for(let i=0;i<count;i++){
      const s = document.createElement("div");
      s.className = "spark";
      const ang = rand()*Math.PI*2;
      const dist = (good ? 60 : 42) + rand()*24;
      const dx = Math.cos(ang)*dist;
      const dy = Math.sin(ang)*dist;

      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      s.style.background = good ? "rgba(31,226,141,.95)" : "rgba(255,59,59,.95)";
      s.style.boxShadow = good ? "0 0 18px rgba(31,226,141,.55)" : "0 0 18px rgba(255,59,59,.45)";
      s.style.animation = "pop 520ms ease forwards";

      s.animate([
        { transform: "translate(0px,0px) scale(.6)", opacity: 0.2 },
        { transform: `translate(${dx*0.6}px, ${dy*0.6}px) scale(1.05)`, opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(.9)`, opacity: 0 }
      ], { duration: 520, easing: "cubic-bezier(.2,.9,.2,1)", fill: "forwards" });

      fxEl.appendChild(s);
      setTimeout(()=>s.remove(), 700);
    }
  }

  // ---------- Build 15 targets ----------
  function buildTargets(){
    targetsEl.innerHTML = "";
    for(let i=0;i<15;i++){
      const b = document.createElement("button");
      b.type = "button";
      b.className = "t";
      b.dataset.i = String(i);
      b.addEventListener("click", () => onTarget(i));
      targetsEl.appendChild(b);
    }
  }

  // ---------- Game flow ----------
  function startRound(){
    if (S.animLock) return;

    // не даём зависнуть “итогу”
    if (!overlay.hidden) closeOverlay();

    clickSfx();

    if (S.balance < S.bet){
      setStatus("Недостаточно баланса");
      hintBox.textContent = "Недостаточно баланса для ставки.";
      saveSfx();
      openOverlay("Недостаточно средств", `Нужно ${fmtRub(S.bet)}`);
      return;
    }

    // списали 1 раз
    setBalance(S.balance - S.bet);

    S.inRound = true;
    S.step += 1;

    resetVisual();
    lockInputs(false);

    setStatus("Выбери точку удара");
    setLast("—");
    hintBox.textContent = "Кликни по зоне (5×3) — мяч сразу полетит туда.";

    render();
  }

  // выбор вратаря: немного “умнее”, но без читов
  function pickKeeper(){
    // часть времени — рандом
    if (rand() < 0.70) return rint(15);

    // иногда “рядом”, чтобы выглядело живее
    const p = S.picked;
    const row = Math.floor(p / 5);
    const col = p % 5;
    const nr = Math.max(0, Math.min(2, row + (rint(3)-1)));
    const nc = Math.max(0, Math.min(4, col + (rint(3)-1)));
    return nr*5 + nc;
  }

  function onTarget(i){
    if (!S.inRound || S.animLock) return;

    // 1:1 — клик = сразу удар
    S.picked = i;
    shoot();
  }

  function shoot(){
    if (!S.inRound || S.animLock || S.picked === null) return;

    S.keeperPick = pickKeeper();

    // lock UI
    S.animLock = true;
    const targets = [...targetsEl.querySelectorAll(".t")];
    targets.forEach(t => t.classList.add("lock"));

    // mark picked + keeper
    clearTargets();
    const pickedBtn = targetsEl.querySelector(`.t[data-i="${S.picked}"]`);
    const keeperBtn = targetsEl.querySelector(`.t[data-i="${S.keeperPick}"]`);
    pickedBtn?.classList.add("sel");
    keeperBtn?.classList.add("kp");

    setStatus("Удар...");
    hintBox.textContent = "Удар!";

    kickSfx();

    // coords
    const frame = sceneEl.getBoundingClientRect();
    const from = centerOf(ballEl);
    const to = centerOf(pickedBtn);

    const keeperFrom = centerOf(keeperEl);
    const keeperTo = centerOf(keeperBtn);

    const dx = to.x - from.x;
    const dy = to.y - from.y;

    // траектория дугой: выше если верхний ряд
    const row = Math.floor(S.picked / 5);
    const arcUp = row === 0 ? -200 : row === 1 ? -160 : -120;

    // keeper jumps
    const kdx = keeperTo.x - keeperFrom.x;
    const kdy = keeperTo.y - keeperFrom.y;
    keeperEl.style.transform = `translateX(-50%) translate(${kdx}px, ${kdy}px)`;
    glovesEl.style.transform = "scale(1.10)";

    // ball flight
    const ballAnim = ballEl.animate([
      { transform: "translateX(-50%) translate(0px,0px) scale(1)" },
      { transform: `translateX(-50%) translate(${dx*0.55}px, ${dy*0.55 + arcUp}px) scale(0.92)` },
      { transform: `translateX(-50%) translate(${dx}px, ${dy}px) scale(0.86)` }
    ], { duration: 640, easing: "cubic-bezier(.2,.9,.2,1)", fill: "forwards" });

    ballAnim.onfinish = () => {
      const isSave = (S.keeperPick === S.picked);

      const localX = (to.x - frame.left);
      const localY = (to.y - frame.top);

      if (isSave){
        // SAVE
        pickedBtn?.classList.add("bad");
        saveSfx();
        setStatus("Сейв");
        setLast("Сейв");
        hintBox.textContent = "Сейв! Ставка проиграна.";
        showBanner("СЕЙВ", false);

        spawnSparks(localX, localY, false);

        ballEl.animate([
          { opacity: 1, transform: `translateX(-50%) translate(${dx}px, ${dy}px) scale(0.86)` },
          { opacity: 1, transform: `translateX(-50%) translate(${dx*0.55}px, ${dy + 150}px) scale(0.80)` },
          { opacity: 0.0, transform: `translateX(-50%) translate(${dx*0.35}px, ${dy + 230}px) scale(0.72)` }
        ], { duration: 420, easing:"cubic-bezier(.2,.9,.2,1)", fill:"forwards" });

        if (seriesToggle.checked) S.streak = 0;

        setTimeout(()=> openOverlay("СЕЙВ!", "Ставка проиграна"), 160);

      } else {
        // GOAL
        pickedBtn?.classList.add("good");
        goalSfx();
        setStatus("Гол");
        setLast("Гол");
        hintBox.textContent = "ГОООЛ!";
        showBanner("ГОЛ", true);

        spawnSparks(localX, localY, true);

        netEl.classList.add("shake");
        setTimeout(()=> netEl.classList.remove("shake"), 420);

        const win = Math.floor(S.bet * S.odds);
        setBalance(S.balance + win);

        ballEl.animate([
          { opacity: 1, transform: `translateX(-50%) translate(${dx}px, ${dy}px) scale(0.86)` },
          { opacity: 1, transform: `translateX(-50%) translate(${dx}px, ${dy + 75}px) scale(0.76)` },
          { opacity: 0.0, transform: `translateX(-50%) translate(${dx}px, ${dy + 135}px) scale(0.68)` }
        ], { duration: 420, easing:"ease-out", fill:"forwards" });

        if (seriesToggle.checked) S.streak += 1;
        else S.streak = 0;

        setTimeout(()=> openOverlay("ГОЛ!", `+${fmtRub(win)}`), 160);
      }

      // end
      setTimeout(() => {
        S.inRound = false;
        S.animLock = false;
        glovesEl.style.transform = "scale(1)";
        targets.forEach(t => t.classList.remove("lock"));
        setStatus("Ожидание");
        hintBox.textContent = "Нажми “Ставка”, чтобы начать ещё раз.";
        render();
      }, 520);
    };

    render();
  }

  function resetAll(){
    clickSfx();
    closeOverlay();
    S.inRound = false;
    S.animLock = false;
    S.step = 0;
    S.streak = 0;
    setStatus("Ожидание");
    setLast("—");
    hintBox.textContent = "Нажми “Ставка”, чтобы начать.";
    resetVisual();
    lockInputs(false);
    render();
  }

  // ---------- Events ----------
  startBtn.addEventListener("click", startRound);
  resetBtn.addEventListener("click", resetAll);
  addMoneyBtn.addEventListener("click", ()=>{ clickSfx(); setBalance(S.balance + 1000); });

  betMinus.addEventListener("click", ()=>{ if(S.inRound||S.animLock) return; clickSfx(); S.bet = Math.max(1, S.bet-10); render(); });
  betPlus.addEventListener("click",  ()=>{ if(S.inRound||S.animLock) return; clickSfx(); S.bet = Math.min(1_000_000, S.bet+10); render(); });
  betHalf.addEventListener("click",  ()=>{ if(S.inRound||S.animLock) return; clickSfx(); S.bet = Math.max(1, Math.floor(S.bet/2)); render(); });
  betDouble.addEventListener("click",()=>{ if(S.inRound||S.animLock) return; clickSfx(); S.bet = Math.min(1_000_000, S.bet*2); render(); });

  quickBtns.forEach(b=>{
    b.addEventListener("click", ()=>{
      if(S.inRound||S.animLock) return;
      clickSfx();
      S.bet = Math.min(1_000_000, S.bet + Number(b.dataset.add));
      render();
    });
  });
  betMax.addEventListener("click", ()=>{
    if(S.inRound||S.animLock) return;
    clickSfx();
    S.bet = Math.max(1, S.balance); // MAX = весь баланс
    render();
  });

  multiBtns.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      if(S.inRound||S.animLock) return;
      clickSfx();
      multiBtns.forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      S.odds = Number(btn.dataset.m);
      render();
    });
  });

  soundBtn.addEventListener("click", ()=>{
    S.sound = !S.sound;
    soundText.textContent = `Звук: ${S.sound ? "on" : "off"}`;
    soundDot.style.background = S.sound ? "var(--good)" : "var(--bad)";
    clickSfx();
  });

  // ---------- Init ----------
  const saved = Number(localStorage.getItem(LS_BAL) || "1000");
  S.balance = Number.isFinite(saved) && saved >= 0 ? Math.floor(saved) : 1000;

  buildTargets();
  setStatus("Ожидание");
  setLast("—");
  hintBox.textContent = "Нажми “Ставка”, чтобы начать.";
  overlay.hidden = true;
  lockInputs(false);
  render();
  resetVisual();
})();
