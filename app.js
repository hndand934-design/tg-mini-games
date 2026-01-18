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
const WALLET_KEY = "mini_wallet_v3";
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
  const coins = wallet.coins;
  userEl.textContent = user
    ? `Привет, ${user.first_name} · открыто в Telegram`
    : `Открыто вне Telegram`;
  if (balancePill) balancePill.textContent = `🪙 ${coins}`;
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
function tone({ type="sine", f=440, t=0.08, g=0.06, when=0, detune=0 }) {
  const ctx = audioCtx(); if (!ctx) return;
  const now = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const gain = ctx.createGain();
  const filt = ctx.createBiquadFilter();

  o.type = type;
  o.frequency.setValueAtTime(f, now);
  o.detune.setValueAtTime(detune, now);

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
  coinStart(){ noise({t:0.12, g:0.02, hp:1200}); tone({type:"triangle", f:420, t:0.10, g:0.03, when:0.01}); },
  coinHit(){ tone({type:"sine", f:980, t:0.06, g:0.05}); tone({type:"sine", f:1560, t:0.05, g:0.03, when:0.01}); noise({t:0.06, g:0.012, hp:2400, when:0.005}); },
  win(){ tone({type:"sine", f:740, t:0.10, g:0.05}); tone({type:"sine", f:932, t:0.12, g:0.045, when:0.05}); tone({type:"sine", f:1244, t:0.14, g:0.04, when:0.10}); },
  lose(){ tone({type:"sine", f:220, t:0.16, g:0.06}); tone({type:"sine", f:165, t:0.18, g:0.05, when:0.06}); },
  roll(){ noise({t:0.10, g:0.014, hp:900}); tone({type:"square", f:220, t:0.06, g:0.03, when:0.02}); },
  mine(){ noise({t:0.16, g:0.03, hp:600}); tone({type:"sawtooth", f:140, t:0.18, g:0.05, when:0.02}); },
  safe(){ tone({type:"triangle", f:650, t:0.06, g:0.04}); tone({type:"triangle", f:880, t:0.05, g:0.03, when:0.03}); },
};
function playClick(){ if(app.sfx) SFX.click(); }
document.addEventListener("pointerdown", unlockAudio, { once:false });

// ===============================
// Tiny CSS patch (чтобы не трогать твой styles.css)
// - монета: neutral/heads/tails цвета
// - кубик: solid (не прозрачный)
// ===============================
(function injectPatchCSS(){
  if(document.getElementById("patchCssV1")) return;
  const s = document.createElement("style");
  s.id = "patchCssV1";
  s.textContent = `
    /* coin skins (fallback if not in styles.css) */
    .coin3d[data-skin="neutral"] .face,
    .coin3d[data-skin="neutral"] .rim { background: radial-gradient(circle at 30% 20%, rgba(255,255,255,.35), rgba(255,255,255,.06) 42%, rgba(0,0,0,.18) 72%), linear-gradient(135deg, rgba(140,80,255,.92), rgba(100,40,220,.92)); }
    .coin3d[data-skin="heads"] .face,
    .coin3d[data-skin="heads"] .rim { background: radial-gradient(circle at 30% 20%, rgba(255,255,255,.35), rgba(255,255,255,.08) 45%, rgba(0,0,0,.2) 76%), linear-gradient(135deg, rgba(255,210,90,.95), rgba(190,135,35,.95)); }
    .coin3d[data-skin="tails"] .face,
    .coin3d[data-skin="tails"] .rim { background: radial-gradient(circle at 30% 20%, rgba(255,255,255,.35), rgba(255,255,255,.08) 45%, rgba(0,0,0,.2) 76%), linear-gradient(135deg, rgba(210,225,245,.95), rgba(125,150,175,.95)); }

    /* remove text if any */
    .coin3d .label { display:none !important; }

    /* cube solid patch */
    .cube.solid .cubeFace{
      background: linear-gradient(145deg, rgba(255,255,255,.20), rgba(255,255,255,.06));
      border: 1px solid rgba(255,255,255,.20);
      box-shadow: inset 0 0 0 1px rgba(0,0,0,.25);
      backdrop-filter: none !important;
    }
    .cube.solid .pip { background: rgba(255,255,255,.95); }
    .cube.solid .pip.off { opacity: 0; }
  `;
  document.head.appendChild(s);
})();

