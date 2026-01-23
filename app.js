// =====================================================
// Rocket Crash — ONLY MODE (никаких других режимов)
// =====================================================

// --- RNG (честный) ---
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function sampleCrashPoint() {
  // длинный хвост (как демо), режем верх чтобы UI не улетал
  const r = randFloat();
  const raw = 1 / (1 - r);
  return Math.max(1.05, Math.min(raw, 50));
}

// --- Telegram ---
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// --- Elements ---
const userEl = document.getElementById("user");
const balancePill = document.getElementById("balancePill");
const soundBtn = document.getElementById("soundBtn");
const screenEl = document.getElementById("screen");

// --- Virtual coins ---
const WALLET_KEY = "wallet_crash_only_v1";
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
  renderTop();
}
function addCoins(d) { setCoins(wallet.coins + d); }

function renderTop() {
  const user = tg?.initDataUnsafe?.user;
  userEl.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
  balancePill.textContent = `🪙 ${wallet.coins}`;
}
renderTop();

// --- Sound toggle (UI only) ---
let soundOn = true;
soundBtn.onclick = () => {
  soundOn = !soundOn;
  soundBtn.textContent = soundOn ? "🔊" : "🔇";
};

// --- Render Crash UI into #screen ---
function renderCrashUI() {
  screenEl.innerHTML = `
    <div class="card">
      <div class="layout">
        <section>
          <div class="hud">
            <div class="hudBox">
              <div class="hudLabel">Множитель</div>
              <div class="hudValue" id="mult">x1.00</div>
              <div class="hudSub" id="hint">Ожидание — старт скоро</div>
            </div>

            <div class="hudBox">
              <div class="hudLabel">Раунд</div>
              <div class="hudValue" id="roundStatus">Ожидание</div>
              <div class="hudSub" id="countdown">Старт через 5с</div>
            </div>

            <div class="hudBox">
              <div class="hudLabel">Твоя ставка</div>
              <div class="hudValue" id="myBet">—</div>
              <div class="hudSub" id="myState">не в раунде</div>
            </div>
          </div>

          <div class="stageWrap">
            <div class="stage">
              <div class="sky">
                <div class="stars"></div>
                <div class="aurora"></div>
              </div>

              <div class="rocketWrap" id="rocketWrap">
                <svg class="rocket" viewBox="0 0 160 240" aria-hidden="true">
                  <defs>
                    <linearGradient id="bodyG" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stop-color="#f2f6ff"/>
                      <stop offset="1" stop-color="#c9d6f6"/>
                    </linearGradient>
                    <linearGradient id="shadowG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stop-color="rgba(0,0,0,0.12)"/>
                      <stop offset="1" stop-color="rgba(0,0,0,0.35)"/>
                    </linearGradient>
                    <radialGradient id="flameG" cx="50%" cy="30%" r="70%">
                      <stop offset="0" stop-color="#fff2a8"/>
                      <stop offset="0.45" stop-color="#ff9f3b"/>
                      <stop offset="1" stop-color="#ff3b3b"/>
                    </radialGradient>
                  </defs>

                  <ellipse cx="80" cy="222" rx="38" ry="10" fill="rgba(0,0,0,.35)"/>

                  <path d="M80 18
                           C62 40,52 64,52 94
                           V166
                           C52 190,64 206,80 206
                           C96 206,108 190,108 166
                           V94
                           C108 64,98 40,80 18Z"
                        fill="url(#bodyG)" stroke="rgba(255,255,255,.35)" stroke-width="2"/>

                  <path d="M80 18
                           C70 34,64 52,64 74
                           V170
                           C64 186,70 198,80 206
                           C90 198,96 186,96 170
                           V74
                           C96 52,90 34,80 18Z"
                        fill="url(#shadowG)" opacity="0.55"/>

                  <circle cx="80" cy="98" r="16" fill="#0b1a3b" stroke="rgba(255,255,255,.35)" stroke-width="3"/>
                  <circle cx="76" cy="94" r="6" fill="rgba(255,255,255,.35)"/>

                  <path d="M80 18
                           C70 32,64 46,62 62
                           C72 58,88 58,98 62
                           C96 46,90 32,80 18Z"
                        fill="#e9efff" opacity="0.95"/>

                  <path d="M52 138 L26 168 L52 168 Z" fill="#6da3ff" opacity="0.95"/>
                  <path d="M108 138 L134 168 L108 168 Z" fill="#6da3ff" opacity="0.95"/>

                  <path d="M64 198 C64 184,96 184,96 198
                           C96 212,64 212,64 198Z"
                        fill="#2a3558" opacity="0.95"/>

                  <path d="M80 212
                           C70 226,72 238,80 238
                           C88 238,90 226,80 212Z"
                        fill="url(#flameG)" opacity="0.95"/>
                </svg>

                <div class="trail" id="trail"></div>
              </div>

              <div class="ground">
                <div class="ridge"></div>
                <div class="village">
                  <div class="yurt y1"></div>
                  <div class="yurt y2"></div>
                  <div class="fire f1"></div>
                  <div class="fire f2"></div>
                  <div class="people p1"></div>
                  <div class="people p2"></div>
                </div>
              </div>
            </div>

            <div class="stageBottom">
              <button class="pillBtn" id="rngBtn">Краш-поинт скрыт (честный RNG)</button>
            </div>
          </div>
        </section>

        <aside class="betCard">
          <div class="betTop">
            <div class="betTitle">Ставка</div>
            <button class="chip ghost" id="bonusBtn">+1000 🪙</button>
          </div>

          <div class="chips">
            <button class="chip" data-bet="10">10</button>
            <button class="chip" data-bet="50">50</button>
            <button class="chip" data-bet="100">100</button>
            <button class="chip" data-bet="250">250</button>
            <button class="chip" data-bet="500">500</button>
            <button class="chip" data-bet="max">MAX</button>
          </div>

          <div class="inputRow">
            <button class="btnSmall" id="betMinus">-</button>
            <input class="betInput" id="betInput" type="number" min="1" step="1" value="50" />
            <button class="btnSmall" id="betPlus">+</button>
          </div>

          <div class="actions">
            <button class="btn primary" id="joinBtn">Войти в раунд</button>
            <button class="btn danger" id="cashBtn" disabled>Забрать</button>
          </div>

          <div class="betHelp">
            Войти можно только до старта (ожидание). В полёте можно забрать в любой момент.
            <div class="muted" style="margin-top:6px;">Монеты виртуальные, без вывода.</div>
          </div>
        </aside>
      </div>
    </div>
  `;
}
renderCrashUI();

