# Names unique ignoring case, for accented letters too

Status: done

Ingredient, station and recipe category names are unique ignoring case (see `CONTEXT.md`). The database enforces it with SQLite `NOCASE`, which only folds A–Z: to it, *Ștevie* and *ștevie* are different names, so both can be saved. The browser compares with `toLowerCase()`, which folds every letter, so the screen and the server can disagree about whether a name is taken.

Example: *Ștevie* is in the catalog. Adding `ștevie` makes a second ingredient instead of reusing the first, and the dialog may have shown it as already there.

Found while deciding `tasks/completed/adding_never_duplicates.md`, which matches names exactly the way the unique index does, so it stays correct, but only as good as `NOCASE`.

## Decisions

- **The same name means:** the same letters ignoring case **and accents**, with any run of spaces counted as one, after trimming. `branza`, `Branza` and `BRÂNZĂ` are all *Brânză*; `şuncă` (cedilla) and `șuncă` (comma below) are the same; `Spring  onion` is `Spring onion`. The name keeps whatever was typed first.
- **For every name that's unique:** ingredients, stations, recipe categories, and ingredient sections within a station. Recipe names stay not unique.
- **A stored key decides it.** Each of those tables gets a `name_key`, computed by the server from the name (decompose, drop accent marks, casefold, collapse spaces), with the unique index on it. Lookups (adding an ingredient) use it too. No custom SQLite collation. The database is recreated, no migration.
- **The browser uses the same rule** wherever it compares names: the type-ahead (typing `branza` suggests *Brânză*) and Add ingredient's recognising an existing ingredient.
- **A→Z on the server sorts by the key**, so *Ștevie* sits between *Spinach* and *Tofu*, as it already does in the browser.

## Tests

- Adding `branza` reuses *Brânză*; `şuncă` reuses *șuncă*; `  Spring   onion ` reuses *Spring onion*.
- A station, a recipe category and a section on the same station are refused when the name differs only by case or accents.
- The catalog and a station's rows list *Ștevie* between *Spinach* and *Tofu*.
- JS: the browser's name key agrees with the server's on the same examples.
