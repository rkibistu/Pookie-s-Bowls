import pytest

import db
import recipe_categories
import recipes
from errors import DUPLICATE, INVALID, NOT_FOUND, RuleError


def names(conn):
    return [c["name"] for c in recipe_categories.list_all(conn)]


def refused(attempt):
    """The (kind, message) of the RuleError the attempt raises."""
    with pytest.raises(RuleError) as err:
        attempt()
    return err.value.kind, err.value.message


def test_a_fresh_database_starts_with_the_seed_categories_in_order(conn):
    assert [(c["name"], c["emoji"]) for c in recipe_categories.list_all(conn)] == [
        ("Poke bowl", "🥣"),
        ("Sauce", "🥫"),
        ("Soup", "🍲"),
    ]


def test_a_new_category_goes_at_the_end(conn):
    created = recipe_categories.create(conn, {"name": "  Pizza ", "emoji": " 🍕 "})

    assert created == {
        "id": created["id"],
        "name": "Pizza",
        "emoji": "🍕",
        "shows_quantities": True,
    }
    assert names(conn) == ["Poke bowl", "Sauce", "Soup", "Pizza"]


@pytest.mark.parametrize(
    "fields, message",
    [
        ({"name": "  "}, "Please give the category a name."),
        ({"emoji": ""}, "Please give the category an emoji."),
        ({"emoji": None}, "Please give the category an emoji."),
    ],
)
def test_a_new_category_is_refused_when_a_field_is_wrong(conn, fields, message):
    attempt = lambda: recipe_categories.create(conn, {"name": "Pizza", "emoji": "🍕", **fields})

    assert refused(attempt) == (INVALID, message)
    assert names(conn) == ["Poke bowl", "Sauce", "Soup"]


def test_a_name_is_taken_whatever_its_case_accents_or_spaces(conn, category):
    for attempt in (
        lambda: recipe_categories.create(conn, {"name": "sauce", "emoji": "🧂"}),
        lambda: recipe_categories.change(conn, category("Soup"), {"name": "SAUCE"}),
        lambda: recipe_categories.create(conn, {"name": " Sâuce ", "emoji": "🧂"}),
        lambda: recipe_categories.change(conn, category("Soup"), {"name": "poke  BOWL"}),
    ):
        assert refused(attempt) == (DUPLICATE, "A category with that name already exists.")
    assert names(conn) == ["Poke bowl", "Sauce", "Soup"]


def test_renaming_changes_only_the_fields_given_and_shows_on_its_recipes(conn, category):
    stew = recipes.create(conn, {"name": "Miso soup", "category_ids": [category("Soup")]})

    recipe_categories.change(conn, category("Soup"), {"name": "Soups & stews"})
    changed = recipe_categories.change(conn, category("Soup"), {"emoji": "🥘"})

    assert (changed["name"], changed["emoji"]) == ("Soups & stews", "🥘")
    assert recipes.get(conn, stew["id"])["categories"] == [
        {"id": category("Soup"), "name": "Soups & stews", "emoji": "🥘", "shows_quantities": True}
    ]


def test_changing_a_missing_category_says_so(conn):
    assert refused(lambda: recipe_categories.change(conn, 999, {"name": "Pizza"})) == (
        NOT_FOUND,
        "Category not found.",
    )


def test_the_order_decides_how_a_recipes_categories_are_listed(conn, category):
    bowl = recipes.create(
        conn, {"name": "Ramen bowl", "category_ids": [category("Poke bowl"), category("Soup")]}
    )

    reordered = recipe_categories.reorder(
        conn, [category("Soup"), category("Poke bowl"), category("Sauce")]
    )

    assert [c["name"] for c in reordered] == ["Soup", "Poke bowl", "Sauce"]
    assert names(conn) == ["Soup", "Poke bowl", "Sauce"]
    assert [c["name"] for c in recipes.get(conn, bowl["id"])["categories"]] == ["Soup", "Poke bowl"]


@pytest.mark.parametrize(
    "order",
    [
        lambda bowl, sauce, soup: "not a list",
        lambda bowl, sauce, soup: [str(soup), str(bowl), str(sauce)],
        lambda bowl, sauce, soup: [True, sauce, soup],
        lambda bowl, sauce, soup: [soup, bowl],  # one missing
        lambda bowl, sauce, soup: [soup, bowl, bowl],  # one twice
        lambda bowl, sauce, soup: [soup, bowl, sauce, 999],  # an unknown one
    ],
)
def test_a_new_order_must_list_every_category_once(conn, category, order):
    order = order(category("Poke bowl"), category("Sauce"), category("Soup"))

    assert refused(lambda: recipe_categories.reorder(conn, order)) == (
        INVALID,
        "category_ids must list every category once.",
    )
    assert names(conn) == ["Poke bowl", "Sauce", "Soup"]


def test_deleting_a_category_takes_it_off_recipes_that_have_another(conn, category):
    ramen = recipes.create(
        conn, {"name": "Ramen bowl", "category_ids": [category("Poke bowl"), category("Soup")]}
    )

    recipe_categories.delete(conn, category("Soup"))

    assert names(conn) == ["Poke bowl", "Sauce"]
    assert [c["name"] for c in recipes.get(conn, ramen["id"])["categories"]] == ["Poke bowl"]


def test_a_category_cannot_be_deleted_while_a_recipe_has_no_other(conn, category):
    for name in ("Spicy mayo", "Ponzu"):
        recipes.create(conn, {"name": name, "category_ids": [category("Sauce")]})
    recipes.create(
        conn, {"name": "Sauce bowl", "category_ids": [category("Sauce"), category("Poke bowl")]}
    )

    assert refused(lambda: recipe_categories.delete(conn, category("Sauce"))) == (
        INVALID,
        "Give these recipes another category first: Ponzu, Spicy mayo.",
    )
    assert names(conn) == ["Poke bowl", "Sauce", "Soup"]


def test_deleting_a_category_keeps_its_recipes_inside_other_recipes(conn, category):
    mayo = recipes.create(
        conn, {"name": "Spicy mayo", "category_ids": [category("Sauce"), category("Soup")]}
    )
    bowl = recipes.create(
        conn,
        {
            "name": "Salmon bowl",
            "category_ids": [category("Poke bowl")],
            "components": [{"type": "recipe", "id": mayo["id"]}],
        },
    )

    recipe_categories.delete(conn, category("Sauce"))

    assert [c["name"] for c in recipes.get(conn, bowl["id"])["components"]] == ["Spicy mayo"]


def test_the_last_category_cannot_be_deleted(conn, category):
    recipe_categories.delete(conn, category("Sauce"))
    recipe_categories.delete(conn, category("Soup"))

    assert refused(lambda: recipe_categories.delete(conn, category("Poke bowl"))) == (
        INVALID,
        "The last category can't be deleted; rename it instead.",
    )


def test_deleting_a_missing_category_says_so(conn):
    assert refused(lambda: recipe_categories.delete(conn, 999)) == (
        NOT_FOUND,
        "Category not found.",
    )


def test_a_deleted_seed_category_stays_deleted_after_a_restart(conn, category):
    recipe_categories.delete(conn, category("Soup"))

    db.set_up(conn)

    assert names(conn) == ["Poke bowl", "Sauce"]
