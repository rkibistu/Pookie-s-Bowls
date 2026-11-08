"""SQLite helpers: connection, migrations, and seeding a fresh dev database."""

import importlib.util
import os
import re
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

from flask import g

import names

DB_PATH = os.environ.get("DB_PATH", "/data/pookie.db")
MIGRATIONS_DIR = Path(__file__).parent / "migrations"

# Copies taken before migrating an existing database: how many to keep.
BACKUPS_KEPT = 10

# The recipe categories a fresh dev database (SEED=1) starts with, in order: (name, emoji).
SEED_RECIPE_CATEGORIES = [
    ("Poke bowl", "🥣"),
    ("Sauce", "🥫"),
    ("Soup", "🍲"),
]

# The station a fresh dev database starts with: its sections in order (a name is
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


def init_db(path=None):
    """Bring the database file up to date; seed it if it's brand new and SEED=1.

    Raises MigrationError if a migration fails, so the app doesn't start.
    """
    path = Path(path or DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = get_connection(path)
    try:
        before = migrate(conn, backup_dir=path.parent / "backups")
        if before == 0 and os.environ.get("SEED") == "1":
            seed(conn)
    finally:
        conn.close()


class MigrationError(Exception):
    """A migration failed and was rolled back; the database is as it was before it."""


def migrations(directory=MIGRATIONS_DIR):
    """Every migration file as (number, path), in order: 0001_baseline.sql, 0002_….py…"""
    found = []
    for path in directory.iterdir():
        match = re.fullmatch(r"(\d{4})_\w+\.(sql|py)", path.name)
        if match:
            found.append((int(match[1]), path))
    found.sort()
    numbers = [number for number, _ in found]
    if numbers != list(range(1, len(found) + 1)):
        raise MigrationError(f"Migrations must be numbered 0001, 0002… with no gaps or repeats: {numbers}")
    return found


def version(conn):
    """The number of the last migration applied to conn (0 for a brand-new database)."""
    return conn.execute("PRAGMA user_version").fetchone()[0]


def migrate(conn, directory=MIGRATIONS_DIR, upto=None, backup_dir=None):
    """Apply every migration newer than conn's version (up to `upto`), in order.

    Each runs in its own transaction, which also records its number in
    PRAGMA user_version, so a failure leaves the database as it was before
    that migration. Given a backup_dir, an existing database is copied there
    first. Returns the version conn was at before.
    """
    before = version(conn)
    pending = [(n, path) for n, path in migrations(directory) if n > before and (upto is None or n <= upto)]
    if pending and before > 0 and backup_dir is not None:
        backup(conn, backup_dir, pending[0][0])
    for number, path in pending:
        _log(f"Applying migration {path.name}")
        _apply(conn, number, path)
    return before


def _apply(conn, number, path):
    """Run one migration in a transaction of its own, then set user_version to its number.

    Foreign keys are off while it runs, so rebuilding a table (create the new
    one, copy, drop the old, rename) doesn't cascade-delete the rows that
    point at it; they're checked before committing instead.
    """
    isolation_level = conn.isolation_level
    conn.isolation_level = None  # the transaction is ours to begin and end
    conn.execute("PRAGMA foreign_keys = OFF")
    try:
        if path.suffix == ".sql":
            # executescript would commit a transaction begun outside it.
            conn.executescript(f"BEGIN;\n{path.read_text()}\n;")
        else:
            conn.execute("BEGIN")
            _load(path).migrate(conn)
        broken = conn.execute("PRAGMA foreign_key_check").fetchall()
        if broken:
            raise MigrationError(f"{len(broken)} rows point at rows that don't exist, e.g. {tuple(broken[0])}")
        conn.execute(f"PRAGMA user_version = {number}")
        conn.execute("COMMIT")
    except Exception as err:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        _log(f"Migration {path.name} failed and was rolled back: {err}")
        raise MigrationError(f"Migration {path.name} failed: {err}") from err
    finally:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.isolation_level = isolation_level


def _load(path):
    """Import a .py migration; it has a migrate(conn) function."""
    spec = importlib.util.spec_from_file_location(f"migration_{path.stem}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def backup(conn, backup_dir, first_pending):
    """Copy the database to backup_dir/pre-NNNN-<time>.db, keeping the newest BACKUPS_KEPT."""
    backup_dir = Path(backup_dir)
    backup_dir.mkdir(parents=True, exist_ok=True)
    target = backup_dir / f"pre-{first_pending:04d}-{datetime.now():%Y%m%d-%H%M%S}.db"
    copy = sqlite3.connect(target)
    try:
        conn.backup(copy)
    finally:
        copy.close()
    _log(f"Copied the database to {target}")
    for old in sorted(backup_dir.glob("pre-*.db"), key=lambda p: p.stat().st_mtime)[:-BACKUPS_KEPT]:
        old.unlink()
    return target


def _log(message):
    print(f"[db] {message}", file=sys.stderr, flush=True)


def seed(conn):
    """Fill a brand-new dev database with the Poke station and its recipe categories."""
    conn.executemany(
        "INSERT INTO recipe_categories (name, name_key, emoji, position) VALUES (?, ?, ?, ?)",
        [
            (name, names.key(name), emoji, position)
            for position, (name, emoji) in enumerate(SEED_RECIPE_CATEGORIES)
        ],
    )
    _seed_station(conn, SEED_STATION)
    conn.commit()


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
