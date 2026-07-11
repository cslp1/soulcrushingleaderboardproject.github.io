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

for tower in all_towers:
    tower["id"] = int(tower["id"])
    tower["difficulty"] = int(tower["difficulty"])
    tower["xp"] = (3 ** ((tower["difficulty"] - 800) / 100)) * 100
    
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
    return render_template("index.html", all_completions=all_completions, all_towers=all_towers, all_games=all_games, cool_members=cool_members, packs=packs, credits=staff)

@app.route("/static/<path:filename>")
def static_files(filename):
    response = make_response(send_from_directory(os.path.join(app.root_path, 'static'), filename))
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

def difficulty_to_name(d):
    if d < 200: return "Easy"
    if d < 300: return "Medium"
    if d < 400: return "Hard"
    if d < 500: return "Difficult"
    if d < 600: return "Challenging"
    if d < 700: return "Intense"
    if d < 800: return "Remorseless"
    return "Nil"

if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=5000)
