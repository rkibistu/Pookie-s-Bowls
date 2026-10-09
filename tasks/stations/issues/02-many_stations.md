# 02 — Many stations

Status: ready-for-agent

Blocked by: 01

Spec: `../spec.md`

## What to build

- **Nav:** one button per station (emoji + name, in creation order), then 📖 Recipes. A **"+"** at the end of the station buttons creates a station. The row scrolls sideways if it overflows. The app remembers the last station used (per device, like the current view).
- **New station:** asks for a name and an emoji, starts with no sections and no new-recipe category, and opens straight onto it.
- **✏️ Station** gets **Delete station** (two-tap). Its sections go with it. Ingredients only in those sections become orphans, and nothing is refused because of them. The last station can't be deleted.
- **The ingredient dialog** shows one chip group per station, with the current station first.
- **Pick sessions:**
  - Station buttons stay visible while picking; Recipes stays hidden.
  - Switching stations keeps the picks and the tray.
  - "Pick from list…" (recipe dialog, New recipe dialog) opens the last station used.
- **New recipe** from a station starts in that station's recipe category.

## Notes

- Station names are unique ignoring case. Emoji is required.
- Out of scope: reordering stations.

## Acceptance

- [ ] You can create a 🍔 Burger station, give it its own sections and listed categories, and switch between Poke and Burger from the nav.
- [ ] Salmon can be in Poke → Protein and Burger → Patty at once, set from one ingredient dialog.
- [ ] Deleting a station leaves its ingredients in the catalog; the last station can't be deleted.
- [ ] During a pick session you can switch stations, and the picks stay.
- [ ] Python rule tests cover creating and deleting stations, including the last-station refusal.
