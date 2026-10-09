import pytest

import ingredients
import recipe_categories
import recipes
import stations
from errors import DUPLICATE, INVALID, NOT_FOUND, RuleError


def refused(attempt):
    """The (kind, message) of the RuleError the attempt raises."""
    with pytest.raises(RuleError) as err:
        attempt()
    return err.value.kind, err.value.message


@pytest.fixture
def poke(conn):
    """The seeded Poke station's id."""
    return stations.list_all(conn)[0]["id"]


def sections(conn, station_id):
    """The station's sections as names; a listed category is "🥫 Sauce"."""
    return [
        f"{s['emoji']} {s['name']}" if s["kind"] == "recipes" else s["name"]
        for s in stations.get(conn, station_id)["sections"]
    ]


def section_id(conn, station_id, name):
    return next(s["id"] for s in stations.get(conn, station_id)["sections"] if s["name"] == name)


def test_a_fresh_database_has_the_poke_station(conn, category):
    [poke] = stations.list_all(conn)

    assert (poke["name"], poke["emoji"], poke["recipe_category_id"]) == (
        "Poke",
        "🥣",
        category("Poke bowl"),
    )
    assert sections(conn, poke["id"]) == [
        "Protein",
        "Base",
        "Fresh Vegetables / Fruits",
        "Cooked Vegetables / Fruits",
        "Topping",
        "Extras",
        "🥫 Sauce",
    ]


def test_a_section_shows_its_rows_a_to_z_with_favorites(conn, poke, category, ingredient):
    ingredient("tofu")
    ingredient("Salmon")
    recipes.create(conn, {"name": "Spicy mayo", "category_ids": [category("Sauce")]})
    recipes.create(conn, {"name": "Salmon bowl", "category_ids": [category("Poke bowl")]})

    by_name = {s["name"]: s["items"] for s in stations.get(conn, poke)["sections"]}

    assert [i["name"] for i in by_name["Protein"]] == ["Salmon", "tofu"]
    assert by_name["Sauce"] == [{"type": "recipe", "id": 1, "name": "Spicy mayo", "favorites": []}]


def test_a_station_can_be_renamed_and_start_its_recipes_elsewhere(conn, poke, category):
    stations.change(conn, poke, {"name": " Poke bar ", "emoji": "🍣"})
    changed = stations.change(conn, poke, {"recipe_category_id": category("Soup")})

    assert (changed["name"], changed["emoji"], changed["recipe_category_id"]) == (
        "Poke bar",
        "🍣",
        category("Soup"),
    )
    assert stations.change(conn, poke, {"recipe_category_id": None})["recipe_category_id"] is None


def test_deleting_its_recipe_category_makes_the_station_start_in_the_first(conn, poke, category):
    stations.change(conn, poke, {"recipe_category_id": category("Soup")})

    recipe_categories.delete(conn, category("Soup"))

    assert stations.get(conn, poke)["recipe_category_id"] is None


@pytest.mark.parametrize(
    "fields, message",
    [
        ({"name": " "}, "Please give the station a name."),
        ({"emoji": ""}, "Please give the station an emoji."),
        ({"recipe_category_id": 999}, "Unknown category."),
        ({"recipe_category_id": "1"}, "recipe_category_id must be a category id."),
    ],
)
def test_a_station_change_is_refused_when_a_field_is_wrong(conn, poke, fields, message):
    assert refused(lambda: stations.change(conn, poke, fields)) == (INVALID, message)
    assert stations.get(conn, poke)["name"] == "Poke"


def test_a_missing_station_or_section_is_not_found(conn):
    for attempt, message in (
        (lambda: stations.change(conn, 99, {"name": "x"}), "Station not found."),
        (lambda: stations.add_section(conn, 99, {"name": "x"}), "Station not found."),
        (lambda: stations.rename_section(conn, 99, "x"), "Section not found."),
        (lambda: stations.delete_section(conn, 99), "Section not found."),
    ):
        assert refused(attempt) == (NOT_FOUND, message)


