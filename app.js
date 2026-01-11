// ===============================
// RNG (честный)
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
const user = tg?.initDataUnsafe?.user;

// ===============================
// Virtual Coins (local)
// ===============================
const WALLET_KEY = "mini_wallet_v2";
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
// Audio (modern synth SFX, no files)
// ===============================
let _audioCtx = null;
function getAudio() {
  if (_audioCtx) return _audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  _audioCtx = Ctx ? new Ctx() : null;
  return _audioCtx;
}
async function ensureAudio() {
  const ctx = getAudio();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch {}
  }
}

function playTone({ type = "sine", f = 440, t = 0.08, g = 0.07, detune = 0, when = 0 }) {
  const ctx = getAudio();
  if (!ctx) return;
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
  o.stop(now + t + 0.03);
}

function playNoise({ t = 0.10, g = 0.03, when = 0, hp = 900 }) {
  const ctx = getAudio();
  if (!ctx) return;

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
  src.stop(now + t + 0.03);
}

function playClick() {
  playTone({ type: "triangle", f: 520, t: 0.05, g: 0.03, when: 0 });
  playTone({ type: "triangle", f: 320, t: 0.05, g: 0.02, when: 0.01 });
}
function playRoll() {
  playNoise({ t: 0.10, g: 0.02, hp: 1400, when: 0 });
  playTone({ type: "sine", f: 260, t: 0.10, g: 0.02, when: 0.01 });
}
function playWin() {
  playTone({ type: "sine", f: 740, t: 0.10, g: 0.05, when: 0 });
  playTone({ type: "sine", f: 932, t: 0.12, g: 0.045, when: 0.05 });
  playTone({ type: "sine", f: 1244, t: 0.14, g: 0.040, when: 0.10 });
}
function playLose() {
  playTone({ type: "sine", f: 220, t: 0.16, g: 0.06, when: 0 });
  playTone({ type: "sine", f: 165, t: 0.18, g: 0.05, when: 0.06 });
}
function playMine() {
  playNoise({ t: 0.18, g: 0.045, hp: 600, when: 0 });
  playTone({ type: "square", f: 90, t: 0.14, g: 0.03, when: 0.03 });
}

// Coin: start + impact + win/lose (чуть более “дорого”)
function sfxCoinStart() {
  playNoise({ t: 0.12, g: 0.02, hp: 1600, when: 0 });
  playTone({ type: "triangle", f: 520, t: 0.10, g: 0.03, when: 0.01 });
  playTone({ type: "triangle", f: 360, t: 0.11, g: 0.02, when: 0.02 });
}
function sfxCoinImpact() {
  playTone({ type: "sine", f: 980, t: 0.06, g: 0.05, when: 0 });
  playTone({ type: "sine", f: 1560, t: 0.05, g: 0.03, when: 0.01 });
  playNoise({ t: 0.05, g: 0.012, hp: 2600, when: 0.005 });
}

// ===============================
// Global UI mini styles (helper)
// ===============================
if (!document.getElementById("mini-pro-style")) {
  const st = document.createElement("style");
  st.id = "mini-pro-style";
  st.textContent = `
    .badge2{padding:8px 10px;border-radius:999px;background:rgba(255,255,255,.06);
      border:1px solid rgba(255,255,255,.10);font-weight:800;font-size:12px;}
    .chip{padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.06);color:#e8eefc;cursor:pointer;font-weight:800;font-size:12px;}
    .chip.active{outline:2px solid rgba(76,133,255,.85);}
    .ghost{background:rgba(255,255,255,.06)!important;}
    .input{width:100%;padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,.10);
      background:rgba(255,255,255,.06);color:#e8eefc;outline:none;}
    .range{width:100%;margin-top:8px;accent-color:#4c7dff;}
    .kpiGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px;}
    .kpi{padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.10);}
    .kpi .t{opacity:.75;font-size:11px;}
    .kpi .v{font-size:16px;font-weight:900;margin-top:4px;}
    .bigNums{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;align-items:center;}
    .bigNum{padding:12px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.10);
      text-align:center;}
    .bigNum .n{font-size:44px;font-weight:950;letter-spacing:1px;}
    .bigNum .s{opacity:.75;font-size:12px;margin-top:2px;}
    .btnWide{width:100%;}
    .msgLine{min-height:20px;font-weight:900;margin-top:8px;}
    .hintLine{opacity:.78;font-size:12px;margin-top:6px;}
  `;
  document.head.appendChild(st);
}

