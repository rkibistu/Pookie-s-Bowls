-- Pookie's Bowls — full schema (created up front so later slices add features
-- without reworking tables).

PRAGMA foreign_keys = ON;

-- Fixed ingredient categories (seeded on first run). "Sauces" is a UI section
-- backed by recipes(kind='sauce'), not a row here.
CREATE TABLE IF NOT EXISTS categories (
    id       INTEGER PRIMARY KEY,
    slug     TEXT    NOT NULL UNIQUE,
    name     TEXT    NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
);

-- Base ingredients only (no sauces).
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

-- All recipes: bowls (manual), external links, and sauces.
CREATE TABLE IF NOT EXISTS recipes (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL,
    kind       TEXT    NOT NULL CHECK (kind IN ('bowl', 'link', 'sauce')),
    url        TEXT,
    notes      TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Contents of a recipe. Each row references EITHER an ingredient OR a sauce
-- (a recipe of kind='sauce'), never both and never neither.
CREATE TABLE IF NOT EXISTS recipe_components (
    id              INTEGER PRIMARY KEY,
    recipe_id       INTEGER NOT NULL REFERENCES recipes(id)     ON DELETE CASCADE,
    ingredient_id   INTEGER          REFERENCES ingredients(id) ON DELETE CASCADE,
    sauce_recipe_id INTEGER          REFERENCES recipes(id)     ON DELETE CASCADE,
    CHECK ((ingredient_id IS NOT NULL) + (sauce_recipe_id IS NOT NULL) = 1)
);

-- Per-person favorites (💜 me / 💚 her) on EITHER an ingredient OR a sauce.
-- A row exists only while the item is favorited.
CREATE TABLE IF NOT EXISTS favorites (
    id              INTEGER PRIMARY KEY,
    person          TEXT    NOT NULL CHECK (person IN ('me', 'her')),
    ingredient_id   INTEGER          REFERENCES ingredients(id) ON DELETE CASCADE,
    sauce_recipe_id INTEGER          REFERENCES recipes(id)     ON DELETE CASCADE,
    CHECK ((ingredient_id IS NOT NULL) + (sauce_recipe_id IS NOT NULL) = 1),
    UNIQUE (person, ingredient_id),
    UNIQUE (person, sauce_recipe_id)
);
