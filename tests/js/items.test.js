import assert from "node:assert/strict";
import { test } from "node:test";

import { capitalisedName, nameKey } from "../../static/js/items.js";

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
