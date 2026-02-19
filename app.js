// =======================
// честный RNG
// =======================
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function randInt(min, max) { // inclusive
  return Math.floor(randFloat() * (max - min + 1)) + min;
}

// =======================
// Telegram WebApp
// =======================
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

// =======================
// Wallet
// =======================
const WALLET_KEY = "mini_wallet_penalty_v1";
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

// =======================
// Sound (лёгкий)
// =======================
let soundOn = true;
function beep(freq=520, ms=70, vol=0.03, type="sine"){
  if (!soundOn) return;
  try{
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    setTimeout(()=>{ o.stop(); ctx.close(); }, ms);
  }catch{}
}
function sKick(){ beep(220, 55, 0.03, "square"); beep(140, 70, 0.02, "sine"); }
function sGoal(){ beep(760, 75, 0.03); beep(920, 75, 0.03); }
function sSave(){ beep(160, 120, 0.035, "sawtooth"); }

// =======================
// UI refs
// =======================
const subTitle = document.getElementById("subTitle");
const balanceEl = document.getElementById("balance");
const balance2 = document.getElementById("balance2");

const soundBtn = document.getElementById("soundBtn");
const soundText = document.getElementById("soundText");
const bonusBtn = document.getElementById("bonusBtn");

const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");
const betView = document.getElementById("betView");

const ladderEl = document.getElementById("ladder");

const stepView = document.getElementById("stepView");
const xView = document.getElementById("xView");
const potView = document.getElementById("potView");

const stepMini = document.getElementById("stepMini");
const xMini = document.getElementById("xMini");

const placeBtn = document.getElementById("placeBtn");
const cashoutBtn = document.getElementById("cashoutBtn");
const resetBtn = document.getElementById("resetBtn");
const statusLine = document.getElementById("statusLine");

const diffView = document.getElementById("diffView");
const cashView = document.getElementById("cashView");
const seriesView = document.getElementById("seriesView");

const gridEl = document.getElementById("grid");
const goalEl = document.getElementById("goal");

const ballEl = document.getElementById("ball");
const gloveA = document.getElementById("gloveA");
const gloveB = document.getElementById("gloveB");

// =======================
// Difficulty ladders (фиксированные)
// =======================
// 0-й элемент = x1.00 (до первого гола)
const LADDERS = {
  low:    [1.00, 1.25, 1.55, 1.95, 2.50, 3.20, 4.20, 5.60, 7.50, 10.00, 13.50, 18.00],
  mid:    [1.00, 1.30, 1.70, 2.20, 2.90, 3.80, 5.10, 6.90, 9.40, 13.00, 18.50, 26.00],
  hard:   [1.00, 1.35, 1.85, 2.50, 3.40, 4.70, 6.60, 9.10, 12.80, 18.00, 26.00, 38.00],
  expert: [1.00, 1.40, 1.95, 2.80, 4.00, 5.80, 8.40, 12.20, 18.00, 27.00, 41.00, 62.00],
};

const DIFF_LABEL = { low:"Низкий", mid:"Средний", hard:"Сложный", expert:"Эксперт" };

// =======================
// State
// =======================
let diff = "expert";
let ladder = LADDERS[diff];

let bet = 100;
let inRound = false;    // ставка принята (удары разрешены)
let step = 0;           // количество голов подряд
let currentX = 1.00;
let busy = false;       // во время анимации удара
let lastBetLocked = 0;  // ставка, списанная при place
let hoverTimer = null;  // анимация “гуляния” вратаря

// goalkeeper covers 2 zones
let cover = [0, 1];     // indices 0..14
let zones = [];         // zone elements

// =======================
// helpers render
// =======================
function renderTop(){
  const user = tg?.initDataUnsafe?.user;
  subTitle.textContent = user ? `Привет, ${user.first_name}` : `Открыто вне Telegram`;
  balanceEl.textContent = String(wallet.coins);
  balance2.textContent = String(wallet.coins);
}
renderTop();

function setStatus(text){
  statusLine.textContent = text;
}

function clampBet(){
  let v = Math.floor(Number(betInput.value) || 0);
  if (v < 1) v = 1;
  if (v > wallet.coins) v = wallet.coins;
  betInput.value = String(v);
  bet = v;
  betView.textContent = String(bet);

  // если не в раунде — обновим потенциал (0) и кэшаут
  updatePanels();
}

