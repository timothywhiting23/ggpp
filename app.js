"use strict";

const REFRESH_MS = 10 * 60 * 1000; // re-check data every 10 minutes
const WEEK_PALETTE = [
  "#640111", "#d18f2e", "#2a7f7f", "#2f5f8f", "#7b2f8f", "#c96b2f",
  "#2e7d4f", "#6b4a2f", "#a0528f", "#3e7fa8", "#c2654f", "#4f9e7d",
  "#a08a3e", "#6e4f8a", "#7aa13e", "#8f5f3e"
];

function medal(rank){ return rank===1?"🥇":rank===2?"🥈":rank===3?"🥉":""; }

function prizeFor(rank, total){
  const map={1:"$200 — WIN",2:"$150 — 2nd",3:"$100 — 3rd",4:"$50 — 4th",5:"$25 — 5th"};
  if(map[rank]) return map[rank];
  if(rank===total) return "$100 — last (🏫)";
  if(rank===total-1) return "$50 — 2nd-last (🏫)";
  return "";
}

function weekColor(i){ return WEEK_PALETTE[i % WEEK_PALETTE.length]; }

/* ---------------- Leaderboard ---------------- */
function pickRow(p){
  const m = (p.summary||"").split("-").map(Number);
  const has = p.summary && p.summary!=="n/a" && !isNaN(m[0]) && !isNaN(m[1]);
  const cls = has ? (m[0]>m[1]?"pwin": m[0]<m[1]?"ploss":"ptie") : "";
  const rec = has ? `${m[0]}-${m[1]}` : "—";
  return `<div class="pick">${p.logo?`<img src="${p.logo}" alt="" loading="lazy">`:`<div></div>`}
    <div class="cnf">${p.confLabel}</div>
    <div class="tm">${p.label}<small>${p.teamName}</small></div>
    <div class="${cls}">${rec}</div></div>`;
}

function playerCard(p, rank, total, expanded){
  const isPrize=rank<=5, isDud=rank>=total-1;
  const prize=prizeFor(rank,total);
  const recWins=p.picks.filter(x=>x.wins>0).length;
  const sub=recWins>0?`${recWins} of 10 teams have a win`+(expanded?"":" · tap for picks"):(expanded?"":"tap for picks");
  return `<article class="card ${isPrize?"prize":""} ${isDud?"dud":""} ${expanded?"open":""}>
    <div class="card-top">
      <div class="rank ${"r"+(rank<=3?rank:"x")}">${medal(rank)}${rank}</div>
      <div class="name"><h3>${p.name}</h3><div class="sub">${sub}</div>
        ${prize?`<span class="${isPrize?"prize-badge":"dud-tag"}">${prize}</span>`:""}</div>
      <div class="score"><div class="wins">${p.wins}<span class="loss">-${p.losses}</span></div><div class="lbl">record</div></div>
      <div class="rec">${p.games||0} gp</div>
      <div class="chev">▾</div></div>
    <div class="picks">${p.picks.map(pickRow).join("")}</div></article>`;
}

function renderBoard(data){
  const total=data.standings.length;
  const board=document.getElementById("board");
  board.innerHTML="";
  data.standings.forEach((p,i)=>{
    const el=document.createElement("div");
    el.innerHTML=playerCard(p,i+1,total,false);
    const art=el.firstElementChild;
    art.querySelector(".card-top").addEventListener("click",()=>art.classList.toggle("open"));
    board.appendChild(art);
  });
}

/* ---------------- Wins by Week chart ---------------- */
function renderWeekly(data){
  const el=document.getElementById("weeklyChart");
  const legend=document.getElementById("weeklyLegend");
  const series=data.weekSeries||[];
  const meta=data.weekMeta||[];
  if(!el) return;
  if(!series.length || !meta.length){
    el.innerHTML=`<div class="missing"><h2>No weekly data yet</h2><p>Wins will appear here as the season's games are played.</p></div>`;
    legend.innerHTML="";
    return;
  }

  const W=940, NAME_W=150, RIGHT=70, TOP=14, BOTTOM=30;
  const plotW=W-NAME_W-RIGHT;
  const rowH=22, rowGap=5, rowStep=rowH+rowGap;
  const maxW=Math.max(...series.map(s=>s.total),1);
  const H=TOP+series.length*rowStep+BOTTOM;
  const innerTop=TOP, innerBottom=TOP+series.length*rowStep;

  let s=`<line x1="${NAME_W}" y1="${innerTop}" x2="${NAME_W}" y2="${innerBottom}" stroke="#640111" stroke-width="1.2"/>`;
  for(let v=0;v<=maxW;v++){
    const x=NAME_W+v/maxW*plotW;
    s+=`<line x1="${x}" y1="${innerTop}" x2="${x}" y2="${innerBottom}" stroke="rgba(100,1,17,.10)" stroke-width="1"/>`;
    s+=`<text x="${x}" y="${innerBottom+BOTTOM-8}" text-anchor="middle" font-size="12" fill="#8a7064" font-weight="600">${v}</text>`;
  }
  series.forEach((p,i)=>{
    const y=TOP+i*rowStep;
    s+=`<text x="${NAME_W-10}" y="${y+rowH-7}" text-anchor="end" font-size="12.5" fill="#33201a" font-weight="700">${p.name}</text>`;
    let x=NAME_W;
    p.weeks.forEach((c,wi)=>{
      if(c<=0) return;
      const wpx=c/maxW*plotW;
      s+=`<rect x="${x}" y="${y+1}" width="${Math.max(wpx-1.5,1)}" height="${rowH-4}" rx="2.5" fill="${weekColor(wi)}">`
        +`<title>${p.name} — ${meta[wi]?meta[wi].label:"Week "+wi}: +${c} win${c>1?"s":""} (${p.total} total)</title></rect>`;
      x+=wpx;
    });
    s+=`<text x="${x+5}" y="${y+rowH-7}" font-size="12" fill="#640111" font-weight="800">${p.total}</text>`;
  });
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" preserveAspectRatio="xMidYMid meet">${s}</svg>`;

  legend.innerHTML=meta.map((m,i)=>
    `<span class="item"><span class="dot" style="background:${weekColor(i)}"></span>${m.label}</span>`
  ).join("");
}

/* ---------------- Tabs ---------------- */
function wireTabs(){
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click",()=>{
      document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b===btn));
      const showBoard=btn.dataset.target==="board";
      document.getElementById("board").hidden=!showBoard;
      const w=document.getElementById("weekly");
      w.hidden=showBoard;
      if(!showBoard && w.scrollIntoView) w.scrollIntoView({behavior:"smooth",block:"start"});
    });
  });
}

/* ---------------- Boot ---------------- */
function render(data){
  document.getElementById("updatedStamp").textContent=data.updated;
  document.getElementById("confList").textContent="Conferences: "+data.conferences.map(c=>c.label).join(" · ");
  renderBoard(data);
  renderWeekly(data);
}
function load(){
  fetch("./data.json",{cache:"no-store"})
    .then(r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.json();})
    .then(render)
    .catch(()=>{
      document.getElementById("board").innerHTML=
        `<div class="missing"><h2>Couldn't load the scoreboard</h2><p>Please refresh in a moment — scores are updating.</p></div>`;
    });
}
wireTabs();
load();
setInterval(load,REFRESH_MS);
