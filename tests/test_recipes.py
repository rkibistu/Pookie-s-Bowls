import pytest

import recipes


def test_a_new_recipe_comes_back_with_its_categories_and_components_in_pick_order(
    conn, category, ingredient
):
    rice = ingredient("Rice")
    salmon = ingredient("Salmon")
    mayo = recipes.create(conn, {"name": "Spicy mayo", "category_ids": [category("sauce")]})

    bowl = recipes.create(
        conn,
        {
            "name": "  Salmon bowl ",
            "category_ids": [category("bowl")],
            "components": [
                {"type": "ingredient", "id": salmon},
                {"type": "recipe", "id": mayo["id"], "name": "ignored"},
                {"type": "ingredient", "id": rice},
            ],
        },
    )

    assert recipes.get(conn, bowl["id"]) == bowl
    assert bowl["name"] == "Salmon bowl"
    assert [c["slug"] for c in bowl["categories"]] == ["bowl"]
    assert [(c["type"], c["name"]) for c in bowl["components"]] == [
        ("ingredient", "Salmon"),
        ("recipe", "Spicy mayo"),
        ("ingredient", "Rice"),
    ]


def test_a_bowl_stays_editable_after_its_sauce_becomes_a_soup(conn, category):
    mayo = recipes.create(conn, {"name": "Spicy mayo", "category_ids": [category("sauce")]})
    bowl = recipes.create(
        conn,
        {
            "name": "Salmon bowl",
            "category_ids": [category("bowl")],
            "components": [{"type": "recipe", "id": mayo["id"]}],
        },
    )
    recipes.change(conn, mayo["id"], {"category_ids": [category("soup")]})

    changed = recipes.change(conn, bowl["id"], {"notes": "extra lime"})

    assert changed["notes"] == "extra lime"
    assert changed["name"] == "Salmon bowl"
    assert [c["name"] for c in changed["components"]] == ["Spicy mayo"]


def test_a_recipe_cannot_end_up_inside_itself(conn, category):
    mayo = recipes.create(conn, {"name": "Spicy mayo", "category_ids": [category("sauce")]})
    bowl = recipes.create(
        conn,
        {
            "name": "Salmon bowl",
            "category_ids": [category("bowl")],
            "components": [{"type": "recipe", "id": mayo["id"]}],
        },
    )

    for recipe, inside in [(mayo, mayo), (mayo, bowl)]:
        with pytest.raises(recipes.RecipeError) as err:
            recipes.change(conn, recipe["id"], {"components": [{"type": "recipe", "id": inside["id"]}]})
        assert err.value.kind == recipes.INVALID
        assert err.value.message == "A recipe can't go inside itself."
    assert recipes.get(conn, mayo["id"])["components"] == []


@pytest.mark.parametrize(
    "fields, message",
    [
        ({"name": "  "}, "Please give the recipe a name."),
        ({"category_ids": []}, "Pick at least one category."),
        ({"category_ids": [999]}, "Unknown category."),
        ({"url": "ftp://example.com"}, "Please enter a valid link (http/https)."),
        ({"components": [{"type": "ingredient", "id": 999}]}, "Unknown ingredient."),
        ({"components": [{"type": "recipe", "id": 999}]}, "Unknown recipe."),
        ({"components": [{"ingredient_id": 1}]}, "components must be a list of {type, id} items."),
    ],
)
def test_a_new_recipe_is_refused_when_a_field_is_wrong(conn, category, fields, message):
    with pytest.raises(recipes.RecipeError) as err:
        recipes.create(conn, {"name": "Salmon bowl", "category_ids": [category("bowl")], **fields})

    assert (err.value.kind, err.value.message) == (recipes.INVALID, message)


def test_a_link_without_a_scheme_becomes_https(conn, category):
    bowl = recipes.create(
        conn, {"name": "Salmon bowl", "category_ids": [category("bowl")], "url": " example.com/poke "}
    )

    assert bowl["url"] == "https://example.com/poke"


def test_a_missing_recipe_is_not_found(conn):
    for attempt in (lambda: recipes.get(conn, 42), lambda: recipes.change(conn, 42, {"notes": "x"})):
        with pytest.raises(recipes.RecipeError) as err:
            attempt()
        assert err.value.kind == recipes.NOT_FOUND


def test_deleting_a_sauce_takes_it_out_of_the_bowls_that_had_it(conn, category):
    mayo = recipes.create(conn, {"name": "Spicy mayo", "category_ids": [category("sauce")]})
    bowl = recipes.create(
        conn,
        {
            "name": "Salmon bowl",
            "category_ids": [category("bowl")],
            "components": [{"type": "recipe", "id": mayo["id"]}],
        },
    )

    recipes.delete(conn, mayo["id"])

    assert recipes.get(conn, bowl["id"])["components"] == []
    assert [r["name"] for r in recipes.list_all(conn)] == ["Salmon bowl"]
    with pytest.raises(recipes.RecipeError) as err:
        recipes.delete(conn, mayo["id"])
    assert err.value.kind == recipes.NOT_FOUND


def test_the_list_shows_the_newest_recipe_first(conn, category):
    for name in ("Spicy mayo", "Salmon bowl", "Miso soup"):
        recipes.create(conn, {"name": name, "category_ids": [category("bowl")]})

    assert [r["name"] for r in recipes.list_all(conn)] == ["Miso soup", "Salmon bowl", "Spicy mayo"]
