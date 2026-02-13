// =====================================================
// Mini Games HUB (8 modes): Coin, Dice, Mines, Crash, Wheel, RPS, Penalty, Dragon Tower
// =====================================================

// ---------- RNG (честный) ----------
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function randInt(min, max) {
  return Math.floor(randFloat() * (max - min + 1)) + min;
}

// ---------- Telegram ----------
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

// ---------- DOM ----------
const screenEl = document.getElementById("screen");
const userEl = document.getElementById("user");
const coinsEl = document.getElementById("coins");
const soundBtn = document.getElementById("soundBtn");

// ---------- Wallet ----------
const WALLET_KEY = "mini_wallet_all_v3";
function loadWallet() {
  try {
    const w = JSON.parse(localStorage.getItem(WALLET_KEY) || "null");
    if (w && typeof w.coins === "number") return w;
  } catch {}
  return { coins: 1000 };
}
function saveWallet(w) { localStorage.setItem(WALLET_KEY, JSON.stringify(w)); }
let wallet = loadWallet();

function setCoins(v) {
  wallet.coins = Math.max(0, Math.floor(v));
  saveWallet(wallet);
  renderTopBar();
}
function addCoins(d) { setCoins(wallet.coins + d); }

// ---------- Sound ----------
const SOUND_KEY = "mini_sound_all_v2";
let soundOn = (localStorage.getItem(SOUND_KEY) ?? "1") === "1";
function setSound(v){
  soundOn = !!v;
  localStorage.setItem(SOUND_KEY, soundOn ? "1" : "0");
  soundBtn.textContent = soundOn ? "🔊" : "🔇";
}
setSound(soundOn);

let audioCtx = null;
function beep(freq = 520, dur = 0.05, vol = 0.03, type = "sine") {
  if (!soundOn) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  } catch {}
}
soundBtn.onclick = () => { setSound(!soundOn); beep(660, 0.05, 0.04); };

// ---------- Topbar ----------
function renderTopBar() {
  const user = tg?.initDataUnsafe?.user;
  userEl.textContent = user
    ? `Привет, ${user.first_name}`
    : `Открыто вне Telegram`;
  coinsEl.textContent = String(wallet.coins);
}
renderTopBar();

// ---------- Safe cleanup between screens ----------
let cleanup = () => {};
function setCleanup(fn) { cleanup = typeof fn === "function" ? fn : () => {}; }

// ---------- Router ----------
function setScreen(name) {
  try { cleanup(); } catch {}
  setCleanup(() => {});
  const screens = {
    menu: renderMenu,
    coin: renderCoin,
    dice: renderDice,
    mines: renderMines,
    crash: renderCrash,
    wheel: renderWheel,
    rps: renderRPS,
    penalty: renderPenalty,
    tower: renderTower,
  };
  (screens[name] || renderMenu)();
}
document.querySelectorAll(".nav button").forEach(btn => {
  btn.addEventListener("click", () => setScreen(btn.dataset.screen));
});

// =====================================================
// MENU
// =====================================================
function renderMenu(){
  screenEl.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div>
          <div style="font-weight:1000;font-size:18px;">Выбери режим</div>
          <div class="small" style="margin-top:4px;">8 режимов · виртуальные монеты 🪙 (localStorage)</div>
        </div>
        <div class="badge">Баланс: <b>🪙 ${wallet.coins}</b></div>
      </div>

      <div class="hr"></div>

      <div class="row">
        <button class="btn" onclick="__go('crash')">🚀 Crash</button>
        <button class="btn ghost" onclick="__go('mines')">💣 Mines</button>
        <button class="btn ghost" onclick="__go('wheel')">🎡 Wheel</button>
        <button class="btn ghost" onclick="__go('penalty')">🥅 Penalty</button>
      </div>

      <div class="row" style="margin-top:10px;">
        <button class="btn ghost" onclick="__go('rps')">✊ RPS</button>
        <button class="btn ghost" onclick="__go('tower')">🐉 Tower</button>
        <button class="btn ghost" onclick="__go('coin')">🪙 Coin Flip</button>
        <button class="btn ghost" onclick="__go('dice')">🎲 Dice</button>
      </div>

      <div class="hr"></div>

      <div class="row">
        <button class="btn ghost" id="bonus">+1000 🪙</button>
        <button class="btn ghost" id="reset">Сбросить баланс</button>
        <span class="small">Монеты виртуальные, без вывода.</span>
      </div>
    </div>
  `;
  document.getElementById("bonus").onclick = () => addCoins(1000);
  document.getElementById("reset").onclick = () => setCoins(1000);
}
window.__go = (n) => setScreen(n);

// =====================================================
// COIN FLIP (ставка + анимация)
// =====================================================
(function coinStyleOnce(){
  if (document.getElementById("coinflip-style")) return;
  const st = document.createElement("style");
  st.id = "coinflip-style";
  st.textContent = `
    .coinWrap{display:flex;flex-direction:column;align-items:center;gap:12px;margin-top:12px;}
    .coin3d{
      width:100px;height:100px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.24), rgba(255,255,255,.06));
      border:1px solid rgba(255,255,255,.10);
      box-shadow: 0 14px 28px rgba(0,0,0,.35);
      font-size:46px;
      transform-style:preserve-3d;
      user-select:none;
    }
    .coin3d.spin{ animation: coinspin 1.0s ease-in-out both; }
    @keyframes coinspin{
      0%{transform: rotateY(0deg) rotateX(0deg) scale(1);filter:blur(0px);}
      35%{transform: rotateY(720deg) rotateX(180deg) scale(1.07);filter:blur(.6px);}
      70%{transform: rotateY(1440deg) rotateX(300deg) scale(1.03);filter:blur(.2px);}
      100%{transform: rotateY(1800deg) rotateX(360deg) scale(1);filter:blur(0px);}
    }
  `;
  document.head.appendChild(st);
})();

function renderCoin(){
  const presets=[10,50,100,250,500];

  screenEl.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div>
          <div style="font-weight:1000;font-size:16px;">Coin Flip</div>
          <div class="small" style="margin-top:4px;">Ставка 🪙 + выбор: Орёл/Решка · Выплата x2</div>
        </div>
        <div class="badge">Баланс: <b>🪙 ${wallet.coins}</b></div>
      </div>

      <div class="hr"></div>

      <div class="row" style="justify-content:space-between;">
        <div style="font-weight:900;">Ставка</div>
        <div class="badge"><b id="betShow">50</b> 🪙</div>
      </div>

      <div class="row" style="margin-top:8px;gap:8px;">
        ${presets.map(v=>`<button class="chip" data-bet="${v}">${v}</button>`).join("")}
        <button class="chip" data-bet="max">MAX</button>
        <button class="chip" id="bonus">+1000</button>
      </div>

      <div class="row" style="margin-top:10px;">
        <button class="btn small" id="betMinus">-</button>
        <input id="bet" class="input" type="number" min="1" step="1" value="50" style="flex:1;">
        <button class="btn small" id="betPlus">+</button>
      </div>

      <div class="hr"></div>

      <div class="row">
        <button class="chip active" id="pickH">🦅 Орёл</button>
        <button class="chip" id="pickT">🌙 Решка</button>
      </div>

      <div class="coinWrap">
        <div id="coin" class="coin3d">🪙</div>
        <div id="msg" class="msg"></div>
      </div>

      <div class="row" style="margin-top:12px;">
        <button class="btn" id="flip" style="flex:1;">Бросить</button>
      </div>
    </div>
  `;

  let choice="H";
  const betInput = document.getElementById("bet");
  const betShow = document.getElementById("betShow");
  const msg = document.getElementById("msg");
  const coin = document.getElementById("coin");

  function clampBet(){
    let v = Math.floor(Number(betInput.value)||0);
    if (v<1) v=1;
    if (v>wallet.coins) v=wallet.coins;
    betInput.value = String(v);
    betShow.textContent = String(v);
  }
  clampBet();

  document.getElementById("bonus").onclick = () => addCoins(1000);
  document.querySelectorAll(".chip[data-bet]").forEach(b=>{
    b.onclick = () => {
      const val = b.dataset.bet;
      betInput.value = (val==="max") ? String(wallet.coins) : String(val);
      clampBet();
      beep(560,0.03,0.02);
    };
  });
  document.getElementById("betMinus").onclick = () => { betInput.value = String((Number(betInput.value)||1)-10); clampBet(); };
  document.getElementById("betPlus").onclick = () => { betInput.value = String((Number(betInput.value)||1)+10); clampBet(); };
  betInput.oninput = clampBet;

  const pickH=document.getElementById("pickH");
  const pickT=document.getElementById("pickT");
  pickH.onclick=()=>{choice="H"; pickH.classList.add("active"); pickT.classList.remove("active"); beep(600,0.03,0.02);};
  pickT.onclick=()=>{choice="T"; pickT.classList.add("active"); pickH.classList.remove("active"); beep(600,0.03,0.02);};

  document.getElementById("flip").onclick = () => {
    const bet = Math.floor(Number(betInput.value)||0);
    if (bet<=0) return alert("Ставка должна быть больше 0");
    if (bet>wallet.coins) return alert("Недостаточно монет");

    addCoins(-bet);
    msg.textContent="";
    coin.textContent="🪙";
    coin.classList.remove("spin");
    void coin.offsetWidth;
    coin.classList.add("spin");
    beep(740,0.04,0.02);

    setTimeout(()=>{
      const res = randFloat()<0.5 ? "H":"T";
      const label = res==="H" ? "🦅 Орёл" : "🌙 Решка";
      coin.textContent = res==="H" ? "🦅" : "🌙";

      if (res===choice){
        const win = bet*2;
        addCoins(win);
        msg.textContent = `✅ ${label} — выигрыш +${win} 🪙`;
        beep(980,0.05,0.03);
      } else {
        msg.textContent = `❌ ${label} — проигрыш`;
        beep(220,0.08,0.03,"square");
      }
    }, 980);
  };
}

