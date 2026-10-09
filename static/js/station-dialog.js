// The Station dialog: the station being shown, its name and emoji, the
// recipe category its new recipes start in, and its sections in one ↑/↓
// list — ingredient sections (rename, delete, add) mixed with the recipe
// categories it lists (tick to list, untick to unlist) — and a new recipe
// category, without leaving for the Recipes page. Each change saves as soon
// as it's made. Also the New station dialog, and deleting a station.

import { catalog } from "./catalog.js";
import { el, resetDeleteButton, showDialogError, showToast } from "./dom.js";
import { showStation } from "./station.js";

let armedId = null; // the section whose 🗑 was tapped once, if any

/** Everything in the dialog, from the station as stored, keeping focus where it was. */
function render() {
  const station = catalog.currentStation();
  if (!station) return;
  const focused = document.activeElement?.dataset.focusKey;

  setUnlessFocused("station-emoji", station.emoji);
  setUnlessFocused("station-name", station.name);
  renderRecipeCategorySelect(station);
  renderSectionRows(station);
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
  select.value = station.recipe_category_id == null ? "" : String(station.recipe_category_id);
}

/** The station's sections in order, then the recipe categories it doesn't list. */
function renderSectionRows(station) {
  const list = document.getElementById("station-section-rows");
  list.replaceChildren();
  const { sections } = station;
  sections.forEach((section, index) => {
    const row = el("li", "category-row section-row");
    if (section.kind === "ingredients") {
      row.append(nameInput(section), ...moveButtons(station, index), deleteButton(section));
    } else {
      row.append(
        listedBox(`${section.emoji} ${section.name}`, true, () =>
          catalog.deleteSection(section.id),
        ),
        ...moveButtons(station, index),
      );
    }
    list.append(row);
  });

  const listed = new Set(sections.map((s) => s.recipe_category_id).filter((id) => id != null));
  for (const category of catalog.recipeCategories()) {
    if (listed.has(category.id)) continue;
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

/** ↑ and ↓: swap the section at index with its neighbour. */
function moveButtons(station, index) {
  const { name } = station.sections[index];
  const move = (step) => {
    const ids = station.sections.map((s) => s.id);
    [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    run(() => catalog.reorderSections(station.id, ids));
  };
  return [
    iconButton("↑", `Move ${name} up`, index === 0, () => move(-1)),
    iconButton("↓", `Move ${name} down`, index === station.sections.length - 1, () => move(1)),
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

/**
 * A new recipe category, not listed. If the station's new recipes start in
 * "the first recipe category", they start in this one now; a category already
 * chosen stays.
 */
async function addCategory(event) {
  event.preventDefault();
  const form = document.getElementById("station-category-add-form");
  const station = catalog.currentStation();
  const startsInFirst = station.recipe_category_id == null;
  const added = await run(async () => {
    const category = await catalog.createRecipeCategory({
      name: document.getElementById("station-category-add-name").value,
      emoji: document.getElementById("station-category-add-emoji").value,
    });
    if (startsInFirst) await catalog.changeStation(station.id, { recipe_category_id: category.id });
  });
  if (added) form.reset();
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
    run(() => catalog.changeStation(station.id, { recipe_category_id: value ? Number(value) : null }));
  });
  document.getElementById("section-add-form").addEventListener("submit", addSection);
  document.getElementById("station-category-add-form").addEventListener("submit", addCategory);
  document.getElementById("station-btn").addEventListener("click", openStationDialog);
  document.getElementById("station-close").addEventListener("click", () => dialog.close());
  document.getElementById("station-delete").addEventListener("click", deleteStation);

  document.getElementById("new-station-btn").addEventListener("click", openNewStationDialog);
  document.getElementById("new-station-form").addEventListener("submit", createStation);
  document
    .getElementById("new-station-cancel")
    .addEventListener("click", () => document.getElementById("new-station-dialog").close());
}
