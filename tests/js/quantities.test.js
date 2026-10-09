import assert from "node:assert/strict";
import { test } from "node:test";

import { formatAmount, parseAmount } from "../../static/js/quantities.js";

test("an amount of 0 shows as an empty box, others as typed", () => {
  assert.equal(formatAmount(0), "");
  assert.equal(formatAmount(120), "120");
  assert.equal(formatAmount(0.5), "0.5");
});

test("what's typed is read as an amount: empty is 0, a comma works as a point", () => {
  assert.equal(parseAmount(""), 0);
  assert.equal(parseAmount("  "), 0);
  assert.equal(parseAmount(" 120 "), 120);
  assert.equal(parseAmount("0,5"), 0.5);
  assert.equal(parseAmount("1.25"), 1.25);
});

test("something that isn't an amount, or is below 0, is refused", () => {
  for (const text of ["abc", "-1", "1,2,3", "Infinity"]) assert.equal(parseAmount(text), null, text);
});
