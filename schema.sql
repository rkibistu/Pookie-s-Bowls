-- Pookie's Bowls — full schema (created up front so later slices add features
-- without reworking tables).

PRAGMA foreign_keys = ON;

-- Fixed ingredient categories (seeded on first run).
CREATE TABLE IF NOT EXISTS categories (
    id       INTEGER PRIMARY KEY,
    slug     TEXT    NOT NULL UNIQUE,
    name     TEXT    NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
);

-- Base ingredients only (sauces etc. are recipes).
CREATE TABLE IF NOT EXISTS ingredients (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Ingredient names are unique, ignoring case ("Salmon" == "salmon").
CREATE UNIQUE INDEX IF NOT EXISTS idx_ingredients_name
    ON ingredients (name COLLATE NOCASE);

-- An ingredient can belong to several categories.
CREATE TABLE IF NOT EXISTS ingredient_categories (
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    category_id   INTEGER NOT NULL REFERENCES categories(id)  ON DELETE CASCADE,
    PRIMARY KEY (ingredient_id, category_id)
);

-- Recipe categories (poke bowl, sauce, soup… seeded on a fresh database; the
-- people using the app add, rename, reorder and delete them). Recipes in a
-- category with in_ingredient_list = 1 (e.g. sauces) are shown in the
-- ingredient list and can be picked into other recipes.
CREATE TABLE IF NOT EXISTS recipe_categories (
    id                 INTEGER PRIMARY KEY,
    name               TEXT    NOT NULL,
    emoji              TEXT    NOT NULL,
    position           INTEGER NOT NULL DEFAULT 0,
    in_ingredient_list INTEGER NOT NULL DEFAULT 0 CHECK (in_ingredient_list IN (0, 1))
);

-- Recipe category names are unique, ignoring case.
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_categories_name
    ON recipe_categories (name COLLATE NOCASE);

-- All recipes. Each may have a link (url) and/or components; both are
-- optional. What it is lives in its categories.
CREATE TABLE IF NOT EXISTS recipes (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL,
    url        TEXT,
    notes      TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- A recipe can belong to several categories.
CREATE TABLE IF NOT EXISTS recipe_category_links (
    recipe_id   INTEGER NOT NULL REFERENCES recipes(id)           ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES recipe_categories(id) ON DELETE CASCADE,
    PRIMARY KEY (recipe_id, category_id)
);

-- Contents of a recipe, in pick order. Each row references EITHER an
-- ingredient OR another recipe (e.g. a sauce in a bowl), never both and
-- never neither.
CREATE TABLE IF NOT EXISTS recipe_components (
    id                  INTEGER PRIMARY KEY,
    recipe_id           INTEGER NOT NULL REFERENCES recipes(id)     ON DELETE CASCADE,
    ingredient_id       INTEGER          REFERENCES ingredients(id) ON DELETE CASCADE,
    component_recipe_id INTEGER          REFERENCES recipes(id)     ON DELETE CASCADE,
    CHECK ((ingredient_id IS NOT NULL) + (component_recipe_id IS NOT NULL) = 1),
    CHECK (component_recipe_id IS NULL OR component_recipe_id <> recipe_id)
);

-- Per-person favorites (💜 me / 💚 her) on EITHER an ingredient OR a recipe.
-- A row exists only while the item is favorited.
CREATE TABLE IF NOT EXISTS favorites (
    id            INTEGER PRIMARY KEY,
    person        TEXT    NOT NULL CHECK (person IN ('me', 'her')),
    ingredient_id INTEGER          REFERENCES ingredients(id) ON DELETE CASCADE,
    recipe_id     INTEGER          REFERENCES recipes(id)     ON DELETE CASCADE,
    CHECK ((ingredient_id IS NOT NULL) + (recipe_id IS NOT NULL) = 1),
    UNIQUE (person, ingredient_id),
    UNIQUE (person, recipe_id)
);
