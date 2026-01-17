// ===============================
// RNG (честный, crypto)
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
if (tg) {
  tg.ready();
  tg.expand();
}

const screenEl = document.getElementById("screen");
const userEl = document.getElementById("user");
const btnFull = document.getElementById("btnFull");
const user = tg?.initDataUnsafe?.user;

btnFull?.addEventListener("click", () => {
  try { tg?.expand(); } catch {}
});

// ===============================
// Virtual Wallet (local)
// ===============================
const WALLET_KEY = "mini_wallet_v3";
function loadWallet() {
  try {
    const w = JSON.parse(localStorage.getItem(WALLET_KEY) || "null");
    if (w && typeof w.coins === "number") return w;
  } catch {}
  return { coins: 1000 };
}
function saveWallet(w) {
  localStorage.setItem(WALLET_KEY, JSON.stringify(w));
}
let wallet = loadWallet();

function setCoins(v) {
  wallet.coins = Math.max(0, Math.floor(v));
  saveWallet(wallet);
  renderTopBar();
}
function addCoins(d) {
  setCoins(wallet.coins + d);
}
function renderTopBar() {
  const coins = wallet.coins;
  userEl.textContent = user
    ? `Привет, ${user.first_name} · 🪙 ${coins}`
    : `Открыто вне Telegram · 🪙 ${coins}`;
}
renderTopBar();

// ===============================
// WebAudio SFX (современные)
// ===============================
let _audioCtx = null;
function getAudio() {
  if (_audioCtx) return _audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  _audioCtx = Ctx ? new Ctx() : null;
  return _audioCtx;
}
async function unlockAudio() {
  const ctx = getAudio();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch {}
  }
}
function playTone({ type="sine", f=440, t=0.08, g=0.06, detune=0, when=0 }) {
  const ctx = getAudio(); if (!ctx) return;
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
  o.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
  o.start(now);
  o.stop(now + t + 0.02);
}
function playNoise({ t=0.10, g=0.03, when=0, hp=900 }) {
  const ctx = getAudio(); if (!ctx) return;
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
  src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
  src.start(now);
  src.stop(now + t + 0.02);
}

// --- SFX набор ---
const SFX = {
  click() {
    playTone({ type:"triangle", f:520, t:0.05, g:0.04 });
    playTone({ type:"sine", f:840, t:0.04, g:0.02, when:0.01 });
  },
  coinStart() {
    playNoise({ t:0.12, g:0.025, hp:1200, when:0 });
    playTone({ type:"triangle", f:420, t:0.11, g:0.03, when:0.01 });
    playTone({ type:"triangle", f:320, t:0.11, g:0.02, when:0.02 });
  },
  coinImpact() {
    playTone({ type:"sine", f:980, t:0.06, g:0.05, when:0 });
    playTone({ type:"sine", f:1560, t:0.05, g:0.03, when:0.01 });
    playNoise({ t:0.06, g:0.015, hp:2500, when:0.005 });
  },
  win() {
    playTone({ type:"sine", f:740, t:0.10, g:0.05, when:0 });
    playTone({ type:"sine", f:932, t:0.12, g:0.045, when:0.05 });
    playTone({ type:"sine", f:1244, t:0.14, g:0.040, when:0.10 });
  },
  lose() {
    playTone({ type:"sine", f:220, t:0.16, g:0.06, when:0 });
    playTone({ type:"sine", f:165, t:0.18, g:0.05, when:0.06 });
  },
  roll() {
    playNoise({ t:0.14, g:0.02, hp:1000, when:0 });
    playTone({ type:"triangle", f:240, t:0.12, g:0.02, when:0.02 });
  },
  mineBoom() {
    playNoise({ t:0.16, g:0.06, hp:120, when:0 });
    playTone({ type:"sine", f:120, t:0.20, g:0.07, when:0.01 });
  },
};

let globalSound = true;
function playClick() {
  if (!globalSound) return;
  unlockAudio();
  SFX.click();
}

// ===============================
// NAV
// ===============================
const navButtons = Array.from(document.querySelectorAll(".navBtn"));
navButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    playClick();
    navButtons.forEach(b => b.classList.toggle("active", b === btn));
    setScreen(btn.dataset.screen);
  });
});

function setScreen(name) {
  if (name === "coin") return renderCoin();
  if (name === "dice") return renderDice();
  if (name === "mines") return renderMines();
  renderCoin();
}

// ===============================
// COIN FLIP — ULTRA (full UI + 3D coin + purple -> result skins)
// ===============================
let coinState = {
  choice: "heads",         // heads / tails
  bet: 50,
  spinning: false,
  sfx: true,

  streakOn: true,
  streakIndex: 0,
  streakSteps: [1.94, 3.88, 7.76, 15.52],

  lastMsg: "",
  skin: "purple",          // purple | gold | silver
};

