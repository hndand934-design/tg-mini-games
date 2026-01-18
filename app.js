// ===============================
// RNG (crypto)
// ===============================
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function randInt(min, max) {
  return Math.floor(randFloat() * (max - min + 1)) + min;
}

// ===============================
// Telegram WebApp
// ===============================
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const screenEl = document.getElementById("screen");
const userEl = document.getElementById("user");
const balancePill = document.getElementById("balancePill");
const user = tg?.initDataUnsafe?.user;

// ===============================
// Wallet (localStorage)
// ===============================
const WALLET_KEY = "mini_wallet_mines_v1";
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

function renderTopBar() {
  userEl.textContent = user
    ? `Привет, ${user.first_name} · открыто в Telegram`
    : `Открыто вне Telegram`;
  balancePill.textContent = `🪙 ${wallet.coins}`;
}
renderTopBar();

// ===============================
// Audio (WebAudio, no files)
// ===============================
let _ctx = null;
function audioCtx() {
  if (_ctx) return _ctx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  _ctx = Ctx ? new Ctx() : null;
  return _ctx;
}
async function unlockAudio() {
  const ctx = audioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch {}
  }
}
function tone({ type="sine", f=440, t=0.08, g=0.06, when=0 }) {
  const ctx = audioCtx(); if (!ctx) return;
  const now = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const gain = ctx.createGain();
  const filt = ctx.createBiquadFilter();

  o.type = type;
  o.frequency.setValueAtTime(f, now);

  filt.type = "lowpass";
  filt.frequency.setValueAtTime(12000, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(g, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + t);

  o.connect(filt);
  filt.connect(gain);
  gain.connect(ctx.destination);

  o.start(now);
  o.stop(now + t + 0.02);
}
function noise({ t=0.10, g=0.02, when=0, hp=900 }) {
  const ctx = audioCtx(); if (!ctx) return;
  const now = ctx.currentTime + when;

  const bufferSize = Math.floor(ctx.sampleRate * t);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(g, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + t);

  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(hp, now);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  src.start(now);
  src.stop(now + t + 0.02);
}

const SFX = {
  click(){ tone({type:"triangle", f:520, t:0.05, g:0.035}); tone({type:"triangle", f:320, t:0.06, g:0.02, when:0.01}); },
  start(){ noise({t:0.10, g:0.02, hp:1100}); tone({type:"sine", f:420, t:0.08, g:0.03, when:0.01}); },
  gem(){ tone({type:"sine", f:880, t:0.06, g:0.05}); tone({type:"sine", f:1180, t:0.08, g:0.04, when:0.03}); },
  mine(){ noise({t:0.16, g:0.035, hp:650}); tone({type:"sawtooth", f:150, t:0.18, g:0.05, when:0.02}); },
  cash(){ tone({type:"sine", f:740, t:0.10, g:0.05}); tone({type:"sine", f:932, t:0.12, g:0.045, when:0.05}); tone({type:"sine", f:1244, t:0.14, g:0.04, when:0.10}); },
  lose(){ tone({type:"sine", f:220, t:0.16, g:0.06}); tone({type:"sine", f:165, t:0.18, g:0.05, when:0.06}); },
};
document.addEventListener("pointerdown", unlockAudio, { once:false });

// ===============================
// Mines logic
// ===============================
const app = { sfx:true };

const minesState = {
  bet: 100,
  minesCount: 3,
  running: false,
  over: false,
  gridSize: 25,
  mines: new Set(),
  opened: new Set(),
  safeOpened: 0,
  mult: 1.00,
  msg: "",
  msgKind: "",
};

function buildMines(minesCount){
  const size = minesState.gridSize;
  const s = new Set();
  while(s.size < minesCount) s.add(randInt(0, size-1));
  return s;
}

// “казиношный” рост множителя, но без дичи
function calcMult(openedSafe, minesCount){
  // base risk
  const risk = 0.085 + minesCount * 0.010;  // растёт с минами
  const curve = 0.010 + minesCount * 0.0015;
  const m = 1 + openedSafe * risk + (openedSafe * (openedSafe-1)) * curve * 0.05;
  return Math.max(1, m);
}

function clampBet(v){
  v = Math.floor(Number(v)||0);
  if(v < 1) v = 1;
  if(v > wallet.coins) v = wallet.coins;
  return v;
}

function setMsg(text, kind=""){
  minesState.msg = text;
  minesState.msgKind = kind;
}

function resetRound(){
  minesState.running = false;
  minesState.over = false;
  minesState.mines = new Set();
  minesState.opened = new Set();
  minesState.safeOpened = 0;
  minesState.mult = 1.00;
  setMsg("Выбери ставку и количество мин, затем Start.");
}

function startRound(){
  minesState.bet = clampBet(minesState.bet);
  if(minesState.bet > wallet.coins){
    setMsg("Недостаточно монет.", "bad");
    return;
  }
  if(minesState.minesCount < 1) minesState.minesCount = 1;
  if(minesState.minesCount > 24) minesState.minesCount = 24;

  addCoins(-minesState.bet);

  minesState.running = true;
  minesState.over = false;
  minesState.mines = buildMines(minesState.minesCount);
  minesState.opened = new Set();
  minesState.safeOpened = 0;
  minesState.mult = 1.00;

  setMsg("Игра началась. Открывай клетки ✅", "");
  if(app.sfx) SFX.start();
}

function cashout(){
  if(!minesState.running || minesState.over) return;
  const payout = Math.floor(minesState.bet * minesState.mult);
  addCoins(payout);

  minesState.over = true;
  minesState.running = false;
  setMsg(`💰 Забрал +${payout} 🪙 (x${minesState.mult.toFixed(2)})`, "ok");
  if(app.sfx) SFX.cash();
}

function revealAll(){
  // открыть всё (только визуально)
  for(let i=0;i<minesState.gridSize;i++){
    minesState.opened.add(i);
  }
}

function openCell(i){
  if(!minesState.running || minesState.over) return;
  if(minesState.opened.has(i)) return;

  minesState.opened.add(i);

  if(minesState.mines.has(i)){
    // boom
    minesState.over = true;
    minesState.running = false;
    revealAll();
    setMsg("💥 Мина! Раунд проигран.", "bad");
    if(app.sfx) SFX.mine();
    return;
  }

  minesState.safeOpened += 1;
  minesState.mult = calcMult(minesState.safeOpened, minesState.minesCount);

  if(app.sfx) SFX.gem();

  const maxSafe = minesState.gridSize - minesState.minesCount;
  if(minesState.safeOpened >= maxSafe){
    // очистил поле
    const payout = Math.floor(minesState.bet * minesState.mult);
    addCoins(payout);
    minesState.over = true;
    minesState.running = false;
    setMsg(`🏆 Поле очищено! +${payout} 🪙 (x${minesState.mult.toFixed(2)})`, "ok");
    if(app.sfx) SFX.cash();
  }
}

// ===============================
// Render
// ===============================
function render(){
  const potential = minesState.running && !minesState.over
    ? Math.floor(minesState.bet * minesState.mult)
    : 0;

  const maxSafe = minesState.gridSize - minesState.minesCount;

  const cells = [];
  for(let i=0;i<minesState.gridSize;i++){
    const opened = minesState.opened.has(i);
    const isMine = minesState.mines.has(i);

    let cls = "tile";
    let inner = "";

    if(opened) cls += " open";
    if(opened && isMine) { cls += " mine"; inner = `<span class="icon bomb">💣</span>`; }
    if(opened && !isMine) { cls += " safe"; inner = `<span class="icon gem">💎</span>`; }

    if(!minesState.running || minesState.over) cls += " locked";

    cells.push(`<button class="${cls}" data-i="${i}" ${(!minesState.running || minesState.over) ? "disabled" : ""}>${inner}</button>`);
  }

  screenEl.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <h2 class="h1">Mines</h2>
          <div class="hint">Открывай safe клетки. Чем больше мин — тем быстрее растёт x. Можно “Забрать”.</div>
        </div>
        <div class="spacer"></div>
        <button class="chip ${app.sfx ? "active":""}" id="toggleSfx">Звук</button>
      </div>

      <div class="grid2" style="margin-top:12px;">
        <div class="card" style="background:rgba(255,255,255,.03);">
          <div class="minesWrap">
            <div class="board" id="board">
              ${cells.join("")}
            </div>
          </div>

          <div class="kpis">
            <div class="kpi"><div class="t">Открыто safe</div><div class="v">${minesState.safeOpened} / ${maxSafe}</div></div>
            <div class="kpi"><div class="t">Множитель</div><div class="v">x${minesState.mult.toFixed(2)}</div></div>
            <div class="kpi"><div class="t">Забрать сейчас</div><div class="v">${minesState.running && !minesState.over ? potential : "—"} 🪙</div></div>
          </div>

          <div class="row" style="margin-top:12px;">
            <button class="btn" id="cashBtn" style="flex:1;" ${(!minesState.running || minesState.over) ? "disabled":""}>Забрать</button>
            <button class="btnGhost" id="resetBtn">Сброс</button>
          </div>

          <div class="msg ${minesState.msgKind||""}" id="msg">${minesState.msg||""}</div>
        </div>

        <div class="card" style="background:rgba(255,255,255,.03);">
          <div class="row" style="justify-content:space-between;">
            <div class="h1">Ставка</div>
            <button class="btnGhost" id="bonus">+1000 🪙</button>
          </div>

          <div class="chips" style="margin-top:10px;">
            ${[10,50,100,250,500].map(v=>`<button class="chip" data-bet="${v}">${v}</button>`).join("")}
            <button class="chip" data-bet="max">MAX</button>
          </div>

          <div class="row" style="margin-top:10px;">
            <button class="btnGhost" id="betMinus">-</button>
            <input class="input" id="bet" type="number" min="1" step="1" value="${minesState.bet}">
            <button class="btnGhost" id="betPlus">+</button>
          </div>

          <div style="margin-top:12px;">
            <div class="row" style="justify-content:space-between;">
              <div style="font-weight:950;">Mines</div>
              <span class="badge"><b id="mShow">${minesState.minesCount}</b></span>
            </div>
            <input class="range" id="mRange" type="range" min="1" max="24" value="${minesState.minesCount}" ${minesState.running && !minesState.over ? "disabled":""}>
            <div class="hint">На раунде менять нельзя. Больше мин → выше риск.</div>
          </div>

          <div class="row" style="margin-top:12px;">
            <button class="btn" id="startBtn" style="flex:1;" ${minesState.running && !minesState.over ? "disabled":""}>Start</button>
          </div>

          <div class="hint" style="margin-top:10px;">
            Ставка списывается при Start. Открыл safe — множитель растёт. Нажми “Забрать”, чтобы зафиксировать выигрыш.
          </div>
        </div>
      </div>
    </div>
  `;

  // bind
  document.getElementById("toggleSfx").onclick = ()=>{ if(app.sfx) SFX.click(); app.sfx=!app.sfx; render(); };

  const betInput = document.getElementById("bet");
  const syncBet = (play=false)=>{
    minesState.bet = clampBet(betInput.value);
    betInput.value = String(minesState.bet);
    if(play && app.sfx) SFX.click();
  };
  betInput.oninput = ()=>syncBet(false);

  document.getElementById("betMinus").onclick = ()=>{ betInput.value = String((Number(betInput.value)||1)-10); syncBet(true); };
  document.getElementById("betPlus").onclick = ()=>{ betInput.value = String((Number(betInput.value)||1)+10); syncBet(true); };

  document.querySelectorAll("[data-bet]").forEach(b=>{
    b.onclick = ()=>{
      if(app.sfx) SFX.click();
      const v = b.dataset.bet;
      betInput.value = (v==="max") ? String(wallet.coins) : String(v);
      syncBet(false);
    };
  });

  const mRange = document.getElementById("mRange");
  const mShow = document.getElementById("mShow");
  mRange.oninput = ()=>{
    if(app.sfx) SFX.click();
    minesState.minesCount = Number(mRange.value);
    mShow.textContent = String(minesState.minesCount);
  };

  document.getElementById("bonus").onclick = ()=>{ if(app.sfx) SFX.click(); addCoins(1000); render(); };

  document.getElementById("startBtn").onclick = async ()=>{
    await unlockAudio();
    if(app.sfx) SFX.click();
    startRound();
    render();
  };

  document.getElementById("cashBtn").onclick = async ()=>{
    await unlockAudio();
    if(app.sfx) SFX.click();
    cashout();
    render();
  };

  document.getElementById("resetBtn").onclick = ()=>{
    if(app.sfx) SFX.click();
    resetRound();
    render();
  };

  document.getElementById("board").querySelectorAll("[data-i]").forEach(btn=>{
    btn.onclick = async ()=>{
      await unlockAudio();
      const i = Number(btn.dataset.i);
      openCell(i);
      render();
    };
  });
}

// init
resetRound();
render();
