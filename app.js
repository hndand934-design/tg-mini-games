/* RPS FINAL — GitHub Pages, без подвохов :)
   - Лестница X + серия побед
   - Ставка списывается 1 раз на старт серии
   - Cashout вместо Reset
   - 2D SVG руки (skin tone)
   - Плавные анимации + звуки (WebAudio) + кнопка звук on/off
*/

(() => {
  const $ = (id) => document.getElementById(id);

  // ---- CONFIG
  const X_STEPS = [1.00, 1.20, 1.50, 2.00, 3.00, 5.00, 10.00];

  // вероятность ничьей/победы зависит от игрока (честный рандом по выбору бота)
  const PICKS = ["rock", "scissors", "paper"];
  const LABEL = {
    rock: "✊🏻 Камень",
    scissors: "✌🏻 Ножницы",
    paper: "🤚🏻 Бумага"
  };

  // ---- STORAGE
  const LS_BAL = "rps_balance_v1";
  const LS_SND = "rps_sound_v1";

  // ---- DOM
  const balanceEl = $("balance");
  const statusEl = $("status");
  const youPickEl = $("youPick");
  const botPickEl = $("botPick");
  const resultEl = $("result");
  const streakEl = $("streak");
  const curXEl = $("curX");
  const potentialEl = $("potential");
  const winEl = $("win");

  const stepsEl = $("steps");

  const betInput = $("betAmount");
  const btnMinus = $("minus");
  const btnPlus = $("plus");
  const btnAdd1000 = $("add1000");
  const quickBtns = Array.from(document.querySelectorAll(".q"));

  const playBtn = $("playBtn");
  const cashoutBtn = $("cashoutBtn");

  const pickBtns = Array.from(document.querySelectorAll(".pickBtn"));
  const botCard = $("botCard");
  const youCard = $("youCard");
  const botHand = $("botHand");
  const youHand = $("youHand");
  const sparks = $("sparks");

  const soundBtn = $("soundBtn");
  const soundText = $("soundText");

  // ---- SVG HANDS (2D, human tone)
  const SKIN = "#E7C3A1";
  const OUT = "rgba(255,255,255,.22)";
  const SH = "rgba(0,0,0,.25)";

  function svgRock(size=120){
    return `
    <svg width="${size}" height="${size}" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <defs>
        <filter id="ds" x="-20" y="-20" width="160" height="160">
          <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="${SH}"/>
        </filter>
      </defs>
      <g filter="url(#ds)">
        <path d="M36 54c0-10 8-18 18-18h9c10 0 18 8 18 18v22c0 10-8 18-18 18H54c-10 0-18-8-18-18V54z"
              fill="${SKIN}" stroke="${OUT}" stroke-width="2" />
        <path d="M44 42c0-6 5-11 11-11h2c6 0 11 5 11 11v8H44v-8z"
              fill="${SKIN}" stroke="${OUT}" stroke-width="2"/>
        <path d="M35 64h50" stroke="rgba(0,0,0,.10)" stroke-width="3" stroke-linecap="round"/>
        <path d="M40 76h40" stroke="rgba(0,0,0,.08)" stroke-width="3" stroke-linecap="round"/>
      </g>
    </svg>`;
  }

  function svgScissors(size=120){
    return `
    <svg width="${size}" height="${size}" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <defs>
        <filter id="ds2" x="-20" y="-20" width="160" height="160">
          <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="${SH}"/>
        </filter>
      </defs>
      <g filter="url(#ds2)">
        <path d="M46 70c0-9 7-16 16-16h2c9 0 16 7 16 16v10c0 9-7 16-16 16h-2c-9 0-16-7-16-16V70z"
              fill="${SKIN}" stroke="${OUT}" stroke-width="2"/>
        <path d="M56 26c2-4 7-6 11-4l6 3c4 2 6 7 4 11l-12 24c-2 4-7 6-11 4l-6-3c-4-2-6-7-4-11l12-24z"
              fill="${SKIN}" stroke="${OUT}" stroke-width="2"/>
        <path d="M74 28c2-4 7-6 11-4l6 3c4 2 6 7 4 11L83 62c-2 4-7 6-11 4l-6-3c-4-2-6-7-4-11l12-24z"
              fill="${SKIN}" stroke="${OUT}" stroke-width="2" opacity=".95"/>
        <path d="M46 64h34" stroke="rgba(0,0,0,.10)" stroke-width="3" stroke-linecap="round"/>
      </g>
    </svg>`;
  }

  function svgPaper(size=120){
    return `
    <svg width="${size}" height="${size}" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <defs>
        <filter id="ds3" x="-20" y="-20" width="160" height="160">
          <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="${SH}"/>
        </filter>
      </defs>
      <g filter="url(#ds3)">
        <path d="M38 58c0-10 8-18 18-18h22c10 0 18 8 18 18v20c0 10-8 18-18 18H56c-10 0-18-8-18-18V58z"
              fill="${SKIN}" stroke="${OUT}" stroke-width="2"/>
        <path d="M49 26c0-5 4-9 9-9h2c5 0 9 4 9 9v20H49V26z"
              fill="${SKIN}" stroke="${OUT}" stroke-width="2"/>
        <path d="M69 26c0-5 4-9 9-9h2c5 0 9 4 9 9v22H69V26z"
              fill="${SKIN}" stroke="${OUT}" stroke-width="2" opacity=".96"/>
        <path d="M39 68h58" stroke="rgba(0,0,0,.08)" stroke-width="3" stroke-linecap="round"/>
        <path d="M43 80h50" stroke="rgba(0,0,0,.06)" stroke-width="3" stroke-linecap="round"/>
      </g>
    </svg>`;
  }

  function svgForPick(pick, size=120){
    if(pick === "rock") return svgRock(size);
    if(pick === "scissors") return svgScissors(size);
    return svgPaper(size);
  }

  // mini icons
  $("miniRock").innerHTML = svgRock(28);
  $("miniScissors").innerHTML = svgScissors(28);
  $("miniPaper").innerHTML = svgPaper(28);

  // ---- AUDIO (WebAudio, мягкие сигналы)
  let audioCtx = null;
  let soundOn = (localStorage.getItem(LS_SND) ?? "0") === "1";

  function ensureAudio(){
    if(!audioCtx){
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if(audioCtx.state === "suspended") audioCtx.resume().catch(()=>{});
  }

  function beep({freq=440, dur=0.10, type="sine", gain=0.03, slide=0}){
    if(!soundOn) return;
    ensureAudio();
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq*slide), t0 + dur);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function sClick(){ beep({freq:520, dur:0.07, type:"triangle", gain:0.025}); }
  function sStart(){ beep({freq:420, dur:0.12, type:"sine", gain:0.028, slide:1.25}); }
  function sReveal(){ beep({freq:640, dur:0.08, type:"triangle", gain:0.020}); }
  function sWin(){ beep({freq:760, dur:0.13, type:"sine", gain:0.030, slide:1.12}); beep({freq:980, dur:0.10, type:"sine", gain:0.022}); }
  function sLose(){ beep({freq:220, dur:0.18, type:"sawtooth", gain:0.018, slide:0.70}); }
  function sCashout(){ beep({freq:560, dur:0.10, type:"triangle", gain:0.024, slide:1.20}); beep({freq:760, dur:0.10, type:"triangle", gain:0.020}); }

  function syncSoundUI(){
    soundText.textContent = `Звук: ${soundOn ? "on" : "off"}`;
    soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
    soundBtn.querySelector(".dot").style.background = soundOn ? "rgba(77,255,182,.8)" : "rgba(255,255,255,.25)";
  }

  soundBtn.addEventListener("click", () => {
    // важно: первый клик включает аудио контекст на многих браузерах
    ensureAudio();
    soundOn = !soundOn;
    localStorage.setItem(LS_SND, soundOn ? "1" : "0");
    syncSoundUI();
    if(soundOn) sClick();
  });

  syncSoundUI();

  // ---- STATE
  let balance = Number(localStorage.getItem(LS_BAL) || 1000);
  let bet = 100;

  let selectedPick = null;

  let inSeries = false;      // серия активна (ставка уже списана)
  let seriesBet = 0;         // ставка, с которой началась серия
  let streak = 0;            // подряд побед
  let locked = false;        // блок на время анимации

  // ---- UI INIT
  function fmt(n){ return new Intl.NumberFormat("ru-RU").format(n); }
  function fmt2(n){ return (Math.round(n*100)/100).toFixed(2); }

  function setBalance(v){
    balance = Math.max(0, Math.floor(v));
    balanceEl.textContent = fmt(balance);
    localStorage.setItem(LS_BAL, String(balance));
  }
  setBalance(balance);

  function clampBet(){
    const v = Number(String(betInput.value).replace(/[^\d]/g,"")) || 0;
    bet = Math.max(10, Math.min(999999, v));
    betInput.value = String(bet);
  }

  clampBet();

  // build ladder UI
  function buildSteps(){
    stepsEl.innerHTML = "";
    X_STEPS.forEach((x, i) => {
      const pill = document.createElement("div");
      pill.className = "stepPill";
      pill.innerHTML = `<small>${i===0 ? "Старт" : `Шаг ${i}`}</small>x${fmt2(x)}`;
      pill.dataset.idx = String(i);
      stepsEl.appendChild(pill);
    });
  }
  buildSteps();

  function updateLadder(){
    const idx = Math.min(streak, X_STEPS.length-1);
    Array.from(stepsEl.children).forEach((el, i) => {
      el.classList.toggle("active", i === idx);
      el.classList.toggle("done", i < idx);
    });
  }

  function currentX(){
    return X_STEPS[Math.min(streak, X_STEPS.length-1)];
  }

  function updateSeriesUI(){
    streakEl.textContent = String(streak);
    curXEl.textContent = fmt2(currentX());

    const pot = inSeries ? Math.floor(seriesBet * currentX()) : 0;
    potentialEl.textContent = fmt(pot);

    cashoutBtn.disabled = !(inSeries && streak > 0); // только если есть что забирать
    winEl.textContent = inSeries ? `${fmt(pot)} ₽` : "—";

    updateLadder();
  }

  function setStatus(text){
    statusEl.textContent = text;
  }

  function setResult(text, kind=null){
    resultEl.textContent = text;
    // подсветка арены
    $("botCard").classList.remove("winGlow","loseGlow");
    $("youCard").classList.remove("winGlow","loseGlow");
    if(kind === "win"){
      youCard.classList.add("winGlow");
      botCard.classList.add("loseGlow");
    } else if(kind === "lose"){
      youCard.classList.add("loseGlow");
      botCard.classList.add("winGlow");
    }
  }

  function setPickTexts(){
    youPickEl.textContent = selectedPick ? LABEL[selectedPick] : "—";
  }

  function setBotText(pick){
    botPickEl.textContent = pick ? LABEL[pick] : "—";
  }

  function showHands(you, bot){
    youHand.innerHTML = you ? svgForPick(you, 120) : `<div style="font-weight:900;color:rgba(255,255,255,.55);font-size:34px;">?</div>`;
    botHand.innerHTML = bot ? svgForPick(bot, 120) : `<div style="font-weight:900;color:rgba(255,255,255,.55);font-size:34px;">?</div>`;
  }

  // initial hands
  showHands(null, null);
  setPickTexts();
  setBotText(null);
  setResult("—");
  setStatus("Ожидание");
  updateSeriesUI();

  // ---- SPARKS
  function burst(){
    // небольшой конфетти-эффект
    const rect = document.querySelector(".arena").getBoundingClientRect();
    for(let i=0;i<14;i++){
      const s = document.createElement("div");
      s.className = "spark";
      const x = rect.width/2 + (Math.random()*80 - 40);
      const y = rect.height/2 + (Math.random()*50 - 25);
      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      s.style.setProperty("--dx", `${Math.random()*260 - 130}px`);
      s.style.setProperty("--dy", `${Math.random()*200 - 120}px`);
      sparks.appendChild(s);
      setTimeout(()=> s.remove(), 800);
    }
  }

  // ---- GAME LOGIC
  function botRandomPick(){
    return PICKS[Math.floor(Math.random()*PICKS.length)];
  }

  function outcome(you, bot){
    if(you === bot) return "draw";
    if(
      (you==="rock" && bot==="scissors") ||
      (you==="scissors" && bot==="paper") ||
      (you==="paper" && bot==="rock")
    ) return "win";
    return "lose";
  }

  function lock(ms){
    locked = true;
    setTimeout(()=> locked = false, ms);
  }

  // анимация "перемешивания" перед раскрытием
  async function animateReveal(){
    youCard.classList.add("shake");
    botCard.classList.add("shake");

    const spins = 6;
    for(let i=0;i<spins;i++){
      const a = PICKS[i % 3];
      const b = PICKS[(i+1) % 3];
      showHands(a, b);
      sReveal();
      await new Promise(r => setTimeout(r, 70));
    }

    youCard.classList.remove("shake");
    botCard.classList.remove("shake");
  }

  function startSeriesIfNeeded(){
    if(inSeries) return true;

    // списываем ставку 1 раз
    if(bet > balance){
      setStatus("Недостаточно средств");
      setResult("Не хватает баланса");
      return false;
    }
    setBalance(balance - bet);
    seriesBet = bet;
    inSeries = true;
    streak = 0;
    updateSeriesUI();
    return true;
  }

  async function playRound(){
    if(locked) return;
    if(!selectedPick){
      setStatus("Выбери: камень/ножницы/бумага");
      return;
    }

    if(!startSeriesIfNeeded()) return;

    lock(700);
    setStatus("Раунд...");
    setResult("Идёт ход...");
    setBotText(null);

    // скрываем иконки на момент "перемешивания"
    showHands(null, null);
    youCard.classList.remove("reveal");
    botCard.classList.remove("reveal");

    sStart();
    await animateReveal();

    const bot = botRandomPick();
    const you = selectedPick;

    showHands(you, bot);
    youCard.classList.add("reveal");
    botCard.classList.add("reveal");

    setBotText(bot);

    const res = outcome(you, bot);

    if(res === "draw"){
      setStatus("Ничья");
      setResult("Ничья • серия продолжается");
      // X и серия не меняются
      sClick();
    }

    if(res === "win"){
      streak += 1;
      updateSeriesUI();
      setStatus("Победа");
      setResult("Победа ✅", "win");
      burst();
      sWin();
    }

    if(res === "lose"){
      // серия сгорает
      inSeries = false;
      streak = 0;
      seriesBet = 0;
      updateSeriesUI();
      setStatus("Поражение");
      setResult("Поражение ❌", "lose");
      sLose();

      // после поражения выбор игрока можно оставить (чтобы быстрее играть)
    }
  }

  function cashout(){
    if(locked) return;
    if(!(inSeries && streak > 0)) return;

    const pay = Math.floor(seriesBet * currentX());
    setBalance(balance + pay);

    setStatus("Забрал");
    setResult(`Cashout: +${fmt(pay)} ₽`, "win");
    sCashout();
    burst();

    // сброс серии
    inSeries = false;
    streak = 0;
    seriesBet = 0;
    updateSeriesUI();

    // слегка очистим бота (чтобы визуально было "новый заход")
    setBotText(null);
  }

  // ---- PICK UI
  function setActivePick(pick){
    selectedPick = pick;
    pickBtns.forEach(b => b.classList.toggle("active", b.dataset.pick === pick));
    setPickTexts();
    sClick();
  }

  pickBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setActivePick(btn.dataset.pick);
    });
  });

  // ---- BET UI
  betInput.addEventListener("input", () => {
    clampBet();
  });
  betInput.addEventListener("blur", clampBet);

  btnMinus.addEventListener("click", () => {
    clampBet();
    bet = Math.max(10, bet - 10);
    betInput.value = String(bet);
    sClick();
  });
  btnPlus.addEventListener("click", () => {
    clampBet();
    bet = Math.min(999999, bet + 10);
    betInput.value = String(bet);
    sClick();
  });
  btnAdd1000.addEventListener("click", () => {
    setBalance(balance + 1000);
    sClick();
  });

  quickBtns.forEach(b => {
    b.addEventListener("click", () => {
      clampBet();
      const add = b.dataset.add;
      if(add === "max"){
        bet = Math.max(10, balance); // MAX = весь баланс (минимум 10)
      } else {
        bet += Number(add);
      }
      betInput.value = String(bet);
      sClick();
    });
  });

  // ---- MAIN BUTTONS
  playBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    playRound();
  });

  cashoutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    cashout();
  });

  // ---- make sure clicks always work
  // (некоторые браузеры любят фокусить инпут, но у нас всё ок)

  // small safety: click anywhere to init audio context once
  window.addEventListener("pointerdown", () => {
    if(soundOn) ensureAudio();
  }, {once:true});
})();

