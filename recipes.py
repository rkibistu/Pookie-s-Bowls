"""Recipes: what a recipe may hold, and reading and writing them.

Every function takes the database connection to work on and returns plain
dicts; a broken rule raises RuleError. Nothing here knows about HTTP.

A recipe's components are items, {type: "ingredient" | "recipe", id}, in
pick order. Any recipe can go inside another, as long as that doesn't make a
loop (only listed recipes are offered for picking, but that's the screen's
business).
"""

from urllib.parse import urlsplit

import favorites
from errors import NOT_FOUND, RuleError

FIELDS = ("name", "url", "notes", "category_ids", "components")


# ---- Reading -------------------------------------------------------------


def get(conn, recipe_id):
    """One recipe with its categories, components and favorites."""
    row = _row(conn, recipe_id)
    favorited = favorites.by_item(conn)
    components = _components(conn, recipe_id).get(recipe_id, [])
    for c in components:
        c["favorites"] = favorited.get((c["type"], c["id"]), [])
    return {
        **dict(row),
        "categories": _categories(conn, recipe_id).get(recipe_id, []),
        "components": components,
        "favorites": favorited.get(("recipe", recipe_id), []),
    }


def list_all(conn):
    """All recipes, newest first, each with its categories and components."""
    categories = _categories(conn)
    components = _components(conn)
    return [
        {
            **dict(r),
            "categories": categories.get(r["id"], []),
            "components": components.get(r["id"], []),
        }
        for r in conn.execute(
            "SELECT id, name, url, notes FROM recipes ORDER BY created_at DESC, id DESC"
        )
    ]


def _row(conn, recipe_id):
    row = conn.execute(
        "SELECT id, name, url, notes, created_at FROM recipes WHERE id = ?",
        (recipe_id,),
    ).fetchone()
    if row is None:
        raise RuleError("Recipe not found.", NOT_FOUND)
    return row


def _categories(conn, recipe_id=None):
    """Categories per recipe, in display order: {recipe id: [category]}."""
    where, params = ("WHERE l.recipe_id = ?", (recipe_id,)) if recipe_id else ("", ())
    categories = {}
    for r in conn.execute(
        "SELECT l.recipe_id, c.id, c.name, c.emoji "
        "FROM recipe_category_links l "
        f"JOIN recipe_categories c ON c.id = l.category_id {where} "
        "ORDER BY c.position, c.id",
        params,
    ):
        categories.setdefault(r["recipe_id"], []).append(
            {"id": r["id"], "name": r["name"], "emoji": r["emoji"]}
        )
    return categories


def _components(conn, recipe_id=None):
    """Components per recipe, in pick order: {recipe id: [{type, id, name}]}."""
    where, params = ("WHERE rc.recipe_id = ?", (recipe_id,)) if recipe_id else ("", ())
    components = {}
    for r in conn.execute(
        "SELECT rc.recipe_id, rc.ingredient_id, rc.component_recipe_id, "
        "       COALESCE(i.name, sub.name) AS name "
        "FROM recipe_components rc "
        "LEFT JOIN ingredients i ON i.id = rc.ingredient_id "
        f"LEFT JOIN recipes sub ON sub.id = rc.component_recipe_id {where} "
        "ORDER BY rc.id",
        params,
    ):
        if r["ingredient_id"] is not None:
            component = {"type": "ingredient", "id": r["ingredient_id"]}
        else:
            component = {"type": "recipe", "id": r["component_recipe_id"]}
        component["name"] = r["name"]
        components.setdefault(r["recipe_id"], []).append(component)
    return components


# ---- Writing -------------------------------------------------------------


def create(conn, fields):
    """Save a new recipe; name and category_ids are required."""
    if not isinstance(fields, dict):
        raise RuleError("Expected a JSON object.")
    recipe = _parse(conn, {k: fields.get(k) for k in FIELDS})
    with conn:
        cur = conn.execute(
            "INSERT INTO recipes (name, url, notes) VALUES (?, ?, ?)",
            (recipe["name"], recipe["url"], recipe["notes"]),
        )
        _write_categories(conn, cur.lastrowid, recipe["category_ids"])
        _write_components(conn, cur.lastrowid, recipe["components"])
    return get(conn, cur.lastrowid)


def change(conn, recipe_id, fields):
    """Change only the fields given (e.g. just notes); the rest stays as stored."""
    _row(conn, recipe_id)  # not found?
    if not isinstance(fields, dict):
        raise RuleError("Expected a JSON object.")
    recipe = _parse(conn, {k: v for k, v in fields.items() if k in FIELDS}, recipe_id)
    own = {k: recipe[k] for k in ("name", "url", "notes") if k in recipe}
    with conn:
        if own:
            assignments = ", ".join(f"{k} = ?" for k in own)
            conn.execute(
                f"UPDATE recipes SET {assignments} WHERE id = ?", (*own.values(), recipe_id)
            )
        if "category_ids" in recipe:
            _write_categories(conn, recipe_id, recipe["category_ids"])
        if "components" in recipe:
            _write_components(conn, recipe_id, recipe["components"])
    return get(conn, recipe_id)


