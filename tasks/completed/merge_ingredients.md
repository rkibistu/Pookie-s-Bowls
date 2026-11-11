# Merge an ingredient into another by renaming it

Status: done

Ingredient names can be in any language, so the same food often ends up twice (*Onion* in one recipe, *Ceapă* in another). That's fine until it isn't: then the two should become one. Today renaming *Ceapă* to *Onion* is refused ("An ingredient with that name already exists."), and the only way out is to fix every recipe by hand. Instead, that rename becomes a **Merge** (see `CONTEXT.md`).

## Decisions

### Starting it

- **Renaming to a taken name, in the ingredient dialog, is how a merge starts.** No separate "Merge into…" button.
- A rename to the **Same name** of itself (*Ceapă* → `ceapa`) is just a rename, never a merge.
- **Ingredients only.** Recipes never merge (their names aren't unique anyway).

### The question

- **One dialog that asks and shows the consequences, then nothing else.** It must always be asked; a merge never happens without it:

  > *Onion* already exists. Merge *Ceapă* into *Onion*?
  > *Ceapă* is used in 4 recipes and 1 section; they'll all use *Onion*, and *Ceapă* will be gone.

  Buttons: **Merge Ceapă into Onion** and **Cancel**, never a bare "OK". If *Ceapă* is used nowhere: "*Ceapă* isn't used anywhere." Counts only, no lists of recipes or sections.
- **Nothing to choose in it:** no sections, no options. It's a yes or no.
- **Cancel saves nothing**, the rename included, and goes back to the ingredient dialog with the edits still in it.
- It can't be undone, so its wording says so plainly ("*Ceapă* will be gone").

### The result: as if *Ceapă* had always been *Onion*

- **Recipes:** every recipe row with *Ceapă* now has *Onion*, in the same position, with the same quantity and unit.
- **A recipe that had both** keeps *Onion*'s row; *Ceapă*'s is dropped. No adding up, no special warning: a rare mistake, and losing that row is acceptable.
- **Sections:** *Onion* is in every section either was in. Section ticks changed in the same ingredient-dialog Save count as *Ceapă*'s, so they end up on *Onion* too (they are applied, then the merge); a merge only ever adds sections to *Onion*.
- **Favorites:** a 💜 or 💚 on either ends up on *Onion* (one per person, as always).
- **Name and last unit:** *Onion*'s, as stored. Typing `onion` merges into *Onion*, spelled as it was.
- ***Ceapă* is deleted.**
- All in one transaction on the server: a failure leaves both ingredients as they were.

### Shape (suggested, not binding)

- The PATCH that renames already fails with `DUPLICATE` (`ingredients.py`, `_duplicate_name`). Have that response also say which ingredient holds the name (id and name), so the browser can ask the question.
- The counts come from what the browser already has (the catalog's recipes and sections), the way `static/js/delete-warnings.js` builds delete warnings.
- Confirming sends the dialog's changes plus the merge to the server in one request, e.g. `POST /api/ingredients/<id>/merge` with `{"into": <other id>, "add_section_ids", "remove_section_ids"}`, returning the surviving ingredient. The catalog in the browser is refreshed after.

## Tests

- Python: merging *Ceapă* into *Onion* moves its recipe rows (position, quantity, unit kept), sections and favorites to *Onion*, and deletes *Ceapă*.
- Python: a recipe with both keeps *Onion*'s row only, with *Onion*'s quantity.
- Python: a favorite on both by the same person ends up as one favorite.
- Python: *Onion*'s name and last unit are unchanged.
- Python: section changes sent with the merge are applied before it.
- Python: renaming *Ceapă* to `ceapa` is a plain rename.
- Python: a merge that fails halfway leaves both ingredients as they were.
- JS: the question's wording: counts of recipes and sections, singular/plural, and "isn't used anywhere".
- JS: Cancel leaves the ingredient unsaved, the dialog open with its edits.
