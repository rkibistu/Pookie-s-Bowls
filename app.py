"""Pookie's Bowls — Flask app entry point."""

import os
import sqlite3
from urllib.parse import urlsplit

from flask import Flask, jsonify, render_template, request

import db

app = Flask(__name__)
app.teardown_appcontext(db.close_db)

# Ensure the database and seed data exist before serving any request.
db.init_db()


class ApiError(Exception):
    """An error returned to the client as JSON: {"error": message}."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


@app.errorhandler(ApiError)
def handle_api_error(err):
    return jsonify(error=err.message), err.status


@app.route("/")
def index():
    return render_template("index.html")


# ---- Ingredients ---------------------------------------------------------


def _parse_ingredient(payload):
    """Validate an ingredient body; return (name, sorted unique category ids)."""
    if not isinstance(payload, dict):
        raise ApiError("Expected a JSON object.")

    name = payload.get("name")
    name = name.strip() if isinstance(name, str) else ""
    if not name:
        raise ApiError("Please give the ingredient a name.")

    category_ids = payload.get("category_ids")
    if not isinstance(category_ids, list) or not all(
        isinstance(c, int) and not isinstance(c, bool) for c in category_ids
    ):
        raise ApiError("category_ids must be a list of category ids.")
    category_ids = sorted(set(category_ids))
    if not category_ids:
        raise ApiError("Pick at least one category.")

    placeholders = ",".join("?" * len(category_ids))
    found = db.get_db().execute(
        f"SELECT COUNT(*) FROM categories WHERE id IN ({placeholders})",
        category_ids,
    ).fetchone()[0]
    if found != len(category_ids):
        raise ApiError("Unknown category.")

    return name, category_ids


def _get_ingredient(conn, ingredient_id):
    """Return one ingredient as a dict, or raise 404."""
    row = conn.execute(
        "SELECT id, name FROM ingredients WHERE id = ?", (ingredient_id,)
    ).fetchone()
    if row is None:
        raise ApiError("Ingredient not found.", 404)
    category_ids = [
        r["category_id"]
        for r in conn.execute(
            "SELECT category_id FROM ingredient_categories "
            "WHERE ingredient_id = ? ORDER BY category_id",
            (ingredient_id,),
        )
    ]
    return {"id": row["id"], "name": row["name"], "category_ids": category_ids}


def _set_categories(conn, ingredient_id, category_ids):
    """Replace an ingredient's category links."""
    conn.execute(
        "DELETE FROM ingredient_categories WHERE ingredient_id = ?",
        (ingredient_id,),
    )
    conn.executemany(
        "INSERT INTO ingredient_categories (ingredient_id, category_id) "
        "VALUES (?, ?)",
        [(ingredient_id, c) for c in category_ids],
    )


def _duplicate_name():
    return ApiError("An ingredient with that name already exists.", 409)


@app.get("/api/ingredients")
def list_ingredients():
    """All categories in display order, each with its ingredients A→Z, plus
    the recipe sections shown alongside them (e.g. sauces)."""
    conn = db.get_db()
    categories = [
        {"id": r["id"], "slug": r["slug"], "name": r["name"], "ingredients": []}
        for r in conn.execute(
            "SELECT id, slug, name FROM categories ORDER BY position, id"
        )
    ]

    # Every category an ingredient belongs to, to send along with it.
    links = {}
    for r in conn.execute(
        "SELECT ingredient_id, category_id FROM ingredient_categories "
        "ORDER BY category_id"
    ):
        links.setdefault(r["ingredient_id"], []).append(r["category_id"])

    favorites = _favorites_by(conn, "ingredient_id")

    by_category = {c["id"]: c for c in categories}
    for r in conn.execute(
        "SELECT id, name FROM ingredients ORDER BY name COLLATE NOCASE"
    ):
        category_ids = links.get(r["id"], [])
        ingredient = {
            "id": r["id"],
            "name": r["name"],
            "category_ids": category_ids,
            "favorites": favorites.get(r["id"], []),
        }
        for category_id in category_ids:
            by_category[category_id]["ingredients"].append(ingredient)

    # Recipes in categories shown in the ingredient list (e.g. sauces), A→Z.
    recipe_sections = [
        {**dict(r), "recipes": []}
        for r in conn.execute(
            "SELECT id, slug, name, emoji FROM recipe_categories "
            "WHERE in_ingredient_list = 1 ORDER BY position, id"
        )
    ]
    by_section = {s["id"]: s for s in recipe_sections}
    recipe_favorites = _favorites_by(conn, "recipe_id")
    for r in conn.execute(
        "SELECT l.category_id, r.id, r.name, r.kind FROM recipe_category_links l "
        "JOIN recipes r ON r.id = l.recipe_id "
        "ORDER BY r.name COLLATE NOCASE"
    ):
        if r["category_id"] in by_section:
            by_section[r["category_id"]]["recipes"].append(
                {
                    "id": r["id"],
                    "name": r["name"],
                    "kind": r["kind"],
                    "favorites": recipe_favorites.get(r["id"], []),
                }
            )

    return jsonify(categories=categories, recipe_sections=recipe_sections)


