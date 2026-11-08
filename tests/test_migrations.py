"""The migration runner, the dev seed, and the migrations themselves (docs/adr/0002)."""

import os
import shutil

import pytest

import db
from conftest import row_counts

LATEST = len(db.migrations())


def tables(conn):
    return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}


@pytest.fixture
def migrations_dir(tmp_path):
    """A copy of the real migrations that a test can add to."""
    directory = tmp_path / "migrations"
    shutil.copytree(db.MIGRATIONS_DIR, directory)
    return directory


@pytest.fixture
def path(tmp_path):
    (tmp_path / "data").mkdir()
    return tmp_path / "data" / "pookie.db"


# ---- The migrations ---------------------------------------------------------


def test_the_migrations_build_a_working_database_from_nothing():
    conn = db.get_connection(":memory:")

    assert db.migrate(conn) == 0

    assert db.version(conn) == LATEST
    assert conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1


@pytest.mark.parametrize("version", range(1, LATEST + 1))
def test_a_database_at_each_version_takes_the_typical_rows(database_at, version):
    conn = database_at(version)

    assert db.version(conn) == version
    assert row_counts(conn)["favorites"] == 3


# ---- The runner ---------------------------------------------------------------


def test_a_fresh_prod_database_has_the_full_schema_and_no_rows(path, monkeypatch):
    monkeypatch.delenv("SEED", raising=False)

    db.init_db(path)

    conn = db.get_connection(path)
    assert db.version(conn) == LATEST
    assert "favorites" in tables(conn)
    assert set(row_counts(conn).values()) == {0}
    assert not (path.parent / "backups").exists()


def test_a_fresh_dev_database_gets_the_seed(path, monkeypatch):
    monkeypatch.setenv("SEED", "1")

    db.init_db(path)

    conn = db.get_connection(path)
    assert [r[0] for r in conn.execute("SELECT name FROM recipe_categories ORDER BY position")] == [
        "Poke bowl",
        "Sauce",
        "Soup",
    ]
    assert [r[0] for r in conn.execute("SELECT name FROM stations")] == ["Poke"]


def test_the_seed_never_comes_back_once_deleted(path, monkeypatch):
    monkeypatch.setenv("SEED", "1")
    db.init_db(path)
    conn = db.get_connection(path)
    conn.execute("DELETE FROM stations")
    conn.execute("DELETE FROM recipe_categories")
    conn.commit()

    db.init_db(path)

    assert set(row_counts(conn).values()) == {0}


def test_restarting_on_an_up_to_date_database_changes_nothing(path):
    db.init_db(path)
    before = path.read_bytes()

    db.init_db(path)

    assert path.read_bytes() == before
    assert not (path.parent / "backups").exists()


def test_a_new_migration_runs_once_after_a_copy_of_the_database(path, migrations_dir, database_at):
    conn = db.get_connection(path)
    database_at(LATEST).backup(conn)
    (migrations_dir / f"{LATEST + 1:04d}_add_spice.sql").write_text(
        "ALTER TABLE recipes ADD COLUMN spice INTEGER NOT NULL DEFAULT 0;"
    )

    db.migrate(conn, migrations_dir, backup_dir=path.parent / "backups")

    assert db.version(conn) == LATEST + 1
    assert [r[0] for r in conn.execute("SELECT DISTINCT spice FROM recipes")] == [0]
    [copy] = (path.parent / "backups").iterdir()
    assert copy.name.startswith(f"pre-{LATEST + 1:04d}-")
    assert db.version(db.get_connection(copy)) == LATEST

    db.migrate(conn, migrations_dir, backup_dir=path.parent / "backups")

    assert len(list((path.parent / "backups").iterdir())) == 1


def test_only_the_newest_copies_are_kept(tmp_path, database_at):
    conn = database_at(LATEST)
    for i in range(db.BACKUPS_KEPT + 2):
        old = tmp_path / f"pre-0001-2020010{i}.db"
        old.write_bytes(b"")
        os.utime(old, (i, i))

    newest = db.backup(conn, tmp_path, LATEST + 1)

    kept = sorted(tmp_path.glob("pre-*.db"), key=lambda p: p.stat().st_mtime)
    assert len(kept) == db.BACKUPS_KEPT
    assert kept[-1] == newest
    assert not (tmp_path / "pre-0001-20200100.db").exists()


def test_a_python_migration_gets_the_connection(migrations_dir, database_at):
    conn = database_at(LATEST)
    (migrations_dir / f"{LATEST + 1:04d}_shout_names.py").write_text(
        "def migrate(conn):\n"
        "    for id, name in conn.execute('SELECT id, name FROM recipes').fetchall():\n"
        "        conn.execute('UPDATE recipes SET name = ? WHERE id = ?', (name.upper(), id))\n"
    )

    db.migrate(conn, migrations_dir)

    assert db.version(conn) == LATEST + 1
    assert {r[0] for r in conn.execute("SELECT name FROM recipes")} == {"TERIYAKI", "SALMON BOWL"}


def test_a_failed_migration_is_rolled_back_and_stops_the_app(path, migrations_dir, database_at, capsys):
    conn = database_at(LATEST)
    counts = row_counts(conn)
    (migrations_dir / f"{LATEST + 1:04d}_broken.sql").write_text(
        "CREATE TABLE spices (id INTEGER PRIMARY KEY);\n"
        "DELETE FROM favorites;\n"
        "INSERT INTO nowhere VALUES (1);\n"
    )

    with pytest.raises(db.MigrationError, match=f"{LATEST + 1:04d}_broken.sql"):
        db.migrate(conn, migrations_dir)

    assert db.version(conn) == LATEST
    assert "spices" not in tables(conn)
    assert row_counts(conn) == counts
    assert "no such table: nowhere" in capsys.readouterr().err


def test_a_migration_that_leaves_rows_pointing_nowhere_is_rolled_back(migrations_dir, database_at):
    conn = database_at(LATEST)
    counts = row_counts(conn)
    (migrations_dir / f"{LATEST + 1:04d}_drop_recipes.sql").write_text("DELETE FROM recipes;")

    with pytest.raises(db.MigrationError, match="point at rows that don't exist"):
        db.migrate(conn, migrations_dir)

    assert row_counts(conn) == counts
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1


def test_rebuilding_a_table_keeps_the_rows_that_point_at_it(migrations_dir, database_at):
    """The SQLite way to change a column or constraint: new table, copy, drop, rename."""
    conn = database_at(LATEST)
    counts = row_counts(conn)
    (migrations_dir / f"{LATEST + 1:04d}_rebuild_recipes.sql").write_text(
        "CREATE TABLE recipes_new (\n"
        "    id INTEGER PRIMARY KEY, name TEXT NOT NULL, url TEXT, notes TEXT,\n"
        "    last_unit TEXT NOT NULL DEFAULT 'g', created_at TEXT NOT NULL DEFAULT (datetime('now'))\n"
        ");\n"
        "INSERT INTO recipes_new SELECT * FROM recipes;\n"
        "DROP TABLE recipes;\n"
        "ALTER TABLE recipes_new RENAME TO recipes;\n"
    )

    db.migrate(conn, migrations_dir)

    assert row_counts(conn) == counts


def test_migrations_must_be_numbered_without_gaps(migrations_dir):
    (migrations_dir / f"{LATEST + 2:04d}_too_far.sql").write_text("")

    with pytest.raises(db.MigrationError, match="no gaps"):
        db.migrations(migrations_dir)
