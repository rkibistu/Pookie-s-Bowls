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
    """A fresh in-memory database with the schema and fixed categories."""
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
def ingredient(conn):
    """Add an ingredient to the catalog; returns its id."""

    def add(name, category="protein"):
        category_id = conn.execute(
            "SELECT id FROM categories WHERE slug = ?", (category,)
        ).fetchone()[0]
        return ingredients.create(conn, {"name": name, "category_ids": [category_id]})["id"]

    return add
