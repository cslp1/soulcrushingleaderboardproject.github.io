"""
NSCLP site.

Merged from the official SCLP-Web rewrite (TheHaloDeveloper) and this
site's fork.

Taken from SCLP-Web:
  - difficulty tiers as one data table instead of an if-chain
  - sheets fetched in parallel
  - every lookup built in a single build() pass
  - read-only access with the API key alone (no service account)
  - periodic data refresh
  - bad nationality entries skipped instead of crashing startup
  - missing quality sent as null, which the frontend expects

Fixed while merging (both versions had these):
  - a username listed twice in comps now has both rows combined
  - tied players get a stable order, so ranks don't shuffle on refresh
  - usernames are trimmed, so ones with a trailing space can be found

Kept from this site:
  - the variable names the frontend templates read
  - daily Tower of the Day, read from the sheet the Discord bot writes
  - malformed tower rows skipped instead of crashing startup
  - the two largest lookups built in the browser (see index.html),
    because embedding them pushed the page past Vercel's response limit
"""

import math
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pycountry
import requests
from dotenv import load_dotenv
from flask import (Flask, jsonify, make_response, render_template,
                   send_from_directory)

load_dotenv()

# ===========================================================================
# CONFIG — the only section that differs between sites
# ===========================================================================

SHEET_ID = os.getenv("SHEET_ID", "1PCndMCuQkslsWITs19Q2YaLFa16XnpUZzts4npzCjtE")

# (upper limit, name): a tower belongs to the first tier whose limit it's under
DIFFS = [
    (900, "Insane"),
    (1000, "Extreme"),
    (1100, "Terrifying"),
    (1200, "Catastrophic"),
    (1300, "Horrific"),
    (1400, "Unreal"),
    (float("inf"), "Nil"),
]


def tower_xp_for(difficulty):
    return math.floor((3 ** ((difficulty - 800) / 100)) * 100)

# ===========================================================================

API_KEY = os.getenv("GOOGLE_SHEETS_API_KEY")
REFRESH_SECONDS = int(os.getenv("REFRESH_SECONDS", "900"))   # 15 minutes
SCOTW_PERIOD_SECONDS = 24 * 60 * 60                          # daily rotation

app = Flask(__name__)


def difficulty_to_name(d):
    return next(name for limit, name in DIFFS if d < limit)


