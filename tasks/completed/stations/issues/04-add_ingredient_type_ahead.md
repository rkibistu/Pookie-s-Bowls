# 04 — Add ingredient with type-ahead, reusing existing ones

Status: ready-for-agent

Blocked by: 01

Spec: `../spec.md`

## What to build

Adding an ingredient suggests existing ingredients as you type, the way the recipe dialog's "+ Add ingredient…" box does, and **never duplicates**:
- **The toolbar's + Add ingredient** (on a station): a type-ahead name box, plus chips for this station's ingredient sections (none ticked is allowed).
  - Choosing a suggestion pre-ticks the sections it's already in on this station, and saving adds or removes it from them.
  - A new name creates the ingredient in the ticked sections.
- **A "+" in each ingredient section's header:** the same type-ahead, with no chips. Choosing an existing ingredient adds it to that section; a new name creates it there.
- **On the All ingredients page**: the same type-ahead, with chips for every station's ingredient sections, in groups that start folded (each shows how many are ticked). A new name with nothing ticked is an orphan; choosing an existing ingredient opens it for editing.
- Typing a name that already exists, ignoring case (e.g. "salmon"), and confirming without choosing the suggestion behaves as if you had chosen it. A toast says so: "Salmon was already in the catalog, added to Protein".

## Notes

- Reuse `static/js/item-search.js`, limited to ingredients (recipes aren't added here).
- The server's duplicate-name refusal stays for renames. The "use the existing one" decision belongs to the add flow. Put it in a rule (e.g. an "add to section by name" operation) if that keeps the client simple.

## Acceptance

- [ ] Typing "sal" on Poke → Protein's "+" suggests Salmon, and choosing it adds Salmon to Protein without a new ingredient.
- [ ] Typing "SALMON" and confirming does the same, with the toast.
- [ ] A new name creates the ingredient in the chosen section(s).
- [ ] The toolbar version pre-ticks an existing ingredient's sections on this station.
