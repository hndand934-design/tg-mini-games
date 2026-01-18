// ===============================
// RNG (crypto)
// ===============================
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
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
const WALLET_KEY = "mini_wallet_coinflip_only_v1";
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
  balancePill.textContent = `🪙 ${coins}`;
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
  click(){
    tone({type:"triangle", f:520, t:0.05, g:0.03});
    tone({type:"triangle", f:320, t:0.06, g:0.02, when:0.01});
  },
  coinStart(){
    noise({t:0.12, g:0.02, hp:1200});
    tone({type:"triangle", f:420, t:0.11, g:0.03, when:0.01});
  },
  coinHit(){
    tone({type:"sine", f:980, t:0.06, g:0.05});
    tone({type:"sine", f:1560, t:0.05, g:0.03, when:0.01});
    noise({t:0.06, g:0.012, hp:2400, when:0.005});
  },
  win(){
    tone({type:"sine", f:740, t:0.10, g:0.05});
    tone({type:"sine", f:932, t:0.12, g:0.045, when:0.05});
    tone({type:"sine", f:1244, t:0.14, g:0.04, when:0.10});
  },
  lose(){
    tone({type:"sine", f:220, t:0.16, g:0.06});
    tone({type:"sine", f:165, t:0.18, g:0.05, when:0.06});
  }
};

// Глобально: первый тап включает звук (Safari/Telegram)
document.addEventListener("pointerdown", unlockAudio, { once:false });

// ===============================
// COIN FLIP ONLY — MAX FARSH
// ===============================
const coin = {
  sfx: true,
  choice: "heads", // heads/tails
  bet: 50,
  spinning: false,
  skin: "neutral", // neutral/heads/tails
  msg: "",
  msgKind: "",
};

// helper: clamp bet
function clampBet(v){
  let x = Math.floor(Number(v) || 0);
  if (x < 1) x = 1;
  if (x > wallet.coins) x = wallet.coins;
  return x;
}

