import assert from "node:assert/strict";
import { test } from "node:test";

import {
  categoryWarning,
  ingredientWarning,
  recipeWarning,
} from "../../static/js/delete-warnings.js";

const recipe = (id, name, components) => ({ id, name, components });
const salmon = { type: "ingredient", id: 1 };
const teriyaki = { type: "recipe", id: 10 };

test("an ingredient's warning names the recipes it's in, A→Z", () => {
  const recipes = [
    recipe(11, "Tuna bowl", [salmon]),
    recipe(12, "Salmon bowl", [salmon, teriyaki]),
    recipe(13, "Miso soup", [{ type: "ingredient", id: 2 }]),
  ];

  assert.equal(ingredientWarning(recipes, 1), "Used in 2 recipes: Salmon bowl, Tuna bowl.");
  assert.equal(ingredientWarning(recipes, 3), null);
});

test("a recipe's warning names the recipes it's inside, not the ones with an ingredient of the same id", () => {
  const recipes = [
    recipe(10, "Teriyaki", [{ type: "ingredient", id: 10 }]),
    recipe(12, "Salmon bowl", [teriyaki]),
  ];

  assert.equal(recipeWarning(recipes, 10), "Inside 1 recipe: Salmon bowl.");
  assert.equal(recipeWarning(recipes, 12), null);
});

test("a long list names three, then how many more", () => {
  const recipes = ["A", "B", "C", "D", "E"].map((name, i) => recipe(i, name, [salmon]));

  assert.equal(ingredientWarning(recipes, 1), "Used in 5 recipes: A, B, C and 2 more.");
});

test("a category's warning names the stations that list it or start recipes in it, once each", () => {
  const sauce = 2;
  const stations = [
    { name: "Poke", emoji: "🥣", recipe_category_id: 1, sections: [{ recipe_category_id: sauce }] },
    { name: "Burger", emoji: "🍔", recipe_category_id: sauce, sections: [{ recipe_category_id: sauce }] },
    { name: "Soup", emoji: "🍲", recipe_category_id: null, sections: [{ kind: "ingredients" }] },
  ];

  assert.equal(categoryWarning(stations, sauce), "Used by 2 stations: 🥣 Poke, 🍔 Burger.");
  assert.equal(categoryWarning(stations, 3), null);
});
