# Pick an emoji from a set

Status: done

Every emoji box (New station, the Station dialog, adding and renaming a recipe category, the Station dialog's new category row) is a plain text box: you have to find the emoji on the keyboard.

## Decisions

- Tapping an emoji box opens a small panel under it: ~80 hand-picked food, kitchen and drink emoji, grouped under headings. Tapping one fills the box, saves the way typing does, and closes the panel.
- Typing or pasting any emoji still works.
- It opens on a tap, not on focus, so a dialog that focuses its emoji box doesn't pop it open.
- No library: the set is listed in the app.
