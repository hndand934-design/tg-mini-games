// ===============================
// Penalty v2 — app.js (15 targets, no flags, fixed clicks)
// ===============================

// ---------- RNG ----------
function rand() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
function pick(arr){ return arr[Math.floor(rand() * arr.length)]; }

// ---------- DOM ----------
const betInput = document.getElementById("betInput");
const betText = document.getElementById("betText");
const payoutText = document.getElementById("payoutText");
const xNow = document.getElementById("xNow");
const streakNow = document.getElementById("streakNow");
const balanceText = document.getElementById("balanceText");

const statusText = document.getElementById("statusText");
const pickText = document.getElementById("pickText");
const keeperText = document.getElementById("keeperText");
const resultText = document.getElementById("resultText");
const hintText = document.getElementById("hintText");
const cashText = document.getElementById("cashText");

const stepText = document.getElementById("stepText");
const lastText = document.getElementById("lastText");

const startBtn = document.getElementById("startBtn");
const cashoutBtn = document.getElementById("cashoutBtn");
const shootBtn = document.getElementById("shootBtn");
const resetBtn = document.getElementById("resetBtn");

const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");
const chips = [...document.querySelectorAll(".chip")];
const multiBtns = [...document.querySelectorAll(".mBtn")];

const keeperEl = document.getElementById("keeper");
const ballEl = document.getElementById("ball");
const goalScene = document.getElementById("goalScene");

const targetsGrid = document.getElementById("targetsGrid");

// sound ui (без файлов — оставил как тумблер, звуки можно добавить потом)
const soundBtn = document.getElementById("soundBtn");
const soundState = document.getElementById("soundState");
let soundOn = true;

// ---------- STATE ----------
const LS_BAL = "mini_balance_penalty";
let balance = Number(localStorage.getItem(LS_BAL) || "1000");
if (!Number.isFinite(balance) || balance < 0) balance = 1000;
balanceText.textContent = `${Math.floor(balance)} ₽`;

let state = {
  started: false,
  shotDone: false,
  bet: 100,
  odds: 1.76,
  picked: null,
  keeper: null,
  streak: 0,
  step: 0,
};

function setHint(t){ hintText.textContent = t; }

function formatRUB(n){ return `${Math.floor(n)} ₽`; }

// ---------- BUILD 15 TARGETS ----------
const POS = []; // 15 positions
// 5x3 labels: A1..A5, B1..B5, C1..C5
["A","B","C"].forEach((row, ri) => {
  for (let i=1;i<=5;i++){
    POS.push(`${row}${i}`);
  }
});

function renderTargets(){
  targetsGrid.innerHTML = "";
  POS.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "target";
    b.dataset.pos = p;
    b.innerHTML = `<span class="tLabel">${p}</span>`;
    b.addEventListener("click", () => onPick(p, b));
    targetsGrid.appendChild(b);
  });
}
renderTargets();

function allTargets(){
  return [...targetsGrid.querySelectorAll(".target")];
}

// ---------- MULTIPLIERS ----------
multiBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    if (state.started) return; // нельзя менять во время раунда
    multiBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.odds = Number(btn.dataset.m);
    xNow.textContent = `x${state.odds.toFixed(2)}`;
    updateUI();
  });
});

// ---------- BET ----------
function clampBet(v){
  let n = Math.floor(Number(v) || 1);
  if (n < 1) n = 1;
  if (n > 1_000_000) n = 1_000_000;
  state.bet = n;
  betInput.value = String(n);
  betText.textContent = formatRUB(n);
  updateUI();
}
betInput.addEventListener("input", () => clampBet(betInput.value));

betMinus.addEventListener("click", () => {
  if (state.started)