function updatePanels(){
  currentX = ladder[Math.min(step, ladder.length - 1)];
  stepView.textContent = String(step);
  xView.textContent = currentX.toFixed(2);
  stepMini.textContent = String(step);
  xMini.textContent = currentX.toFixed(2);

  const potential = inRound ? Math.floor(lastBetLocked * currentX) : 0;
  potView.textContent = String(potential);
  cashView.textContent = (inRound && step > 0) ? `${potential} 🪙` : "—";
  seriesView.textContent = "ON";

  cashoutBtn.disabled = !(inRound && step > 0 && !busy);

  // ladder highlight
  [...ladderEl.querySelectorAll(".lStep")].forEach((el, i) => {
    el.classList.toggle("active", i === step);
  });
}

// =======================
// build ladder UI (ровная, не вылезает)
// =======================
function buildLadder(){
  ladder = LADDERS[diff];
  ladderEl.innerHTML = "";
  for (let i = 1; i < ladder.length; i++){
    const el = document.createElement("div");
    el.className = "lStep";
    el.innerHTML = `<div class="t">Шаг ${i}</div><div class="x">x${ladder[i].toFixed(2)}</div>`;
    ladderEl.appendChild(el);
  }
  updatePanels();
}

// =======================
// grid zones
// =======================
function buildGrid(){
  gridEl.innerHTML = "";
  zones = [];
  for (let i = 0; i < 15; i++){
    const z = document.createElement("div");
    z.className = "zone";
    z.dataset.idx = String(i);
    z.onclick = () => onZoneClick(i);
    gridEl.appendChild(z);
    zones.push(z);
  }
}
buildGrid();

// =======================
// sound toggle / bonus
// =======================
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

bonusBtn.onclick = () => { addCoins(1000); beep(760, 70, 0.03); };

// bet controls
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

// difficulty
document.querySelectorAll(".diff").forEach(btn => {
  btn.onclick = () => {
    if (inRound || busy) return; // нельзя менять на раунде
    document.querySelectorAll(".diff").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    diff = btn.dataset.diff;
    diffView.textContent = DIFF_LABEL[diff];
    buildLadder();
    beep(520, 50, 0.025);
  };
});
diffView.textContent = DIFF_LABEL[diff];

// =======================
// goalkeeper movement
// =======================
function zoneCenter(i){
  // center of the zone element relative to goal box
  const z = zones[i];
  const zr = z.getBoundingClientRect();
  const gr = goalEl.getBoundingClientRect();
  const x = (zr.left - gr.left) + zr.width/2;
  const y = (zr.top - gr.top) + zr.height/2;
  return { x, y, w: zr.width, h: zr.height };
}

function setGlovesAtZones(aIdx, bIdx, ms=220){
  const a = zoneCenter(aIdx);
  const b = zoneCenter(bIdx);

  // glove is positioned by transform translate (centered)
  gloveA.style.transition = `transform ${ms}ms cubic-bezier(.2,.85,.2,1)`;
  gloveB.style.transition = `transform ${ms}ms cubic-bezier(.2,.85,.2,1)`;

  const aTx = a.x - 20;
  const aTy = a.y - 17;
  const bTx = b.x - 20;
  const bTy = b.y - 17;

  gloveA.style.transform = `translate3d(${aTx}px, ${aTy}px, 0) rotate(-6deg)`;
  gloveB.style.transform = `translate3d(${bTx}px, ${bTy}px, 0) rotate(7deg)`;
}

function randomCover(){
  // pick 2 distinct zones out of 15
  const a = randInt(0,14);
  let b = randInt(0,14);
  if (b === a) b = (b + 1) % 15;
  return [a,b];
}

function startHoverGoalie(){
  stopHoverGoalie();
  const tick = () => {
    if (busy) return;
    cover = randomCover();
    // “гуляет” по всем клеткам даже ДО ставки — выглядит живее
    setGlovesAtZones(cover[0], cover[1], 260);
    hoverTimer = setTimeout(tick, 420);
  };
  tick();
}

function stopHoverGoalie(){
  if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
}
startHoverGoalie();

// =======================
// round controls
// =======================
function lockInputs(locked){
  betInput.disabled = locked;
  betMinus.disabled = locked;
  betPlus.disabled = locked;
  document.querySelectorAll(".chip").forEach(x => x.disabled = locked);
  document.querySelectorAll(".diff").forEach(x => x.disabled = locked);
  placeBtn.disabled = locked;
  resetBtn.disabled = locked;
}

function resetVisualMarks(){
  zones.forEach(z => {
    z.classList.remove("hitGoal","hitSave","disabled");
  });
  ballEl.style.opacity = "0";
}

