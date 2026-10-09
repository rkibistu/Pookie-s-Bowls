"""Smoke tests: the recipe routes reach recipes.py and speak HTTP."""

import pytest

import app as app_module


@pytest.fixture
def client():
    return app_module.app.test_client()


@pytest.fixture
def bowl_category(client):
    categories = client.get("/api/recipe-categories").json["categories"]
    return categories[0]["id"]  # Poke bowl comes first


def test_a_recipe_can_be_created_changed_and_deleted_over_http(client, bowl_category):
    salmon = client.post("/api/ingredients", json={"name": "Salmon", "section_ids": [1]}).json["ingredient"]

    created = client.post(
        "/api/recipes",
        json={
            "name": "Salmon bowl",
            "category_ids": [bowl_category],
            "components": [{"type": "ingredient", "id": salmon["id"], "name": "Salmon"}],
        },
    )
    assert created.status_code == 201
    recipe_id = created.json["id"]

    changed = client.patch(f"/api/recipes/{recipe_id}", json={"notes": "extra lime"})
    assert changed.status_code == 200
    assert changed.json["notes"] == "extra lime"
    assert [c["name"] for c in changed.json["components"]] == ["Salmon"]

    assert client.delete(f"/api/recipes/{recipe_id}").status_code == 204


def test_recipe_errors_come_back_as_json_with_a_status(client):
    missing = client.get("/api/recipes/9999")
    assert (missing.status_code, missing.json) == (404, {"error": "Recipe not found."})

    invalid = client.post("/api/recipes", json={"name": "", "category_ids": []})
    assert (invalid.status_code, invalid.json) == (400, {"error": "Please give the recipe a name."})


def test_an_ingredient_can_be_changed_and_its_errors_come_back_as_json(client):
    tofu = client.post("/api/ingredients", json={"name": "Tofu", "section_ids": [1]}).json["ingredient"]
    rice = client.post("/api/ingredients", json={"name": "Rice"}).json["ingredient"]

    changed = client.patch(f"/api/ingredients/{tofu['id']}", json={"name": "Smoked tofu"})
    assert (changed.status_code, changed.json["section_ids"]) == (200, [1])

    taken = client.patch(f"/api/ingredients/{rice['id']}", json={"name": "smoked TOFU"})
    assert (taken.status_code, taken.json) == (
        409,
        {"error": "An ingredient with that name already exists."},
    )
    assert client.put("/api/ingredients/9999/favorites/me").status_code == 404
    assert client.put(f"/api/ingredients/{tofu['id']}/favorites/him").status_code == 400

    assert client.delete(f"/api/ingredients/{tofu['id']}").status_code == 204
    assert client.delete(f"/api/ingredients/{rice['id']}").status_code == 204


def test_adding_a_taken_name_reuses_it_over_http(client):
    created = client.post("/api/ingredients", json={"name": "Mango", "section_ids": [1]})
    assert (created.status_code, created.json["reused"]) == (201, False)

    reused = client.post("/api/ingredients", json={"name": "MANGO", "section_ids": [1, 2]})
    assert (reused.status_code, reused.json["reused"], reused.json["added_to"]) == (200, True, [2])
    assert reused.json["ingredient"] == {"id": created.json["ingredient"]["id"], "name": "Mango", "section_ids": [1, 2]}

    assert client.delete(f"/api/ingredients/{reused.json['ingredient']['id']}").status_code == 204


def test_recipes_are_no_longer_replaced_whole(client):
    assert client.put("/api/recipes/1", json={}).status_code == 405
    assert client.put("/api/ingredients/1", json={}).status_code == 405


def test_a_recipe_category_can_be_created_changed_reordered_and_deleted_over_http(client):
    created = client.post("/api/recipe-categories", json={"name": "Pizza", "emoji": "🍕"})
    assert created.status_code == 201
    pizza = created.json["id"]

    changed = client.patch(f"/api/recipe-categories/{pizza}", json={"emoji": "🍕🔥"})
    assert (changed.status_code, changed.json["emoji"]) == (200, "🍕🔥")

    ids = [c["id"] for c in client.get("/api/recipe-categories").json["categories"]]
    moved = client.put("/api/recipe-categories/order", json={"category_ids": [pizza, *ids[:-1]]})
    assert (moved.status_code, moved.json["categories"][0]["name"]) == (200, "Pizza")
    assert client.put("/api/recipe-categories/order", json={}).status_code == 400

    taken = client.post("/api/recipe-categories", json={"name": "pizza", "emoji": "🍕"})
    assert (taken.status_code, taken.json) == (
        409,
        {"error": "A category with that name already exists."},
    )

    assert client.delete(f"/api/recipe-categories/{pizza}").status_code == 204
    assert client.delete(f"/api/recipe-categories/{pizza}").status_code == 404


def test_a_station_and_its_sections_can_be_changed_over_http(client):
    [poke] = client.get("/api/stations").json["stations"]

    renamed = client.patch(f"/api/stations/{poke['id']}", json={"emoji": "🍣"})
    assert (renamed.status_code, renamed.json["emoji"]) == (200, "🍣")

    added = client.post(f"/api/stations/{poke['id']}/sections", json={"name": "Nuts"})
    assert (added.status_code, added.json["kind"]) == (201, "ingredients")
    nuts = added.json["id"]
    taken = client.post(f"/api/stations/{poke['id']}/sections", json={"name": "nuts"})
    assert taken.status_code == 409

    renamed = client.patch(f"/api/sections/{nuts}", json={"name": "Seeds"})
    assert (renamed.status_code, renamed.json["name"]) == (200, "Seeds")

    ids = [s["id"] for s in client.get("/api/stations").json["stations"][0]["sections"]]
    moved = client.put(
        f"/api/stations/{poke['id']}/sections/order", json={"section_ids": [nuts, *ids[:-1]]}
    )
    assert (moved.status_code, moved.json["sections"][0]["name"]) == (200, "Seeds")
    assert client.put(f"/api/stations/{poke['id']}/sections/order", json={}).status_code == 400

    assert client.delete(f"/api/sections/{nuts}").status_code == 204
    assert client.delete(f"/api/sections/{nuts}").status_code == 404
    assert client.patch(f"/api/stations/{poke['id']}", json={"emoji": "🥣"}).status_code == 200


def test_every_ingredient_comes_back_including_orphans(client):
    seaweed = client.post("/api/ingredients", json={"name": "Seaweed"})
    assert (seaweed.status_code, seaweed.json["ingredient"]["section_ids"]) == (201, [])

    names = [i["name"] for i in client.get("/api/ingredients").json["ingredients"]]
    assert "Seaweed" in names

    assert client.delete(f"/api/ingredients/{seaweed.json['ingredient']['id']}").status_code == 204


def test_a_station_can_be_created_and_deleted_over_http(client):
    created = client.post("/api/stations", json={"name": "Burger", "emoji": "🍔"})
    assert (created.status_code, created.json["sections"]) == (201, [])
    burger = created.json["id"]
    assert client.post("/api/stations", json={"name": "burger", "emoji": "🍔"}).status_code == 409

    assert client.delete(f"/api/stations/{burger}").status_code == 204
    assert client.delete(f"/api/stations/{burger}").status_code == 404
    [poke] = client.get("/api/stations").json["stations"]
    assert client.delete(f"/api/stations/{poke['id']}").status_code == 400
