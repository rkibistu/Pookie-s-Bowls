"""SQLite helpers: connection, schema init, and category seeding."""

import os
import sqlite3
from pathlib import Path

from flask import g

DB_PATH = os.environ.get("DB_PATH", "/data/pookie.db")
SCHEMA_PATH = Path(__file__).parent / "schema.sql"

# Fixed ingredient categories, in display order. Sauces are recipes, so they
# live in SEED_RECIPE_CATEGORIES instead.
SEED_CATEGORIES = [
    ("protein", "Protein"),
    ("base", "Base"),
    ("fresh", "Fresh Vegetables / Fruits"),
    ("cooked", "Cooked Vegetables / Fruits"),
    ("topping", "Topping"),
    ("extras", "Extras"),
]

# The recipe categories a fresh database starts with, in order: (name, emoji,
# listed_position). Recipes in a listed category show up on the Ingredients
# page and can be picked into other recipes; None means not listed.
SEED_RECIPE_CATEGORIES = [
    ("Poke bowl", "🥣", None),
    ("Sauce", "🥫", 0),
    ("Soup", "🍲", None),
]


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
    """Create the database file's schema (if needed) and seed the categories."""
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = get_connection()
    try:
        set_up(conn)
    finally:
        conn.close()


def set_up(conn):
    """Create the schema (if needed) on conn and seed the categories."""
    conn.executescript(SCHEMA_PATH.read_text())
    for position, (slug, name) in enumerate(SEED_CATEGORIES):
        conn.execute(
            "INSERT OR IGNORE INTO categories (slug, name, position) "
            "VALUES (?, ?, ?)",
            (slug, name, position),
        )
    # Only into an empty table: a category someone deleted stays deleted.
    if conn.execute("SELECT COUNT(*) FROM recipe_categories").fetchone()[0] == 0:
        for position, (name, emoji, listed) in enumerate(SEED_RECIPE_CATEGORIES):
            conn.execute(
                "INSERT INTO recipe_categories (name, emoji, position, listed_position) "
                "VALUES (?, ?, ?, ?)",
                (name, emoji, position, listed),
            )
    conn.commit()