// ===============================
// Навигация
// ===============================
function setScreen(name) {
  const screens = {
    menu: renderMenu,
    coin: renderCoin,
    dice: renderDice,
    mines: renderMines,
    bj: renderBJ,
    crash: renderCrash,
  };
  (screens[name] || renderMenu)();
}
document.querySelectorAll(".nav button").forEach((btn) => {
  btn.addEventListener("click", async () => {
    await ensureAudio();
    playClick();
    setScreen(btn.dataset.screen);
  });
});

// ===============================
// MENU
// ===============================
function renderMenu() {
  screenEl.innerHTML = `
    <div class="card">
      <div style="font-weight:900; font-size:16px; margin-bottom:6px;">Выбери режим</div>
      <div class="row">
        <span class="badge">Coin Flip</span>
        <span class="badge">Dice</span>
        <span class="badge">Mines</span>
        <span class="badge">Black Jack</span>
        <span class="badge">Lucky Jet</span>
      </div>
      <div style="opacity:.82; margin-top:10px; font-size:13px;">
        Везде: виртуальные монеты 🪙, без вывода.
      </div>
    </div>
  `;
}

// ===============================
// COIN FLIP PRO (единая версия, без дублей)
// ===============================
const COIN_KEY = "mini_coin_state_v1";
const SERIES_MULTS = [1.94, 3.88, 7.76, 15.52];

let coinState = (function loadCoinState() {
  try {
    const s = JSON.parse(localStorage.getItem(COIN_KEY) || "null");
    if (s && typeof s === "object") return {
      choice: s.choice === "tails" ? "tails" : "heads",
      bet: Math.max(1, Math.floor(s.bet || 50)),
      sfx: s.sfx !== false,
      seriesEnabled: s.seriesEnabled !== false,

      // серия
      seriesActive: !!s.seriesActive,
      seriesBet: Math.max(1, Math.floor(s.seriesBet || 50)),
      seriesStep: Math.max(0, Math.floor(s.seriesStep || 0)),
    };
  } catch {}
  return {
    choice: "heads",
    bet: 50,
    sfx: true,
    seriesEnabled: true,

    seriesActive: false,
    seriesBet: 50,
    seriesStep: 0,
  };
})();
function saveCoinState() {
  localStorage.setItem(COIN_KEY, JSON.stringify(coinState));
}