// 1) CSS inject (чтобы не зависеть от styles.css и не ломалось)
function ensureCoinFlipStyles() {
  if (document.getElementById("coinflip-ultra-style")) return;
  const st = document.createElement("style");
  st.id = "coinflip-ultra-style";
  st.textContent = `
    .cfWrap{display:grid;gap:12px;}
    .cfGrid{display:grid;grid-template-columns:1.2fr .8fr;gap:12px;align-items:start;}
    @media (max-width: 820px){ .cfGrid{grid-template-columns:1fr;} }

    .cfCard{
      border-radius:18px;
      background:rgba(255,255,255,.045);
      border:1px solid rgba(255,255,255,.10);
      box-shadow:0 18px 60px rgba(0,0,0,.35);
      padding:14px;
    }
    .cfTitle{font-weight:950;font-size:16px;margin-bottom:4px;}
    .cfSub{opacity:.8;font-size:12px;line-height:1.25;}

    .cfRow{display:flex;gap:10px;flex-wrap:wrap;align-items:center;}
    .cfPill{
      padding:9px 12px;border-radius:999px;
      border:1px solid rgba(255,255,255,.14);
      background:rgba(255,255,255,.06);
      color:#e8eefc;font-weight:900;font-size:12px;
      cursor:pointer;
    }
    .cfPill.active{
      outline:2px solid rgba(110,150,255,.75);
      background:rgba(76,133,255,.16);
    }
    .cfPill:disabled{opacity:.55;cursor:not-allowed;}

    .cfSwitch{
      width:46px;height:28px;border-radius:999px;
      border:1px solid rgba(255,255,255,.14);
      background:rgba(255,255,255,.06);
      position:relative;cursor:pointer;
    }
    .cfSwitch::after{
      content:"";position:absolute;top:3px;left:3px;
      width:22px;height:22px;border-radius:50%;
      background:rgba(255,255,255,.9);
      transition:transform .18s ease;
    }
    .cfSwitch.on{background:rgba(76,133,255,.18);border-color:rgba(76,133,255,.32);}
    .cfSwitch.on::after{transform:translateX(18px);background:#fff;}

    .cfInfoGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;}
    @media (max-width: 520px){ .cfInfoGrid{grid-template-columns:1fr;} }
    .cfBox{
      border-radius:14px;padding:10px 12px;
      background:rgba(255,255,255,.04);
      border:1px solid rgba(255,255,255,.08);
    }
    .cfBox .h{opacity:.7;font-size:11px;}
    .cfBox .v{font-weight:950;font-size:16px;margin-top:4px;}
    .cfMsg{min-height:20px;margin-top:10px;font-weight:900;}

    .cfBtn{
      padding:12px 14px;border-radius:14px;
      background:rgba(76,133,255,.92);
      border:1px solid rgba(76,133,255,.35);
      color:#fff;font-weight:950;cursor:pointer;
    }
    .cfBtn:disabled{opacity:.55;cursor:not-allowed;}
    .cfBtnGhost{
      padding:12px 14px;border-radius:14px;
      background:rgba(255,255,255,.06);
      border:1px solid rgba(255,255,255,.12);
      color:#e8eefc;font-weight:900;cursor:pointer;
    }
    .cfBtnGhost:disabled{opacity:.45;cursor:not-allowed;}

    .cfChips{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}
    .cfChip{
      padding:8px 10px;border-radius:999px;
      border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.06);
      color:#e8eefc;font-weight:900;font-size:12px;
      cursor:pointer;
    }
    .cfBetRow{display:flex;gap:8px;align-items:center;margin-top:10px;}
    .cfInput{
      flex:1;padding:11px 12px;border-radius:14px;
      border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.06);
      color:#e8eefc;outline:none;
    }
    .cfMiniBtn{
      width:44px;height:44px;border-radius:14px;
      border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.06);
      color:#e8eefc;font-weight:950;cursor:pointer;
    }
    .cfRightHint{opacity:.75;font-size:12px;line-height:1.25;margin-top:10px;}

    /* --- 3D coin stage --- */
    .coinStage{
      height:230px;
      border-radius:18px;
      background:
        radial-gradient(220px 160px at 55% 35%, rgba(140,120,255,.10), rgba(0,0,0,0)),
        linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.02));
      border:1px solid rgba(255,255,255,.10);
      display:grid;place-items:center;
      perspective:1000px;
      position:relative;
      overflow:hidden;
    }
    .coinShadow{
      position:absolute;bottom:44px;
      width:130px;height:30px;border-radius:50%;
      background:rgba(0,0,0,.42);
      filter:blur(12px);
      transform:scale(.78);
      opacity:.55;
      transition:transform .18s ease, opacity .18s ease;
    }

    .coin3D{
      width:130px;height:130px;
      position:relative;
      transform-style:preserve-3d;
      border-radius:50%;
      will-change:transform;
    }
    .coin3D .rim{
      position:absolute;inset:-3px;border-radius:50%;
      background: conic-gradient(from 0deg,
        rgba(255,255,255,.24), rgba(0,0,0,.14),
        rgba(255,255,255,.18), rgba(0,0,0,.18),
        rgba(255,255,255,.24));
      filter:blur(.2px);
      opacity:.55;
      transform:translateZ(0px);
    }
    .coin3D .face{
      position:absolute;inset:0;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      backface-visibility:hidden;
      border:1px solid rgba(255,255,255,.18);
      box-shadow:
        0 16px 44px rgba(0,0,0,.42),
        0 0 0 2px rgba(0,0,0,.10) inset;
      overflow:hidden;
    }
    .coin3D .face::before{
      content:"";
      position:absolute;inset:-20px;
      background: radial-gradient(120px 90px at 35% 30%, rgba(255,255,255,.18), rgba(255,255,255,0) 60%);
      transform:rotate(-12deg);
      opacity:.9;
      pointer-events:none;
    }
    .coin3D .front{ transform: translateZ(8px); }
    .coin3D .back { transform: rotateY(180deg) translateZ(8px); }

    .coinMark{
      position:relative;
      font-weight:1000;
      letter-spacing:.6px;
      text-transform:uppercase;
      padding:10px 14px;
      border-radius:16px;
      background:rgba(0,0,0,.18);
      border:1px solid rgba(255,255,255,.18);
      text-shadow:0 2px 14px rgba(0,0,0,.38);
      display:flex;gap:8px;align-items:center;
      user-select:none;
    }
    .coinMark b{font-size:14px;}
    .coinMark span{font-size:18px;}

    /* skins */
    .skinPurple .front, .skinPurple .back{
      background:
        radial-gradient(circle at 30% 25%, rgba(255,255,255,.22), rgba(255,255,255,0) 55%),
        radial-gradient(circle at 70% 80%, rgba(255,255,255,.10), rgba(255,255,255,0) 55%),
        linear-gradient(145deg, rgba(165,100,255,.96), rgba(72,32,150,.98));
    }
    .skinGold .front, .skinGold .back{
      background:
        radial-gradient(circle at 30% 25%, rgba(255,255,255,.22), rgba(255,255,255,0) 55%),
        radial-gradient(circle at 70% 80%, rgba(255,255,255,.10), rgba(255,255,255,0) 55%),
        linear-gradient(145deg, rgba(255,214,100,.96), rgba(178,112,18,.98));
    }
    .skinSilver .front, .skinSilver .back{
      background:
        radial-gradient(circle at 30% 25%, rgba(255,255,255,.24), rgba(255,255,255,0) 55%),
        radial-gradient(circle at 70% 80%, rgba(255,255,255,.12), rgba(255,255,255,0) 55%),
        linear-gradient(145deg, rgba(235,245,255,.96), rgba(105,132,165,.98));
    }

    /* hiding labels on purple only */
    .skinPurple .coinMark{opacity:0; transform:scale(.98);}
    .showMark .coinMark{opacity:1; transform:scale(1); transition:opacity .12s ease, transform .12s ease;}

    /* throw animation */
    .coinAnim{
      --rz: 540deg;
      --rx: 1440deg;
      animation: coinThrow 1.05s cubic-bezier(.18,.8,.18,1) both;
    }
    @keyframes coinThrow{
      0%   { transform: translateY(28px) rotateX(0deg) rotateZ(0deg) scale(.98); }
      18%  { transform: translateY(-62px) rotateX(calc(var(--rx) * .35)) rotateZ(calc(var(--rz) * .25)) scale(1.02); }
      55%  { transform: translateY(-96px) rotateX(calc(var(--rx) * .75)) rotateZ(calc(var(--rz) * .65)) scale(1.03); }
      78%  { transform: translateY(-26px) rotateX(calc(var(--rx) * .92)) rotateZ(calc(var(--rz) * .92)) scale(1.00); }
      100% { transform: translateY(0px)  rotateX(var(--rx)) rotateZ(var(--rz)) scale(1); }
    }
  `;
  document.head.appendChild(st);
}

