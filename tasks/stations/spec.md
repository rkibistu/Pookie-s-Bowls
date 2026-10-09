# Stations

Status: ready-for-agent

Today the Ingredients page is built for poke bowls: fixed ingredient categories (Protein, Base…) followed by the listed recipe categories (🥫 Sauce). We want several such pages, one per kind of recipe (🥣 Poke, 🍔 Burger, 🍕 Pizza…). Each page, a **station**, is configured on its own, and the ingredient catalog is shared between them.

Terms are in `CONTEXT.md`: **Station**, **Section**, **Ingredient section**, **Listed category**, **Orphan**, **All ingredients page**. **Ingredient category** is gone.

## Decisions

### The model
- **The ingredient catalog is shared.** Salmon is one ingredient, with one name and one set of favorites, and it can be in sections on several stations or on none.
- **A station** has a name (unique ignoring case), an emoji, an ordered list of **sections**, and optionally the **recipe category its new recipes start in**. If it has none, or that category was deleted, new recipes start in the first recipe category.
- **A section** is one of two kinds, and both kinds share one order on the station:
  - an **ingredient section**, which belongs to that station alone. It has a name only, no emoji, unique within the station ignoring case. You put ingredients into it.
  - a **listed category**: a recipe category shown on that station. Its recipes show up as rows and can be picked. Each station lists its own.
- **No "at least one" rule.** An ingredient can be in no section anywhere (an **orphan**). Deleting a section or a station is never refused because of its ingredients; they just lose those sections.
- Deleting a recipe category removes it from every station that listed it. A recipe already inside another recipe stays there, as before.
- The last station can't be deleted.
- Stations are listed in creation order. Reordering stations is out of scope.

### Screens
- **Nav:** one button per station, then 📖 Recipes, then 🧺 All ingredients, which is always last. The row scrolls sideways if it overflows. The app remembers the last station you used.
- **On a station:**
  - **✏️ Station** (it replaces ✏️ Sections) opens a dialog for the station you're on:
    - its name and emoji
    - the recipe category its new recipes start in
    - its sections, in one ↑/↓ list:
      - ingredient sections: add, rename, delete
      - recipe categories: tick to list or untick to unlist, as in the Sections dialog today
    - deleting the station
  - **＋ New station** is the very last button in the nav, after 🧺 All ingredients. A new station starts with no sections.
- **Adding ingredients:**
  - The toolbar's **+ Add ingredient** button stays. Typing suggests existing ingredients, as the recipe dialog's "+ Add ingredient…" box does, and you tick which of this station's ingredient sections it goes in (none is allowed).
  - Each ingredient section's header gets a **"+"** that does the same, straight into that section.
  - Choosing an existing ingredient adds it to the section(s); it is never duplicated. Typing a name that already exists (ignoring case) and confirming does the same. A new name creates the ingredient.
- **The ingredient dialog** (✏️ on a row) shows section chips grouped by station, with the current station first, so you can see and change where the ingredient appears everywhere.
- **The All ingredients page** lists every ingredient A→Z, each tagged with where it appears ("Poke · Protein", "Sushi · Fish") or "on no station". An "Only orphans" toggle narrows the list. Rows work like station rows: ✏️ edit, favorites, and picking during a pick session. Its **+ Add ingredient** uses the same type-ahead and creates the ingredient with no sections.
- **Pick sessions:**
  - Station buttons and All ingredients stay visible while picking; Recipes stays hidden.
  - Switching between them keeps the picks.
  - "Pick from list…" opens the last station you used.
  - New recipe from a station starts in that station's recipe category.
- **Type-ahead search** (recipe dialog, New recipe dialog, recipe filter) covers every ingredient, orphans included, plus every recipe listed on any station, whichever station you're on.

### Starting point
- A fresh DB seeds one station, **🥣 Poke**, with these ingredient sections in order: *Protein, Base, Fresh Vegetables / Fruits, Cooked Vegetables / Fruits, Topping, Extras*. Then *🥫 Sauce* is listed, and new recipes go into *Poke bowl*. The seeds go only into an empty DB.
- No migration: change `schema.sql` and recreate the DB.

## Tickets

1. `issues/01-poke_station_with_editable_sections.md`: the model, with the one seeded station whose sections can be edited
2. `issues/02-many_stations.md`: create, switch, and delete stations; picking across them (blocked by 01)
3. `issues/03-all_ingredients_page.md`: the All ingredients page and orphans (blocked by 01)
4. `issues/04-add_ingredient_type_ahead.md`: type-ahead add that reuses existing ingredients, from the toolbar and each section's "+" (blocked by 01)
