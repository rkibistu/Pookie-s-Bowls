// The recipe dialog: one recipe, every part of it editable in place and
// saved as soon as it changes.

import { api } from "./api.js";
import { catalog } from "./catalog.js";
import {
  checkedChipIds,
  el,
  renderChips,
  resetDeleteButton,
  showDialogError,
  showToast,
} from "./dom.js";
import { initItemSearch } from "./item-search.js";
import { itemKey, renderComponentRow } from "./items.js";
import { pickSession } from "./pick-session.js";
import { categoryChipOptions } from "./recipe-categories.js";

let shownRecipe = null; // recipe shown in the recipe dialog
let recipeChanged = false; // saved something since the dialog opened
let editingIngredients = false; // ingredient list shows ✕, add box and picker link
let recipeSaving = Promise.resolve(); // saves run one after another

/** Fetch a recipe and show it in the recipe dialog. */
export async function openRecipe(id) {
  try {
    shownRecipe = await api("GET", `/api/recipes/${id}`);
  } catch (err) {
    showToast(`Couldn't open recipe: ${err.message}`);
    return;
  }
  editingIngredients = false;
  document.getElementById("recipe-add-input").value = "";
  document.getElementById("recipe-add-suggestions").hidden = true;
  resetDeleteButton("recipe-delete");
  showDialogError(null, "recipe-error");
  renderRecipeDialog();
  const dialog = document.getElementById("recipe-dialog");
  if (!dialog.open) dialog.showModal(); // already open when following a sub-recipe
}

/** Fill the recipe dialog from shownRecipe; every part of it is editable. */
function renderRecipeDialog() {
  const recipe = shownRecipe;

  // A recipe needs a category, so the last one can't be unticked.
  renderChips(
    "recipe-categories",
    categoryChipOptions(),
    new Set(recipe.categories.map((c) => c.id)),
  );
  document.querySelectorAll("#recipe-categories input").forEach((box) => {
    box.disabled = box.checked && recipe.categories.length === 1;
  });

  document.getElementById("recipe-title").textContent = recipe.name;

  document.getElementById("recipe-url-row").hidden = !recipe.url;
  document.getElementById("recipe-url-add").hidden = Boolean(recipe.url);
  const link = document.getElementById("recipe-url");
  if (recipe.url) link.href = recipe.url; // server only accepts http(s)
  else link.removeAttribute("href");

  document.getElementById("recipe-ingredients-edit").textContent = editingIngredients
    ? "Done"
    : "✏️ Edit";
  document.getElementById("recipe-ingredients-tools").hidden = !editingIngredients;
  const list = document.getElementById("recipe-ingredients");
  list.replaceChildren();
  if (recipe.components.length === 0) {
    list.append(el("li", "recipe-ingredients-empty", "No ingredients yet"));
  }
  for (const component of recipe.components) {
    list.append(renderRecipeComponent(component));
  }

  const notes = document.getElementById("recipe-notes");
  notes.textContent = recipe.notes || "Tap to add notes…";
  notes.classList.toggle("empty", !recipe.notes);
}

/** One of the shown recipe's ingredient rows (✕ to remove while editing). */
function renderRecipeComponent(component) {
  const key = itemKey(component);
  return renderComponentRow(component, {
    onOpen: () => openRecipe(component.id),
    onRemove: editingIngredients
      ? () =>
          saveRecipePatch({
            components: shownRecipe.components.filter((c) => itemKey(c) !== key),
          })
      : null,
  });
}

/** Save some of the shown recipe's fields, then redraw it from the server's answer. */
function saveRecipePatch(fields) {
  const id = shownRecipe.id;
  const dialog = document.getElementById("recipe-dialog");
  recipeSaving = recipeSaving.then(async () => {
    const stillShown = () => dialog.open && shownRecipe.id === id;
    try {
      const recipe = await api("PATCH", `/api/recipes/${id}`, fields);
      recipeChanged = true;
      if (stillShown()) {
        shownRecipe = recipe;
        showDialogError(null, "recipe-error");
        renderRecipeDialog();
      }
      showToast("Saved ✓");
    } catch (err) {
      if (stillShown()) {
        showDialogError(err.message, "recipe-error");
        renderRecipeDialog(); // undo what the failed change showed
      } else {
        showToast(`Couldn't save: ${err.message}`);
      }
    }
  });
  return recipeSaving;
}

/**
 * Swap a shown element for a text box holding value. Leaving it or Enter
 * (single line only) saves through onSave if it changed; Escape undoes.
 */
