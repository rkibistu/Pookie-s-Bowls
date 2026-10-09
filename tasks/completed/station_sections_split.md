# Ingredient sections and listed categories, apart

Status: done

The Station dialog mixed ingredient sections and listed categories in one ↑/↓ list, and the station page mixed them in any order. Making a recipe category meant going to the Recipes page.

## Decisions

- A station shows its ingredient sections first, then its listed categories, each kind in its own order. The server keeps that order whatever order it's sent.
- The Station dialog has two parts, with a line between them: **Ingredient sections** (rename, ↑/↓, delete, then a row to add one), then **Recipe categories** (the listed ones ticked, with ↑/↓; the others unticked; then a row to make a new one).
- A category made in the Recipe categories part is listed on the station straight away; "New recipes start as" doesn't change.
- "New recipes start as" ends with "＋ New category…". Choosing it opens a new category row under the dropdown (✕ closes it); the category made there is where the station's new recipes start, and it isn't listed.
- No extra dialog. Every emoji box is a square button (🙂 until one is chosen) that opens the emoji picker; typing still works.
- Replaces the earlier inline new-category row (with its automatic "start as" switch).
