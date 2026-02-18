// ===== Penalty FINAL (логика как у тебя: 15 зон, 2 зоны сейва, бесконечно до сейва/кэшаута) =====

// RNG (crypto)
function randInt(n){
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
}

// Telegram
const tg = window.Telegram?.WebApp;
if (tg){ tg.ready(); tg.expand(); }

// Wallet
const WALLET_KEY = "mini_wallet_penalty_final_v1";
function loadWallet(){
  try{
    const w = JSON.parse(localStorage.getItem(WALLET_KEY) || "null");
    if (w && typeof w.coins === "number") return w;
  }catch{}
  return { coins: 1000 };
}
function saveWallet(w){ localStorage.setItem(WALLET_KEY, JSON.stringify(w)); }
let wallet = loadWallet();

function setCoins(v){
  wallet.coins = Math.max(0, Math.floor(v));
  saveWallet(wallet);
  renderTop();
}
function addCoins(d){ setCoins(wallet.coins + d); }

// Sound (тихий, как у тебя)
let soundOn = true;
function beep(freq=520, ms=60, vol=0.03, type="sine"){
  if (!soundOn) return;
  try{
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
    setTimeout(()=>{ o.stop(); ctx.close(); }, ms);
  }catch{}
}
function sfxGoal(){ beep(720,60,0.028); beep(920,70,0.028); }
function sfxSave(){ beep(220,120,0.03,"triangle"); beep(160,140,0.028,"sine"); }

// UI refs
const balanceEl = document.getElementById("balance");
const bal2 = document.getElementById("bal2");

const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const soundDot = document.getElementById("soundDot");
const bonusBtn = document.getElementById("bonusBtn");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");
const betView = document.getElementById("betView");

const diffBtns = Array.from(document.querySelectorAll(".diffBtn"));
const diffHint = document.getElementById("diffHint");
const diffView = document.getElementById("diffView");

const ladderEl = document.getElementById("ladder");

const streakToggle = document.getElementById("streakToggle");
const streakView = document.getElementById("streakView");

const stepView = document.getElementById("stepView");
const xView = document.getElementById("xView");
const potView = document.getElementById("potView");

const stepBadge = document.getElementById("stepBadge");
const xBadge = document.getElementById("xBadge");

const stakeBtn = document.getElementById("stakeBtn");
const cashBtn = document.getElementById("cashBtn");
const resetBtn = document.getElementById("resetBtn");
const statusLine = document.getElementById("statusLine");
const cashView = document.getElementById("cashView");

const zonesEl = document.getElementById("zones");
const ballEl = document.getElementById("ball");
const goalieEl = document.getElementById("goalie");

// Ladders (фиксированные, “эксперт выше”)
const LADDERS = {
  easy:   [1.10, 1.25, 1.45, 1.70, 2.05, 2.55, 3.25, 4.20, 5.60, 7.80, 11.0, 16.0],
  mid:    [1.15, 1.35, 1.60, 1.95, 2.40, 3.05, 3.95, 5.30, 7.40, 10.8, 16.5, 25.0],
  hard:   [1.20, 1.45, 1.78, 2.20, 2.80, 3.65, 4.90, 6.80, 9.80, 14.8, 23.0, 36.0],
  expert: [1.25, 1.55, 1.95, 2.50, 3.30, 4.45, 6.20, 9.10, 14.0, 22.5, 38.0, 65.0]
};
const DIFF_LABEL = { easy:"Низкий", mid:"Средний", hard:"Сложный", expert:"Эксперт" };

function fmtX(x){ return "x" + x.toFixed(2); }

// State
let diff = "expert";
let betLocked = false;
let inRound = false;
let busy = false;

let baseBet = 100;     // ставка в начале серии
let step = 0;          // голов подряд
let currentX = 1.0;

let goalieA = 0;
let goalieB = 0;

// ===== render =====
function renderTop(){
  balanceEl.textContent = String(wallet.coins);
  bal2.textContent = String(wallet.coins);
}
renderTop();

function setStatus(t){ statusLine.textContent = t; }

function renderSide(){
  stepView.textContent = String(step);
  xView.textContent = fmtX(currentX);
  potView.textContent = String(Math.floor(baseBet * currentX));

  stepBadge.textContent = String(step);
  xBadge.textContent = fmtX(currentX);

  betView.textContent = String(Math.floor(Number(betInput.value)||0));
  cashView.textContent = step > 0 ? `${Math.floor(baseBet * currentX)} 🪙` : "—";
  streakView.textContent = streakToggle.checked ? "ON" : "OFF";
  diffView.textContent = DIFF_LABEL[diff];
}