def _parse(conn, fields, recipe_id=None):
    """Check the given fields; return them cleaned up."""
    parsers = {
        "name": lambda v: _parse_name(v),
        "notes": lambda v: _parse_notes(v),
        "url": lambda v: _parse_url(v),
        "category_ids": lambda v: _parse_category_ids(conn, v),
        "components": lambda v: _parse_components(conn, v, recipe_id),
    }
    return {k: parsers[k](v) for k, v in fields.items()}


def _is_id(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _parse_name(name):
    name = name.strip() if isinstance(name, str) else ""
    if not name:
        raise RuleError("Please give the recipe a name.")
    return name


def _parse_notes(notes):
    """Optional notes; blank becomes None."""
    if notes is not None and not isinstance(notes, str):
        raise RuleError("notes must be text.")
    return (notes or "").strip() or None


def _parse_url(url):
    """The optional link as http(s), or None if blank."""
    if url is not None and not isinstance(url, str):
        raise RuleError("url must be text.")
    url = (url or "").strip()
    if not url:
        return None
    if "://" not in url:
        url = "https://" + url  # "example.com/poke" → https://example.com/poke
    # Only http(s) is accepted, so the URL is always safe to use as an href.
    invalid = RuleError("Please enter a valid link (http/https).")
    if any(c.isspace() for c in url):
        raise invalid
    try:
        parts = urlsplit(url)
        parts.port  # raises ValueError on a malformed port
    except ValueError:
        raise invalid
    if parts.scheme.lower() not in ("http", "https") or not parts.hostname:
        raise invalid
    return url


def _parse_category_ids(conn, category_ids):
    """Known recipe category ids, sorted and unique; at least one."""
    if not isinstance(category_ids, list) or not all(map(_is_id, category_ids)):
        raise RuleError("category_ids must be a list of category ids.")
    category_ids = sorted(set(category_ids))
    if not category_ids:
        raise RuleError("Pick at least one category.")
    if _count_known(conn, "recipe_categories", category_ids) != len(category_ids):
        raise RuleError("Unknown category.")
    return category_ids


def _parse_components(conn, components, recipe_id):
    """Known items, deduped, in pick order: [(type, id)].

    recipe_id is the recipe being changed, which must not end up inside itself.
    """
    if components is None:
        return []
    invalid = RuleError("components must be a list of {type, id} items.")
    if not isinstance(components, list):
        raise invalid
    parsed = []
    for c in components:
        if not isinstance(c, dict) or c.get("type") not in ("ingredient", "recipe"):
            raise invalid
        if not _is_id(c.get("id")):
            raise invalid
        parsed.append((c["type"], c["id"]))
    parsed = list(dict.fromkeys(parsed))  # dedupe, keep order

    ingredient_ids = [i for t, i in parsed if t == "ingredient"]
    if _count_known(conn, "ingredients", ingredient_ids) != len(ingredient_ids):
        raise RuleError("Unknown ingredient.")
    recipe_ids = [i for t, i in parsed if t == "recipe"]
    if _count_known(conn, "recipes", recipe_ids) != len(recipe_ids):
        raise RuleError("Unknown recipe.")
    if recipe_id is not None and recipe_id in _inside(conn, recipe_ids):
        raise RuleError("A recipe can't go inside itself.")
    return parsed


def _inside(conn, recipe_ids):
    """These recipes and every recipe inside them, all the way down."""
    if not recipe_ids:
        return set()
    placeholders = ",".join("?" * len(recipe_ids))
    return {
        r[0]
        for r in conn.execute(
            "WITH RECURSIVE inside(id) AS ("
            f"  SELECT id FROM recipes WHERE id IN ({placeholders})"
            "  UNION"
            "  SELECT rc.component_recipe_id FROM recipe_components rc"
            "  JOIN inside ON rc.recipe_id = inside.id"
            "  WHERE rc.component_recipe_id IS NOT NULL"
            ") SELECT id FROM inside",
            recipe_ids,
        )
    }


def _count_known(conn, table, ids):
    if not ids:
        return 0
    placeholders = ",".join("?" * len(ids))
    return conn.execute(
        f"SELECT COUNT(*) FROM {table} WHERE id IN ({placeholders})", ids
    ).fetchone()[0]


def _write_categories(conn, recipe_id, category_ids):
    conn.execute("DELETE FROM recipe_category_links WHERE recipe_id = ?", (recipe_id,))
    conn.executemany(
        "INSERT INTO recipe_category_links (recipe_id, category_id) VALUES (?, ?)",
        [(recipe_id, c) for c in category_ids],
    )


def _write_components(conn, recipe_id, components):
    conn.execute("DELETE FROM recipe_components WHERE recipe_id = ?", (recipe_id,))
    conn.executemany(
        "INSERT INTO recipe_components (recipe_id, ingredient_id, component_recipe_id) "
        "VALUES (?, ?, ?)",
        [
            (recipe_id, i if t == "ingredient" else None, i if t == "recipe" else None)
            for t, i in components
        ],
    )


def delete(conn, recipe_id):
    """Delete a recipe; it also disappears from any recipe that contained it."""
    with conn:
        cur = conn.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
    if cur.rowcount == 0:
        raise RuleError("Recipe not found.", NOT_FOUND)
