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
if (tg) {
  tg.ready();
  tg.expand();
}

const screenEl = document.getElementById("screen");
const userEl = document.getElementById("user");
const balancePill = document.getElementById("balancePill");
const user = tg?.initDataUnsafe?.user;

// ===============================
// Wallet (local)
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
  balancePill.textContent = `🪙 ${coins}`;
}
renderTopBar();

// ===============================
// Audio (modern synth) + unlock
// ===============================
let _audioCtx = null;
function getAudio() {
  if (_audioCtx) return _audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  _audioCtx = Ctx ? new Ctx() : null;
  return _audioCtx;
}
let __audioUnlocked = false;
function unlockAudioOnce() {
  if (__audioUnlocked) return;
  const ctx = getAudio();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  __audioUnlocked = true;
}
window.addEventListener("pointerdown", unlockAudioOnce, { once: true });
window.addEventListener("touchstart", unlockAudioOnce, { once: true });

function playTone({ type="sine", f=440, t=0.08, g=0.07, when=0, detune=0 }) {
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
  o.stop(now + t + 0.02);
}
function playNoise({ t=0.10, g=0.03, when=0, hp=900 }) {
  const ctx = getAudio();
  if (!ctx) return;
  const now = ctx.currentTime + when;

  const bufferSize = Math.floor(ctx.sampleRate * t);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

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

function sfxTap() {
  unlockAudioOnce();
  playTone({ type:"triangle", f:420, t:0.05, g:0.04, when:0 });
}
function sfxCoinStart() {
  unlockAudioOnce();
  playNoise({ t:0.12, g:0.025, hp:1200, when:0 });
  playTone({ type:"triangle", f:420, t:0.11, g:0.03, when:0.01 });
  playTone({ type:"triangle", f:320, t:0.11, g:0.02, when:0.02 });
}
function sfxCoinImpact() {
  unlockAudioOnce();
  playTone({ type:"sine", f:980, t:0.06, g:0.05, when:0 });
  playTone({ type:"sine", f:1560, t:0.05, g:0.03, when:0.01 });
  playNoise({ t:0.06, g:0.015, hp:2500, when:0.005 });
}
function sfxWin() {
  unlockAudioOnce();
  playTone({ type:"sine", f:740, t:0.10, g:0.05, when:0 });
  playTone({ type:"sine", f:932, t:0.12, g:0.045, when:0.05 });
  playTone({ type:"sine", f:1244, t:0.14, g:0.040, when:0.10 });
}
function sfxLose() {
  unlockAudioOnce();
  playTone({ type:"sine", f:220, t:0.16, g:0.06, when:0 });
  playTone({ type:"sine", f:165, t:0.18, g:0.05, when:0.06 });
}
function sfxRoll() {
  unlockAudioOnce();
  playNoise({ t:0.18, g:0.020, hp:900, when:0 });
  playTone({ type:"triangle", f:260, t:0.15, g:0.020, when:0.02 });
}
function sfxHit() {
  unlockAudioOnce();
  playTone({ type:"sine", f:620, t:0.06, g:0.04, when:0 });
  playNoise({ t:0.06, g:0.012, hp:2000, when:0 });
}

// ===============================
// Navigation
// ===============================
let currentScreen = "coin";
function setScreen(name) {
  currentScreen = name;
  document.querySelectorAll(".navBtn").forEach(b => {
    b.classList.toggle("active", b.dataset.screen === name);
  });
  if (name === "coin") renderCoin();
  else renderDice();
}
document.querySelectorAll(".nav button").forEach(btn => {
  btn.addEventListener("click", () => {
    sfxTap();
    setScreen(btn.dataset.screen);
  });
});

// ===============================
// COIN FLIP (purple in flight -> gold/silver result)
// ===============================
const COIN_MULTS = [1.94, 3.88, 7.76, 15.52];

let coinState = {
  choice: "heads",     // heads/tails
  bet: 50,
  sfx: true,
  series: true,
  step: 0,             // 0..3
  spinning: false,

  // skin of coin while idle/after throw:
  // "neutral" | "heads" | "tails"
  skin: "neutral",

  msg: "",
};

function coinCurrentMult() {
  if (!coinState.series) return 1.94;
  return COIN_MULTS[Math.min(coinState.step, COIN_MULTS.length - 1)];
}

function renderCoin() {
  // clamp bet
  coinState.bet = Math.max(1, Math.floor(coinState.bet || 1));
  if (coinState.bet > wallet.coins) coinState.bet = wallet.coins || 1;

  const mult = coinCurrentMult();
  const possibleWin = Math.floor(coinState.bet * mult);

  screenEl.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <h2 class="h1">Coin Flip</h2>
          <div class="p">Фиолетовая монета в полёте → после броска становится <b>золотой</b> (орёл) или <b>серебряной</b> (решка).</div>
        </div>
        <div class="spacer"></div>
        <div class="pill">Баланс: <b>🪙 ${wallet.coins}</b></div>
      </div>

      <div class="grid2">
        <div class="card" style="padding:12px;">
          <div class="coinStage">
            <div class="coinShadow" id="coinShadow"></div>
            <div class="coin3D skin-${coinState.skin}" id="coin3D">
              <div class="rim"></div>
              <div class="face front"><div class="label">ОРЁЛ</div></div>
              <div class="face back"><div class="label">РЕШКА</div></div>
            </div>
          </div>

          <div class="row" style="margin-top:10px;">
            <button class="chip ${coinState.choice==="heads"?"active":""}" id="pickH" ${coinState.spinning?"disabled":""}>🦅 Орёл</button>
            <button class="chip ${coinState.choice==="tails"?"active":""}" id="pickT" ${coinState.spinning?"disabled":""}>🌙 Решка</button>
            <div class="spacer"></div>
            <button class="chip ${coinState.sfx?"active":""}" id="togSfx">Звук</button>
            <button class="chip ${coinState.series?"active":""}" id="togSeries">Серия</button>
          </div>

          <div class="kpiGrid">
            <div class="kpi"><div class="t">Множитель</div><div class="v">x${mult.toFixed(2)}</div></div>
            <div class="kpi"><div class="t">Возможный выигрыш</div><div class="v">+${possibleWin} 🪙</div></div>
            <div class="kpi"><div class="t">Статус</div><div class="v">${coinState.spinning ? "В полёте…" : "Готов"}</div></div>
          </div>

          <div class="row" style="margin-top:10px; gap:10px;">
            <button class="btn" id="coinThrow" style="flex:1;" ${coinState.spinning?"disabled":""}>Бросить</button>
            <button class="btnGhost" id="coinCash" ${coinState.series && coinState.step>0 && !coinState.spinning ? "" : "disabled"}>Забрать</button>
          </div>

          <div class="msg ${coinState.msgClass||""}" id="coinMsg">${coinState.msg || ""}</div>
        </div>

        <div class="card" style="padding:12px;">
          <div class="row">
            <div style="font-weight:950;">Ставка</div>
            <div class="spacer"></div>
            <button class="btnGhost" id="bonus">+1000 🪙</button>
          </div>

          <div class="chips">
            ${[10,50,100,250,500].map(v => `<button class="chip" data-b="${v}">${v}</button>`).join("")}
            <button class="chip" data-b="max">MAX</button>
          </div>

          <div class="row" style="margin-top:10px;">
            <button class="miniBtn" id="m">-</button>
            <input class="input" id="bet" type="number" min="1" step="1" value="${coinState.bet}">
            <button class="miniBtn" id="p">+</button>
          </div>

          <div class="p" style="margin-top:10px;">
            Серия: при выигрыше шаг множителя растёт, при проигрыше сбрасывается. Сторону можно менять каждый бросок.
          </div>

          <div class="row" style="margin-top:10px; gap:8px;">
            ${COIN_MULTS.map((m, i) => `<span class="pill" style="${coinState.series && i===coinState.step ? "border-color:rgba(76,133,255,.55); background: rgba(76,133,255,.14);" : ""}">x${m.toFixed(2)}</span>`).join("")}
          </div>
        </div>
      </div>
    </div>
  `;

  const coinEl = document.getElementById("coin3D");
  const betEl = document.getElementById("bet");

  const clampBet = () => {
    let v = Math.floor(Number(betEl.value) || 0);
    if (v < 1) v = 1;
    if (v > wallet.coins) v = wallet.coins;
    betEl.value = String(v);
    coinState.bet = v;
  };
  clampBet();

  document.getElementById("pickH").onclick = () => { if (!coinState.spinning) { sfxTap(); coinState.choice="heads"; renderCoin(); } };
  document.getElementById("pickT").onclick = () => { if (!coinState.spinning) { sfxTap(); coinState.choice="tails"; renderCoin(); } };

  document.getElementById("togSfx").onclick = () => { unlockAudioOnce(); coinState.sfx = !coinState.sfx; sfxTap(); renderCoin(); };
  document.getElementById("togSeries").onclick = () => {
    if (coinState.spinning) return;
    sfxTap();
    coinState.series = !coinState.series;
    if (!coinState.series) coinState.step = 0;
    renderCoin();
  };

  document.querySelectorAll("[data-b]").forEach(b => {
    b.onclick = () => {
      sfxTap();
      const val = b.dataset.b;
      betEl.value = val === "max" ? String(wallet.coins) : String(val);
      clampBet();
      renderCoin();
    };
  });

  document.getElementById("m").onclick = () => { sfxTap(); betEl.value = String((Number(betEl.value)||1) - 10); clampBet(); renderCoin(); };
  document.getElementById("p").onclick = () => { sfxTap(); betEl.value = String((Number(betEl.value)||1) + 10); clampBet(); renderCoin(); };
  betEl.oninput = () => { clampBet(); renderCoin(); };

  document.getElementById("bonus").onclick = () => { sfxTap(); addCoins(1000); renderCoin(); };

  function cashOut() {
    if (!(coinState.series && coinState.step > 0)) return;
    const m = coinCurrentMult();
    const payout = Math.floor(coinState.bet * m);
    addCoins(payout);
    coinState.msg = `💰 Забрал: +${payout} 🪙 (x${m.toFixed(2)})`;
    coinState.msgClass = "ok";
    coinState.step = 0;
    renderCoin();
  }
  document.getElementById("coinCash").onclick = () => { if (coinState.sfx) sfxTap(); cashOut(); };

  async function throwCoin() {
    clampBet();
    const bet = coinState.bet;

    if (bet <= 0) return;
    if (bet > wallet.coins) {
      coinState.msg = "Недостаточно монет";
      coinState.msgClass = "bad";
      return renderCoin();
    }

    // списываем ставку
    addCoins(-bet);

    coinState.spinning = true;
    coinState.msg = "Монета в воздухе…";
    coinState.msgClass = "";
    // во время полёта монета ВСЕГДА фиолетовая
    coinState.skin = "neutral";

    renderCoin();

    const coin = document.getElementById("coin3D");

    // старт звук
    if (coinState.sfx) sfxCoinStart();

    // рандом вращения
    const rz = (Math.random() * 420 + 420) | 0;
    const rx = (Math.random() * 1000 + 1400) | 0;
    coin.style.setProperty("--rz", `${rz}deg`);
    coin.style.setProperty("--rx", `${rx}deg`);

    coin.classList.remove("coinAnim");
    void coin.offsetWidth;
    coin.classList.add("coinAnim");

    // честный результат
    const res = randFloat() < 0.5 ? "heads" : "tails";

    setTimeout(() => { if (coinState.sfx) sfxCoinImpact(); }, 860);

    await new Promise(r => setTimeout(r, 1100));

    // фиксируем положение (какая грань сверху)
    coin.style.transform = res === "heads" ? "rotateY(0deg)" : "rotateY(180deg)";

    // после приземления: монета становится золотой/серебряной
    coinState.skin = res === "heads" ? "heads" : "tails";

    const won = (coinState.choice === res);
    const mult = coinCurrentMult();

    if (won) {
      const payout = Math.floor(bet * mult);
      addCoins(payout);

      if (coinState.series) {
        coinState.step = Math.min(coinState.step + 1, COIN_MULTS.length - 1);
      }

      coinState.msg = `✅ Выпало ${res === "heads" ? "ОРЁЛ" : "РЕШКА"} · +${payout} 🪙 (x${mult.toFixed(2)})`;
      coinState.msgClass = "ok";
      if (coinState.sfx) sfxWin();
    } else {
      coinState.msg = `❌ Выпало ${res === "heads" ? "ОРЁЛ" : "РЕШКА"} · -${bet} 🪙`;
      coinState.msgClass = "bad";
      coinState.step = 0;
      if (coinState.sfx) sfxLose();
    }

    coinState.spinning = false;
    renderCoin();
  }

  document.getElementById("coinThrow").onclick = () => throwCoin();
}

// ===============================
// DICE (D6 cube + D20/D100 bar) + no-100% chance
// ===============================
let diceState = {
  sides: 6,        // 6/20/100
  mode: "below",   // below/above
  threshold: 3,
  bet: 50,
  rolling: false,
  lastRoll: null,
  msg: "",
  msgClass: "",
};

function diceClampThreshold(sides, mode, t) {
  t = Math.floor(Number(t) || 1);
  if (mode === "below") {
    t = Math.max(1, Math.min(sides - 1, t)); // запрет 100%
  } else {
    t = Math.max(2, Math.min(sides, t));     // запрет 100%
  }
  return t;
}
function diceChance(sides, mode, threshold) {
  threshold = diceClampThreshold(sides, mode, threshold);
  if (mode === "below") return threshold / sides;                 // <= threshold
  return (sides - threshold + 1) / sides;                         // >= threshold
}
function diceMultiplier(chance) {
  const edge = 0.98; // 2% edge
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
  diceState.threshold = diceClampThreshold(s, diceState.mode, diceState.threshold);

  // clamp bet
  diceState.bet = Math.max(1, Math.floor(Number(diceState.bet) || 1));
  if (diceState.bet > wallet.coins) diceState.bet = wallet.coins || 1;

  const chance = diceChance(s, diceState.mode, diceState.threshold);
  const mult = diceMultiplier(chance);
  const payout = Math.floor(diceState.bet * mult);

  const minT = diceState.mode === "below" ? 1 : 2;
  const maxT = diceState.mode === "below" ? (s - 1) : s;

  const winText = diceState.mode === "below"
    ? `Выигрыш, если выпало ≤ ${diceState.threshold}`
    : `Выигрыш, если выпало ≥ ${diceState.threshold}`;

  screenEl.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <h2 class="h1">Dice</h2>
          <div class="p">D6 — 3D куб. D20/D100 — понятная шкала с win-зоной и бегунком.</div>
        </div>
        <div class="spacer"></div>
        <div class="pill">Баланс: <b>🪙 ${wallet.coins}</b></div>
      </div>

      <div class="row" style="margin-top:10px;">
        <button class="chip ${s===6?"active":""}" data-s="6">D6</button>
        <button class="chip ${s===20?"active":""}" data-s="20">D20</button>
        <button class="chip ${s===100?"active":""}" data-s="100">D100</button>
        <div class="spacer"></div>
        <button class="chip ${diceState.mode==="below"?"active":""}" data-m="below">Меньше</button>
        <button class="chip ${diceState.mode==="above"?"active":""}" data-m="above">Больше</button>
      </div>

      <div class="kpiGrid">
        <div class="kpi"><div class="t">Множитель</div><div class="v">x${mult.toFixed(2)}</div></div>
        <div class="kpi"><div class="t">Возможный выигрыш</div><div class="v">+${payout} 🪙</div></div>
        <div class="kpi"><div class="t">Шанс</div><div class="v">${(chance*100).toFixed(1)}%</div></div>
      </div>

      <div style="margin-top:10px;">
        <div class="row" style="justify-content:space-between;">
          <div style="font-weight:950;">Порог: <b id="thLabel">${diceState.threshold}</b> из ${s}</div>
          <div class="pill">Шанс ${(chance*100).toFixed(1)}% · x${mult.toFixed(2)}</div>
        </div>
        <input id="threshold" class="range" type="range" min="${minT}" max="${maxT}" value="${diceState.threshold}">
        <div class="p">${winText}</div>
      </div>

      <div class="diceArena" id="diceArena">
        <div class="diceShadow" id="diceShadow"></div>

        ${
          s === 6
            ? `
              <div class="diceThrow">
                <div class="cube ${diceState.lastRoll ? "show-" + diceState.lastRoll : ""}" id="cube">
                  ${renderCubeFaceHTML(1)}
                  ${renderCubeFaceHTML(2)}
                  ${renderCubeFaceHTML(3)}
                  ${renderCubeFaceHTML(4)}
                  ${renderCubeFaceHTML(5)}
                  ${renderCubeFaceHTML(6)}
                </div>
              </div>
            `
            : `
              <div class="probRollNum" id="probRollNum">${diceState.lastRoll == null ? "00" : String(diceState.lastRoll).padStart(2,"0")}</div>
              <div class="probBar" id="probBar">
                <div class="probWinZone" id="probWinZone"></div>
                <div class="probMarker" id="probMarker" style="left: 0%"></div>
              </div>
              <div class="probHint">
                <div>1</div>
                <div id="probMid">Шанс ${(chance*100).toFixed(1)}% · x${mult.toFixed(2)}</div>
                <div>${s}</div>
              </div>
            `
        }
      </div>

      <div class="grid2" style="margin-top:12px;">
        <div class="card" style="padding:12px;">
          <div class="row">
            <div style="font-weight:950;">Ставка</div>
            <div class="spacer"></div>
            <div class="pill"><b id="betShow">${diceState.bet}</b> 🪙</div>
          </div>

          <div class="chips">
            ${[10,50,100,250,500].map(v => `<button class="chip" data-b="${v}">${v}</button>`).join("")}
            <button class="chip" data-b="max">MAX</button>
          </div>

          <div class="row" style="margin-top:10px;">
            <button class="miniBtn" id="bm">-</button>
            <input class="input" id="bet" type="number" min="1" step="1" value="${diceState.bet}">
            <button class="miniBtn" id="bp">+</button>
          </div>

          <div class="row" style="margin-top:10px; gap:10px;">
            <button class="btn" id="rollBtn" style="flex:1;" ${diceState.rolling?"disabled":""}>Бросить</button>
            <button class="btnGhost" id="bonus">+1000 🪙</button>
          </div>

          <div class="msg ${diceState.msgClass||""}" id="diceMsg">${diceState.msg || ""}</div>
        </div>

        <div class="card" style="padding:12px;">
          <div style="font-weight:950;">Пояснение</div>
          <div class="p" style="margin-top:8px;">
            <b>Важно:</b> мы запретили 100% шанс, чтобы нельзя было фармить баланс (например “6 из 6”).<br><br>
            В D20/D100 видно win-зону на шкале и куда “упал” бегунок.
          </div>
        </div>
      </div>
    </div>
  `;

  // handlers
  document.querySelectorAll("[data-s]").forEach(b => {
    b.onclick = () => {
      sfxTap();
      diceState.sides = Number(b.dataset.s);
      if (diceState.sides === 6) diceState.threshold = 3;
      if (diceState.sides === 20) diceState.threshold = 10;
      if (diceState.sides === 100) diceState.threshold = 50;
      diceState.lastRoll = null;
      diceState.msg = "";
      diceState.msgClass = "";
      renderDice();
    };
  });

  document.querySelectorAll("[data-m]").forEach(b => {
    b.onclick = () => {
      sfxTap();
      diceState.mode = b.dataset.m;
      diceState.threshold = diceClampThreshold(diceState.sides, diceState.mode, diceState.threshold);
      diceState.msg = "";
      diceState.msgClass = "";
      renderDice();
    };
  });

  const th = document.getElementById("threshold");
  th.oninput = () => {
    diceState.threshold = diceClampThreshold(diceState.sides, diceState.mode, th.value);
    document.getElementById("thLabel").textContent = String(diceState.threshold);
    diceState.msg = "";
    diceState.msgClass = "";
    renderDice();
  };

  const betEl = document.getElementById("bet");
  const betShow = document.getElementById("betShow");
  const clampBet = () => {
    let v = Math.floor(Number(betEl.value) || 0);
    if (v < 1) v = 1;
    if (v > wallet.coins) v = wallet.coins;
    betEl.value = String(v);
    betShow.textContent = String(v);
    diceState.bet = v;
  };
  clampBet();

  document.querySelectorAll("[data-b]").forEach(b => {
    b.onclick = () => {
      sfxTap();
      const val = b.dataset.b;
      betEl.value = val === "max" ? String(wallet.coins) : String(val);
      clampBet();
      renderDice();
    };
  });
  document.getElementById("bm").onclick = () => { sfxTap(); betEl.value = String((Number(betEl.value)||1) - 10); clampBet(); renderDice(); };
  document.getElementById("bp").onclick = () => { sfxTap(); betEl.value = String((Number(betEl.value)||1) + 10); clampBet(); renderDice(); };
  betEl.oninput = () => { clampBet(); renderDice(); };

  document.getElementById("bonus").onclick = () => { sfxTap(); addCoins(1000); renderDice(); };

  // roll logic
  async function rollDice() {
    clampBet();
    if (diceState.rolling) return;

    if (diceState.bet > wallet.coins) {
      diceState.msg = "Недостаточно монет";
      diceState.msgClass = "bad";
      return renderDice();
    }

    // списать ставку
    addCoins(-diceState.bet);

    diceState.rolling = true;
    diceState.msg = "";
    diceState.msgClass = "";
    renderDice();

    const s = diceState.sides;
    const threshold = diceClampThreshold(s, diceState.mode, diceState.threshold);

    // честный результат заранее
    const roll = randInt(1, s);
    const win = diceState.mode === "below" ? (roll <= threshold) : (roll >= threshold);

    // звук старта
    sfxRoll();

    if (s === 6) {
      const arena = document.getElementById("diceArena");
      const cube = document.getElementById("cube");

      arena.classList.add("throwing");

      setTimeout(() => {
        // в конце полёта фиксируем грань
        cube.className = "cube show-" + roll;
        sfxHit();
      }, 880);

      await new Promise(r => setTimeout(r, 1200));
      arena.classList.remove("throwing");
      finish(win, roll);
      return;
    }

    // D20/D100: шкала + бегунок + win-зона
    const marker = document.getElementById("probMarker");
    const zone = document.getElementById("probWinZone");
    const num = document.getElementById("probRollNum");
    const mid = document.getElementById("probMid");

    const chance = diceChance(s, diceState.mode, threshold);
    const mult = diceMultiplier(chance);

    const winFromPct = diceState.mode === "below" ? 0 : ((threshold - 1) / s) * 100;
    const winToPct   = diceState.mode === "below" ? (threshold / s) * 100 : 100;
    zone.style.left = `${winFromPct}%`;
    zone.style.width = `${Math.max(0, winToPct - winFromPct)}%`;

    const duration = 950;
    const startX = randFloat() * 100;
    const endX = ((roll - 0.5) / s) * 100;

    const t0 = performance.now();
    function tick() {
      const t = performance.now() - t0;
      const p = Math.min(1, t / duration);
      const ease = 1 - Math.pow(1 - p, 3);
      const wobble = (1 - p) * (Math.sin(p * 16) * 3);
      const x = startX + (endX - startX) * ease + wobble;

      marker.style.left = `${Math.max(0, Math.min(100, x))}%`;

      const fake = randInt(1, s);
      num.textContent = String(fake).padStart(2, "0");
      mid.textContent = `Шанс ${(chance*100).toFixed(1)}% · x${mult.toFixed(2)}`;

      if (p < 1) requestAnimationFrame(tick);
      else {
        num.textContent = String(roll).padStart(2, "0");
        sfxHit();
        finish(win, roll);
      }
    }
    requestAnimationFrame(tick);
  }

  function finish(win, roll) {
    const s = diceState.sides;
    const threshold = diceClampThreshold(s, diceState.mode, diceState.threshold);
    const chance = diceChance(s, diceState.mode, threshold);
    const mult = diceMultiplier(chance);
    const payout = Math.floor(diceState.bet * mult);

    if (win) {
      addCoins(payout);
      sfxWin();
      diceState.msg = `✅ Выпало ${roll}. Выигрыш +${payout} 🪙 (x${mult.toFixed(2)})`;
      diceState.msgClass = "ok";
    } else {
      sfxLose();
      diceState.msg = `❌ Выпало ${roll}. Проигрыш -${diceState.bet} 🪙`;
      diceState.msgClass = "bad";
    }

    diceState.lastRoll = roll;
    diceState.rolling = false;
    renderDice();
  }

  document.getElementById("rollBtn").onclick = () => rollDice();
}

// старт
setScreen("coin");

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




