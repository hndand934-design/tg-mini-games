// ===================== RNG =====================
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function randInt(min, max) { // inclusive
  return Math.floor(randFloat() * (max - min + 1)) + min;
}

// ===================== Telegram =====================
const tg = window.Telegram?.WebApp;
if (tg) { try { tg.ready(); tg.expand(); } catch {} }

// ===================== Wallet =====================
const WALLET_KEY = "mini_wallet_penalty_v1";
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
  renderTop();
}
function addCoins(d) { setCoins(wallet.coins + d); }

// ===================== Sound =====================
let soundOn = true;

function beep(freq = 520, ms = 55, vol = 0.03, type = "sine") {
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

// небольшой “взрыв” шумом
function noiseBurst(ms = 130, vol = 0.05) {
  if (!soundOn) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * (ms / 1000)));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const g = ctx.createGain();
    g.gain.value = vol;

    // лёгкий фильтр, чтобы был “хлопок”
    const biquad = ctx.createBiquadFilter();
    biquad.type = "lowpass";
    biquad.frequency.value = 900;

    src.connect(biquad);
    biquad.connect(g);
    g.connect(ctx.destination);

    src.start();
    setTimeout(() => { try { ctx.close(); } catch {} }, ms + 40);
  } catch {}
}

// ===================== Multipliers (fixed ladders) =====================
// 10 шагов (0..10). На шаге 0 — x1.00
const LADDERS = {
  easy:   [1.00, 1.20, 1.45, 1.75, 2.15, 2.70, 3.45, 4.55, 6.20, 9.10, 14.00],
  mid:    [1.00, 1.25, 1.55, 1.95, 2.50, 3.30, 4.50, 6.40, 9.80, 15.50, 25.00],
  hard:   [1.00, 1.30, 1.70, 2.25, 3.05, 4.20, 6.10, 9.30, 15.00, 26.00, 45.00],
  expert: [1.00, 1.35, 1.80, 2.45, 3.40, 4.90, 7.40, 11.80, 20.00, 38.00, 70.00],
};
const DIFF_LABEL = { easy:"Низкий", mid:"Средний", hard:"Сложный", expert:"Эксперт" };
const DIFF_HINT = {
  easy:"Низкий: спокойный вратарь, X ниже.",
  mid:"Средний: стандартная агрессия, X средний.",
  hard:"Сложный: вратарь быстрее, X выше.",
  expert:"Эксперт: вратарь агрессивнее, X самый высокий."
};

// ===================== UI refs =====================
const subTitle = document.getElementById("subTitle");
const balanceEl = document.getElementById("balance");
const balance2 = document.getElementById("balance2");

const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");

const diffBtns = Array.from(document.querySelectorAll(".diffBtn"));
const diffHint = document.getElementById("diffHint");

const ladderEl = document.getElementById("ladder");

const stepView = document.getElementById("stepView");
const xView = document.getElementById("xView");
const potView = document.getElementById("potView");
const stepMini = document.getElementById("stepMini");
const xMini = document.getElementById("xMini");

const seriesToggle = document.getElementById("seriesToggle");

const betBtn = document.getElementById("betBtn");
const cashBtn = document.getElementById("cashBtn");
const resetBtn = document.getElementById("resetBtn");

const statusText = document.getElementById("statusText");

const infoDiff = document.getElementById("infoDiff");
const infoBet = document.getElementById("infoBet");
const infoCash = document.getElementById("infoCash");
const infoSeries = document.getElementById("infoSeries");

const goalEl = document.getElementById("goal");
const gridEl = document.getElementById("grid");
const gloveA = document.getElementById("gloveA");
const gloveB = document.getElementById("gloveB");
const ballEl = document.getElementById("ball");

// ===================== State =====================
let diff = "expert";
let step = 0;                 // goals in a row
let bet = 100;
let inRound = false;          // bet placed (armed)
let busy = false;             // anim lock
let lastCovered = null;       // {a: idx, b: idx}

let patrolTimer = null;
let patrolEnabled = true;

// ===================== Render top =====================
function renderTop(){
  const user = tg?.initDataUnsafe?.user;
  subTitle.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
  balanceEl.textContent = String(wallet.coins);
  balance2.textContent = String(wallet.coins);
}
renderTop();

