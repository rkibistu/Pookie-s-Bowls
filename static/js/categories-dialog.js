// The Categories dialog on the Recipes page: every recipe category in its
// order, to rename (name and emoji), move ↑/↓, delete, and add new ones.
// Each change saves as soon as it's made.

import { catalog } from "./catalog.js";
import { el, showDialogError } from "./dom.js";
import { attachEmojiPicker } from "./emoji-picker.js";

let armedId = null; // the category whose 🗑 was tapped once, if any

/** One row per category, keeping focus on the field that had it. */
function renderRows() {
  const focused = document.activeElement?.dataset.focusKey;
  const list = document.getElementById("category-rows");
  list.replaceChildren();
  const categories = catalog.recipeCategories();
  categories.forEach((category, index) => {
    const row = el("li", "category-row");
    row.append(
      fieldInput(category, "emoji", "category-emoji", `${category.name}'s emoji`),
      fieldInput(category, "name", "category-name", `${category.name}'s name`),
      rowButton("↑", `Move ${category.name} up`, index === 0, () => move(index, -1)),
      rowButton("↓", `Move ${category.name} down`, index === categories.length - 1, () =>
        move(index, 1),
      ),
      deleteButton(category),
    );
    list.append(row);
  });
  if (focused) list.querySelector(`[data-focus-key="${focused}"]`)?.focus();
}

/** A text box for one field; a changed value saves when you leave it (or press Enter). */
function fieldInput(category, field, className, label) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = className;
  input.value = category[field];
  input.maxLength = field === "emoji" ? 8 : 40;
  input.autocomplete = "off";
  input.dataset.focusKey = `${category.id}:${field}`;
  input.setAttribute("aria-label", label);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
  });
  if (field === "emoji") attachEmojiPicker(input);
  input.addEventListener("change", () => {
    const value = input.value.trim();
    if (value === category[field]) return;
    run(() => catalog.changeRecipeCategory(category.id, { [field]: value }));
  });
  return input;
}

function rowButton(text, label, disabled, onClick) {
  const btn = el("button", "icon-btn", text);
  btn.type = "button";
  btn.title = label;
  btn.disabled = disabled;
  btn.setAttribute("aria-label", label);
  btn.addEventListener("click", onClick);
  return btn;
}

/** First tap arms the 🗑, second tap deletes. */
function deleteButton(category) {
  const armed = armedId === category.id;
  const btn = rowButton(armed ? "Delete?" : "🗑", `Delete ${category.name}`, false, () => {
    if (armedId !== category.id) {
      armedId = category.id;
      renderRows();
      return;
    }
    run(() => catalog.deleteRecipeCategory(category.id));
  });
  if (armed) btn.className = "danger-btn category-delete-armed";
  return btn;
}

/** Swap the category at index with its neighbour (step -1 up, +1 down). */
function move(index, step) {
  const ids = catalog.recipeCategories().map((c) => c.id);
  [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
  run(() => catalog.reorderRecipeCategories(ids));
}

/** Save one change; on failure say why and show the categories as stored. */
async function run(save) {
  armedId = null;
  try {
    await save();
    showDialogError(null, "categories-error");
    return true;
  } catch (err) {
    showDialogError(err.message, "categories-error");
    renderRows();
    return false;
  }
}

async function addCategory(event) {
  event.preventDefault();
  const emoji = document.getElementById("category-add-emoji");
  const name = document.getElementById("category-add-name");
  const added = await run(() =>
    catalog.createRecipeCategory({ name: name.value, emoji: emoji.value }),
  );
  if (added) document.getElementById("category-add-form").reset();
}

function openCategoriesDialog() {
  armedId = null;
  showDialogError(null, "categories-error");
  document.getElementById("category-add-form").reset();
  renderRows();
  document.getElementById("categories-dialog").showModal();
}

export function initCategoriesDialog() {
  const dialog = document.getElementById("categories-dialog");
  catalog.onChange(() => {
    if (dialog.open) renderRows();
  });
  document.getElementById("recipe-categories-btn").addEventListener("click", openCategoriesDialog);
  document.getElementById("category-add-form").addEventListener("submit", addCategory);
  attachEmojiPicker(document.getElementById("category-add-emoji"));
  document.getElementById("categories-close").addEventListener("click", () => dialog.close());
}
