// What a delete takes with it, said in its "Really delete?" step: the
// recipes an ingredient or recipe is in, the stations that use a recipe
// category. null when nothing else is affected.

const SHOWN = 3; // names listed before "and N more"

/** "Used in 2 recipes: Salmon bowl, Tuna bowl", or null for none. */
function sentence(lead, noun, names) {
  if (names.length === 0) return null;
  const shown = names.slice(0, SHOWN).join(", ");
  const more = names.length > SHOWN ? ` and ${names.length - SHOWN} more` : "";
  return `${lead} ${names.length} ${noun}${names.length === 1 ? "" : "s"}: ${shown}${more}.`;
}

const containing = (recipes, type, id) =>
  recipes
    .filter((r) => r.components.some((c) => c.type === type && c.id === id))
    .map((r) => r.name)
    .sort((a, b) => a.localeCompare(b));

/** The recipes the ingredient is in. */
export const ingredientWarning = (recipes, ingredientId) =>
  sentence("Used in", "recipe", containing(recipes, "ingredient", ingredientId));

/** The recipes the recipe is inside (e.g. a sauce in bowls). */
export const recipeWarning = (recipes, recipeId) =>
  sentence("Inside", "recipe", containing(recipes, "recipe", recipeId));

/** The stations that list the category as a section or start new recipes in it. */
export const categoryWarning = (stations, categoryId) =>
  sentence(
    "Used by",
    "station",
    stations
      .filter(
        (s) =>
          s.recipe_category_id === categoryId ||
          s.sections.some((section) => section.recipe_category_id === categoryId),
      )
      .map((s) => `${s.emoji} ${s.name}`),
  );
