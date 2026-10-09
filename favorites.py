"""Favorites: each person's heart on an item (an ingredient or a recipe).

Every function takes the database connection to work on; a broken rule
raises RuleError. Nothing here knows about HTTP, and nothing outside knows
how favorites are stored: callers speak in items, {type, id}.
"""

from errors import NOT_FOUND, RuleError

PEOPLE = ("me", "her")

# Where each type of item lives, and its column in the favorites table.
_TABLE = {"ingredient": "ingredients", "recipe": "recipes"}
_COLUMN = {"ingredient": "ingredient_id", "recipe": "recipe_id"}


def by_item(conn):
    """Who has favorited each item, "me" before "her": {(type, id): [person]}."""
    favorites = {}
    for r in conn.execute(
        "SELECT ingredient_id, recipe_id, person FROM favorites ORDER BY person DESC"
    ):
        if r["ingredient_id"] is not None:
            key = ("ingredient", r["ingredient_id"])
        else:
            key = ("recipe", r["recipe_id"])
        favorites.setdefault(key, []).append(r["person"])
    return favorites


def set(conn, item, person, on):
    """Add (on) or remove one person's favorite on an item; doing it twice
    changes nothing. The item must exist."""
    if person not in PEOPLE:
        raise RuleError("person must be 'me' or 'her'.")
    kind, item_id = item["type"], item["id"]
    if kind not in _TABLE:
        raise RuleError("type must be 'ingredient' or 'recipe'.")
    if conn.execute(f"SELECT 1 FROM {_TABLE[kind]} WHERE id = ?", (item_id,)).fetchone() is None:
        raise RuleError(f"{kind.capitalize()} not found.", NOT_FOUND)
    column = _COLUMN[kind]
    with conn:
        if on:
            conn.execute(
                f"INSERT OR IGNORE INTO favorites (person, {column}) VALUES (?, ?)",
                (person, item_id),
            )
        else:
            conn.execute(
                f"DELETE FROM favorites WHERE person = ? AND {column} = ?",
                (person, item_id),
            )
