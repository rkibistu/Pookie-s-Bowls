# Pookie's Bowls — Implementation Plan

A simple app to manage salads and poke bowls, for two people on a shared home
network.

## Tech stack
- **Backend:** Python + Flask (lightweight; `sqlite3` is in the standard library).
- **Database:** SQLite (single file, trivial to back up).
- **Frontend:** plain HTML + CSS + vanilla JS, served by Flask. No build step, no framework.
- **Containerized:** everything runs in Docker — nothing installed on the host beyond Docker
  itself. A `Dockerfile` builds the Flask app image; `docker compose up` starts it. The SQLite
  file lives on a mounted volume so data survives container rebuilds/restarts.
- **Identity:** no login. A "Who are you?" toggle (You / Her) remembered per device in
  `localStorage`. Selecting one switches the color theme and decides whose
  favorite heart (💜 me / 💚 her) is being set.
- **Hosting:** runs on an always-on laptop on the local network; both phones reach it at
  `http://<laptop-ip>:5000`. Started with `docker compose up` (optionally `-d`).

## Data model
- **`ingredients`** — base ingredients only (salmon, rice, cucumber…). No sauces here.
- **`categories`** — ingredient categories: protein, base, fresh veg/fruit, cooked veg/fruit,
  topping, extras.
- **`ingredient_categories`** — many-to-many (an ingredient can be in several categories).
- **`recipes`** — all recipes. `kind` says where a recipe comes from:
  - `manual` — built from components (ingredients and/or other recipes), with notes
  - `link` — an external URL + notes
- **`recipe_categories`** — what a recipe *is*: Poke bowl, Sauce, Soup… Each has an
  `in_ingredient_list` flag: recipes in a flagged category (e.g. Sauce) are shown in the
  ingredient list and can be picked into other recipes.
- **`recipe_category_links`** — many-to-many (a recipe can be in several categories, e.g.
  Soup + a future "Freezer-friendly").
- **`recipe_components`** — contents of a recipe, in pick order. Each row points to *either*
  an ingredient *or* another recipe (two nullable foreign keys), so a bowl can contain a
  sauce and a soup can contain a stock.
- **`favorites`** — person (me/her), pointing to *either* an ingredient *or* a recipe (same
  two-nullable-FK pattern). A row exists only while the item is favorited.

### Key design decisions
- A sauce is **not** an ingredient in the DB — it is a recipe in the Sauce category. It is
  *displayed* in the ingredient list because that category is flagged `in_ingredient_list`.
- Any recipe can contain other recipes; the backend rejects loops (a recipe inside itself,
  directly or through other recipes).
- New recipe categories are added by seeding a row in `db.py`.
- While the project is early, schema changes edit `schema.sql` directly and the DB is
  recreated (no migrations).

---

## Slices

Each slice is a full backend-to-frontend path that can be opened in the browser and fully
exercised before moving on. Build in order 0 → 6.

### Slice 0 — Skeleton, Docker & Identity
**Goal:** a containerized Flask app, started with one command and openable on both phones,
with the "who am I" identity + theme.
- **Infra:** `Dockerfile` (Python base image, installs Flask from `requirements.txt`, runs the
  app) and `docker-compose.yml` (maps port 5000, mounts a volume for the SQLite file so data
  persists). `docker compose up` is the only command needed; nothing else installed on the host.
- **Backend:** Flask app serving static HTML/CSS/JS; creates the empty SQLite DB with the
  full schema on first run; seeds the fixed categories.
- **Frontend:** app shell with nav (Ingredients / Recipes), a "Who are you?" toggle
  (You / Her) saved in `localStorage`, and a color theme that switches with the selection.
- **Test from frontend:** run `docker compose up`, open `http://<laptop-ip>:5000`, toggle
  identity → whole UI recolors; reload → remembers who you are; reachable from both phones;
  stop/rebuild the container → data is still there.

### Slice 1 — Ingredient catalog
**Goal:** add ingredients and see them grouped by category.
- **Backend:** `ingredients`, `categories`, `ingredient_categories` tables; endpoints to list
  (grouped), create, edit, delete an ingredient with its categories.
- **Frontend:** Ingredients page rendering each category section with its ingredients;
  add/edit form with multi-category select; delete.
- **Test from frontend:** add "Salmon" as protein, "Avocado" as fresh + topping → appears
  under both sections; edit/delete works; reload persists.

### Slice 2 — Favorites (💜 me / 💚 her)
**Goal:** each person can mark ingredients as a favorite.
- **Backend:** `favorites` table (person, ingredient-or-sauce FK); add/remove endpoints.
- **Frontend:** no icons by default; a heart (💜 me, 💚 her) appears next to the name only
  once that person favorites it. A toggle next to the edit button adds/removes the
  *current* identity's heart — shown on hover with a mouse. On phones there is no toggle:
  double-tap the ingredient instead.
- **Test from frontend:** as You, favorite Salmon → 💜 appears; switch to Her, favorite it →
  💚 appears too; reload → both persist; remove yours → only 💚 remains.

### Slice 3 — Create Bowl
**Goal:** build and save a manual recipe by selecting ingredients.
- **Backend:** `recipes` + `recipe_components` + notes; create endpoint.
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

### Slice 5 — Recipe categories & recipes inside recipes
**Goal:** recipes get categories (Poke bowl, Sauce, Soup); any recipe can contain other
recipes; sauces live in the ingredient list.
- **Backend:** `recipe_categories` (with `in_ingredient_list`) + `recipe_category_links`;
  components and favorites can point to a recipe; edit endpoint for recipes with a loop
  check; favorites endpoints for recipes.
- **Frontend:** "Build a Bowl" becomes "New recipe" (categories chosen when naming it);
  a section per flagged category (e.g. 🥫 Sauce) in the ingredient list, pickable into
  recipes and favoritable; recipes can be edited (manual ones in the builder, links in their
  dialog); recipe cards show category badges; a recipe inside another opens on tap.
- **Test from frontend:** create a "Spicy Mayo" in Sauce, see it in the Sauce section,
  favorite it, include it in a bowl, open the bowl on the Recipes page and tap through to
  the sauce; a Soup recipe does not appear in the ingredient list.

### Slice 6 — Recipe filtering
**Goal:** find recipes by what's in them and by category.
- **Backend:** none — `GET /api/recipes` already returns each recipe's categories and
  components, so filtering happens in the browser.
- **Frontend:** a filter panel on the Recipes page:
  - category chips — a recipe must be in *any* of the selected categories;
  - an ingredient search with suggestions — a recipe must *directly* contain *all* picked
    items (ingredients or listed recipes like sauces; a bowl containing Spicy Mayo doesn't
    match "Mayo");
  - picked items as removable chips, a "3 of 12" count, and Clear.
- **Test from frontend:** filter by Salmon → only matching recipes show; add Avocado → only
  recipes with both; pick the Soup chip → only soups; clear → all return.
