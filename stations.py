"""Stations: pages set up for picking one kind of recipe, and their sections.

Every function takes the database connection to work on and returns plain
dicts; a broken rule raises RuleError. Nothing here knows about HTTP.

A station has a name (unique, see names.py), an emoji, the recipe category
its new recipes start in (None: the first one), and its sections in order.
A section is either an ingredient section of its own (a name, unique on the
station) or a listed recipe category, whose recipes it shows.
Deleting a section never touches the ingredients in it: an ingredient in no
section anywhere is an orphan, and that's fine (see docs/adr/0001).
"""

import sqlite3

import favorites
import names
from errors import DUPLICATE, NOT_FOUND, RuleError

STATION_FIELDS = ("name", "emoji", "recipe_category_id")


# ---- Reading -------------------------------------------------------------


def list_all(conn):
    """Every station in order, each with its sections in order and their rows:
    an ingredient section's ingredients, or a listed category's recipes, A→Z."""
    favorited = favorites.by_item(conn)
    stations = [
        {**dict(r), "sections": []}
        for r in conn.execute(
            "SELECT id, name, emoji, recipe_category_id FROM stations ORDER BY position, id"
        )
    ]
    by_id = {s["id"]: s for s in stations}
    sections = {}
    for r in conn.execute(
        "SELECT s.id, s.station_id, s.name, s.recipe_category_id, c.name AS category_name, "
        "       c.emoji AS category_emoji "
        "FROM sections s LEFT JOIN recipe_categories c ON c.id = s.recipe_category_id "
        "ORDER BY s.position, s.id"
    ):
        if r["recipe_category_id"] is None:
            section = {"id": r["id"], "kind": "ingredients", "name": r["name"], "items": []}
        else:
            section = {
                "id": r["id"],
                "kind": "recipes",
                "recipe_category_id": r["recipe_category_id"],
                "name": r["category_name"],
                "emoji": r["category_emoji"],
                "items": [],
            }
        sections[r["id"]] = section
        by_id[r["station_id"]]["sections"].append(section)

    for r in conn.execute(
        "SELECT si.section_id, i.id, i.name FROM section_ingredients si "
        "JOIN ingredients i ON i.id = si.ingredient_id ORDER BY i.name_key"
    ):
        sections[r["section_id"]]["items"].append(
            _row("ingredient", r, favorited.get(("ingredient", r["id"]), []))
        )
    for r in conn.execute(
        "SELECT s.id AS section_id, r.id, r.name FROM sections s "
        "JOIN recipe_category_links l ON l.category_id = s.recipe_category_id "
        "JOIN recipes r ON r.id = l.recipe_id ORDER BY r.name COLLATE NOCASE"
    ):
        sections[r["section_id"]]["items"].append(
            _row("recipe", r, favorited.get(("recipe", r["id"]), []))
        )
    return stations


def _row(type_, r, favorited):
    return {"type": type_, "id": r["id"], "name": r["name"], "favorites": favorited}


def get(conn, station_id):
    """One station with its sections."""
    for station in list_all(conn):
        if station["id"] == station_id:
            return station
    raise RuleError("Station not found.", NOT_FOUND)


def _section(conn, section_id):
    row = conn.execute(
        "SELECT id, station_id, name, recipe_category_id FROM sections WHERE id = ?",
        (section_id,),
    ).fetchone()
    if row is None:
        raise RuleError("Section not found.", NOT_FOUND)
    return row


# ---- Writing: the station ------------------------------------------------


def create(conn, fields):
    """Save a new station at the end, with no sections; name and emoji are
    required, and its new recipes start in the first recipe category."""
    if not isinstance(fields, dict):
        raise RuleError("Expected a JSON object.")
    name = _parse_name(fields.get("name"), "Please give the station a name.")
    emoji = _parse_emoji(fields.get("emoji"))
    try:
        with conn:
            cur = conn.execute(
                "INSERT INTO stations (name, name_key, emoji, position) "
                "VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM stations))",
                (name, names.key(name), emoji),
            )
    except sqlite3.IntegrityError:
        raise _duplicate_station()
    return get(conn, cur.lastrowid)


def delete(conn, station_id):
    """Delete a station and its sections; ingredients only in those sections
    become orphans. The last station can't be deleted."""
    get(conn, station_id)  # not found?
    if conn.execute("SELECT COUNT(*) FROM stations").fetchone()[0] == 1:
        raise RuleError("The last station can't be deleted; rename it instead.")
    with conn:
        conn.execute("DELETE FROM stations WHERE id = ?", (station_id,))


