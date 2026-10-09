# Pookie's Bowls

A shared recipe book for two people: an ingredient catalog, recipes built from those ingredients (and from other recipes, like sauces), and each person's favorites.

## Language

### The catalog

**Ingredient**:
A base item in the catalog, such as salmon or rice. It is never a recipe: a sauce is a recipe, even though it is shown and picked like an ingredient. Its name is unique ignoring case.
_Avoid_: item (that also covers listed recipes)

**Ingredient category**:
One of the fixed groups an ingredient is shown in on the Ingredients page (Protein, Base…). An ingredient is in at least one, and can be in several.
_Avoid_: section, kind

**Item**:
An ingredient or a recipe, told apart by its type. It is what gets picked, put inside a recipe, and favorited.
_Avoid_: thing, entry

**Favorite**:
One person's 💜 (me) or 💚 (her) on an item. The screen shows it as a heart.
_Avoid_: heart, like

### Building recipes

**Recipe category**:
A group a recipe is in (🥣 Poke bowl, 🥫 Sauce, 🍲 Soup…), with a name and an emoji. They are created, renamed, reordered and deleted from the Recipes page. Their order decides a recipe's emoji (its first category's) and which one a new recipe starts in (the first). A recipe is in at least one, and can be in several. Its name is unique ignoring case.
_Avoid_: recipe type, kind

**Listed category**:
A recipe category the Ingredients page shows as a section after the ingredient categories. Which recipe categories are listed, and in what order, is chosen on the Ingredients page itself. That order is separate from the recipe category order.
_Avoid_: shown category, ingredient-list category

**Listed recipe**:
A recipe in a listed category (e.g. a sauce), which is why it can be picked into other recipes. Being listed only decides what is shown and offered: a recipe already inside another stays there if it stops being listed.
_Avoid_: sub-recipe category, pickable recipe

**Pick**:
An ingredient or listed recipe (e.g. a sauce) chosen to go into a recipe while picking.
_Avoid_: selection, choice

**Pick session**:
The mode in which tapping rows on the Ingredients page adds or removes picks, with the tray showing them. It ends with Done (the picks are kept) or Cancel (they are dropped).
_Avoid_: builder, selection mode, building mode

**Draft**:
A new recipe that is being written in the New recipe dialog and has not been saved yet.
_Avoid_: new recipe form, build
