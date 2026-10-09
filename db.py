"""SQLite helpers: connection, schema init, and seeding a fresh database."""

import os
import sqlite3
from pathlib import Path

from flask import g

import names

DB_PATH = os.environ.get("DB_PATH", "/data/pookie.db")
SCHEMA_PATH = Path(__file__).parent / "schema.sql"

# The recipe categories a fresh database starts with, in order: (name, emoji).
SEED_RECIPE_CATEGORIES = [
    ("Poke bowl", "🥣"),
    ("Sauce", "🥫"),
    ("Soup", "🍲"),
]

# The station a fresh database starts with: its sections in order (a name is
# an ingredient section, ("recipes", name) lists that recipe category), and
# the recipe category its new recipes start in.
SEED_STATION = {
    "name": "Poke",
    "emoji": "🥣",
    "recipe_category": "Poke bowl",
    "sections": [
        "Protein",
        "Base",
        "Fresh Vegetables / Fruits",
        "Cooked Vegetables / Fruits",
        "Topping",
        "Extras",
        ("recipes", "Sauce"),
    ],
}


def get_connection(path=None):
    """Open a connection with foreign keys on and row access by column name."""
    conn = sqlite3.connect(path or DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db():
    """Return this request's connection, opening it on first use."""
    if "db" not in g:
        g.db = get_connection()
    return g.db


def close_db(exc=None):
    """Close the request's connection, if one was opened."""
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db():
    """Create the database file's schema (if needed) and seed a fresh one."""
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = get_connection()
    try:
        set_up(conn)
    finally:
        conn.close()


def set_up(conn):
    """Create the schema (if needed) on conn and seed it if it's empty.

    Seeds go only into empty tables, so whatever someone deleted stays deleted.
    """
    conn.executescript(SCHEMA_PATH.read_text())
    if _empty(conn, "recipe_categories"):
        conn.executemany(
            "INSERT INTO recipe_categories (name, name_key, emoji, position) VALUES (?, ?, ?, ?)",
            [
                (name, names.key(name), emoji, position)
                for position, (name, emoji) in enumerate(SEED_RECIPE_CATEGORIES)
            ],
        )
    if _empty(conn, "stations"):
        _seed_station(conn, SEED_STATION)
    conn.commit()


def _empty(conn, table):
    return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == 0


def _seed_station(conn, station):
    def category_id(name):
        row = conn.execute("SELECT id FROM recipe_categories WHERE name = ?", (name,)).fetchone()
        return row[0] if row else None

    station_id = conn.execute(
        "INSERT INTO stations (name, name_key, emoji, recipe_category_id) VALUES (?, ?, ?, ?)",
        (
            station["name"],
            names.key(station["name"]),
            station["emoji"],
            category_id(station["recipe_category"]),
        ),
    ).lastrowid
    for position, section in enumerate(station["sections"]):
        if isinstance(section, tuple):
            listed = category_id(section[1])
            if listed is not None:
                conn.execute(
                    "INSERT INTO sections (station_id, position, recipe_category_id) VALUES (?, ?, ?)",
                    (station_id, position, listed),
                )
        else:
            conn.execute(
                "INSERT INTO sections (station_id, position, name, name_key) VALUES (?, ?, ?, ?)",
                (station_id, position, section, names.key(section)),
            )
