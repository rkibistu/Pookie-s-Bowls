// Recipe categories (poke bowl, sauce, soup…) as the views show them; the
// list itself comes from the catalog.

import { catalog } from "./catalog.js";

/** Display names like "🥫 Sauce" for the category chips. */
export const categoryChipOptions = () =>
  catalog.recipeCategories().map((c) => ({ id: c.id, name: `${c.emoji} ${c.name}` }));

/** A new recipe starts as a poke bowl. */
export const defaultCategoryIds = () =>
  new Set(catalog.recipeCategories().filter((c) => c.slug === "bowl").map((c) => c.id));

/** A recipe's emoji: its first category's. */
export function recipeEmoji(recipe) {
  return recipe.categories.length ? recipe.categories[0].emoji : "🥣";
}