// 2) helpers (используем твои функции, если есть)
function cfAudioUnlock() {
  try {
    const ctx = (typeof getAudio === "function") ? getAudio() : null;
    if (ctx && ctx.state === "suspended") ctx.resume().catch(()=>{});
  } catch {}
}
function cfSfxStart(){ if (typeof sfxCoinStart === "function") sfxCoinStart(); }
function cfSfxImpact(){ if (typeof sfxCoinImpact === "function") sfxCoinImpact(); }
function cfSfxWin(){ if (typeof sfxWin === "function") sfxWin(); }
function cfSfxLose(){ if (typeof sfxLose === "function") sfxLose(); }

function renderCoin() {
  ensureCoinFlipStyles();

  const chips = [10, 50, 100, 250, 500];
  const mult = coinState.streakOn
    ? coinState.streakSteps[Math.min(coinState.streakIndex, coinState.streakSteps.length - 1)]
    : 1.94;
  const possibleWin = Math.floor(coinState.bet * mult);

  screenEl.innerHTML = `
    <div class="cfWrap">
      <div class="cfGrid">

        <div class="cfCard">
          <div class="cfTitle">Coin Flip</div>
          <div class="cfSub">
            Монета по умолчанию <b>фиолетовая</b>. При броске крутится фиолетовой, после приземления становится
            <b>золотой (Орёл)</b> или <b>серебряной (Решка)</b>.
          </div>

          <div class="coinStage" style="margin-top:12px;">
            <div class="coinShadow" id="coinShadow"></div>

            <div class="coin3D ${coinState.skin === "purple" ? "skinPurple" : (coinState.skin === "gold" ? "skinGold showMark" : "skinSilver showMark")}"
                 id="coin3D">
              <div class="rim"></div>
              <div class="face front">
                <div class="coinMark"><span>🦅</span> <b>ОРЁЛ</b></div>
              </div>
              <div class="face back">
                <div class="coinMark"><span>🌙</span> <b>РЕШКА</b></div>
              </div>
            </div>
          </div>

          <div class="cfRow" style="margin-top:12px;">
            <button class="cfPill ${coinState.choice === "heads" ? "active" : ""}" id="pickHeads" ${coinState.spinning ? "disabled" : ""}>🦅 Орёл</button>
            <button class="cfPill ${coinState.choice === "tails" ? "active" : ""}" id="pickTails" ${coinState.spinning ? "disabled" : ""}>🌙 Решка</button>

            <div style="flex:1"></div>

            <div class="cfRow" style="gap:8px;">
              <div style="opacity:.8;font-size:12px;font-weight:900;">Звук</div>
              <div class="cfSwitch ${coinState.sfx ? "on" : ""}" id="sfxSwitch"></div>

              <div style="opacity:.8;font-size:12px;font-weight:900;margin-left:10px;">Серия</div>
              <div class="cfSwitch ${coinState.streakOn ? "on" : ""}" id="streakSwitch" ${coinState.spinning ? "style='pointer-events:none;opacity:.6;'" : ""}></div>
            </div>
          </div>

          <div class="cfInfoGrid">
            <div class="cfBox">
              <div class="h">Множитель</div>
              <div class="v">x${mult.toFixed(2)}</div>
            </div>
            <div class="cfBox">
              <div class="h">Возможный выигрыш</div>
              <div class="v">+${possibleWin} 🪙</div>
            </div>
          </div>

          <div class="cfRow" style="margin-top:10px;">
            ${coinState.streakSteps.map((v, i) => `
              <span class="cfChip" style="${i === coinState.streakIndex && coinState.streakOn ? "outline:2px solid rgba(76,133,255,.85);" : ""}">
                x${v.toFixed(2)}
              </span>
            `).join("")}
          </div>

          <div class="cfMsg" id="coinMsg">${coinState.lastMsg || ""}</div>

          <div class="cfRow" style="margin-top:10px; gap:10px;">
            <button class="cfBtn" id="coinThrow" ${coinState.spinning ? "disabled" : ""} style="flex:1;">Бросить</button>
            <button class="cfBtnGhost" id="coinCash" ${coinState.streakOn && coinState.streakIndex > 0 ? "" : "disabled"}>Забрать</button>
          </div>
        </div>

        <div class="cfCard">
          <div class="cfRow" style="justify-content:space-between;align-items:center;">
            <div class="cfTitle" style="margin:0;">Ставка</div>
            <div class="cfChip" style="font-weight:950;">Баланс: <b>🪙 ${wallet?.coins ?? 0}</b></div>
          </div>

          <div class="cfChips">
            ${chips.map(v => `<button class="cfChip" data-bet="${v}">${v}</button>`).join("")}
            <button class="cfChip" data-bet="max">MAX</button>
          </div>

          <div class="cfBetRow">
            <button class="cfMiniBtn" id="betMinus">-</button>
            <input class="cfInput" id="bet" type="number" min="1" step="1" value="${coinState.bet}">
            <button class="cfMiniBtn" id="betPlus">+</button>
          </div>

          <div class="cfRightHint">
            При изменении ставки монета возвращается в <b>фиолетовый</b> режим ожидания.
          </div>

          <div class="cfRow" style="margin-top:12px;">
            <button class="cfBtnGhost" id="bonusCoins" style="width:100%;">+1000 🪙</button>
          </div>
        </div>

      </div>
    </div>
  `;

  const coinEl = document.getElementById("coin3D");
  const msgEl = document.getElementById("coinMsg");
  const betInput = document.getElementById("bet");

  // pick side (можно всегда, кроме кручения)
  document.getElementById("pickHeads").onclick = () => { if (!coinState.spinning) { coinState.choice = "heads"; renderCoin(); } };
  document.getElementById("pickTails").onclick = () => { if (!coinState.spinning) { coinState.choice = "tails"; renderCoin(); } };

  // toggles
  document.getElementById("sfxSwitch").onclick = () => { coinState.sfx = !coinState.sfx; renderCoin(); };
  document.getElementById("streakSwitch").onclick = () => {
    if (coinState.spinning) return;
    coinState.streakOn = !coinState.streakOn;
    if (!coinState.streakOn) coinState.streakIndex = 0;
    renderCoin();
  };

  // bet clamp + purple reset on any bet change
  const clampBet = () => {
    let v = Math.floor(Number(betInput.value) || 0);
    if (v < 1) v = 1;
    if (wallet && typeof wallet.coins === "number") v = Math.min(v, wallet.coins);
    coinState.bet = v;
    betInput.value = String(v);
  };

  const onBetChanged = () => {
    clampBet();
    // вернули "ожидание" — фиолетовая
    coinState.skin = "purple";
    coinState.lastMsg = "";
    renderCoin();
  };

  clampBet();
  betInput.onchange = onBetChanged;

  document.querySelectorAll(".cfChip[data-bet]").forEach((b) => {
    b.onclick = () => {
      const val = b.dataset.bet;
      betInput.value = val === "max" ? String(wallet.coins) : String(val);
      onBetChanged();
    };
  });

  document.getElementById("betMinus").onclick = () => { betInput.value = String((Number(betInput.value) || 1) - 10); onBetChanged(); };
  document.getElementById("betPlus").onclick = () => { betInput.value = String((Number(betInput.value) || 1) + 10); onBetChanged(); };

  document.getElementById("bonusCoins").onclick = () => {
    if (typeof addCoins === "function") addCoins(1000);
    renderCoin();
  };

  function currentMult() {
    if (!coinState.streakOn) return 1.94;
    return coinState.streakSteps[Math.min(coinState.streakIndex, coinState.streakSteps.length - 1)];
  }

  document.getElementById("coinCash").onclick = () => {
    if (!(coinState.streakOn && coinState.streakIndex > 0)) return;
    const m = currentMult();
    const payout = Math.floor(coinState.bet * m);
    if (typeof addCoins === "function") addCoins(payout);
    coinState.lastMsg = `✅ Забрал: +${payout} 🪙 (x${m.toFixed(2)})`;
    coinState.streakIndex = 0;
    coinState.skin = "purple"; // после забора снова ожидание
    renderCoin();
  };

  document.getElementById("coinThrow").onclick = async () => {
    clampBet();
    const bet = coinState.bet;

    if (!wallet || bet > wallet.coins) return alert("Недостаточно монет");

    // списываем ставку
    if (typeof addCoins === "function") addCoins(-bet);

    coinState.spinning = true;
    msgEl.textContent = "Монета в воздухе…";

    // ВАЖНО: при броске всегда фиолетовая
    coinState.skin = "purple";
    renderCoin(); // перерисуем чтобы точно стало purple перед анимацией

    const coinEl2 = document.getElementById("coin3D"); // после renderCoin DOM новый
    const rz = (Math.random() * 420 + 380) | 0;
    const rx = (Math.random() * 900 + 1300) | 0;
    coinEl2.style.setProperty("--rz", `${rz}deg`);
    coinEl2.style.setProperty("--rx", `${rx}deg`);

    // звук
    if (coinState.sfx) {
      cfAudioUnlock();
      cfSfxStart();
      setTimeout(() => cfSfxImpact(), 860);
    }

    // анимация
    coinEl2.classList.remove("coinAnim");
    void coinEl2.offsetWidth;
    coinEl2.classList.add("coinAnim");

    // честный результат
    const res = (typeof randFloat === "function" ? randFloat() : Math.random()) < 0.5 ? "heads" : "tails";

    await new Promise(r => setTimeout(r, 1050));

    // после приземления: меняем цвет и показываем грань
    if (res === "heads") {
      coinState.skin = "gold";
      coinEl2.style.transform = "rotateY(0deg)";
    } else {
      coinState.skin = "silver";
      coinEl2.style.transform = "rotateY(180deg)";
    }

    const won = (coinState.choice === res);
    const m = currentMult();

    if (won) {
      const payout = Math.floor(bet * m);
      if (typeof addCoins === "function") addCoins(payout);

      if (coinState.streakOn) {
        coinState.streakIndex = Math.min(coinState.streakIndex + 1, coinState.streakSteps.length - 1);
      }

      coinState.lastMsg = `✅ Выпало ${res === "heads" ? "ОРЁЛ" : "РЕШКА"} · +${payout} 🪙 (x${m.toFixed(2)})`;
      if (coinState.sfx) cfSfxWin();
    } else {
      coinState.lastMsg = `❌ Выпало ${res === "heads" ? "ОРЁЛ" : "РЕШКА"} · -${bet} 🪙`;
      coinState.streakIndex = 0;
      if (coinState.sfx) cfSfxLose();
    }

    coinState.spinning = false;
    renderCoin();
  };
}

