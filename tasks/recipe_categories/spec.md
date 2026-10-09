# Editable recipe categories

Status: ready-for-agent

Recipe categories (🥣 Poke bowl, 🥫 Sauce, 🍲 Soup…) are fixed today: seeded on startup, with the default for a new recipe hardcoded to the `bowl` slug and the "shown on the Ingredients page" flag (`in_ingredient_list`) set in the seed. We want to manage them from the app.

Terms are in `CONTEXT.md`: **Recipe category**, **Listed category**, **Listed recipe**.

## Split of responsibility

- **The Recipes page** manages the recipe categories themselves: create, rename (name and emoji), reorder, delete. Their order decides the chips, the badges, a recipe's emoji (its first category's) and the category a new recipe starts in (the first).
- **The Ingredients page** decides which recipe categories it lists and in what order. That order is separate from the recipe category order.

## Decisions

- Name and emoji are both required. The emoji is typed from the phone's emoji keyboard; there's no picker. Names are unique ignoring case.
- Reordering uses ↑/↓ buttons on each row. There's no drag.
- Delete is blocked only when a recipe would be left with no category, and the error names those recipes. Recipes that are also in another category just lose this one. The last remaining recipe category can never be deleted.
- A new recipe starts in the first recipe category in the order. The `bowl` slug default goes away, and slugs are dropped from recipe categories entirely (ingredient categories keep theirs).
- Seed recipe categories are added only when the table is empty (a fresh DB), so a deleted seed category stays deleted.
- A new recipe category starts unlisted. Listing a category puts it at the end of the listed sections, and unlisting forgets its position.
- Listed sections always come after the ingredient categories on the Ingredients page.
- Unlisting or deleting a category never removes a recipe from the recipes that already contain it.
- No migration: change the schema and recreate the DB.

## Out of scope

- Editing ingredient categories (Protein, Base…). That comes with a later ingredients-page redesign.
- Mixing listed sections in among the ingredient categories.

## Tickets

- `issues/01-manage_recipe_categories.md`: the Recipes page Categories dialog
- `issues/02-ingredients_page_sections.md`: choose and order listed categories on the Ingredients page
