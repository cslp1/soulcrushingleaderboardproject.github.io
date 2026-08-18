from flask import Flask, render_template, make_response, send_from_directory, jsonify
import os
from dotenv import load_dotenv
import utils.funcs as funcs
import math
import pycountry
import time
from google.oauth2 import service_account
from googleapiclient.discovery import build
from datetime import datetime, timedelta, timezone
import atexit
import json
load_dotenv()

# --- Auth: using GOOGLE_SERVICE_ACCOUNT env variable ---
service_json = json.loads(os.getenv("GOOGLE_SERVICE_ACCOUNT"))
credentials = service_account.Credentials.from_service_account_info(
    service_json,
    scopes=["https://www.googleapis.com/auth/spreadsheets"]
)
service = build("sheets", "v4", credentials=credentials)
sheet = service.spreadsheets()

SHEET_ID = "1GcbxyVskhfp-reab4yksg74vlsEkMyZIWQE6AkA7jxE"

app = Flask(__name__)

@app.after_request
def add_no_cache_headers(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

def country_code(x):
    country = pycountry.countries.lookup(x)
    return country.alpha_2.lower()

all_completions = funcs.get_data("comps!A:C")
all_towers = funcs.get_data("towers!A:G")
all_games = funcs.get_data("games!A:C")
countries = funcs.get_data("nationalities!A:B")
countries_map = {}

for c in countries:
    if c["nationality"] and c["username"]:
        countries_map[c["username"]] = country_code(c["nationality"])
        
for c in all_completions:
    c["completions"] = list(set(c["completions"]))

valid_towers = []
for tower in all_towers:
    try:
        tower["id"] = int(tower["id"])
        tower["difficulty"] = int(tower["difficulty"])
    except (ValueError, TypeError):
        print(f"Skipping tower with bad id/difficulty: {tower.get('name', '?')}")
        continue
    valid_towers.append(tower)
    tower["xp"] = math.floor((3 ** ((tower["difficulty"] - 800) / 100)) * 100)
    
    raw = tower.get("places", "").strip()
    if not raw or raw == ";":
        tower["places"] = []
    else:
        parts = [part.strip() for part in raw.split(";") if part.strip()]
        if not parts:
            tower["places"] = []
        else:
            parsed = [p.split(",") for p in parts if p]
            if parsed == [[""]]:
                tower["places"] = []
            else:
                tower["places"] = parsed
    
    if tower["game"] == "":
        tower["game"] = None
    else:
        tower["places"].append(["Place", ""])
    
all_towers = valid_towers
tower_xp = {t["id"]: t["xp"] for t in all_towers}
for c in all_completions:
    try:
        c["nationality"] = countries_map[c["username"]]
    except:
        c["nationality"] = None
    c["xp"] = sum(tower_xp.get(id, 0) for id in c["completions"])
    
all_completions.sort(key=lambda x: x["xp"], reverse=True)
all_towers.sort(key=lambda x: x["id"], reverse=True)
all_towers.sort(key=lambda x: x["difficulty"], reverse=True)

for t in range(len(all_towers)):
    all_towers[t]["rank"] = t + 1
for c in range(len(all_completions)):
    all_completions[c]["rank"] = c + 1
    
raw_packs = funcs.get_data("packs!A:M")
packs = []
for pack in raw_packs:
    if not pack["id"]:
        continue
    
    t = []
    for i in range(1, 11):
        current = pack[f"tower{i}"]
        if current != "":
            t.append(current)
            
    packs.append({
        "id": pack["id"],
        "name": pack["name"],
        "towers": t
    })

# ---------------------------------------------------------------------------
# Precomputed lookups for the frontend.
#
# towermanager.js reads these directly in precompute_caches(); if any are
# missing it throws and no page renders. Built once at startup from the
# spreadsheet data above.
# ---------------------------------------------------------------------------

DIFFICULTY_NAMES = ["Insane", "Extreme", "Terrifying",
                    "Catastrophic", "Horrific", "Unreal", "Nil"]


def _difficulty_name(d):
    if d < 900: return "Insane"
    if d < 1000: return "Extreme"
    if d < 1100: return "Terrifying"
    if d < 1200: return "Catastrophic"
    if d < 1300: return "Horrific"
    if d < 1400: return "Unreal"
    return "Nil"


tower_by_id = {t["id"]: t for t in all_towers}

# tower id -> how many players have beaten it
victors_by_tower = {t["id"]: 0 for t in all_towers}
for c in all_completions:
    for tid in c["completions"]:
        if tid in victors_by_tower:
            victors_by_tower[tid] += 1

# username -> difficulty of their hardest completion (0 if none)
hardest_by_player = {}
# username -> {"Insane": 3, "Extreme": 1, ...}
diff_count_by_player = {}
for c in all_completions:
    hardest = 0
    counts = {}
    for tid in c["completions"]:
        t = tower_by_id.get(tid)
        if not t:
            continue
        if t["difficulty"] > hardest:
            hardest = t["difficulty"]
        name = _difficulty_name(t["difficulty"])
        counts[name] = counts.get(name, 0) + 1
    hardest_by_player[c["username"]] = hardest
    diff_count_by_player[c["username"]] = counts

# username -> bonus XP from fully completed packs
# pack id -> [usernames who completed every tower in it]
bonus_xp_by_player = {}
pack_victors_by_pack = {p["id"]: [] for p in packs}

pack_info = []
for p in packs:
    ids = [int(i) for i in p["towers"] if str(i).isdigit()]
    total = sum(tower_by_id[i]["xp"] for i in ids if i in tower_by_id)
    bonus = math.floor(total / len(ids)) if ids else 0
    # the frontend reads pack.xp directly for display and sorting
    p["xp"] = bonus
    pack_info.append((p["id"], set(ids), bonus))

for c in all_completions:
    done = set(c["completions"])
    bonus_total = 0
    for pack_id, ids, bonus in pack_info:
        if ids and ids <= done:
            bonus_total += bonus
            pack_victors_by_pack[pack_id].append(c["username"])
    bonus_xp_by_player[c["username"]] = bonus_total
    # total_xp = tower XP plus pack bonuses; the leaderboard sorts on this
    c["total_xp"] = c["xp"] + bonus_total

# rank by total_xp so the leaderboard order matches what it displays
all_completions.sort(key=lambda x: x["total_xp"], reverse=True)
for i, c in enumerate(all_completions):
    c["rank"] = i + 1

# username -> role, for the coloured staff names
role_by_username = {}
for entry in funcs.get_data("credits!A:B"):
    if entry.get("username") and entry.get("role"):
        role_by_username[entry["username"]] = entry["role"]

# tower_victors_by_tower and player_completed_towers_by_player are derived
# in the browser instead of here: each duplicates the whole completions
# dataset (~169k entries), and embedding both pushed the rendered page past
# Vercel's ~6 MB response limit.

# difficulty name -> how many towers exist at that tier
tier_totals_by_difficulty = {}
for t in all_towers:
    name = _difficulty_name(t["difficulty"])
    tier_totals_by_difficulty[name] = tier_totals_by_difficulty.get(name, 0) + 1



cool_members = []
staff = funcs.get_data("credits!A:B")

@app.route("/tower_data")
def tower_data():
    updated = funcs.get_data("towers!A:E")
    return jsonify(updated)

@app.route("/tower_data_csv")
def tower_data_csv():
    updated = funcs.get_data("towers!A:E")
    
    sorted_towers = sorted(updated, key=lambda x: int(x["difficulty"]))
    
    csv_lines = ["difficulty,name"]
    for tower in sorted_towers:
        csv_lines.append(f'{tower["difficulty"]},{tower["name"]}')
    
    csv_content = "\n".join(csv_lines)
    
    response = make_response(csv_content)
    response.headers['Content-Type'] = 'text/csv'
    response.headers['Content-Disposition'] = 'attachment; filename=tower_data.csv'
    return response


@app.route("/")
def home():
    return render_template(
        "index.html",
        all_completions=all_completions,
        all_towers=all_towers,
        all_games=all_games,
        cool_members=cool_members,
        packs=packs,
        credits=staff,
        victors_by_tower=victors_by_tower,
        hardest_by_player=hardest_by_player,
        diff_count_by_player=diff_count_by_player,
        bonus_xp_by_player=bonus_xp_by_player,
        pack_victors_by_pack=pack_victors_by_pack,
        role_by_username=role_by_username,
        tier_totals_by_difficulty=tier_totals_by_difficulty,
    )

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

@app.route("/get_scotw")
def get_scotw():
    """
    Current Soul Crushing Tower of the Day.

    The Discord bot picks the tower and writes it to scotw!A2:B2
    (A2 = tower id, B2 = unix timestamp of when it was picked).
    The site only reads it.
    """
    try:
        rows = sheet.values().get(
            spreadsheetId=SHEET_ID, range="scotw!A2:B2"
        ).execute().get("values", [])
        if rows and len(rows[0]) >= 2:
            tower_raw = str(rows[0][0]).strip()
            time_raw = str(rows[0][1]).strip()
            if tower_raw.isdigit() and time_raw.isdigit():
                return jsonify({"Tower": tower_raw, "Time": time_raw})
    except Exception as e:
        print(f"get_scotw failed: {e}")
    return jsonify({"Tower": None, "Time": None})

def difficulty_to_name(d):
    if d < 900: return "Insane"
    if d < 1000: return "Extreme"
    if d < 1100: return "Terrifying"
    if d < 1200: return "Catastrophic"
    if d < 1300: return "Horrific"
    if d < 1400: return "Unreal"
    return "Nil"

if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=5000)
