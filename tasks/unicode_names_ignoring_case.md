# Names unique ignoring case, for accented letters too

Status: needs-triage

Ingredient, station and recipe category names are unique ignoring case (see `CONTEXT.md`). The database enforces it with SQLite `NOCASE`, which only folds A–Z: to it, *Ștevie* and *ștevie* are different names, so both can be saved. The browser compares with `toLowerCase()`, which folds every letter, so the screen and the server can disagree about whether a name is taken.

Example: *Ștevie* is in the catalog. Adding `ștevie` makes a second ingredient instead of reusing the first, and the dialog may have shown it as already there.

Found while deciding `tasks/completed/adding_never_duplicates.md`, which matches names exactly the way the unique index does, so it stays correct, but only as good as `NOCASE`.

## To decide
- How the server folds names (e.g. Python `casefold()` into a stored key with the unique index on it). No migration needed: the database can be recreated.
- Whether to fold accents too (*Ștevie* = *Stevie*?), or only case.
- The browser should compare the same way as the server.
- All three kinds of names, in one change.
