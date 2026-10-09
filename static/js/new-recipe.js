// A new recipe: the Draft, written in the New recipe dialog, with its picks
// from a pick session or the dialog's own type-ahead.

import { catalog } from "./catalog.js";
import { checkedChipIds, el, renderChips, showDialogError, showToast } from "./dom.js";
import { initItemSearch } from "./item-search.js";
import { itemKey, picksByKey, renderComponentRow } from "./items.js";
import { pickSession } from "./pick-session.js";
import { categoryChipOptions, defaultCategoryIds, recipeEmoji } from "./recipe-categories.js";

// The new recipe being written in the build dialog: {picks}, or null. picks
// is Map<itemKey, {type, id, name}> in pick order; its other fields live in
// the dialog's form until it's saved or cancelled.
let draft = null;

/** Start a new recipe: empty form, with these picks. */
function startDraft(picks = []) {
  draft = { picks: picksByKey(picks) };
  document.getElementById("build-form").reset();
  document.getElementById("build-add-suggestions").hidden = true;
  renderChips("build-categories", categoryChipOptions(), defaultCategoryIds());
}

/** From the Ingredients page: pick first, then Create opens the dialog with the picks. */
export function pickNewRecipe(picks = []) {
  pickSession.start({
    picks,
    doneLabel: "Create",
    onDone: (picked) => {
      startDraft(picked);
      openBuildDialog();
    },
  });
}

/**
 * The draft's picks in the build dialog, always editable like the recipe
 * page's ingredients in edit mode: ✕ to remove, plus the add box and picker.
 */
function renderDialogPicks() {
  const list = document.getElementById("build-dialog-picks");
  list.replaceChildren();
  if (draft.picks.size === 0) {
    list.append(el("li", "recipe-ingredients-empty", "No ingredients yet"));
  }
  for (const [key, pick] of draft.picks) {
    list.append(
      renderComponentRow(pick, {
        onRemove: () => {
          draft.picks.delete(key);
          renderDialogPicks();
        },
      }),
    );
  }
}

/** Show the build dialog for the draft. */
function openBuildDialog() {
  renderDialogPicks();
  showDialogError(null, "build-error");
  document.getElementById("build-dialog").showModal();
  document.getElementById("build-name").focus();
}

/** From the Recipes page: a new recipe, with or without link and ingredients. */
function openNewRecipe() {
  startDraft();
  openBuildDialog();
}

/** The dialog's "Pick from list": pick the draft's ingredients, then come back. */
function pickFromDialog() {
  document.getElementById("build-dialog").close();
  pickSession.start({
    picks: [...draft.picks.values()],
    doneLabel: "Done ✓",
    onDone: (picked) => {
      draft.picks = picksByKey(picked);
      openBuildDialog();
    },
    onCancel: openBuildDialog,
  });
}

async function saveBuilt(event) {
  event.preventDefault();
  const body = {
    name: document.getElementById("build-name").value,
    url: document.getElementById("build-url").value,
    notes: document.getElementById("build-notes").value,
    category_ids: checkedChipIds("build-categories"),
    components: [...draft.picks.values()],
  };
  const save = document.getElementById("build-save");
  save.disabled = true;
  try {
    const recipe = await catalog.createRecipe(body);
    document.getElementById("build-dialog").close();
    draft = null;
    showToast(`“${recipe.name}” saved! ${recipeEmoji(recipe)}`);
  } catch (err) {
    showDialogError(err.message, "build-error");
  } finally {
    save.disabled = false;
  }
}

export function initNewRecipe() {
  document.getElementById("new-recipe-btn").addEventListener("click", () => pickNewRecipe());
  document.getElementById("new-recipe-link-btn").addEventListener("click", openNewRecipe);
  document.getElementById("build-form").addEventListener("submit", saveBuilt);
  document.getElementById("build-pick").addEventListener("click", pickFromDialog);
  initItemSearch(
    "build-add-input",
    "build-add-suggestions",
    (key) => draft.picks.has(key),
    (item) => {
      draft.picks.set(itemKey(item), item);
      renderDialogPicks();
    },
  );
  document.getElementById("build-dialog-cancel").addEventListener("click", () => {
    document.getElementById("build-dialog").close();
    draft = null;
  });
}
