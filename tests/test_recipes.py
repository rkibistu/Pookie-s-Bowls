import pytest

import ingredients
import recipes
from errors import INVALID, NOT_FOUND, RuleError


def test_a_new_recipe_comes_back_with_its_categories_and_components_in_pick_order(
    conn, category, ingredient
):
    rice = ingredient("Rice")
    salmon = ingredient("Salmon")
    mayo = recipes.create(conn, {"name": "Spicy mayo", "category_ids": [category("Sauce")]})

    bowl = recipes.create(
        conn,
        {
            "name": "  Salmon bowl ",
            "category_ids": [category("Poke bowl")],
            "components": [
                {"type": "ingredient", "id": salmon},
                {"type": "recipe", "id": mayo["id"], "name": "ignored"},
                {"type": "ingredient", "id": rice},
            ],
        },
    )

    assert recipes.get(conn, bowl["id"]) == bowl
    assert bowl["name"] == "Salmon bowl"
    assert [c["name"] for c in bowl["categories"]] == ["Poke bowl"]
    assert [(c["type"], c["name"]) for c in bowl["components"]] == [
        ("ingredient", "Salmon"),
        ("recipe", "Spicy mayo"),
        ("ingredient", "Rice"),
    ]


def test_a_bowl_stays_editable_after_its_sauce_becomes_a_soup(conn, category):
    mayo = recipes.create(conn, {"name": "Spicy mayo", "category_ids": [category("Sauce")]})
    bowl = recipes.create(
        conn,
        {
            "name": "Salmon bowl",
            "category_ids": [category("Poke bowl")],
            "components": [{"type": "recipe", "id": mayo["id"]}],
        },
    )
    recipes.change(conn, mayo["id"], {"category_ids": [category("Soup")]})

    changed = recipes.change(conn, bowl["id"], {"notes": "extra lime"})

    assert changed["notes"] == "extra lime"
    assert changed["name"] == "Salmon bowl"
    assert [c["name"] for c in changed["components"]] == ["Spicy mayo"]


def test_a_recipe_cannot_end_up_inside_itself(conn, category):
    mayo = recipes.create(conn, {"name": "Spicy mayo", "category_ids": [category("Sauce")]})
    bowl = recipes.create(
        conn,
        {
            "name": "Salmon bowl",
            "category_ids": [category("Poke bowl")],
            "components": [{"type": "recipe", "id": mayo["id"]}],
        },
    )

    for recipe, inside in [(mayo, mayo), (mayo, bowl)]:
        with pytest.raises(RuleError) as err:
            recipes.change(conn, recipe["id"], {"components": [{"type": "recipe", "id": inside["id"]}]})
        assert err.value.kind == INVALID
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
    with pytest.raises(RuleError) as err:
        recipes.create(conn, {"name": "Salmon bowl", "category_ids": [category("Poke bowl")], **fields})

    assert (err.value.kind, err.value.message) == (INVALID, message)


def test_a_link_without_a_scheme_becomes_https(conn, category):
    bowl = recipes.create(
        conn, {"name": "Salmon bowl", "category_ids": [category("Poke bowl")], "url": " example.com/poke "}
    )

    assert bowl["url"] == "https://example.com/poke"


def test_a_missing_recipe_is_not_found(conn):
    for attempt in (lambda: recipes.get(conn, 42), lambda: recipes.change(conn, 42, {"notes": "x"})):
        with pytest.raises(RuleError) as err:
            attempt()
        assert err.value.kind == NOT_FOUND


def test_deleting_a_sauce_takes_it_out_of_the_bowls_that_had_it(conn, category):
    mayo = recipes.create(conn, {"name": "Spicy mayo", "category_ids": [category("Sauce")]})
    bowl = recipes.create(
        conn,
        {
            "name": "Salmon bowl",
            "category_ids": [category("Poke bowl")],
            "components": [{"type": "recipe", "id": mayo["id"]}],
        },
    )

    recipes.delete(conn, mayo["id"])

    assert recipes.get(conn, bowl["id"])["components"] == []
    assert [r["name"] for r in recipes.list_all(conn)] == ["Salmon bowl"]
    with pytest.raises(RuleError) as err:
        recipes.delete(conn, mayo["id"])
    assert err.value.kind == NOT_FOUND


