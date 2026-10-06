"""SQLite helpers: connection, schema init, and category seeding."""

import os
import sqlite3
from pathlib import Path

from flask import g

DB_PATH = os.environ.get("DB_PATH", "/data/pookie.db")
SCHEMA_PATH = Path(__file__).parent / "schema.sql"

# Fixed categories, in display order. "Sauces" is handled in the UI via
# recipes(kind='sauce'), so it is intentionally not listed here.
SEED_CATEGORIES = [
    ("protein", "Protein"),
    ("base", "Base"),
    ("fresh", "Fresh Vegetables / Fruits"),
    ("cooked", "Cooked Vegetables / Fruits"),
    ("topping", "Topping"),
    ("extras", "Extras"),
]


def get_connection():
    """Open a connection with foreign keys on and row access by column name."""
    conn = sqlite3.connect(DB_PATH)
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
    """Create the schema (if needed) and seed the fixed categories."""
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = get_connection()
    try:
        conn.executescript(SCHEMA_PATH.read_text())
        for position, (slug, name) in enumerate(SEED_CATEGORIES):
            conn.execute(
                "INSERT OR IGNORE INTO categories (slug, name, position) "
                "VALUES (?, ?, ?)",
                (slug, name, position),
            )
        conn.commit()
    finally:
        conn.close()
