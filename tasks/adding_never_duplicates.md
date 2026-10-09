# Adding an ingredient never makes a duplicate

Status: ready-for-agent

Adding an ingredient should reuse one that's already in the catalog (see **Ingredient** in `CONTEXT.md`). Today the ingredient dialog makes that call itself, from the browser's copy of the catalog, and the server only refuses duplicates. That goes wrong in three ways:

1. **Typing vs. picking the suggestion.** Avocado is in Poke → Topping. On Poke, Add ingredient, type `avocado` (without picking the suggestion), tick Base, Save: Avocado is quietly taken out of Topping (`placedSectionIds` drops the station's sections before adding the ticks). Picking the suggestion instead keeps Topping.
2. **The other phone's new ingredient.** Her phone adds Mango; mine hasn't reloaded. I add `mango`: the dialog doesn't find it, creates it, and gets 409 "An ingredient with that name already exists."
3. **The other phone's sections.** Mango is in Poke → Fresh; her phone adds it to Burger → Toppings. I add Mango to Poke → Extras: the dialog sends the full `section_ids` from my stale copy, and Mango silently leaves Burger → Toppings.

The fix: the server decides "new or reuse, and where", in one place, tested in pytest.

## Decisions

### Server (`ingredients.py`)
- **`add` replaces `create`.** It takes a name and the section ids to add it to. It knows nothing about where in the app you're adding from.
- **The same name reuses the ingredient.** "Same" means exactly the unique index's rule (`NOCASE`, after trimming), so the lookup and the guarantee can't disagree. The stored name is kept: adding ` AVOCADO ` to *Avocado* never renames it.
- **Adding only adds.** A reused ingredient keeps every section it's in and gains the given ones. Taking it out of a section is an edit.
- **No sections** creates an orphan, or for an existing ingredient changes nothing.
- **An unknown section** (deleted on the other phone, or a listed category's section) refuses the whole add with "Unknown section." and changes nothing.
- **Both phones add the same name at once:** the insert that loses the unique index looks again and reuses the winner's ingredient. Adding never fails because of a duplicate.
- **It returns** `{ingredient, reused, added_to}`, where `added_to` is the section ids it wasn't in before.
- Renaming (`change`) keeps its duplicate-name error.

### HTTP
- `POST /api/ingredients` calls `add`: **201** when it creates, **200** when it reuses, never 409.

### Catalog (`static/js/catalog.js`)
- A failed save reloads the catalog too, so after "Unknown section." the dialog can be reopened with the real sections.

### Ingredient dialog (`static/js/ingredient-dialog.js`)
- Each way of adding becomes the section ids to send:
  - from a section's ＋: that section
  - from a station's Add ingredient: the ticked sections on that station
  - from All ingredients: the ticked sections on any station (none: an orphan)
- **Picking a suggestion just fills in the name**, everywhere. All ingredients no longer jumps to Edit ingredient.
- **Once it recognises an existing ingredient** (picked, or the typed name matches one ignoring case), the sections it's already in show ticked and greyed out. Recognising is for display only; the server makes the real call.
- The toast comes from `added_to`: *"Avocado was already in the catalog, added to Base"*, or *"Avocado is already in the catalog"* when `added_to` is empty. Section names are formatted as today ("Protein" on a station, "Poke · Protein" on All ingredients).
- `existingIngredient`, `placedSectionIds` and the section merging go away.

## Tests

pytest, through `ingredients.add` on the in-memory database:

1. A new name creates the ingredient in the given sections: `reused: false`, `added_to` = those sections.
2. ` AVOCADO ` for an existing *Avocado* reuses it and keeps the name *Avocado*.
3. Example 1: Avocado in Topping, add it to Base → in Topping **and** Base.
4. Example 3: Mango in Poke → Fresh and Burger → Toppings, add it to Extras → in all three.
5. Adding to a section it's already in: `reused: true`, `added_to` empty.
6. No sections: a new name becomes an orphan; an existing ingredient is unchanged.
7. An unknown section, or a listed category's section: refused with "Unknown section.", nothing changed.
8. The race: a name inserted between the lookup and the insert is reused, with no error.
9. HTTP: a new name returns 201, a reused one 200 (this replaces the 409 test in `tests/test_http.py`).

The conftest fixtures and other tests that call `ingredients.create` switch to `add`.

`tests/js/catalog.test.js`: after a failed save, the catalog reloads.

## Out of scope

- The Edit ingredient dialog still sends the full section list: `tasks/edit_ingredient_sends_changes_only.md`.
- Ignoring case for accented letters: `tasks/unicode_names_ignoring_case.md`.
