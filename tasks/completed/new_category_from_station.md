# Create a recipe category while setting up a station

Status: done

Setting up a station for a new kind of recipe (🍔 Burger) means leaving it, adding the category on the Recipes page, and coming back.

## Decisions

- The Station dialog's Sections list ends with a "＋ New category" row (emoji + name + Add), like the one in the Recipe categories dialog.
- The new category is not ticked as a listed category.
- If the station's "New recipes start as" is still "The first recipe category", it switches to the new category; a category already chosen stays.