def test_the_list_shows_the_newest_recipe_first(conn, category):
    for name in ("Spicy mayo", "Salmon bowl", "Miso soup"):
        recipes.create(conn, {"name": name, "category_ids": [category("Poke bowl")]})

    assert [r["name"] for r in recipes.list_all(conn)] == ["Miso soup", "Salmon bowl", "Spicy mayo"]


def test_a_recipe_is_saved_with_its_first_letter_capitalised(conn, category):
    mayo = recipes.create(conn, {"name": "spicy mayo", "category_ids": [category("Sauce")]})
    assert mayo["name"] == "Spicy mayo"

    renamed = recipes.change(conn, mayo["id"], {"name": "sriracha mayo"})
    assert renamed["name"] == "Sriracha mayo"


def test_a_new_ingredient_in_a_recipe_joins_the_catalog_with_no_sections(conn, category):
    bowl = recipes.create(
        conn,
        {
            "name": "Tofu bowl",
            "category_ids": [category("Poke bowl")],
            "components": [{"type": "ingredient", "name": "tofu", "quantity": 120, "unit": "g"}],
        },
    )

    [tofu] = ingredients.list_all(conn)
    assert (tofu["name"], tofu["section_ids"]) == ("Tofu", [])
    assert [(c["id"], c["name"], c["quantity"], c["unit"]) for c in bowl["components"]] == [
        (tofu["id"], "Tofu", 120, "g")
    ]


def test_a_new_ingredient_added_while_editing_a_recipe_joins_the_catalog(conn, category, ingredient):
    rice = ingredient("Rice")
    bowl = recipes.create(
        conn, {"name": "Bowl", "category_ids": [category("Poke bowl")], "components": [{"type": "ingredient", "id": rice}]}
    )

    changed = recipes.change(
        conn,
        bowl["id"],
        {"components": [{"type": "ingredient", "id": rice}, {"type": "ingredient", "name": "edamame"}]},
    )

    assert [i["name"] for i in ingredients.list_all(conn)] == ["Edamame", "Rice"]
    assert [(c["name"], c["quantity"], c["unit"]) for c in changed["components"]] == [
        ("Rice", 0, "g"),
        ("Edamame", 0, "g"),
    ]


@pytest.mark.parametrize("stored, typed", [("Tofu", "tofu"), ("Ștevie", "stevie")])
def test_a_new_ingredient_whose_name_is_taken_reuses_it(conn, category, ingredient, stored, typed):
    existing = ingredient(stored)

    bowl = recipes.create(
        conn,
        {
            "name": "Bowl",
            "category_ids": [category("Poke bowl")],
            "components": [{"type": "ingredient", "name": typed}],
        },
    )

    assert [i["name"] for i in ingredients.list_all(conn)] == [stored]
    assert [(c["id"], c["name"]) for c in bowl["components"]] == [(existing, stored)]


def test_a_new_ingredient_and_its_name_already_in_the_recipe_make_one_row(conn, category, ingredient):
    rice = ingredient("Rice")

    bowl = recipes.create(
        conn,
        {
            "name": "Bowl",
            "category_ids": [category("Poke bowl")],
            "components": [
                {"type": "ingredient", "name": "tofu", "quantity": 100},
                {"type": "ingredient", "id": rice, "quantity": 50},
                {"type": "ingredient", "name": " TOFU ", "quantity": 200},
                {"type": "ingredient", "name": "rice", "quantity": 80},
            ],
        },
    )

    assert [(c["name"], c["quantity"]) for c in bowl["components"]] == [("Tofu", 100), ("Rice", 50)]
    assert [i["name"] for i in ingredients.list_all(conn)] == ["Rice", "Tofu"]


@pytest.mark.parametrize(
    "fields, message",
    [
        ({"category_ids": []}, "Pick at least one category."),
        # Fails after Tofu is in: a blank second name.
        ({"components": [{"type": "ingredient", "name": "tofu"}, {"type": "ingredient", "name": " "}]},
         "Please give the ingredient a name."),
    ],
)
def test_a_save_that_fails_adds_no_new_ingredient(conn, category, fields, message):
    attempt = {
        "name": "Bowl",
        "category_ids": [category("Poke bowl")],
        "components": [{"type": "ingredient", "name": "tofu"}],
        **fields,
    }

    with pytest.raises(RuleError) as err:
        recipes.create(conn, attempt)

    assert err.value.message == message
    assert ingredients.list_all(conn) == []
    assert recipes.list_all(conn) == []
