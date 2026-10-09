// The Station dialog: the station being shown, its name and emoji, the
// recipe category its new recipes start in, its ingredient sections (rename,
// ↑/↓, delete, add), then the recipe categories it lists (tick to list,
// untick to unlist, ↑/↓). A new recipe category can be made right here, for
// new recipes to start in or to list. Each change saves as soon as it's made.
// Also the New station dialog, and deleting a station.

import { catalog } from "./catalog.js";
import { el, resetDeleteButton, showDialogError, showToast } from "./dom.js";
import { attachEmojiPicker } from "./emoji-picker.js";
import { showStation } from "./station.js";

let armedId = null; // the section whose 🗑 was tapped once, if any

// In the "New recipes start as" dropdown: opens the new category row under it.
const NEW_CATEGORY = "new";

const ingredientSections = (station) => station.sections.filter((s) => s.kind === "ingredients");
const listedCategories = (station) => station.sections.filter((s) => s.kind === "recipes");

/** Everything in the dialog, from the station as stored, keeping focus where it was. */
function render() {
  const station = catalog.currentStation();
  if (!station) return;
  const focused = document.activeElement?.dataset.focusKey;

  setUnlessFocused("station-emoji", station.emoji);
  setUnlessFocused("station-name", station.name);
  renderRecipeCategorySelect(station);
  renderIngredientSectionRows(station);
  renderCategoryRows(station);
  document.getElementById("station-delete").hidden = catalog.stations().length < 2;

  if (focused) document.querySelector(`#station-dialog [data-focus-key="${focused}"]`)?.focus();
}

function setUnlessFocused(id, value) {
  const input = document.getElementById(id);
  if (document.activeElement !== input) input.value = value;
}

function renderRecipeCategorySelect(station) {
  const select = document.getElementById("station-recipe-category");
  select.replaceChildren(new Option("The first recipe category", ""));
  for (const category of catalog.recipeCategories()) {
    select.append(new Option(`${category.emoji} ${category.name}`, String(category.id)));
  }
  select.append(new Option("＋ New category…", NEW_CATEGORY));
  select.value = station.recipe_category_id == null ? "" : String(station.recipe_category_id);
}

/** The station's ingredient sections, in order. */
function renderIngredientSectionRows(station) {
  const sections = ingredientSections(station);
  const list = document.getElementById("station-section-rows");
  list.replaceChildren();
  sections.forEach((section, index) => {
    const row = el("li", "category-row section-row");
    row.append(nameInput(section), ...moveButtons(station, sections, index), deleteButton(section));
    list.append(row);
  });
}

/** The recipe categories the station lists, in order, then the ones it doesn't. */
function renderCategoryRows(station) {
  const listed = listedCategories(station);
  const list = document.getElementById("station-category-rows");
  list.replaceChildren();
  listed.forEach((section, index) => {
    const row = el("li", "category-row section-row");
    row.append(
      listedBox(`${section.emoji} ${section.name}`, true, () => catalog.deleteSection(section.id)),
      ...moveButtons(station, listed, index),
    );
    list.append(row);
  });

  const listedIds = new Set(listed.map((s) => s.recipe_category_id));
  for (const category of catalog.recipeCategories()) {
    if (listedIds.has(category.id)) continue;
    const row = el("li", "category-row section-row unlisted");
    row.append(
      listedBox(`${category.emoji} ${category.name}`, false, () =>
        catalog.addSection(station.id, { recipe_category_id: category.id }),
      ),
    );
    list.append(row);
  }
}

/** An ingredient section's name; a changed name saves when you leave it (or press Enter). */
function nameInput(section) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "category-name";
  input.value = section.name;
  input.maxLength = 40;
  input.autocomplete = "off";
  input.dataset.focusKey = `section:${section.id}`;
  input.setAttribute("aria-label", `${section.name}'s name`);
  blurOnEnter(input);
  input.addEventListener("change", () => {
    if (input.value.trim() === section.name) return;
    run(() => catalog.renameSection(section.id, input.value));
  });
  return input;
}

