import pytest

import ingredients
import recipes
import stations
from errors import DUPLICATE, INVALID, NOT_FOUND, RuleError


def names_by_section(conn):
    """The Poke station's ingredient sections: {section name: [ingredient names]}."""
    poke = stations.list_all(conn)[0]
    return {
        s["name"]: [i["name"] for i in s["items"]] for s in poke["sections"] if s["kind"] == "ingredients"
    }


def test_an_ingredient_in_two_sections_shows_up_under_both_a_to_z(conn, section):
    ingredients.add(conn, {"name": "Tofu", "section_ids": [section("Protein"), section("Topping")]})
    ingredients.add(conn, {"name": "  avocado ", "section_ids": [section("Topping")]})

    listed = names_by_section(conn)

    assert listed["Protein"] == ["Tofu"]
    assert listed["Topping"] == ["avocado", "Tofu"]
    assert listed["Base"] == []


def test_an_ingredient_can_be_in_no_section_and_is_still_in_the_catalog(conn, section):
    ingredients.add(conn, {"name": "Seaweed"})
    tofu = ingredients.add(conn, {"name": "Tofu", "section_ids": [section("Protein")]})["ingredient"]
    ingredients.change(conn, tofu["id"], {"remove_section_ids": [section("Protein")]})

    assert all(names == [] for names in names_by_section(conn).values())
    assert [(i["name"], i["section_ids"]) for i in ingredients.list_all(conn)] == [
        ("Seaweed", []),
        ("Tofu", []),
    ]


def test_the_catalog_lists_every_ingredient_a_to_z_with_its_favorites(conn, ingredient):
    ingredient("tofu")
    ingredient("Avocado", "Topping")

    assert ingredients.list_all(conn) == [
        {"id": 2, "name": "Avocado", "section_ids": [5], "favorites": []},
        {"id": 1, "name": "tofu", "section_ids": [1], "favorites": []},
    ]


def test_a_rename_to_a_taken_name_is_refused_whatever_its_case(conn, ingredient):
    ingredient("Salmon")
    rice = ingredient("Rice", "Base")

    with pytest.raises(RuleError) as err:
        ingredients.change(conn, rice, {"name": "SALMON"})

    assert (err.value.kind, err.value.message) == (
        DUPLICATE,
        "An ingredient with that name already exists.",
    )
    assert ingredients.get(conn, rice)["name"] == "Rice"


# ---- Adding never makes a duplicate ----------------------------------------


def test_adding_a_new_name_creates_it_in_the_given_sections(conn, section):
    added = ingredients.add(
        conn, {"name": " Mango ", "section_ids": [section("Topping"), section("Base")]}
    )

    assert added == {
        "ingredient": {
            "id": added["ingredient"]["id"],
            "name": "Mango",
            "section_ids": sorted([section("Base"), section("Topping")]),
        },
        "reused": False,
        "added_to": sorted([section("Base"), section("Topping")]),
    }


def test_adding_a_taken_name_in_any_case_reuses_it_and_keeps_its_name(conn, ingredient):
    avocado = ingredient("Avocado", "Topping")

    added = ingredients.add(conn, {"name": " AVOCADO ", "section_ids": []})

    assert added["reused"] is True
    assert added["ingredient"]["id"] == avocado
    assert added["ingredient"]["name"] == "Avocado"
    assert [i["name"] for i in ingredients.list_all(conn)] == ["Avocado"]


def test_adding_to_another_section_keeps_the_sections_it_was_in(conn, section, ingredient):
    ingredient("Avocado", "Topping")

    added = ingredients.add(conn, {"name": "avocado", "section_ids": [section("Base")]})

    assert added["ingredient"]["section_ids"] == sorted([section("Base"), section("Topping")])
    assert added["added_to"] == [section("Base")]


def test_adding_keeps_sections_on_other_stations(conn, section):
    burger = stations.create(conn, {"name": "Burger", "emoji": "🍔"})["id"]
    toppings = stations.add_section(conn, burger, {"name": "Toppings"})["id"]
    fresh = section("Fresh Vegetables / Fruits")
    ingredients.add(conn, {"name": "Mango", "section_ids": [fresh, toppings]})

    added = ingredients.add(conn, {"name": "Mango", "section_ids": [section("Extras")]})

    assert added["ingredient"]["section_ids"] == sorted([fresh, toppings, section("Extras")])


def test_adding_to_a_section_it_is_already_in_adds_nothing(conn, section, ingredient):
    ingredient("Tofu", "Protein")

    added = ingredients.add(conn, {"name": "Tofu", "section_ids": [section("Protein")]})

    assert added["reused"] is True
    assert added["added_to"] == []
    assert added["ingredient"]["section_ids"] == [section("Protein")]


def test_adding_with_no_sections_makes_an_orphan_or_changes_nothing(conn, section, ingredient):
    seaweed = ingredients.add(conn, {"name": "Seaweed"})
    assert (seaweed["reused"], seaweed["ingredient"]["section_ids"]) == (False, [])

    ingredient("Tofu", "Protein")
    tofu = ingredients.add(conn, {"name": "tofu"})
    assert (tofu["reused"], tofu["added_to"]) == (True, [])
    assert tofu["ingredient"]["section_ids"] == [section("Protein")]


def test_adding_to_an_unknown_section_changes_nothing(conn, section, ingredient):
    ingredient("Tofu", "Protein")

    with pytest.raises(RuleError) as err:
        ingredients.add(conn, {"name": "Tofu", "section_ids": [section("Base"), 999]})

    assert (err.value.kind, err.value.message) == (INVALID, "Unknown section.")
    assert [(i["name"], i["section_ids"]) for i in ingredients.list_all(conn)] == [
        ("Tofu", [section("Protein")])
    ]


