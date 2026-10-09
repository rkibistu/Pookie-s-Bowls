// Recipe categories (poke bowl, sauce, soup…): fixed on the server, loaded once.

import { api } from "./api.js";
import { showToast } from "./dom.js";

let recipeCategories = []; // every recipe category, once loaded
let loading = null; // the one load, shared by everyone who waits for it

/** Load the categories (only the first call fetches); resolves once they're in. */
export function loadRecipeCategories() {
  loading ??= api("GET", "/api/recipe-categories")
    .then((data) => {
      recipeCategories = data.categories;
    })
    .catch((err) => showToast(`Couldn't load recipe categories: ${err.message}`));
  return loading;
}

/** Display names like "🥫 Sauce" for the category chips. */
export const categoryChipOptions = () =>
  recipeCategories.map((c) => ({ id: c.id, name: `${c.emoji} ${c.name}` }));

/** A new recipe starts as a poke bowl. */
export const defaultCategoryIds = () =>
  new Set(recipeCategories.filter((c) => c.slug === "bowl").map((c) => c.id));

/** A recipe's emoji: its first category's. */
export function recipeEmoji(recipe) {
  return recipe.categories.length ? recipe.categories[0].emoji : "🥣";
}