// =====================================================
// DICE
// =====================================================
function renderDice(){
  screenEl.innerHTML=`
    <div class="card">
      <div style="font-weight:1000;font-size:16px;">Dice</div>
      <div class="small" style="margin-top:4px;">Просто броски кубиков.</div>
      <div class="hr"></div>
      <div id="out" style="font-size:28px;font-weight:1000;">🎲</div>
      <div class="row" style="margin-top:12px;">
        <button class="btn ghost" id="d6">D6</button>
        <button class="btn ghost" id="d20">D20</button>
        <button class="btn ghost" id="d100">D100</button>
      </div>
    </div>
  `;
  const out=document.getElementById("out");
  const roll=(s)=>{ out.textContent=`🎲 ${randInt(1,s)} (из ${s})`; beep(560,0.03,0.02); };
  document.getElementById("d6").onclick=()=>roll(6);
  document.getElementById("d20").onclick=()=>roll(20);
  document.getElementById("d100").onclick=()=>roll(100);
}

// =====================================================
// MINES (PRO: ставка, мин-слайдер, множитель, cashout)
// =====================================================
let minesState=null;

function renderMines(){
  const size=25;

  function calcMultiplier(safeOpened, minesCount) {
    const m = minesCount;
    const a = 0.095 + m * 0.0075;
    const b = 0.018 + m * 0.0018;
    const mult = 1 + safeOpened * a + (safeOpened * safeOpened) * b * 0.06;
    return Math.max(1, mult);
  }
  function buildMines(minesCount){
    const mines=new Set();
    while(mines.size<minesCount) mines.add(randInt(0,size-1));
    return mines;
  }
  function revealAll(){ for(let i=0;i<size;i++) minesState.opened.add(i); }

  function startGame(bet, minesCount){
    bet=Math.floor(Number(bet)||0);
    minesCount=Math.floor(Number(minesCount)||0);
    if (bet<=0) return alert("Ставка должна быть больше 0");
    if (bet>wallet.coins) return alert("Недостаточно монет");
    if (minesCount<1 || minesCount>size-1) return alert(`Мин должно быть 1..${size-1}`);

    addCoins(-bet);
    minesState={
      bet, minesCount,
      mines: buildMines(minesCount),
      opened: new Set(),
      over:false,
      safeOpened:0,
      multiplier:1,
      msg:"",
      cashed:false
    };
    draw();
  }

  function cashOut(){
    if (!minesState || minesState.over || minesState.cashed) return;
    minesState.cashed=true;
    minesState.over=true;
    const payout=Math.floor(minesState.bet*minesState.multiplier);
    addCoins(payout);
    minesState.msg=`✅ Забрал: +${payout} 🪙 (x${minesState.multiplier.toFixed(2)})`;
    revealAll();
    draw();
    beep(980,0.05,0.03);
  }

  function onCell(i){
    if (!minesState || minesState.over) return;
    if (minesState.opened.has(i)) return;

    minesState.opened.add(i);
    if (minesState.mines.has(i)){
      minesState.over=true;
      minesState.msg=`💥 Мина! Ставка ${minesState.bet} 🪙 сгорела`;
      revealAll();
      draw();
      beep(220,0.10,0.03,"square");
      return;
    }

    minesState.safeOpened += 1;
    minesState.multiplier = calcMultiplier(minesState.safeOpened, minesState.minesCount);

    if (minesState.safeOpened >= size - minesState.minesCount){
      minesState.msg="🏁 Открыл все safe! Авто-забор.";
      cashOut();
      return;
    }
    beep(560,0.03,0.02);
    draw();
  }

  function setup(){
    const presets=[10,50,100,250,500];
    screenEl.innerHTML=`
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <div style="font-weight:1000;font-size:16px;">Mines</div>
            <div class="small" style="margin-top:4px;">Ставка 🪙 + мин-слайдер + “Забрать”.</div>
          </div>
          <div class="badge">Баланс: <b>🪙 ${wallet.coins}</b></div>
        </div>

        <div class="hr"></div>

        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-weight:900;">Ставка</div>
          <div class="badge"><b id="betShow">50</b> 🪙</div>
        </div>

        <div class="row" style="margin-top:8px;">
          ${presets.map(v=>`<button class="chip" data-bet="${v}">${v}</button>`).join("")}
          <button class="chip" data-bet="max">MAX</button>
          <button class="chip" id="bonus">+1000</button>
        </div>

        <div class="row" style="margin-top:10px;">
          <button class="btn small" id="betMinus">-</button>
          <input id="bet" class="input" type="number" min="1" step="1" value="50" style="flex:1;">
          <button class="btn small" id="betPlus">+</button>
        </div>

        <div class="hr"></div>

        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-weight:900;">Количество мин</div>
          <div class="badge"><b id="minesShow">5</b></div>
        </div>

        <input id="minesCount" type="range" min="1" max="24" value="5"
          style="width:100%;accent-color:#4c7dff;margin-top:10px;">
        <div class="small" style="margin-top:6px;">Больше мин → быстрее растёт множитель, но сложнее.</div>

        <div class="row" style="margin-top:14px;">
          <button class="btn" id="start" style="flex:1;">Start</button>
        </div>
      </div>
    `;

    const betInput=document.getElementById("bet");
    const betShow=document.getElementById("betShow");
    const minesRange=document.getElementById("minesCount");
    const minesShow=document.getElementById("minesShow");

    function clampBet(){
      let v=Math.floor(Number(betInput.value)||0);
      if (v<1) v=1;
      if (v>wallet.coins) v=wallet.coins;
      betInput.value=String(v);
      betShow.textContent=String(v);
    }
    function clampMines(){
      minesShow.textContent=String(Math.floor(Number(minesRange.value)||1));
    }
    clampBet(); clampMines();

    document.getElementById("bonus").onclick=()=>addCoins(1000);
    document.querySelectorAll(".chip[data-bet]").forEach(b=>{
      b.onclick=()=>{
        const val=b.dataset.bet;
        betInput.value = (val==="max") ? String(wallet.coins) : String(val);
        clampBet();
      };
    });
    document.getElementById("betMinus").onclick=()=>{ betInput.value=String((Number(betInput.value)||1)-10); clampBet(); };
    document.getElementById("betPlus").onclick=()=>{ betInput.value=String((Number(betInput.value)||1)+10); clampBet(); };
    betInput.oninput=clampBet;
    minesRange.oninput=clampMines;

    document.getElementById("start").onclick=()=>startGame(betInput.value, minesRange.value);
  }

  function draw(){
    if (!minesState) return setup();

    const cells=[];
    for (let i=0;i<size;i++){
      const opened=minesState.opened.has(i);
      const isMine=minesState.mines.has(i);
      let cls="cell";
      let label="";
      if (opened){
        if (isMine){ cls+=" mine"; label="💣"; }
        else { cls+=" safe"; label="✅"; }
      }
      cells.push(`<button class="${cls}" data-i="${i}" ${minesState.over?"disabled":""}><span class="in">${label}</span></button>`);
    }

    const potential=Math.floor(minesState.bet*minesState.multiplier);

    screenEl.innerHTML=`
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
          <div>
            <div style="font-weight:1000;font-size:16px;">Mines</div>
            <div class="small" style="margin-top:4px;">
              Safe: <b>${minesState.safeOpened}</b> · Мин: <b>${minesState.minesCount}</b> · Ставка: <b>${minesState.bet} 🪙</b>
            </div>
          </div>

          <div class="kpi" style="text-align:right;">
            <div class="small">Сейчас</div>
            <div style="font-size:22px;font-weight:1000;">x${minesState.multiplier.toFixed(2)}</div>
            <div class="small" style="margin-top:4px;">Забрать: <b>${potential} 🪙</b></div>
          </div>
        </div>

        <div class="msg" style="margin-top:10px;">${minesState.msg||""}</div>

        <div class="grid5">${cells.join("")}</div>

        <div class="row" style="margin-top:12px;">
          <button class="btn" id="cash" ${minesState.over?"disabled":""} style="flex:1;">Забрать</button>
          <button class="btn ghost" id="new">Новый раунд</button>
          <button class="btn ghost" id="bonus">+1000</button>
        </div>
      </div>
    `;

    document.getElementById("cash").onclick=cashOut;
    document.getElementById("new").onclick=()=>{ minesState=null; draw(); };
    document.getElementById("bonus").onclick=()=>addCoins(1000);

    screenEl.querySelectorAll(".cell").forEach(b=>{
      b.onclick=()=>onCell(Number(b.dataset.i));
    });
  }

  draw();
}

