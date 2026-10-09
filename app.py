"""Pookie's Bowls — Flask app entry point."""

import os
import sqlite3

from flask import Flask, jsonify, render_template, request

import db
import recipes

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

    favorites = recipes.favorites_by(conn, "ingredient_id")

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
    recipe_favorites = recipes.favorites_by(conn, "recipe_id")
    for r in conn.execute(
        "SELECT l.category_id, r.id, r.name FROM recipe_category_links l "
        "JOIN recipes r ON r.id = l.recipe_id "
        "ORDER BY r.name COLLATE NOCASE"
    ):
        if r["category_id"] in by_section:
            by_section[r["category_id"]]["recipes"].append(
                {
                    "id": r["id"],
                    "name": r["name"],
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
    recipes.get(db.get_db(), recipe_id)  # 404 if missing
    return _set_favorite("recipe_id", recipe_id, person, True)


@app.delete("/api/recipes/<int:recipe_id>/favorites/<person>")
def remove_recipe_favorite(recipe_id, person):
    recipes.get(db.get_db(), recipe_id)  # 404 if missing
    return _set_favorite("recipe_id", recipe_id, person, False)


# ---- Recipes -------------------------------------------------------------

# The rules live in recipes.py; these routes only speak HTTP.

@app.errorhandler(recipes.RecipeError)
def handle_recipe_error(err):
    status = 404 if err.kind == recipes.NOT_FOUND else 400
    return jsonify(error=err.message), status


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
    return jsonify(recipes=recipes.list_all(db.get_db()))


@app.get("/api/recipes/<int:recipe_id>")
def get_recipe(recipe_id):
    return jsonify(recipes.get(db.get_db(), recipe_id))


@app.post("/api/recipes")
def create_recipe():
    return jsonify(recipes.create(db.get_db(), request.get_json(silent=True))), 201


@app.patch("/api/recipes/<int:recipe_id>")
def change_recipe(recipe_id):
    """Change only the fields sent (e.g. just notes); the rest stays as stored."""
    return jsonify(recipes.change(db.get_db(), recipe_id, request.get_json(silent=True)))


@app.delete("/api/recipes/<int:recipe_id>")
def delete_recipe(recipe_id):
    recipes.delete(db.get_db(), recipe_id)
    return "", 204


if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG") == "1"
    app.run(host="0.0.0.0", port=5000, debug=debug)
