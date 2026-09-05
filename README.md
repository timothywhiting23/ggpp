# Grandma Gail's Pigskin Picks 🏈

Family fantasy college-football game for **GGPP 2026** — everyone picks one team
from each of 10 conferences, and every win counts. This repo hosts the live
scoreboard and automatically refreshes scores from ESPN.

## What's here
- `index.html`, `style.css`, `app.js` — the website (a static site, no backend)
- `ggpp-logo.png` — the family logo
- `data.json` — **generated** current standings + W-L per player/team (auto-updated)
- `picks.json`, `teammap.json`, `teams_espn.json` — source data (every player's 10 picks)
- `fetch_scores.py` — pulls each team's win/loss from ESPN's free API and writes `data.json`
- `.github/workflows/deploy.yml` — auto-refreshes scores + deploys to GitHub Pages
  (hourly on Saturdays, 10am–11pm Mountain Time)

## How to change it (no coding)
Edit a file here on GitHub's web editor (click a file → pencil icon → edit →
green "Commit changes"):

- **Picks / players** → `picks.json`
- **Rules / title / prizes** → `index.html`
- **Colors / layout** → `style.css`

Scores update themselves on game days. Nothing else to do.