import assert from "node:assert/strict";
import { test } from "node:test";

import { capitalisedName, draftPicks, nameKey, pickKey, suggestions } from "../../static/js/items.js";

// The same examples as names.py's key, so the browser and the server agree.
test("names differing only in case, accents or extra spaces have the same key", () => {
  for (const [a, b] of [
    ["Brânză", "branza"],
    ["șuncă", "ŞUNCĂ"], // comma below and cedilla
    ["Spring onion", "  spring   ONION "],
    ["Straße", "STRASSE"],
  ]) {
    assert.equal(nameKey(a), nameKey(b), `${a} / ${b}`);
  }
  assert.equal(nameKey(" Ștevie  Roșie "), "stevie rosie");
  assert.notEqual(nameKey("Tofu"), nameKey("Tofu smoked"));
});

// The same examples as names.py's capitalised, so the browser previews what the server saves.
test("a name is trimmed and only its first letter is capitalised", () => {
  for (const [typed, saved] of [
    ["spicy mayo", "Spicy mayo"],
    ["nduja", "Nduja"],
    ["ăluna", "Ăluna"],
    ["BBQ sauce", "BBQ sauce"],
    ["iPhone", "IPhone"],
    ["00 flour", "00 flour"],
    ["🥑 mash", "🥑 mash"],
    ["  tofu ", "Tofu"],
  ]) {
    assert.equal(capitalisedName(typed), saved, typed);
  }
});

const catalogItems = [
  { type: "ingredient", id: 1, name: "Smoked salmon" },
  { type: "ingredient", id: 2, name: "Tofu" },
  { type: "recipe", id: 7, name: "Spicy mayo" },
];
const names = (found) => found.matches.map((item) => item.name);

test("a name nothing has is offered as a new ingredient, capitalised, after the partial matches", () => {
  const found = suggestions(catalogItems, "salmon", { offerNew: true });

  assert.deepEqual(names(found), ["Smoked salmon"]);
  assert.equal(found.newName, "Salmon");
});

test("no new ingredient is offered when an item or a pick already has the same name", () => {
  // In the catalog: only that item is offered.
  const tofu = suggestions(catalogItems, " TOFU", { offerNew: true });
  assert.deepEqual([names(tofu), tofu.newName], [["Tofu"], null]);

  // In the catalog but already in this recipe: nothing at all.
  const inRecipe = suggestions(catalogItems, "tofu", { offerNew: true, excluded: (key) => key === "ingredient:2" });
  assert.deepEqual([names(inRecipe), inRecipe.newName], [[], null]);

  // A new pick in this recipe, not in the catalog yet.
  const newPick = suggestions(catalogItems, "edamame", { offerNew: true, takenNames: ["Edamame"] });
  assert.deepEqual([names(newPick), newPick.newName], [[], null]);

  // A recipe counts too: no "Spicy mayo" ingredient next to the sauce.
  assert.equal(suggestions(catalogItems, "spicy mayo", { offerNew: true }).newName, null);
});

test("only the recipe add boxes offer new ingredients", () => {
  assert.equal(suggestions(catalogItems, "salmon").newName, null);
  assert.deepEqual(suggestions(catalogItems, "  ", { offerNew: true }), { matches: [], newName: null });
});

const tofu = { type: "ingredient", id: 2, name: "Tofu" };
const edamame = { type: "ingredient", id: null, name: "Edamame" };

test("a new pick is told apart by its name, an existing one by its id", () => {
  assert.equal(pickKey(tofu), "ingredient:2");
  assert.equal(pickKey({ type: "recipe", id: 2, name: "Tofu" }), "recipe:2");
  assert.equal(pickKey(edamame), pickKey({ type: "ingredient", id: null, name: " EDAMAME " }));
  assert.notEqual(pickKey(edamame), pickKey({ type: "ingredient", id: null, name: "Edamame beans" }));
});

test("a draft's picks come back from picking in their order, new ones and quantities kept", () => {
  // The Draft as it was before "Pick from list", quantities filled in.
  const draft = draftPicks([tofu, edamame], new Map([
    [pickKey(tofu), { ...tofu, quantity: 120, unit: "g" }],
    [pickKey(edamame), { ...edamame, quantity: 2, unit: "tbsp" }],
  ]), () => "g");

  // Picking hands back plain items: Rice added, the new pick still there.
  const rice = { type: "ingredient", id: 3, name: "Rice" };
  const after = draftPicks([tofu, rice, edamame], draft, () => "pcs");

  assert.deepEqual([...after.values()], [
    { ...tofu, quantity: 120, unit: "g" },
    { ...rice, quantity: 0, unit: "pcs" },
    { ...edamame, quantity: 2, unit: "tbsp" },
  ]);
});

test("two new picks with the same name count once", () => {
  const picks = draftPicks([edamame, { ...edamame, name: "edamame" }], new Map(), () => "g");
  assert.deepEqual([...picks.values()].map((p) => p.name), ["Edamame"]);
});
