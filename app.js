// --- RNG (честный) ---
function randInt(n) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
}

// --- Telegram WebApp ---
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// --- Wallet ---
const WALLET_KEY = "mini_wallet_penalty_v1";
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

// --- Sound (лёгкий) ---
let soundOn = true;
function beep(freq = 520, ms = 60, vol = 0.03, type = "sine") {
  if (!soundOn) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, ms);
  } catch {}
}
function sfxGoal() { beep(720, 60, 0.03); beep(920, 70, 0.03); }
function sfxSave() { beep(220, 120, 0.035, "triangle"); beep(160, 140, 0.03, "sine"); }

// --- UI ---
const subTitle = document.getElementById("subTitle");
const balanceEl = document.getElementById("balance");
const balance2El = document.getElementById("balance2");

const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");
const betView = document.getElementById("betView");

const diffBtns = Array.from(document.querySelectorAll(".diffBtn"));
const diffView = document.getElementById("diffView");
const diffHint = document.getElementById("diffHint");

const ladderEl = document.getElementById("ladder");

const streakToggle = document.getElementById("streakToggle");
const streakView = document.getElementById("streakView");

const stepView = document.getElementById("stepView");
const xView = document.getElementById("xView");
const potView = document.getElementById("potView");

const stepBadge = document.getElementById("stepBadge");
const xBadge = document.getElementById("xBadge");

const shotBtn = document.getElementById("shotBtn");
const cashBtn = document.getElementById("cashBtn");
const resetBtn = document.getElementById("resetBtn");
const statusLine = document.getElementById("statusLine");
const cashView = document.getElementById("cashView");

const zonesEl = document.getElementById("zones");
const ballEl = document.getElementById("ball");
const goalieEl = document.getElementById("goalie");

// --- Multipliers ladders (фиксированные) ---
const LADDERS = {
  easy:   [1.10, 1.25, 1.45, 1.70, 2.05, 2.55, 3.25, 4.20, 5.60, 7.80, 11.0, 16.0],
  mid:    [1.15, 1.35, 1.60, 1.95, 2.40, 3.05, 3.95, 5.30, 7.40, 10.8, 16.5, 25.0],
  hard:   [1.20, 1.45, 1.78, 2.20, 2.80, 3.65, 4.90, 6.80, 9.80, 14.8, 23.0, 36.0],
  expert: [1.25, 1.55, 1.95, 2.50, 3.30, 4.45, 6.20, 9.10, 14.0, 22.5, 38.0, 65.0]
};
const DIFF_LABEL = { easy:"Низкий", mid:"Средний", hard:"Сложный", expert:"Эксперт" };

// --- state ---
let diff = "expert";
let betLocked = false;
let inRound = false;
let busy = false;

let baseBet = 100;     // ставка в начале серии
let step = 0;          // сколько голов подряд (шаг)
let currentX = 1.0;    // текущий множитель
let shotArmed = false; // нажата «Ставка», ждём клика по зоне

// goalie saved zones
let goalieA = 0;
let goalieB = 0;

// --- render top ---
function renderTop(){
  const user = tg?.initDataUnsafe?.user;
  subTitle.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
  balanceEl.textContent = String(wallet.coins);
  balance2El.textContent = String(wallet.coins);
}
renderTop();

// --- sound toggle ---
soundBtn.onclick = () => {
  soundOn = !soundOn;
  soundText.textContent = soundOn ? "Звук on" : "Звук off";
  const dot = soundBtn.querySelector(".dot");
  dot.style.background = soundOn ? "var(--good)" : "var(--bad)";
  dot.style.boxShadow = soundOn
    ? "0 0 0 3px rgba(38,212,123,.14)"
    : "0 0 0 3px rgba(255,90,106,.14)";
  beep(soundOn ? 640 : 240, 60, 0.03);
};

// --- bonus ---
bonusBtn.onclick = () => { addCoins(1000); beep(760, 70, 0.03); };

// --- bet helpers ---
function clampBet(){
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  betView.textContent = String(v);
  if (!betLocked) baseBet = v;
  renderSide();
}
betInput.addEventListener("input", clampBet);

betMinus.onclick = () => {
  betInput.value = String((Number(betInput.value)||1) - 10);
  clampBet();
};
betPlus.onclick = () => {
  betInput.value = String((Number(betInput.value)||1) + 10);
  clampBet();
};

document.querySelectorAll(".chip").forEach((b) => {
  b.onclick = () => {
    if (betLocked) return;
    const val = b.dataset.bet;
    betInput.value = (val === "max") ? String(wallet.coins) : String(val);
    clampBet();
    beep(540, 55, 0.02);
  };
});

