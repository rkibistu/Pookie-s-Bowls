import assert from "node:assert/strict";
import { test } from "node:test";

import { createCatalog } from "../../static/js/catalog.js";

/** A fake api(): answers from the current server data; calls lists what was asked. */
function fakeServer() {
  const server = {
    calls: [],
    fail: null, // "GET /api/recipes" → that request fails
    data: {
      "/api/recipe-categories": { categories: [{ id: 1, slug: "bowl", name: "Poke bowl", emoji: "🥣" }] },
      "/api/ingredients": {
        categories: [
          { id: 1, slug: "protein", name: "Protein", ingredients: [{ id: 2, name: "Tofu", favorites: [] }] },
          { id: 2, slug: "base", name: "Base", ingredients: [{ id: 1, name: "Rice", favorites: ["me"] }] },
          { id: 3, slug: "extras", name: "Extras", ingredients: [{ id: 2, name: "Tofu", favorites: [] }] },
        ],
        recipe_sections: [
          { id: 2, slug: "sauce", name: "Sauce", emoji: "🥫", recipes: [{ id: 7, name: "Spicy mayo", favorites: [] }] },
        ],
      },
      "/api/recipes": { recipes: [{ id: 7, name: "Spicy mayo", categories: [], components: [] }] },
    },
  };
  server.api = async (method, url, body) => {
    server.calls.push(`${method} ${url}`);
    await Promise.resolve();
    if (server.fail === `${method} ${url}`) throw new Error("Server is down");
    return structuredClone(server.data[url]);
  };
  return server;
}

test("a reload fills both lists and tells every view", async () => {
  const server = fakeServer();
  const catalog = createCatalog({ api: server.api });
  let redraws = 0;
  catalog.onChange(() => redraws++);

  await catalog.reload();

  assert.equal(redraws, 1);
  assert.equal(catalog.loadError(), null);
  assert.deepEqual(
    catalog.items().map((x) => `${x.type}:${x.name}`),
    ["ingredient:Rice", "recipe:Spicy mayo", "ingredient:Tofu"],
  );
  assert.deepEqual(catalog.ingredientCategories()[1].ingredients[0], {
    id: 1,
    name: "Rice",
    favorites: ["me"],
    type: "ingredient",
  });
  assert.equal(catalog.listedRecipeSections()[0].recipes[0].type, "recipe");
  assert.deepEqual(catalog.recipes().map((r) => r.name), ["Spicy mayo"]);
  assert.deepEqual(catalog.recipeCategories().map((c) => c.slug), ["bowl"]);
});

test("a failed reload keeps the lists it had and says what went wrong", async () => {
  const server = fakeServer();
  const catalog = createCatalog({ api: server.api });
  await catalog.reload();
  let redraws = 0;
  catalog.onChange(() => redraws++);

  server.fail = "GET /api/recipes";
  server.data["/api/recipes"] = { recipes: [] };
  await catalog.reload();

  assert.equal(redraws, 1);
  assert.equal(catalog.loadError(), "Couldn't load: Server is down");
  assert.deepEqual(catalog.recipes().map((r) => r.name), ["Spicy mayo"]);

  server.fail = null;
  await catalog.reload();
  assert.equal(catalog.loadError(), null);
  assert.deepEqual(catalog.recipes(), []);
});