// =====================================================
// CRASH (авто-раунды, вход в раунд/кэшаут, график+ракета)
// =====================================================
function renderCrash(){
  // --- UI ---
  screenEl.innerHTML=`
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
        <div>
          <div style="font-weight:1000;font-size:16px;">🚀 Crash (Lucky Jet)</div>
          <div class="small" style="margin-top:4px;">Автораунды · Войти в раунд до старта · Забрать в полёте</div>
        </div>
        <div class="badge">Баланс: <b>🪙 ${wallet.coins}</b></div>
      </div>

      <div class="hr"></div>

      <div class="row" style="justify-content:space-between;">
        <div class="kpi">
          <div class="small">Множитель</div>
          <div id="multText" style="font-size:22px;font-weight:1000;">x1.00</div>
          <div id="phaseText" class="small" style="margin-top:4px;">Ожидание…</div>
        </div>

        <div class="kpi">
          <div class="small">Твой статус</div>
          <div id="myBetText" style="font-size:18px;font-weight:1000;">—</div>
          <div id="myStateText" class="small" style="margin-top:4px;">не в раунде</div>
        </div>
      </div>

      <div class="hr"></div>

      <div class="crashWrap" id="crashBox">
        <canvas class="crashCanvas" id="crashCanvas"></canvas>
        <div class="rocket" id="rocket"></div>
        <div class="overlay" id="overlay" style="display:none;">…</div>
      </div>

      <div class="hr"></div>

      <div style="font-weight:900;">Ставка</div>
      <div class="row" style="margin-top:10px;">
        <button class="chip" data-bet="10">10</button>
        <button class="chip" data-bet="50">50</button>
        <button class="chip" data-bet="100">100</button>
        <button class="chip" data-bet="250">250</button>
        <button class="chip" data-bet="500">500</button>
        <button class="chip" data-bet="max">MAX</button>
        <button class="chip" id="bonus">+1000</button>
      </div>

      <div class="row" style="margin-top:10px;">
        <button class="btn small" id="betMinus">-</button>
        <input id="betInput" class="input" type="number" min="1" step="1" value="50" style="flex:1;">
        <button class="btn small" id="betPlus">+</button>
      </div>

      <div class="row" style="margin-top:12px;">
        <button class="btn" id="joinBtn" style="flex:1;">Войти в раунд</button>
        <button class="btn danger" id="cashBtn" style="flex:1;" disabled>Забрать</button>
      </div>

      <div class="small" style="margin-top:10px;">
        Краш-поинт скрыт (честный RNG). Монеты виртуальные.
      </div>
    </div>
  `;

  const crashBox = document.getElementById("crashBox");
  const canvas = document.getElementById("crashCanvas");
  const ctx = canvas.getContext("2d");
  const rocketEl = document.getElementById("rocket");
  const overlayEl = document.getElementById("overlay");

  const multText = document.getElementById("multText");
  const phaseText = document.getElementById("phaseText");
  const myBetText = document.getElementById("myBetText");
  const myStateText = document.getElementById("myStateText");

  const betInput = document.getElementById("betInput");
  const joinBtn = document.getElementById("joinBtn");
  const cashBtn = document.getElementById("cashBtn");

  document.getElementById("bonus").onclick = () => addCoins(1000);

  function clampBet(){
    let v = Math.floor(Number(betInput.value)||0);
    if (v<1) v=1;
    if (v>wallet.coins) v=wallet.coins;
    betInput.value = String(v);
    return v;
  }
  clampBet();

  document.querySelectorAll(".chip[data-bet]").forEach(b=>{
    b.onclick = ()=>{
      const val=b.dataset.bet;
      betInput.value = (val==="max") ? String(wallet.coins) : String(val);
      clampBet();
    };
  });
  document.getElementById("betMinus").onclick=()=>{ betInput.value=String((Number(betInput.value)||1)-10); clampBet(); };
  document.getElementById("betPlus").onclick=()=>{ betInput.value=String((Number(betInput.value)||1)+10); clampBet(); };
  betInput.oninput = clampBet;

  // --- canvas fit ---
  function resizeCanvas(){
    const r = crashBox.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(r.width * dpr);
    canvas.height = Math.floor(r.height * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  resizeCanvas();
  const onResize = ()=>{ resizeCanvas(); draw(); };
  window.addEventListener("resize", onResize);

  // --- crash engine ---
  const PHASE = { BET:"BET", RUN:"RUN", CRASH:"CRASH" };
  let phase = PHASE.BET;
  let countdown = 4.0;

  let crashPoint = 0;
  let startAt = 0;
  let mult = 1.0;

  let inRound = false;
  let myBet = 0;
  let cashed = false;
  let cashedMult = 0;

  function genCrashPoint(){
    const r = randFloat();
    const cp = 1 / (1 - r);
    return Math.min(Math.max(1.05, cp), 60);
  }
  function calcMult(t){
    // плавный рост
    return 1 + t*0.80 + t*t*0.12;
  }

  function showOverlay(t){ overlayEl.textContent=t; overlayEl.style.display="block"; }
  function hideOverlay(){ overlayEl.style.display="none"; }

  function setRocketVisible(v){
    rocketEl.style.opacity = v ? "1" : "0";
  }
  function moveRocket(px, py, rotDeg){
    rocketEl.style.transform = `translate(${px}px, ${py}px) rotate(${rotDeg}deg)`;
  }

  function curveXY(p, w, h){
    const x0 = 60, y0 = h - 140;
    const x1 = w - 90, y1 = 95;
    const t = Math.min(1, Math.max(0, p));
    const e = 1 - Math.pow(1 - t, 2.2);
    const x = x0 + (x1-x0)*e;
    const y = y0 - (y0-y1)*Math.pow(e, 1.65);

    const dt = 0.002;
    const t2 = Math.min(1, t+dt);
    const e2 = 1 - Math.pow(1 - t2, 2.2);
    const x2 = x0 + (x1-x0)*e2;
    const y2 = y0 - (y0-y1)*Math.pow(e2, 1.65);
    const ang = Math.atan2(y2-y, x2-x) * 180/Math.PI;

    return {x,y,ang};
  }

  function resetRound(){
    phase = PHASE.BET;
    countdown = 4.0;
    crashPoint = genCrashPoint();
    mult = 1.0;

    inRound = false;
    myBet = 0;
    cashed = false;
    cashedMult = 0;

    joinBtn.disabled = false;
    cashBtn.disabled = true;
    betInput.disabled = false;

    setRocketVisible(false);
    moveRocket(-9999,-9999,0);
    hideOverlay();

    renderHUD();
    draw();
  }

  function startRun(){
    phase = PHASE.RUN;
    startAt = performance.now();
    mult = 1.0;
    cashBtn.disabled = !(inRound && !cashed);
    betInput.disabled = true;
    joinBtn.disabled = true;

    // “тихий старт”
    beep(520, 0.05, 0.015);

    renderHUD();
  }

  function doCrash(){
    phase = PHASE.CRASH;
    mult = crashPoint;

    setRocketVisible(false);

    if (inRound && !cashed){
      showOverlay("💥 Краш! Не успел — ставка сгорела");
      beep(180, 0.12, 0.03, "square");
    } else if (cashed){
      showOverlay(`✅ Забрал на x${cashedMult.toFixed(2)}`);
      beep(980, 0.06, 0.03);
    } else {
      showOverlay("💥 Краш! Новый раунд скоро…");
      beep(220, 0.10, 0.02, "square");
    }

    // следующий раунд
    countdown = 3.0;
    renderHUD();
  }

  joinBtn.onclick = ()=>{
    if (phase !== PHASE.BET) return;
    if (inRound) return;

    const bet = clampBet();
    if (bet<=0) return;
    if (bet>wallet.coins) return alert("Недостаточно монет");

    addCoins(-bet);
    inRound = true;
    myBet = bet;
    cashed = false;
    cashedMult = 0;

    showOverlay(`✅ Вошёл в раунд: ${bet} 🪙`);
    setTimeout(()=>{ if (phase===PHASE.BET) hideOverlay(); }, 900);

    renderHUD();
  };

  cashBtn.onclick = ()=>{
    if (phase !== PHASE.RUN) return;
    if (!inRound || cashed) return;

    cashed = true;
    cashedMult = mult;
    const payout = Math.floor(myBet * cashedMult);
    addCoins(payout);

    showOverlay(`✅ Забрал: +${payout} 🪙 (x${cashedMult.toFixed(2)})`);
    setTimeout(()=>{ if (phase===PHASE.RUN) hideOverlay(); }, 900);

    cashBtn.disabled = true;
    renderHUD();
    beep(980, 0.06, 0.03);
  };

  function renderHUD(){
    multText.textContent = `x${mult.toFixed(2)}`;

    if (phase === PHASE.BET){
      phaseText.textContent = `Ожидание — старт через ${Math.ceil(countdown)}с`;
    } else if (phase === PHASE.RUN){
      phaseText.textContent = `Полёт — можно забрать`;
    } else {
      phaseText.textContent = `Краш — новый раунд через ${Math.ceil(countdown)}с`;
    }

    if (!inRound){
      myBetText.textContent = "—";
      myStateText.textContent = "не в раунде";
    } else {
      myBetText.textContent = `${myBet} 🪙`;
      if (cashed) myStateText.textContent = `забрал x${cashedMult.toFixed(2)}`;
      else if (phase === PHASE.RUN) myStateText.textContent = "в раунде";
      else if (phase === PHASE.BET) myStateText.textContent = "ждём старт";
      else myStateText.textContent = "не успел";
    }

    // кнопки
    joinBtn.disabled = !(phase === PHASE.BET && !inRound);
    cashBtn.disabled = !(phase === PHASE.RUN && inRound && !cashed);
  }

  function draw(){
    const r = crashBox.getBoundingClientRect();
    const w = r.width;
    const h = r.height;

    ctx.clearRect(0,0,w,h);

    // сетка
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    const step = 52;
    for (let x=0;x<w;x+=step){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    for (let y=0;y<h;y+=step){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
    ctx.restore();

    // прогресс по кривой
    let p = 0;
    if (phase !== PHASE.BET){
      const cp = Math.max(1.05, crashPoint);
      p = Math.min(1, Math.log(mult)/Math.log(cp));
      if (!Number.isFinite(p)) p = 0;
      p = Math.max(0, Math.min(1, p));
    }

    const start = curveXY(0, w, h);
    const cur = curveXY(Math.max(0.02, p), w, h);

    // кривая
    ctx.save();
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);

    const samples = 180;
    const steps = Math.max(2, Math.floor(samples*Math.max(0.02,p)));
    for (let i=1;i<=steps;i++){
      const t = i/samples;
      if (t>p) break;
      const pt = curveXY(t,w,h);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
    ctx.restore();

    // ракета
    if (phase === PHASE.RUN){
      setRocketVisible(true);
      const rx = cur.x - 27;
      const ry = cur.y - 27;
      moveRocket(rx, ry, cur.ang + 12);
    } else {
      setRocketVisible(false);
      moveRocket(-9999,-9999,0);
    }

    // большой текст
    ctx.save();
    const big = phase===PHASE.BET ? "Ожидание" : `x${mult.toFixed(2)}`;
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 72px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText(big, w*0.5, h*0.48);
    ctx.restore();
  }

  // loop
  let raf = null;
  let last = performance.now();
  function loop(ts){
    const dt = (ts - last)/1000;
    last = ts;

    if (phase === PHASE.BET){
      countdown -= dt;
      if (countdown <= 0){
        startRun();
      }
    } else if (phase === PHASE.RUN){
      const t = (ts - startAt)/1000;
      mult = calcMult(t);
      if (mult >= crashPoint){
        doCrash();
      }
    } else {
      countdown -= dt;
      if (countdown <= 0){
        resetRound();
      }
    }

    renderHUD();
    draw();
    raf = requestAnimationFrame(loop);
  }

  raf = requestAnimationFrame(loop);

  // cleanup
  setCleanup(()=>{
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
  });

  resetRound();
}

// =====================================================
// WHEEL (фиксированное колесо, выбор фракции снизу, ставка)
// =====================================================
function renderWheel(){
  // 8 секторов фикс
  const sectors = [
    {key:"blue",  name:"Blue",  mult:2.0, color:"rgba(76,125,255,.85)"},
    {key:"gray",  name:"Gray",  mult:1.5, color:"rgba(200,210,230,.70)"},
    {key:"green", name:"Green", mult:3.0, color:"rgba(51,209,122,.85)"},
    {key:"gray",  name:"Gray",  mult:1.5, color:"rgba(200,210,230,.70)"},
    {key:"red",   name:"Red",   mult:5.0, color:"rgba(255,90,90,.85)"},
    {key:"gray",  name:"Gray",  mult:1.5, color:"rgba(200,210,230,.70)"},
    {key:"blue",  name:"Blue",  mult:2.0, color:"rgba(76,125,255,.85)"},
    {key:"green", name:"Green", mult:3.0, color:"rgba(51,209,122,.85)"},
  ];

  let pickKey = "blue";
  let spinning = false;
  let wheelRot = 0;

  screenEl.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div>
          <div style="font-weight:1000;font-size:16px;">🎡 Wheel</div>
          <div class="small" style="margin-top:4px;">Выбери фракцию → крути → выигрыш только при попадании.</div>
        </div>
        <div class="badge">Баланс: <b>🪙 ${wallet.coins}</b></div>
      </div>

      <div class="hr"></div>

      <div class="wheelWrap">
        <div class="wheelBox">
          <div class="wheelPin"></div>
          <div class="wheel" id="wheel"></div>
        </div>

        <div style="flex:1;min-width:220px;">
          <div class="row">
            <div class="kpi" style="min-width:220px;">
              <div class="small">Твой выбор</div>
              <div id="pickLbl" style="font-weight:1000;font-size:18px;">Blue</div>
            </div>
            <div class="kpi" style="min-width:220px;">
              <div class="small">Результат</div>
              <div id="resLbl" style="font-weight:1000;font-size:18px;">—</div>
            </div>
          </div>

          <div class="hr"></div>

          <div style="font-weight:900;">Ставка</div>
          <div class="row" style="margin-top:10px;">
            <input id="bet" class="input" type="number" min="1" step="1" value="50" style="max-width:220px;">
            <button class="btn ghost" id="bonus">+1000 🪙</button>
          </div>

          <div class="hr"></div>

          <div style="font-weight:900;">Фракция</div>
          <div class="row" style="margin-top:8px;">
            <button class="chip active" data-pick="blue">Blue x2</button>
            <button class="chip" data-pick="green">Green x3</button>
            <button class="chip" data-pick="red">Red x5</button>
            <button class="chip" data-pick="gray">Gray x1.5</button>
          </div>

          <div class="row" style="margin-top:12px;">
            <button class="btn" id="spin" style="flex:1;">Крутить</button>
          </div>

          <div class="small" style="margin-top:10px;">Честно: сектор выбирается RNG, анимация только визуал.</div>
        </div>
      </div>
    </div>
  `;

  const wheelEl = document.getElementById("wheel");
  const pickLbl = document.getElementById("pickLbl");
  const resLbl = document.getElementById("resLbl");
  const betInput = document.getElementById("bet");
  const spinBtn = document.getElementById("spin");

  document.getElementById("bonus").onclick = () => addCoins(1000);

  function clampBet(){
    let v = Math.floor(Number(betInput.value)||0);
    if (v<1) v=1;
    if (v>wallet.coins) v=wallet.coins;
    betInput.value=String(v);
  }
  clampBet();
  betInput.oninput = clampBet;

  // draw wheel sectors using conic-gradient
  function buildGradient(){
    const n = sectors.length;
    const step = 360/n;
    const parts=[];
    for (let i=0;i<n;i++){
      const a0 = i*step;
      const a1 = (i+1)*step;
      parts.push(`${sectors[i].color} ${a0}deg ${a1}deg`);
    }
    return `conic-gradient(from -90deg, ${parts.join(",")})`;
  }
  wheelEl.style.background = buildGradient();

  function setPick(k){
    pickKey = k;
    pickLbl.textContent = k[0].toUpperCase()+k.slice(1);
    document.querySelectorAll(".chip[data-pick]").forEach(x=>x.classList.remove("active"));
    document.querySelector(`.chip[data-pick="${k}"]`)?.classList.add("active");
    beep(560,0.03,0.02);
  }
  document.querySelectorAll(".chip[data-pick]").forEach(b=>{
    b.onclick = ()=>{ if (!spinning) setPick(b.dataset.pick); };
  });

  let raf=null;
  function animateTo(targetDeg, durMs){
    return new Promise((resolve)=>{
      const start = performance.now();
      const startRot = wheelRot;
      const delta = targetDeg - startRot;

      function easeOutCubic(t){ return 1 - Math.pow(1-t,3); }

      function step(ts){
        const t = Math.min(1, (ts-start)/durMs);
        const e = easeOutCubic(t);
        wheelRot = startRot + delta*e;
        wheelEl.style.transform = `rotate(${wheelRot}deg)`;
        if (t<1) raf = requestAnimationFrame(step);
        else resolve();
      }
      raf = requestAnimationFrame(step);
    });
  }

  spinBtn.onclick = async ()=>{
    if (spinning) return;
    const bet = Math.floor(Number(betInput.value)||0);
    if (bet<=0) return alert("Ставка должна быть больше 0");
    if (bet>wallet.coins) return alert("Недостаточно монет");

    addCoins(-bet);
    spinning=true;
    spinBtn.disabled=true;
    resLbl.textContent="крутится…";
    beep(740,0.05,0.02);

    // rng result
    const n=sectors.length;
    const resultIndex = randInt(0,n-1);

    // target: lots of spins + land with pin at top
    const stepDeg = 360/n;
    const sectorCenter = resultIndex*stepDeg + stepDeg/2; // degrees from -90 start
    // We want pin at 0deg (top) with conic from -90, wheel rotated by rot -> map
    // Approx: target rotation so sectorCenter aligns with 0: rot = 90 - sectorCenter (plus spins)
    const base = (90 - sectorCenter);
    const extraSpins = 360*(6 + randInt(0,3));
    const target = wheelRot + extraSpins + base - (wheelRot % 360);

    await animateTo(target, 2400);

    const res = sectors[resultIndex];
    resLbl.textContent = `${res.name} (x${res.mult})`;

    if (res.key === pickKey){
      const win = Math.floor(bet * res.mult);
      addCoins(win);
      resLbl.textContent += ` ✅ +${win} 🪙`;
      beep(980,0.07,0.03);
    } else {
      resLbl.textContent += ` ❌`;
      beep(220,0.10,0.03,"square");
    }

    spinning=false;
    spinBtn.disabled=false;
  };

  setCleanup(()=>{
    if (raf) cancelAnimationFrame(raf);
  });

  setPick("blue");
}

// =====================================================
// RPS (лестница множителей, ставка 1 раз на серию, cashout)
// =====================================================
function renderRPS(){
  const ladder = [1.00,1.20,1.50,1.90,2.50,3.30,4.50,6.20,8.00,10.00];
  let state=null; // {bet, step, active, msg, your, bot, res}

  function setup(){
    screenEl.innerHTML=`
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <div style="font-weight:1000;font-size:16px;">✊ RPS</div>
            <div class="small" style="margin-top:4px;">Серия побед. Ставка списывается 1 раз. Можно “Забрать”.</div>
          </div>
          <div class="badge">Баланс: <b>🪙 ${wallet.coins}</b></div>
        </div>

        <div class="hr"></div>

        <div style="font-weight:900;">Ставка</div>
        <div class="row" style="margin-top:10px;">
          <input id="bet" class="input" type="number" min="1" step="1" value="50" style="max-width:220px;">
          <button class="btn ghost" id="bonus">+1000 🪙</button>
          <button class="btn" id="start">Старт серии</button>
        </div>

        <div class="hr"></div>

        <div class="small">
          Лестница:
          ${ladder.map((m,i)=>`<span class="badge">${i+1}: x${m.toFixed(2)}</span>`).join(" ")}
        </div>
      </div>
    `;

    const betInput=document.getElementById("bet");
    function clampBet(){
      let v=Math.floor(Number(betInput.value)||0);
      if (v<1) v=1;
      if (v>wallet.coins) v=wallet.coins;
      betInput.value=String(v);
    }
    clampBet();
    betInput.oninput=clampBet;

    document.getElementById("bonus").onclick=()=>addCoins(1000);
    document.getElementById("start").onclick=()=>{
      const bet=Math.floor(Number(betInput.value)||0);
      if (bet<=0) return alert("Ставка должна быть больше 0");
      if (bet>wallet.coins) return alert("Недостаточно монет");
      addCoins(-bet);
      state={bet, step:0, active:true, msg:"Серия началась!", your:"—", bot:"—", res:"—"};
      draw();
      beep(740,0.04,0.02);
    };
  }

  function botPick(){ return ["rock","paper","scissors"][randInt(0,2)]; }
  function outcome(a,b){
    if (a===b) return "draw";
    if (a==="rock" && b==="scissors") return "win";
    if (a==="paper" && b==="rock") return "win";
    if (a==="scissors" && b==="paper") return "win";
    return "lose";
  }
  function icon(x){ return x==="rock"?"✊":x==="paper"?"✋":x==="scissors"?"✌️":"—"; }

  function cashOut(){
    if (!state || !state.active) return;
    const mult = ladder[state.step] ?? ladder[0];
    const payout = Math.floor(state.bet * mult);
    addCoins(payout);
    state.active=false;
    state.msg=`✅ Забрал: +${payout} 🪙 (x${mult.toFixed(2)})`;
    draw();
    beep(980,0.06,0.03);
  }

  function play(choice){
    if (!state || !state.active) return;
    const b = botPick();
    const out = outcome(choice,b);

    state.your = choice;
    state.bot = b;

    if (out==="draw"){
      state.res="Ничья";
      state.msg="Ничья — шаг не меняется, ходи снова.";
      draw();
      beep(520,0.03,0.015);
      return;
    }
    if (out==="lose"){
      state.active=false;
      state.res="Проигрыш";
      state.msg=`❌ Проиграл. Ставка ${state.bet} 🪙 сгорела.`;
      draw();
      beep(220,0.10,0.03,"square");
      return;
    }

    state.step += 1;
    const maxStep = ladder.length - 1;
    if (state.step >= maxStep){
      state.step = maxStep;
      state.res="Победа (макс)";
      state.msg="🏁 Дошёл до максимума — авто-cashout.";
      cashOut();
      return;
    }
    state.res="Победа";
    state.msg=`✅ Победа! Теперь множитель x${ladder[state.step].toFixed(2)}.`;
    draw();
    beep(740,0.04,0.02);
  }

  function draw(){
    if (!state) return setup();

    const mult = ladder[state.step] ?? ladder[0];
    const potential = Math.floor(state.bet * mult);

    screenEl.innerHTML=`
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
          <div>
            <div style="font-weight:1000;font-size:16px;">✊ RPS</div>
            <div class="small" style="margin-top:4px;">Ставка: <b>${state.bet} 🪙</b> · Шаг: <b>${state.step+1}/${ladder.length}</b></div>
          </div>

          <div class="kpi" style="text-align:right;">
            <div class="small">Текущий</div>
            <div style="font-size:22px;font-weight:1000;">x${mult.toFixed(2)}</div>
            <div class="small" style="margin-top:4px;">Забрать: <b>${potential} 🪙</b></div>
          </div>
        </div>

        <div class="hr"></div>

        <div class="row">
          <div class="badge">Ты: <b>${icon(state.your)}</b></div>
          <div class="badge">Бот: <b>${icon(state.bot)}</b></div>
          <div class="badge">Итог: <b>${state.res}</b></div>
        </div>

        <div class="msg" style="margin-top:10px;">${state.msg}</div>

        <div class="hr"></div>

        <div class="row">
          <button class="btn ghost" id="r" ${!state.active?"disabled":""}>✊</button>
          <button class="btn ghost" id="p" ${!state.active?"disabled":""}>✋</button>
          <button class="btn ghost" id="s" ${!state.active?"disabled":""}>✌️</button>
          <button class="btn" id="cash" ${!state.active?"disabled":""} style="margin-left:auto;">Забрать</button>
        </div>

        <div class="row" style="margin-top:12px;">
          <button class="btn ghost" id="new">Новая серия</button>
          <button class="btn ghost" id="bonus">+1000 🪙</button>
        </div>
      </div>
    `;

    document.getElementById("r").onclick=()=>play("rock");
    document.getElementById("p").onclick=()=>play("paper");
    document.getElementById("s").onclick=()=>play("scissors");
    document.getElementById("cash").onclick=cashOut;
    document.getElementById("new").onclick=()=>{ state=null; setup(); };
    document.getElementById("bonus").onclick=()=>addCoins(1000);
  }

  draw();
}

// =====================================================
// PENALTY (3x5=15 зон, сложность, лестница X, бесконечно до сейва/кэшаута)
// =====================================================
function renderPenalty(){
  const diffs = {
    easy:   { name:"Easy",   ladder:[1.00,1.15,1.32,1.52,1.75,2.05,2.45,2.95,3.60,4.40] },
    normal: { name:"Normal", ladder:[1.00,1.25,1.55,1.90,2.35,2.95,3.75,4.85,6.40,8.60] },
    hard:   { name:"Hard",   ladder:[1.00,1.35,1.75,2.30,3.10,4.30,6.10,8.80,12.80,18.50] },
    expert: { name:"Expert", ladder:[1.00,1.55,2.10,2.95,4.30,6.60,10.50,17.50,30.00,55.00] },
  };

  let state = null;
  let diffKey = "normal";
  let selectedZone = null;

  function setup(){
    const d = diffs[diffKey];
    screenEl.innerHTML=`
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <div style="font-weight:1000;font-size:16px;">🥅 Penalty</div>
            <div class="small" style="margin-top:4px;">15 зон (3x5). Вратарь закрывает 2 зоны. До сейва или кэшаута.</div>
          </div>
          <div class="badge">Баланс: <b>🪙 ${wallet.coins}</b></div>
        </div>

        <div class="hr"></div>

        <div class="row">
          <div style="font-weight:900;">Сложность</div>
          <button class="chip ${diffKey==="easy"?"active":""}" data-d="easy">easy</button>
          <button class="chip ${diffKey==="normal"?"active":""}" data-d="normal">normal</button>
          <button class="chip ${diffKey==="hard"?"active":""}" data-d="hard">hard</button>
          <button class="chip ${diffKey==="expert"?"active":""}" data-d="expert">expert</button>
        </div>

        <div class="hr"></div>

        <div style="font-weight:900;">Ставка</div>
        <div class="row" style="margin-top:10px;">
          <input id="bet" class="input" type="number" min="1" step="1" value="50" style="max-width:220px;">
          <button class="btn ghost" id="bonus">+1000 🪙</button>
          <button class="btn" id="start">Старт</button>
        </div>

        <div class="hr"></div>

        <div class="small">
          Лестница X (${d.name}):
          ${d.ladder.map((m,i)=>`<span class="badge">${i+1}: x${m.toFixed(2)}</span>`).join(" ")}
        </div>
      </div>
    `;

    document.querySelectorAll(".chip[data-d]").forEach(b=>{
      b.onclick=()=>{
        diffKey=b.dataset.d;
        beep(560,0.03,0.02);
        setup();
      };
    });

    const betInput=document.getElementById("bet");
    function clampBet(){
      let v=Math.floor(Number(betInput.value)||0);
      if (v<1) v=1;
      if (v>wallet.coins) v=wallet.coins;
      betInput.value=String(v);
    }
    clampBet();
    betInput.oninput=clampBet;

    document.getElementById("bonus").onclick=()=>addCoins(1000);
    document.getElementById("start").onclick=()=>{
      const bet=Math.floor(Number(betInput.value)||0);
      if (bet<=0) return alert("Ставка должна быть больше 0");
      if (bet>wallet.coins) return alert("Недостаточно монет");
      addCoins(-bet);

      state = {
        bet,
        diffKey,
        goals: 0,
        over:false,
        cashed:false,
        msg:"Выбери зону удара",
        keeper: null, // {a,b} covered zones indices
      };
      selectedZone=null;
      draw();
      beep(740,0.04,0.02);
    };
  }

  function pickKeeper(){
    // covers 2 zones: one random + adjacent (same row if possible else +/-5)
    const a = randInt(0,14);
    const neighbors=[];
    // row/col
    const r = Math.floor(a/5);
    const c = a%5;
    if (c>0) neighbors.push(a-1);
    if (c<4) neighbors.push(a+1);
    if (r>0) neighbors.push(a-5);
    if (r<2) neighbors.push(a+5);
    const b = neighbors.length ? neighbors[randInt(0,neighbors.length-1)] : ((a+1)%15);
    return {a,b};
  }

  function currentMult(){
    const ladder = diffs[state.diffKey].ladder;
    const idx = Math.min(state.goals, ladder.length-1);
    return ladder[idx];
  }

  function cashout(){
    if (!state || state.over || state.cashed) return;
    const mult = currentMult();
    const payout = Math.floor(state.bet * mult);
    addCoins(payout);
    state.cashed=true;
    state.over=true;
    state.msg = `✅ Кэшаут: +${payout} 🪙 (x${mult.toFixed(2)})`;
    draw();
    beep(980,0.06,0.03);
  }

  function shoot(){
    if (!state || state.over) return;
    if (selectedZone === null) return;

    state.keeper = pickKeeper();

    const saved = (selectedZone === state.keeper.a || selectedZone === state.keeper.b);

    if (saved){
      state.over=true;
      state.msg = `🧤 Сейв! Ты проиграл.`;
      beep(220,0.10,0.03,"square");
      draw(true);
      return;
    }

    state.goals += 1;
    const mult = currentMult();
    const potential = Math.floor(state.bet * mult);
    state.msg = `⚽ Гол! Серия: ${state.goals}. Текущий x${mult.toFixed(2)} · Кэшаут: ${potential} 🪙`;
    beep(740,0.04,0.02);
    draw(true);
  }

  function draw(revealKeeper=false){
    if (!state) return setup();

    const mult = currentMult();
    const potential = Math.floor(state.bet * mult);

    // grid 3x5
    const cells=[];
    for (let i=0;i<15;i++){
      let cls="cell";
      let label=" ";
      const isSel = (i===selectedZone);
      if (isSel) label="🎯";

      if (revealKeeper && state.keeper){
        if (i===state.keeper.a || i===state.keeper.b){
          cls += " mine";
          label = "🧤";
        }
      }
      cells.push(`<button class="${cls}" data-i="${i}" ${state.over?"disabled":""}><span class="in">${label}</span></button>`);
    }

    screenEl.innerHTML=`
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
          <div>
            <div style="font-weight:1000;font-size:16px;">🥅 Penalty</div>
            <div class="small" style="margin-top:4px;">Сложность: <b>${diffs[state.diffKey].name}</b> · Ставка: <b>${state.bet} 🪙</b></div>
          </div>
          <div class="kpi" style="text-align:right;">
            <div class="small">Серия</div>
            <div style="font-size:22px;font-weight:1000;">${state.goals}</div>
            <div class="small" style="margin-top:4px;">x${mult.toFixed(2)} · ${potential} 🪙</div>
          </div>
        </div>

        <div class="msg" style="margin-top:10px;">${state.msg}</div>

        <div class="hr"></div>

        <div class="small" style="margin-bottom:8px;">Выбери зону (3x5):</div>
        <div class="grid5" style="grid-template-columns:repeat(5,1fr)">${cells.join("")}</div>

        <div class="row" style="margin-top:12px;">
          <button class="btn" id="shoot" ${state.over?"disabled":""} style="flex:1;">Удар</button>
          <button class="btn ghost" id="cash" ${(!state.goals || state.over)?"disabled":""} style="flex:1;">Кэшаут</button>
        </div>

        <div class="row" style="margin-top:12px;">
          <button class="btn ghost" id="new">Новая</button>
          <button class="btn ghost" id="bonus">+1000 🪙</button>
        </div>
      </div>
    `;

    screenEl.querySelectorAll("button[data-i]").forEach(b=>{
      b.onclick=()=>{
        if (state.over) return;
        selectedZone = Number(b.dataset.i);
        beep(560,0.03,0.02);
        draw(revealKeeper && state.keeper); // перерисуем выбор
      };
    });

    document.getElementById("shoot").onclick=shoot;
    document.getElementById("cash").onclick=cashout;
    document.getElementById("new").onclick=()=>{ state=null; setup(); };
    document.getElementById("bonus").onclick=()=>addCoins(1000);
  }

  draw();
}

// =====================================================
// DRAGON TOWER (2 режима, ставка 1 раз, выбор плиток по рядам, cashout после победы ряда)
// =====================================================
function renderTower(){
  const ROWS = 8;
  const ladders = {
    normal: [1.00,1.12,1.28,1.48,1.73,2.04,2.42,2.90,3.55],
    hard:   [1.00,1.35,1.85,2.55,3.55,5.00,7.10,10.00,14.00],
  };
  let state=null;
  let mode="normal";

  function genRow(mode){
    // 4 tiles: normal = 1 skull; hard = 3 skull
    const skulls = mode==="hard" ? 3 : 1;
    const arr=["egg","egg","egg","egg"];
    let s=0;
    while(s<skulls){
      const i=randInt(0,3);
      if(arr[i]!=="skull"){ arr[i]="skull"; s++; }
    }
    return arr;
  }

  function setup(){
    screenEl.innerHTML=`
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <div style="font-weight:1000;font-size:16px;">🐉 Dragon Tower</div>
            <div class="small" style="margin-top:4px;">Обычный: 3🥚/1💀 · Сложный: 1🥚/3💀 · Кэшаут после каждого ряда</div>
          </div>
          <div class="badge">Баланс: <b>🪙 ${wallet.coins}</b></div>
        </div>

        <div class="hr"></div>

        <div class="row">
          <button class="chip ${mode==="normal"?"active":""}" id="mN">Обычный</button>
          <button class="chip ${mode==="hard"?"active":""}" id="mH">Сложный</button>
        </div>

        <div class="hr"></div>

        <div style="font-weight:900;">Ставка</div>
        <div class="row" style="margin-top:10px;">
          <input id="bet" class="input" type="number" min="1" step="1" value="50" style="max-width:220px;">
          <button class="btn ghost" id="bonus">+1000 🪙</button>
          <button class="btn" id="start">Старт</button>
        </div>

        <div class="hr"></div>

        <div class="small">
          Лестница X:
          ${(ladders[mode]||[]).map((m,i)=>`<span class="badge">${i}: x${m.toFixed(2)}</span>`).join(" ")}
        </div>
      </div>
    `;

    const betInput=document.getElementById("bet");
    function clampBet(){
      let v=Math.floor(Number(betInput.value)||0);
      if (v<1) v=1;
      if (v>wallet.coins) v=wallet.coins;
      betInput.value=String(v);
    }
    clampBet();
    betInput.oninput=clampBet;

    document.getElementById("mN").onclick=()=>{ mode="normal"; beep(560,0.03,0.02); setup(); };
    document.getElementById("mH").onclick=()=>{ mode="hard"; beep(560,0.03,0.02); setup(); };

    document.getElementById("bonus").onclick=()=>addCoins(1000);
    document.getElementById("start").onclick=()=>{
      const bet=Math.floor(Number(betInput.value)||0);
      if (bet<=0) return alert("Ставка должна быть больше 0");
      if (bet>wallet.coins) return alert("Недостаточно монет");

      addCoins(-bet);
      state={
        mode,
        bet,
        row:0,
        over:false,
        cashed:false,
        msg:"Выбери плитку в первом ряду",
        revealed: new Map(), // row -> {pickedIndex,rowArr}
      };
      draw();
      beep(740,0.04,0.02);
    };
  }

  function curMult(){
    const ladder = ladders[state.mode];
    const idx = Math.min(state.row, ladder.length-1);
    return ladder[idx] ?? 1;
  }

  function cashout(){
    if (!state || state.over || state.cashed) return;
    const m = curMult();
    const payout = Math.floor(state.bet * m);
    addCoins(payout);
    state.cashed=true;
    state.over=true;
    state.msg=`✅ Кэшаут: +${payout} 🪙 (x${m.toFixed(2)})`;
    draw(true);
    beep(980,0.06,0.03);
  }

  function pickTile(i){
    if (!state || state.over) return;

    const row = state.row;
    const rowArr = genRow(state.mode);
    state.revealed.set(row, { pickedIndex: i, rowArr });

    const res = rowArr[i];
    if (res==="skull"){
      state.over=true;
      state.msg=`💀 Череп! Ставка ${state.bet} 🪙 сгорела`;
      draw(true);
      beep(220,0.10,0.03,"square");
      return;
    }

    state.row += 1;
    if (state.row >= ROWS){
      state.row = ROWS;
      state.msg="🏁 Дошёл до верха — авто-кэшаут!";
      draw(true);
      cashout();
      return;
    }

    state.msg=`🥚 Яйцо! Ряд пройден. Теперь можно кэшаут или идти дальше.`;
    draw(true);
    beep(740,0.04,0.02);
  }

  function draw(reveal=false){
    if (!state) return setup();

    const m = curMult();
    const potential = Math.floor(state.bet * m);

    const rowsHtml=[];
    for (let r=ROWS-1;r>=0;r--){
      const isActive = (r===state.row) && !state.over && !state.revealed.has(r);
      const rev = state.revealed.get(r);

      const tiles=[0,1,2,3].map(i=>{
        const disabled = !isActive || state.over;
        if (!rev){
          // not revealed row
          return `
            <button class="cell ${isActive?"safe":""}" data-i="${i}" ${disabled?"disabled":""}>
              <div class="in"> </div>
            </button>`;
        }

        const kind = rev.rowArr[i];
        const txt = kind==="egg" ? "🥚" : "💀";
        const cls = kind==="egg" ? "safe" : "mine";
        return `
          <button class="cell ${cls}" disabled>
            <div class="in">${txt}</div>
          </button>`;
      }).join("");

      rowsHtml.push(`
        <div style="margin-top:10px;">
          <div class="small" style="margin-bottom:6px;">Ряд ${r+1} ${isActive?"· выбери 1 плитку":""}</div>
          <div class="grid5" style="grid-template-columns:repeat(4,1fr)">${tiles}</div>
        </div>
      `);
    }

    // "шкала X с прокруткой без ползунка"
    const ladder = ladders[state.mode];
    const scale = ladder.map((x,i)=> {
      const active = (i===state.row) && !state.over;
      return `<div class="badge" style="${active?"outline:2px solid rgba(76,125,255,.85);":""}">x${x.toFixed(2)}</div>`;
    }).join(" ");

    screenEl.innerHTML=`
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
          <div>
            <div style="font-weight:1000;font-size:16px;">🐉 Dragon Tower</div>
            <div class="small" style="margin-top:4px;">
              Режим: <b>${state.mode==="hard"?"Сложный":"Обычный"}</b> · Ставка: <b>${state.bet} 🪙</b>
            </div>
          </div>

          <div class="kpi" style="text-align:right;">
            <div class="small">Текущий</div>
            <div style="font-size:22px;font-weight:1000;">x${m.toFixed(2)}</div>
            <div class="small" style="margin-top:4px;">Кэшаут: <b>${potential} 🪙</b></div>
          </div>
        </div>

        <div class="msg" style="margin-top:10px;">${state.msg}</div>

        <div class="hr"></div>

        <div class="small" style="margin-bottom:8px;">Шкала X (скролл):</div>
        <div style="display:flex;gap:8px;overflow:auto;padding-bottom:6px;">${scale}</div>

        <div class="hr"></div>

        ${rowsHtml.join("")}

        <div class="row" style="margin-top:12px;">
          <button class="btn" id="cash" ${(!state.revealed.has(state.row-1) || state.over)?"disabled":""} style="flex:1;">Кэшаут</button>
          <button class="btn ghost" id="new">Новая игра</button>
          <button class="btn ghost" id="bonus">+1000 🪙</button>
        </div>
      </div>
    `;

    // only active row buttons have data-i
    screenEl.querySelectorAll("button[data-i]").forEach(b=>{
      b.onclick=()=>pickTile(Number(b.dataset.i));
    });

    document.getElementById("cash").onclick=cashout;
    document.getElementById("new").onclick=()=>{ state=null; setup(); };
    document.getElementById("bonus").onclick=()=>addCoins(1000);
  }

  draw();
}

// старт
setScreen("menu");
