# Add a brand-new ingredient while writing a recipe

Status: ready-for-agent

Blocked by: `tasks/capitalised_names.md` (the ➕ row shows the capitalised name)

The catalog should grow from the recipes, not be filled in up front. Today a recipe's add box (`+ Add ingredient…`) only finds what is already in the catalog; when nothing matches it says "No match" and that's a dead end: the ingredient has to be created elsewhere first, then picked. Instead, an ingredient that isn't in the catalog yet can be added right from the recipe: it goes into the catalog and into the recipe.

## Decisions

### Where and when the ➕ row is offered

- **In both add boxes:** the New recipe dialog's (`build-add-input`, `static/js/new-recipe.js`) and an existing recipe's edit mode (`recipe-add-input`, `static/js/recipe-dialog.js`). Not in the recipe filter on the Recipes page, nor in the ingredient dialog's suggestions.
- **Shown as the last row of the suggestions:** **➕ Add "Tofu" as a new ingredient**, with the name as it will be saved (first letter capitalised, see `tasks/capitalised_names.md`). It replaces "No match" in those two boxes.
- **Shown whenever no item has the same name** (Same name, `CONTEXT.md`), even when other items partly match: typing `Salmon` offers *Smoked salmon* and ➕ Add "Salmon". When an item with the same name exists (`tofu` while *Tofu* is in the catalog) only that item is offered, no ➕ row. Same for a name already in this recipe, whether existing or new: nothing is offered.
- **Enter picks the first row**, as now; when nothing else matches that's the ➕ row.
- **Ingredients only.** It never makes a recipe; a sauce recipe is still created as its own recipe.

### New recipe (the Draft)

- **Created on Save, not before.** The new ingredient joins the Draft as a pick with no id, just its name, quantity and unit (starts at 0 g like any first use). Saving the Draft creates it and the recipe together; Cancel leaves nothing behind in the catalog.
- **A small "new" tag** on its row in the Draft, until saved, so a typo (*Tomatoe*) can be caught before it lands in the catalog. ✕ removes it like any pick; quantities work as for any pick.
- **It survives "Pick from list".** It can't appear on a station's rows (it's not in the catalog), but it stays in the tray with the other picks and comes back to the Draft on Done. Today `pickSession` and `draftPicks` key picks by `type:id`, so a pick without an id would be dropped or collide; key new picks by their name key instead.
- Two new picks with the same name in one Draft count once.

### Existing recipe (edit mode)

- Edit mode saves every change at once, so the new ingredient is created right away, together with the recipe's new ingredient list, in the same save.

### On the server

- **One save creates both.** A component may be `{"type": "ingredient", "name": "Tofu", "quantity", "unit"}` with no `id`: a new ingredient. `recipes.create` and `recipes.change` add it to the catalog in the same transaction as the recipe (via the same path as `ingredients.add`, so the name is capitalised and Same name applies). A failed save leaves neither the recipe nor the ingredient.
- **No sections.** The new ingredient is an orphan; it's sorted into sections later from the All ingredients page or a station, if ever (most recipes have no station).
- **A name taken meanwhile is reused, silently.** If someone added *Tofu* between typing and saving, the recipe uses that one, no error ("adding never makes a duplicate"). A new component whose name matches an id component in the same list counts once.
- The catalog in the browser is refreshed after the save, so the new ingredient is findable at once.

## Tests

- Python: creating a recipe with `{"type": "ingredient", "name": "tofu"}` creates *Tofu* (no sections) and puts it in the recipe with its quantity and unit.
- Python: the same through a recipe change (edit mode).
- Python: a new name that already exists (`tofu` while *Tofu* is there, or `Ștevie`/`stevie`) reuses it, no duplicate, no error.
- Python: a save that fails (e.g. no category) creates no ingredient.
- Python: two new components with the same name, or a new one matching an id component, end up as one row.
- JS: the ➕ row is offered when nothing has the same name (with or without partial matches), not when an item or a pick in the recipe has the same name; it shows the capitalised name.
- JS: a new pick keeps its place in the Draft through a pick session.
