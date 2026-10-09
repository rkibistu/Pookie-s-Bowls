// The catalog: everything the server knows that the views show (ingredients,
// recipes, recipe categories), loaded in full and kept in one place. Views
// read from it and redraw when onChange tells them to; they never fetch these
// lists themselves.

import { api as realApi } from "./api.js";
import { itemKey } from "./items.js";

// Ingredients and listed recipes are both "items": {type, id, name, favorites}.
const asItems = (list, type) => list.map((x) => ({ ...x, type }));

export function createCatalog({ api }) {
  let ingredientCategories = []; // each with its ingredients, as items
  let listedRecipeSections = []; // recipe categories shown with them (e.g. sauces)
  let recipes = []; // newest first
  let recipeCategories = []; // fixed on the server, loaded once
  let loadError = null; // what went wrong with the last reload, if anything
  const listeners = [];
  let queue = Promise.resolve(); // reloads run one after another

  async function fetchAll() {
    try {
      if (recipeCategories.length === 0) {
        recipeCategories = (await api("GET", "/api/recipe-categories")).categories;
      }
      const [lists, recipeList] = await Promise.all([
        api("GET", "/api/ingredients"),
        api("GET", "/api/recipes"),
      ]);
      ingredientCategories = lists.categories.map((c) => ({
        ...c,
        ingredients: asItems(c.ingredients, "ingredient"),
      }));
      listedRecipeSections = lists.recipe_sections.map((s) => ({
        ...s,
        recipes: asItems(s.recipes, "recipe"),
      }));
      recipes = recipeList.recipes;
      loadError = null;
    } catch (err) {
      loadError = `Couldn't load: ${err.message}`; // keep what was there
    }
    for (const listener of listeners) listener();
  }

  /** Fetch everything again; every onChange listener runs once it's in. */
  function reload() {
    queue = queue.then(fetchAll);
    return queue;
  }

  /** Every item in the ingredient list, once each, A→Z: what can be searched and picked. */
  function items() {
    const all = new Map();
    for (const category of ingredientCategories) {
      for (const item of category.ingredients) all.set(itemKey(item), item);
    }
    for (const section of listedRecipeSections) {
      for (const item of section.recipes) all.set(itemKey(item), item);
    }
    return [...all.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    reload,
    onChange: (listener) => listeners.push(listener),
    loadError: () => loadError,
    ingredientCategories: () => ingredientCategories,
    listedRecipeSections: () => listedRecipeSections,
    recipes: () => recipes,
    recipeCategories: () => recipeCategories,
    items,
  };
}

/** The app's one catalog. */
export const catalog = createCatalog({ api: realApi });
