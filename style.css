:root{
  --bg0:#070b16;
  --bg1:#0a1024;
  --panel: rgba(255,255,255,.06);
  --panel2: rgba(255,255,255,.08);
  --stroke: rgba(255,255,255,.10);
  --stroke2: rgba(255,255,255,.14);
  --text:#eaf1ff;
  --muted: rgba(234,241,255,.72);
  --muted2: rgba(234,241,255,.55);
  --blue:#4c7dff;
  --blue2:#2b5cff;
  --red:#ff5a66;
  --green:#33d17a;
  --yellow:#ffcc66;
  --shadow: 0 18px 55px rgba(0,0,0,.45);
  --shadow2: 0 10px 28px rgba(0,0,0,.35);
  --r: 18px;
  --r2: 14px;
  --maxW: 1100px;
}

*{box-sizing:border-box}
html,body{height:100%}
body{
  margin:0;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Apple Color Emoji","Segoe UI Emoji";
  color:var(--text);
  background: radial-gradient(1200px 700px at 20% 20%, rgba(76,125,255,.20), transparent 60%),
              radial-gradient(900px 700px at 80% 30%, rgba(255,90,102,.14), transparent 65%),
              radial-gradient(1100px 800px at 50% 90%, rgba(51,209,122,.10), transparent 60%),
              linear-gradient(180deg, var(--bg0), var(--bg1));
  overflow-x:hidden;
}

.bg{
  position:fixed; inset:0;
  pointer-events:none;
  background:
    radial-gradient(1000px 650px at 15% 15%, rgba(76,125,255,.14), transparent 60%),
    radial-gradient(900px 650px at 85% 25%, rgba(255,90,102,.10), transparent 60%),
    radial-gradient(900px 650px at 50% 95%, rgba(51,209,122,.08), transparent 60%);
  filter: blur(0px);
  opacity:1;
}

.wrap{
  max-width: var(--maxW);
  margin: 18px auto 28px;
  padding: 0 14px;
}

/* TOP */
.top{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  padding: 14px 16px;
  border-radius: var(--r);
  background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.04));
  border: 1px solid var(--stroke);
  box-shadow: var(--shadow2);
}
.title{font-weight:900; letter-spacing:.2px}
.subtitle{font-size:12px; opacity:.78; margin-top:2px}

.pill{
  min-width: 140px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(0,0,0,.20);
  border: 1px solid var(--stroke);
  text-align:right;
}
.pill__label{font-size:11px; opacity:.75}
.pill__value{font-size:14px; font-weight:900; margin-top:3px}

/* GRID */
.grid{
  margin-top: 14px;
  display:grid;
  grid-template-columns: 1.25fr .75fr;
  gap: 14px;
}
@media (max-width: 980px){
  .grid{grid-template-columns:1fr; }
}

/* CARD */
.card{
  border-radius: var(--r);
  background: linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.04));
  border: 1px solid var(--stroke);
  box-shadow: var(--shadow);
  overflow:hidden;
}
.card--game{
  padding: 12px;
}
.card--bet{
  padding: 12px;
}

/* HUD */
.hud{
  display:grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  padding: 6px 4px 12px;
}
@media (max-width: 980px){
  .hud{grid-template-columns: repeat(2, 1fr);}
}
.hud__item{
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(0,0,0,.18);
  border: 1px solid var(--stroke);
}
.hud__label{font-size:11px; opacity:.75}
.hud__value{margin-top:3px; font-weight:900; font-size:13px}

/* ARENA */
.arena{
  position:relative;
  border-radius: var(--r);
  background:
    radial-gradient(700px 380px at 50% 40%, rgba(255,255,255,.06), transparent 70%),
    linear-gradient(180deg, rgba(0,0,0,.18), rgba(0,0,0,.30));
  border: 1px solid rgba(255,255,255,.08);
  padding: 14px;
  min-height: 420px;
}

.arena__grid{
  position:absolute; inset:12px;
  border-radius: 16px;
  background:
    linear-gradient(to right, rgba(255,255,255,.06) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255,255,255,.06) 1px, transparent 1px);
  background-size: 52px 52px;
  opacity:.25;
  mask-image: radial-gradient(circle at 50% 40%, rgba(0,0,0,1), rgba(0,0,0,.15) 70%, transparent 100%);
  pointer-events:none;
}

