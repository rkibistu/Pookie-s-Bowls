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
    ingredients.create(conn, {"name": "Tofu", "section_ids": [section("Protein"), section("Topping")]})
    ingredients.create(conn, {"name": "  avocado ", "section_ids": [section("Topping")]})

    listed = names_by_section(conn)

    assert listed["Protein"] == ["Tofu"]
    assert listed["Topping"] == ["avocado", "Tofu"]
    assert listed["Base"] == []


def test_an_ingredient_can_be_in_no_section_and_is_still_in_the_catalog(conn, section):
    ingredients.create(conn, {"name": "Seaweed"})
    tofu = ingredients.create(conn, {"name": "Tofu", "section_ids": [section("Protein")]})
    ingredients.change(conn, tofu["id"], {"section_ids": []})

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


def test_a_name_is_taken_whatever_its_case(conn, section):
    ingredients.create(conn, {"name": "Salmon", "section_ids": [section("Protein")]})
    rice = ingredients.create(conn, {"name": "Rice", "section_ids": [section("Base")]})

    for attempt in (
        lambda: ingredients.create(conn, {"name": "salmon"}),
        lambda: ingredients.change(conn, rice["id"], {"name": "SALMON"}),
    ):
        with pytest.raises(RuleError) as err:
            attempt()
        assert (err.value.kind, err.value.message) == (
            DUPLICATE,
            "An ingredient with that name already exists.",
        )
    assert names_by_section(conn)["Protein"] == ["Salmon"]
    assert ingredients.get(conn, rice["id"])["name"] == "Rice"


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
        ingredients.create(conn, {"name": "Salmon", "section_ids": [section("Protein")], **fields})

    assert (err.value.kind, err.value.message) == (INVALID, message)


def test_an_ingredient_cannot_go_in_a_listed_category(conn):
    sauce = next(s for s in stations.list_all(conn)[0]["sections"] if s["kind"] == "recipes")

    with pytest.raises(RuleError) as err:
        ingredients.create(conn, {"name": "Salmon", "section_ids": [sauce["id"]]})

    assert (err.value.kind, err.value.message) == (INVALID, "Unknown section.")


def test_changing_only_the_name_keeps_the_sections(conn, section):
    tofu = ingredients.create(
        conn, {"name": "Tofu", "section_ids": [section("Topping"), section("Protein")]}
    )

    changed = ingredients.change(conn, tofu["id"], {"name": "Smoked tofu"})

    assert changed == {
        "id": tofu["id"],
        "name": "Smoked tofu",
        "section_ids": sorted([section("Protein"), section("Topping")]),
    }


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