// ===================== Sound toggle =====================
soundBtn.onclick = () => {
  soundOn = !soundOn;
  soundText.textContent = soundOn ? "Звук on" : "Звук off";
  const dot = soundBtn.querySelector(".dot");
  dot.style.background = soundOn ? "#26d47b" : "#ff5a6a";
  dot.style.boxShadow = soundOn
    ? "0 0 0 3px rgba(38,212,123,.14)"
    : "0 0 0 3px rgba(255,90,106,.14)";
  beep(soundOn ? 640 : 240, 60, 0.03);
};

// bonus
bonusBtn.onclick = () => { addCoins(1000); beep(760, 70, 0.03); };

// ===================== Build grid =====================
const CELLS = 15; // 3x5
function buildGrid(){
  gridEl.innerHTML = "";
  for (let i = 0; i < CELLS; i++){
    const b = document.createElement("button");
    b.className = "cell";
    b.type = "button";
    b.dataset.idx = String(i);
    b.addEventListener("click", () => onShoot(i));
    gridEl.appendChild(b);
  }
}
buildGrid();

// ===================== Bet controls =====================
function clampBet(){
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  bet = v;
  infoBet.textContent = String(bet);
  // если в раунде — ставку менять нельзя
  betInput.disabled = inRound;
  betMinus.disabled = inRound;
  betPlus.disabled = inRound;
  document.querySelectorAll(".chip").forEach(c => c.disabled = inRound);
}
betInput.addEventListener("input", clampBet);
betMinus.onclick = () => { betInput.value = String((Number(betInput.value)||1) - 10); clampBet(); };
betPlus.onclick  = () => { betInput.value = String((Number(betInput.value)||1) + 10); clampBet(); };

document.querySelectorAll(".chip").forEach((b) => {
  b.onclick = () => {
    const val = b.dataset.bet;
    betInput.value = (val === "max") ? String(wallet.coins) : String(val);
    clampBet();
    beep(540, 55, 0.02);
  };
});
clampBet();

// ===================== Difficulty =====================
function setDiff(d){
  if (inRound) return; // блокируем смену сложности в раунде
  diff = d;
  diffBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.diff === d));
  diffHint.textContent = DIFF_HINT[d];
  infoDiff.textContent = DIFF_LABEL[d];
  renderLadder();
  beep(520, 50, 0.02);
}
diffBtns.forEach(btn => btn.addEventListener("click", () => setDiff(btn.dataset.diff)));
setDiff("expert");

// ===================== Ladder =====================
function renderLadder(){
  const arr = LADDERS[diff];
  ladderEl.innerHTML = "";
  // показываем шаги 1..10 (без шага 0), но подсветка по step
  for (let i = 1; i < arr.length; i++){
    const el = document.createElement("div");
    el.className = "lStep" + (i === step ? " active" : "");
    el.innerHTML = `<div class="t">Шаг ${i}</div><div class="x">x${arr[i].toFixed(2)}</div>`;
    ladderEl.appendChild(el);
  }
}
renderLadder();

// ===================== Series toggle =====================
seriesToggle.addEventListener("change", () => {
  infoSeries.textContent = seriesToggle.checked ? "ON" : "OFF";
  beep(520, 50, 0.02);
});

// ===================== Helpers: UI state =====================
function setStatus(t){ statusText.textContent = t; }

function setRoundUI(){
  // enable/disable cells
  const cells = gridEl.querySelectorAll(".cell");
  cells.forEach(c => c.classList.toggle("disabled", !inRound || busy));
  // actions
  betBtn.disabled = busy || inRound;
  cashBtn.disabled = busy || !inRound || step < 1;
  resetBtn.disabled = busy;
  // info
  infoCash.textContent = (inRound && step >= 1) ? `${calcCashout()} 🪙` : "—";
  infoBet.textContent = String(bet);
  stepView.textContent = String(step);
  stepMini.textContent = String(step);
  const x = currentX();
  xView.textContent = `x${x.toFixed(2)}`;
  xMini.textContent = `x${x.toFixed(2)}`;
  potView.textContent = String(calcCashout());
  // bet controls lock in round
  clampBet();
  // ladder highlight
  renderLadder();
}

function currentX(){
  const arr = LADDERS[diff];
  const s = Math.max(0, Math.min(step, arr.length - 1));
  return arr[s];
}
function calcCashout(){
  if (step < 1) return 0;
  return Math.floor(bet * currentX());
}