/** A recipe category's checkbox: ticking lists it at the end, unticking unlists it. */
function listedBox(text, checked, toggle) {
  const label = el("label", "section-label");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = checked;
  box.addEventListener("change", () => run(toggle));
  label.append(box, el("span", null, text));
  return label;
}

function iconButton(text, label, disabled, onClick) {
  const btn = el("button", "icon-btn", text);
  btn.type = "button";
  btn.title = label;
  btn.disabled = disabled;
  btn.setAttribute("aria-label", label);
  btn.addEventListener("click", onClick);
  return btn;
}

/**
 * ↑ and ↓: swap the section at index with its neighbour in group (the
 * ingredient sections, or the listed categories); ingredient sections stay
 * first.
 */
function moveButtons(station, group, index) {
  const { name } = group[index];
  const move = (step) => {
    const ids = group.map((s) => s.id);
    [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    const others = station.sections.filter((s) => !group.includes(s)).map((s) => s.id);
    const order = group[index].kind === "ingredients" ? [...ids, ...others] : [...others, ...ids];
    run(() => catalog.reorderSections(station.id, order));
  };
  return [
    iconButton("↑", `Move ${name} up`, index === 0, () => move(-1)),
    iconButton("↓", `Move ${name} down`, index === group.length - 1, () => move(1)),
  ];
}

/** First tap arms the 🗑, second tap deletes; its ingredients just leave the section. */
function deleteButton(section) {
  const armed = armedId === section.id;
  const btn = iconButton(armed ? "Delete?" : "🗑", `Delete ${section.name}`, false, () => {
    if (armedId !== section.id) {
      armedId = section.id;
      render();
      return;
    }
    run(() => catalog.deleteSection(section.id));
  });
  if (armed) btn.className = "danger-btn category-delete-armed";
  return btn;
}

function blurOnEnter(input) {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
  });
}

/** Save one change; on failure say why and show the station as stored. */
async function run(save) {
  armedId = null;
  try {
    await save();
    showDialogError(null, "station-dialog-error");
    return true;
  } catch (err) {
    showDialogError(err.message, "station-dialog-error");
    render();
    return false;
  }
}

/** The station's name or emoji, saved when you leave the box. */
function wireStationField(id, field) {
  const input = document.getElementById(id);
  input.dataset.focusKey = `station:${field}`;
  blurOnEnter(input);
  input.addEventListener("change", async () => {
    const station = catalog.currentStation();
    if (input.value.trim() === station[field]) return;
    if (!(await run(() => catalog.changeStation(station.id, { [field]: input.value })))) {
      input.value = catalog.currentStation()[field];
    }
  });
}

async function addSection(event) {
  event.preventDefault();
  const name = document.getElementById("section-add-name");
  const station = catalog.currentStation();
  if (await run(() => catalog.addSection(station.id, { name: name.value }))) name.value = "";
}

/** A new recipe category from formId's row; then({station, category}) uses it. */
async function addCategory(formId, then) {
  const form = document.getElementById(formId);
  const station = catalog.currentStation();
  const added = await run(async () => {
    const category = await catalog.createRecipeCategory({
      name: form.querySelector(".category-name").value,
      emoji: form.querySelector(".category-emoji").value,
    });
    await then({ station, category });
  });
  if (added) form.reset();
  return added;
}

/** The dropdown's new category: new recipes on this station start in it. */
async function addStartCategory(event) {
  event.preventDefault();
  const added = await addCategory("start-category-add-form", ({ station, category }) =>
    catalog.changeStation(station.id, { recipe_category_id: category.id }),
  );
  if (added) closeStartCategoryRow();
}

/** The categories part's new category: listed on this station, after the others. */
function addListedCategory(event) {
  event.preventDefault();
  addCategory("station-category-add-form", ({ station, category }) =>
    catalog.addSection(station.id, { recipe_category_id: category.id }),
  );
}

