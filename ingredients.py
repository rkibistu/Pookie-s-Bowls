"""Ingredients: what an ingredient may hold, and reading and writing them.

Every function takes the database connection to work on and returns plain
dicts; a broken rule raises RuleError. Nothing here knows about HTTP.

An ingredient is a base item (sauces are recipes) with a name, unique
ignoring case. Where it shows up is its section ids: ingredient sections on
any stations, or none (an orphan).
"""

import sqlite3

import favorites
from errors import DUPLICATE, NOT_FOUND, RuleError

FIELDS = ("name", "section_ids")


# ---- Reading -------------------------------------------------------------


def list_all(conn):
    """Every ingredient A→Z, orphans included, with its section ids and favorites."""
    links = _section_ids(conn)
    favorited = favorites.by_item(conn)
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "section_ids": links.get(r["id"], []),
            "favorites": favorited.get(("ingredient", r["id"]), []),
        }
        for r in conn.execute("SELECT id, name FROM ingredients ORDER BY name COLLATE NOCASE")
    ]


def get(conn, ingredient_id):
    """One ingredient with its section ids."""
    row = conn.execute(
        "SELECT id, name FROM ingredients WHERE id = ?", (ingredient_id,)
    ).fetchone()
    if row is None:
        raise RuleError("Ingredient not found.", NOT_FOUND)
    return {
        "id": row["id"],
        "name": row["name"],
        "section_ids": _section_ids(conn, ingredient_id).get(ingredient_id, []),
    }


def _section_ids(conn, ingredient_id=None):
    """Section ids per ingredient, ascending: {ingredient id: [section id]}."""
    where, params = ("WHERE ingredient_id = ?", (ingredient_id,)) if ingredient_id else ("", ())
    links = {}
    for r in conn.execute(
        f"SELECT ingredient_id, section_id FROM section_ingredients {where} "
        "ORDER BY section_id",
        params,
    ):
        links.setdefault(r["ingredient_id"], []).append(r["section_id"])
    return links


# ---- Writing -------------------------------------------------------------


def create(conn, fields):
    """Save a new ingredient; a name is required, section_ids may be left out
    (an orphan)."""
    if not isinstance(fields, dict):
        raise RuleError("Expected a JSON object.")
    ingredient = _parse(
        conn, {"name": fields.get("name"), "section_ids": fields.get("section_ids", [])}
    )
    try:
        with conn:
            cur = conn.execute("INSERT INTO ingredients (name) VALUES (?)", (ingredient["name"],))
            _write_sections(conn, cur.lastrowid, ingredient["section_ids"])
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
            if "section_ids" in ingredient:
                _write_sections(conn, ingredient_id, ingredient["section_ids"])
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
        "section_ids": lambda v: _parse_section_ids(conn, v),
    }
    return {k: parsers[k](v) for k, v in fields.items()}


def _parse_name(name):
    name = name.strip() if isinstance(name, str) else ""
    if not name:
        raise RuleError("Please give the ingredient a name.")
    return name


def _parse_section_ids(conn, section_ids):
    """Known ingredient section ids, sorted and unique; may be empty."""
    if not isinstance(section_ids, list) or not all(
        isinstance(c, int) and not isinstance(c, bool) for c in section_ids
    ):
        raise RuleError("section_ids must be a list of section ids.")
    section_ids = sorted(set(section_ids))
    if not section_ids:
        return []
    placeholders = ",".join("?" * len(section_ids))
    found = conn.execute(
        f"SELECT COUNT(*) FROM sections WHERE name IS NOT NULL AND id IN ({placeholders})",
        section_ids,
    ).fetchone()[0]
    if found != len(section_ids):
        raise RuleError("Unknown section.")
    return section_ids


def _write_sections(conn, ingredient_id, section_ids):
    conn.execute("DELETE FROM section_ingredients WHERE ingredient_id = ?", (ingredient_id,))
    conn.executemany(
        "INSERT INTO section_ingredients (section_id, ingredient_id) VALUES (?, ?)",
        [(s, ingredient_id) for s in section_ids],
    )
