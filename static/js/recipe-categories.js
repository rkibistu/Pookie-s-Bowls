// Recipe categories (poke bowl, sauce, soup…) as the views show them; the
// list itself, in its order, comes from the catalog.

import { catalog } from "./catalog.js";

/** Display names like "🥫 Sauce" for the category chips. */
export const categoryChipOptions = () =>
  catalog.recipeCategories().map((c) => ({ id: c.id, name: `${c.emoji} ${c.name}` }));

/**
 * A new recipe starts in preferredId (a station's category) if it still
 * exists, otherwise in the first category.
 */
export function defaultCategoryIds(preferredId = null) {
  const categories = catalog.recipeCategories();
  const start = categories.find((c) => c.id === preferredId) ?? categories[0];
  return new Set(start ? [start.id] : []);
}

/** A recipe's emoji: its first category's. */
export function recipeEmoji(recipe) {
  return recipe.categories.length ? recipe.categories[0].emoji : "🥣";
}
