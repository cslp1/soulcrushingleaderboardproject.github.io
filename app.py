from flask import Flask, render_template
import utils.funcs as funcs
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__)

@app.route("/")
def home():
    all_completions = funcs.get_data("comps!A:C")
    all_towers = funcs.get_data("towers!A:E")
    all_games = funcs.get_data("games!A:C")

    return render_template(
        "index.html",
        all_completions=all_completions,
        all_towers=all_towers,
        all_games=all_games,
    )

if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=5001)  # Changed port to 5001 to avoid conflicts