function openStartCategoryRow() {
  const form = document.getElementById("start-category-add-form");
  form.hidden = false;
  form.querySelector(".category-name").focus();
}

function closeStartCategoryRow() {
  const form = document.getElementById("start-category-add-form");
  form.reset();
  form.hidden = true;
}

/** First tap arms the button, second tap deletes; the last station can't go. */
async function deleteStation() {
  const del = document.getElementById("station-delete");
  if (!del.dataset.armed) {
    del.dataset.armed = "1";
    del.textContent = "Really delete?";
    return;
  }
  const station = catalog.currentStation();
  try {
    await catalog.deleteStation(station.id);
    document.getElementById("station-dialog").close();
    showToast(`${station.emoji} ${station.name} deleted`);
  } catch (err) {
    showDialogError(err.message, "station-dialog-error");
  } finally {
    resetStationDelete();
  }
}

function resetStationDelete() {
  resetDeleteButton("station-delete");
  document.getElementById("station-delete").textContent = "Delete station";
}

function openNewStationDialog() {
  document.getElementById("new-station-form").reset();
  showDialogError(null, "new-station-error");
  document.getElementById("new-station-dialog").showModal();
  document.getElementById("new-station-emoji").focus();
}

/** Create it, show it, and open its Station dialog to give it sections. */
async function createStation(event) {
  event.preventDefault();
  const save = document.getElementById("new-station-save");
  save.disabled = true;
  try {
    const station = await catalog.createStation({
      name: document.getElementById("new-station-name").value,
      emoji: document.getElementById("new-station-emoji").value,
    });
    document.getElementById("new-station-dialog").close();
    showStation(station.id);
    openStationDialog();
  } catch (err) {
    showDialogError(err.message, "new-station-error");
  } finally {
    save.disabled = false;
  }
}

function openStationDialog() {
  armedId = null;
  resetStationDelete();
  showDialogError(null, "station-dialog-error");
  document.getElementById("section-add-name").value = "";
  document.getElementById("station-category-add-form").reset();
  closeStartCategoryRow();
  document.getElementById("station-emoji").value = "";
  document.getElementById("station-name").value = "";
  render();
  document.getElementById("station-dialog").showModal();
}

export function initStationDialog() {
  const dialog = document.getElementById("station-dialog");
  catalog.onChange(() => {
    if (dialog.open) render();
  });
  wireStationField("station-emoji", "emoji");
  wireStationField("station-name", "name");
  document.getElementById("station-recipe-category").addEventListener("change", (event) => {
    const value = event.target.value;
    const station = catalog.currentStation();
    if (value === NEW_CATEGORY) {
      // Show the stored choice until the new category is added.
      renderRecipeCategorySelect(station);
      openStartCategoryRow();
      return;
    }
    run(() => catalog.changeStation(station.id, { recipe_category_id: value ? Number(value) : null }));
  });
  document.getElementById("start-category-add-form").addEventListener("submit", addStartCategory);
  document
    .getElementById("start-category-add-cancel")
    .addEventListener("click", closeStartCategoryRow);
  document.getElementById("section-add-form").addEventListener("submit", addSection);
  document.getElementById("station-category-add-form").addEventListener("submit", addListedCategory);
  for (const id of [
    "station-emoji",
    "start-category-add-emoji",
    "station-category-add-emoji",
    "new-station-emoji",
  ]) {
    attachEmojiPicker(document.getElementById(id));
  }
  document.getElementById("station-btn").addEventListener("click", openStationDialog);
  document.getElementById("station-close").addEventListener("click", () => dialog.close());
  document.getElementById("station-delete").addEventListener("click", deleteStation);

  document.getElementById("new-station-btn").addEventListener("click", openNewStationDialog);
  document.getElementById("new-station-form").addEventListener("submit", createStation);
  document
    .getElementById("new-station-cancel")
    .addEventListener("click", () => document.getElementById("new-station-dialog").close());
}
