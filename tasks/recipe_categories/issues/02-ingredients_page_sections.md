# 02 — Choose and order the listed categories on the Ingredients page

Status: ready-for-agent

Blocked by: 01

Spec: `../spec.md`

## What to build

A "✏️ Sections" button in the Ingredients page header opens a dialog that lists every recipe category:

- A checkbox on each one decides whether it is **listed**, i.e. shown as a section on the Ingredients page. Its recipes can then be picked into other recipes.
- The listed ones get ↑/↓ to set their order on the Ingredients page.
- Ticking a category puts it at the end of the listed sections. Unticking it forgets its position.

The button is hidden during a pick session.

Listed sections always come after the ingredient categories, and their order here is separate from the recipe category order set on the Recipes page. Recipe categories created on the Recipes page start unlisted.

## Notes

- Replace `in_ingredient_list` with a nullable listed position on `recipe_categories` (NULL = not listed). `recipes.listed_sections` orders by it. Recreate the DB; no migration.
- The seed lists only Sauce.
- The Recipes page Categories dialog (ticket 01) does not show or change whether a category is listed.
- Unlisting never removes a recipe from recipes that already contain it (see **Listed recipe** in `CONTEXT.md`).
- After a change, reload the Ingredients page lists through the catalog.

## Acceptance

- [ ] Ticking or unticking a category shows or hides its section on the Ingredients page right away.
- [ ] ↑/↓ reorders the listed sections, and they stay after the ingredient categories.
- [ ] A newly listed category lands at the end; one that is unlisted and listed again also lands at the end.
- [ ] Reordering recipe categories on the Recipes page doesn't change the Ingredients page order, and the other way round.
- [ ] The Sections button isn't available during a pick session.
- [ ] Python rule tests cover list / unlist / reorder.