function renderCoin() {
  const chips = [10, 50, 100, 250, 500];

  const mult = coinState.seriesEnabled
    ? SERIES_MULTS[Math.min(coinState.seriesStep, SERIES_MULTS.length - 1)]
    : 1.94;

  const betForCalc = coinState.seriesActive ? coinState.seriesBet : coinState.bet;
  const possibleWin = Math.floor(betForCalc * mult);

  screenEl.innerHTML = `
    <div class="cfWrap">
      <div class="cfGrid">

        <div class="cfCard">
          <div class="cfTitle">Coin Flip</div>
          <div class="cfSub">
            Выбери сторону, сделай ставку и бросай монету.<br/>
            <b>Серия</b> даёт растущий множитель — можно продолжать или “Забрать”.
          </div>

          <div class="coinStage" style="margin-top:10px;">
            <div class="coinShadow" id="coinShadow"></div>
            <div class="coin3D coinBlank" id="coin3D">
              <div class="rim"></div>
              <div class="face front"><div class="label">ОРЁЛ</div></div>
              <div class="face back"><div class="label">РЕШКА</div></div>
            </div>
          </div>

          <div class="cfRow" style="margin-top:10px;">
            <button class="cfPill ${coinState.choice === "heads" ? "active" : ""}" id="pickHeads">🦅 Орёл</button>
            <button class="cfPill ${coinState.choice === "tails" ? "active" : ""}" id="pickTails">🌙 Решка</button>
            <div style="flex:1"></div>
            <div class="cfToggle">
              <div style="opacity:.8;font-size:12px;font-weight:800;">Звук</div>
              <div class="cfSwitch ${coinState.sfx ? "on" : ""}" id="sfxSwitch"></div>
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
            <div class="cfToggle">
              <div style="opacity:.8;font-size:12px;font-weight:800;">Серия</div>
              <div class="cfSwitch ${coinState.seriesEnabled ? "on" : ""}" id="seriesSwitch"></div>
            </div>

            <div class="cfRow" style="gap:8px; margin-left:auto;">
              ${SERIES_MULTS.map((v, i) => `
                <span class="cfChip" style="${coinState.seriesEnabled && i === coinState.seriesStep ? "outline:2px solid rgba(76,133,255,.85);" : ""}">
                  x${v.toFixed(2)}
                </span>
              `).join("")}
            </div>
          </div>

          <div class="cfMsg" id="coinMsg"></div>

          <div class="cfRow" style="margin-top:10px; gap:10px;">
            <button class="cfBtn" id="coinThrow" style="flex:1;">Бросить</button>
            <button class="cfBtnGhost" id="coinCash" ${coinState.seriesActive ? "" : "disabled"}>Забрать</button>
          </div>

          <div style="opacity:.65;font-size:12px;margin-top:10px;">
            Виртуальные монеты 🪙, без вывода.
          </div>
        </div>

        <div class="cfCard">
          <div class="cfRow" style="justify-content:space-between;align-items:center;">
            <div class="cfTitle" style="margin:0;">Ставка</div>
            <div class="cfChip" style="font-weight:950;">Баланс: <b>🪙 ${wallet.coins}</b></div>
          </div>

          <div class="cfChips">
            ${chips.map(v => `<button class="cfChip" data-bet="${v}">${v}</button>`).join("")}
            <button class="cfChip" data-bet="max">MAX</button>
          </div>

          <div class="cfBetRow">
            <button class="cfMiniBtn" id="betMinus">-</button>
            <input class="cfInput" id="bet" type="number" min="1" step="1"
              value="${coinState.seriesActive ? coinState.seriesBet : coinState.bet}"
              ${coinState.seriesActive ? "disabled" : ""}>
            <button class="cfMiniBtn" id="betPlus" ${coinState.seriesActive ? "disabled" : ""}>+</button>
          </div>

          <div class="cfRightHint">
            Если включена серия — ставка списывается 1 раз при первом броске,
            дальше ты можешь менять сторону и решать: продолжать или забрать.
          </div>

          <div class="cfRow" style="margin-top:12px;">
            <button class="cfBtnGhost" id="resetSeries" style="width:100%;">Сброс серии</button>
          </div>

          <div class="cfRow" style="margin-top:10px;">
            <button class="cfBtnGhost" id="bonusCoins" style="width:100%;">+1000 🪙</button>
          </div>
        </div>

      </div>
    </div>
  `;

  const coinEl = document.getElementById("coin3D");
  const msgEl = document.getElementById("coinMsg");
  let busy = false;

  function currentMult() {
    if (!coinState.seriesEnabled) return 1.94;
    return SERIES_MULTS[Math.min(coinState.seriesStep, SERIES_MULTS.length - 1)];
  }

  function clampBet() {
    const betInput = document.getElementById("bet");
    if (!betInput) return 50;
    let v = Math.floor(Number(betInput.value) || 0);
    if (v < 1) v = 1;
    if (v > wallet.coins) v = wallet.coins;
    betInput.value = String(v);
    return v;
  }

  // side pick — РАЗРЕШЕНО даже в серии (ты этого хотел)
  document.getElementById("pickHeads").onclick = async () => {
    await ensureAudio(); playClick();
    coinState.choice = "heads"; saveCoinState(); renderCoin();
  };
  document.getElementById("pickTails").onclick = async () => {
    await ensureAudio(); playClick();
    coinState.choice = "tails"; saveCoinState(); renderCoin();
  };

  document.getElementById("sfxSwitch").onclick = async () => {
    await ensureAudio(); playClick();
    coinState.sfx = !coinState.sfx; saveCoinState(); renderCoin();
  };

  document.getElementById("seriesSwitch").onclick = async () => {
    await ensureAudio(); playClick();
    if (coinState.seriesActive) {
      msgEl.textContent = "Нельзя менять “Серия” во время активной серии.";
      return;
    }
    coinState.seriesEnabled = !coinState.seriesEnabled;
    coinState.seriesStep = 0;
    saveCoinState();
    renderCoin();
  };

  // bet chips
  document.querySelectorAll(".cfChip[data-bet]").forEach((b) => {
    b.onclick = async () => {
      await ensureAudio(); playClick();
      if (coinState.seriesActive) return;
      const betInput = document.getElementById("bet");
      const val = b.dataset.bet;
      betInput.value = val === "max" ? String(wallet.coins) : String(val);
      coinState.bet = clampBet();
      saveCoinState();
      renderCoin();
    };
  });

  document.getElementById("betMinus")?.addEventListener("click", async () => {
    await ensureAudio(); playClick();
    if (coinState.seriesActive) return;
    const betInput = document.getElementById("bet");
    betInput.value = String((Number(betInput.value) || 1) - 10);
    coinState.bet = clampBet();
    saveCoinState();
  });
  document.getElementById("betPlus")?.addEventListener("click", async () => {
    await ensureAudio(); playClick();
    if (coinState.seriesActive) return;
    const betInput = document.getElementById("bet");
    betInput.value = String((Number(betInput.value) || 1) + 10);
    coinState.bet = clampBet();
    saveCoinState();
  });

  document.getElementById("resetSeries").onclick = async () => {
    await ensureAudio(); playClick();
    coinState.seriesActive = false;
    coinState.seriesStep = 0;
    saveCoinState();
    renderCoin();
  };

  document.getElementById("bonusCoins").onclick = async () => {
    await ensureAudio(); playClick();
    addCoins(1000);
    renderCoin();
  };

  function cashOut() {
    if (!coinState.seriesActive) return;
    const m = currentMult();
    const payout = Math.floor(coinState.seriesBet * m);
    addCoins(payout);
    if (coinState.sfx) playWin();
    msgEl.textContent = `💰 Забрал: +${payout} 🪙 (x${m.toFixed(2)})`;
    coinState.seriesActive = false;
    coinState.seriesStep = 0;
    saveCoinState();
    renderCoin();
  }
  document.getElementById("coinCash").onclick = async () => {
    await ensureAudio(); playClick();
    cashOut();
  };

  async function throwCoin() {
    if (busy) return;
    busy = true;
    await ensureAudio();

    // ставка
    let bet;
    if (coinState.seriesActive) {
      bet = coinState.seriesBet;
    } else {
      bet = clampBet();
      if (bet <= 0) { busy = false; return; }
      if (bet > wallet.coins) { msgEl.textContent = "Недостаточно монет"; busy = false; return; }

      // старт серии: списываем 1 раз
      if (coinState.seriesEnabled) {
        coinState.seriesActive = true;
        coinState.seriesBet = bet;
        coinState.seriesStep = 0;
      } else {
        // не серия — ставка списывается каждый раз
        addCoins(-bet);
      }
    }

    // если серия включена и это первый бросок серии — списать ставку сейчас
    if (coinState.seriesEnabled && coinState.seriesActive && coinState.seriesStep === 0) {
      if (bet > wallet.coins) { msgEl.textContent = "Недостаточно монет"; busy = false; return; }
      addCoins(-bet);
    }

    // анимация
    msgEl.textContent = "Монета в воздухе…";
    if (coinState.sfx) sfxCoinStart();

    // “пустая” до приземления
    coinEl.classList.add("coinBlank");

    const rz = (Math.random() * 420 + 380) | 0;
    const rx = (Math.random() * 900 + 1300) | 0;
    coinEl.style.setProperty("--rz", `${rz}deg`);
    coinEl.style.setProperty("--rx", `${rx}deg`);

    coinEl.classList.remove("coinAnim");
    void coinEl.offsetWidth;
    coinEl.classList.add("coinAnim");

    const result = randFloat() < 0.5 ? "heads" : "tails";
    setTimeout(() => { if (coinState.sfx) sfxCoinImpact(); }, 850);

    await new Promise(r => setTimeout(r, 1050));

    // фикс стороны
    coinEl.classList.remove("coinBlank");
    coinEl.style.transform = result === "heads" ? "rotateY(0deg)" : "rotateY(180deg)";

    const won = (coinState.choice === result);
    const m = currentMult();

    if (won) {
      const payout = Math.floor(bet * m);
      addCoins(payout);
      if (coinState.sfx) playWin();
      msgEl.textContent = `✅ Выпало ${result === "heads" ? "ОРЁЛ" : "РЕШКА"} · +${payout} 🪙 (x${m.toFixed(2)})`;

      if (coinState.seriesEnabled && coinState.seriesActive) {
        coinState.seriesStep = Math.min(coinState.seriesStep + 1, SERIES_MULTS.length - 1);
      } else {
        // не серия — всё ок
      }
    } else {
      if (coinState.sfx) playLose();
      msgEl.textContent = `❌ Выпало ${result === "heads" ? "ОРЁЛ" : "РЕШКА"} · -${bet} 🪙`;

      // серия: проигрыш = сброс (ставка уже списана)
      if (coinState.seriesEnabled) {
        coinState.seriesActive = false;
        coinState.seriesStep = 0;
      }
    }

    saveCoinState();
    busy = false;
    renderCoin();
  }

  document.getElementById("coinThrow").onclick = throwCoin;
}

