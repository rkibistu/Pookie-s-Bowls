# 01 — Manage recipe categories from the Recipes page

Status: ready-for-agent

Spec: `../spec.md`

## What to build

A "🏷️ Categories" button on the Recipes page (next to the filter) opens a Categories dialog. It lists every recipe category in order, and lets you:

- **Create** a category from a name and an emoji (both required). It goes to the end of the order and starts unlisted.
- **Rename** a category, changing its name and/or emoji in place.
- **Reorder** with ↑/↓ on each row (no ↑ on the first row, no ↓ on the last).
- **Delete** a category:
  - Recipes also in another category just lose this one.
  - If any recipe would be left with no category, the delete is refused and the error names those recipes.
  - The last remaining category can't be deleted.
  - Deleting a listed category also takes it off the Ingredients page. Recipes already inside other recipes stay there.

The recipe category order drives the order of the chips (New recipe, recipe filter), the order of badges on a recipe card, a recipe's emoji (its first category's), and the category a new recipe starts in (the first one).

## Notes

- Rules go in a module alongside `recipes.py` / `ingredients.py` (e.g. `recipe_categories.py`). Routes in `app.py` only speak HTTP, and errors are `RuleError`.
- Names are unique ignoring case; reject a blank name or a blank emoji.
- Drop `slug` from `recipe_categories`. `defaultCategoryIds()` in `static/js/recipe-categories.js` becomes "the first category". Update the tests that look categories up by slug (`tests/test_http.py`, `tests/test_recipes.py`, `tests/js/catalog.test.js`).
- `db.set_up` seeds recipe categories only when the table is empty.
- `catalog.js` loads recipe categories once ("fixed on the server"). After an edit, it must reload them, along with the lists that show them (recipes, the Ingredients page sections).
- Keep `in_ingredient_list` working as-is in this ticket. Ticket 02 replaces it.

## Acceptance

- [ ] Create, rename (name + emoji), reorder and delete work from the Categories dialog, and the changes show up right away in the chips, badges and recipe emoji.
- [ ] A duplicate name (ignoring case), a blank name or a blank emoji is refused with a clear message.
- [ ] Deleting a category that would leave a recipe with no category is refused, and the message names the recipes. Deleting the last category is refused.
- [ ] A new recipe starts in whichever category is first.
- [ ] Restarting the app does not bring back a deleted seed category.
- [ ] Python rule tests cover create / rename / reorder / delete and the refusals.
