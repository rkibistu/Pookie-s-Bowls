# Edit ingredient sends only what changed

Status: needs-triage

The Edit ingredient dialog saves an ingredient's sections by sending the full `section_ids` list from the browser's copy of the catalog, and the server replaces all of its sections with that list. If the other phone changed the ingredient's sections since my copy was loaded, saving my edit silently undoes theirs.

Example: Mango is in Poke → Fresh. Her phone adds it to Burger → Toppings. On my phone (not reloaded yet) I open Edit ingredient on Mango, rename it to "Mango (ripe)" and save: the dialog sends `section_ids: [Fresh]`, and Mango leaves Burger → Toppings.

Idea: the dialog sends only what you changed (these sections ticked, these unticked), so sections you didn't touch stay as stored.

Found while deciding `tasks/completed/adding_never_duplicates.md`, which fixes the same problem for adding only. Less risky than adding was, since the dialog shows every station's ticks, but still a lost change.

## To decide
- Ticked/unticked lists, or keep the full list and refuse when it was based on an old version?
- Does the name need the same care (her rename vs. mine)?
