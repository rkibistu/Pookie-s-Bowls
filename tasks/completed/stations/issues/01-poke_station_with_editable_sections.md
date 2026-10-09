# 01 — The Poke station, with sections you can edit

Status: ready-for-agent

Spec: `../spec.md`

## What to build

Replace the fixed ingredient categories with **stations** and **sections**, with exactly one station for now: the seeded 🥣 Poke. The Ingredients page becomes that station: the nav button shows the station's emoji and name.

**✏️ Station** replaces ✏️ Sections and edits the current station:
- its **name and emoji**
- **the recipe category its new recipes start in** (a select; "First recipe category" when unset)
- **its sections in one ↑/↓ list**, mixing both kinds:
  - **ingredient sections**: "+ Add section" (name), rename in place, delete with a two-tap 🗑. Deleting never asks about the ingredients in it; they just lose that section.
  - **recipe categories**: every one is shown, with a checkbox to list or unlist it. A newly ticked one goes to the end; an unticked one forgets its place. Ingredient sections and listed categories can be in any order relative to each other.

There is no delete-station button yet (ticket 02).

**The ingredient dialog** shows the station's ingredient sections as chips, grouped under a station heading, so ticket 02 can add more groups. Ticking none is allowed: the ingredient becomes an orphan.

A **New recipe** started from the station begins in the station's recipe category, or the first recipe category if it has none.

## Notes

- Suggested schema; adjust if something reads better:
  - `stations (id, name UNIQUE NOCASE, emoji, position, recipe_category_id NULL → recipe_categories ON DELETE SET NULL)`
  - `sections (id, station_id → stations ON DELETE CASCADE, position, name NULL, recipe_category_id NULL → recipe_categories ON DELETE CASCADE)`, with exactly one of `name` / `recipe_category_id` set, a section name unique per station ignoring case, and a recipe category listed at most once per station.
  - `section_ingredients (section_id, ingredient_id)`, cascading on both.
  - Drop `categories`, `ingredient_categories` and `recipe_categories.listed_position`. Recreate the DB.
- Move the "which categories are listed" rule (`recipe_categories.set_listed`) and `recipes.listed_sections` to wherever station rules live (e.g. `stations.py`), along with the old Sections dialog (`static/js/sections-dialog.js`). Rules raise `RuleError`, and `app.py` only speaks HTTP.
- `ingredients.py` loses the "at least one category" rule. An ingredient's placement is its section ids.
- The catalog (`static/js/catalog.js`) needs **every ingredient**, orphans included, for type-ahead search, as well as the station's sections with their rows. `catalog.items()` = every ingredient + every listed recipe.
- Update `CONTEXT.md` only if a term turns out wrong.

## Acceptance

- [ ] A fresh DB shows 🥣 Poke with Protein, Base, Fresh…, Cooked…, Topping, Extras, then 🥫 Sauce.
- [ ] In ✏️ Station you can rename the station, change its emoji, and choose its new-recipe category, and the nav and New recipe follow.
- [ ] Ingredient sections can be added, renamed, deleted and moved ↑/↓ among the listed categories (e.g. Sauce between Base and Topping), and the page follows.
- [ ] A duplicate section name on the same station (ignoring case) is refused with a clear message.
- [ ] Deleting a section whose ingredients are in no other section works, and those ingredients remain in the catalog and type-ahead search.
- [ ] Ticking or unticking a recipe category lists or unlists it, as before.
- [ ] Python rule tests cover station edits, the section rules, and orphaned ingredients. The JS catalog tests are updated.