def test_new_sections_go_at_the_end(conn, poke, category):
    added = stations.add_section(conn, poke, {"name": " Nuts "})
    listed = stations.add_section(conn, poke, {"recipe_category_id": category("Soup")})

    assert (added["kind"], added["name"], added["items"]) == ("ingredients", "Nuts", [])
    assert (listed["kind"], listed["name"], listed["emoji"]) == ("recipes", "Soup", "🍲")
    assert sections(conn, poke)[-3:] == ["🥫 Sauce", "Nuts", "🍲 Soup"]


def test_a_section_name_or_listed_category_is_taken_once_per_station(conn, poke, category):
    for attempt, message in (
        (lambda: stations.add_section(conn, poke, {"name": "protein"}), "This station already has a section with that name."),
        (lambda: stations.add_section(conn, poke, {"name": "PROTÉIN"}), "This station already has a section with that name."),
        (lambda: stations.add_section(conn, poke, {"name": "fresh  vegetables / fruits"}), "This station already has a section with that name."),
        (lambda: stations.rename_section(conn, section_id(conn, poke, "Base"), "EXTRAS"), "This station already has a section with that name."),
        (lambda: stations.add_section(conn, poke, {"recipe_category_id": category("Sauce")}), "That category is already listed here."),
    ):
        assert refused(attempt) == (DUPLICATE, message)


@pytest.mark.parametrize(
    "fields, message",
    [
        ({}, "Give either a name or a recipe_category_id."),
        ({"name": "Nuts", "recipe_category_id": 1}, "Give either a name or a recipe_category_id."),
        ({"name": "  "}, "Please give the section a name."),
        ({"recipe_category_id": 999}, "Unknown category."),
    ],
)
def test_a_new_section_is_refused_when_a_field_is_wrong(conn, poke, fields, message):
    assert refused(lambda: stations.add_section(conn, poke, fields)) == (INVALID, message)


def test_renaming_a_section_keeps_its_ingredients(conn, poke, ingredient):
    ingredient("Salmon")

    renamed = stations.rename_section(conn, section_id(conn, poke, "Protein"), "Fish")

    assert (renamed["name"], [i["name"] for i in renamed["items"]]) == ("Fish", ["Salmon"])


def test_a_listed_category_is_not_renamed_as_a_section(conn, poke):
    sauce = section_id(conn, poke, "Sauce")

    assert refused(lambda: stations.rename_section(conn, sauce, "Dips")) == (
        INVALID,
        "A listed category is renamed on the Recipes page.",
    )


def test_deleting_a_section_leaves_its_ingredients_in_the_catalog(conn, poke, section, ingredient):
    salmon = ingredient("Salmon")
    tofu = ingredients.add(
        conn, {"name": "Tofu", "section_ids": [section("Protein"), section("Topping")]}
    )["ingredient"]["id"]

    stations.delete_section(conn, section("Protein"))

    assert "Protein" not in sections(conn, poke)
    assert ingredients.get(conn, salmon)["section_ids"] == []  # an orphan
    assert ingredients.get(conn, tofu)["section_ids"] == [section("Topping")]


def test_unlisting_a_category_keeps_its_recipes_inside_other_recipes(conn, poke, category):
    mayo = recipes.create(conn, {"name": "Spicy mayo", "category_ids": [category("Sauce")]})
    bowl = recipes.create(
        conn,
        {
            "name": "Salmon bowl",
            "category_ids": [category("Poke bowl")],
            "components": [{"type": "recipe", "id": mayo["id"]}],
        },
    )

    stations.delete_section(conn, section_id(conn, poke, "Sauce"))

    assert "🥫 Sauce" not in sections(conn, poke)
    assert [c["name"] for c in recipes.get(conn, bowl["id"])["components"]] == ["Spicy mayo"]


def test_deleting_a_recipe_category_unlists_it(conn, poke, category):
    recipe_categories.delete(conn, category("Sauce"))

    assert sections(conn, poke)[-1] == "Extras"


def test_ingredient_sections_and_listed_categories_share_one_order(conn, poke):
    ids = {s["name"]: s["id"] for s in stations.get(conn, poke)["sections"]}
    order = [ids[n] for n in ("Base", "Sauce", "Protein", "Fresh Vegetables / Fruits",
                              "Cooked Vegetables / Fruits", "Topping", "Extras")]

    stations.reorder_sections(conn, poke, order)

    assert sections(conn, poke)[:3] == ["Base", "🥫 Sauce", "Protein"]


