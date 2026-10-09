-- Pookie's Bowls — full schema (created up front so later slices add features
-- without reworking tables).

PRAGMA foreign_keys = ON;

-- Base ingredients only (sauces etc. are recipes). One catalog, shared by
-- every station (see docs/adr/0001).
CREATE TABLE IF NOT EXISTS ingredients (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL,
    name_key   TEXT    NOT NULL,  -- names.key(name)
    last_unit  TEXT    NOT NULL DEFAULT 'g',  -- what it starts with in a recipe (recipes.py)
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Ingredient names are unique, ignoring case, accents and extra spaces
-- ("Brânză" == "branza"; see names.py).
CREATE UNIQUE INDEX IF NOT EXISTS idx_ingredients_name
    ON ingredients (name_key);

-- Recipe categories (poke bowl, sauce, soup… seeded on a fresh database; the
-- people using the app add, rename, reorder and delete them).
CREATE TABLE IF NOT EXISTS recipe_categories (
    id       INTEGER PRIMARY KEY,
    name     TEXT    NOT NULL,
    name_key TEXT    NOT NULL,  -- names.key(name)
    emoji    TEXT    NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    -- Its recipes show quantities (at least one of a recipe's categories must).
    shows_quantities INTEGER NOT NULL DEFAULT 1 CHECK (shows_quantities IN (0, 1))
);

-- Recipe category names are unique, ignoring case, accents and extra spaces.
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_categories_name
    ON recipe_categories (name_key);

-- Stations: pages set up for picking one kind of recipe (🥣 Poke, 🍔 Burger…).
-- Recipes started on a station begin in its recipe category; NULL (or a
-- deleted one) means the first recipe category.
CREATE TABLE IF NOT EXISTS stations (
    id                 INTEGER PRIMARY KEY,
    name               TEXT    NOT NULL,
    name_key           TEXT    NOT NULL,  -- names.key(name)
    emoji              TEXT    NOT NULL,
    position           INTEGER NOT NULL DEFAULT 0,
    recipe_category_id INTEGER REFERENCES recipe_categories(id) ON DELETE SET NULL
);

-- Station names are unique, ignoring case, accents and extra spaces.
CREATE UNIQUE INDEX IF NOT EXISTS idx_stations_name
    ON stations (name_key);

-- A station's sections, in order. Each is EITHER an ingredient section of
-- its own (a name; ingredients go in it) OR a listed recipe category (its
-- recipes are shown there and can be picked), never both and never neither.
CREATE TABLE IF NOT EXISTS sections (
    id                 INTEGER PRIMARY KEY,
    station_id         INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    position           INTEGER NOT NULL DEFAULT 0,
    name               TEXT,
    name_key           TEXT,  -- names.key(name); NULL for a listed category
    recipe_category_id INTEGER REFERENCES recipe_categories(id) ON DELETE CASCADE,
    CHECK ((name IS NOT NULL) + (recipe_category_id IS NOT NULL) = 1),
    CHECK ((name IS NULL) = (name_key IS NULL)),
    UNIQUE (station_id, recipe_category_id)
);

-- Ingredient section names are unique per station, ignoring case, accents
-- and extra spaces.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sections_name
    ON sections (station_id, name_key);

-- Which ingredient sections an ingredient is in: any number, on any
-- stations, or none (an orphan).
CREATE TABLE IF NOT EXISTS section_ingredients (
    section_id    INTEGER NOT NULL REFERENCES sections(id)    ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    PRIMARY KEY (section_id, ingredient_id)
);

-- All recipes. Each may have a link (url) and/or components; both are
-- optional. What it is lives in its categories.
CREATE TABLE IF NOT EXISTS recipes (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL,
    url        TEXT,
    notes      TEXT,
    last_unit  TEXT    NOT NULL DEFAULT 'g',  -- what it starts with inside another recipe
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
-- never neither, with its quantity: an amount and a unit (recipes.UNITS),
-- kept whether or not the recipe shows quantities.
CREATE TABLE IF NOT EXISTS recipe_components (
    id                  INTEGER PRIMARY KEY,
    recipe_id           INTEGER NOT NULL REFERENCES recipes(id)     ON DELETE CASCADE,
    ingredient_id       INTEGER          REFERENCES ingredients(id) ON DELETE CASCADE,
    component_recipe_id INTEGER          REFERENCES recipes(id)     ON DELETE CASCADE,
    quantity            REAL    NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    unit                TEXT    NOT NULL DEFAULT 'g',
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