function fullReset(restoreBetIfNeeded){
  // если ставка уже списана — вернём при reset (до результата)
  if (restoreBetIfNeeded && inRound && step === 0 && lastBetLocked > 0){
    addCoins(lastBetLocked);
  }

  inRound = false;
  busy = false;
  step = 0;
  lastBetLocked = 0;

  resetVisualMarks();
  updatePanels();

  lockInputs(false);
  cashoutBtn.disabled = true;

  setStatus("Выбери ставку и сложность, затем нажми «Ставка ⚽».");
}

resetBtn.onclick = () => {
  // reset возвращает ставку ТОЛЬКО если ещё не было гола (как обсуждали ранее по логике других режимов)
  fullReset(true);
  beep(420, 60, 0.02);
};

placeBtn.onclick = () => {
  if (busy) return;
  clampBet();
  if (bet <= 0) return alert("Ставка должна быть больше 0");
  if (bet > wallet.coins) return alert("Недостаточно монет");

  // старт серии: списываем 1 раз
  addCoins(-bet);
  lastBetLocked = bet;

  inRound = true;
  step = 0;
  updatePanels();

  // разрешаем клики по зонам
  zones.forEach(z => z.classList.remove("disabled"));
  lockInputs(true);
  // но cashout пока нельзя (нужен минимум 1 гол)
  cashoutBtn.disabled = true;
  resetBtn.disabled = false; // reset можно

  setStatus("Ставка принята. Выбери зону удара (клик по воротам).");
  sKick();
};

cashoutBtn.onclick = () => {
  if (!inRound || busy || step <= 0) return;
  const payout = Math.floor(lastBetLocked * currentX);
  addCoins(payout);

  setStatus(`Кэшаут: +${payout} 🪙 (x${currentX.toFixed(2)}).`);
  sGoal();

  // сброс без возврата ставки (она уже превращена в выигрыш)
  inRound = false;
  busy = false;
  step = 0;
  lastBetLocked = 0;

  zones.forEach(z => z.classList.add("disabled"));
  updatePanels();
  lockInputs(false);
};

// =======================
// shot animation
// =======================
function animateBallToZone(idx){
  const c = zoneCenter(idx);

  const startX = 28;
  const startY = goalEl.getBoundingClientRect().height - 28;

  // translate to zone center
  const tx = c.x - startX;
  const ty = c.y - startY;

  ballEl.style.opacity = "1";
  ballEl.style.transition = "transform 260ms cubic-bezier(.2,.85,.2,1), opacity 120ms linear";
  ballEl.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(1.05)`;
}

function ballFadeOut(){
  ballEl.style.transition = "opacity 180ms linear";
  ballEl.style.opacity = "0";
  ballEl.style.transform = "translate3d(0,0,0) scale(1)";
}

async function onZoneClick(idx){
  if (!inRound || busy) return;

  busy = true;
  cashoutBtn.disabled = true;

  // mark zones disabled during animation
  zones.forEach(z => z.classList.add("disabled"));

  // выбрать сейв-зоны: 2 зоны (по сложности можно сделать "чуть ближе", но оставляем как финал: честный RNG)
  cover = randomCover();

  // анимация перчаток в выбранные зоны (чётко, как будто прыгнул)
  setGlovesAtZones(cover[0], cover[1], 180);

  // удар
  setStatus("Удар...");
  sKick();
  animateBallToZone(idx);

  await new Promise(r => setTimeout(r, 280));

  const saved = (idx === cover[0] || idx === cover[1]);

  if (saved){
    // сейв
    zones[idx].classList.add("hitSave");
    setStatus(`Сейв! Ставка ${lastBetLocked} 🪙 сгорела.`);
    sSave();

    // конец серии — можно начинать заново (разблок)
    inRound = false;
    step = 0;
    lastBetLocked = 0;
    updatePanels();
    lockInputs(false);
    zones.forEach(z => z.classList.add("disabled"));
  } else {
    // гол
    zones[idx].classList.add("hitGoal");
    step = Math.min(step + 1, ladder.length - 1);
    updatePanels();
    setStatus(`Гол! Шаг ${step} — x${currentX.toFixed(2)}. Можно кэшаут.`);
    sGoal();

    // продолжаем серию: зоны снова кликабельны
    zones.forEach(z => z.classList.remove("disabled"));
    cashoutBtn.disabled = false;
  }

  // убрать мяч
  await new Promise(r => setTimeout(r, 220));
  ballFadeOut();

  busy = false;
}

// =======================
// init
// =======================
clampBet();
buildLadder();
updatePanels();
zones.forEach(z => z.classList.add("disabled"));