// --- Grab UI refs after render ---
const multEl = document.getElementById("mult");
const hintEl = document.getElementById("hint");
const roundStatusEl = document.getElementById("roundStatus");
const countdownEl = document.getElementById("countdown");
const myBetEl = document.getElementById("myBet");
const myStateEl = document.getElementById("myState");

const rocketWrap = document.getElementById("rocketWrap");
const trail = document.getElementById("trail");

const betInput = document.getElementById("betInput");
const joinBtn = document.getElementById("joinBtn");
const cashBtn = document.getElementById("cashBtn");
const bonusBtn = document.getElementById("bonusBtn");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");
const rngBtn = document.getElementById("rngBtn");

// --- Bet helpers ---
function clampBet() {
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  return v;
}

document.querySelectorAll(".chip[data-bet]").forEach((b) => {
  b.onclick = () => {
    const val = b.dataset.bet;
    if (val === "max") betInput.value = String(wallet.coins || 1);
    else betInput.value = String(val);
    clampBet();
  };
});
betMinus.onclick = () => { betInput.value = String((Number(betInput.value) || 1) - 10); clampBet(); };
betPlus.onclick = () => { betInput.value = String((Number(betInput.value) || 1) + 10); clampBet(); };
betInput.oninput = clampBet;
bonusBtn.onclick = () => addCoins(1000);

// --- Crash engine ---
const ROUND = { WAIT:"wait", COUNTDOWN:"countdown", FLY:"fly", CRASHED:"crashed" };

let debugReveal = false;

let state = {
  phase: ROUND.WAIT,
  mult: 1.0,
  crashPoint: sampleCrashPoint(),
  countdown: 5,

  inRound: false,
  bet: 0,
  cashed: false,
  cashMult: 0,

  startTs: 0,
  timer: null,
};

rngBtn.onclick = () => {
  debugReveal = !debugReveal;
  rngBtn.textContent = debugReveal
    ? `Краш-поинт (тест): x${state.crashPoint.toFixed(2)}`
    : "Краш-поинт скрыт (честный RNG)";
};

