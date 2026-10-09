"""Ingredients: what an ingredient may hold, and reading and writing them.

Every function takes the database connection to work on and returns plain
dicts; a broken rule raises RuleError. Nothing here knows about HTTP.

An ingredient is a base item (sauces are recipes) with a name, unique
ignoring case, and at least one ingredient category.
"""

import sqlite3

from errors import DUPLICATE, NOT_FOUND, RuleError
from recipes import favorites_by

FIELDS = ("name", "category_ids")


# ---- Reading -------------------------------------------------------------


def by_category(conn):
    """All ingredient categories in display order, each with its ingredients
    A→Z; an ingredient in several categories shows up under each."""
    categories = [
        {"id": r["id"], "slug": r["slug"], "name": r["name"], "ingredients": []}
        for r in conn.execute("SELECT id, slug, name FROM categories ORDER BY position, id")
    ]
    by_id = {c["id"]: c for c in categories}
    links = _category_ids(conn)
    favorites = favorites_by(conn, "ingredient_id")
    for r in conn.execute("SELECT id, name FROM ingredients ORDER BY name COLLATE NOCASE"):
        ingredient = {
            "id": r["id"],
            "name": r["name"],
            "category_ids": links.get(r["id"], []),
            "favorites": favorites.get(r["id"], []),
        }
        for category_id in ingredient["category_ids"]:
            by_id[category_id]["ingredients"].append(ingredient)
    return categories


def get(conn, ingredient_id):
    """One ingredient with its category ids."""
    row = conn.execute(
        "SELECT id, name FROM ingredients WHERE id = ?", (ingredient_id,)
    ).fetchone()
    if row is None:
        raise RuleError("Ingredient not found.", NOT_FOUND)
    return {
        "id": row["id"],
        "name": row["name"],
        "category_ids": _category_ids(conn, ingredient_id).get(ingredient_id, []),
    }


def _category_ids(conn, ingredient_id=None):
    """Category ids per ingredient, ascending: {ingredient id: [category id]}."""
    where, params = ("WHERE ingredient_id = ?", (ingredient_id,)) if ingredient_id else ("", ())
    links = {}
    for r in conn.execute(
        f"SELECT ingredient_id, category_id FROM ingredient_categories {where} "
        "ORDER BY category_id",
        params,
    ):
        links.setdefault(r["ingredient_id"], []).append(r["category_id"])
    return links


# ---- Writing -------------------------------------------------------------


def create(conn, fields):
    """Save a new ingredient; name and category_ids are required."""
    if not isinstance(fields, dict):
        raise RuleError("Expected a JSON object.")
    ingredient = _parse(conn, {k: fields.get(k) for k in FIELDS})
    try:
        with conn:
            cur = conn.execute("INSERT INTO ingredients (name) VALUES (?)", (ingredient["name"],))
            _write_categories(conn, cur.lastrowid, ingredient["category_ids"])
    except sqlite3.IntegrityError:
        raise _duplicate_name()
    return get(conn, cur.lastrowid)


def change(conn, ingredient_id, fields):
    """Change only the fields given; the rest stays as stored."""
    get(conn, ingredient_id)  # not found?
    if not isinstance(fields, dict):
        raise RuleError("Expected a JSON object.")
    ingredient = _parse(conn, {k: v for k, v in fields.items() if k in FIELDS})
    try:
        with conn:
            if "name" in ingredient:
                conn.execute(
                    "UPDATE ingredients SET name = ? WHERE id = ?",
                    (ingredient["name"], ingredient_id),
                )
            if "category_ids" in ingredient:
                _write_categories(conn, ingredient_id, ingredient["category_ids"])
    except sqlite3.IntegrityError:
        raise _duplicate_name()
    return get(conn, ingredient_id)


def delete(conn, ingredient_id):
    """Delete an ingredient; it also disappears from any recipe that had it."""
    with conn:
        cur = conn.execute("DELETE FROM ingredients WHERE id = ?", (ingredient_id,))
    if cur.rowcount == 0:
        raise RuleError("Ingredient not found.", NOT_FOUND)


def _duplicate_name():
    """Names are unique ignoring case; the database says when one is taken."""
    return RuleError("An ingredient with that name already exists.", DUPLICATE)


def _parse(conn, fields):
    """Check the given fields; return them cleaned up."""
    parsers = {
        "name": _parse_name,
        "category_ids": lambda v: _parse_category_ids(conn, v),
    }
    return {k: parsers[k](v) for k, v in fields.items()}


def _parse_name(name):
    name = name.strip() if isinstance(name, str) else ""
    if not name:
        raise RuleError("Please give the ingredient a name.")
    return name


def _parse_category_ids(conn, category_ids):
    """Known ingredient category ids, sorted and unique; at least one."""
    if not isinstance(category_ids, list) or not all(
        isinstance(c, int) and not isinstance(c, bool) for c in category_ids
    ):
        raise RuleError("category_ids must be a list of category ids.")
    category_ids = sorted(set(category_ids))
    if not category_ids:
        raise RuleError("Pick at least one category.")
    placeholders = ",".join("?" * len(category_ids))
    found = conn.execute(
        f"SELECT COUNT(*) FROM categories WHERE id IN ({placeholders})", category_ids
    ).fetchone()[0]
    if found != len(category_ids):
        raise RuleError("Unknown category.")
    return category_ids


def _write_categories(conn, ingredient_id, category_ids):
    conn.execute("DELETE FROM ingredient_categories WHERE ingredient_id = ?", (ingredient_id,))
    conn.executemany(
        "INSERT INTO ingredient_categories (ingredient_id, category_id) VALUES (?, ?)",
        [(ingredient_id, c) for c in category_ids],
    )
