# Quantities in recipes

Status: done

The app started with poke bowls only, where amounts didn't matter. Many recipes now need them.

## Decisions

- The database is recreated (no data kept).
- Every item in every recipe has a **quantity**: an amount (0 or more, decimals allowed, 0 until filled in) and a unit from g, kg, ml, l, tsp, tbsp, cup, pcs, pinch. Ingredients and recipes inside recipes (sauces) alike.
- Each ingredient and recipe has a **last unit**, g until one is chosen. It becomes the unit of a row that's new in a saved recipe, or whose unit changed in a saved recipe. Re-saving without touching the row, a cancelled Draft, or removing the item doesn't count. Changing it never changes saved recipes. No place to set it by hand.
- Removing an item from a recipe drops its quantity; added back, it starts at 0 with its last unit.
- Each recipe category **shows quantities** (on by default, including ones made from the Station dialog). A ⚖️ button per row in the Recipe categories dialog switches it, with a one-line hint; it's nowhere else. A recipe shows quantities when at least one of its categories does. Changing categories never clears quantities.
- The pick session tray shows no quantities. The New recipe dialog and the recipe dialog show a small amount (– for 0) and unit at the right of each row, plain text like the notes until tapped, when the ticked categories show quantities. Always editable: a number saves on leaving the box or Enter, a unit when chosen. In ✏️ Edit the ✕ comes after the unit. Long names wrap on a phone.
- Recipe cards on the Recipes page don't show quantities.
