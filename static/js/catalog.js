// The catalog: everything the server knows that the views show (ingredients,
// recipes, recipe categories), loaded in full and kept in one place, and every
// change to it. Views read from it and redraw when onChange tells them to;
// they never call the server for these themselves.

import { api as realApi } from "./api.js";
import { itemKey } from "./items.js";

// Ingredients and listed recipes are both "items": {type, id, name, favorites}.
const asItems = (list, type) => list.map((x) => ({ ...x, type }));

export function createCatalog({ api }) {
  let ingredientCategories = []; // each with its ingredients, as items
  let listedRecipeSections = []; // recipe categories shown with them (e.g. sauces)
  let recipes = []; // newest first
  let recipeCategories = []; // in their order
  let loadError = null; // what went wrong with the last reload, if anything
  const listeners = [];
  let queue = Promise.resolve(); // saves and reloads run one after another

  async function fetchAll() {
    try {
      const [categoryList, lists, recipeList] = await Promise.all([
        api("GET", "/api/recipe-categories"),
        api("GET", "/api/ingredients"),
        api("GET", "/api/recipes"),
      ]);
      recipeCategories = categoryList.categories;
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

  /**
   * Send one change, after any still running; once it's saved, reload
   * everything. Resolves to the server's answer after the reload; rejects
   * with the server's error, and then nothing is reloaded.
   */
  function save(method, url, body) {
    const sent = queue.then(() => api(method, url, body));
    queue = sent.then(fetchAll, () => {});
    return sent.then((answer) => queue.then(() => answer));
  }

  /** One recipe as the recipe dialog shows it (with hearts), after any saves. */
  function recipe(id) {
    const fetched = queue.then(() => api("GET", `/api/recipes/${id}`));
    queue = fetched.catch(() => {});
    return fetched;
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
    recipe,
    createRecipe: (fields) => save("POST", "/api/recipes", fields),
    /** Change only the fields given; resolves to the saved recipe. */
    changeRecipe: (id, fields) => save("PATCH", `/api/recipes/${id}`, fields),
    deleteRecipe: (id) => save("DELETE", `/api/recipes/${id}`),
    createIngredient: (fields) => save("POST", "/api/ingredients", fields),
    /** Change only the fields given; resolves to the saved ingredient. */
    changeIngredient: (id, fields) => save("PATCH", `/api/ingredients/${id}`, fields),
    deleteIngredient: (id) => save("DELETE", `/api/ingredients/${id}`),
    createRecipeCategory: (fields) => save("POST", "/api/recipe-categories", fields),
    /** Change only the fields given (name and/or emoji). */
    changeRecipeCategory: (id, fields) => save("PATCH", `/api/recipe-categories/${id}`, fields),
    /** Put every recipe category in this order: [id]. */
    reorderRecipeCategories: (ids) =>
      save("PUT", "/api/recipe-categories/order", { category_ids: ids }),
    deleteRecipeCategory: (id) => save("DELETE", `/api/recipe-categories/${id}`),
    /** Add (on) or remove a person's heart on an ingredient or recipe item. */
    setFavorite: (item, person, on) =>
      save(
        on ? "PUT" : "DELETE",
        `/api/${item.type === "recipe" ? "recipes" : "ingredients"}/${item.id}/favorites/${person}`,
      ),
  };
}

/** The app's one catalog. */
export const catalog = createCatalog({ api: realApi });
