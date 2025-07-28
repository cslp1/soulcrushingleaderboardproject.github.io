import os
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("GOOGLE_SHEETS_API_KEY")
SPREADSHEET_ID = os.getenv("SPREADSHEET_ID")

def get_data(range_name):
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/{range_name}?key={API_KEY}"
    response = requests.get(url)
    response.raise_for_status()
    data = response.json()
    values = data.get("values", [])
    if not values:
        return []

    headers = values[0]
    rows = values[1:]
    result = []
    for row in rows:
        obj = {headers[i]: row[i] if i < len(row) else "" for i in range(len(headers))}
        result.append(obj)
    return result
