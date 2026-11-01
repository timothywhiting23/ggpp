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
/* A pick is the "top pick" when it holds the best record available in its
   conference. Ties count: if three teams share a conference's best record,
   every one of them has maxed out that pick. Read from the ceiling block that
   the score fetcher already publishes, so no extra data is needed.
   The star always occupies a fixed-width slot (transparent when the pick is
   not a top pick) so record columns stay aligned. */
function ceilingByConf(data){
  const m = {};
  const rows = (data.ceiling && data.ceiling.rows) || [];
  rows.forEach(r => { if (r.wins != null) m[r.conf] = r; });
  return m;
}

function isTopPick(p, tops){
  const r = tops[p.conf];
  if (!r) return false;
  if (r.teamIds && r.teamIds.length) return r.teamIds.map(String).indexOf(String(p.teamId)) >= 0;
  return p.top === true || p.wins === r.wins;
}

const STAR_STYLE = "display:inline-block;width:10px;text-align:left;font-weight:800;font-size:14px;line-height:1;vertical-align:super";

function starFor(p, tops){
  const on = isTopPick(p, tops);
  const style = STAR_STYLE + ";color:" + (on ? "#640111" : "transparent");
  const attr = on ? ` title="Best record available in this conference — this pick has maxed out its points"` : ` aria-hidden="true"`;
  return `<span style="${style}"${attr}>*</span>`;
}

function pickRow(p, tops){
  const m = (p.summary||"").split("-").map(Number);
  const has = p.summary && p.summary!=="n/a" && !isNaN(m[0]) && !isNaN(m[1]);
  const cls = has ? (m[0]>m[1]?"pwin": m[0]<m[1]?"ploss":"ptie") : "";
  const rec = has ? `${m[0]}-${m[1]}` : "—";
  return `<div class="pick">${p.logo?`<img src="${p.logo}" alt="" loading="lazy">`:`<div></div>`}
    <div class="cnf">${p.confLabel}</div>
    <div class="tm">${p.label}<small>${p.teamName}</small></div>
    <div class="${cls}">${rec}${starFor(p,tops)}</div></div>`;
}

function playerCard(p, rank, total, expanded, tops){
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
    <div class="picks">${p.picks.map(k=>pickRow(k,tops)).join("")}</div></article>`;
}

function renderBoard(data){
  const total=data.standings.length;
  const board=document.getElementById("board");
  const tops=ceilingByConf(data);
  board.innerHTML="";
  data.standings.forEach((p,i)=>{
    const el=document.createElement("div");
    el.innerHTML=playerCard(p,i+1,total,false,tops);
    const art=el.firstElementChild;
    art.querySelector(".card-top").addEventListener("click",()=>art.classList.toggle("open"));
    board.appendChild(art);
  });
  if(data.standings.some(p=>p.picks.some(k=>isTopPick(k,tops)))){
    board.insertAdjacentHTML("beforeend",
      `<p style="text-align:center;color:#7a6258;font-size:12.5px;font-weight:600;margin:14px 8px 4px">`+
      `<span style="${STAR_STYLE};color:#640111">*</span> = best record available in that conference &mdash; that pick has maxed out its points.</p>`);
  }
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
  // x gridlines + labels (wins)
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

/* ---------------- Perfect-pick ceiling ---------------- */
function renderCeiling(data){
  const el=document.getElementById("ceiling");
  if(!el) return;
  const c=data.ceiling;
  if(!c || !c.rows || !c.rows.length){ el.hidden=true; return; }   /* older data.json */
  el.hidden=false;
  const leader=c.leader_now||0;
  const behind=Math.max(0,c.total-leader);
  const missing=(c.missing||[]).length;
  const rows=c.rows.map(r=>{
    const tied=(r.alsoTied&&r.alsoTied.length)
      ? `<small>also ${r.wins} ${r.wins===1?"win":"wins"}: ${r.alsoTied.join(", ")}</small>` : "";
    return `<div class="ceil-row">
      <div class="cnf">${r.label}</div>
      ${r.logo?`<img src="${r.logo}" alt="" loading="lazy">`:`<div class="noimg"></div>`}
      <div class="tm">${r.teamName||"\u2014"}${tied}</div>
      <div class="w">${r.wins==null?"\u2014":r.wins}</div></div>`;
  }).join("");
  el.innerHTML=`
    <h2 class="section-title">Perfect-Pick Ceiling</h2>
    <p class="section-sub">The most wins anyone could be sitting on right now &mdash; the best team in each of the ten conferences.</p>
    <div class="chart-card ceiling-card">
      <div class="ceil-top">
        <div class="ceil-num">${c.total}<span>wins</span></div>
        <div class="ceil-copy">
          <p>A perfect entry &mdash; the team with the most wins in every conference &mdash; would have <b>${c.total}</b> wins today.${
            leader?` The current leader has <b>${leader}</b>${behind>0?`, so <b>${behind}</b> more ${behind===1?"win is":"wins are"} still out there`:""}.`:""}</p>
          ${missing?`<p class="ceil-warn">${missing} conference${missing>1?"s":""} could not be read from ESPN at this refresh, so ${missing>1?"those are":"that is"} not counted above.</p>`:""}
          <p class="ceil-note">One team per conference, so a tie for the best record still counts once &mdash; the figure is the best record, whichever team owns it.</p>
        </div>
      </div>
      <div class="ceil-grid">${rows}</div>
    </div>`;
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
  renderCeiling(data);
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
