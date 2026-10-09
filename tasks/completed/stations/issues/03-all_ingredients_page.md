# 03 — The All ingredients page

Status: ready-for-agent

Blocked by: 01

Spec: `../spec.md`

## What to build

A **🧺 All ingredients** nav button, always last (after 📖 Recipes). It opens a page that lists every ingredient A→Z:
- Each row is tagged with where the ingredient appears, e.g. "Poke · Protein, Burger · Patty", or "on no station" for an orphan.
- An **"Only orphans"** toggle narrows the list.
- Rows work like station rows: ✏️ opens the ingredient dialog (rename, sections per station, delete), double-tap or double-click toggles your favorite, and the ⋯ menu works the same.
- During a pick session, tapping a row picks it. The All ingredients button stays visible while picking, so you can switch to it and back without losing picks.
- **+ Add ingredient** here creates an ingredient with no sections. Once ticket 04 lands it uses the same type-ahead, but a plain name box is enough for this ticket.

## Notes

- Reuse the station row rendering. This page has no sections, just one list.
- The same ingredient data the catalog already loads for search (ticket 01) should be enough; add where it appears if the API doesn't give that yet.

## Acceptance

- [ ] Every ingredient shows up once, A→Z, with where it appears.
- [ ] After a section is deleted, its now-orphaned ingredients show as "on no station", and "Only orphans" lists just those.
- [ ] Editing, deleting, favoriting and picking work from this page.
