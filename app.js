(() => {
  const API_BASE = "http://localhost:4000/api";
  const TOKEN_KEY = "triniti_token_v1";
  const EMAIL = "test@test.com";
  const PASSWORD = "12345678";

  const PROMO_KEY_USED = "triniti_promo_used_v1";
  const DAILY_NEXT_KEY = "triniti_daily_next_ms_v3";
  const VK_KEY = "triniti_bonus_vk_v2";
  const TG_KEY = "triniti_bonus_tg_v2";
  const ONLINE_STATE_KEY = "triniti_online_state_v2";

  const PROMOS = {
    TRINITI5: 5,
    TRINITI10: 10,
    TRINITI25: 25
  };

  const PRIZES = [
    { label: "+0 ₽", coins: 0 },
    { label: "+5 ₽", coins: 5 },
    { label: "+10 ₽", coins: 10 },
    { label: "+15 ₽", coins: 15 },
    { label: "+20 ₽", coins: 20 },
    { label: "+25 ₽", coins: 25 }
  ];

  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  let audioCtx = null;
  let spinning = false;
  let lastRotation = 0;

  const mainLayout = $("mainLayout");
  const menuBtn = $("menuBtn");
  const menuBtnMobile = $("menuBtnMobile");

  // ===== AUDIO =====
  function getCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    return audioCtx;
  }

  function beep(freq = 520, ms = 60, vol = 0.03) {
    try {
      const ctx = getCtx();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = "sine";
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + ms / 1000);
    } catch {}
  }

  // ===== API =====
  async function api(path, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY);

    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    if (token) {
      headers.Authorization = "Bearer " + token;
    }

    const res = await fetch(API_BASE + path, {
      ...options,
      headers
    });

    const text = await res.text();
    let data = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      throw new Error(data.error || data.message || "Ошибка запроса");
    }

    return data;
  }

  async function ensureAuth() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) return token;

    try {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: EMAIL,
          password: PASSWORD
        })
      });
    } catch {}

    const loginData = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: EMAIL,
        password: PASSWORD
      })
    });

    localStorage.setItem(TOKEN_KEY, loginData.token);
    return loginData.token;
  }

  async function fetchBalance() {
    const data = await api("/wallet/balance", {
      method: "GET"
    });

    return Number(data.balance || 0);
  }

  async function syncBalanceUI() {
    try {
      await ensureAuth();
      const balance = await fetchBalance();

      [$("balance"), $("balance2"), $("balanceRail")]
        .filter(Boolean)
        .forEach((el) => {
          el.textContent = String(balance);
        });
    } catch (e) {
      console.error("syncBalanceUI error:", e);
    }
  }

  // ===== PAYMENTS =====
  async function depositReal() {
    try {
      await ensureAuth();

      const amountStr = prompt("Введите сумму пополнения:");
      if (amountStr === null) return;

      const amount = Number(amountStr);
      if (!amount || amount <= 0) {
        alert("Введите корректную сумму.");
        beep(240, 80, 0.03);
        return;
      }

      const created = await api("/deposit/create", {
        method: "POST",
        body: JSON.stringify({ amount })
      });

      await api("/deposit/confirm-test", {
        method: "POST",
        body: JSON.stringify({ depositId: created.depositId })
      });

      await syncBalanceUI();

      beep(760, 70, 0.03);
      setTimeout(() => beep(920, 70, 0.03), 90);

      alert(`Баланс пополнен на ${amount} ₽`);
    } catch (e) {
      console.error(e);
      alert("Ошибка пополнения: " + e.message);
      beep(240, 80, 0.03);
    }
  }

  async function withdrawReal() {
    try {
      await ensureAuth();

      const balance = await fetchBalance();

      const amountStr = prompt("Введите сумму вывода:");
      if (amountStr === null) return;

      const amount = Number(amountStr);
      if (!amount || amount <= 0) {
        alert("Введите корректную сумму.");
        beep(240, 80, 0.03);
        return;
      }

      if (amount > balance) {
        alert("Недостаточно средств.");
        beep(240, 80, 0.03);
        return;
      }

      const requisites = prompt("Введите реквизиты для тестового вывода:", "test-card");
      if (requisites === null) return;

      const created = await api("/withdraw/create", {
        method: "POST",
        body: JSON.stringify({
          amount,
          requisites
        })
      });

      await api("/withdraw/confirm-test", {
        method: "POST",
        body: JSON.stringify({
          withdrawalId: created.withdrawalId
        })
      });

      await syncBalanceUI();

      beep(760, 70, 0.03);
      setTimeout(() => beep(520, 70, 0.03), 90);

      alert(`Вывод на ${amount} ₽ выполнен`);
    } catch (e) {
      console.error(e);
      alert("Ошибка вывода: " + e.message);
      beep(240, 80, 0.03);
    }
  }

  function initPaymentButtons() {
    $("depositBtn")?.addEventListener("click", depositReal);
    $("withdrawBtn")?.addEventListener("click", withdrawReal);
    $("depositBtnMobile")?.addEventListener("click", depositReal);
    $("withdrawBtnMobile")?.addEventListener("click", withdrawReal);
    $("depositBanner")?.addEventListener("click", (e) => {
      e.preventDefault();
      depositReal();
    });
  }

  // ===== ONLINE COUNTER =====
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function hashNoise(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  function getDayKey(date = new Date()) {
    return Number(
      `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`
    );
  }

  function getBucketTs(ts = Date.now()) {
    const step = 5 * 60 * 1000;
    return Math.floor(ts / step) * step;
  }

  function getMinutesOfDay(date = new Date()) {
    return date.getHours() * 60 + date.getMinutes();
  }

  function getOnlineCurveBase(date = new Date()) {
    const m = getMinutesOfDay(date);

    const points = [
      { m: 0, val: 128 },
      { m: 180, val: 102 },
      { m: 300, val: 92 },
      { m: 420, val: 126 },
      { m: 540, val: 170 },
      { m: 660, val: 214 },
      { m: 780, val: 246 },
      { m: 900, val: 292 },
      { m: 1020, val: 348 },
      { m: 1140, val: 392 },
      { m: 1260, val: 322 },
      { m: 1380, val: 236 },
      { m: 1439, val: 198 }
    ];

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];

      if (m >= a.m && m <= b.m) {
        const t = (m - a.m) / Math.max(1, b.m - a.m);
        return Math.round(lerp(a.val, b.val, t));
      }
    }

    return 180;
  }

  function computeLiveOnline(date = new Date()) {
    const dayKey = getDayKey(date);
    const bucketIndex = Math.floor(getBucketTs(date.getTime()) / (5 * 60 * 1000));
    const base = getOnlineCurveBase(date);

    const n1 = hashNoise(dayKey * 0.137 + bucketIndex * 1.173);
    const n2 = hashNoise(dayKey * 0.071 + bucketIndex * 2.417);
    const n3 = hashNoise(dayKey * 0.049 + bucketIndex * 0.619);

    const waveShort = Math.sin(bucketIndex * 0.85 + dayKey * 0.003) * 16;
    const waveMid = Math.sin(bucketIndex * 0.31 + dayKey * 0.009) * 24;
    const jitter = (n1 - 0.5) * 34 + (n2 - 0.5) * 22 + (n3 - 0.5) * 14;

    let value = Math.round(base + waveShort + waveMid + jitter);

    if (date.getHours() >= 18 && date.getHours() <= 22) value += 6;
    if (date.getHours() >= 2 && date.getHours() <= 5) value -= 10;

    return clamp(value, 90, 400);
  }

  function readOnlineState() {
    try {
      return JSON.parse(localStorage.getItem(ONLINE_STATE_KEY) || "null");
    } catch {
      return null;
    }
  }

  function writeOnlineState(state) {
    try {
      localStorage.setItem(ONLINE_STATE_KEY, JSON.stringify(state));
    } catch {}
  }

  function getNextOnlineUpdateTs(fromTs = Date.now()) {
    return getBucketTs(fromTs) + 5 * 60 * 1000;
  }

  function getLiveOnlineValue() {
    const nowTs = Date.now();
    const state = readOnlineState();

    if (
      state &&
      Number.isFinite(state.value) &&
      Number.isFinite(state.nextUpdateTs) &&
      nowTs < state.nextUpdateTs
    ) {
      return state.value;
    }

    const newValue = computeLiveOnline(new Date(nowTs));

    writeOnlineState({
      value: newValue,
      nextUpdateTs: getNextOnlineUpdateTs(nowTs)
    });

    return newValue;
  }

  function renderOnline() {
    const value = getLiveOnlineValue();

    [$("onlineCount"), $("onlineCountMobile")]
      .filter(Boolean)
      .forEach((el) => {
        el.textContent = String(value);
      });
  }

  function initOnlineCounter() {
    renderOnline();

    setInterval(() => {
      renderOnline();
    }, 60 * 1000);
  }

  // ===== MODALS =====
  const modals = {
    free: $("freeModal"),
    promo: $("promoModal"),
    support: $("supportModal")
  };

  function openModal(name) {
    const modal = modals[name];
    if (!modal) return;

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    beep(520, 50, 0.02);
  }

  function closeModal(name) {
    const modal = modals[name];
    if (!modal) return;

    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    beep(420, 50, 0.02);
  }

  // ===== ACTIVE STATES =====
  function setActiveInGroup(selector, activeEl) {
    $$(selector).forEach((el) => {
      el.classList.toggle("active", el === activeEl);
    });
  }

  function clearActiveInGroup(selector) {
    $$(selector).forEach((el) => el.classList.remove("active"));
  }

  function setSideActive(el) {
    if (!el) return;
    setActiveInGroup(".sideIcon, .sideItem", el);
  }

  function setBottomActive(el) {
    if (!el) return;
    setActiveInGroup(".mobileBottomNav__item", el);
  }

  function setHeaderActive(el) {
    if (!el) return;
    setActiveInGroup(".navPill, .topNavLink", el);
  }

  function syncActiveByModal(name) {
    const headerMap = {
      promo: document.querySelector('.topNavLink[data-open="promo"], .navPill[data-open="promo"]'),
      support: document.querySelector('.topNavLink[data-open="support"], .navPill[data-open="support"]'),
      free: document.querySelector('.topNavLink[data-open="free"], .navPill[data-open="free"]')
    };

    const sideMap = {
      promo: document.querySelector('.sideIcon[data-open="promo"], .sideItem[data-open="promo"]'),
      support: document.querySelector('.sideIcon[data-open="support"], .sideItem[data-open="support"]'),
      free: document.querySelector('.sideIcon[data-open="free"], .sideItem[data-open="free"]')
    };

    const bottomMap = {
      promo: document.querySelector('.mobileBottomNav__item[data-open="promo"]'),
      support: document.querySelector('.mobileBottomNav__item[data-open="support"]'),
      free: document.querySelector('.mobileBottomNav__item[data-open="free"]')
    };

    clearActiveInGroup(".topNavLink");
    clearActiveInGroup(".mobileBottomNav__item");
    clearActiveInGroup(".sideIcon");
    clearActiveInGroup(".sideItem");

    if (headerMap[name]) setHeaderActive(headerMap[name]);
    if (sideMap[name]) setSideActive(sideMap[name]);
    if (bottomMap[name]) setBottomActive(bottomMap[name]);
  }

  function updateMenuStateByTarget(targetSelector) {
    if (!targetSelector) return;

    clearActiveInGroup(".topNavLink");
    clearActiveInGroup(".mobileBottomNav__item");
    clearActiveInGroup(".sideIcon");
    clearActiveInGroup(".sideItem");

    if (targetSelector === "#heroTop") {
      const sideHome = document.querySelector('.sideIcon[data-jump="#heroTop"], .sideItem[data-jump="#heroTop"]');
      const bottomHome = document.querySelector('.mobileBottomNav__item[data-jump="#heroTop"]');
      const headerHome = document.querySelector('.topNavLink[data-jump="#heroTop"]');

      if (sideHome) setSideActive(sideHome);
      if (bottomHome) setBottomActive(bottomHome);
      if (headerHome) setHeaderActive(headerHome);
      return;
    }

    if (targetSelector === "#featuredSec") {
      const sideFeatured = document.querySelector('.sideIcon[data-jump="#featuredSec"], .sideItem[data-jump="#featuredSec"]');
      const headerFeatured = document.querySelector('.topNavLink[data-jump="#featuredSec"]');

      if (sideFeatured) setSideActive(sideFeatured);
      if (headerFeatured) setHeaderActive(headerFeatured);
      return;
    }

    if (targetSelector === "#gamesSec" || targetSelector === "#games") {
      const headerGames = document.querySelector('.topNavLink[data-jump="#gamesSec"], .navPill[data-jump="#gamesSec"], .navPill[data-jump="#games"]');
      const sideGames = document.querySelector('.sideIcon[data-jump="#gamesSec"], .sideItem[data-jump="#gamesSec"]');
      const bottomGames = document.querySelector('.mobileBottomNav__item[data-jump="#gamesSec"]');

      if (headerGames) setHeaderActive(headerGames);
      if (sideGames) setSideActive(sideGames);
      if (bottomGames) setBottomActive(bottomGames);
    }
  }

  // ===== SIDEBAR =====
  function openSidebar() {
    if (!mainLayout) return;
    mainLayout.classList.remove("layout--sidebar-closed");
    menuBtn?.classList.add("active");
    menuBtnMobile?.classList.add("active");
  }

  function closeSidebar() {
    if (!mainLayout) return;
    mainLayout.classList.add("layout--sidebar-closed");
    menuBtn?.classList.remove("active");
    menuBtnMobile?.classList.remove("active");
  }

  function toggleSidebar() {
    if (!mainLayout) return;
    const closed = mainLayout.classList.contains("layout--sidebar-closed");
    if (closed) openSidebar();
    else closeSidebar();
    beep(520, 45, 0.02);
  }

  function initSidebar() {
    if (!mainLayout) return;

    menuBtn?.addEventListener("click", toggleSidebar);
    menuBtnMobile?.addEventListener("click", toggleSidebar);

    if (window.innerWidth > 1180) {
      closeSidebar();
    }

    window.addEventListener("resize", () => {
      if (window.innerWidth <= 1180) {
        closeSidebar();
      }
    });
  }

  // ===== MODAL INIT =====
  function initModals() {
    $("freeClose")?.addEventListener("click", () => closeModal("free"));
    $("promoClose")?.addEventListener("click", () => closeModal("promo"));
    $("supportClose")?.addEventListener("click", () => closeModal("support"));

    Object.entries(modals).forEach(([name, modal]) => {
      modal?.addEventListener("click", (e) => {
        if (e.target?.dataset?.close) {
          closeModal(name);
        }
      });
    });

    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;

      Object.entries(modals).forEach(([name, modal]) => {
        if (modal?.classList.contains("open")) {
          closeModal(name);
        }
      });
    });

    $$("[data-open]").forEach((el) => {
      el.addEventListener("click", (e) => {
        const name = el.getAttribute("data-open");
        if (!name) return;

        e.preventDefault();
        openModal(name);
        syncActiveByModal(name);
      });
    });
  }

  // ===== JUMPS =====
  function initJumpButtons() {
    $$("[data-jump]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();

        const selector = btn.getAttribute("data-jump");
        const target = selector ? document.querySelector(selector) : null;

        if (target) {
          target.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }

        if (btn.classList.contains("topNavLink") || btn.classList.contains("navPill")) {
          setHeaderActive(btn);
        }

        if (btn.classList.contains("sideIcon") || btn.classList.contains("sideItem")) {
          setSideActive(btn);
        }

        if (btn.classList.contains("mobileBottomNav__item")) {
          setBottomActive(btn);
        }

        updateMenuStateByTarget(selector);
        beep(520, 45, 0.02);
      });
    });
  }

  // ===== PRESS FEEDBACK =====
  function initPressFeedback() {
    $$(".pressable").forEach((el) => {
      el.addEventListener("pointerdown", () => {
        el.classList.add("is-pressed");
      });

      const clear = () => el.classList.remove("is-pressed");
      el.addEventListener("pointerup", clear);
      el.addEventListener("pointerleave", clear);
      el.addEventListener("pointercancel", clear);
    });
  }

  // ===== PROMO =====
  function initPromo() {
    $("promoApply")?.addEventListener("click", async () => {
      const input = ($("promoInput")?.value || "").trim().toUpperCase();
      const msg = $("promoMsg");

      if (!input) {
        if (msg) msg.textContent = "Введите промокод.";
        beep(240, 80, 0.03);
        return;
      }

      let used = {};
      try {
        used = JSON.parse(localStorage.getItem(PROMO_KEY_USED) || "{}");
      } catch {}

      if (used[input]) {
        if (msg) msg.textContent = "Этот промокод уже использован.";
        beep(240, 80, 0.03);
        return;
      }

      const reward = PROMOS[input];
      if (!reward) {
        if (msg) msg.textContent = "Неверный промокод.";
        beep(240, 80, 0.03);
        return;
      }

      used[input] = 1;
      localStorage.setItem(PROMO_KEY_USED, JSON.stringify(used));

      try {
        await ensureAuth();

        const created = await api("/deposit/create", {
          method: "POST",
          body: JSON.stringify({ amount: reward })
        });

        await api("/deposit/confirm-test", {
          method: "POST",
          body: JSON.stringify({ depositId: created.depositId })
        });

        await syncBalanceUI();

        if (msg) msg.textContent = `Промокод активирован: +${reward} ₽ ✅`;

        beep(760, 70, 0.03);
        setTimeout(() => beep(920, 70, 0.03), 90);
      } catch (e) {
        console.error(e);
        if (msg) msg.textContent = "Ошибка активации промокода.";
        beep(240, 80, 0.03);
      }
    });
  }

  // ===== DAILY WHEEL =====
  function rngInt(n) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  }

  function getNextTs() {
    const value = Number(localStorage.getItem(DAILY_NEXT_KEY) || 0);
    return Number.isFinite(value) ? value : 0;
  }

  function setNextTs24h() {
    const next = Date.now() + 24 * 60 * 60 * 1000;
    localStorage.setItem(DAILY_NEXT_KEY, String(next));
    return next;
  }

  function canSpinNow() {
    return Date.now() >= getNextTs();
  }

  function fmt(ms) {
    const safe = Math.max(0, ms);
    const s = Math.floor(safe / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function renderTimer() {
    const timer = $("dailyTimer");
    if (!timer) return;
    timer.textContent = canSpinNow() ? "00:00:00" : fmt(getNextTs() - Date.now());
  }

  function renderPrizes() {
    const prizeList = $("prizeList");
    if (!prizeList) return;

    prizeList.innerHTML = "";
    PRIZES.forEach((p) => {
      const el = document.createElement("div");
      el.className = "prizeItem";
      el.innerHTML = `<div class="p">${p.label}</div><div class="t">в кошелёк</div>`;
      prizeList.appendChild(el);
    });
  }

  function drawWheel() {
    const wheelCanvas = $("dailyWheel");
    if (!wheelCanvas) return;

    const ctx = wheelCanvas.getContext("2d");
    if (!ctx) return;

    const W = wheelCanvas.width;
    const H = wheelCanvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const r = Math.min(W, H) * 0.48;

    ctx.clearRect(0, 0, W, H);

    const n = PRIZES.length;
    const step = (Math.PI * 2) / n;

    const colors = [
      "rgba(76,125,255,.35)",
      "rgba(255,86,186,.30)",
      "rgba(54,220,170,.28)",
      "rgba(255,196,66,.28)",
      "rgba(176,64,255,.30)",
      "rgba(76,125,255,.28)"
    ];

    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + i * step;
      const a1 = a0 + step;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.closePath();

      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,.14)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a0 + step / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,255,255,.95)";
      ctx.font = "950 26px ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial";
      ctx.fillText(PRIZES[i].label, r - 16, 10);
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,.18)";
    ctx.lineWidth = 6;
    ctx.stroke();
  }

  function spinToIndex(winIndex) {
    const wheelCanvas = $("dailyWheel");

    return new Promise((resolve) => {
      if (!wheelCanvas) {
        resolve();
        return;
      }

      const n = PRIZES.length;
      const step = (Math.PI * 2) / n;
      const ideal = -((winIndex + 0.5) * step);
      const fullTurns = 5 + rngInt(3);
      const target = lastRotation + fullTurns * (Math.PI * 2) + ideal;

      wheelCanvas.style.transition = "transform 1400ms cubic-bezier(.16,.9,.18,1)";
      wheelCanvas.style.transform = `rotate(${target}rad)`;

      const onEnd = () => {
        wheelCanvas.removeEventListener("transitionend", onEnd);
        lastRotation = target % (Math.PI * 2);
        resolve();
      };

      wheelCanvas.addEventListener("transitionend", onEnd, { once: true });
    });
  }

  async function onSpin() {
    const spinBtn = $("spinBtn");
    const wheelCenterTxt = $("wheelCenterTxt");
    const wheelCenterSub = $("wheelCenterSub");
    const dailyMsg = $("dailyMsg");

    if (spinning) return;

    if (!canSpinNow()) {
      renderTimer();
      if (dailyMsg) dailyMsg.textContent = "Пока нельзя. Дождись таймера 😉";
      beep(220, 90, 0.03);
      return;
    }

    spinning = true;
    if (spinBtn) spinBtn.disabled = true;

    if (wheelCenterTxt) wheelCenterTxt.textContent = "…";
    if (wheelCenterSub) wheelCenterSub.textContent = "крутим";
    if (dailyMsg) dailyMsg.textContent = "Крутим колесо…";
    beep(520, 55, 0.02);

    const winIndex = rngInt(PRIZES.length);
    await spinToIndex(winIndex);

    const prize = PRIZES[winIndex];

    try {
      await ensureAuth();

      if (prize.coins > 0) {
        const created = await api("/deposit/create", {
          method: "POST",
          body: JSON.stringify({ amount: prize.coins })
        });

        await api("/deposit/confirm-test", {
          method: "POST",
          body: JSON.stringify({ depositId: created.depositId })
        });
      }

      await syncBalanceUI();
    } catch (e) {
      console.error(e);
    }

    setNextTs24h();
    renderTimer();

    if (wheelCenterTxt) wheelCenterTxt.textContent = `+${prize.coins}`;
    if (wheelCenterSub) wheelCenterSub.textContent = "₽ начислено";
    if (dailyMsg) dailyMsg.textContent = `Выпало: ${prize.label} — начислено ✅`;

    beep(760, 70, 0.03);
    setTimeout(() => beep(920, 70, 0.03), 90);

    spinning = false;
    if (spinBtn) spinBtn.disabled = false;
  }

  function initWheel() {
    $("spinBtn")?.addEventListener("click", onSpin);
  }

  // ===== SOCIAL =====
  function renderSocial() {
    const vkDone = localStorage.getItem(VK_KEY) === "1";
    const tgDone = localStorage.getItem(TG_KEY) === "1";

    if ($("vkState")) $("vkState").textContent = vkDone ? "Получено ✅" : "Не получено";
    if ($("tgState")) $("tgState").textContent = tgDone ? "Получено ✅" : "Не получено";

    if ($("claimVK")) $("claimVK").disabled = vkDone;
    if ($("claimTG")) $("claimTG").disabled = tgDone;
  }

  async function claimOnce(key, amount) {
    if (localStorage.getItem(key) === "1") return;

    try {
      await ensureAuth();

      const created = await api("/deposit/create", {
        method: "POST",
        body: JSON.stringify({ amount })
      });

      await api("/deposit/confirm-test", {
        method: "POST",
        body: JSON.stringify({ depositId: created.depositId })
      });

      localStorage.setItem(key, "1");
      renderSocial();
      await syncBalanceUI();

      beep(760, 70, 0.03);
      setTimeout(() => beep(920, 70, 0.03), 90);
    } catch (e) {
      console.error(e);
      alert("Ошибка начисления бонуса");
    }
  }

  function initSocial() {
    $("claimVK")?.addEventListener("click", () => claimOnce(VK_KEY, 10));
    $("claimTG")?.addEventListener("click", () => claimOnce(TG_KEY, 10));
  }

  // ===== TABS =====
  function setTab(which) {
    const daily = which === "daily";

    $("tabDaily")?.classList.toggle("active", daily);
    $("tabSocial")?.classList.toggle("active", !daily);
    $("paneDaily")?.classList.toggle("hidden", !daily);
    $("paneSocial")?.classList.toggle("hidden", daily);

    beep(520, 45, 0.02);
  }

  function initTabs() {
    $("tabDaily")?.addEventListener("click", () => setTab("daily"));
    $("tabSocial")?.addEventListener("click", () => setTab("social"));
  }

  function initSupportButtons() {
    $$('[data-beep="1"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        beep(520, 55, 0.02);
      });
    });
  }

  function initFocusSync() {
    window.addEventListener("focus", async () => {
      try {
        await syncBalanceUI();
        renderTimer();
        renderSocial();
        renderOnline();
      } catch {}
    });
  }

  // ===== INIT =====
  async function init() {
    if (!localStorage.getItem(DAILY_NEXT_KEY)) {
      localStorage.setItem(DAILY_NEXT_KEY, "0");
    }

    initPressFeedback();
    initSidebar();
    initPaymentButtons();
    initModals();
    initJumpButtons();
    initPromo();
    initWheel();
    initSocial();
    initTabs();
    initSupportButtons();
    initFocusSync();
    initOnlineCounter();

    renderPrizes();
    drawWheel();
    renderTimer();
    renderSocial();
    renderOnline();

    const wheelCanvas = $("dailyWheel");
    if (wheelCanvas) {
      wheelCanvas.style.transform = "rotate(0rad)";
      wheelCanvas.style.transformOrigin = "50% 50%";
    }

    try {
      await ensureAuth();
      await syncBalanceUI();
    } catch (e) {
      console.error("Init auth error:", e);
    }

    setInterval(() => {
      renderTimer();
    }, 1000);
  }

  init();
})();