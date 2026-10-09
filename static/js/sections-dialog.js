// The Sections dialog on the Ingredients page: which recipe categories it
// lists after the ingredient categories (their recipes can then be picked),
// and in what order. Each change saves as soon as it's made.

import { catalog } from "./catalog.js";
import { el, showDialogError } from "./dom.js";

/** The listed category ids, in their order on the Ingredients page. */
const listedIds = () => catalog.listedRecipeSections().map((s) => s.id);

/** Listed categories first, in their order, then the rest in recipe category order. */
function renderRows() {
  const list = document.getElementById("section-rows");
  list.replaceChildren();
  const listed = listedIds();
  const byId = new Map(catalog.recipeCategories().map((c) => [c.id, c]));
  const unlisted = catalog.recipeCategories().filter((c) => !listed.includes(c.id));
  const rows = [...listed.map((id) => byId.get(id)).filter(Boolean), ...unlisted];

  rows.forEach((category, index) => {
    const isListed = index < listed.length;
    const row = el("li", isListed ? "category-row section-row" : "category-row section-row unlisted");

    const label = el("label", "section-label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = isListed;
    // Ticked: goes at the end of the listed ones. Unticked: forgets its place.
    box.addEventListener("change", () =>
      save(box.checked ? [...listed, category.id] : listed.filter((id) => id !== category.id)),
    );
    label.append(box, el("span", null, `${category.emoji} ${category.name}`));
    row.append(label);

    if (isListed) {
      row.append(
        moveButton("↑", `Move ${category.name} up`, index === 0, () => move(listed, index, -1)),
        moveButton("↓", `Move ${category.name} down`, index === listed.length - 1, () =>
          move(listed, index, 1),
        ),
      );
    }
    list.append(row);
  });
}

function moveButton(text, label, disabled, onClick) {
  const btn = el("button", "icon-btn", text);
  btn.type = "button";
  btn.title = label;
  btn.disabled = disabled;
  btn.setAttribute("aria-label", label);
  btn.addEventListener("click", onClick);
  return btn;
}

/** Swap the listed category at index with its neighbour (step -1 up, +1 down). */
function move(listed, index, step) {
  const ids = [...listed];
  [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
  save(ids);
}

/** Save the listed ids; on failure say why and show them as stored. */
async function save(ids) {
  try {
    await catalog.setListedRecipeCategories(ids);
    showDialogError(null, "sections-error");
  } catch (err) {
    showDialogError(err.message, "sections-error");
    renderRows();
  }
}

function openSectionsDialog() {
  showDialogError(null, "sections-error");
  renderRows();
  document.getElementById("sections-dialog").showModal();
}

export function initSectionsDialog() {
  const dialog = document.getElementById("sections-dialog");
  catalog.onChange(() => {
    if (dialog.open) renderRows();
  });
  document.getElementById("sections-btn").addEventListener("click", openSectionsDialog);
  document.getElementById("sections-close").addEventListener("click", () => dialog.close());
}