// --- difficulty ---
function setDiff(v){
  if (betLocked) return; // в раунде нельзя менять
  diff = v;
  diffBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.diff === v));
  diffView.textContent = DIFF_LABEL[v];
  diffHint.textContent =
    v === "expert" ? "Эксперт: максимум сейвов. X самый высокий."
    : v === "hard" ? "Сложный: вратарь чаще угадывает. X высокий."
    : v === "mid" ? "Средний: баланс риска и X."
    : "Низкий: проще забивать. X ниже.";

  buildLadder();
  renderSide();
  beep(520, 50, 0.025);
}
diffBtns.forEach(b => b.onclick = () => setDiff(b.dataset.diff));

// --- ladder render ---
function fmtX(x){ return "x" + x.toFixed(2); }

function buildLadder(){
  ladderEl.innerHTML = "";
  const arr = LADDERS[diff];
  arr.forEach((x, i) => {
    const el = document.createElement("div");
    el.className = "step";
    el.innerHTML = `<div class="sTitle">Шаг ${i+1}</div><div class="sX">${fmtX(x)}</div>`;
    ladderEl.appendChild(el);
  });
  highlightStep();
}
function highlightStep(){
  const steps = Array.from(ladderEl.children);
  steps.forEach((el, i) => el.classList.toggle("active", (i+1) === step && step > 0));
}

// --- streak toggle ---
streakToggle.onchange = () => {
  streakView.textContent = streakToggle.checked ? "ON" : "OFF";
  beep(520, 50, 0.02);
};

// --- zones build (15) ---
function buildZones(){
  zonesEl.innerHTML = "";
  for (let i=0; i<15; i++){
    const z = document.createElement("div");
    z.className = "zone";
    z.dataset.idx = String(i);
    z.onclick = () => onZoneClick(i, z);
    zonesEl.appendChild(z);
  }
}
buildZones();

// --- round controls ---
function setStatus(t){ statusLine.textContent = t; }

function renderSide(){
  stepView.textContent = String(step);
  xView.textContent = fmtX(currentX);
  potView.textContent = String(Math.floor(baseBet * currentX));

  stepBadge.textContent = String(step);
  xBadge.textContent = fmtX(currentX);

  betView.textContent = String(Math.floor(Number(betInput.value) || 0));
  cashView.textContent = (step > 0) ? `${Math.floor(baseBet * currentX)} 🪙` : "—";
}

function resetVisualZones(){
  Array.from(zonesEl.children).forEach(z => {
    z.classList.remove("hitGoal","hitSave","disabled");
  });
}

function lockBetUI(lock){
  betLocked = lock;
  betInput.disabled = lock;
  betMinus.disabled = lock;
  betPlus.disabled = lock;
  document.querySelectorAll(".chip").forEach(c => c.disabled = lock);

  diffBtns.forEach(b => b.disabled = lock);

  if (lock) betInput.classList.add("locked");
  else betInput.classList.remove("locked");
}

// goalie picks 2 zones (neighbor-ish) with bias by difficulty
function pickGoalieZones(){
  // base target zone (0..14)
  const base = randInt(15);

  // choose neighbor set
  const neighbors = [];
  const r = Math.floor(base / 5);
  const c = base % 5;

  function push(rc){
    const [rr, cc] = rc;
    if (rr >= 0 && rr < 3 && cc >= 0 && cc < 5) neighbors.push(rr*5+cc);
  }

  push([r,c]);
  push([r, c-1]);
  push([r, c+1]);
  push([r-1, c]);
  push([r+1, c]);

  // difficulty affects how “central” the pair is (expert: чаще близкие)
  const pool = neighbors.length ? neighbors : [base];

  goalieA = pool[randInt(pool.length)];
  // second zone different
  do { goalieB = pool[randInt(pool.length)]; } while (goalieB === goalieA);

  // small extra “smartness” on expert: иногда смещаем вторую в сторону
  if (diff === "expert" && randInt(100) < 35){
    const alt = (goalieA + (randInt(2)? 1 : -1));
    if (alt >= 0 && alt < 15) goalieB = alt;
  }
}

function goaliePoseFor(idx){
  const c = idx % 5;
  if (c <= 1) return "save-left";
  if (c >= 3) return "save-right";
  return "save-mid";
}

function setGoaliePose(pose){
  goalieEl.classList.remove("save-left","save-right","save-mid");
  if (pose) goalieEl.classList.add(pose);
}

// animate ball to zone center
function flyBallTo(zoneEl){
  return new Promise((resolve) => {
    const zRect = zoneEl.getBoundingClientRect();
    const fRect = document.querySelector(".field").getBoundingClientRect();

    const zx = (zRect.left + zRect.width/2) - fRect.left;
    const zy = (zRect.top + zRect.height/2) - fRect.top;

    // ball start is its current (centered)
    ballEl.style.opacity = "1";
    ballEl.style.transform = `translate(${0}px, ${0}px) translateX(-50%)`;

    // compute delta from start position
    const startX = fRect.width/2;
    const startY = parseFloat(getComputedStyle(ballEl).top);

    const dx = zx - startX;
    const dy = zy - startY;

    // animate using WAAPI if possible (smooth)
    const anim = ballEl.animate([
      { transform: `translateX(-50%) translate(${0}px, ${0}px) scale(1)`, opacity: 1 },
      { transform: `translateX(-50%) translate(${dx}px, ${dy}px) scale(0.86)`, opacity: 1 }
    ], {
      duration: 380,
      easing: "cubic-bezier(.2,.85,.2,1)",
      fill: "forwards"
    });

    anim.onfinish = () => {
      setTimeout(() => {
        ballEl.style.opacity = "0";
        ballEl.getAnimations().forEach(a => a.cancel());
        resolve();
      }, 120);
    };
  });
}