// ===================== Goal geometry (centers) =====================
function cellCenter(idx){
  const cell = gridEl.querySelector(`.cell[data-idx="${idx}"]`);
  const rGoal = goalEl.getBoundingClientRect();
  const r = cell.getBoundingClientRect();
  return {
    x: (r.left - rGoal.left) + r.width / 2,
    y: (r.top - rGoal.top) + r.height / 2
  };
}

// keep gloves strictly inside goal (absolute px)
function placeGlove(el, x, y, rot=8){
  // clamp inside goal bounds, leaving half size margin
  const rGoal = goalEl.getBoundingClientRect();
  const size = el.getBoundingClientRect();
  const halfW = size.width / 2;
  const halfH = size.height / 2;

  const minX = halfW + 4;
  const maxX = rGoal.width - halfW - 4;
  const minY = halfH + 4;
  const maxY = rGoal.height - halfH - 4;

  const cx = Math.max(minX, Math.min(maxX, x));
  const cy = Math.max(minY, Math.min(maxY, y));

  el.style.left = `${cx}px`;
  el.style.top = `${cy}px`;
  el.style.transform = `translate(-50%,-50%) rotate(${rot}deg)`;
}

// ===================== Gloves patrol (inside goal only) =====================
function startPatrol(){
  stopPatrol();
  patrolEnabled = true;

  const moveOnce = () => {
    if (!patrolEnabled) return;
    if (busy) return;

    // random point within the grid area (not outside)
    const rg = goalEl.getBoundingClientRect();
    const rr = gridEl.getBoundingClientRect();
    const localLeft = rr.left - rg.left;
    const localTop  = rr.top  - rg.top;

    const x = localLeft + randFloat() * rr.width;
    const y = localTop  + randFloat() * rr.height;

    const x2 = localLeft + randFloat() * rr.width;
    const y2 = localTop  + randFloat() * rr.height;

    placeGlove(gloveA, x, y, randInt(-10, 10));
    placeGlove(gloveB, x2, y2, randInt(-10, 10));
  };

  moveOnce();
  patrolTimer = setInterval(moveOnce, 650);
}
function stopPatrol(){
  patrolEnabled = false;
  if (patrolTimer) clearInterval(patrolTimer);
  patrolTimer = null;
}

// ===================== Choose keeper zones =====================
// returns {a, b} two distinct indices
function keeperZones(){
  // всегда 2 зоны, но “агрессия” = чаще рядом с центром
  const weightCenter = (diff === "expert") ? 0.65 : (diff === "hard") ? 0.55 : (diff === "mid") ? 0.45 : 0.35;

  const pickOne = () => {
    if (randFloat() < weightCenter){
      // bias to middle cells
      const midCandidates = [6,7,8, 11,12,13, 1,2,3]; // по центру/вокруг
      return midCandidates[randInt(0, midCandidates.length-1)];
    }
    return randInt(0, 14);
  };

  let a = pickOne();
  let b = pickOne();
  while (b === a) b = pickOne();

  return { a, b };
}

// ===================== Ball animation (no trails) =====================
function resetBall(){
  // стартовая точка — низ по центру
  const rg = goalEl.getBoundingClientRect();
  const startX = rg.width / 2;
  const startY = rg.height - 18;

  ballEl.classList.remove("fly");
  ballEl.style.opacity = "0";
  ballEl.style.left = `${startX}px`;
  ballEl.style.top  = `${startY}px`;
  ballEl.style.transform = "translate(-50%,-50%) scale(1)";
}
resetBall();

function flyBallTo(idx){
  return new Promise((resolve) => {
    const rg = goalEl.getBoundingClientRect();
    const startX = rg.width / 2;
    const startY = rg.height - 18;
    const target = cellCenter(idx);

    // reset instant
    ballEl.classList.remove("fly");
    ballEl.style.opacity = "0";
    ballEl.style.left = `${startX}px`;
    ballEl.style.top  = `${startY}px`;
    ballEl.style.transform = "translate(-50%,-50%) scale(1)";

    // reflow
    void ballEl.offsetWidth;

    // fly
    ballEl.classList.add("fly");
    ballEl.style.opacity = "1";
    ballEl.style.left = `${target.x}px`;
    ballEl.style.top  = `${target.y}px`;
    ballEl.style.transform = "translate(-50%,-50%) scale(0.88)";

    // end
    setTimeout(() => {
      // скрываем мяч после удара (без следов)
      ballEl.style.opacity = "0";
      resolve();
    }, 290);
  });
}