@pytest.mark.parametrize(
    "order",
    [
        lambda ids: "not a list",
        lambda ids: ids[:-1],  # one missing
        lambda ids: ids + ids[:1],  # one twice
        lambda ids: ids[:-1] + [999],  # an unknown one
        lambda ids: [str(i) for i in ids],
    ],
)
def test_a_new_section_order_must_list_every_section_once(conn, poke, order):
    before = sections(conn, poke)
    ids = [s["id"] for s in stations.get(conn, poke)["sections"]]

    assert refused(lambda: stations.reorder_sections(conn, poke, order(ids))) == (
        INVALID,
        "section_ids must list every section of the station once.",
    )
    assert sections(conn, poke) == before


def test_a_new_station_goes_at_the_end_with_no_sections(conn):
    burger = stations.create(conn, {"name": " Burger ", "emoji": "🍔"})

    assert burger == {
        "id": burger["id"],
        "name": "Burger",
        "emoji": "🍔",
        "recipe_category_id": None,
        "sections": [],
    }
    assert [s["name"] for s in stations.list_all(conn)] == ["Poke", "Burger"]


@pytest.mark.parametrize(
    "fields, kind, message",
    [
        ({"name": "", "emoji": "🍔"}, INVALID, "Please give the station a name."),
        ({"name": "Burger"}, INVALID, "Please give the station an emoji."),
        ({"name": "POKE", "emoji": "🍔"}, DUPLICATE, "A station with that name already exists."),
        ({"name": " PÔKE ", "emoji": "🍔"}, DUPLICATE, "A station with that name already exists."),
    ],
)
def test_a_new_station_is_refused_when_a_field_is_wrong(conn, fields, kind, message):
    assert refused(lambda: stations.create(conn, fields)) == (kind, message)
    assert len(stations.list_all(conn)) == 1


def test_an_ingredient_can_be_in_sections_on_two_stations(conn, poke, section):
    burger = stations.create(conn, {"name": "Burger", "emoji": "🍔"})["id"]
    patty = stations.add_section(conn, burger, {"name": "Patty"})["id"]

    salmon = ingredients.add(conn, {"name": "Salmon", "section_ids": [section("Protein"), patty]})["ingredient"]

    assert [i["name"] for i in stations.get(conn, burger)["sections"][0]["items"]] == ["Salmon"]
    assert salmon["section_ids"] == sorted([section("Protein"), patty])


def test_two_stations_can_have_sections_with_the_same_name(conn):
    burger = stations.create(conn, {"name": "Burger", "emoji": "🍔"})["id"]

    assert stations.add_section(conn, burger, {"name": "Protein"})["name"] == "Protein"


def test_deleting_a_station_leaves_its_ingredients_as_orphans(conn, poke, ingredient):
    burger = stations.create(conn, {"name": "Burger", "emoji": "🍔"})["id"]
    patty = stations.add_section(conn, burger, {"name": "Patty"})["id"]
    beef = ingredients.add(conn, {"name": "Beef", "section_ids": [patty]})["ingredient"]["id"]
    salmon = ingredient("Salmon")

    stations.delete(conn, burger)

    assert [s["name"] for s in stations.list_all(conn)] == ["Poke"]
    assert ingredients.get(conn, beef)["section_ids"] == []
    assert ingredients.get(conn, salmon)["section_ids"] != []


def test_the_last_station_cannot_be_deleted(conn, poke):
    assert refused(lambda: stations.delete(conn, poke)) == (
        INVALID,
        "The last station can't be deleted; rename it instead.",
    )
    assert refused(lambda: stations.delete(conn, 99)) == (NOT_FOUND, "Station not found.")


def test_a_sections_rows_go_a_to_z_ignoring_accents(conn, poke, ingredient):
    for name in ("Tofu", "Ștevie", "Spinach"):
        ingredient(name, "Base")

    base = next(s for s in stations.get(conn, poke)["sections"] if s["name"] == "Base")

    assert [i["name"] for i in base["items"]] == ["Spinach", "Ștevie", "Tofu"]
