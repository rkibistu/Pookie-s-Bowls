# Migrations, and prod starts empty

Status: ready-for-agent

See `../spec.md` and ADR 0002.

## What to do

- Move `schema.sql` into `migrations/0001_baseline.sql`. At startup, apply every migration numbered above `PRAGMA user_version`, in order, each in its own transaction that also sets `user_version`. Both `.sql` and `.py` migrations are supported (a `.py` one gets the connection).
- Before applying any migration to an existing database file, copy it with SQLite's backup API to `data/backups/pre-NNNN-<time>.db`, where NNNN is the first migration about to run. Keep the newest 10. No copy is needed when the database is brand new.
- If a migration fails, roll it back, log which one and why, and stop the app from starting.
- The seed runs only on a brand-new database (it was at version 0 before migrating) and only when `SEED=1`. Set `SEED=1` in `docker-compose.yml`. It no longer re-fills tables that became empty.
- Tests create their own starting data (the Poke station, its sections, the Poke bowl / Sauce / Soup categories) in `tests/conftest.py` instead of using the app's seed.
- Add a test helper that builds a database at a given version with typical rows (recipes with quantities, a sauce inside a recipe, favorites, an orphan ingredient), and a test that every migration builds a working database from nothing. From 0002 on, each migration comes with a test that its data survives.
- Empty states: when there are no stations, the station view says "No stations yet — create one with ➕ Station" (match the real button label); the Recipes page says so when there are no recipe categories.
- Delete `data/pookie.db` and the `.bak` files in `data/`, and start dev fresh.

## Done when

- A fresh prod database (no `SEED`) has the full schema at version 1 and no rows.
- A fresh dev database (`SEED=1`) has the Poke station and the three categories.
- Restarting the app on an up-to-date database changes nothing and makes no backup copy.
- The tests pass without the app's seed.

## Comments

- Implemented (awaiting review). The old dev database and its `.bak` files are deleted; dev starts fresh from the migrations.