/* STAGE */
.stage{
  position:relative;
  display:grid;
  grid-template-columns: 1fr auto 1fr;
  align-items:center;
  gap: 12px;
  margin-top: 6px;
  padding: 10px 8px;
}
@media (max-width: 720px){
  .stage{grid-template-columns:1fr; gap:14px;}
}

.side{
  display:flex;
  flex-direction:column;
  align-items:center;
  gap: 10px;
}
.side__label{
  font-weight:900;
  opacity:.85;
  font-size:12px;
  letter-spacing:.2px;
}
.mini{
  font-size:12px;
  opacity:.78;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.09);
}

.center{
  display:flex;
  flex-direction:column;
  align-items:center;
  gap: 10px;
  min-width: 200px;
}
.mult{
  text-align:center;
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.09);
  box-shadow: 0 10px 28px rgba(0,0,0,.25);
}
.mult__big{font-size:20px; font-weight:1000; letter-spacing:.2px}
.mult__small{font-size:12px; opacity:.78; margin-top:4px}
.vs{
  display:flex; align-items:center; gap:10px;
  opacity:.9;
}
.vs__text{
  font-weight:1000;
  letter-spacing:1px;
  font-size:12px;
}
.vs__dot{
  width:8px;height:8px;border-radius:50%;
  background: rgba(255,255,255,.35);
}

/* 3D HAND */
.hand3d{
  width: 150px;
  height: 170px;
  position:relative;
  perspective: 700px;
}
.hand3d__shadow{
  position:absolute;
  left:50%; top: 132px;
  width: 120px; height: 26px;
  transform: translateX(-50%);
  background: radial-gradient(circle, rgba(0,0,0,.55), transparent 65%);
  filter: blur(1px);
  opacity: .55;
}
.hand3d__card{
  position:absolute;
  inset: 0;
  margin:auto;
  width: 150px;
  height: 150px;
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.05));
  border: 1px solid rgba(255,255,255,.10);
  box-shadow: 0 18px 40px rgba(0,0,0,.35);
  transform: rotateX(14deg) rotateY(-16deg) translateZ(0);
  transform-style:preserve-3d;
  display:flex;
  align-items:center;
  justify-content:center;
  overflow:hidden;
}
.side--bot .hand3d__card{ transform: rotateX(14deg) rotateY(16deg); }

.hand3d__card::before{
  content:"";
  position:absolute; inset:-1px;
  background: radial-gradient(260px 180px at 20% 20%, rgba(76,125,255,.22), transparent 60%),
              radial-gradient(260px 180px at 80% 30%, rgba(255,90,102,.18), transparent 60%);
  opacity:.75;
  pointer-events:none;
}
.hand3d__face{
  position:relative;
  z-index:2;
  font-size: 58px;
  font-weight: 900;
  transform: translateZ(40px);
  text-shadow: 0 10px 22px rgba(0,0,0,.35);
  user-select:none;
}

/* shuffle animation (hands) */
@keyframes shuffle {
  0%   { transform: rotateX(14deg) rotateY(-16deg) translateY(0) translateZ(0); }
  15%  { transform: rotateX(22deg) rotateY(-30deg) translateY(-8px) translateZ(6px); }
  35%  { transform: rotateX(10deg) rotateY(-6deg) translateY(0) translateZ(0); }
  55%  { transform: rotateX(24deg) rotateY(-26deg) translateY(-10px) translateZ(8px); }
  100% { transform: rotateX(14deg) rotateY(-16deg) translateY(0) translateZ(0); }
}
@keyframes shuffleBot {
  0%   { transform: rotateX(14deg) rotateY(16deg) translateY(0) translateZ(0); }
  15%  { transform: rotateX(22deg) rotateY(30deg) translateY(-8px) translateZ(6px); }
  35%  { transform: rotateX(10deg) rotateY(6deg) translateY(0) translateZ(0); }
  55%  { transform: rotateX(24deg) rotateY(26deg) translateY(-10px) translateZ(8px); }
  100% { transform: rotateX(14deg) rotateY(16deg) translateY(0) translateZ(0); }
}
.hand3d.isShuffle .hand3d__card{ animation: shuffle .72s ease-in-out both; }
.side--bot .hand3d.isShuffle .hand3d__card{ animation: shuffleBot .72s ease-in-out both; }

