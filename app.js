"use strict";

const REFRESH_MS = 10 * 60 * 1000; // re-check data every 10 minutes

function medal(rank){ return rank===1?"🥇":rank===2?"🥈":rank===3?"🥉":""; }

function prizeFor(rank, total){
  const map={1:"$200 — WIN",2:"$150 — 2nd",3:"$100 — 3rd",4:"$50 — 4th",5:"$25 — 5th"};
  if(map[rank]) return map[rank];
  if(rank===total) return "$100 — last (🏫)";
  if(rank===total-1) return "$50 — 2nd-last (🏫)";
  return "";
}

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
  return `<article class="card ${isPrize?"prize":""} ${isDud?"dud":""} ${expanded?"open":""}">
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

/* ---------------- Boot ---------------- */
function render(data){
  document.getElementById("updatedStamp").textContent=data.updated;
  document.getElementById("confList").textContent="Conferences: "+data.conferences.map(c=>c.label).join(" · ");
  renderBoard(data);
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
load();
setInterval(load,REFRESH_MS);