def change(conn, station_id, fields):
    """Change only the fields given: name, emoji, recipe_category_id (None:
    new recipes start in the first recipe category)."""
    get(conn, station_id)  # not found?
    if not isinstance(fields, dict):
        raise RuleError("Expected a JSON object.")
    parsers = {
        "name": lambda v: _parse_name(v, "Please give the station a name."),
        "emoji": _parse_emoji,
        "recipe_category_id": lambda v: _parse_recipe_category_id(conn, v, optional=True),
    }
    station = {k: parsers[k](v) for k, v in fields.items() if k in STATION_FIELDS}
    if "name" in station:
        station["name_key"] = names.key(station["name"])
    if station:
        assignments = ", ".join(f"{k} = ?" for k in station)
        try:
            with conn:
                conn.execute(
                    f"UPDATE stations SET {assignments} WHERE id = ?",
                    (*station.values(), station_id),
                )
        except sqlite3.IntegrityError:
            raise _duplicate_station()
    return get(conn, station_id)


# ---- Writing: sections ---------------------------------------------------


def add_section(conn, station_id, fields):
    """Add a section at the end of the station: {name} for a new ingredient
    section, or {recipe_category_id} to list that recipe category."""
    get(conn, station_id)  # not found?
    if not isinstance(fields, dict) or ("name" in fields) == ("recipe_category_id" in fields):
        raise RuleError("Give either a name or a recipe_category_id.")
    if "name" in fields:
        name = _parse_name(fields["name"], "Please give the section a name.")
        values = {"name": name, "name_key": names.key(name)}
    else:
        values = {
            "recipe_category_id": _parse_recipe_category_id(conn, fields["recipe_category_id"])
        }
    columns = ", ".join(values)
    marks = ", ".join("?" * len(values))
    try:
        with conn:
            cur = conn.execute(
                f"INSERT INTO sections (station_id, position, {columns}) VALUES (?, "
                f"(SELECT COALESCE(MAX(position), -1) + 1 FROM sections WHERE station_id = ?), {marks})",
                (station_id, station_id, *values.values()),
            )
    except sqlite3.IntegrityError:
        raise _duplicate("name" if "name" in values else "recipe_category_id")
    return _section_of(conn, station_id, cur.lastrowid)


def rename_section(conn, section_id, name):
    """Rename an ingredient section (a listed category is renamed as a recipe
    category, on the Recipes page)."""
    section = _section(conn, section_id)
    if section["name"] is None:
        raise RuleError("A listed category is renamed on the Recipes page.")
    name = _parse_name(name, "Please give the section a name.")
    try:
        with conn:
            conn.execute(
                "UPDATE sections SET name = ?, name_key = ? WHERE id = ?",
                (name, names.key(name), section_id),
            )
    except sqlite3.IntegrityError:
        raise _duplicate("name")
    return _section_of(conn, section["station_id"], section_id)


def delete_section(conn, section_id):
    """Delete an ingredient section (its ingredients just leave it) or unlist
    a recipe category from the station."""
    _section(conn, section_id)  # not found?
    with conn:
        conn.execute("DELETE FROM sections WHERE id = ?", (section_id,))


def reorder_sections(conn, station_id, section_ids):
    """Put every section of the station in the order given; returns the station."""
    get(conn, station_id)  # not found?
    known = sorted(
        r[0] for r in conn.execute("SELECT id FROM sections WHERE station_id = ?", (station_id,))
    )
    if (
        not isinstance(section_ids, list)
        or not all(_is_id(s) for s in section_ids)
        or sorted(section_ids) != known
    ):
        raise RuleError("section_ids must list every section of the station once.")
    with conn:
        conn.executemany(
            "UPDATE sections SET position = ? WHERE id = ?", list(enumerate(section_ids))
        )
    return get(conn, station_id)


def _section_of(conn, station_id, section_id):
    return next(s for s in get(conn, station_id)["sections"] if s["id"] == section_id)


def _duplicate_station():
    """Station names are unique (names.py); the database says when one is taken."""
    return RuleError("A station with that name already exists.", DUPLICATE)


def _duplicate(column):
    if column == "name":
        return RuleError("This station already has a section with that name.", DUPLICATE)
    return RuleError("That category is already listed here.", DUPLICATE)


# ---- Parsing -------------------------------------------------------------


def _is_id(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _parse_name(name, message):
    name = name.strip() if isinstance(name, str) else ""
    if not name:
        raise RuleError(message)
    return name


def _parse_emoji(emoji):
    emoji = emoji.strip() if isinstance(emoji, str) else ""
    if not emoji:
        raise RuleError("Please give the station an emoji.")
    return emoji


def _parse_recipe_category_id(conn, category_id, optional=False):
    if optional and category_id is None:
        return None
    if not _is_id(category_id):
        raise RuleError("recipe_category_id must be a category id.")
    if conn.execute("SELECT 1 FROM recipe_categories WHERE id = ?", (category_id,)).fetchone() is None:
        raise RuleError("Unknown category.")
    return category_id