@keyframes revealPop{
  0%{ transform: translateZ(40px) scale(.92); filter: blur(.4px); opacity:.8;}
  100%{ transform: translateZ(40px) scale(1); filter: blur(0); opacity:1;}
}
.hand3d.isReveal .hand3d__face{ animation: revealPop .18s ease-out both; }

/* CHOICES */
.choices{
  margin-top: 12px;
  display:flex;
  gap: 10px;
  justify-content:center;
  flex-wrap:wrap;
}
.chip{
  display:flex;
  align-items:center;
  gap:10px;
  padding: 12px 14px;
  border-radius: 999px;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.12);
  color: var(--text);
  cursor:pointer;
  font-weight: 900;
  transition: transform .08s ease, background .12s ease, border-color .12s ease;
  user-select:none;
}
.chip:active{transform: scale(.98);}
.chip__icon{font-size:18px}
.chip__text{font-size:13px; opacity:.95}

.chip--r:hover{border-color: rgba(255,90,102,.40); background: rgba(255,90,102,.09);}
.chip--s:hover{border-color: rgba(255,204,102,.40); background: rgba(255,204,102,.09);}
.chip--p:hover{border-color: rgba(76,125,255,.45); background: rgba(76,125,255,.09);}

.chip.isActive{
  outline: 2px solid rgba(76,125,255,.55);
}

/* Hint */
.hint{
  margin-top: 10px;
  text-align:center;
  font-size: 12px;
  opacity:.72;
}

/* BET PANEL */
.betHead{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap: 10px;
  padding-bottom: 10px;
}
.betTitle{font-weight:1000}
.betSub{font-size:12px; opacity:.72; margin-top:4px}

.bets{padding: 0 2px 2px;}
.row{display:flex; gap:10px; align-items:center;}
.row--chips{flex-wrap:wrap; gap:8px; margin-top: 10px;}
.row--bet{margin-top: 10px;}
.row--actions{margin-top: 12px;}

.pillBtn{
  padding: 8px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.06);
  color: var(--text);
  cursor:pointer;
  font-weight:900;
  font-size:12px;
}
.pillBtn:active{transform:scale(.98);}

.input{
  flex:1;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.06);
  color: var(--text);
  outline:none;
}

.btn{
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.06);
  color: var(--text);
  border-radius: 14px;
  padding: 12px 12px;
  cursor:pointer;
  font-weight:1000;
  transition: transform .08s ease, background .12s ease, border-color .12s ease, opacity .12s ease;
}
.btn:active{transform:scale(.98);}
.btn--primary{
  background: linear-gradient(180deg, rgba(76,125,255,.95), rgba(46,92,255,.75));
  border-color: rgba(76,125,255,.45);
}
.btn--ghost{ background: rgba(255,255,255,.05); }
.btn--square{ width: 44px; padding: 12px 0; border-radius: 12px; }
.btn--tiny{ padding: 8px 10px; border-radius: 12px; font-size: 12px; }

.btn:disabled{opacity:.55; cursor:not-allowed;}

.logline{
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(0,0,0,.18);
  border: 1px solid rgba(255,255,255,.10);
  font-weight: 900;
}
.smallNote{
  margin-top: 10px;
  font-size: 12px;
  opacity: .70;
  line-height:1.25;
}
.soundRow{margin-top: 12px; display:flex; justify-content:flex-start;}

/* FOOT */
.foot{
  margin-top: 10px;
  display:flex;
  justify-content:flex-end;
  opacity:.7;
}
.muted{font-size:12px}

/* RESULT COLOR STATES (JS toggles these classes on #arena) */
.arena.isWin{
  box-shadow: 0 0 0 1px rgba(51,209,122,.24) inset, 0 24px 70px rgba(51,209,122,.10);
}
.arena.isLose{
  box-shadow: 0 0 0 1px rgba(255,90,102,.22) inset, 0 24px 70px rgba(255,90,102,.10);
}
.arena.isDraw{
  box-shadow: 0 0 0 1px rgba(255,204,102,.18) inset, 0 24px 70px rgba(255,204,102,.08);
}
