# Pookie's Bowls

A shared recipe book for two people: an ingredient catalog, recipes built from those ingredients (and from other recipes, like sauces), and each person's favorites.

## Language

### The catalog

**Ingredient**:
A base item in the catalog, such as salmon or rice. It is never a recipe: a sauce is a recipe, even though it is shown and picked like an ingredient. Its name is unique (see **Same name**). Adding an ingredient never makes a duplicate: a name already in the catalog reuses that ingredient, keeping its name. Adding only ever puts it into more sections; taking it out of one is an edit.
_Avoid_: item (that also covers listed recipes)

**Same name**:
Two names are the same when they differ only in case, accents or extra spaces: *branza* is *Brânză*, *Spring  onion* is *Spring onion*. Ingredient, station and recipe category names are unique this way, and so are section names within a station. The name kept is the one typed first.
_Avoid_: duplicate name, equal name

**Item**:
An ingredient or a recipe, told apart by its type. It is what gets picked, put inside a recipe, and favorited.
_Avoid_: thing, entry

**Favorite**:
One person's 💜 (me) or 💚 (her) on an item. The screen shows it as a heart.
_Avoid_: heart, like

### Stations

**Station**:
A page set up for picking one kind of recipe (🥣 Poke, 🍔 Burger), with its own ordered sections and the recipe category that recipes started there begin in. The ingredient catalog is shared: the same ingredient can show up on several stations, or on none.
_Avoid_: page, board, builder, Ingredients page

**Section**:
One group of rows on a station. It is either an ingredient section or a listed category. Ingredient sections always come first, then listed categories, each kind in its own order.
_Avoid_: category (on its own), group

**Ingredient section**:
A group of ingredients that belongs to one station (Protein, Base… on Poke; Bun, Patty… on Burger). An ingredient can be in several sections, on several stations, or in none.
_Avoid_: ingredient category

**Orphan**:
An ingredient that is in no ingredient section on any station, e.g. after its section or station was deleted. It stays in the catalog: it can still be searched, picked and edited, and the All ingredients page shows it.
_Avoid_: unsorted, uncategorized

**All ingredients page**:
Every ingredient A→Z, with where each one appears, orphans included. Its rows behave like a station's, so they can be picked from too, but it has no sections of its own.
_Avoid_: catalog page, ingredient list

**Listed category**:
A recipe category a station shows as one of its sections (e.g. 🥫 Sauce), so its recipes can be picked there. Each station chooses its own.
_Avoid_: shown category, ingredient-list category

### Building recipes

**Recipe category**:
A group a recipe is in (🥣 Poke bowl, 🥫 Sauce, 🍲 Soup…), with a name and an emoji. They are created, renamed, reordered and deleted from the Recipes page; one can also be created while setting up a station. Their order decides a recipe's emoji (its first category's) and which one a recipe started from the Recipes page begins in (the first). A recipe is in at least one, and can be in several. Its name is unique (see **Same name**).
_Avoid_: recipe type, kind

**Listed recipe**:
A recipe in a listed category (e.g. a sauce), which is why it can be picked into other recipes. Being listed only decides what is shown and offered: a recipe already inside another stays there if it stops being listed.
_Avoid_: sub-recipe category, pickable recipe

**Pick**:
An ingredient or listed recipe (e.g. a sauce) chosen to go into a recipe while picking.
_Avoid_: selection, choice

**Pick session**:
The mode in which tapping rows on a station adds or removes picks, with the tray showing them. It ends with Done (the picks are kept) or Cancel (they are dropped).
_Avoid_: builder, selection mode, building mode

**Draft**:
A new recipe that is being written in the New recipe dialog and has not been saved yet.
_Avoid_: new recipe form, build

**Quantity**:
How much of one item goes into one recipe: an amount (a number, 0 until filled in) and a unit (g, kg, ml, l, tsp, tbsp, cup, pcs, pinch). Every item in every recipe has one, whether or not it is shown. Changing the recipe's categories never clears it.
_Avoid_: amount (on its own), measure

**Shows quantities**:
A recipe category's setting, on unless turned off. A recipe shows its quantities when at least one of its categories shows quantities.
_Avoid_: quantity mode

**Last unit**:
The unit an item starts with when it goes into a recipe: the one last chosen for it in a saved recipe, or g until then. Changing it never changes recipes already saved.
_Avoid_: default unit
