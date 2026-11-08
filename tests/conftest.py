import os
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
# app.py sets up DB_PATH when imported, so point it somewhere disposable first.
os.environ["DB_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")

import db  # noqa: E402
import ingredients  # noqa: E402
import names  # noqa: E402

# The tests' own starting data, independent of the app's dev seed: recipe
# categories in order, then the Poke station's sections in order (a name is
# an ingredient section, ("recipes", name) lists that recipe category).
CATEGORIES = [("Poke bowl", "🥣"), ("Sauce", "🥫"), ("Soup", "🍲")]
POKE_SECTIONS = [
    "Protein",
    "Base",
    "Fresh Vegetables / Fruits",
    "Cooked Vegetables / Fruits",
    "Topping",
    "Extras",
    ("recipes", "Sauce"),
]


def add_starting_data(conn):
    """The recipe categories and the Poke station (its sections get ids 1, 2… in order)."""
    category_ids = {}
    for position, (name, emoji) in enumerate(CATEGORIES):
        category_ids[name] = conn.execute(
            "INSERT INTO recipe_categories (name, name_key, emoji, position) VALUES (?, ?, ?, ?)",
            (name, names.key(name), emoji, position),
        ).lastrowid
    poke = conn.execute(
        "INSERT INTO stations (name, name_key, emoji, recipe_category_id) VALUES ('Poke', 'poke', '🥣', ?)",
        (category_ids["Poke bowl"],),
    ).lastrowid
    for position, section in enumerate(POKE_SECTIONS):
        if isinstance(section, tuple):
            conn.execute(
                "INSERT INTO sections (station_id, position, recipe_category_id) VALUES (?, ?, ?)",
                (poke, position, category_ids[section[1]]),
            )
        else:
            conn.execute(
                "INSERT INTO sections (station_id, position, name, name_key) VALUES (?, ?, ?, ?)",
                (poke, position, section, names.key(section)),
            )
    conn.commit()


@pytest.fixture
def conn():
    """A fresh in-memory database, fully migrated, with the tests' starting data."""
    conn = db.get_connection(":memory:")
    db.migrate(conn)
    add_starting_data(conn)
    yield conn
    conn.close()


@pytest.fixture
def db_file(tmp_path, monkeypatch):
    """Like conn, but in a file the app's requests use (db.DB_PATH points at it)."""
    path = tmp_path / "pookie.db"
    conn = db.get_connection(path)
    db.migrate(conn)
    add_starting_data(conn)
    conn.close()
    monkeypatch.setattr(db, "DB_PATH", str(path))
    return path


@pytest.fixture
def category(conn):
    """Recipe category id by name: category("Sauce")."""
    ids = dict(conn.execute("SELECT name, id FROM recipe_categories"))
    return ids.__getitem__


@pytest.fixture
def section(conn):
    """Ingredient section id on the Poke station, by name: section("Protein")."""
    ids = dict(conn.execute("SELECT name, id FROM sections WHERE name IS NOT NULL"))
    return ids.__getitem__


@pytest.fixture
def ingredient(conn, section):
    """Add an ingredient to the catalog, in one Poke section; returns its id."""

    def add(name, in_section="Protein"):
        return ingredients.add(conn, {"name": name, "section_ids": [section(in_section)]})["ingredient"]["id"]

    return add


# ---- Databases at an older version, for testing a migration ---------------
#
# Testing migration N: database_at(N - 1) gives a database at the version
# before it, full of typical rows; migrate it, then check every row is still
# there (row_counts helps). The rows are written for the schema AT that
# version, so a filler never changes once written: when a migration changes
# the schema in a way the previous filler can't express, add a filler for
# the new version beside it.


def _typical_rows_v1(conn):
    """Recipes with quantities, a sauce inside a recipe, favorites, an orphan ingredient."""
    add_starting_data(conn)
    section = dict(conn.execute("SELECT name, id FROM sections WHERE name IS NOT NULL"))
    category = dict(conn.execute("SELECT name, id FROM recipe_categories"))

    def add_ingredient(name, *in_sections):
        ingredient_id = conn.execute(
            "INSERT INTO ingredients (name, name_key) VALUES (?, ?)", (name, names.key(name))
        ).lastrowid
        for section_name in in_sections:
            conn.execute(
                "INSERT INTO section_ingredients (section_id, ingredient_id) VALUES (?, ?)",
                (section[section_name], ingredient_id),
            )
        return ingredient_id

    def add_recipe(name, in_category, components, url=None, notes=None):
        recipe_id = conn.execute(
            "INSERT INTO recipes (name, url, notes) VALUES (?, ?, ?)", (name, url, notes)
        ).lastrowid
        conn.execute(
            "INSERT INTO recipe_category_links (recipe_id, category_id) VALUES (?, ?)",
            (recipe_id, category[in_category]),
        )
        for column, component_id, quantity, unit in components:
            conn.execute(
                f"INSERT INTO recipe_components (recipe_id, {column}, quantity, unit) VALUES (?, ?, ?, ?)",
                (recipe_id, component_id, quantity, unit),
            )
        return recipe_id

    salmon = add_ingredient("Salmon", "Protein")
    rice = add_ingredient("Rice", "Base")
    soy = add_ingredient("Soy sauce", "Extras")
    add_ingredient("Brânză")  # an orphan: in no section
    teriyaki = add_recipe("Teriyaki", "Sauce", [("ingredient_id", soy, 30, "ml")])
    bowl = add_recipe(
        "Salmon bowl",
        "Poke bowl",
        [("ingredient_id", salmon, 120, "g"), ("ingredient_id", rice, 150, "g"), ("component_recipe_id", teriyaki, 2, "tbsp")],
        url="https://example.com/salmon-bowl",
        notes="extra lime",
    )
    conn.executemany(
        "INSERT INTO favorites (person, ingredient_id, recipe_id) VALUES (?, ?, ?)",
        [("me", salmon, None), ("her", None, bowl), ("me", None, bowl)],
    )
    conn.commit()


TYPICAL_ROWS = {1: _typical_rows_v1}


@pytest.fixture
def database_at():
    """database_at(version): an in-memory database migrated only that far, with typical rows."""
    opened = []

    def build(version):
        conn = db.get_connection(":memory:")
        opened.append(conn)
        db.migrate(conn, upto=version)
        filler = max(v for v in TYPICAL_ROWS if v <= version)
        TYPICAL_ROWS[filler](conn)
        return conn

    yield build
    for conn in opened:
        conn.close()


def row_counts(conn):
    """{table: number of rows} for every table, to check a migration kept them all."""
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")]
    return {table: conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] for table in tables}
