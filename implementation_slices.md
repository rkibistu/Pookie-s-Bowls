# Pookie's Bowls — Implementation Plan

A simple app to manage salads and poke bowls, for two people on a shared home
network.

## Tech stack
- **Backend:** Python + Flask (lightweight; `sqlite3` is in the standard library).
- **Database:** SQLite (single file, trivial to back up).
- **Frontend:** plain HTML + CSS + vanilla JS, served by Flask. No build step, no framework.
- **Identity:** no login. A "Who are you?" toggle (You / Her) remembered per device in
  `localStorage`. Selecting one switches the color theme and tags which person's
  love/like/hate is being set.
- **Hosting:** runs on an always-on laptop on the local network; both phones reach it at
  `http://<laptop-ip>:5000`. Started manually (`python app.py`).

## Data model
- **`ingredients`** — base ingredients only (salmon, rice, cucumber…). No sauces here.
- **`categories`** — protein, base, fresh veg/fruit, cooked veg/fruit, topping, extras.
  ("Sauces" is a UI section, not backed by this table.)
- **`ingredient_categories`** — many-to-many (an ingredient can be in several categories).
- **`recipes`** — all recipes, with a `kind` column:
  - `bowl` — manually built from ingredients + sauces, with notes
  - `link` — an external URL + notes
  - `sauce` — built from ingredients (+ notes on how to make it); also appears in the
    ingredient list
- **`recipe_components`** — contents of a recipe. Each row points to *either* an ingredient
  *or* a sauce (two nullable foreign keys). Lets a bowl contain ingredients and sauces, and
  a sauce contain its ingredients.
- **`preferences`** — person (me/her) + state (love/like/hate), pointing to *either* an
  ingredient *or* a sauce (same two-nullable-FK pattern).

### Key design decisions
- A sauce is **not** an ingredient in the DB — it is a recipe. It is *displayed* in the
  ingredient list because, conceptually, it is a building block for a bowl.
- Sauces appear in **both** the ingredient list and the Recipes page.
- Love/like/hate applies to both ingredients and sauces.
- The full SQLite schema (including the two-nullable-FK pattern) is created up front so later
  slices add features without reworking tables.

---

## Slices

Each slice is a full backend-to-frontend path that can be opened in the browser and fully
exercised before moving on. Build in order 0 → 6.

### Slice 0 — Skeleton & Identity
**Goal:** a running Flask app, openable on both phones, with the "who am I" identity + theme.
- **Backend:** Flask app serving static HTML/CSS/JS; creates the empty SQLite DB with the
  full schema on first run; seeds the fixed categories.
- **Frontend:** app shell with nav (Ingredients / Recipes), a "Who are you?" toggle
  (You / Her) saved in `localStorage`, and a color theme that switches with the selection.
- **Test from frontend:** open `http://<laptop-ip>:5000`, toggle identity → whole UI
  recolors; reload → remembers who you are; reachable from both phones.

### Slice 1 — Ingredient catalog
**Goal:** add ingredients and see them grouped by category.
- **Backend:** `ingredients`, `categories`, `ingredient_categories` tables; endpoints to list
  (grouped), create, edit, delete an ingredient with its categories.
- **Frontend:** Ingredients page rendering each category section with its ingredients;
  add/edit form with multi-category select; delete.
- **Test from frontend:** add "Salmon" as protein, "Avocado" as fresh + topping → appears
  under both sections; edit/delete works; reload persists.

### Slice 2 — Preferences (love / like / hate)
**Goal:** mark each person's feelings on an ingredient.
- **Backend:** `preferences` table (person, state, ingredient-or-sauce FK); set/clear
  endpoints.
- **Frontend:** two icon sets per entry (you + her), 3 states each; tapping sets the state
  for the *current* identity; visual styling tied to the theme.
- **Test from frontend:** as You, set Salmon = love; switch to Her, set Salmon = hate;
  reload → both persist and display correctly.

### Slice 3 — Create Bowl
**Goal:** build and save a manual recipe by selecting ingredients.
- **Backend:** `recipes` (kind=`bowl`) + `recipe_components` + notes; create endpoint.
- **Frontend:** "Create Bowl" button → selection mode; always-visible floating box showing
  current picks with deselect, plus Cancel / Create; Create asks for name + notes.
- **Test from frontend:** enter mode, select several ingredients while scrolling, deselect one
  from the box, Create with a name → recipe saved; Cancel clears everything.

### Slice 4 — Recipes page
**Goal:** see and read all recipes; add external-link recipes.
- **Backend:** list recipes, create a `link` recipe (URL + notes), get recipe detail.
- **Frontend:** Recipes page listing bowls + links; "Add link recipe" form; open a manual
  recipe to view its ingredients + notes.
- **Test from frontend:** the bowl from Slice 3 shows here; add a link recipe with a URL;
  open each and read details.

### Slice 5 — Sauces
**Goal:** sauces as recipes that also live in the ingredient list.
- **Backend:** `recipes` (kind=`sauce`); reuse components/preferences FKs.
- **Frontend:** "Sauces" section in the Ingredients page populated from sauce recipes;
  create/edit a sauce (ingredients + notes); sauces are selectable into bowls and support
  love/like/hate; sauces also appear on the Recipes page.
- **Test from frontend:** create a "Spicy Mayo" sauce, see it in the Sauces section, favorite
  it, include it in a bowl, and read its recipe from the Recipes page.

### Slice 6 — Recipe filtering
**Goal:** find recipes by ingredient.
- **Backend:** filter query over `recipe_components`.
- **Frontend:** ingredient filter on the Recipes page ("show all with salmon"), supporting
  one or more ingredients.
- **Test from frontend:** filter by Salmon → only matching recipes show; clear → all return.
