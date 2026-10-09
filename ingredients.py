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

FIELDS = ("name", "add_section_ids", "remove_section_ids")


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


def add(conn, fields):
    """Add an ingredient to the sections given; never makes a duplicate.

    A name already in the catalog (ignoring case) reuses that ingredient and
    keeps its name; adding only ever puts it into more sections. section_ids
    may be left out (a new one is an orphan). Returns {ingredient, reused,
    added_to}: added_to is the section ids it wasn't in before.
    """
    if not isinstance(fields, dict):
        raise RuleError("Expected a JSON object.")
    ingredient = _parse(
        conn, {"name": fields.get("name"), "section_ids": fields.get("section_ids", [])}
    )
    with conn:
        # The unique index decides "same name", so the lookup can't disagree
        # with it, and two adds at once can't both insert.
        reused = conn.execute(
            "INSERT INTO ingredients (name) VALUES (?) ON CONFLICT DO NOTHING",
            (ingredient["name"],),
        ).rowcount == 0
        ingredient_id = conn.execute(
            "SELECT id FROM ingredients WHERE name = ? COLLATE NOCASE", (ingredient["name"],)
        ).fetchone()[0]
        already = set(_section_ids(conn, ingredient_id).get(ingredient_id, []))
        added_to = [s for s in ingredient["section_ids"] if s not in already]
        conn.executemany(
            "INSERT INTO section_ingredients (section_id, ingredient_id) VALUES (?, ?)",
            [(s, ingredient_id) for s in added_to],
        )
    return {"ingredient": get(conn, ingredient_id), "reused": reused, "added_to": added_to}


def change(conn, ingredient_id, fields):
    """Change only what's given: name, add_section_ids, remove_section_ids.

    Sections not mentioned stay as stored, so a change made meanwhile on the
    other phone survives. Removing it from a section it isn't in is fine.
    """
    get(conn, ingredient_id)  # not found?
    if not isinstance(fields, dict):
        raise RuleError("Expected a JSON object.")
    ingredient = _parse(conn, {k: v for k, v in fields.items() if k in FIELDS})
    added = ingredient.get("add_section_ids", [])
    removed = ingredient.get("remove_section_ids", [])
    if set(added) & set(removed):
        raise RuleError("A section can't be both added and removed.")
    try:
        with conn:
            if "name" in ingredient:
                conn.execute(
                    "UPDATE ingredients SET name = ? WHERE id = ?",
                    (ingredient["name"], ingredient_id),
                )
            conn.executemany(
                "INSERT OR IGNORE INTO section_ingredients (section_id, ingredient_id) "
                "VALUES (?, ?)",
                [(s, ingredient_id) for s in added],
            )
            conn.executemany(
                "DELETE FROM section_ingredients WHERE section_id = ? AND ingredient_id = ?",
                [(s, ingredient_id) for s in removed],
            )
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
        "section_ids": lambda v: _parse_known_sections(conn, "section_ids", v),
        "add_section_ids": lambda v: _parse_known_sections(conn, "add_section_ids", v),
        "remove_section_ids": lambda v: _parse_ids("remove_section_ids", v),
    }
    return {k: parsers[k](v) for k, v in fields.items()}


def _parse_name(name):
    name = name.strip() if isinstance(name, str) else ""
    if not name:
        raise RuleError("Please give the ingredient a name.")
    return name


def _parse_ids(field, ids):
    """Section ids, sorted and unique; may be empty."""
    if not isinstance(ids, list) or not all(
        isinstance(c, int) and not isinstance(c, bool) for c in ids
    ):
        raise RuleError(f"{field} must be a list of section ids.")
    return sorted(set(ids))


def _parse_known_sections(conn, field, section_ids):
    """Known ingredient section ids, sorted and unique; may be empty."""
    section_ids = _parse_ids(field, section_ids)
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
