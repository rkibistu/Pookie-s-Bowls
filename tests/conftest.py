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


@pytest.fixture
def conn():
    """A fresh in-memory database with the schema and seeds."""
    conn = db.get_connection(":memory:")
    db.set_up(conn)
    yield conn
    conn.close()


@pytest.fixture
def category(conn):
    """Recipe category id by name: category("Sauce")."""
    ids = dict(conn.execute("SELECT name, id FROM recipe_categories"))
    return ids.__getitem__


@pytest.fixture
def section(conn):
    """Ingredient section id on the seeded Poke station, by name: section("Protein")."""
    ids = dict(conn.execute("SELECT name, id FROM sections WHERE name IS NOT NULL"))
    return ids.__getitem__


@pytest.fixture
def ingredient(conn, section):
    """Add an ingredient to the catalog, in one Poke section; returns its id."""

    def add(name, in_section="Protein"):
        return ingredients.add(conn, {"name": name, "section_ids": [section(in_section)]})["ingredient"]["id"]

    return add