// coinflip styles
if (!document.getElementById("coinflip-style")) {
  const st = document.createElement("style");
  st.id = "coinflip-style";
  st.textContent = `
  .cfWrap{display:grid;gap:12px;}
  .cfGrid{display:grid;grid-template-columns:1.15fr .85fr;gap:12px;align-items:start;}
  @media (max-width: 520px){ .cfGrid{grid-template-columns:1fr;} }

  .cfCard{border-radius:18px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);
    box-shadow:0 12px 40px rgba(0,0,0,.22);padding:12px;}
  .cfTitle{font-weight:900;font-size:15px;margin-bottom:4px;}
  .cfSub{opacity:.78;font-size:12px;line-height:1.25;}
  .cfRow{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
  .cfPill{padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.10);
    background:rgba(255,255,255,.05);font-weight:800;font-size:12px;cursor:pointer;color:#e8eefc;}
  .cfPill.active{outline:2px solid rgba(76,133,255,.85);background:rgba(76,133,255,.14);}
  .cfToggle{display:flex;align-items:center;gap:8px;}
  .cfSwitch{width:44px;height:26px;border-radius:999px;border:1px solid rgba(255,255,255,.12);
    background:rgba(255,255,255,.06);position:relative;cursor:pointer;}
  .cfSwitch::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;
    background:rgba(255,255,255,.86);transition:transform .18s ease;}
  .cfSwitch.on{background:rgba(76,133,255,.18);border-color:rgba(76,133,255,.28);}
  .cfSwitch.on::after{transform:translateX(18px);background:#fff;}

  .coinStage{
    height:190px;border-radius:18px;
    background: radial-gradient(120px 120px at 50% 40%, rgba(255,255,255,.07), rgba(0,0,0,0)),
      linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02));
    border:1px solid rgba(255,255,255,.08);
    display:grid;place-items:center;
    perspective:900px;
    position:relative;overflow:hidden;
  }
  .coinShadow{
    position:absolute;bottom:28px;width:110px;height:22px;border-radius:50%;
    background:rgba(0,0,0,.35);filter:blur(10px);
    transform:scale(.75);opacity:.55;
  }
  .coin3D{
    width:108px;height:108px;position:relative;
    transform-style:preserve-3d;border-radius:50%;
    will-change:transform;
  }
  .coin3D .face{
    position:absolute;inset:0;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    font-weight:950;letter-spacing:.6px;text-transform:uppercase;
    backface-visibility:hidden;
    border:1px solid rgba(255,255,255,.18);
    box-shadow:0 14px 36px rgba(0,0,0,.35), 0 0 0 2px rgba(0,0,0,.12) inset;
  }
  .coin3D .front{
    transform:translateZ(7px);
    background: radial-gradient(circle at 30% 25%, rgba(255,255,255,.20), rgba(255,255,255,0) 55%),
      linear-gradient(145deg, rgba(255,210,95,.95), rgba(180,120,20,.95));
  }
  .coin3D .back{
    transform:rotateY(180deg) translateZ(7px);
    background: radial-gradient(circle at 30% 25%, rgba(255,255,255,.20), rgba(255,255,255,0) 55%),
      linear-gradient(145deg, rgba(220,240,255,.9), rgba(90,140,190,.95));
  }
  .coin3D .rim{
    position:absolute;inset:-2px;border-radius:50%;
    background:conic-gradient(from 0deg,
      rgba(255,255,255,.18), rgba(0,0,0,.08),
      rgba(255,255,255,.16), rgba(0,0,0,.10),
      rgba(255,255,255,.18));
    opacity:.55;
  }
  .coinBlank .front .label, .coinBlank .back .label{opacity:0;}
  .label{
    font-size:14px;padding:8px 12px;border-radius:14px;
    background:rgba(0,0,0,.16);
    border:1px solid rgba(255,255,255,.18);
    text-shadow:0 2px 12px rgba(0,0,0,.35);
  }

  .coinAnim{
    --rz: 540deg;
    --rx: 1440deg;
    animation: coinThrow 1.05s cubic-bezier(.18,.8,.18,1) both;
  }
  @keyframes coinThrow{
    0%{transform:translateY(22px) rotateX(0deg) rotateZ(0deg) scale(.98);}
    18%{transform:translateY(-50px) rotateX(calc




