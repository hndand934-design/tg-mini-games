// ===== DATA =====
const ICONS = {
  rock: "✊🏻",
  scissors: "✌🏻",
  paper: "✋🏻"
};

const STEPS = [1,1.2,1.5,2,3,5,10];

let balance = 1000;
let bet = 100;
let picked = "rock";
let series = 0;

// ===== UI =====
const balanceEl = document.getElementById("balance");
const youIcon = document.getElementById("youIcon");
const botIcon = document.getElementById("botIcon");
const youPick = document.getElementById("youPick");
const botPick = document.getElementById("botPick");
const result = document.getElementById("result");
const status = document.getElementById("status");

const seriesEl = document.getElementById("series");
const multEl = document.getElementById("mult");
const potentialEl = document.getElementById("potential");
const winEl = document.getElementById("win");

const betInput = document.getElementById("bet");

// ===== LADDER =====
const ladder = document.getElementById("ladder");
STEPS.forEach((x,i)=>{
  const el = document.createElement("div");
  el.className="step"+(i===0?" active":"");
  el.innerHTML=`<div class="sTitle">${i===0?"Старт":"Шаг "+i}</div><div class="sX">x${x.toFixed(2)}</div>`;
  ladder.appendChild(el);
});

// ===== PICKS =====
document.querySelectorAll(".pickBtn").forEach(btn=>{
  btn.onclick=()=>{
    picked=btn.dataset.move;
    document.querySelectorAll(".pickBtn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    youIcon.textContent=ICONS[picked];
    youPick.textContent=btn.textContent.trim();
  };
});

// ===== BET =====
document.querySelectorAll(".chip").forEach(c=>{
  c.onclick=()=>{
    if(c.dataset.bet==="max") bet=balance;
    else bet=Number(c.dataset.bet);
    betInput.value=bet;
  };
});

document.getElementById("minus").onclick=()=>{
  bet=Math.max(1,bet-10);
  betInput.value=bet;
};
document.getElementById("plus").onclick=()=>{
  bet+=10;
  betInput.value=bet;
};

// ===== PLAY =====
document.getElementById("play").onclick=()=>{
  if(bet>balance) return;

  const moves=["rock","paper","scissors"];
  const bot=moves[Math.floor(Math.random()*3)];

  botIcon.textContent=ICONS[bot];
  botPick.textContent=bot;

  let win=0;

  if(picked===bot){
    status.textContent="Ничья";
    result.textContent="Ничья";
  }else if(
    (picked==="rock"&&bot==="scissors")||
    (picked==="scissors"&&bot==="paper")||
    (picked==="paper"&&bot==="rock")
  ){
    series++;
    const mult=STEPS[Math.min(series,STEPS.length-1)];
    win=Math.floor(bet*mult);
    result.textContent="Победа";
    status.textContent="Серия растёт";
    winEl.textContent=win+" ₽";
  }else{
    series=0;
    result.textContent="Поражение";
    status.textContent="Серия в ноль";
    winEl.textContent="0 ₽";
  }

  balance -= bet;
  balance += win;
  balanceEl.textContent=balance;

  seriesEl.textContent=series+" побед";
  multEl.textContent="x"+STEPS[Math.min(series,STEPS.length-1)].toFixed(2);
  potentialEl.textContent=Math.floor(bet*STEPS[Math.min(series,STEPS.length-1)])+" ₽";

  [...ladder.children].forEach((s,i)=>s.classList.toggle("active",i===series));
};
