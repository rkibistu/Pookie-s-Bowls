"""Pookie's Bowls — Flask app entry point."""

import os

from flask import Flask, jsonify, render_template, request

import db
import errors
import favorites
import ingredients
import recipes

app = Flask(__name__)
app.teardown_appcontext(db.close_db)

# Ensure the database and seed data exist before serving any request.
db.init_db()

# The rules live in ingredients.py and recipes.py; these routes only speak HTTP.

STATUS = {errors.INVALID: 400, errors.NOT_FOUND: 404, errors.DUPLICATE: 409}


@app.errorhandler(errors.RuleError)
def handle_rule_error(err):
    return jsonify(error=err.message), STATUS[err.kind]


@app.route("/")
def index():
    return render_template("index.html")


# ---- Ingredients ---------------------------------------------------------


@app.get("/api/ingredients")
def list_ingredients():
    """The Ingredients page: ingredient categories, then the listed recipe
    categories (e.g. sauces) shown alongside them."""
    conn = db.get_db()
    return jsonify(
        categories=ingredients.by_category(conn),
        recipe_sections=recipes.listed_sections(conn),
    )


@app.post("/api/ingredients")
def create_ingredient():
    return jsonify(ingredients.create(db.get_db(), request.get_json(silent=True))), 201


@app.patch("/api/ingredients/<int:ingredient_id>")
def change_ingredient(ingredient_id):
    """Change only the fields sent; the rest stays as stored."""
    return jsonify(
        ingredients.change(db.get_db(), ingredient_id, request.get_json(silent=True))
    )


@app.delete("/api/ingredients/<int:ingredient_id>")
def delete_ingredient(ingredient_id):
    ingredients.delete(db.get_db(), ingredient_id)
    return "", 204


# ---- Favorites -----------------------------------------------------------


@app.route(
    "/api/<any(ingredients, recipes):kind>/<int:item_id>/favorites/<person>",
    methods=["PUT", "DELETE"],
)
def set_favorite(kind, item_id, person):
    """PUT adds one person's favorite on an ingredient or recipe, DELETE removes it."""
    item = {"type": kind.removesuffix("s"), "id": item_id}
    favorites.set(db.get_db(), item, person, request.method == "PUT")
    return "", 204


# ---- Recipes -------------------------------------------------------------


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
