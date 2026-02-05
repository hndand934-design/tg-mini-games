(() => {
  "use strict";

  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

  // Лестница множителей (видимая всегда)
  const LADDER = [1.00, 1.20, 1.50, 2.00, 3.00, 5.00, 10.00];

  const MOVES = ["rock","paper","scissors"];
  const RU = { rock:"Камень", paper:"Бумага", scissors:"Ножницы" };
  const EMOJI = { rock:"✊🏻", paper:"🤚🏻", scissors:"✌🏻" };

  // DOM
  const el = {
    balanceVal: $("#balanceVal"),
    soundBtn: $("#soundBtn"),

    pillStatus: $("#pillStatus"),
    pillYour: $("#pillYour"),
    pillBot: $("#pillBot"),
    pillResult: $("#pillResult"),

    ladder: $("#ladder"),
    seriesWins: $("#seriesWins"),
    currentX: $("#currentX"),
    potential: $("#potential"),

    botHand: $("#botHand"),
    youHand: $("#youHand"),
    botHandBox: $("#botHandBox"),
    youHandBox: $("#youHandBox"),

    betInput: $("#betInput"),
    playBtn: $("#playBtn"),
    cashoutBtn: $("#cashoutBtn"),
    winLine: $("#winLine"),

    add1000: $("#add1000")
  };

  // ---------- storage ----------
  const LS_BAL = "rps_balance_v2";
  const LS_SND = "rps_sound_v2";

  const state = {
    balance: 1000,
    bet: 100,
    selected: null,

    // серия
    seriesActive: false,
    wins: 0,          // побед подряд
    x: 1.00,

    busy: false,
    sound: true
  };

  function load() {
    const b = Number(localStorage.getItem(LS_BAL));
    if (Number.isFinite(b) && b >= 0) state.balance = Math.floor(b);

    const s = localStorage.getItem(LS_SND);
    if (s === "0") state.sound = false;
  }
  function save() {
    localStorage.setItem(LS_BAL, String(state.balance));
    localStorage.setItem(LS_SND, state.sound ? "1":"0");
  }

  // ---------- audio (просто/тихо) ----------
  let audioCtx = null;
  function beep(kind="tap"){
    if (!state.sound) return;
    try{
      audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
      const t0 = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);

      let f1=520,f2=520,d=0.05,vol=0.02;
      if(kind==="start"){f1=380;f2=520;d=0.09;vol=0.025;}
      if(kind==="win"){f1=560;f2=860;d=0.10;vol=0.03;}
      if(kind==="lose"){f1=280;f2=180;d=0.12;vol=0.028;}
      if(kind==="cash"){f1=720;f2=980;d=0.09;vol=0.028;}

      g.gain.setValueAtTime(0.0001,t0);
      g.gain.exponentialRampToValueAtTime(vol,t0+0.01);
      g.gain.exponentialRampToValueAtTime(0.0001,t0+d);

      o.type="sine";
      o.frequency.setValueAtTime(f1,t0);
      o.frequency.linearRampToValueAtTime(f2,t0+d);
      o.start(t0);
      o.stop(t0+d+0.02);
    }catch(_){}
  }

  // ---------- UI ----------
  function setPills({status, your, bot, result}){
    if(status!==undefined) el.pillStatus.textContent = status;
    if(your!==undefined)   el.pillYour.textContent = your;
    if(bot!==undefined)    el.pillBot.textContent = bot;
    if(result!==undefined) el.pillResult.textContent = result;
  }

  function renderLadder(){
    el.ladder.innerHTML = "";
    LADDER.forEach((x, idx) => {
      const d = document.createElement("div");
      d.className = "xstep";
      d.innerHTML = `<div class="t">${idx===0?"Старт":`Шаг ${idx}`}</div><div class="x">x${x.toFixed(2)}</div>`;
      if(idx < state.wins) d.classList.add("is-done");
      if(idx === state.wins) d.classList.add("is-current");
      el.ladder.appendChild(d);
    });
  }

  function updateMeta(){
    el.balanceVal.textContent = String(state.balance);
    el.seriesWins.textContent = String(state.wins);
    el.currentX.textContent = `x${state.x.toFixed(2)}`;                 // ✅ один "x"
    el.potential.textContent = String(Math.floor(state.bet * state.x));  // ✅ один "₽" (в HTML)
    el.betInput.value = String(state.bet);
    el.soundBtn.textContent = state.sound ? "Звук: on" : "Звук: off";

    // кнопки
    const canPlay = !!state.selected && !state.busy;
    el.playBtn.disabled = !canPlay;

    const canCash = state.seriesActive && state.wins > 0 && !state.busy;
    el.cashoutBtn.disabled = !canCash;
  }

  function setHands(bot=null, you=null){
    el.botHand.textContent = bot ? EMOJI[bot] : "?";
    el.youHand.textContent = you ? EMOJI[you] : "?";
  }

  function setWinLine(t){
    el.winLine.textContent = t || "—";
  }

  function highlightMoveButtons(){
    $$("[data-move]").forEach(btn=>{
      btn.classList.toggle("is-active", btn.getAttribute("data-move")===state.selected);
    });
  }

  // ---------- logic ----------
  function outcome(you, bot){
    if(you===bot) return "draw";
    if((you==="rock" && bot==="scissors") || (you==="paper" && bot==="rock") || (you==="scissors" && bot==="paper")) return "win";
    return "lose";
  }

  function nextX(){
    const idx = clamp(state.wins, 0, LADDER.length-1);
    state.x = LADDER[idx];
  }

  function startSeriesIfNeeded(){
    if(state.seriesActive) return true;

    if(state.balance < state.bet){
      setPills({result:"Недостаточно средств"});
      beep("lose");
      return false;
    }

    state.balance -= state.bet; // ставка списывается 1 раз
    state.seriesActive = true;
    state.wins = 0;
    state.x = 1.00;
    save();
    return true;
  }

  async function play(){
    if(state.busy) return;
    if(!state.selected) return;

    if(!startSeriesIfNeeded()){
      updateMeta();
      return;
    }

    state.busy = true;
    updateMeta();

    setPills({status:"Раунд...", your: RU[state.selected], bot:"…", result:"Идёт бой"});
    setWinLine("—");
    beep("start");

    // shuffle animation (коротко, без лагов)
    for(let i=0;i<9;i++){
      const bm = MOVES[(Math.random()*3)|0];
      const ym = MOVES[(Math.random()*3)|0];
      setHands(bm, ym);
      await new Promise(r=>setTimeout(r, 55));
    }

    const botMove = MOVES[(Math.random()*3)|0];
    const youMove = state.selected;

    // ударная анимация
    el.botHandBox.classList.remove("shake-left");
    el.youHandBox.classList.remove("shake-right");
    void el.botHandBox.offsetWidth;
    el.botHandBox.classList.add("shake-left");
    el.youHandBox.classList.add("shake-right");

    setHands(botMove, youMove);
    setPills({bot: RU[botMove]});

    const res = outcome(youMove, botMove);

    if(res==="draw"){
      setPills({status:"Ничья", result:"Серия продолжается"});
      setWinLine("0 ₽ (ничья)");
      beep("tap");
    }

    if(res==="win"){
      state.wins = clamp(state.wins + 1, 0, LADDER.length-1);
      nextX();
      const pot = Math.floor(state.bet * state.x);
      setPills({status:"Победа", result:`Шаг +1 (${state.wins}/${LADDER.length-1})`});
      setWinLine(`Потенциал: ${pot} ₽`);
      beep("win");

      // если дошёл до конца — авто cashout
      if(state.wins >= LADDER.length-1){
        await new Promise(r=>setTimeout(r, 450));
        cashout(true);
      }
    }

    if(res==="lose"){
      setPills({status:"Поражение", result:"Серия в ноль"});
      setWinLine(`-${state.bet} ₽`);
      beep("lose");

      // ✅ сброс серии
      state.seriesActive = false;
      state.wins = 0;
      state.x = 1.00;
    }

    renderLadder();
    updateMeta();

    state.busy = false;
    updateMeta();
  }

  function cashout(auto=false){
    if(!state.seriesActive || state.wins<=0) return;

    const win = Math.floor(state.bet * state.x);
    state.balance += win;
    save();

    setPills({status: auto ? "Финиш" : "Забрал", result: `+${win} ₽`});
    setWinLine(`Выигрыш: +${win} ₽`);
    beep("cash");

    // сброс серии
    state.seriesActive = false;
    state.wins = 0;
    state.x = 1.00;

    renderLadder();
    updateMeta();
  }

  // ---------- events (фикс кликов) ----------
  function forceClickableAll(){
    // убираем возможность, что слой ловит клики
    $$("[class*='bg'], .bg, .decor, .overlay").forEach(n => n.style.pointerEvents="none");
    // кнопки — точно кликабельны
    $$("button, [data-move], [data-bet], [data-bet-delta]").forEach(n=>{
      n.style.pointerEvents="auto";
      n.style.position = n.style.position || "relative";
      n.style.zIndex = n.style.zIndex || "20";
    });
  }

  function bind(){
    // выбор фигуры
    $$("[data-move]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        if(state.busy) return;
        state.selected = btn.getAttribute("data-move");
        highlightMoveButtons();
        setPills({your: RU[state.selected]});
        beep("tap");
        updateMeta();
      });
    });

    // play/cashout
    el.playBtn.addEventListener("click", play);
    el.cashoutBtn.addEventListener("click", ()=>cashout(false));

    // sound
    el.soundBtn.addEventListener("click", ()=>{
      state.sound = !state.sound;
      save();
      updateMeta();
      beep("tap");
    });

    // bet chips
    $$("[data-bet]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const v = btn.getAttribute("data-bet");
        if(v==="max"){
          state.bet = clamp(state.balance, 1, 1000000);
        } else {
          state.bet = clamp(Number(v)||state.bet, 1, 1000000);
        }
        nextX();
        updateMeta();
        beep("tap");
      });
    });

    // bet +/-
    $$("[data-bet-delta]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const d = Number(btn.getAttribute("data-bet-delta"))||0;
        state.bet = clamp(state.bet + d, 1, 1000000);
        nextX();
        updateMeta();
        beep("tap");
      });
    });

    // bet input
    el.betInput.addEventListener("input", ()=>{
      const v = Number(String(el.betInput.value).replace(/[^\d]/g,""));
      if(Number.isFinite(v) && v>0){
        state.bet = clamp(Math.floor(v), 1, 1000000);
        nextX();
        updateMeta();
      }
    });

    // +1000
    el.add1000.addEventListener("click", ()=>{
      state.balance += 1000;
      save();
      updateMeta();
      beep("tap");
    });
  }

  function init(){
    load();
    forceClickableAll();

    state.bet = clamp(state.bet, 1, 1000000);
    nextX();

    setHands(null,null);
    setPills({status:"Ожидание", your:"—", bot:"—", result:"—"});
    setWinLine("—");
    renderLadder();
    updateMeta();
    bind();
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