// ===================== Round actions =====================
betBtn.onclick = () => {
  if (busy || inRound) return;
  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");

  // списываем ставку 1 раз
  addCoins(-bet);

  inRound = true;
  step = 0;
  lastCovered = null;
  setStatus("Ставка принята. Выбери точку удара в воротах.");
  beep(520, 55, 0.02);

  // блокируем настройки
  diffBtns.forEach(b => b.disabled = true);
  seriesToggle.disabled = true;

  setRoundUI();
};

cashBtn.onclick = () => {
  if (busy || !inRound || step < 1) return;

  const payout = calcCashout();
  addCoins(payout);

  setStatus(`Кэшаут: +${payout} 🪙 (x${currentX().toFixed(2)}).`);
  beep(760, 70, 0.03);
  beep(920, 70, 0.03);

  endRound(true);
};

resetBtn.onclick = () => {
  if (busy) return;
  // если раунд активен и step==0 — вернем ставку (как в наших режимах)
  if (inRound && step === 0){
    addCoins(bet);
    setStatus("Сброс: ставка возвращена. Выбери ставку и нажми «Ставка».");
  } else {
    setStatus("Сброс. Выбери ставку и нажми «Ставка».");
  }
  endRound(false);
};

function endRound(keepStep){
  inRound = false;
  busy = false;
  lastCovered = null;
  if (!keepStep) step = 0;

  // разблокируем настройки
  diffBtns.forEach(b => b.disabled = false);
  seriesToggle.disabled = false;

  setRoundUI();
  resetBall();
  startPatrol();
}

// ===================== Shoot =====================
async function onShoot(idx){
  if (!inRound || busy) return;

  busy = true;
  setRoundUI();

  // перед ударом выбираем зоны сейва и двигаем перчатки ТОЛЬКО в них
  const cover = keeperZones();
  lastCovered = cover;

  const ca = cellCenter(cover.a);
  const cb = cellCenter(cover.b);

  placeGlove(gloveA, ca.x, ca.y, randInt(-12, 12));
  placeGlove(gloveB, cb.x, cb.y, randInt(-12, 12));

  // удар
  setStatus("Удар...");
  beep(520, 45, 0.02);

  await flyBallTo(idx);

  const saved = (idx === cover.a || idx === cover.b);

  if (saved){
    // сейв: ставка сгорает, раунд конец
    setStatus("Сейв! Ставка сгорела.");
    noiseBurst(140, 0.055);
    beep(220, 90, 0.03, "triangle");

    // мгновенный сброс без “следов”
    busy = false;
    endRound(false);
    return;
  }

  // гол
  step = Math.min(step + 1, LADDERS[diff].length - 1);
  const x = currentX();

  setStatus(`Гол! Серия: ${step}. X вырос до x${x.toFixed(2)}. Можно кэшаут.`);
  beep(760, 65, 0.03);
  beep(920, 65, 0.03);

  // авто-логика серии OFF: после гола сразу кэшаут и конец
  if (!seriesToggle.checked){
    const payout = calcCashout();
    addCoins(payout);
    setStatus(`Гол! Авто-кэшаут: +${payout} 🪙 (x${x.toFixed(2)}).`);
    beep(880, 70, 0.03);
    busy = false;
    endRound(false);
    return;
  }

  busy = false;
  setRoundUI();
}

// ===================== Init / patrol =====================
function init(){
  // subtitle
  renderTop();

  // start patrol (visual life)
  startPatrol();

  // initial UI
  setRoundUI();

  // resize safety
  window.addEventListener("resize", () => {
    // на ресайзе просто мягко возвращаем в рамки
    if (lastCovered){
      const ca = cellCenter(lastCovered.a);
      const cb = cellCenter(lastCovered.b);
      placeGlove(gloveA, ca.x, ca.y, 6);
      placeGlove(gloveB, cb.x, cb.y, -6);
    } else {
      // перезапуск патруля
      startPatrol();
    }
    resetBall();
  });
}
init();
