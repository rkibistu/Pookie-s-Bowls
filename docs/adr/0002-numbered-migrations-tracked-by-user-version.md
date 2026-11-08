# Numbered migrations, tracked by SQLite's user_version

The app now runs in prod with data we care about, so schema changes can no longer be "edit `schema.sql` and reset the DB". Each change is a numbered file in `migrations/` (`0001_baseline.sql`, then `0002_…sql`, or `.py` when data has to be moved with logic). At startup the app applies every migration newer than `PRAGMA user_version`, each in its own transaction, after copying the database to `data/backups/`. We chose this over a migration library because the app has no ORM, one SQLite file and two users: a few dozen lines we own beat a dependency built around SQLAlchemy.

## Considered Options

- **Alembic.** Rejected: it is built around SQLAlchemy, which we don't use, and its SQLite support needs batch-mode workarounds for most table changes.
- **Running migrations by hand on prod.** Rejected: easy to forget after a `git pull`, and then new code runs on an old schema.
- **Down migrations.** Rejected: rarely tested and fiddly on SQLite. To undo, write a new migration or restore the copy taken before migrating.

## Consequences

- Never edit a migration that has already run on prod; add a new one.
- If a migration fails, the app refuses to start. It never runs new code on a half-migrated or old schema.
- The seed (Poke station, Sauce…) is not a migration. It runs only on a brand-new dev database when `SEED=1`; prod starts empty and tests create their own data.
