import pytest

import ingredients
import recipes
from errors import DUPLICATE, INVALID, NOT_FOUND, RuleError


@pytest.fixture
def kind(conn):
    """Ingredient category id by slug: kind("protein")."""
    ids = dict(conn.execute("SELECT slug, id FROM categories"))
    return ids.__getitem__


def names_by_category(conn):
    return {c["slug"]: [i["name"] for i in c["ingredients"]] for c in ingredients.by_category(conn)}


def test_an_ingredient_in_two_categories_shows_up_under_both_a_to_z(conn, kind):
    ingredients.create(conn, {"name": "Tofu", "category_ids": [kind("protein"), kind("topping")]})
    ingredients.create(conn, {"name": "  avocado ", "category_ids": [kind("topping")]})

    listed = names_by_category(conn)

    assert listed["protein"] == ["Tofu"]
    assert listed["topping"] == ["avocado", "Tofu"]
    assert listed["base"] == []
    assert list(listed) == ["protein", "base", "fresh", "cooked", "topping", "extras"]


def test_a_name_is_taken_whatever_its_case(conn, kind):
    ingredients.create(conn, {"name": "Salmon", "category_ids": [kind("protein")]})
    rice = ingredients.create(conn, {"name": "Rice", "category_ids": [kind("base")]})

    for attempt in (
        lambda: ingredients.create(conn, {"name": "salmon", "category_ids": [kind("protein")]}),
        lambda: ingredients.change(conn, rice["id"], {"name": "SALMON"}),
    ):
        with pytest.raises(RuleError) as err:
            attempt()
        assert (err.value.kind, err.value.message) == (
            DUPLICATE,
            "An ingredient with that name already exists.",
        )
    assert names_by_category(conn)["protein"] == ["Salmon"]
    assert ingredients.get(conn, rice["id"])["name"] == "Rice"


@pytest.mark.parametrize(
    "fields, message",
    [
        ({"name": "  "}, "Please give the ingredient a name."),
        ({"category_ids": []}, "Pick at least one category."),
        ({"category_ids": [999]}, "Unknown category."),
        ({"category_ids": ["1"]}, "category_ids must be a list of category ids."),
    ],
)
def test_a_new_ingredient_is_refused_when_a_field_is_wrong(conn, kind, fields, message):
    with pytest.raises(RuleError) as err:
        ingredients.create(conn, {"name": "Salmon", "category_ids": [kind("protein")], **fields})

    assert (err.value.kind, err.value.message) == (INVALID, message)


def test_changing_only_the_name_keeps_the_categories(conn, kind):
    tofu = ingredients.create(conn, {"name": "Tofu", "category_ids": [kind("topping"), kind("protein")]})

    changed = ingredients.change(conn, tofu["id"], {"name": "Smoked tofu"})

    assert changed == {
        "id": tofu["id"],
        "name": "Smoked tofu",
        "category_ids": sorted([kind("protein"), kind("topping")]),
    }


def test_deleting_an_ingredient_takes_it_out_of_the_recipes_that_had_it(conn, category, ingredient):
    salmon = ingredient("Salmon")
    bowl = recipes.create(
        conn,
        {
            "name": "Salmon bowl",
            "category_ids": [category("bowl")],
            "components": [{"type": "ingredient", "id": salmon}],
        },
    )

    ingredients.delete(conn, salmon)

    assert recipes.get(conn, bowl["id"])["components"] == []
    assert names_by_category(conn)["protein"] == []


def test_a_missing_ingredient_is_not_found(conn):
    for attempt in (
        lambda: ingredients.get(conn, 42),
        lambda: ingredients.change(conn, 42, {"name": "x"}),
        lambda: ingredients.delete(conn, 42),
    ):
        with pytest.raises(RuleError) as err:
            attempt()
        assert err.value.kind == NOT_FOUND

