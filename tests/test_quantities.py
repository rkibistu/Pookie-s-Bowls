import pytest

import ingredients
import recipe_categories
import recipes
from errors import INVALID, RuleError


def quantities(recipe):
    """{name: (quantity, unit)} of a recipe's components."""
    return {c["name"]: (c["quantity"], c["unit"]) for c in recipe["components"]}


def last_unit(conn, ingredient_id):
    return next(i["last_unit"] for i in ingredients.list_all(conn) if i["id"] == ingredient_id)


def bowl_with(conn, category, *components, name="Salmon bowl"):
    return recipes.create(
        conn, {"name": name, "category_ids": [category("Poke bowl")], "components": list(components)}
    )


def test_a_new_row_starts_at_0_in_its_last_unit_which_starts_at_g(conn, category, ingredient):
    salmon = ingredient("Salmon")
    mayo = recipes.create(conn, {"name": "Spicy mayo", "category_ids": [category("Sauce")]})

    bowl = bowl_with(conn, category, {"type": "ingredient", "id": salmon}, {"type": "recipe", "id": mayo["id"]})

    assert quantities(bowl) == {"Salmon": (0, "g"), "Spicy mayo": (0, "g")}


def test_quantities_are_saved_with_the_recipe(conn, category, ingredient):
    salmon = ingredient("Salmon")

    bowl = bowl_with(conn, category, {"type": "ingredient", "id": salmon, "quantity": 120.5, "unit": "kg"})

    assert quantities(recipes.get(conn, bowl["id"])) == {"Salmon": (120.5, "kg")}


def test_a_unit_chosen_in_one_recipe_is_where_the_next_one_starts(conn, category, ingredient):
    salt = ingredient("Salt")
    bowl_with(conn, category, {"type": "ingredient", "id": salt, "unit": "tbsp"})

    second = bowl_with(conn, category, {"type": "ingredient", "id": salt}, name="Tuna bowl")

    assert last_unit(conn, salt) == "tbsp"
    assert quantities(second) == {"Salt": (0, "tbsp")}


def test_a_sauce_remembers_its_last_unit_too(conn, category):
    mayo = recipes.create(conn, {"name": "Spicy mayo", "category_ids": [category("Sauce")]})
    bowl_with(conn, category, {"type": "recipe", "id": mayo["id"], "unit": "ml"})

    assert recipes.get(conn, mayo["id"])["last_unit"] == "ml"


def test_changing_a_unit_in_a_saved_recipe_makes_it_the_last_unit(conn, category, ingredient):
    salt = ingredient("Salt")
    bowl = bowl_with(conn, category, {"type": "ingredient", "id": salt, "unit": "tbsp"})

    recipes.change(conn, bowl["id"], {"components": [{"type": "ingredient", "id": salt, "unit": "pinch"}]})

    assert last_unit(conn, salt) == "pinch"


def test_resaving_a_row_untouched_leaves_the_last_unit_alone(conn, category, ingredient):
    salt = ingredient("Salt")
    bowl = bowl_with(conn, category, {"type": "ingredient", "id": salt, "unit": "tbsp"})
    bowl_with(conn, category, {"type": "ingredient", "id": salt, "unit": "g"}, name="Tuna bowl")

    changed = recipes.change(
        conn, bowl["id"], {"components": [{"type": "ingredient", "id": salt, "quantity": 2, "unit": "tbsp"}]}
    )

    assert quantities(changed) == {"Salt": (2, "tbsp")}
    assert last_unit(conn, salt) == "g"


def test_changing_a_last_unit_leaves_saved_recipes_alone(conn, category, ingredient):
    salt = ingredient("Salt")
    bowl = bowl_with(conn, category, {"type": "ingredient", "id": salt, "unit": "tbsp"})

    bowl_with(conn, category, {"type": "ingredient", "id": salt, "unit": "g"}, name="Tuna bowl")

    assert quantities(recipes.get(conn, bowl["id"])) == {"Salt": (0, "tbsp")}


