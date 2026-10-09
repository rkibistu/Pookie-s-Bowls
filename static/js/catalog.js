// The catalog: everything the server knows that the views show (stations,
// ingredients, recipes, recipe categories), loaded in full and kept in one
// place, and every change to it. Views read from it and redraw when onChange tells them to;
// they never call the server for these themselves.

import { api as realApi } from "./api.js";
import { itemKey } from "./items.js";

// Ingredients and listed recipes are both "items": {type, id, name, favorites}.
// A station's section rows come from the server as items already.
const asItems = (list, type) => list.map((x) => ({ ...x, type }));

export function createCatalog({ api }) {
  let stations = []; // each with its sections in order, their rows as items
  let ingredients = []; // every ingredient A→Z, orphans too, as items
  let recipes = []; // newest first
  let recipeCategories = []; // in their order
  let selectedStationId = null; // the station being shown; null or gone: the first
  let loadError = null; // what went wrong with the last reload, if anything
  const listeners = [];
  let queue = Promise.resolve(); // saves and reloads run one after another

  async function fetchAll() {
    try {
      const [categoryList, stationList, ingredientList, recipeList] = await Promise.all([
        api("GET", "/api/recipe-categories"),
        api("GET", "/api/stations"),
        api("GET", "/api/ingredients"),
        api("GET", "/api/recipes"),
      ]);
      recipeCategories = categoryList.categories;
      stations = stationList.stations;
      ingredients = asItems(ingredientList.ingredients, "ingredient");
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
   * Send one change, after any still running; then reload everything, saved
   * or not (a refused change may have been based on something the other
   * phone has changed). Resolves to the server's answer, or rejects with its
   * error, after the reload.
   */
  function save(method, url, body) {
    const sent = queue.then(() => api(method, url, body));
    queue = sent.then(fetchAll, fetchAll);
    return sent.then(
      (answer) => queue.then(() => answer),
      (err) => queue.then(() => Promise.reject(err)),
    );
  }

  /** One recipe as the recipe dialog shows it (with hearts), after any saves. */
  function recipe(id) {
    const fetched = queue.then(() => api("GET", `/api/recipes/${id}`));
    queue = fetched.catch(() => {});
    return fetched;
  }

  /**
   * Every ingredient (orphans too) and every recipe listed on any station,
   * once each, A→Z: what can be searched and picked.
   */
  function items() {
    const all = new Map(ingredients.map((item) => [itemKey(item), item]));
    for (const station of stations) {
      for (const section of station.sections) {
        if (section.kind === "recipes") {
          for (const item of section.items) all.set(itemKey(item), item);
        }
      }
    }
    return [...all.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    reload,
    onChange: (listener) => listeners.push(listener),
    loadError: () => loadError,
    stations: () => stations,
    /** The station being shown: the one selected, or the first if it's gone; null before the first load. */
    currentStation: () => stations.find((s) => s.id === selectedStationId) ?? stations[0] ?? null,
    /** Show this station; every onChange listener runs. */
    selectStation(id) {
      selectedStationId = id;
      for (const listener of listeners) listener();
    },
    ingredients: () => ingredients,
    recipes: () => recipes,
    recipeCategories: () => recipeCategories,
    items,
    recipe,
    createRecipe: (fields) => save("POST", "/api/recipes", fields),
    /** Change only the fields given; resolves to the saved recipe. */
    changeRecipe: (id, fields) => save("PATCH", `/api/recipes/${id}`, fields),
    deleteRecipe: (id) => save("DELETE", `/api/recipes/${id}`),
    /**
     * {name, section_ids}: a taken name reuses that ingredient, and adding only
     * puts it into more sections. Resolves to {ingredient, reused, added_to}.
     */
    addIngredient: (fields) => save("POST", "/api/ingredients", fields),
    /**
     * {name?, add_section_ids?, remove_section_ids?}: sections not mentioned
     * stay as stored. Resolves to the saved ingredient.
     */
    changeIngredient: (id, fields) => save("PATCH", `/api/ingredients/${id}`, fields),
    deleteIngredient: (id) => save("DELETE", `/api/ingredients/${id}`),
    createRecipeCategory: (fields) => save("POST", "/api/recipe-categories", fields),
    /** Change only the fields given (name and/or emoji). */
    changeRecipeCategory: (id, fields) => save("PATCH", `/api/recipe-categories/${id}`, fields),
    /** Put every recipe category in this order: [id]. */
    reorderRecipeCategories: (ids) =>
      save("PUT", "/api/recipe-categories/order", { category_ids: ids }),
    deleteRecipeCategory: (id) => save("DELETE", `/api/recipe-categories/${id}`),
    /** A new station with no sections; resolves to it. */
    createStation: (fields) => save("POST", "/api/stations", fields),
    /** Delete a station; its ingredients stay in the catalog. */
    deleteStation: (id) => save("DELETE", `/api/stations/${id}`),
    /** Change only the fields given (name, emoji, recipe_category_id). */
    changeStation: (id, fields) => save("PATCH", `/api/stations/${id}`, fields),
    /** {name} adds an ingredient section, {recipe_category_id} lists that category. */
    addSection: (stationId, fields) => save("POST", `/api/stations/${stationId}/sections`, fields),
    renameSection: (id, name) => save("PATCH", `/api/sections/${id}`, { name }),
    /** Delete an ingredient section, or unlist a recipe category. */
    deleteSection: (id) => save("DELETE", `/api/sections/${id}`),
    /** Put every section of the station in this order: [id]. */
    reorderSections: (stationId, ids) =>
      save("PUT", `/api/stations/${stationId}/sections/order`, { section_ids: ids }),
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
