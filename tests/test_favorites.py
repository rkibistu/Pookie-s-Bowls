import pytest

import favorites
import ingredients
import recipes
from errors import INVALID, NOT_FOUND, RuleError


@pytest.fixture
def sauce(conn, category):
    """A recipe to favorite; returns its id."""
    return recipes.create(conn, {"name": "Spicy mayo", "category_ids": [category("sauce")]})["id"]


def test_me_comes_before_her_whoever_was_first(conn, ingredient):
    tofu = {"type": "ingredient", "id": ingredient("Tofu")}

    favorites.set(conn, tofu, "her", True)
    favorites.set(conn, tofu, "me", True)

    assert favorites.by_item(conn) == {("ingredient", tofu["id"]): ["me", "her"]}


def test_adding_or_removing_twice_changes_nothing(conn, ingredient):
    tofu = {"type": "ingredient", "id": ingredient("Tofu")}

    favorites.set(conn, tofu, "me", True)
    favorites.set(conn, tofu, "me", True)
    assert favorites.by_item(conn) == {("ingredient", tofu["id"]): ["me"]}

    favorites.set(conn, tofu, "me", False)
    favorites.set(conn, tofu, "me", False)
    assert favorites.by_item(conn) == {}


def test_an_ingredient_and_a_recipe_with_the_same_id_keep_their_own(conn, ingredient, sauce):
    tofu = ingredient("Tofu")
    assert tofu == sauce  # both 1: the point of the test

    favorites.set(conn, {"type": "ingredient", "id": tofu}, "me", True)
    favorites.set(conn, {"type": "recipe", "id": sauce}, "her", True)

    assert favorites.by_item(conn) == {("ingredient", tofu): ["me"], ("recipe", sauce): ["her"]}


@pytest.mark.parametrize(
    "item, person, kind, message",
    [
        ({"type": "ingredient", "id": 42}, "me", NOT_FOUND, "Ingredient not found."),
        ({"type": "recipe", "id": 42}, "me", NOT_FOUND, "Recipe not found."),
        ({"type": "sauce", "id": 1}, "me", INVALID, "type must be 'ingredient' or 'recipe'."),
        ({"type": "ingredient", "id": 1}, "him", INVALID, "person must be 'me' or 'her'."),
    ],
)
def test_a_favorite_is_refused_on_a_missing_item_or_by_someone_else(
    conn, ingredient, item, person, kind, message
):
    ingredient("Tofu")

    with pytest.raises(RuleError) as err:
        favorites.set(conn, item, person, True)

    assert (err.value.kind, err.value.message) == (kind, message)


def test_deleting_an_item_drops_its_favorites(conn, ingredient, sauce):
    tofu = ingredient("Tofu")
    favorites.set(conn, {"type": "ingredient", "id": tofu}, "me", True)
    favorites.set(conn, {"type": "recipe", "id": sauce}, "me", True)

    ingredients.delete(conn, tofu)
    recipes.delete(conn, sauce)

    assert favorites.by_item(conn) == {}
