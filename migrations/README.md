# Migrations

How the database changes without losing prod's data (why: `docs/adr/0002`).

At startup the app applies every file here numbered above the database's `PRAGMA user_version`, in order, each in its own transaction that also sets `user_version` to its number. Before migrating an existing database it copies it to `data/backups/pre-NNNN-<time>.db`. If one fails, it's rolled back and the app doesn't start.

## Adding one

- Name it with the next number: `0002_recipe_rating.sql`, or `.py` when data has to be moved with logic (`def migrate(conn):`).
- Never edit a migration once it has run on prod; fix it with the next one.
- Don't `BEGIN`, `COMMIT` or `executescript` in it: the runner owns the transaction.
- Foreign keys are off while it runs and checked before it commits. To change a column or a constraint, rebuild the table: `CREATE TABLE x_new (…)`, `INSERT INTO x_new SELECT … FROM x`, `DROP TABLE x`, `ALTER TABLE x_new RENAME TO x`, then recreate its indexes.
- Test it in `tests/test_migrations.py`: `database_at(N - 1)` gives a database at the version before, full of typical rows; migrate it and check every row survived (`row_counts`).
- Before deploying, rehearse it on a backup downloaded from prod.