// ===== sound toggle =====
soundBtn.onclick = () => {
  soundOn = !soundOn;
  soundText.textContent = soundOn ? "Звук on" : "Звук off";
  soundDot.style.background = soundOn ? "var(--good)" : "var(--bad)";
  soundDot.style.boxShadow = soundOn
    ? "0 0 0 3px rgba(38,212,123,.14)"
    : "0 0 0 3px rgba(255,90,106,.14)";
  beep(soundOn ? 640 : 240, 60, 0.028);
};

// bonus
bonusBtn.onclick = () => { addCoins(1000); beep(760, 70, 0.03); };

// ===== bet =====
function clampBet(){
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  if (!betLocked) baseBet = v;
  renderSide();
}
betInput.addEventListener("input", clampBet);

betMinus.onclick = () => { betInput.value = String((Number(betInput.value)||1) - 10); clampBet(); };
betPlus.onclick  = () => { betInput.value = String((Number(betInput.value)||1) + 10); clampBet(); };

document.querySelectorAll(".chip").forEach((b) => {
  b.onclick = () => {
    if (betLocked) return;
    const val = b.dataset.bet;
    betInput.value = (val === "max") ? String(wallet.coins) : String(val);
    clampBet();
    beep(540, 55, 0.02);
  };
});

function lockBetUI(lock){
  betLocked = lock;
  betInput.disabled = lock;
  betMinus.disabled = lock;
  betPlus.disabled = lock;
  document.querySelectorAll(".chip").forEach(c => c.disabled = lock);
  diffBtns.forEach(b => b.disabled = lock);
}

// ===== difficulty =====
function setDiff(v){
  if (betLocked) return;
  diff = v;
  diffBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.diff === v));
  diffHint.textContent =
    v === "expert" ? "Эксперт: вратарь агрессивнее, X самый высокий."
    : v === "hard" ? "Сложный: вратарь чаще угадывает. X высокий."
    : v === "mid" ? "Средний: баланс риска и X."
    : "Низкий: проще забивать. X ниже.";

  buildLadder();
  renderSide();
  beep(520, 50, 0.02);
}
diffBtns.forEach(b => b.onclick = () => setDiff(b.dataset.diff));

// ===== ladder =====
function buildLadder(){
  ladderEl.innerHTML = "";
  const arr = LADDERS[diff];
  arr.forEach((x, i) => {
    const el = document.createElement("div");
    el.className = "step";
    el.innerHTML = `<div class="t">Шаг ${i+1}</div><div class="x">${fmtX(x)}</div>`;
    ladderEl.appendChild(el);
  });
  highlightStep();
}
function highlightStep(){
  const items = Array.from(ladderEl.children);
  items.forEach((el, i) => el.classList.toggle("active", step > 0 && (i+1) === step));
}

// ===== zones build 15 =====
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

function resetZones(){
  Array.from(zonesEl.children).forEach(z=>{
    z.classList.remove("goalHit","saveHit","disabled");
  });
}

function disableZones(dis){
  Array.from(zonesEl.children).forEach(z=>{
    z.classList.toggle("disabled", dis);
  });
}

// ===== goalie: choose 2 save zones =====
function pickGoalieZones(){
  // База + соседи (чтобы было “человечно”)
  const base = randInt(15);
  const r = Math.floor(base / 5);
  const c = base % 5;

  const pool = [];
  const push = (rr,cc) => { if (rr>=0 && rr<3 && cc>=0 && cc<5) pool.push(rr*5+cc); };
  push(r,c); push(r,c-1); push(r,c+1); push(r-1,c); push(r+1,c);

  goalieA = pool[randInt(pool.length)];
  do{ goalieB = pool[randInt(pool.length)]; } while (goalieB === goalieA);

  // На expert — иногда “подкручиваем”, чтоб было сложнее
  if (diff === "expert" && randInt(100) < 35){
    const alt = goalieA + (randInt(2) ? 1 : -1);
    if (alt >= 0 && alt < 15) goalieB = alt;
  }
}

function goaliePoseFor(idx){
  const col = idx % 5;
  if (col <= 1) return "save-left";
  if (col >= 3) return "save-right";
  return "save-mid";
}
function setGoaliePose(pose){
  goalieEl.classList.remove("save-left","save-right","save-mid");
  goalieEl.classList.add("idle");
  if (pose){
    goalieEl.classList.remove("idle");
    goalieEl.classList.add(pose);
  }
}