// --- main actions ---
function startStake(){
  if (busy) return;
  clampBet();
  const bet = Math.floor(Number(betInput.value) || 0);
  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");

  // списываем 1 раз
  baseBet = bet;
  addCoins(-bet);

  step = 0;
  currentX = 1.0;
  inRound = true;
  shotArmed = true;

  lockBetUI(true);
  resetVisualZones();
  buildLadder();
  highlightStep();

  shotBtn.disabled = true; // уже поставили
  cashBtn.disabled = true;
  setStatus("Ставка принята. Выбирай зону удара (клик по воротам).");
  renderSide();

  // pick new goalie zones per shot AFTER each goal; first pick now
  pickGoalieZones();
  setGoaliePose(""); // neutral
  beep(620, 55, 0.02);
}

async function onZoneClick(idx, el){
  if (!inRound || !shotArmed || busy) return;

  busy = true;

  // disable zones during flight
  Array.from(zonesEl.children).forEach(z => z.classList.add("disabled"));

  // goalie pose according to his predicted side (based on closest saved zone to shot)
  const closest = Math.abs(idx - goalieA) <= Math.abs(idx - goalieB) ? goalieA : goalieB;
  setGoaliePose(goaliePoseFor(closest));

  await flyBallTo(el);

  const saved = (idx === goalieA || idx === goalieB);

  if (saved){
    el.classList.add("hitSave");
    sfxSave();
    setStatus("Сейв! Серия проиграна. Ставка сгорела.");
    endRound(false);
  } else {
    el.classList.add("hitGoal");
    sfxGoal();
    onGoal();
  }

  busy = false;
}

function onGoal(){
  // increment step depending on streak toggle
  if (streakToggle.checked) step += 1;
  else step = 1; // если серия OFF — всегда шаг=1

  const arr = LADDERS[diff];
  const capped = Math.min(step, arr.length);
  currentX = arr[capped - 1];

  highlightStep();
  renderSide();

  cashBtn.disabled = step <= 0;
  setStatus(`ГОЛ! Шаг ${step}. Можно продолжать или забрать ${Math.floor(baseBet * currentX)} 🪙.`);

  // next shot: goalie chooses new zones
  pickGoalieZones();
  setGoaliePose("");

  // enable zones again
  Array.from(zonesEl.children).forEach(z => z.classList.remove("disabled"));
}

function endRound(){
  inRound = false;
  shotArmed = false;

  lockBetUI(false);

  shotBtn.disabled = false;
  cashBtn.disabled = true;

  // reset goalie pose
  setGoaliePose("");

  // enable zones
  Array.from(zonesEl.children).forEach(z => z.classList.remove("disabled"));

  // reset labels for next
  stepBadge.textContent = String(step);
  xBadge.textContent = fmtX(currentX);
  renderSide();
}

function cashout(){
  if (!inRound || busy) return;
  if (step <= 0) return;

  const payout = Math.floor(baseBet * currentX);
  addCoins(payout);

  setStatus(`Кэшаут: +${payout} 🪙 (ставка ${baseBet} × ${fmtX(currentX)}).`);
  beep(760, 65, 0.03);
  beep(920, 65, 0.03);

  // finish
  endRound(true);
  // prepare fresh state
  step = 0;
  currentX = 1.0;
  highlightStep();
  renderSide();
}

function resetAll(){
  if (busy) return;

  // если раунд активен и ставка уже списана — сброс НЕ возвращает ставку (как в твоей версии Penalty)
  // (логика: бесконечные удары до сейва/кэшаута; reset — просто вернуть интерфейс)
  inRound = false;
  shotArmed = false;

  lockBetUI(false);
  resetVisualZones();
  setGoaliePose("");

  step = 0;
  currentX = 1.0;

  shotBtn.disabled = false;
  cashBtn.disabled = true;

  setStatus("Готово. Нажми «Ставка», чтобы начать.");
  buildLadder();
  renderSide();
}

// buttons
shotBtn.onclick = startStake;
cashBtn.onclick = cashout;
resetBtn.onclick = resetAll;

// init
function init(){
  setDiff(diff);
  clampBet();
  buildLadder();
  renderSide();
  setStatus("Готово. Нажми «Ставка», чтобы начать.");
  streakView.textContent = streakToggle.checked ? "ON" : "OFF";
  diffView.textContent = DIFF_LABEL[diff];
}
init();