// ===============================
// App state + routing
// ===============================
const app = {
  sfx: true,
  screen: "coin",
};

document.querySelectorAll(".navBtn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    playClick();
    setScreen(btn.dataset.screen);
  });
});
function setNavActive(name){
  document.querySelectorAll(".navBtn").forEach(b=>{
    b.classList.toggle("active", b.dataset.screen === name);
  });
}

function setScreen(name){
  app.screen = name;
  setNavActive(name);
  if(name === "coin") renderCoin();
  else if(name === "dice") renderDice();
  else if(name === "mines") renderMines();
  else renderCoin();
}
setScreen(app.screen);

// ===============================
// COIN FLIP — FINAL (ONLY MODE)
// ===============================
const coinState = {
  choice: "heads",
  bet: 50,
  spinning: false,
  skin: "neutral", // neutral | heads | tails
  msg: "",
  msgKind: "",
};

function renderCoin() {
  screenEl.innerHTML = `
    <div class="card">
      <h2 class="h1">Coin Flip</h2>
      <div class="coinStage">
        <div class="coinShadow" id="coinShadow"></div>
        <div class="coin3d" id="coin3d" data-skin="${coinState.skin}">
          <div class="rim"></div>
          <div class="face front"></div>
          <div class="face back"></div>
        </div>
      </div>

      <div class="row">
        <button class="chip ${coinState.choice==="heads"?"active":""}" id="pickH">Орёл</button>
        <button class="chip ${coinState.choice==="tails"?"active":""}" id="pickT">Решка</button>
      </div>

      <button class="btn" id="throwBtn">Бросить</button>
      <div class="msg ${coinState.msgKind}">${coinState.msg}</div>
    </div>
  `;

  document.getElementById("pickH").onclick = () => coinState.choice = "heads";
  document.getElementById("pickT").onclick = () => coinState.choice = "tails";

  document.getElementById("throwBtn").onclick = async () => {
    if (coinState.spinning) return;
    await unlockAudio();

    if (wallet.coins < coinState.bet) return;

    addCoins(-coinState.bet);
    coinState.spinning = true;
    coinState.msg = "Монета в воздухе…";
    coinState.msgKind = "";
    coinState.skin = "neutral";

    const coin = document.getElementById("coin3d");
    const shadow = document.getElementById("coinShadow");

    const rz = Math.random() * 720 + 360;
    const rx = Math.random() * 1440 + 720;
    coin.style.setProperty("--rz", rz + "deg");
    coin.style.setProperty("--rx", rx + "deg");

    coin.classList.remove("coinThrow");
    void coin.offsetWidth;
    coin.classList.add("coinThrow");

    shadow.style.opacity = "0.2";

    if(app.sfx) SFX.coinStart();

    const result = Math.random() < 0.5 ? "heads" : "tails";

    setTimeout(() => {
      coin.style.transform = result === "heads"
        ? "rotateY(0deg)"
        : "rotateY(180deg)";
      coinState.skin = result;
      coin.dataset.skin = result;

      const win = result === coinState.choice;
      if (win) {
        const winAmount = coinState.bet * 2;
        addCoins(winAmount);
        coinState.msg = `✅ Выигрыш +${winAmount}`;
        coinState.msgKind = "ok";
        if(app.sfx) SFX.win();
      } else {
        coinState.msg = `❌ Проигрыш -${coinState.bet}`;
        coinState.msgKind = "bad";
        if(app.sfx) SFX.lose();
      }

      coinState.spinning = false;
      shadow.style.opacity = "0.45";
      renderTopBar();
      renderCoin();
    }, 1100);
  };
}