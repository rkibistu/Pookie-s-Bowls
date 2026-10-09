# One ingredient catalog, shared by every station

Each station (🥣 Poke, 🍔 Burger…) groups ingredients into its own ingredient sections, but the ingredients themselves live in one shared catalog. Salmon is one ingredient, with one name and one set of favorites, that can be in Poke → Protein and Sushi → Fish at the same time, or on no station at all. We chose this so that favorites, renames and the recipe filter ("contains Salmon") work across every kind of recipe, and so that recipes never end up holding "the other Salmon".

## Considered Options

- **Each station owns its ingredients.** Simpler to build: no orphans, no All ingredients page, and only one station's chips in the ingredient dialog. Rejected because the same food would be duplicated per station, with split favorites and recipes that don't match across stations.

## Consequences

- An ingredient can belong to no station (an **orphan**). That's allowed on purpose: deleting a section or a station never deletes or blocks on its ingredients, and the All ingredients page is where orphans are found and cleaned up.
- Don't "fix" orphans by giving every ingredient an owning station; that is the rejected option.