// ===============================
// DICE
// ===============================
let diceState = {
  sides: 6,         // 6/20/100
  mode: "below",    // below/above
  threshold: 3,
  bet: 50,
  rolling: false,
  lastRoll: null,
  lastMsg: ""
};

function diceChance(sides, mode, threshold) {
  if (mode === "below") return Math.max(1 / sides, Math.min(1, threshold / sides));
  return Math.max(1 / sides, Math.min(1, (sides - threshold + 1) / sides));
}
function diceMultiplier(chance) {
  const edge = 0.98;
  return Math.max(1.02, edge / chance);
}
function renderCubeFaceHTML(n) {
  const map = {
    1: [0,0,0,0,1,0,0,0,0],
    2: [1,0,0,0,0,0,0,0,1],
    3: [1,0,0,0,1,0,0,0,1],
    4: [1,0,1,0,0,0,1,0,1],
    5: [1,0,1,0,1,0,1,0,1],
    6: [1,0,1,1,0,1,1,0,1],
  };
  const arr = map[n];
  return `
    <div class="cubeFace f${n}">
      <div class="pipGrid">
        ${arr.map(v => `<div class="pip ${v ? "" : "off"}"></div>`).join("")}
      </div>
    </div>
  `;
}

function renderDice() {
  const s = diceState.sides;
  diceState.threshold = Math.max(1, Math.min(s, diceState.threshold));
  diceState.bet = Math.max(1, Math.min(wallet.coins, Math.floor(Number(diceState.bet)||1)));

  const chance = diceChance(s, diceState.mode, diceState.threshold);
  const mult = diceMultiplier(chance);
  const payout = Math.floor(diceState.bet * mult);
  const winText = diceState.mode === "below"
    ? `Выигрыш, если выпало ≤ ${diceState.threshold}`
    : `Выигрыш, если выпало ≥ ${diceState.threshold}`;

  screenEl.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <div class="h1">Dice</div>
          <div class="muted">D6 — 3D кубик. D20/D100 — рулетка. Режим “Меньше/Больше”.</div>
        </div>
        <div class="spacer"></div>
        <div class="badge">Баланс: <b>🪙 ${wallet.coins}</b></div>
      </div>

      <div class="row" style="margin-top:10px;">
        <button class="chip ${s===6?"active":""}" data-sides="6">D6</button>
        <button class="chip ${s===20?"active":""}" data-sides="20">D20</button>
        <button class="chip ${s===100?"active":""}" data-sides="100">D100</button>
        <div class="spacer"></div>
        <button class="chip ${diceState.mode==="below"?"active":""}" data-mode="below">Меньше</button>
        <button class="chip ${diceState.mode==="above"?"active":""}" data-mode="above">Больше</button>
      </div>

      <div class="bigNums">
        <div class="bigNum">
          <div class="n">${String(diceState.threshold).padStart(2,"0")}</div>
          <div class="s">твоё число</div>
        </div>
        <div class="bigNum">
          <div class="n">${diceState.lastRoll==null ? "00" : String(diceState.lastRoll).padStart(2,"0")}</div>
          <div class="s">выпавшее</div>
        </div>
      </div>

      <div class="kpiGrid">
        <div class="kpi"><div class="t">Множитель</div><div class="v">x${mult.toFixed(2)}</div></div>
        <div class="kpi"><div class="t">Возможный выигрыш</div><div class="v">+${payout} 🪙</div></div>
        <div class="kpi"><div class="t">Шанс</div><div class="v">${(chance*100).toFixed(1)}%</div></div>
      </div>

      <div style="margin-top:10px;">
        <div class="row" style="justify-content:space-between;">
          <div style="font-weight:900;">Порог: <b id="thLabel">${diceState.threshold}</b> из ${s}</div>
          <div class="badge">Шанс <b>${(chance*100).toFixed(1)}%</b> · x<b>${mult.toFixed(2)}</b></div>
        </div>
        <input id="threshold" class="range" type="range" min="1" max="${s}" value="${diceState.threshold}">
        <div class="muted">${winText}</div>
      </div>

      <div class="diceArena" id="diceArena">
        <div class="diceShadow"></div>
        ${
          s===6
          ? `<div class="diceThrow">
              <div class="cube ${diceState.lastRoll ? "show-"+diceState.lastRoll : ""}" id="cube">
                ${renderCubeFaceHTML(1)}
                ${renderCubeFaceHTML(2)}
                ${renderCubeFaceHTML(3)}
                ${renderCubeFaceHTML(4)}
                ${renderCubeFaceHTML(5)}
                ${renderCubeFaceHTML(6)}
              </div>
            </div>`
          : `<div class="rollStrip">
              <div class="ghostL" id="gL">17</div>
              <div class="num" id="stripNum">00</div>
              <div class="ghostR" id="gR">13</div>
            </div>`
        }
      </div>

      <div style="margin-top:12px;">
        <div class="row" style="justify-content:space-between;">
          <div style="font-weight:900;">Ставка</div>
          <div class="badge"><b id="betShow">${diceState.bet}</b> 🪙</div>
        </div>

        <div class="row" style="margin-top:8px;">
          ${[10,50,100,250,500].map(v=>`<button class="chip" data-bet="${v}">${v}</button>`).join("")}
          <button class="chip" data-bet="max">MAX</button>
        </div>

        <div class="row" style="margin-top:10px;">
          <button class="btn ghost small" id="betMinus">-</button>
          <input id="bet" class="input" type="number" min="1" step="1" value="${diceState.bet}">
          <button class="btn ghost small" id="betPlus">+</button>
        </div>
      </div>

      <div class="row" style="margin-top:12px;">
        <button class="btn" id="rollBtn" style="flex:1" ${diceState.rolling?"disabled":""}>Бросить</button>
        <button class="btn ghost" id="bonus">+1000 🪙</button>
      </div>

      <div class="msgLine" id="diceMsg">${diceState.lastMsg || ""}</div>
    </div>
  `;

  // handlers
  document.querySelectorAll("[data-sides]").forEach(b=>{
    b.onclick = () => {
      playClick();
      diceState.sides = Number(b.dataset.sides);
      diceState.threshold = diceState.sides === 6 ? 3 : (diceState.sides === 20 ? 10 : 50);
      diceState.lastRoll = null;
      diceState.lastMsg = "";
      renderDice();
    };
  });
  document.querySelectorAll("[data-mode]").forEach(b=>{
    b.onclick = () => {
      playClick();
      diceState.mode = b.dataset.mode;
      diceState.lastMsg = "";
      renderDice();
    };
  });

  const th = document.getElementById("threshold");
  th.oninput = () => {
    diceState.threshold = Number(th.value);
    document.getElementById("thLabel").textContent = String(diceState.threshold);
    diceState.lastMsg = "";
    renderDice();
  };

  const betInput = document.getElementById("bet");
  const betShow = document.getElementById("betShow");
  const clampBet = () => {
    let v = Math.floor(Number(betInput.value)||0);
    if (v<1) v=1;
    if (v>wallet.coins) v=wallet.coins;
    betInput.value = String(v);
    betShow.textContent = String(v);
    diceState.bet = v;
  };
  clampBet();
  betInput.oninput = clampBet;
  document.getElementById("betMinus").onclick = ()=>{ betInput.value=String((Number(betInput.value)||1)-10); clampBet(); };
  document.getElementById("betPlus").onclick = ()=>{ betInput.value=String((Number(betInput.value)||1)+10); clampBet(); };
  document.querySelectorAll("[data-bet]").forEach(b=>{
    b.onclick = ()=>{ betInput.value = b.dataset.bet==="max" ? String(wallet.coins) : String(b.dataset.bet); clampBet(); };
  });

  document.getElementById("bonus").onclick = ()=>{ addCoins(1000); renderDice(); };

  document.getElementById("rollBtn").onclick = async () => {
    await unlockAudio();
    clampBet();
    if (diceState.rolling) return;
    if (diceState.bet > wallet.coins) return alert("Недостаточно монет");

    addCoins(-diceState.bet);
    diceState.rolling = true;
    diceState.lastMsg = "";

    const roll = randInt(1, diceState.sides);
    const win = diceState.mode==="below" ? (roll <= diceState.threshold) : (roll >= diceState.threshold);

    if (globalSound) SFX.roll();

    if (diceState.sides === 6) {
      const arena = document.getElementById("diceArena");
      const cube = document.getElementById("cube");
      arena.classList.add("throwing");
      setTimeout(() => {
        diceState.lastRoll = roll;
        cube.className = "cube show-" + roll;
      }, 900);

      setTimeout(() => {
        arena.classList.remove("throwing");
        finish();
      }, 1250);
    } else {
      const numEl = document.getElementById("stripNum");
      const gL = document.getElementById("gL");
      const gR = document.getElementById("gR");

      const start = performance.now();
      let lastSwap = 0;
      const spinTimer = setInterval(() => {
        const now = performance.now();
        if (now - start > 950) return;
        if (now - lastSwap > 55) {
          lastSwap = now;
          gL.textContent = String(randInt(1, diceState.sides)).padStart(2,"0");
          numEl.textContent = String(randInt(1, diceState.sides)).padStart(2,"0");
          gR.textContent = String(randInt(1, diceState.sides)).padStart(2,"0");
        }
      }, 30);

      setTimeout(() => {
        clearInterval(spinTimer);
        numEl.textContent = "00";
      }, 950);

      setTimeout(() => {
        diceState.lastRoll = roll;
        finish();
      }, 1250);
    }

    function finish() {
      const chance = diceChance(diceState.sides, diceState.mode, diceState.threshold);
      const mult = diceMultiplier(chance);
      const payout = Math.floor(diceState.bet * mult);

      if (win) {
        addCoins(payout);
        if (globalSound) SFX.win();
        diceState.lastMsg = `✅ Выпало ${roll}. Выигрыш +${payout} 🪙 (x${mult.toFixed(2)})`;
      } else {
        if (globalSound) SFX.lose();
        diceState.lastMsg = `❌ Выпало ${roll}. Проигрыш -${diceState.bet} 🪙`;
      }

      diceState.rolling = false;
      renderTopBar();
      renderDice();
    }
  };
}

// ===============================
// MINES
// ===============================
let minesState = null;

function renderMines() {
  const size = 25; // 5x5

  function calcMultiplier(safeOpened, minesCount) {
    const m = minesCount;
    const a = 0.095 + m * 0.0075;
    const b = 0.018 + m * 0.0018;
    const mult = 1 + safeOpened * a + (safeOpened * safeOpened) * b * 0.06;
    return Math.max(1, mult);
  }
  function buildMines(minesCount) {
    const mines = new Set();
    while (mines.size < minesCount) mines.add(randInt(0, size - 1));
    return mines;
  }

  function setup() {
    const betDefault = Math.min(50, wallet.coins);

    screenEl.innerHTML = `
      <div class="card">
        <div class="row">
          <div>
            <div class="h1">Mines</div>
            <div class="muted">Открывай safe, избегай мин. Можно “Забрать” в любой момент.</div>
          </div>
          <div class="spacer"></div>
          <div class="badge">Баланс: <b>🪙 ${wallet.coins}</b></div>
        </div>

        <div style="margin-top:14px;">
          <div class="row" style="justify-content:space-between;">
            <div style="font-weight:900;">Ставка</div>
            <div class="badge"><b id="mBetShow">${betDefault}</b> 🪙</div>
          </div>
          <div class="row" style="margin-top:8px;">
            ${[10,50,100,250,500].map(v=>`<button class="chip" data-mbet="${v}">${v}</button>`).join("")}
            <button class="chip" data-mbet="max">MAX</button>
          </div>
          <div class="row" style="margin-top:10px;">
            <button class="btn ghost small" id="mMinus">-</button>
            <input id="mBet" class="input" type="number" min="1" step="1" value="${betDefault}">
            <button class="btn ghost small" id="mPlus">+</button>
          </div>
        </div>

        <div style="margin-top:14px;">
          <div class="row" style="justify-content:space-between;">
            <div style="font-weight:900;">Количество мин</div>
            <div class="badge"><b id="mCountShow">5</b></div>
          </div>
          <input id="mCount" class="range" type="range" min="1" max="24" value="5">
          <div class="muted">Больше мин → выше риск, но множитель растёт быстрее.</div>
        </div>

        <div class="row" style="margin-top:14px;">
          <button class="btn" id="mStart" style="flex:1">Start</button>
          <button class="btn ghost" id="mBonus">+1000 🪙</button>
        </div>
      </div>
    `;

    const bet = document.getElementById("mBet");
    const betShow = document.getElementById("mBetShow");
    const count = document.getElementById("mCount");
    const countShow = document.getElementById("mCountShow");

    function clampBet() {
      let v = Math.floor(Number(bet.value) || 0);
      if (v < 1) v = 1;
      if (v > wallet.coins) v = wallet.coins;
      bet.value = String(v);
      betShow.textContent = String(v);
    }
    function clampCount() {
      const v = Math.floor(Number(count.value) || 1);
      countShow.textContent = String(v);
    }
    clampBet(); clampCount();

    document.querySelectorAll("[data-mbet]").forEach(b=>{
      b.onclick = () => {
        playClick();
        bet.value = b.dataset.mbet==="max" ? String(wallet.coins) : String(b.dataset.mbet);
        clampBet();
      };
    });
    document.getElementById("mMinus").onclick = ()=>{ bet.value=String((Number(bet.value)||1)-10); clampBet(); };
    document.getElementById("mPlus").onclick = ()=>{ bet.value=String((Number(bet.value)||1)+10); clampBet(); };
    bet.oninput = clampBet;
    count.oninput = ()=>{ playClick(); clampCount(); };

    document.getElementById("mBonus").onclick = ()=>{ addCoins(1000); renderMines(); };

    document.getElementById("mStart").onclick = async ()=> {
      await unlockAudio();
      clampBet(); clampCount();
      const betV = Math.floor(Number(bet.value)||0);
      const minesCount = Math.floor(Number(count.value)||0);

      if (betV <= 0) return alert("Ставка должна быть больше 0");
      if (betV > wallet.coins) return alert("Недостаточно монет");
      if (minesCount < 1 || minesCount > size - 1) return alert(`Мин должно быть от 1 до ${size-1}`);

      addCoins(-betV);

      minesState = {
        bet: betV,
        minesCount,
        mines: buildMines(minesCount),
        opened: new Set(),
        over: false,
        cashed: false,
        safeOpened: 0,
        multiplier: 1,
        msg: "",
        lastHitMine: null,
      };
      draw();
    };
  }

  function revealAll() {
    for (let i=0;i<size;i++) minesState.opened.add(i);
  }

  function cashOut() {
    if (!minesState || minesState.over || minesState.cashed) return;
    minesState.cashed = true;
    minesState.over = true;

    const payout = Math.floor(minesState.bet * minesState.multiplier);
    addCoins(payout);
    if (globalSound) SFX.win();

    minesState.msg = `✅ Забрал: +${payout} 🪙 (x${minesState.multiplier.toFixed(2)})`;
    revealAll();
    draw();
  }

  function onTile(i) {
    if (!minesState || minesState.over) return;
    if (minesState.opened.has(i)) return;

    minesState.opened.add(i);
    const isMine = minesState.mines.has(i);

    if (isMine) {
      minesState.over = true;
      minesState.lastHitMine = i;
      minesState.msg = `💥 Мина! Ставка ${minesState.bet} 🪙 сгорела`;
      if (globalSound) SFX.mineBoom();
      revealAll();
      draw();
      return;
    }

    if (globalSound) SFX.click();

    minesState.safeOpened += 1;
    minesState.multiplier = calcMultiplier(minesState.safeOpened, minesState.minesCount);

    const maxSafe = size - minesState.minesCount;
    if (minesState.safeOpened >= maxSafe) {
      minesState.msg = "🏁 Открыл все safe! Авто-забор.";
      cashOut();
      return;
    }
    draw();
  }

  function draw() {
    if (!minesState) return setup();

    const maxSafe = size - minesState.minesCount;
    const ladder = [];
    for (let step=1; step<=maxSafe; step++) {
      const x = calcMultiplier(step, minesState.minesCount);
      const cls =
        step === minesState.safeOpened ? "step active" :
        step < minesState.safeOpened ? "step done" : "step";
      ladder.push(`
        <div class="${cls}">
          <div>${step}</div>
          <div class="x">x${x.toFixed(2)}</div>
        </div>
      `);
    }

    const potential = Math.floor(minesState.bet * minesState.multiplier);

    const cells = [];
    for (let i=0;i<size;i++) {
      const opened = minesState.opened.has(i);
      const isMine = minesState.mines.has(i);

      let label = "";
      let cls = "tile";
      if (opened) cls += " open";
      if (opened && isMine) cls += " mine";
      if (opened && !isMine) cls += " safe";
      if (minesState.lastHitMine === i) cls += " boom";
      if (opened) label = isMine ? "💣" : "✅";

      cells.push(`
        <button class="${cls}" data-i="${i}" ${minesState.over ? "disabled" : ""}>
          <div class="tileInner">${label}</div>
        </button>
      `);
    }

    screenEl.innerHTML = `
      <div class="card">
        <div class="row">
          <div>
            <div class="h1">Mines</div>
            <div class="muted">Safe: <b>${minesState.safeOpened}</b> · Мин: <b>${minesState.minesCount}</b> · Ставка: <b>${minesState.bet} 🪙</b></div>
          </div>
          <div class="spacer"></div>
          <div class="badge">Сейчас: <b>x${minesState.multiplier.toFixed(2)}</b></div>
        </div>

        <div class="kpiGrid">
          <div class="kpi"><div class="t">Забрать сейчас</div><div class="v">${potential} 🪙</div></div>
          <div class="kpi"><div class="t">Осталось safe</div><div class="v">${maxSafe - minesState.safeOpened}</div></div>
          <div class="kpi"><div class="t">Статус</div><div class="v">${minesState.over ? "Раунд завершён" : "Идёт игра"}</div></div>
        </div>

        <div class="msgLine"><b>${minesState.msg || ""}</b></div>

        <div class="minesGrid">${cells.join("")}</div>

        <div class="row" style="margin-top:12px;">
          <button class="btn" id="mCash" style="flex:1" ${minesState.over ? "disabled" : ""}>Забрать</button>
          <button class="btn ghost" id="mNew">Новый раунд</button>
        </div>

        <div class="ladder" id="ladder">${ladder.join("")}</div>
      </div>
    `;

    document.getElementById("mCash").onclick = () => cashOut();
    document.getElementById("mNew").onclick = () => { minesState = null; draw(); };

    document.querySelectorAll(".tile").forEach(b=>{
      b.onclick = () => onTile(Number(b.dataset.i));
    });

    // автоскролл ladder к активному шагу
    const ladderEl = document.getElementById("ladder");
    const active = ladderEl.querySelector(".step.active");
    if (active) {
      const left = active.offsetLeft - ladderEl.clientWidth/2 + active.clientWidth/2;
      ladderEl.scrollLeft = Math.max(0, left);
    }
  }

  draw();
}

// старт по умолчанию
setScreen("coin");



