import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeQuestion } from "../../static/js/merge-question.js";

const onion = { type: "ingredient", id: 1, name: "Onion" };
const ceapa = { type: "ingredient", id: 2, name: "Ceapă" };
const bowl = (id, components) => ({ id, name: `Bowl ${id}`, components });

test("the question names both and counts where it's used", () => {
  const recipes = [bowl(10, [ceapa]), bowl(11, [onion, ceapa]), bowl(12, [onion]), bowl(13, [ceapa]), bowl(14, [ceapa])];

  assert.deepEqual(mergeQuestion(recipes, ceapa, onion, [5]), {
    question: "Onion already exists. Merge Ceapă into Onion?",
    consequence: "Ceapă is used in 4 recipes and 1 section; they'll all use Onion, and Ceapă will be gone.",
    confirm: "Merge Ceapă into Onion",
  });
});

test("the counts are singular or plural, and either can be missing", () => {
  const consequence = (recipes, sectionIds) => mergeQuestion(recipes, ceapa, onion, sectionIds).consequence;

  assert.equal(consequence([bowl(10, [ceapa])], []), "Ceapă is used in 1 recipe; it'll use Onion, and Ceapă will be gone.");
  assert.equal(consequence([], [5, 6]), "Ceapă is used in 2 sections; they'll all use Onion, and Ceapă will be gone.");
  assert.equal(
    consequence([bowl(10, [ceapa]), bowl(11, [ceapa])], [5, 6, 7]),
    "Ceapă is used in 2 recipes and 3 sections; they'll all use Onion, and Ceapă will be gone.",
  );
});

test("one used nowhere says so", () => {
  // A recipe with an ingredient of the same id doesn't count: a sauce isn't Ceapă.
  const recipes = [bowl(10, [onion, { type: "recipe", id: 2, name: "Sauce" }])];

  assert.equal(mergeQuestion(recipes, ceapa, onion, []).consequence, "Ceapă isn't used anywhere; it will be gone.");
});
