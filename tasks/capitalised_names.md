# Every name starts with a capital letter

Status: ready-for-agent

Names are saved exactly as typed, so a name typed on a phone ("tofu", "spicy mayo") stays lowercase and sits oddly among capitalised ones in A→Z lists. Every name should be saved with its first letter capitalised (see **Same name** in `CONTEXT.md`).

Needed by `tasks/new_ingredient_from_recipe.md`, whose ➕ row shows the capitalised name.

## Decisions

- **Which names:** all of them: ingredients, recipes, stations, sections and recipe categories. Each has its own `_parse_name` today (`ingredients.py`, `recipes.py`, `recipe_categories.py`, `stations.py` for stations and sections); they all get the same rule, from one shared function (e.g. next to `names.key` in `names.py`).
- **Only the first letter goes up; the rest is kept as typed.** `spicy mayo` → `Spicy mayo`, `nduja` → `Nduja`, `ăluna` → `Ăluna`, `BBQ sauce` stays `BBQ sauce`. Nothing is lowercased. A name starting with something that has no capital (a digit, an emoji: `00 flour`) is left as it is. Applied after trimming.
- **Whenever a name is saved:** on create and on rename, everywhere.
- **The server decides.** The browser shows the same rule where it previews a name that's about to be saved (the ➕ row in `tasks/new_ingredient_from_recipe.md`), from one shared JS function next to `nameKey` in `static/js/items.js`.
- **Same name is unaffected:** the name key already folds case, so capitalising never makes two names the same or different.
- **No data change:** every name in the dev database already starts with a capital, and prod is empty.

## Tests

- Each of the five: creating `tofu` saves `Tofu`; renaming to `salmon fillet` saves `Salmon fillet`.
- `BBQ sauce` and `iPhone`-style inner capitals: only the first letter changes (`iPhone` → `IPhone`), the rest is untouched.
- `ăluna` → `Ăluna`; `00 flour` and `🥑 mash` are saved unchanged.
- `  tofu ` → `Tofu` (trimmed first).
- JS: the browser's function gives the same results as the server's on these examples.