// ===== ball flight =====
function flyBallTo(zoneEl){
  return new Promise((resolve)=>{
    const zRect = zoneEl.getBoundingClientRect();
    const gRect = document.querySelector(".goal").getBoundingClientRect();

    const zx = (zRect.left + zRect.width/2) - gRect.left;
    const zy = (zRect.top + zRect.height/2) - gRect.top;

    const startX = gRect.width/2;
    const startY = gRect.height - 43; // near bottom where ball sits

    const dx = zx - startX;
    const dy = zy - startY;

    ballEl.style.opacity = "1";

    const anim = ballEl.animate([
      { transform: `translateX(-50%) translate(0px,0px) scale(1)`, opacity: 1 },
      { transform: `translateX(-50%) translate(${dx}px, ${dy}px) scale(0.86)`, opacity: 1 }
    ], {
      duration: 380,
      easing: "cubic-bezier(.2,.85,.2,1)",
      fill: "forwards"
    });

    anim.onfinish = () => {
      setTimeout(()=>{
        ballEl.style.opacity = "0";
        ballEl.getAnimations().forEach(a=>a.cancel());
        resolve();
      }, 120);
    };
  });
}

// ===== gameplay =====
function startStake(){
  if (busy) return;

  clampBet();
  const bet = Math.floor(Number(betInput.value) || 0);
  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");

  baseBet = bet;
  addCoins(-bet);

  step = 0;
  currentX = 1.0;

  inRound = true;
  lockBetUI(true);
  resetZones();
  buildLadder();
  highlightStep();
  pickGoalieZones();

  cashBtn.disabled = true;
  setGoaliePose(""); // idle hands moving

  setStatus("Ставка принята. Кликни по зоне ворот (3×5).");
  beep(620, 55, 0.02);
  renderSide();
}

function endRoundLose(){
  inRound = false;
  lockBetUI(false);
  cashBtn.disabled = true;
  disableZones(false);
  setGoaliePose(""); // back to idle
  setStatus("Сейв! Ставка сгорела. Нажми «Ставка» чтобы начать снова.");
  renderSide();
}

function onGoal(){
  if (streakToggle.checked) step += 1;
  else step = 1;

  const arr = LADDERS[diff];
  const capped = Math.min(step, arr.length);
  currentX = arr[capped - 1];

  highlightStep();
  cashBtn.disabled = step <= 0;

  setStatus(`ГОЛ! Шаг ${step}. Можно продолжать или забрать ${Math.floor(baseBet * currentX)} 🪙.`);
  pickGoalieZones();
  setGoaliePose(""); // idle again
  disableZones(false);
  renderSide();
}

async function onZoneClick(idx, el){
  if (!inRound || busy) return;

  busy = true;
  disableZones(true);

  // Goalie shows where he “dives” (closest of 2 saved zones)
  const closest = Math.abs(idx - goalieA) <= Math.abs(idx - goalieB) ? goalieA : goalieB;
  setGoaliePose(goaliePoseFor(closest));

  await flyBallTo(el);

  const saved = (idx === goalieA || idx === goalieB);

  if (saved){
    el.classList.add("saveHit");
    sfxSave();
    busy = false;
    endRoundLose();
    return;
  }

  el.classList.add("goalHit");
  sfxGoal();
  busy = false;
  onGoal();
}

function cashout(){
  if (!inRound || busy) return;
  if (step <= 0) return;

  const payout = Math.floor(baseBet * currentX);
  addCoins(payout);

  beep(760, 65, 0.03);
  beep(920, 65, 0.03);

  inRound = false;
  lockBetUI(false);
  disableZones(false);
  setGoaliePose("");

  setStatus(`Кэшаут: +${payout} 🪙 (ставка ${baseBet} × ${fmtX(currentX)}).`);
  step = 0;
  currentX = 1.0;
  highlightStep();
  cashBtn.disabled = true;
  renderSide();
}

function resetAll(){
  if (busy) return;

  // Сброс — как у тебя было: просто вернуть UI, ставка НЕ возвращается (потому что ставка уже “в игре”)
  inRound = false;
  lockBetUI(false);
  resetZones();
  disableZones(false);
  setGoaliePose("");

  step = 0;
  currentX = 1.0;

  cashBtn.disabled = true;
  setStatus("Выбери ставку и сложность, затем нажми «Ставка».");
  buildLadder();
  renderSide();
}

// ===== binds =====
stakeBtn.onclick = startStake;
cashBtn.onclick = cashout;
resetBtn.onclick = resetAll;

streakToggle.onchange = () => { renderSide(); beep(520, 50, 0.02); };

// init
function init(){
  setDiff(diff);
  clampBet();
  buildLadder();
  renderSide();
  setGoaliePose(""); // idle hands moving always
  setStatus("Выбери ставку и сложность, затем нажми «Ставка».");
}
init();
