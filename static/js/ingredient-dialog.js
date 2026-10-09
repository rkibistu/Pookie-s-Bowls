// The ingredient dialog: editing one ingredient (its name, its sections on
// every station, deleting it), or adding one. Adding suggests existing
// ingredients as you type; the server decides whether the name is new or
// reuses one (adding never makes a duplicate, and only ever adds sections).

import { catalog } from "./catalog.js";
import { el, renderChips, resetDeleteButton, showDialogError, showToast } from "./dom.js";
import { initItemSearch } from "./item-search.js";

let editing = null; // the ingredient being edited, or null while adding
// While adding, where it goes: {station} (tick its sections), {section} (that
// one), or {} (the All ingredients page: tick sections on any station, or
// none for an orphan).
let adding = null;
let chipView = null; // {stations, folded}: the section chips being shown
let recognisedId = null; // while adding: the existing ingredient the name matches, if any

const nameInput = () => document.getElementById("ingredient-name");
const storedIngredient = (id) => catalog.ingredients().find((i) => i.id === id);
const ingredientSections = (station) => station.sections.filter((s) => s.kind === "ingredients");

/** Every station, the one being shown first. */
function stationsCurrentFirst() {
  const current = catalog.currentStation();
  return [current, ...catalog.stations().filter((s) => s !== current)].filter(Boolean);
}

/** Edit an ingredient (a row's item or the catalog's): name, sections everywhere, delete. */
export function openIngredientDialog(ingredient) {
  editing = storedIngredient(ingredient.id) ?? ingredient;
  adding = null;
  show({
    title: "Edit ingredient",
    name: editing.name,
    chipStations: stationsCurrentFirst(),
    selected: new Set(editing.section_ids ?? []),
    folded: false,
  });
}

/**
 * Add an ingredient: on a station ({station}, tick which of its sections),
 * into one section ({section}), or on the All ingredients page ({}: every
 * station's sections, folded away until opened).
 */
export function openAddIngredient(where = {}) {
  editing = null;
  adding = where;
  let chipStations = [];
  if (where.station) chipStations = [where.station];
  else if (!where.section) chipStations = stationsCurrentFirst();
  show({
    title: where.section ? `Add to ${where.section.name}` : "Add ingredient",
    name: "",
    chipStations,
    selected: new Set(),
    folded: !where.station,
  });
}

function show({ title, name, chipStations, selected, folded }) {
  document.getElementById("ingredient-dialog-title").textContent = title;
  nameInput().value = name;
  document.getElementById("ingredient-suggestions").hidden = true;
  chipView = { stations: chipStations, folded };
  recognisedId = null;
  renderSectionChips(selected);
  document.getElementById("ingredient-sections-field").hidden = chipStations.length === 0;
  document.getElementById("ingredient-delete").hidden = !editing;
  resetDeleteButton("ingredient-delete");
  showDialogError(null, "ingredient-error");
  const dialog = document.getElementById("ingredient-dialog");
  if (!dialog.open) dialog.showModal();
  if (!editing) nameInput().focus();
}

/**
 * One group of chips per station: the ingredient sections it's in. None
 * ticked is fine. Each group folds open and shut; folded, it starts shut
 * unless something in it is ticked. Its title counts what's ticked.
 * already: sections it's in already, shown ticked and greyed out (adding
 * can't take it out of them).
 */
function renderSectionChips(selected, already = new Set()) {
  const box = document.getElementById("ingredient-section-chips");
  box.replaceChildren();
  for (const station of chipView.stations) {
    const sections = ingredientSections(station);
    const group = el("details", "chip-group");
    const title = el("summary", "chip-group-title");
    const chips = el("div", "chips");
    chips.id = `ingredient-station-${station.id}`;
    group.append(title, chips);
    if (sections.length === 0) chips.append(el("p", "dialog-hint", "No ingredient sections yet"));
    box.append(group);
    if (sections.length) renderChips(chips.id, sections, new Set([...selected, ...already]));
    for (const input of chips.querySelectorAll("input")) {
      if (!already.has(Number(input.value))) continue;
      input.disabled = true;
      input.parentElement.classList.add("already");
      input.parentElement.title = "Already here";
    }

    const countTicked = () => {
      const ticked = chips.querySelectorAll("input:checked").length;
      title.textContent = `${station.emoji} ${station.name}${ticked ? ` · ${ticked} ticked` : ""}`;
      return ticked;
    };
    chips.addEventListener("change", countTicked);
    group.open = !chipView.folded || countTicked() > 0;
    countTicked();
  }
}

