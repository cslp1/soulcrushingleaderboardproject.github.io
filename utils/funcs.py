import os
import requests

def get_data(r):
    url = f"https://sheets.googleapis.com/v4/spreadsheets/fef25144012430043cd849c01837eee338036e3d/values/{r}?key={os.getenv("GOOGLE_SHEETS_API_KEY")}"
    
    response = requests.get(url).json()
    values = response.get("values", [])
    if len(values) < 2:
        return []

    headers = values[0]
    data = []

    for row in values[1:]:
        item = {}
        for i, header in enumerate(headers):
            val = row[i] if i < len(row) else ""
            if header.lower() == "completions":
                item[header] = [int(x) for x in val.split(",") if x] if val else []
            else:
                item[header] = val
        data.append(item)

    return data
