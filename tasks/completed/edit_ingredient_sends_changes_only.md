# Edit ingredient sends only what changed

Status: done

The Edit ingredient dialog saves an ingredient's sections by sending the full `section_ids` list from the browser's copy of the catalog, and the server replaces all of its sections with that list. If the other phone changed the ingredient's sections since my copy was loaded, saving my edit silently undoes theirs.

Example: Mango is in Poke → Fresh. Her phone adds it to Burger → Toppings. On my phone (not reloaded yet) I open Edit ingredient on Mango, rename it to "Mango (ripe)" and save: the dialog sends `section_ids: [Fresh]`, and Mango leaves Burger → Toppings.

Idea: the dialog sends only what you changed (these sections ticked, these unticked), so sections you didn't touch stay as stored.

Found while deciding `tasks/completed/adding_never_duplicates.md`, which fixes the same problem for adding only. Less risky than adding was, since the dialog shows every station's ticks, but still a lost change.

## Decisions

- **The dialog sends only what you changed.** It compares the ticks with what it showed when it opened and sends the sections you ticked and the ones you unticked. Sections you didn't touch stay as stored, so two people changing *different* sections both keep their change. (Rejected: keeping the full list with a version and refusing an outdated save. That needs a version column and an error after every edit on the other phone.)
- **The name is sent only if you changed it.** If both people rename it, the last save wins.
- **`PATCH /api/ingredients/<id>`** takes `{name?, add_section_ids?, remove_section_ids?}`. The old `section_ids` (replace the whole list) goes away. It answers with the ingredient as stored.
- **Ticking a section that no longer exists** (or a listed category's) refuses with "Unknown section." and changes nothing, like adding.
- **Unticking a section that no longer exists, or that it isn't in,** has nothing to do and is fine.
- **The same section in both lists** refuses with "A section can't be both added and removed."

## Tests

pytest through `ingredients.change`:

1. Adding a section keeps the ones it was in, on every station (her Burger → Toppings survives).
2. Removing a section takes it out of only that one.
3. Changing only the name keeps the sections (exists).
4. Ticking an unknown section, or a listed category's, refuses and changes nothing.
5. Unticking a section it isn't in, or one that's gone, is fine.
6. The same section in both lists is refused.
7. HTTP: a PATCH with add and remove lists.
