"""Pookie's Bowls — Flask app entry point."""

import os

from flask import Flask, jsonify, render_template, request

import db
import errors
import favorites
import ingredients
import recipe_categories
import recipes
import stations

app = Flask(__name__)
app.teardown_appcontext(db.close_db)

# Ensure the database and seed data exist before serving any request.
db.init_db()

# The rules live in ingredients.py, recipes.py, recipe_categories.py and
# stations.py; these routes only speak HTTP.

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
    """Every ingredient A→Z, orphans included, with its section ids."""
    return jsonify(ingredients=ingredients.list_all(db.get_db()))


@app.post("/api/ingredients")
def add_ingredient():
    """A taken name reuses that ingredient (200); a new one is created (201)."""
    added = ingredients.add(db.get_db(), request.get_json(silent=True))
    return jsonify(added), 200 if added["reused"] else 201


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


# ---- Stations ------------------------------------------------------------


@app.get("/api/stations")
def list_stations():
    """Every station with its sections and their rows."""
    return jsonify(stations=stations.list_all(db.get_db()))


@app.post("/api/stations")
def create_station():
    return jsonify(stations.create(db.get_db(), request.get_json(silent=True))), 201


@app.delete("/api/stations/<int:station_id>")
def delete_station(station_id):
    """Its sections go with it; their ingredients stay in the catalog."""
    stations.delete(db.get_db(), station_id)
    return "", 204


@app.patch("/api/stations/<int:station_id>")
def change_station(station_id):
    """Change only the fields sent (name, emoji, recipe_category_id)."""
    return jsonify(stations.change(db.get_db(), station_id, request.get_json(silent=True)))


@app.post("/api/stations/<int:station_id>/sections")
def add_section(station_id):
    """Body: {name} for an ingredient section, or {recipe_category_id} to list one."""
    added = stations.add_section(db.get_db(), station_id, request.get_json(silent=True))
    return jsonify(added), 201


@app.put("/api/stations/<int:station_id>/sections/order")
def reorder_sections(station_id):
    """Body: {section_ids: [every section of the station, in the new order]}."""
    body = request.get_json(silent=True)
    section_ids = body.get("section_ids") if isinstance(body, dict) else None
    return jsonify(stations.reorder_sections(db.get_db(), station_id, section_ids))


@app.patch("/api/sections/<int:section_id>")
def rename_section(section_id):
    """Body: {name}; only an ingredient section can be renamed here."""
    body = request.get_json(silent=True)
    name = body.get("name") if isinstance(body, dict) else None
    return jsonify(stations.rename_section(db.get_db(), section_id, name))


@app.delete("/api/sections/<int:section_id>")
def delete_section(section_id):
    """Delete an ingredient section, or unlist a recipe category from its station."""
    stations.delete_section(db.get_db(), section_id)
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
    return jsonify(categories=recipe_categories.list_all(db.get_db()))


@app.post("/api/recipe-categories")
def create_recipe_category():
    created = recipe_categories.create(db.get_db(), request.get_json(silent=True))
    return jsonify(created), 201


@app.patch("/api/recipe-categories/<int:category_id>")
def change_recipe_category(category_id):
    """Change only the fields sent (name and/or emoji)."""
    return jsonify(
        recipe_categories.change(db.get_db(), category_id, request.get_json(silent=True))
    )


@app.put("/api/recipe-categories/order")
def reorder_recipe_categories():
    """Body: {category_ids: [every category id, in the new order]}."""
    body = request.get_json(silent=True)
    category_ids = body.get("category_ids") if isinstance(body, dict) else None
    return jsonify(categories=recipe_categories.reorder(db.get_db(), category_ids))


@app.delete("/api/recipe-categories/<int:category_id>")
def delete_recipe_category(category_id):
    recipe_categories.delete(db.get_db(), category_id)
    return "", 204


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
