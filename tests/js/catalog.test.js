import assert from "node:assert/strict";
import { test } from "node:test";

import { createCatalog } from "../../static/js/catalog.js";

/** A fake api(): answers from the current server data; calls lists what was asked. */
function fakeServer() {
  const server = {
    calls: [],
    fail: null, // "GET /api/recipes" → that request fails
    data: {
      "/api/recipe-categories": { categories: [{ id: 1, name: "Poke bowl", emoji: "🥣" }] },
      "/api/stations": {
        stations: [
          {
            id: 1,
            name: "Poke",
            emoji: "🥣",
            recipe_category_id: 1,
            sections: [
              { id: 1, kind: "ingredients", name: "Protein", items: [{ type: "ingredient", id: 2, name: "Tofu", favorites: [] }] },
              {
                id: 2,
                kind: "recipes",
                recipe_category_id: 2,
                name: "Sauce",
                emoji: "🥫",
                items: [{ type: "recipe", id: 7, name: "Spicy mayo", favorites: [] }],
              },
            ],
          },
        ],
      },
      "/api/ingredients": {
        ingredients: [
          { id: 1, name: "Rice", section_ids: [], favorites: ["me"] },
          { id: 2, name: "Tofu", section_ids: [1], favorites: [] },
        ],
      },
      "/api/recipes": { recipes: [{ id: 7, name: "Spicy mayo", categories: [], components: [] }] },
    },
  };
  server.slow = null; // "PATCH /api/recipes/7" → that request takes a while
  server.api = async (method, url, body) => {
    const call = `${method} ${url}`;
    server.calls.push(call);
    await new Promise((resolve) => setTimeout(resolve, server.slow === call ? 20 : 0));
    server.calls.push(`done ${call}`);
    if (server.fail === call) throw new Error("Server is down");
    if (method === "GET") return structuredClone(server.data[url]);
    if (method === "PATCH") {
      const recipe = server.data["/api/recipes"].recipes.find((r) => url.endsWith(`/${r.id}`));
      Object.assign(recipe, body);
      return structuredClone(recipe);
    }
    return null;
  };
  return server;
}

test("a reload fills every list and tells every view", async () => {
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
  assert.deepEqual(catalog.ingredients()[0], {
    id: 1,
    name: "Rice",
    section_ids: [],
    favorites: ["me"],
    type: "ingredient",
  });
  assert.equal(catalog.currentStation().name, "Poke");
  assert.deepEqual(catalog.currentStation().sections.map((s) => s.name), ["Protein", "Sauce"]);
  assert.deepEqual(catalog.recipes().map((r) => r.name), ["Spicy mayo"]);
  assert.deepEqual(catalog.recipeCategories().map((c) => c.name), ["Poke bowl"]);
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

test("after a save, everything reloads and every view hears about it", async () => {
  const server = fakeServer();
  const catalog = createCatalog({ api: server.api });
  await catalog.reload();
  let redraws = 0;
  catalog.onChange(() => redraws++);
  server.calls.length = 0;

  const saved = await catalog.changeRecipe(7, { name: "Hot mayo" });

  assert.equal(saved.name, "Hot mayo");
  assert.deepEqual(catalog.recipes().map((r) => r.name), ["Hot mayo"]);
  assert.equal(redraws, 1);
  assert.deepEqual(
    server.calls.filter((c) => !c.startsWith("done")),
    [
      "PATCH /api/recipes/7",
      "GET /api/recipe-categories",
      "GET /api/stations",
      "GET /api/ingredients",
      "GET /api/recipes",
    ],
  );
});

test("a recipe category change shows up in the categories after the reload", async () => {
  const server = fakeServer();
  const catalog = createCatalog({ api: server.api });
  await catalog.reload();
  server.data["/api/recipe-categories"].categories.unshift({ id: 4, name: "Pizza", emoji: "🍕" });

  await catalog.createRecipeCategory({ name: "Pizza", emoji: "🍕" });

  assert.ok(server.calls.includes("POST /api/recipe-categories"));
  assert.deepEqual(catalog.recipeCategories().map((c) => c.name), ["Pizza", "Poke bowl"]);
});

test("saves run one after another, in the order they were made", async () => {
  const server = fakeServer();
  const catalog = createCatalog({ api: server.api });
  await catalog.reload();
  server.calls.length = 0;
  server.slow = "PATCH /api/recipes/7";

  await Promise.all([
    catalog.changeRecipe(7, { notes: "first" }),
    catalog.setFavorite({ type: "ingredient", id: 1 }, "her", true),
  ]);

  const patched = server.calls.indexOf("done PATCH /api/recipes/7");
  const favorited = server.calls.indexOf("PUT /api/ingredients/1/favorites/her");
  assert.ok(patched !== -1 && patched < favorited, server.calls.join("\n"));
});

test("a failed save says why and leaves the lists as they were", async () => {
  const server = fakeServer();
  const catalog = createCatalog({ api: server.api });
  await catalog.reload();
  let redraws = 0;
  catalog.onChange(() => redraws++);
  server.fail = "DELETE /api/recipes/7";

  await assert.rejects(catalog.deleteRecipe(7), { message: "Server is down" });

  assert.equal(redraws, 0);
  assert.deepEqual(catalog.recipes().map((r) => r.name), ["Spicy mayo"]);
  server.fail = null;
  await catalog.deleteRecipe(7); // the next save still goes through
  assert.equal(redraws, 1);
});
