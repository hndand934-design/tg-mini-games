// =========================
// Rocket Crash — app.js v8
// auto rounds + smooth graph
// =========================

// RNG
function randFloat() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

// UI
const multEl = document.getElementById("mult");
const statusEl = document.getElementById("status");
const timerEl = document.getElementById("timer");
const canvas = document.getElementById("chart");
const ctx = canvas.getContext("2d");

const W = canvas.width = canvas.offsetWidth;
const H = canvas.height = canvas.offsetHeight;

// STATE
let phase = "waiting"; // waiting | flying | crashed
let mult = 1;
let t = 0;
let crashPoint = 2;
let roundTimer = 5;
let lastFrame = 0;

// GRAPH
const points = [];

function resetGraph() {
  points.length = 0;
  ctx.clearRect(0, 0, W, H);
}

// Curve (like Stake)
function curve(x) {
  return Math.pow(x, 1.35);
}

// Crash logic
function newRound() {
  mult = 1;
  t = 0;
  crashPoint = Math.max(1.05, 1 / (1 - randFloat()));
  phase = "waiting";
  roundTimer = 5;
  statusEl.textContent = "Ожидание";
  timerEl.textContent = "Старт через 5с";
  resetGraph();
}

// Draw grid
function drawGrid() {
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;

  const step = 50;
  for (let x = 0; x < W; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

// Draw curve
function drawCurve() {
  ctx.beginPath();
  ctx.strokeStyle = "#ff5c6c";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#ff5c6c";
  ctx.shadowBlur = 8;

  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;
}

// Update graph
function update(dt) {
  if (phase === "waiting") {
    roundTimer -= dt;
    timerEl.textContent = `Старт через ${Math.ceil(roundTimer)}с`;

    if (roundTimer <= 0) {
      phase = "flying";
      statusEl.textContent = "Полёт";
      timerEl.textContent = "";
    }
    return;
  }

  if (phase === "flying") {
    t += dt;
    mult = 1 + curve(t);

    if (mult >= crashPoint) {
      phase = "crashed";
      statusEl.textContent = "Краш";
      setTimeout(newRound, 5000);
    }

    multEl.textContent = mult.toFixed(2) + "x";

    const x = (t * 60) % W;
    const y = H - (mult / crashPoint) * H;

    points.push({ x, y });
  }
}

// Loop
function loop(ts) {
  const dt = (ts - lastFrame) / 1000;
  lastFrame = ts;

  ctx.clearRect(0, 0, W, H);
  drawGrid();
  update(dt);
  drawCurve();

  requestAnimationFrame(loop);
}

// START
newRound();
requestAnimationFrame(loop);
