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
    """All categories in display order, each with its ingredients A→Z."""
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

    # Who has favorited each ingredient, "me" before "her".
    favorites = {}
    for r in conn.execute(
        "SELECT ingredient_id, person FROM favorites "
        "WHERE ingredient_id IS NOT NULL ORDER BY person DESC"
    ):
        favorites.setdefault(r["ingredient_id"], []).append(r["person"])

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

    return jsonify(categories=categories)


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


@app.put("/api/ingredients/<int:ingredient_id>/favorites/<person>")
def add_favorite(ingredient_id, person):
    _check_person(person)
    conn = db.get_db()
    _get_ingredient(conn, ingredient_id)  # 404 if missing
    with conn:
        conn.execute(
            "INSERT OR IGNORE INTO favorites (person, ingredient_id) VALUES (?, ?)",
            (person, ingredient_id),
        )
    return "", 204


@app.delete("/api/ingredients/<int:ingredient_id>/favorites/<person>")
def remove_favorite(ingredient_id, person):
    _check_person(person)
    conn = db.get_db()
    _get_ingredient(conn, ingredient_id)  # 404 if missing
    with conn:
        conn.execute(
            "DELETE FROM favorites WHERE person = ? AND ingredient_id = ?",
            (person, ingredient_id),
        )
    return "", 204


# ---- Recipes -------------------------------------------------------------


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


def _parse_bowl(payload):
    """Validate a bowl body; return (name, notes or None, ingredient ids in pick order)."""
    name = _parse_name(payload, "bowl")
    notes = _parse_notes(payload)

    ingredient_ids = payload.get("ingredient_ids")
    if not isinstance(ingredient_ids, list) or not all(
        isinstance(i, int) and not isinstance(i, bool) for i in ingredient_ids
    ):
        raise ApiError("ingredient_ids must be a list of ingredient ids.")
    ingredient_ids = list(dict.fromkeys(ingredient_ids))  # dedupe, keep order
    if not ingredient_ids:
        raise ApiError("Pick at least one ingredient.")

    placeholders = ",".join("?" * len(ingredient_ids))
    found = db.get_db().execute(
        f"SELECT COUNT(*) FROM ingredients WHERE id IN ({placeholders})",
        ingredient_ids,
    ).fetchone()[0]
    if found != len(ingredient_ids):
        raise ApiError("Unknown ingredient.")

    return name, notes, ingredient_ids


def _parse_link(payload):
    """Validate a link body; return (name, http(s) url, notes or None)."""
    name = _parse_name(payload, "recipe")
    notes = _parse_notes(payload)

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

    return name, url, notes


def _get_recipe(conn, recipe_id):
    """Return one recipe with its ingredients (pick order), or raise 404."""
    row = conn.execute(
        "SELECT id, kind, name, url, notes, created_at FROM recipes WHERE id = ?",
        (recipe_id,),
    ).fetchone()
    if row is None:
        raise ApiError("Recipe not found.", 404)

    ingredients = [
        {"id": r["id"], "name": r["name"], "favorites": []}
        for r in conn.execute(
            "SELECT i.id, i.name FROM recipe_components rc "
            "JOIN ingredients i ON i.id = rc.ingredient_id "
            "WHERE rc.recipe_id = ? ORDER BY rc.id",
            (recipe_id,),
        )
    ]
    by_id = {i["id"]: i for i in ingredients}
    for r in conn.execute(
        "SELECT f.ingredient_id, f.person FROM favorites f "
        "JOIN recipe_components rc ON rc.ingredient_id = f.ingredient_id "
        "WHERE rc.recipe_id = ? ORDER BY f.person DESC",
        (recipe_id,),
    ):
        by_id[r["ingredient_id"]]["favorites"].append(r["person"])

    return {**dict(row), "ingredients": ingredients}


@app.get("/api/recipes")
def list_recipes():
    """All recipes, newest first, each with its ingredient names."""
    conn = db.get_db()
    names = {}
    for r in conn.execute(
        "SELECT rc.recipe_id, i.name FROM recipe_components rc "
        "JOIN ingredients i ON i.id = rc.ingredient_id ORDER BY rc.id"
    ):
        names.setdefault(r["recipe_id"], []).append(r["name"])

    recipes = [
        {**dict(r), "ingredients": names.get(r["id"], [])}
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
    conn = db.get_db()
    if kind == "bowl":
        name, notes, ingredient_ids = _parse_bowl(payload)
        with conn:
            cur = conn.execute(
                "INSERT INTO recipes (name, kind, notes) VALUES (?, 'bowl', ?)",
                (name, notes),
            )
            conn.executemany(
                "INSERT INTO recipe_components (recipe_id, ingredient_id) "
                "VALUES (?, ?)",
                [(cur.lastrowid, i) for i in ingredient_ids],
            )
    elif kind == "link":
        name, url, notes = _parse_link(payload)
        with conn:
            cur = conn.execute(
                "INSERT INTO recipes (name, kind, url, notes) "
                "VALUES (?, 'link', ?, ?)",
                (name, url, notes),
            )
    else:
        raise ApiError("kind must be 'bowl' or 'link'.")

    return jsonify(_get_recipe(conn, cur.lastrowid)), 201


@app.delete("/api/recipes/<int:recipe_id>")
def delete_recipe(recipe_id):
    conn = db.get_db()
    with conn:
        cur = conn.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
    if cur.rowcount == 0:
        raise ApiError("Recipe not found.", 404)
    return "", 204


if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG") == "1"
    app.run(host="0.0.0.0", port=5000, debug=debug)