def test_a_row_sent_without_a_quantity_or_unit_keeps_the_ones_it_has(conn, category, ingredient):
    salt = ingredient("Salt")
    rice = ingredient("Rice")
    bowl = bowl_with(conn, category, {"type": "ingredient", "id": salt, "quantity": 2, "unit": "tbsp"})
    bowl_with(conn, category, {"type": "ingredient", "id": salt, "unit": "g"}, name="Tuna bowl")

    # As "Pick from list…" sends them: just which items.
    changed = recipes.change(
        conn, bowl["id"], {"components": [{"type": "ingredient", "id": salt}, {"type": "ingredient", "id": rice}]}
    )

    assert quantities(changed) == {"Salt": (2, "tbsp"), "Rice": (0, "g")}
    assert last_unit(conn, salt) == "g"


def test_removing_an_item_drops_its_quantity(conn, category, ingredient):
    salt = ingredient("Salt")
    bowl = bowl_with(conn, category, {"type": "ingredient", "id": salt, "quantity": 5})
    recipes.change(conn, bowl["id"], {"components": []})

    back = recipes.change(conn, bowl["id"], {"components": [{"type": "ingredient", "id": salt}]})

    assert quantities(back) == {"Salt": (0, "g")}


def test_changing_categories_keeps_quantities(conn, category, ingredient):
    salt = ingredient("Salt")
    bowl = bowl_with(conn, category, {"type": "ingredient", "id": salt, "quantity": 5})
    recipe_categories.change(conn, category("Sauce"), {"shows_quantities": False})

    hidden = recipes.change(conn, bowl["id"], {"category_ids": [category("Sauce")]})
    shown = recipes.change(conn, bowl["id"], {"category_ids": [category("Poke bowl")]})

    assert hidden["shows_quantities"] is False
    assert quantities(hidden) == quantities(shown) == {"Salt": (5, "g")}


def test_a_recipe_shows_quantities_when_one_of_its_categories_does(conn, category):
    recipe_categories.change(conn, category("Sauce"), {"shows_quantities": False})
    recipe_categories.change(conn, category("Soup"), {"shows_quantities": False})

    def shows(*names):
        recipe = recipes.create(
            conn, {"name": "+".join(names), "category_ids": [category(n) for n in names]}
        )
        return recipe["shows_quantities"]

    assert shows("Sauce") is False
    assert shows("Sauce", "Soup") is False
    assert shows("Sauce", "Poke bowl") is True


def test_a_new_category_shows_quantities_and_can_stop(conn, category):
    created = recipe_categories.create(conn, {"name": "Pizza", "emoji": "🍕"})

    changed = recipe_categories.change(conn, created["id"], {"shows_quantities": False})

    assert created["shows_quantities"] is True
    assert (changed["shows_quantities"], changed["name"]) == (False, "Pizza")


def test_shows_quantities_must_be_true_or_false(conn, category):
    with pytest.raises(RuleError) as err:
        recipe_categories.change(conn, category("Sauce"), {"shows_quantities": "no"})
    assert (err.value.kind, err.value.message) == (INVALID, "shows_quantities must be true or false.")


@pytest.mark.parametrize(
    "fields, message",
    [
        ({"quantity": -1}, "A quantity must be a number, 0 or more."),
        ({"quantity": "2"}, "A quantity must be a number, 0 or more."),
        ({"quantity": True}, "A quantity must be a number, 0 or more."),
        ({"quantity": float("nan")}, "A quantity must be a number, 0 or more."),
        ({"unit": "handful"}, "Unknown unit."),
    ],
)
def test_a_wrong_quantity_or_unit_is_refused(conn, category, ingredient, fields, message):
    salt = ingredient("Salt")

    with pytest.raises(RuleError) as err:
        bowl_with(conn, category, {"type": "ingredient", "id": salt, **fields})
    assert (err.value.kind, err.value.message) == (INVALID, message)
