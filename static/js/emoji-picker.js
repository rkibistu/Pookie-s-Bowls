// The emoji picker: tapping an emoji box opens a panel under it with a set of
// food, kitchen and drink emoji. Tapping one fills the box and fires its
// "change", so it saves the way typing does. Typing or pasting still works.

import { el } from "./dom.js";

/** The emoji offered, in groups: [heading, emoji]. */
export const EMOJI_GROUPS = [
  ["Bowls & dishes", "🥣 🥗 🍲 🍜 🍝 🍛 🍣 🍱 🍙 🍚 🥘 🫕 🌮 🌯 🥙 🍔 🍕 🌭 🥪 🍟 🥟 🥞 🧇 🍳"],
  ["Meat & fish", "🍗 🍖 🥩 🥓 🍤 🐟 🦐 🦑 🐙 🦀 🦞 🦪 🥚"],
  ["Vegetables", "🥑 🥦 🥬 🥒 🌶️ 🫑 🌽 🥕 🧅 🧄 🥔 🍠 🍅 🍆 🫛 🫘 🥜 🍄 🌿 🫚"],
  ["Fruit", "🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝"],
  ["Bread, dairy & sweet", "🍞 🥐 🥖 🥯 🧀 🧈 🥛 🍦 🍰 🧁 🍪 🍫 🍯 🍮"],
  ["Drinks", "☕ 🍵 🧃 🥤 🧋 🍹 🍷 🍺 🥂"],
  ["Kitchen", "🥫 🧂 🫙 🍴 🔪 🥢 🔥 ❄️ ⭐ ✨ 💜 💚"],
].map(([heading, emoji]) => [heading, emoji.split(" ")]);

let open = null; // {input, panel} while a panel is shown

function close() {
  if (!open) return;
  open.panel.closest(".category-row")?.classList.remove("picking");
  open.panel.remove();
  open = null;
}

function show(input) {
  const panel = el("div", "emoji-panel");
  for (const [heading, emoji] of EMOJI_GROUPS) {
    panel.append(el("p", "emoji-panel-heading", heading));
    const grid = el("div", "emoji-grid");
    for (const emojiChar of emoji) {
      const btn = el("button", "emoji-choice", emojiChar);
      btn.type = "button";
      btn.setAttribute("aria-label", emojiChar);
      btn.addEventListener("click", () => {
        close();
        input.value = emojiChar;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      grid.append(btn);
    }
    panel.append(grid);
  }
  // Under the box: the last thing in its row, wrapped onto a line of its own.
  const row = input.closest(".category-row");
  row.classList.add("picking");
  row.append(panel);
  open = { input, panel };
}

/** Give an emoji box the picker: a tap opens (or shuts) it, typing shuts it. */
export function attachEmojiPicker(input) {
  input.addEventListener("click", () => {
    const wasOpen = open?.input === input;
    close();
    if (!wasOpen) show(input);
  });
  input.addEventListener("input", close);
  input.addEventListener("keydown", (event) => {
    // Escape shuts the panel first, not the dialog.
    if (event.key === "Escape" && open?.input === input) {
      event.preventDefault();
      close();
    }
  });
}

/** Tapping anywhere else, or a dialog closing, shuts the panel. */
export function initEmojiPicker() {
  document.addEventListener("pointerdown", (event) => {
    if (open && !open.panel.contains(event.target) && event.target !== open.input) close();
  });
  for (const dialog of document.querySelectorAll("dialog")) {
    dialog.addEventListener("close", close);
  }
}
