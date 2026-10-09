"""Smoke tests: the recipe routes reach recipes.py and speak HTTP."""

import pytest

import app as app_module


@pytest.fixture
def client():
    return app_module.app.test_client()


@pytest.fixture
def bowl_category(client):
    categories = client.get("/api/recipe-categories").json["categories"]
    return next(c["id"] for c in categories if c["slug"] == "bowl")


def test_a_recipe_can_be_created_changed_and_deleted_over_http(client, bowl_category):
    salmon = client.post("/api/ingredients", json={"name": "Salmon", "category_ids": [1]}).json

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


def test_recipes_are_no_longer_replaced_whole(client):
    assert client.put("/api/recipes/1", json={}).status_code == 405
