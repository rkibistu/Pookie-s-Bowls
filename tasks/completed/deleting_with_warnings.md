# Deleting: the last one too, and warnings

Status: done

Everything that can be added can already be deleted. Two changes:

## The last station and the last recipe category can be deleted

Prod starts empty, so having no stations or no recipe categories is normal (the app shows "No stations yet" / "No recipe categories yet").

- Delete station always shows in the station's edit dialog, also for the only one.
- The last recipe category can be deleted. A category that some recipe has as its only one still can't be (as now).

## "Really delete?" says what's affected

Still two taps every time. When something is affected, the confirm step says so; otherwise it stays the plain "Really delete?". A list names the first 3, then "and N more".

- Ingredient: the recipes it's in ("Used in 2 recipes: Salmon bowl, Tuna bowl").
- Recipe: the recipes it's inside ("Inside 2 recipes: …"), e.g. a sauce.
- Recipe category: the stations that list it as a section or start new recipes in it (those then start in the first category).
- Station, ingredient section: no warning.

Not changing: where the delete buttons are; favorites just go with the thing; no undo (the 💾 backups are the undo). No schema change.
