/* RPS (Rock Paper Scissors) — стабильная версия с серией, лестницей X и cashout
   Важно: кнопки выбора должны иметь data-move="rock|paper|scissors"
   Кнопка "Играть" — data-action="play"
   Кнопка "Забрать" — data-action="cashout"
   Кнопка звука — data-action="sound"
*/

(() => {
  "use strict";

  // ---------- helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2);

  // ---------- DOM (гибкий поиск) ----------
  const ui = {
    // pills / labels (если есть — обновим; если нет — пропустим)
    status:      $('[data-ui="status"]')      || $('#status')      || $('#pillStatus'),
    yourPick:    $('[data-ui="yourPick"]')    || $('#yourPick')    || $('#pillYour'),
    botPick:     $('[data-ui="botPick"]')     || $('#botPick')     || $('#pillBot'),
    result:      $('[data-ui="result"]')      || $('#result')      || $('#pillResult'),

    // arena
    botCard:     $('[data-ui="botCard"]')     || $('#botCard'),
    youCard:     $('[data-ui="youCard"]')     || $('#youCard'),
    botHand:     $('[data-ui="botHand"]')     || $('#botHand'),
    youHand:     $('[data-ui="youHand"]')     || $('#youHand'),

    // ladder / meta
    ladder:      $('[data-ui="ladder"]')      || $('#ladder'),
    series:      $('[data-ui="series"]')      || $('#series'),
    currentX:    $('[data-ui="currentX"]')    || $('#currentX'),
    potential:   $('[data-ui="potential"]')   || $('#potential'),

    // bet panel
    balance:     $('[data-ui="balance"]')     || $('#balance'),
    betInput:    $('[data-ui="betInput"]')    || $('#betInput'),
    winLine:     $('[data-ui="winLine"]')     || $('#winLine'),

    // controls
    playBtn:     $('[data-action="play"]')    || $('#playBtn'),
    cashoutBtn:  $('[data-action="cashout"]') || $('#cashoutBtn') || $('#takeBtn'),
    soundBtn:    $('[data-action="sound"]')   || $('#soundBtn'),

    // moves buttons
    moveBtns:    $$('[data-move]') // must exist
  };

  // ---------- ensure buttons clickable (фикс “не нажимается”) ----------
  function forceClickable(el) {
    if (!el) return;
    el.style.pointerEvents = "auto";
    el.style.position = el.style.position || "relative";
    el.style.zIndex = el.style.zIndex || "10";
  }
  [...ui.moveBtns, ui.playBtn, ui.cashoutBtn, ui.soundBtn].forEach(forceClickable);

  // Если вдруг поверх лежит оверлей — часто у него класс overlay/glass и pointer-events:auto
  // Мы аккуратно отключим pointer-events только у явных оверлеев, чтобы не ломать UI.
  $$('[class*="overlay"], [class*="Overlay"], [class*="glass"], [data-overlay="true"]').forEach(el => {
    const pe = getComputedStyle(el).pointerEvents;
    if (pe !== "none") el.style.pointerEvents = "none";
  });

  // ---------- game config ----------
  // Лестница X (как на твоём варианте)
  const LADDER = [1.00, 1.20, 1.50, 2.00, 3.00, 5.00, 10.00]; // шаги
  const WIN_TO_COMPLETE = LADDER.length - 1; // сколько побед до конца лестницы

  const MOVES = ["rock", "paper", "scissors"];
  const MOVE_RU = { rock: "Камень", paper: "Бумага", scissors: "Ножницы" };

  // “Белые руки” — аккуратные 2D-иконки (SVG inline) без внешних картинок
  // (не “кривые”, полностью рука)
  const HAND_SVG = {
    rock: `
      <svg viewBox="0 0 128 128" width="96" height="96" aria-label="rock" role="img">
        <defs>
          <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="rgba(255,255,255,.98)"/>
            <stop offset="1" stop-color="rgba(255,255,255,.78)"/>
          </linearGradient>
        </defs>
        <path d="M42 62c-2-11 2-21 12-25 9-4 19 1 23 10l3 7 6 0c6 0 10 5 10 11v14c0 16-13 29-29 29H58c-13 0-24-9-26-21l-2-12c-1-6 3-12 9-13l3 0z"
              fill="url(#g)" stroke="rgba(0,0,0,.15)" stroke-width="4" stroke-linejoin="round"/>
        <path d="M53 52c2-7 10-9 15-4" fill="none" stroke="rgba(0,0,0,.12)" stroke-width="4" stroke-linecap="round"/>
      </svg>
    `,
    paper: `
      <svg viewBox="0 0 128 128" width="96" height="96" aria-label="paper" role="img">
        <defs>
          <linearGradient id="g2" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="rgba(255,255,255,.98)"/>
            <stop offset="1" stop-color="rgba(255,255,255,.78)"/>
          </linearGradient>
        </defs>
        <path d="M42 30c8-6 20-6 28 0l18 14c6 5 10 13 10 21v20c0 9-7 16-16 16H46c-9 0-16-7-16-16V46c0-6 5-12 12-16z"
              fill="url(#g2)" stroke="rgba(0,0,0,.15)" stroke-width="4" stroke-linejoin="round"/>
        <path d="M46 52h36M46 66h36M46 80h30" stroke="rgba(0,0,0,.10)" stroke-width="4" stroke-linecap="round"/>
      </svg>
    `,
    scissors: `
      <svg viewBox="0 0 128 128" width="96" height="96" aria-label="scissors" role="img">
        <defs>
          <linearGradient id="g3" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="rgba(255,255,255,.98)"/>
            <stop offset="1" stop-color="rgba(255,255,255,.78)"/>
          </linearGradient>
        </defs>
        <path d="M46 36c6 0 11 5 11 11v10l16-10c8-5 17 1 17 10 0 4-2 7-5 9l-11 7 11 7c3 2 5 5 5 9 0 9-9 15-17 10L57 96V86c0 6-5 11-11 11s-11-5-11-11 5-11 11-11c4 0 8 2 10 5V58c-2 3-6 5-10 5-6 0-11-5-11-11s5-11 11-11z"
              fill="url(#g3)" stroke="rgba(0,0,0,.15)" stroke-width="4" stroke-linejoin="round"/>
        <path d="M60 62l16 10M60 66l16-10" stroke="rgba(0,0,0,.10)" stroke-width="4" stroke-linecap="round"/>
      </svg>
    `
  };

  // ---------- audio (простой, приятный, негромкий) ----------
  let audioOn = true;
  let audioCtx = null;
  function beep(type = "tap") {
    if (!audioOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audioCtx.currentTime;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      let f1 = 440, f2 = 660, dur = 0.07, vol = 0.03;
      if (type === "tap")   { f1 = 520; f2 = 520; dur = 0.05; vol = 0.02; }
      if (type === "start") { f1 = 380; f2 = 520; dur = 0.09; vol = 0.03; }
      if (type === "win")   { f1 = 520; f2 = 820; dur = 0.10; vol = 0.035; }
      if (type === "lose")  { f1 = 300; f2 = 180; dur = 0.12; vol = 0.03; }
      if (type === "cash")  { f1 = 700; f2 = 980; dur = 0.09; vol = 0.03; }

      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      osc.type = "sine";
      osc.frequency.setValueAtTime(f1, t0);
      osc.frequency.linearRampToValueAtTime(f2, t0 + dur);

      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (_) {}
  }

  function setSoundUI() {
    if (!ui.soundBtn) return;
    ui.soundBtn.textContent = audioOn ? "Звук: on" : "Звук: off";
    ui.soundBtn.classList.toggle("is-off", !audioOn);
  }

  // ---------- state ----------
  const state = {
    selectedMove: null,
    inAnim: false,

    // series
    seriesActive: false,
    seriesWins: 0,     // сколько побед подряд в серии
    currentX: 1.00,    // текущий X по лестнице
    bet: 100,

    balance: 1000
  };

  // ---------- storage ----------
  const LS_BAL = "rps_balance_v1";
  function loadBalance() {
    const v = Number(localStorage.getItem(LS_BAL));
    if (Number.isFinite(v) && v >= 0) state.balance = Math.floor(v);
  }
  function saveBalance() {
    localStorage.setItem(LS_BAL, String(state.balance));
  }

  // ---------- UI update ----------
  function setText(el, text) { if (el) el.textContent = text; }
  function setHTML(el, html) { if (el) el.innerHTML = html; }

  function updateTop() {
    setText(ui.balance, `${state.balance} ₽`);
    if (ui.betInput) ui.betInput.value = String(state.bet);
    setText(ui.series, `${state.seriesWins} побед`);
    setText(ui.currentX, `x${fmt(state.currentX)}`);
    setText(ui.potential, `${Math.floor(state.bet * state.currentX)} ₽`);
  }

  function updatePills({ status, your, bot, result } = {}) {
    if (status !== undefined) setText(ui.status, status);
    if (your !== undefined) setText(ui.yourPick, your);
    if (bot !== undefined) setText(ui.botPick, bot);
    if (result !== undefined) setText(ui.result, result);
  }

  function highlightMoveButtons() {
    ui.moveBtns.forEach(btn => {
      const mv = btn.getAttribute("data-move");
      btn.classList.toggle("is-active", mv === state.selectedMove);
    });
  }

  function setControls() {
    const canPlay = !!state.selectedMove && !state.inAnim;
    if (ui.playBtn) {
      ui.playBtn.disabled = !canPlay;
      ui.playBtn.classList.toggle("is-disabled", !canPlay);
    }

    const canCash = state.seriesActive && state.seriesWins > 0 && !state.inAnim;
    if (ui.cashoutBtn) {
      ui.cashoutBtn.disabled = !canCash;
      ui.cashoutBtn.classList.toggle("is-disabled", !canCash);
    }
  }

  function renderLadder() {
    if (!ui.ladder) return;

    // если лестница уже размечена в HTML — мы просто подсветим
    const items = $$(".xstep", ui.ladder);
    if (items.length) {
      items.forEach((it, idx) => {
        it.classList.toggle("is-current", idx === state.seriesWins);
        it.classList.toggle("is-done", idx < state.seriesWins);
      });
      return;
    }

    // иначе строим сами
    ui.ladder.innerHTML = "";
    LADDER.forEach((x, idx) => {
      const d = document.createElement("div");
      d.className = "xstep";
      d.innerHTML = `<div class="xstep__t">${idx === 0 ? "Старт" : `Шаг ${idx}`}</div><div class="xstep__x">x${fmt(x)}</div>`;
      if (idx === state.seriesWins) d.classList.add("is-current");
      if (idx < state.seriesWins) d.classList.add("is-done");
      ui.ladder.appendChild(d);
    });
  }

  function renderHands(botMove, youMove, reveal = false) {
    const q = `<div class="hand-q">?</div>`;
    if (!reveal) {
      setHTML(ui.botHand, q);
      setHTML(ui.youHand, q);
      return;
    }
    setHTML(ui.botHand, HAND_SVG[botMove] || q);
    setHTML(ui.youHand, HAND_SVG[youMove] || q);
  }

  function setWinLine(text) {
    if (!ui.winLine) return;
    ui.winLine.textContent = text || "—";
  }

  // ---------- game logic ----------
  function outcome(you, bot) {
    if (you === bot) return "draw";
    if (
      (you === "rock" && bot === "scissors") ||
      (you === "paper" && bot === "rock") ||
      (you === "scissors" && bot === "paper")
    ) return "win";
    return "lose";
  }

  function nextX(wins) {
    return LADDER[clamp(wins, 0, WIN_TO_COMPLETE)];
  }

  function startSeriesIfNeeded() {
    if (state.seriesActive) return true;

    // ставка списывается 1 раз при старте серии
    if (state.bet <= 0) return false;
    if (state.balance < state.bet) {
      updatePills({ result: "Недостаточно средств" });
      setWinLine("—");
      beep("lose");
      return false;
    }

    state.balance -= state.bet;
    state.seriesActive = true;
    state.seriesWins = 0;
    state.currentX = 1.00;
    saveBalance();
    return true;
  }

  async function playRound() {
    if (state.inAnim) return;
    if (!state.selectedMove) return;

    // старт серии при первом ходе
    if (!startSeriesIfNeeded()) {
      setControls();
      updateTop();
      return;
    }

    state.inAnim = true;
    setControls();

    updatePills({
      status: "Раунд...",
      your: MOVE_RU[state.selectedMove],
      bot: "…",
      result: "Идёт бой"
    });

    setWinLine("—");
    renderHands(null, null, false);
    beep("start");

    // анимация “перемешивания”
    const shuffleSteps = 10;
    for (let i = 0; i < shuffleSteps; i++) {
      const b = MOVES[(Math.random() * 3) | 0];
      const y = MOVES[(Math.random() * 3) | 0];
      setHTML(ui.botHand, HAND_SVG[b]);
      setHTML(ui.youHand, HAND_SVG[y]);
      await new Promise(r => setTimeout(r, 55));
    }

    const botMove = MOVES[(Math.random() * 3) | 0];
    const youMove = state.selectedMove;
    renderHands(botMove, youMove, true);

    updatePills({ bot: MOVE_RU[botMove] });

    const res = outcome(youMove, botMove);

    if (res === "draw") {
      updatePills({ status: "Ничья", result: "Серия продолжается" });
      setWinLine("0 ₽ (ничья)");
      // в ничью серия не сбрасывается и деньги не добавляются
      beep("tap");
    }

    if (res === "win") {
      state.seriesWins = clamp(state.seriesWins + 1, 0, WIN_TO_COMPLETE);
      state.currentX = nextX(state.seriesWins);

      updatePills({ status: "Победа", result: `+ шаг (${state.seriesWins}/${WIN_TO_COMPLETE})` });

      // показываем “потенциал”
      const pot = Math.floor(state.bet * state.currentX);
      setWinLine(`Потенциал: ${pot} ₽`);
      beep("win");

      // если дошёл до конца лестницы — автокэш-аут
      if (state.seriesWins >= WIN_TO_COMPLETE) {
        await new Promise(r => setTimeout(r, 450));
        doCashout(true);
      }
    }

    if (res === "lose") {
      updatePills({ status: "Поражение", result: "Серия в ноль" });
      setWinLine(`-${state.bet} ₽`);
      beep("lose");
      // серия сгорает
      state.seriesActive = false;
      state.seriesWins = 0;
      state.currentX = 1.00;
    }

    renderLadder();
    updateTop();

    state.inAnim = false;
    setControls();
  }

  function doCashout(auto = false) {
    if (!state.seriesActive || state.seriesWins <= 0) return;

    const win = Math.floor(state.bet * state.currentX);
    state.balance += win;
    saveBalance();

    updatePills({
      status: auto ? "Финиш" : "Забрал",
      result: `+${win} ₽`
    });
    setWinLine(`Выигрыш: +${win} ₽`);
    beep("cash");

    // сброс серии
    state.seriesActive = false;
    state.seriesWins = 0;
    state.currentX = 1.00;

    renderLadder();
    updateTop();
    setControls();
  }

  // ---------- events ----------
  function onMoveClick(e) {
    const btn = e.target.closest("[data-move]");
    if (!btn) return;
    if (state.inAnim) return;

    state.selectedMove = btn.getAttribute("data-move");
    highlightMoveButtons();
    updatePills({ your: MOVE_RU[state.selectedMove] });
    beep("tap");
    setControls();
  }

  function onActionClick(e) {
    const a = e.target.closest("[data-action]");
    if (!a) return;
    const act = a.getAttribute("data-action");

    if (act === "sound") {
      audioOn = !audioOn;
      setSoundUI();
      beep("tap");
      return;
    }

    if (act === "play") {
      playRound();
      return;
    }

    if (act === "cashout") {
      doCashout(false);
      return;
    }
  }

  function hookBetControls() {
    // если у тебя есть чипсы/кнопки ставок с data-bet="50" и т.п.
    $$("[data-bet]").forEach(btn => {
      forceClickable(btn);
      btn.addEventListener("click", () => {
        const v = Number(btn.getAttribute("data-bet"));
        if (Number.isFinite(v) && v > 0) {
          state.bet = v;
          updateTop();
          setControls();
          beep("tap");
        }
      });
    });

    // +/- если есть
    $$("[data-bet-delta]").forEach(btn => {
      forceClickable(btn);
      btn.addEventListener("click", () => {
        const d = Number(btn.getAttribute("data-bet-delta"));
        if (!Number.isFinite(d)) return;
        state.bet = clamp(state.bet + d, 1, 1000000);
        updateTop();
        setControls();
        beep("tap");
      });
    });

    if (ui.betInput) {
      ui.betInput.addEventListener("input", () => {
        const v = Number(String(ui.betInput.value).replace(/[^\d]/g, ""));
        if (Number.isFinite(v) && v > 0) {
          state.bet = clamp(Math.floor(v), 1, 1000000);
          updateTop();
          setControls();
        }
      });
    }
  }

  // ---------- init ----------
  function init() {
    loadBalance();
    setSoundUI();

    // дефолтные тексты
    updatePills({
      status: "Ожидание",
      your: "—",
      bot: "—",
      result: "—"
    });

    renderHands(null, null, false);
    renderLadder();
    updateTop();
    setWinLine("—");

    // навешиваем клики (делегирование)
    document.addEventListener("click", (e) => {
      onMoveClick(e);
      onActionClick(e);
    });

    hookBetControls();
    setControls();
  }

  // старт
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