@app.post("/api/ingredients")
def create_ingredient():
    name, category_ids = _parse_ingredient(request.get_json(silent=True))
    conn = db.get_db()
    try:
        with conn:
            cur = conn.execute("INSERT INTO ingredients (name) VALUES (?)", (name,))
            _set_categories(conn, cur.lastrowid, category_ids)
    except sqlite3.IntegrityError:
        raise _duplicate_name()
    return jsonify(_get_ingredient(conn, cur.lastrowid)), 201


@app.put("/api/ingredients/<int:ingredient_id>")
def update_ingredient(ingredient_id):
    conn = db.get_db()
    _get_ingredient(conn, ingredient_id)  # 404 if missing
    name, category_ids = _parse_ingredient(request.get_json(silent=True))
    try:
        with conn:
            conn.execute(
                "UPDATE ingredients SET name = ? WHERE id = ?", (name, ingredient_id)
            )
            _set_categories(conn, ingredient_id, category_ids)
    except sqlite3.IntegrityError:
        raise _duplicate_name()
    return jsonify(_get_ingredient(conn, ingredient_id))


@app.delete("/api/ingredients/<int:ingredient_id>")
def delete_ingredient(ingredient_id):
    conn = db.get_db()
    with conn:
        cur = conn.execute("DELETE FROM ingredients WHERE id = ?", (ingredient_id,))
    if cur.rowcount == 0:
        raise ApiError("Ingredient not found.", 404)
    return "", 204


# ---- Favorites -----------------------------------------------------------

PEOPLE = ("me", "her")


def _check_person(person):
    if person not in PEOPLE:
        raise ApiError("person must be 'me' or 'her'.")


def _favorites_by(conn, column):
    """Who has favorited each item, "me" before "her": {item id: [person]}."""
    favorites = {}
    for r in conn.execute(
        f"SELECT {column} AS item_id, person FROM favorites "
        f"WHERE {column} IS NOT NULL ORDER BY person DESC"
    ):
        favorites.setdefault(r["item_id"], []).append(r["person"])
    return favorites


def _set_favorite(column, item_id, person, on):
    """Add or remove one person's favorite on an ingredient or recipe."""
    _check_person(person)
    conn = db.get_db()
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
    return "", 204


@app.put("/api/ingredients/<int:ingredient_id>/favorites/<person>")
def add_favorite(ingredient_id, person):
    _get_ingredient(db.get_db(), ingredient_id)  # 404 if missing
    return _set_favorite("ingredient_id", ingredient_id, person, True)


@app.delete("/api/ingredients/<int:ingredient_id>/favorites/<person>")
def remove_favorite(ingredient_id, person):
    _get_ingredient(db.get_db(), ingredient_id)  # 404 if missing
    return _set_favorite("ingredient_id", ingredient_id, person, False)


@app.put("/api/recipes/<int:recipe_id>/favorites/<person>")
def add_recipe_favorite(recipe_id, person):
    _get_recipe_row(db.get_db(), recipe_id)  # 404 if missing
    return _set_favorite("recipe_id", recipe_id, person, True)