@pytest.mark.parametrize(
    "fields, message",
    [
        ({"name": "  "}, "Please give the ingredient a name."),
        ({"section_ids": [999]}, "Unknown section."),
        ({"section_ids": ["1"]}, "section_ids must be a list of section ids."),
    ],
)
def test_a_new_ingredient_is_refused_when_a_field_is_wrong(conn, section, fields, message):
    with pytest.raises(RuleError) as err:
        ingredients.add(conn, {"name": "Salmon", "section_ids": [section("Protein")], **fields})

    assert (err.value.kind, err.value.message) == (INVALID, message)


def test_an_ingredient_cannot_go_in_a_listed_category(conn):
    sauce = next(s for s in stations.list_all(conn)[0]["sections"] if s["kind"] == "recipes")

    with pytest.raises(RuleError) as err:
        ingredients.add(conn, {"name": "Salmon", "section_ids": [sauce["id"]]})

    assert (err.value.kind, err.value.message) == (INVALID, "Unknown section.")


def test_changing_only_the_name_keeps_the_sections(conn, section):
    tofu = ingredients.add(
        conn, {"name": "Tofu", "section_ids": [section("Topping"), section("Protein")]}
    )["ingredient"]

    changed = ingredients.change(conn, tofu["id"], {"name": "Smoked tofu"})

    assert changed == {
        "id": tofu["id"],
        "name": "Smoked tofu",
        "section_ids": sorted([section("Protein"), section("Topping")]),
    }


# ---- Editing changes only what was changed --------------------------------


@pytest.fixture
def mango_on_two_stations(conn, section):
    """Mango in Poke → Fresh and Burger → Toppings: (mango id, toppings id)."""
    burger = stations.create(conn, {"name": "Burger", "emoji": "🍔"})["id"]
    toppings = stations.add_section(conn, burger, {"name": "Toppings"})["id"]
    fresh = section("Fresh Vegetables / Fruits")
    mango = ingredients.add(conn, {"name": "Mango", "section_ids": [fresh, toppings]})
    return mango["ingredient"]["id"], toppings


def test_ticking_a_section_keeps_the_ones_it_was_in(conn, section, mango_on_two_stations):
    mango, toppings = mango_on_two_stations

    changed = ingredients.change(conn, mango, {"add_section_ids": [section("Extras")]})

    assert changed["section_ids"] == sorted(
        [section("Fresh Vegetables / Fruits"), toppings, section("Extras")]
    )


def test_unticking_a_section_takes_it_out_of_only_that_one(conn, section, mango_on_two_stations):
    mango, toppings = mango_on_two_stations

    changed = ingredients.change(
        conn, mango, {"remove_section_ids": [section("Fresh Vegetables / Fruits")]}
    )

    assert changed["section_ids"] == [toppings]


def test_ticking_an_unknown_section_changes_nothing(conn, section, mango_on_two_stations):
    mango, toppings = mango_on_two_stations
    before = ingredients.get(conn, mango)
    sauce = next(s for s in stations.list_all(conn)[0]["sections"] if s["kind"] == "recipes")

    for unknown in (999, sauce["id"]):
        with pytest.raises(RuleError) as err:
            ingredients.change(
                conn,
                mango,
                {"name": "Ripe mango", "add_section_ids": [section("Extras"), unknown]},
            )
        assert (err.value.kind, err.value.message) == (INVALID, "Unknown section.")

    assert ingredients.get(conn, mango) == before


def test_unticking_a_section_it_is_not_in_is_fine(conn, section, mango_on_two_stations):
    mango, toppings = mango_on_two_stations

    changed = ingredients.change(conn, mango, {"remove_section_ids": [section("Base"), 999]})

    assert changed["section_ids"] == sorted([section("Fresh Vegetables / Fruits"), toppings])


def test_a_section_cannot_be_both_ticked_and_unticked(conn, section, mango_on_two_stations):
    mango, _ = mango_on_two_stations

    with pytest.raises(RuleError) as err:
        ingredients.change(
            conn, mango, {"add_section_ids": [section("Base")], "remove_section_ids": [section("Base")]}
        )

    assert (err.value.kind, err.value.message) == (
        INVALID,
        "A section can't be both added and removed.",
    )


@pytest.mark.parametrize("field", ["add_section_ids", "remove_section_ids"])
def test_section_changes_must_be_lists_of_ids(conn, ingredient, field):
    tofu = ingredient("Tofu")

    with pytest.raises(RuleError) as err:
        ingredients.change(conn, tofu, {field: ["1"]})

    assert (err.value.kind, err.value.message) == (INVALID, f"{field} must be a list of section ids.")


def test_deleting_an_ingredient_takes_it_out_of_the_recipes_that_had_it(conn, category, ingredient):
    salmon = ingredient("Salmon")
    bowl = recipes.create(
        conn,
        {
            "name": "Salmon bowl",
            "category_ids": [category("Poke bowl")],
            "components": [{"type": "ingredient", "id": salmon}],
        },
    )

    ingredients.delete(conn, salmon)

    assert recipes.get(conn, bowl["id"])["components"] == []
    assert names_by_section(conn)["Protein"] == []


def test_a_missing_ingredient_is_not_found(conn):
    for attempt in (
        lambda: ingredients.get(conn, 42),
        lambda: ingredients.change(conn, 42, {"name": "x"}),
        lambda: ingredients.delete(conn, 42),
    ):
        with pytest.raises(RuleError) as err:
            attempt()
        assert err.value.kind == NOT_FOUND