function setRocketByMult(mult) {
  // 1..20 => 0..-240px
  const capped = Math.min(mult, 20);
  const y = -(capped - 1) * 13;
  rocketWrap.style.transform = `translateX(-50%) translateY(${y}px)`;
  trail.style.opacity = (state.phase === ROUND.FLY) ? "1" : "0";
}

function renderHUD() {
  multEl.textContent = `x${state.mult.toFixed(2)}`;

  if (state.phase === ROUND.WAIT) {
    roundStatusEl.textContent = "Ожидание";
    countdownEl.textContent = `Старт через ${state.countdown}s`;
    hintEl.textContent = "Ожидание — старт скоро";
  }
  if (state.phase === ROUND.COUNTDOWN) {
    roundStatusEl.textContent = "Раунд";
    countdownEl.textContent = `Старт через ${state.countdown}s`;
    hintEl.textContent = "Можно войти в раунд";
  }
  if (state.phase === ROUND.FLY) {
    roundStatusEl.textContent = "Раунд";
    countdownEl.textContent = "В полёте";
    hintEl.textContent = "Жми “Забрать” в любой момент";
  }
  if (state.phase === ROUND.CRASHED) {
    roundStatusEl.textContent = "Раунд";
    countdownEl.textContent = "Краш";
    hintEl.textContent = "Новый раунд скоро";
  }

  myBetEl.textContent = state.inRound ? `${state.bet} 🪙` : "—";
  if (!state.inRound) myStateEl.textContent = "не в раунде";
  else if (state.cashed) myStateEl.textContent = `забрал на x${state.cashMult.toFixed(2)}`;
  else if (state.phase === ROUND.CRASHED) myStateEl.textContent = "не успел";
  else myStateEl.textContent = "в раунде";

  joinBtn.disabled = !(state.phase === ROUND.WAIT || state.phase === ROUND.COUNTDOWN);
  cashBtn.disabled = !(state.phase === ROUND.FLY && state.inRound && !state.cashed);
}

joinBtn.onclick = () => {
  const bet = clampBet();
  if (!(state.phase === ROUND.WAIT || state.phase === ROUND.COUNTDOWN)) {
    alert("Войти можно только до старта (в ожидании).");
    return;
  }
  if (state.inRound) { alert("Ты уже в раунде."); return; }
  if (bet > wallet.coins) { alert("Недостаточно монет."); return; }

  addCoins(-bet);
  state.inRound = true;
  state.bet = bet;
  state.cashed = false;
  state.cashMult = 0;
  renderHUD();
};

cashBtn.onclick = () => {
  if (!(state.phase === ROUND.FLY && state.inRound && !state.cashed)) return;
  state.cashed = true;
  state.cashMult = state.mult;
  const payout = Math.floor(state.bet * state.cashMult);
  addCoins(payout);
  renderHUD();
};

function resetRound() {
  state.phase = ROUND.WAIT;
  state.mult = 1.0;
  state.crashPoint = sampleCrashPoint();
  state.countdown = 5;

  state.inRound = false;
  state.bet = 0;
  state.cashed = false;
  state.cashMult = 0;

  rngBtn.textContent = debugReveal
    ? `Краш-поинт (тест): x${state.crashPoint.toFixed(2)}`
    : "Краш-поинт скрыт (честный RNG)";

  setRocketByMult(1.0);
  renderHUD();
}

function startCountdown() {
  state.phase = ROUND.COUNTDOWN;
  renderHUD();

  const tick = () => {
    state.countdown -= 1;
    if (state.countdown <= 0) {
      startFlight();
      return;
    }
    renderHUD();
    state.timer = setTimeout(tick, 1000);
  };
  state.timer = setTimeout(tick, 1000);
}

function startFlight() {
  state.phase = ROUND.FLY;
  state.startTs = performance.now();
  renderHUD();

  const step = () => {
    if (state.phase !== ROUND.FLY) return;

    const t = (performance.now() - state.startTs) / 1000;
    state.mult = 1 + t * 0.85 + t * t * 0.13;

    setRocketByMult(state.mult);
    renderHUD();

    if (state.mult >= state.crashPoint) {
      crashNow();
      return;
    }
    state.timer = requestAnimationFrame(step);
  };

  state.timer = requestAnimationFrame(step);
}

function crashNow() {
  state.phase = ROUND.CRASHED;
  renderHUD();

  setTimeout(() => {
    resetRound();
    setTimeout(() => startCountdown(), 900);
  }, 1600);
}

function boot() {
  resetRound();
  setTimeout(() => startCountdown(), 700);
}

boot();
