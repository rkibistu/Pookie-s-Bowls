"""Recipe categories: what one may hold, their order, and reading and writing them.

Every function takes the database connection to work on and returns plain
dicts; a broken rule raises RuleError. Nothing here knows about HTTP.

A recipe category has a name, unique ignoring case, and an emoji. Their order
decides a recipe's emoji (its first category's) and the category a new recipe
starts in (the first). Every recipe stays in at least one category, so the
last one can't be deleted.

Which categories a station lists, and in what order, is the station's
choice (see stations.py); that order is separate.
"""

import sqlite3

from errors import DUPLICATE, NOT_FOUND, RuleError

FIELDS = ("name", "emoji")


# ---- Reading -------------------------------------------------------------


def list_all(conn):
    """Every recipe category, in order."""
    return [
        _as_dict(r)
        for r in conn.execute(
            "SELECT id, name, emoji FROM recipe_categories ORDER BY position, id"
        )
    ]


def get(conn, category_id):
    row = conn.execute(
        "SELECT id, name, emoji FROM recipe_categories WHERE id = ?",
        (category_id,),
    ).fetchone()
    if row is None:
        raise RuleError("Category not found.", NOT_FOUND)
    return _as_dict(row)


def _as_dict(row):
    return dict(row)


# ---- Writing -------------------------------------------------------------


def create(conn, fields):
    """Save a new category at the end of the order; name and emoji are required."""
    if not isinstance(fields, dict):
        raise RuleError("Expected a JSON object.")
    category = _parse({k: fields.get(k) for k in FIELDS})
    try:
        with conn:
            cur = conn.execute(
                "INSERT INTO recipe_categories (name, emoji, position) "
                "VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM recipe_categories))",
                (category["name"], category["emoji"]),
            )
    except sqlite3.IntegrityError:
        raise _duplicate_name()
    return get(conn, cur.lastrowid)


def change(conn, category_id, fields):
    """Change only the fields given (name and/or emoji); the rest stays as stored."""
    get(conn, category_id)  # not found?
    if not isinstance(fields, dict):
        raise RuleError("Expected a JSON object.")
    category = _parse({k: v for k, v in fields.items() if k in FIELDS})
    if category:
        assignments = ", ".join(f"{k} = ?" for k in category)
        try:
            with conn:
                conn.execute(
                    f"UPDATE recipe_categories SET {assignments} WHERE id = ?",
                    (*category.values(), category_id),
                )
        except sqlite3.IntegrityError:
            raise _duplicate_name()
    return get(conn, category_id)


def reorder(conn, category_ids):
    """Put every category in the order given; returns them all, in that order."""
    known = sorted(c["id"] for c in list_all(conn))
    if (
        not isinstance(category_ids, list)
        or not all(isinstance(c, int) and not isinstance(c, bool) for c in category_ids)
        or sorted(category_ids) != known
    ):
        raise RuleError("category_ids must list every category once.")
    with conn:
        conn.executemany(
            "UPDATE recipe_categories SET position = ? WHERE id = ?",
            list(enumerate(category_ids)),
        )
    return list_all(conn)


def delete(conn, category_id):
    """Delete a category; recipes also in another one just lose it.

    Refused for the last category, and while some recipe has no other one.
    """
    get(conn, category_id)  # not found?
    if conn.execute("SELECT COUNT(*) FROM recipe_categories").fetchone()[0] == 1:
        raise RuleError("The last category can't be deleted; rename it instead.")
    stranded = [
        r["name"]
        for r in conn.execute(
            "SELECT r.name FROM recipes r "
            "JOIN recipe_category_links l ON l.recipe_id = r.id "
            "WHERE l.category_id = ? AND NOT EXISTS ("
            "  SELECT 1 FROM recipe_category_links o "
            "  WHERE o.recipe_id = r.id AND o.category_id <> l.category_id"
            ") ORDER BY r.name COLLATE NOCASE",
            (category_id,),
        )
    ]
    if stranded:
        raise RuleError(
            "Give these recipes another category first: " + ", ".join(stranded) + "."
        )
    with conn:
        conn.execute("DELETE FROM recipe_categories WHERE id = ?", (category_id,))


def _duplicate_name():
    """Names are unique ignoring case; the database says when one is taken."""
    return RuleError("A category with that name already exists.", DUPLICATE)


def _parse(fields):
    """Check the given fields; return them cleaned up."""
    parsers = {"name": _parse_name, "emoji": _parse_emoji}
    return {k: parsers[k](v) for k, v in fields.items()}


def _parse_name(name):
    name = name.strip() if isinstance(name, str) else ""
    if not name:
        raise RuleError("Please give the category a name.")
    return name


def _parse_emoji(emoji):
    emoji = emoji.strip() if isinstance(emoji, str) else ""
    if not emoji:
        raise RuleError("Please give the category an emoji.")
    return emoji
