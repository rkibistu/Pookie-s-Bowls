import assert from "node:assert/strict";
import { test } from "node:test";

import { EMOJI_GROUPS } from "../../static/js/emoji-picker.js";

test("every emoji is offered once, and every group has some", () => {
  const all = EMOJI_GROUPS.flatMap(([, emoji]) => emoji);
  assert.equal(new Set(all).size, all.length);
  for (const [heading, emoji] of EMOJI_GROUPS) assert.ok(emoji.length > 0, heading);
  assert.ok(all.every((e) => e.trim() === e && e.length > 0));
});