/** The sections ticked; newOnly leaves out the greyed-out ones it's already in. */
const tickedSectionIds = ({ newOnly = false } = {}) =>
  [
    ...document.querySelectorAll(
      `#ingredient-section-chips input:checked${newOnly ? ":not(:disabled)" : ""}`,
    ),
  ].map((box) => Number(box.value));

/** The ingredient in the catalog with this name, ignoring case, if any. */
function existingIngredient(name) {
  const wanted = name.trim().toLowerCase();
  return catalog.ingredients().find((i) => i.name.toLowerCase() === wanted) ?? null;
}

/**
 * While adding: when the name starts or stops matching an existing
 * ingredient, grey out the sections it's in, keeping what's ticked. Only
 * for show: the server decides on save.
 */
function recogniseName() {
  if (editing) return;
  const existing = existingIngredient(nameInput().value);
  if ((existing?.id ?? null) === recognisedId) return;
  recognisedId = existing?.id ?? null;
  const ticked = new Set(tickedSectionIds({ newOnly: true }));
  renderSectionChips(ticked, new Set(existing?.section_ids ?? []));
}

/** A suggestion was chosen: it fills in the name, same as typing it. */
function choose(item) {
  nameInput().value = storedIngredient(item.id)?.name ?? item.name;
  recogniseName();
}

/** "Protein", or "Poke · Protein" on All ingredients: the section as named here. */
function sectionLabel(id) {
  for (const station of catalog.stations()) {
    const section = ingredientSections(station).find((s) => s.id === id);
    if (!section) continue;
    return adding.station || adding.section ? section.name : `${station.name} · ${section.name}`;
  }
  return null;
}

async function save() {
  const name = nameInput().value;
  if (editing) {
    // Only what was changed here, so a change from the other phone survives.
    const before = new Set(editing.section_ids ?? []);
    const after = new Set(tickedSectionIds());
    const fields = {
      add_section_ids: [...after].filter((id) => !before.has(id)),
      remove_section_ids: [...before].filter((id) => !after.has(id)),
    };
    if (name.trim() !== editing.name) fields.name = name;
    await catalog.changeIngredient(editing.id, fields);
    return;
  }
  const sectionIds = adding.section ? [adding.section.id] : tickedSectionIds({ newOnly: true });
  const { ingredient, reused, added_to } = await catalog.addIngredient({
    name,
    section_ids: sectionIds,
  });
  if (!reused) return;
  const places = added_to.map(sectionLabel).filter(Boolean);
  showToast(
    places.length
      ? `${ingredient.name} was already in the catalog, added to ${places.join(", ")}`
      : `${ingredient.name} is already in the catalog`,
  );
}

async function submit(event) {
  event.preventDefault();
  const button = document.getElementById("ingredient-save");
  button.disabled = true;
  try {
    await save();
    document.getElementById("ingredient-dialog").close();
  } catch (err) {
    showDialogError(err.message, "ingredient-error");
  } finally {
    button.disabled = false;
  }
}

/** First tap arms the button, second tap deletes. */
async function deleteIngredient() {
  const del = document.getElementById("ingredient-delete");
  if (!del.dataset.armed) {
    del.dataset.armed = "1";
    del.textContent = "Really delete?";
    return;
  }
  try {
    await catalog.deleteIngredient(editing.id);
    document.getElementById("ingredient-dialog").close();
  } catch (err) {
    resetDeleteButton("ingredient-delete");
    showDialogError(err.message, "ingredient-error");
  }
}

export function initIngredientDialog() {
  // Only while adding: existing ingredients, so nothing gets added twice.
  initItemSearch("ingredient-name", "ingredient-suggestions", () => false, choose, {
    items: () => (editing ? [] : catalog.ingredients()),
    pickOnEnter: false,
    noMatch: null,
  });
  nameInput().addEventListener("input", recogniseName);
  document.getElementById("ingredient-form").addEventListener("submit", submit);
  document.getElementById("ingredient-delete").addEventListener("click", deleteIngredient);
  document
    .getElementById("ingredient-cancel")
    .addEventListener("click", () => document.getElementById("ingredient-dialog").close());
}
