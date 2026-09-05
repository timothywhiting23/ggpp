#!/usr/bin/env python3
"""
GGPP score updater.

Fetches each picked team's live W-L record from ESPN's free public API,
totals every player's wins across their 10 picks, and writes site/data.json
which the website reads. Uses curl (ESPN blocks urllib regardless of UA).

Usage:  python fetch_scores.py [--out PATH] [--refresh-teams]
"""
import argparse
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.abspath(__file__))
PICKS = os.path.join(ROOT, "picks.json")
TEAMMAP = os.path.join(ROOT, "teammap.json")
TEAMS_ESPN = os.path.join(ROOT, "teams_espn.json")
DEFAULT_OUT = os.path.join(ROOT, "site", "data.json")
ESPN_TEAM = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/{id}"

CONFS = ["AAC", "ACC", "Big 12", "Big 10", "USA", "MAC", "MW", "Pac 12", "SEC", "SBC"]
CONF_LABEL = {  # friendly names for display
    "AAC": "American", "ACC": "ACC", "Big 12": "Big 12", "Big 10": "Big Ten",
    "USA": "Conference USA", "MAC": "MAC", "MW": "Mountain West",
    "Pac 12": "Pac-12", "SEC": "SEC", "SBC": "Sun Belt",
}

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def current_week():
    """Return (iso_date, weekday) of 'today' in Mountain Time."""
    import datetime
    out = subprocess.run(["bash", "-c", "TZ=America/Denver date +'%Y-%m-%d|%u'"],
                         capture_output=True, text=True).stdout.strip()
    date_s, wd = out.split("|")
    y, m, day = map(int, date_s.split("-"))
    dt = datetime.date(y, m, day)
    # %u: 1=Mon..6=Sat,7=Sun  -> saturday=6
    wd = int(wd)
    days_since_sat = (wd - 6) % 7
    sat = dt - datetime.timedelta(days=days_since_sat)
    return sat.isoformat()


def load_previous():
    try:
        with open(DEFAULT_OUT) as f:
            return json.load(f)
    except Exception:
        return {}


def mt_strftime(fmt):
    """Format the current time in America/Denver (Mountain) timezone."""
    out = subprocess.run(["bash", "-c", "TZ=America/Denver date +'%s'" % (fmt,)],
                         capture_output=True, text=True).stdout.strip()
    return out or fmt


def fetch_json(url, timeout=30):
    # ESPN allows plain curl's default UA; custom browser UAs get 403'd.
    cmd = ["curl", "-s", "--max-time", str(timeout), url]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip():
        return None
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return None


def get_record(team_id):
    """Return dict(wins, losses, ties, games, summary) for a team id, or None."""
    d = fetch_json(ESPN_TEAM.format(id=team_id))
    if not d:
        return None
    rec = (d.get("team") or {}).get("record")
    if not rec:
        return None
    items = rec.get("items") or []
    total = next((i for i in items if i.get("type") == "total"), items[0] if items else None)
    if not total:
        return None
    stats = {s["name"]: s["value"] for s in (total.get("stats") or [])}
    return {
        "wins": int(stats.get("wins") or 0),
        "losses": int(stats.get("losses") or 0),
        "ties": int(stats.get("ties") or 0),
        "games": int(stats.get("gamesPlayed") or 0),
        "summary": total.get("summary", f"{int(stats.get('wins') or 0)}-{int(stats.get('losses') or 0)}"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT)
    args = ap.parse_args()

    picks = json.load(open(PICKS))
    teammap = json.load(open(TEAMMAP))

    # distinct team ids needed
    team_ids = sorted({teammap[lbl]["id"] for p in picks for lbl in p["picks"].values() if lbl})
    meta = {t["id"]: t for t in json.load(open(TEAMS_ESPN))}

    # fetch records (parallel, gentle)
    records = {}
    failures = []
    def work(tid):
        return tid, get_record(tid)

    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(work, tid) for tid in team_ids]
        for f in as_completed(futs):
            tid, rec = f.result()
            if rec is None:
                failures.append(tid)
            records[tid] = rec

    # Build team info map (id -> display info + record)
    teams_info = {}
    for tid in team_ids:
        tmeta = meta.get(tid, {})
        rec = records.get(tid)
        teams_info[tid] = {
            "id": tid,
            "name": tmeta.get("displayName") or str(tid),
            "shortName": tmeta.get("shortDisplayName") or "",
            "logo": tmeta.get("logo"),
            "wins": rec["wins"] if rec else None,
            "losses": rec["losses"] if rec else None,
            "ties": rec["ties"] if rec else None,
            "games": rec["games"] if rec else None,
            "summary": rec["summary"] if rec else "n/a",
        }

    # Per-player totals
    standings = []
    for p in picks:
        conf_detail = []
        total = 0
        total_losses = 0
        total_ties = 0
        total_games = 0
        for conf in CONFS:
            lbl = p["picks"].get(conf, "")
            if not lbl:
                continue
            tm = teams_info[teammap[lbl]["id"]]
            w = tm["wins"] if tm["wins"] is not None else 0
            l = tm["losses"] if tm["losses"] is not None else 0
            t = tm["ties"] if tm["ties"] is not None else 0
            total += w
            total_losses += l
            total_ties += t
            conf_detail.append({
                "conf": conf, "confLabel": CONF_LABEL[conf], "label": lbl,
                "wins": w, "summary": tm["summary"],
                "logo": tm["logo"], "teamName": tm["name"], "teamId": tm["id"],
            })
            if tm["games"]:
                total_games += tm["games"]
        standings.append({"name": p["name"], "wins": total, "losses": total_losses,
                          "ties": total_ties, "games": total_games,
                          "picks": conf_detail})

    # ranking: by wins desc, then losses asc, then games asc, then name
    losses = {s["name"]: sum(1 for c in s["picks"] if c["summary"] not in ("n/a",) and "-" in c["summary"] and int(c["summary"].split("-")[1]) > 0) for s in standings}
    def sort_key(s):
        p_losses = losses.get(s["name"], 0)
        return (-s["wins"], p_losses, s["games"], s["name"])
    standings.sort(key=sort_key)
    rank_of = {}
    for i, s in enumerate(standings, 1):
        rank_of[s["name"]] = i

    out_dir = os.path.dirname(args.out)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    # ---- wins-by-week history (progress over the season) ----
    prev = load_previous()
    weeks = prev.get("weeks") or []
    week_dates = [w["date"] for w in weeks]
    this_week = current_week()
    if this_week not in week_dates:
        weeks.append({"date": this_week, "wins": {}})
        weeks.sort(key=lambda w: w["date"])
    cur = next(w for w in weeks if w["date"] == this_week)
    for s in standings:
        cur["wins"][s["name"]] = s["wins"]

    data = {
        "title": "Grandma Gail's Pigskin Picks 2026",
        "updated": mt_strftime("%B %d, %Y at %I:%M %p %Z"),
        "updated_iso": mt_strftime("%Y-%m-%dT%H:%M:%S"),
        "conferences": [{"key": c, "label": CONF_LABEL[c]} for c in CONFS],
        "teams": teams_info,
        "standings": standings,
        "ranks": rank_of,
        "weeks": weeks,
        "failures": failures,
    }
    with open(args.out, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Wrote {args.out}")
    print(f"  teams fetched: {len(teams_info)}, failures: {len(failures)} ({failures})")
    print("LEADERBOARD:")
    for s in standings:
        print(f"  {rank_of[s['name']]:>2}. {s['name']:<12} {s['wins']} wins")
    if failures:
        print("Note: failed teams left blank (wins shown as 0/n/a).")


if __name__ == "__main__":
    main()
