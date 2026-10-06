"""Pookie's Bowls — Flask app entry point."""

import os

from flask import Flask, render_template

import db

app = Flask(__name__)

# Ensure the database and seed data exist before serving any request.
db.init_db()


@app.route("/")
def index():
    return render_template("index.html")


if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG") == "1"
    app.run(host="0.0.0.0", port=5000, debug=debug)