@app.after_request
def no_cache(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


# ---------------------------------------------------------------------------
# Sheet access
# ---------------------------------------------------------------------------

def get_data(r):
    """Read a sheet range as a list of dicts keyed by the header row."""
    if not API_KEY:
        raise RuntimeError("GOOGLE_SHEETS_API_KEY is not set")

    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{r}"
    payload = requests.get(url, params={"key": API_KEY}, timeout=20).json()

    # Surface API errors instead of silently returning an empty site
    if "error" in payload:
        raise RuntimeError(f"Sheets API error reading {r}: "
                           f"{payload['error'].get('message', payload['error'])}")

    values = payload.get("values", [])
    if len(values) < 2:
        return []

    headers = [h.strip() for h in values[0]]
    rows = []
    for row in values[1:]:
        item = {}
        for i, header in enumerate(headers):
            val = row[i] if i < len(row) else ""
            if header.lower() == "completions":
                item[header] = [int(x) for x in val.split(",") if x.strip().isdigit()]
            else:
                item[header] = val
        rows.append(item)
    return rows


def country_code(name):
    return pycountry.countries.lookup(name).alpha_2.lower()


def parse_places(raw):
    parts = [part.strip() for part in (raw or "").split(";") if part.strip()]
    return [p.split(",") for p in parts]


# ---------------------------------------------------------------------------
# Build everything the page needs, in one pass
# ---------------------------------------------------------------------------

def build():
    ranges = ["comps!A:C", "towers!A:G", "games!A:C",
              "nationalities!A:B", "packs!A:M", "credits!A:B"]
    with ThreadPoolExecutor(max_workers=len(ranges)) as pool:
        comps, raw_towers, games, countries, raw_packs, staff = pool.map(get_data, ranges)

    # Nationalities — one unrecognised country shouldn't take the site down
    # usernames are trimmed everywhere — the sheet has some with trailing spaces
    flags = {}
    for c in countries:
        name = (c.get("username") or "").strip()
        if name and c.get("nationality"):
            try:
                flags[name] = country_code(c["nationality"].strip())
            except Exception:
                pass

    # Towers — skip malformed rows rather than failing the whole build
    towers = []
    for t in raw_towers:
        try:
            t["id"] = int(t["id"])
            t["difficulty"] = int(t["difficulty"])
        except (ValueError, TypeError, KeyError):
            print(f"Skipping tower with bad id/difficulty: {t.get('name', '?')}")
            continue
        t["xp"] = tower_xp_for(t["difficulty"])
        t["places"] = parse_places(t.get("places"))
        if (t.get("game") or "") == "":
            t["game"] = None
        else:
            t["places"].append(["Place", ""])
        t["quality"] = (t.get("quality") or "").strip() or None
        towers.append(t)

    towers.sort(key=lambda t: (-t["difficulty"], -t["id"]))
    for rank, t in enumerate(towers, 1):
        t["rank"] = rank
    tower_by_id = {t["id"]: t for t in towers}

    # Players — a username listed twice gets both rows' completions combined,
    # rather than one row silently replacing the other
    by_name = {}
    for p in comps:
        name = (p.get("username") or "").strip()
        if not name:
            continue
        if name in by_name:
            by_name[name]["completions"] = list(set(by_name[name]["completions"])
                                                | set(p.get("completions") or []))
        else:
            p["username"] = name
            p["completions"] = list(p.get("completions") or [])
            by_name[name] = p

    players = []
    for p in by_name.values():
        p["completions"] = sorted(set(p["completions"]))
        p["nationality"] = flags.get(p["username"])
        p["xp"] = sum(tower_by_id[i]["xp"] for i in p["completions"] if i in tower_by_id)
        players.append(p)

    # Packs — bonus is the average XP of every listed tower
    packs = []
    for pk in raw_packs:
        if not (pk.get("id") or "").strip():
            continue
        ids = []
        for i in range(1, 11):
            v = (pk.get(f"tower{i}") or "").strip()
            if v.isdigit():
                ids.append(int(v))
        total = sum(tower_by_id[i]["xp"] for i in ids if i in tower_by_id)
        packs.append({"id": pk["id"], "name": pk.get("name", ""), "towers": ids,
                      "xp": math.floor(total / len(ids)) if ids else 0})
    packs.sort(key=lambda p: p["xp"])

    # Per-tower and per-player lookups
    victors_by_tower = {t["id"]: 0 for t in towers}
    hardest_by_player = {}
    diff_count_by_player = {}
    for p in players:
        hardest = 0
        counts = {}
        for i in p["completions"]:
            t = tower_by_id.get(i)
            if not t:
                continue
            victors_by_tower[i] += 1
            hardest = max(hardest, t["difficulty"])
            name = difficulty_to_name(t["difficulty"])
            counts[name] = counts.get(name, 0) + 1
        hardest_by_player[p["username"]] = hardest
        diff_count_by_player[p["username"]] = counts

    # Pack completions and bonus XP
    bonus_xp_by_player = {}
    pack_victors_by_pack = {pk["id"]: [] for pk in packs}
    for p in players:
        done = set(p["completions"])
        bonus = 0
        for pk in packs:
            if pk["towers"] and done.issuperset(pk["towers"]):
                bonus += pk["xp"]
                pack_victors_by_pack[pk["id"]].append(p["username"])
        bonus_xp_by_player[p["username"]] = bonus
        p["total_xp"] = p["xp"] + bonus

    # Rank on total_xp so the leaderboard order matches what it displays.
    # Ties break on name so tied players don't swap places on every refresh.
    players.sort(key=lambda p: (-p["total_xp"], p["username"].lower()))
    for rank, p in enumerate(players, 1):
        p["rank"] = rank

    tier_totals_by_difficulty = {}
    for t in towers:
        name = difficulty_to_name(t["difficulty"])
        tier_totals_by_difficulty[name] = tier_totals_by_difficulty.get(name, 0) + 1

    # First role listed wins, so an Owner row isn't overwritten by a later one
    role_by_username = {}
    for e in staff:
        name = (e.get("username") or "").strip()
        if name and e.get("role"):
            role_by_username.setdefault(name, e["role"].strip())

    # Keys match the variable names in templates/index.html
    return {
        "all_completions": players,
        "all_towers": towers,
        "all_games": games,
        "packs": packs,
        "credits": staff,
        "cool_members": [],
        "victors_by_tower": victors_by_tower,
        "hardest_by_player": hardest_by_player,
        "diff_count_by_player": diff_count_by_player,
        "bonus_xp_by_player": bonus_xp_by_player,
        "pack_victors_by_pack": pack_victors_by_pack,
        "role_by_username": role_by_username,
        "tier_totals_by_difficulty": tier_totals_by_difficulty,
    }


# ---------------------------------------------------------------------------
# Refresh
#
# SCLP-Web uses a background thread that rebuilds hourly. That assumes a
# long-running server; on Vercel, threads don't survive between requests.
# Rebuilding on the first request after the data goes stale works on both.
# ---------------------------------------------------------------------------

_state = {"data": None, "built_at": 0.0}
_lock = threading.Lock()


def current_data():
    if _state["data"] is not None and time.time() - _state["built_at"] < REFRESH_SECONDS:
        return _state["data"]

    with _lock:
        # another request may have rebuilt while this one waited
        if _state["data"] is not None and time.time() - _state["built_at"] < REFRESH_SECONDS:
            return _state["data"]
        try:
            _state["data"] = build()
            _state["built_at"] = time.time()
        except Exception as e:
            if _state["data"] is None:
                raise
            # keep serving the last good data, try again in a minute
            print(f"Refresh failed, serving previous data: {e}")
            _state["built_at"] = time.time() - REFRESH_SECONDS + 60
    return _state["data"]


try:
    current_data()
except Exception as e:
    print(f"Initial build failed, will retry on first request: {e}")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def home():
    return render_template("index.html", **current_data())


@app.route("/tower_data")
def tower_data():
    return jsonify(get_data("towers!A:E"))


@app.route("/tower_data_csv")
def tower_data_csv():
    rows = sorted(get_data("towers!A:E"), key=lambda x: int(x["difficulty"]))
    lines = ["difficulty,name"] + [f'{t["difficulty"]},{t["name"]}' for t in rows]
    response = make_response("\n".join(lines))
    response.headers['Content-Type'] = 'text/csv'
    response.headers['Content-Disposition'] = 'attachment; filename=tower_data.csv'
    return response


@app.route("/get_scotw")
def get_scotw():
    """
    Current Tower of the Day. The Discord bot writes the tower id to scotw!A2
    and a unix timestamp to B2; the site only reads them.
    """
    try:
        rows = get_data("scotw!A:B")
        if rows:
            tower = str(rows[0].get("Tower", "")).strip()
            started = str(rows[0].get("Time", "")).strip()
            if tower.isdigit() and started.isdigit():
                return jsonify({"Tower": tower, "Time": started,
                                "Target": int(started) + SCOTW_PERIOD_SECONDS})
    except Exception as e:
        print(f"get_scotw failed: {e}")
    return jsonify({"Tower": None, "Time": None, "Target": None})


@app.route("/static/<path:filename>")
def static_files(filename):
    response = make_response(send_from_directory(os.path.join(app.root_path, 'static'), filename))
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


@app.route("/favicon.ico")
def favicon():
    return app.send_static_file("images/sclp.png")


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=5000)