@app.delete("/api/recipes/<int:recipe_id>/favorites/<person>")
def remove_recipe_favorite(recipe_id, person):
    _get_recipe_row(db.get_db(), recipe_id)  # 404 if missing
    return _set_favorite("recipe_id", recipe_id, person, False)


# ---- Recipes -------------------------------------------------------------

KINDS = ("manual", "link")


def _is_id(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _parse_name(payload, what):
    name = payload.get("name")
    name = name.strip() if isinstance(name, str) else ""
    if not name:
        raise ApiError(f"Please give the {what} a name.")
    return name


def _parse_notes(payload):
    """Optional notes; blank becomes None."""
    notes = payload.get("notes")
    if notes is not None and not isinstance(notes, str):
        raise ApiError("notes must be text.")
    return (notes or "").strip() or None


def _parse_recipe_category_ids(payload):
    """Validate category_ids against recipe_categories; return them sorted, unique."""
    category_ids = payload.get("category_ids")
    if not isinstance(category_ids, list) or not all(map(_is_id, category_ids)):
        raise ApiError("category_ids must be a list of category ids.")
    category_ids = sorted(set(category_ids))
    if not category_ids:
        raise ApiError("Pick at least one category.")

    placeholders = ",".join("?" * len(category_ids))
    found = db.get_db().execute(
        f"SELECT COUNT(*) FROM recipe_categories WHERE id IN ({placeholders})",
        category_ids,
    ).fetchone()[0]
    if found != len(category_ids):
        raise ApiError("Unknown category.")
    return category_ids


def _parse_components(payload, recipe_id=None):
    """Validate components; return [("ingredient_id"|"recipe_id", id)] in pick order.

    recipe_id is the recipe being edited, which must not end up inside itself.
    """
    components = payload.get("components")
    invalid = ApiError(
        "components must be a list of {ingredient_id} or {recipe_id} objects."
    )
    if not isinstance(components, list):
        raise invalid
    parsed = []
    for component in components:
        if not isinstance(component, dict) or len(component) != 1:
            raise invalid
        ((key, value),) = component.items()
        if key not in ("ingredient_id", "recipe_id") or not _is_id(value):
            raise invalid
        parsed.append((key, value))
    parsed = list(dict.fromkeys(parsed))  # dedupe, keep order
    if not parsed:
        raise ApiError("Pick at least one ingredient.")

    conn = db.get_db()
    ingredient_ids = [v for k, v in parsed if k == "ingredient_id"]
    if ingredient_ids:
        placeholders = ",".join("?" * len(ingredient_ids))
        found = conn.execute(
            f"SELECT COUNT(*) FROM ingredients WHERE id IN ({placeholders})",
            ingredient_ids,
        ).fetchone()[0]
        if found != len(ingredient_ids):
            raise ApiError("Unknown ingredient.")

    recipe_ids = [v for k, v in parsed if k == "recipe_id"]
    if recipe_ids:
        if recipe_id in recipe_ids:
            raise ApiError("A recipe can't contain itself.")
        placeholders = ",".join("?" * len(recipe_ids))
        # Only recipes shown in the ingredient list (e.g. sauces) can be picked.
        found = conn.execute(
            "SELECT COUNT(DISTINCT l.recipe_id) FROM recipe_category_links l "
            "JOIN recipe_categories c ON c.id = l.category_id "
            f"WHERE c.in_ingredient_list = 1 AND l.recipe_id IN ({placeholders})",
            recipe_ids,
        ).fetchone()[0]
        if found != len(recipe_ids):
            raise ApiError("Unknown recipe, or one that can't go into other recipes.")
        if recipe_id is not None:
            # Walk down through every picked recipe's own components; reaching
            # the recipe being edited would make a loop.
            loop = conn.execute(
                "WITH RECURSIVE inside(id) AS ("
                f"  SELECT id FROM recipes WHERE id IN ({placeholders})"
                "  UNION"
                "  SELECT rc.component_recipe_id FROM recipe_components rc"
                "  JOIN inside ON rc.recipe_id = inside.id"
                "  WHERE rc.component_recipe_id IS NOT NULL"
                ") SELECT 1 FROM inside WHERE id = ?",
                [*recipe_ids, recipe_id],
            ).fetchone()
            if loop:
                raise ApiError("That would put the recipe inside itself.")

    return parsed


def _parse_url(payload):
    """Validate a link recipe's URL; return it as http(s)."""
    url = payload.get("url")
    url = url.strip() if isinstance(url, str) else ""
    if url and "://" not in url:
        url = "https://" + url  # "example.com/poke" → https://example.com/poke
    # Only http(s) is accepted, so the URL is always safe to use as an href.
    invalid = ApiError("Please enter a valid link (http/https).")
    if not url or any(c.isspace() for c in url):
        raise invalid
    try:
        parts = urlsplit(url)
        parts.port  # raises ValueError on a malformed port
    except ValueError:
        raise invalid
    if parts.scheme.lower() not in ("http", "https") or not parts.hostname:
        raise invalid
    return url


def _parse_recipe(payload, kind, recipe_id=None):
    """Validate a recipe body of the given kind; return its fields as a dict."""
    return {
        "name": _parse_name(payload, "recipe"),
        "notes": _parse_notes(payload),
        "category_ids": _parse_recipe_category_ids(payload),
        "url": _parse_url(payload) if kind == "link" else None,
        "components": (
            _parse_components(payload, recipe_id) if kind == "manual" else []
        ),
    }


def _save_recipe_parts(conn, recipe_id, recipe):
    """Replace a recipe's category links and components."""
    conn.execute("DELETE FROM recipe_category_links WHERE recipe_id = ?", (recipe_id,))
    conn.executemany(
        "INSERT INTO recipe_category_links (recipe_id, category_id) VALUES (?, ?)",
        [(recipe_id, c) for c in recipe["category_ids"]],
    )
    conn.execute("DELETE FROM recipe_components WHERE recipe_id = ?", (recipe_id,))
    conn.executemany(
        "INSERT INTO recipe_components (recipe_id, ingredient_id, component_recipe_id) "
        "VALUES (?, ?, ?)",
        [
            (recipe_id, v if k == "ingredient_id" else None, v if k == "recipe_id" else None)
            for k, v in recipe["components"]
        ],
    )


def _write_recipe(conn, recipe_id, recipe):
    """Save a parsed recipe over an existing one."""
    with conn:
        conn.execute(
            "UPDATE recipes SET name = ?, url = ?, notes = ? WHERE id = ?",
            (recipe["name"], recipe["url"], recipe["notes"], recipe_id),
        )
        _save_recipe_parts(conn, recipe_id, recipe)


def _recipe_categories(conn, recipe_id=None):
    """Categories per recipe, in display order: {recipe id: [category]}."""
    where, params = ("WHERE l.recipe_id = ?", (recipe_id,)) if recipe_id else ("", ())
    categories = {}
    for r in conn.execute(
        "SELECT l.recipe_id, c.id, c.slug, c.name, c.emoji "
        "FROM recipe_category_links l "
        f"JOIN recipe_categories c ON c.id = l.category_id {where} "
        "ORDER BY c.position, c.id",
        params,
    ):
        categories.setdefault(r["recipe_id"], []).append(
            {"id": r["id"], "slug": r["slug"], "name": r["name"], "emoji": r["emoji"]}
        )
    return categories


def _recipe_components(conn, recipe_id=None):
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


def _get_recipe_row(conn, recipe_id):
    """Return a recipe's own row, or raise 404."""
    row = conn.execute(
        "SELECT id, kind, name, url, notes, created_at FROM recipes WHERE id = ?",
        (recipe_id,),
    ).fetchone()
    if row is None:
        raise ApiError("Recipe not found.", 404)
    return row


def _get_recipe(conn, recipe_id):
    """Return one recipe with its categories and components (with hearts)."""
    row = _get_recipe_row(conn, recipe_id)
    favorites = {
        "ingredient": _favorites_by(conn, "ingredient_id"),
        "recipe": _favorites_by(conn, "recipe_id"),
    }
    components = _recipe_components(conn, recipe_id).get(recipe_id, [])
    for c in components:
        c["favorites"] = favorites[c["type"]].get(c["id"], [])
    return {
        **dict(row),
        "categories": _recipe_categories(conn, recipe_id).get(recipe_id, []),
        "components": components,
        "favorites": favorites["recipe"].get(recipe_id, []),
    }


@app.get("/api/recipe-categories")
def list_recipe_categories():
    rows = db.get_db().execute(
        "SELECT id, slug, name, emoji, in_ingredient_list FROM recipe_categories "
        "ORDER BY position, id"
    )
    return jsonify(
        categories=[
            {**dict(r), "in_ingredient_list": bool(r["in_ingredient_list"])}
            for r in rows
        ]
    )


@app.get("/api/recipes")
def list_recipes():
    """All recipes, newest first, each with its categories and components."""
    conn = db.get_db()
    categories = _recipe_categories(conn)
    components = _recipe_components(conn)
    recipes = [
        {
            **dict(r),
            "categories": categories.get(r["id"], []),
            "components": components.get(r["id"], []),
        }
        for r in conn.execute(
            "SELECT id, kind, name, url, notes FROM recipes "
            "ORDER BY created_at DESC, id DESC"
        )
    ]
    return jsonify(recipes=recipes)


@app.get("/api/recipes/<int:recipe_id>")
def get_recipe(recipe_id):
    return jsonify(_get_recipe(db.get_db(), recipe_id))


@app.post("/api/recipes")
def create_recipe():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ApiError("Expected a JSON object.")
    kind = payload.get("kind")
    if kind not in KINDS:
        raise ApiError("kind must be 'manual' or 'link'.")
    recipe = _parse_recipe(payload, kind)

    conn = db.get_db()
    with conn:
        cur = conn.execute(
            "INSERT INTO recipes (name, kind, url, notes) VALUES (?, ?, ?, ?)",
            (recipe["name"], kind, recipe["url"], recipe["notes"]),
        )
        _save_recipe_parts(conn, cur.lastrowid, recipe)
    return jsonify(_get_recipe(conn, cur.lastrowid)), 201


@app.put("/api/recipes/<int:recipe_id>")
def update_recipe(recipe_id):
    """Edit a recipe; its kind (manual/link) stays the same."""
    conn = db.get_db()
    kind = _get_recipe_row(conn, recipe_id)["kind"]  # 404 if missing
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ApiError("Expected a JSON object.")
    recipe = _parse_recipe(payload, kind, recipe_id)
    _write_recipe(conn, recipe_id, recipe)
    return jsonify(_get_recipe(conn, recipe_id))


@app.patch("/api/recipes/<int:recipe_id>")
def patch_recipe(recipe_id):
    """Change only the fields sent (e.g. just notes); the rest stays as stored."""
    conn = db.get_db()
    current = _get_recipe(conn, recipe_id)  # 404 if missing
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ApiError("Expected a JSON object.")
    merged = {
        "name": current["name"],
        "notes": current["notes"],
        "url": current["url"],
        "category_ids": [c["id"] for c in current["categories"]],
        "components": [
            {"recipe_id" if c["type"] == "recipe" else "ingredient_id": c["id"]}
            for c in current["components"]
        ],
    }
    merged.update((k, v) for k, v in payload.items() if k in merged)
    recipe = _parse_recipe(merged, current["kind"], recipe_id)
    _write_recipe(conn, recipe_id, recipe)
    return jsonify(_get_recipe(conn, recipe_id))


@app.delete("/api/recipes/<int:recipe_id>")
def delete_recipe(recipe_id):
    """Delete a recipe; it also disappears from any recipe that contained it."""
    conn = db.get_db()
    with conn:
        cur = conn.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
    if cur.rowcount == 0:
        raise ApiError("Recipe not found.", 404)
    return "", 204


if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG") == "1"
    app.run(host="0.0.0.0", port=5000, debug=debug)