function editInPlace(display, { value, multiline = false, placeholder = "", onSave }) {
  const input = document.createElement(multiline ? "textarea" : "input");
  input.className = "inline-edit";
  input.value = value;
  input.placeholder = placeholder;
  // Same look and spot as the text it replaces, so nothing jumps.
  const style = getComputedStyle(display);
  input.style.font = style.font;
  input.style.margin = style.margin;

  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    input.replaceWith(display);
    if (save && input.value.trim() !== value.trim()) onSave(input.value);
  };
  const grow = () => {
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight + 4}px`;
  };
  input.addEventListener("blur", () => finish(true));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault(); // undo the edit, don't close the dialog
      finish(false);
      display.focus();
    } else if (event.key === "Enter" && !multiline) {
      event.preventDefault();
      finish(true);
    }
  });
  if (multiline) input.addEventListener("input", grow);

  display.replaceWith(input);
  if (multiline) grow();
  input.focus();
}

/** Tap (or Enter on) an element to edit it in place. */
function makeEditable(id, options) {
  const display = document.getElementById(id);
  const start = () => editInPlace(display, options());
  display.addEventListener("click", start);
  display.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      start();
    }
  });
}

/** First tap arms the button, second tap deletes. */
async function deleteRecipe() {
  const del = document.getElementById("recipe-delete");
  if (!del.dataset.armed) {
    del.dataset.armed = "1";
    del.textContent = "Really delete?";
    return;
  }
  try {
    await api("DELETE", `/api/recipes/${shownRecipe.id}`);
    recipeChanged = true;
    document.getElementById("recipe-dialog").close();
  } catch (err) {
    resetDeleteButton("recipe-delete");
    showDialogError(err.message, "recipe-error");
  }
}

export function initRecipeDialog() {
  // Everything on the recipe dialog saves as soon as it changes.
  makeEditable("recipe-title", () => ({
    value: shownRecipe.name,
    onSave: (name) => saveRecipePatch({ name }),
  }));
  makeEditable("recipe-notes", () => ({
    value: shownRecipe.notes || "",
    multiline: true,
    onSave: (notes) => saveRecipePatch({ notes }),
  }));
  // Clearing the link removes it.
  document.getElementById("recipe-url-edit").addEventListener("click", () => {
    editInPlace(document.getElementById("recipe-url-row"), {
      value: shownRecipe.url,
      onSave: (url) => saveRecipePatch({ url }),
    });
  });
  document.getElementById("recipe-url-add").addEventListener("click", () => {
    editInPlace(document.getElementById("recipe-url-add"), {
      value: "",
      placeholder: "https://…",
      onSave: (url) => saveRecipePatch({ url }),
    });
  });
  document.getElementById("recipe-categories").addEventListener("change", () => {
    saveRecipePatch({ category_ids: checkedChipIds("recipe-categories") });
  });
  document.getElementById("recipe-ingredients-edit").addEventListener("click", () => {
    editingIngredients = !editingIngredients;
    renderRecipeDialog();
    if (editingIngredients) document.getElementById("recipe-add-input").focus();
  });
  initItemSearch(
    "recipe-add-input",
    "recipe-add-suggestions",
    // Already in it, or the recipe itself.
    (key) =>
      key === `recipe:${shownRecipe.id}` || shownRecipe.components.some((c) => itemKey(c) === key),
    (item) => saveRecipePatch({ components: [...shownRecipe.components, item] }),
  );
  document.getElementById("recipe-pick").addEventListener("click", () => {
    const recipe = shownRecipe;
    document.getElementById("recipe-dialog").close();
    // Done saves the picks as the recipe's ingredients, then shows it again.
    pickSession.start({
      picks: recipe.components,
      blocked: [`recipe:${recipe.id}`],
      title: `🥣 ${recipe.name}`,
      doneLabel: "Done ✓",
      onDone: async (picked) => {
        try {
          await api("PATCH", `/api/recipes/${recipe.id}`, { components: picked });
        } catch (err) {
          showToast(`Couldn't save: ${err.message}`);
          throw err;
        }
        showToast("Saved ✓");
        openRecipe(recipe.id);
      },
      onCancel: () => openRecipe(recipe.id),
    });
  });

  document.getElementById("recipe-delete").addEventListener("click", deleteRecipe);
  const dialog = document.getElementById("recipe-dialog");
  document.getElementById("recipe-close").addEventListener("click", () => dialog.close());
  // Once closed (and any last save is done), refresh what the change shows up in.
  dialog.addEventListener("close", async () => {
    await recipeSaving;
    if (!recipeChanged) return;
    recipeChanged = false;
    await catalog.reload();
  });
}