function renderCoinFlip(){
  const possibleWin = coin.bet * 2;

  screenEl.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <h2 class="h1">Coin Flip</h2>
          <div class="hint">
            Монета в полёте всегда <b>фиолетовая</b>. После броска становится <b>золотой</b> (орёл) или <b>серебряной</b> (решка).
            На монете <b>нет надписей</b>.
          </div>
        </div>
        <div class="spacer"></div>
        <button class="chip ${coin.sfx ? "active":""}" id="toggleSfx">Звук</button>
      </div>

      <div class="coinStage">
        <div class="coinShadow" id="coinShadow"></div>
        <div class="coin3d" id="coin3d" data-skin="${coin.skin}">
          <div class="rim"></div>
          <div class="face front"></div>
          <div class="face back"></div>
        </div>
      </div>

      <div class="grid2">
        <div class="card" style="background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.09);">
          <div class="row" style="margin-bottom:10px;">
            <button class="chip ${coin.choice==="heads"?"active":""}" id="pickH" ${coin.spinning?"disabled":""}>🦅 Орёл</button>
            <button class="chip ${coin.choice==="tails"?"active":""}" id="pickT" ${coin.spinning?"disabled":""}>🌙 Решка</button>
            <div class="spacer"></div>
            <button class="btnGhost" id="bonus">+1000 🪙</button>
          </div>

          <div class="kpis">
            <div class="kpi"><div class="t">Ставка</div><div class="v">${coin.bet} 🪙</div></div>
            <div class="kpi"><div class="t">Выигрыш</div><div class="v">+${possibleWin} 🪙</div></div>
            <div class="kpi"><div class="t">Статус</div><div class="v">${coin.spinning ? "Бросок..." : "Готов"}</div></div>
          </div>

          <div class="row" style="margin-top:12px;">
            <button class="btn" id="throw" style="flex:1;" ${coin.spinning?"disabled":""}>Бросить</button>
          </div>

          <div class="msg ${coin.msgKind}" id="msg">${coin.msg || ""}</div>
        </div>

        <div class="card" style="background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.09);">
          <div class="h1" style="font-size:14px;">Ставка</div>
          <div class="chips" style="margin-top:10px;">
            ${[10,50,100,250,500].map(v=>`<button class="chip" data-bet="${v}">${v}</button>`).join("")}
            <button class="chip" data-bet="max">MAX</button>
          </div>

          <div class="row" style="margin-top:10px;">
            <button class="btnGhost" id="minus">-</button>
            <input class="input" id="bet" type="number" min="1" step="1" value="${coin.bet}">
            <button class="btnGhost" id="plus">+</button>
          </div>

          <div class="hint" style="margin-top:10px;">
            При изменении ставки — монета снова становится фиолетовой до следующего броска.
          </div>
        </div>
      </div>
    </div>
  `;

  // binds
  document.getElementById("toggleSfx").onclick = () => {
    coin.sfx = !coin.sfx;
    if (coin.sfx) SFX.click();
    renderCoinFlip();
  };

  document.getElementById("pickH").onclick = () => { if(!coin.spinning){ if(coin.sfx) SFX.click(); coin.choice="heads"; renderCoinFlip(); } };
  document.getElementById("pickT").onclick = () => { if(!coin.spinning){ if(coin.sfx) SFX.click(); coin.choice="tails"; renderCoinFlip(); } };

  const betInput = document.getElementById("bet");
  const applyBet = (resetToNeutral=true) => {
    const v = clampBet(betInput.value);
    const changed = (v !== coin.bet);
    coin.bet = v;
    betInput.value = String(v);
    if (resetToNeutral && changed){
      coin.skin = "neutral";
    }
  };
  betInput.oninput = () => { applyBet(true); renderCoinFlip(); };

  document.getElementById("minus").onclick = () => {
    if(coin.sfx) SFX.click();
    betInput.value = String((Number(betInput.value)||1) - 10);
    applyBet(true);
    renderCoinFlip();
  };
  document.getElementById("plus").onclick = () => {
    if(coin.sfx) SFX.click();
    betInput.value = String((Number(betInput.value)||1) + 10);
    applyBet(true);
    renderCoinFlip();
  };

  document.querySelectorAll("[data-bet]").forEach(btn=>{
    btn.onclick = ()=>{
      if(coin.sfx) SFX.click();
      const val = btn.dataset.bet;
      betInput.value = (val==="max") ? String(wallet.coins) : String(val);
      applyBet(true);
      renderCoinFlip();
    };
  });

  document.getElementById("bonus").onclick = () => {
    if(coin.sfx) SFX.click();
    addCoins(1000);
    coin.bet = clampBet(coin.bet);
    renderCoinFlip();
  };

  document.getElementById("throw").onclick = async () => {
    await unlockAudio();

    if (coin.spinning) return;

    // clamp and validate
    coin.bet = clampBet(coin.bet);
    if (coin.bet < 1) return;
    if (coin.bet > wallet.coins) return;

    // списываем ставку
    addCoins(-coin.bet);

    coin.spinning = true;
    coin.msg = "Монета в воздухе…";
    coin.msgKind = "";
    renderTopBar();

    const coinEl = document.getElementById("coin3d");
    const shadow = document.getElementById("coinShadow");

    // в полёте — фиолетовая
    coin.skin = "neutral";
    coinEl.dataset.skin = "neutral";

    if (coin.sfx) SFX.coinStart();

    // запускаем анимацию
    coinEl.classList.remove("coinThrow");
    void coinEl.offsetWidth;
    coinEl.classList.add("coinThrow");

    // тень “подлетает”
    shadow.style.opacity = "0.22";
    setTimeout(()=>{ shadow.style.opacity = "0.45"; }, 840);

    // честный результат
    const res = randFloat() < 0.5 ? "heads" : "tails";

    // удар
    setTimeout(()=>{ if(coin.sfx) SFX.coinHit(); }, 880);

    // после анимации фиксируем сторону и цвет
    setTimeout(()=>{
      // фикс поворота: heads=0, tails=180
      coinEl.style.transform = (res==="heads")
        ? "rotateX(18deg) rotateY(0deg)"
        : "rotateX(18deg) rotateY(180deg)";

      coin.skin = res;           // heads -> gold, tails -> silver
      coinEl.dataset.skin = res;

      const win = (coin.choice === res);
      if (win){
        const payout = coin.bet * 2;
        addCoins(payout);
        coin.msg = `✅ Победа! +${payout} 🪙`;
        coin.msgKind = "ok";
        if (coin.sfx) SFX.win();
      } else {
        coin.msg = `❌ Проигрыш -${coin.bet} 🪙`;
        coin.msgKind = "bad";
        if (coin.sfx) SFX.lose();
      }

      coin.spinning = false;
      renderTopBar();
      renderCoinFlip();
    }, 1080);
  };
}

// стартуем
renderCoinFlip();
