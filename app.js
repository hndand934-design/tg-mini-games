// Penalty FULL v3
// - 15 зон (5x3)
// - Ставка -> активируется раунд -> клик по зоне = удар
// - Вратарь "прыгает" в случайную зону
// - Анимации: мяч летит по дуге, удар/отскок, тряска при сейве, вспышки FX
// - Звуки: кнопка, удар, гол, сейв
// - Серия: если включена — считает победы подряд (не меняет odds, но сохраняет streak)
// - Баланс localStorage

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
  const goalFrame = document.getElementById("goalFrame");
  const keeperEl  = document.getElementById("keeper");
  const glovesEl  = keeperEl.querySelector(".gloves");
  const ballEl    = document.getElementById("ball");
  const fxEl      = document.getElementById("fx");

  const overlay   = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlaySub   = document.getElementById("overlaySub");
  const overlayOk    = document.getElementById("overlayOk");

  const multiRow  = document.getElementById("multiRow");
  const multiBtns = [...multiRow.querySelectorAll(".multiBtn")];

  const seriesToggle = document.getElementById("seriesToggle");
  const streakText = document.getElementById("streakText");

  const betText = document.getElementById("betText");
  const minusBtn = document.getElementById("minusBtn");
  const plusBtn = document.getElementById("plusBtn");
  const halfBtn = document.getElementById("halfBtn");
  const doubleBtn = document.getElementById("doubleBtn");

  const stakeBtn = document.getElementById("stakeBtn");
  const resetBtn = document.getElementById("resetBtn");
  const addMoneyBtn = document.getElementById("addMoneyBtn");

  const balText = document.getElementById("balText");
  const topMoney = document.getElementById("topMoney");

  const soundBtn = document.getElementById("soundBtn");
  const soundChip = document.getElementById("soundChip");

  const statusText = document.getElementById("statusText");
  const lastText = document.getElementById("lastText");
  const stepText = document.getElementById("stepText");
  const xTextTop = document.getElementById("xTextTop");

  // ---------- Storage ----------
  const LS_BAL = "mini_balance_penalty_full_v3";

  // ---------- State ----------
  const S = {
    odds: 1.76,
    bet: 100,
    balance: 1000,
    inRound: false,     // после нажатия Ставка
    animLock: false,    // во время анимаций
    picked: null,       // 0..14
    keeperPick: null,   // 0..14
    streak: 0,
    step: 0,
    sound: true,
  };

  // ---------- Audio (WebAudio, “богаче”) ----------
  let ac = null;
  function ensureAC(){
    ac ||= new (window.AudioContext || window.webkitAudioContext)();
  }
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
      o.start(t0);
      o.stop(t0 + dur);
    }catch(e){}
  }
  function clickSfx(){ tone({freq:520, dur:0.05, type:"triangle", gain:0.02}); }
  function kickSfx(){
    tone({freq:180, dur:0.04, type:"square", gain:0.02});
    tone({freq:420, dur:0.07, type:"sine", gain:0.02, slide:-120});
  }
  function goalSfx(){
    tone({freq:740, dur:0.10, type:"sine", gain:0.03});
    setTimeout(()=>tone({freq:980, dur:0.12, type:"sine", gain:0.02}), 60);
    setTimeout(()=>tone({freq:1240, dur:0.08, type:"triangle", gain:0.015}), 120);
  }
  function saveSfx(){
    tone({freq:140, dur:0.10, type:"square", gain:0.03});
    setTimeout(()=>tone({freq:220, dur:0.08, type:"square", gain:0.02}), 70);
  }

  // ---------- Helpers ----------
  const fmtRub = (n) => `${Math.floor(n)} ₽`;
  function setBalance(n){
    S.balance = Math.max(0, Math.floor(n));
    localStorage.setItem(LS_BAL, String(S.balance));
    balText.textContent = fmtRub(S.balance);
    topMoney.textContent = `${Math.max(0, Math.floor(S.balance/100))} $`;
  }
  function setBet(n){
    S.bet = Math.max(1, Math.floor(n));
    betText.textContent = fmtRub(S.bet);
  }
  function setOdds(v){
    S.odds = v;
    xTextTop.textContent = `x${S.odds.toFixed(2)}`;
  }
  function setStreak(n){
    S.streak = Math.max(0, n|0);
    streakText.textContent = String(S.streak);
  }
  function setStatus(txt){ statusText.textContent = txt; }
  function setLast(txt){ lastText.textContent = txt; }
  function setStep(n){ S.step = n|0; stepText.textContent = String(S.step); }

  function lockForAnim(lock){
    S.animLock = lock;
    // targets lock handled by class
    stakeBtn.disabled = lock;
    minusBtn.disabled = lock || S.inRound;
    plusBtn.disabled = lock || S.inRound;
    halfBtn.disabled = lock || S.inRound;
    doubleBtn.disabled = lock || S.inRound;
    multiBtns.forEach(b => b.disabled = lock || S.inRound);
  }

  function clearTargets(){
    [...targetsEl.querySelectorAll(".t")].forEach(t => {
      t.classList.remove("selected","pulseGood","pulseBad","locked");
    });
  }

  function resetVisual(){
    overlay.hidden = true;
    clearTargets();
    // вернуть мяч и руки
    ballEl.style.transition = "none";
    keeperEl.style.transition = "none";
    glovesEl.style.transition = "none";

    ballEl.style.opacity = "1";
    ballEl.style.transform = "translateX(-50%) translate(0px,0px) scale(1)";
    keeperEl.style.transform = "translateX(-50%) translate(0px,0px)";
    glovesEl.style.transform = "scale(1)";

    // force reflow
    void ballEl.offsetHeight;

    // restore transitions
    ballEl.style.transition = "transform 620ms cubic-bezier(.2,.9,.2,1), opacity 200ms ease";
    keeperEl.style.transition = "transform 320ms cubic-bezier(.2,.9,.2,1)";
    glovesEl.style.transition = "transform 220ms ease";

    fxEl.innerHTML = "";
    S.picked = null;
    S.keeperPick = null;
  }

  function buildTargets(){
    targetsEl.innerHTML = "";
    for(let i=0;i<15;i++){
      const b = document.createElement("button");
      b.type = "button";
      b.className = "t";
      b.dataset.i = String(i);
      b.addEventListener("click", () => onPick(i));
      targetsEl.appendChild(b);
    }
  }

  function centerOf(el){
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
  }

  function spawnSparks(x, y, good=true){
    // x,y in frame coordinates (px)
    const count = good ? 10 : 7;
    for(let i=0;i<count;i++){
      const s = document.createElement("div");
      s.className = "spark";
      const ang = rand()*Math.PI*2;
      const dist = (good ? 50 : 35) + rand()*25;
      const dx = Math.cos(ang)*dist;
      const dy = Math.sin(ang)*dist;

      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      s.style.background = good ? "rgba(31,226,141,.95)" : "rgba(255,59,59,.95)";
      s.style.boxShadow = good ? "0 0 18px rgba(31,226,141,.55)" : "0 0 18px rgba(255,59,59,.45)";
      s.style.animation = "pop 520ms ease forwards";

      // using transform via CSS keyframes is global; move with translate via inline
      s.animate([
        { transform: "translate(0px,0px) scale(.6)", opacity: 0.2 },
        { transform: `translate(${dx*0.6}px, ${dy*0.6}px) scale(1.05)`, opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(.9)`, opacity: 0 }
      ], { duration: 520, easing: "cubic-bezier(.2,.9,.2,1)", fill: "forwards" });

      fxEl.appendChild(s);
      setTimeout(()=>s.remove(), 700);
    }
  }

  // ---------- Game flow ----------
  function startRound(){
    if (S.animLock) return;
    clickSfx();

    if (S.balance < S.bet){
      overlayTitle.textContent = "Недостаточно средств";
      overlaySub.textContent = `Нужно ${fmtRub(S.bet)}`;
      overlay.hidden = false;
      setStatus("Недостаточно баланса");
      setLast("—");
      saveSfx();
      return;
    }

    setBalance(S.balance - S.bet);
    S.inRound = true;
    setStatus("Выбери точку удара");
    setLast("—");
    setStep(S.step + 1);

    resetVisual();
    lockForAnim(false);

    // подсказка: пока раунд активен — кружки живые
  }

  function onPick(i){
    if (!S.inRound || S.animLock) return;

    clearTargets();
    const btn = targetsEl.querySelector(`.t[data-i="${i}"]`);
    if (!btn) return;

    btn.classList.add("selected");
    S.picked = i;

    shoot();
  }

  function shoot(){
    if (!S.inRound || S.animLock || S.picked === null) return;

    S.keeperPick = rint(15);
    const targets = [...targetsEl.querySelectorAll(".t")];
    targets.forEach(t => t.classList.add("locked"));
    lockForAnim(true);

    kickSfx();
    setStatus("Удар...");

    const pickedBtn = targetsEl.querySelector(`.t[data-i="${S.picked}"]`);
    const keeperBtn = targetsEl.querySelector(`.t[data-i="${S.keeperPick}"]`);

    const frame = goalFrame.getBoundingClientRect();
    const from = centerOf(ballEl);
    const to = centerOf(pickedBtn);
    const keeperFrom = centerOf(keeperEl);
    const keeperTo = centerOf(keeperBtn);

    const dx = to.x - from.x;
    const dy = to.y - from.y;

    // "дуга" — добавим дополнительный подъем вверх
    const arcUp = -Math.min(120, Math.abs(dy) + 80);

    // используем Web Animations для более плавной дуги
    ballEl.animate([
      { transform: "translateX(-50%) translate(0px,0px) scale(1)" },
      { transform: `translateX(-50%) translate(${dx*0.52}px, ${dy*0.52 + arcUp}px) scale(0.92)` },
      { transform: `translateX(-50%) translate(${dx}px, ${dy}px) scale(0.86)` }
    ], { duration: 620, easing: "cubic-bezier(.2,.9,.2,1)", fill: "forwards" });

    // прыжок вратаря
    const kdx = keeperTo.x - keeperFrom.x;
    const kdy = keeperTo.y - keeperFrom.y;
    keeperEl.style.transform = `translateX(-50%) translate(${kdx}px, ${kdy}px)`;
    glovesEl.style.transform = "scale(1.05)";

    // Результат
    setTimeout(() => {
      const isSave = (S.keeperPick === S.picked);

      // координаты вспышки (внутри fx контейнера)
      const localX = (to.x - frame.left) - (frame.width/2) + (fxEl.clientWidth/2);
      const localY = (to.y - frame.top) - 40;

      spawnSparks(localX, localY, !isSave);

      if (isSave){
        pickedBtn.classList.add("pulseBad");
        saveSfx();
        setStatus("Сейв");
        setLast("Сейв");
        // тряска рук
        glovesEl.animate([
          { transform:"scale(1.05)" },
          { transform:"scale(1.12) rotate(-4deg)" },
          { transform:"scale(1.06) rotate(3deg)" },
          { transform:"scale(1.05)" }
        ], { duration: 260, easing:"ease-out" });

        // мяч "отскакивает" вниз
        ballEl.animate([
          { opacity: 1 },
          { opacity: 1, transform: `translateX(-50%) translate(${dx*0.92}px, ${dy*0.92}px) scale(0.86)` },
          { opacity: 0.0, transform: `translateX(-50%) translate(${dx*0.70}px, ${dy*0.70 + 160}px) scale(0.75)` }
        ], { duration: 360, easing:"cubic-bezier(.2,.9,.2,1)", fill:"forwards" });

        overlayTitle.textContent = "СЕЙВ!";
        overlaySub.textContent = "Ставка проиграна";

        if (seriesToggle.checked) setStreak(0);

      } else {
        pickedBtn.classList.add("pulseGood");
        goalSfx();
        setStatus("Гол");
        setLast("Гол");

        const win = Math.floor(S.bet * S.odds);
        setBalance(S.balance + win);

        overlayTitle.textContent = "ГОЛ!";
        overlaySub.textContent = `+${fmtRub(win)}`;

        if (seriesToggle.checked) setStreak(S.streak + 1);
        else setStreak(0);

        // мяч "проваливается" в сетку и исчезает
        ballEl.animate([
          { opacity: 1 },
          { opacity: 1, transform: `translateX(-50%) translate(${dx}px, ${dy}px) scale(0.86)` },
          { opacity: 0.0, transform: `translateX(-50%) translate(${dx}px, ${dy + 90}px) scale(0.70)` }
        ], { duration: 380, easing:"ease-out", fill:"forwards" });
      }

      // завершение
      S.inRound = false;
      lockForAnim(false);
      targets.forEach(t => t.classList.remove("locked"));

      // показать итог
      overlay.hidden = false;

    }, 640);
  }

  function closeOverlay(){
    overlay.hidden = true;
    resetVisual();
    setStatus("Ожидание");
  }

  function resetAll(){
    clickSfx();
    S.inRound = false;
    lockForAnim(false);
    setStreak(0);
    setStep(0);
    setStatus("Ожидание");
    setLast("—");
    resetVisual();
  }

  // ---------- Events ----------
  stakeBtn.addEventListener("click", startRound);

  overlayOk.addEventListener("click", closeOverlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeOverlay(); });

  resetBtn.addEventListener("click", resetAll);

  addMoneyBtn.addEventListener("click", () => {
    clickSfx();
    setBalance(S.balance + 1000);
  });

  minusBtn.addEventListener("click", () => {
    if (S.inRound || S.animLock) return;
    clickSfx();
    setBet(S.bet - 10);
  });
  plusBtn.addEventListener("click", () => {
    if (S.inRound || S.animLock) return;
    clickSfx();
    setBet(S.bet + 10);
  });
  halfBtn.addEventListener("click", () => {
    if (S.inRound || S.animLock) return;
    clickSfx();
    setBet(Math.max(1, Math.floor(S.bet/2)));
  });
  doubleBtn.addEventListener("click", () => {
    if (S.inRound || S.animLock) return;
    clickSfx();
    setBet(Math.min(1_000_000, S.bet * 2));
  });

  multiBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      if (S.inRound || S.animLock) return;
      clickSfx();
      multiBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      setOdds(Number(btn.dataset.m));
    });
  });

  soundBtn.addEventListener("click", () => {
    S.sound = !S.sound;
    soundChip.textContent = S.sound ? "on" : "off";
    clickSfx();
  });

  // keyboard shortcuts (фарш)
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) closeOverlay();
    if (e.key === "Enter" && !S.inRound && overlay.hidden) startRound();
    if (e.key.toLowerCase() === "r") resetAll();
  });

  // ---------- Init ----------
  const saved = Number(localStorage.getItem(LS_BAL) || "1000");
  S.balance = Number.isFinite(saved) && saved >= 0 ? Math.floor(saved) : 1000;

  buildTargets();
  setBalance(S.balance);
  setBet(S.bet);
  setOdds(S.odds);
  setStreak(0);
  setStep(0);
  setStatus("Ожидание");
  setLast("—");
  soundChip.textContent = "on";
  resetVisual();
})();
