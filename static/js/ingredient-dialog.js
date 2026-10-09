// The ingredient dialog: editing one ingredient (its name, its sections on
// every station, deleting it), or adding one. Adding suggests existing
// ingredients as you type and never makes a duplicate: choosing one, or
// typing its name in any case, puts that ingredient where you're adding it.

import { catalog } from "./catalog.js";
import { el, renderChips, resetDeleteButton, showDialogError, showToast } from "./dom.js";
import { initItemSearch } from "./item-search.js";

let editing = null; // the ingredient being edited, or null while adding
// While adding, where it goes: {station} (tick its sections), {section} (that
// one), or {} (the All ingredients page: tick sections on any station, or
// none for an orphan).
let adding = null;
let chosen = null; // while adding: the existing ingredient chosen from the suggestions

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
  chosen = null;
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
  chosen = null;
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
  renderSectionChips(chipStations, selected, folded);
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
 */
function renderSectionChips(stations, selected, folded = false) {
  const box = document.getElementById("ingredient-section-chips");
  box.replaceChildren();
  for (const station of stations) {
    const sections = ingredientSections(station);
    const group = el("details", "chip-group");
    const title = el("summary", "chip-group-title");
    const chips = el("div", "chips");
    chips.id = `ingredient-station-${station.id}`;
    group.append(title, chips);
    if (sections.length === 0) chips.append(el("p", "dialog-hint", "No ingredient sections yet"));
    box.append(group);
    if (sections.length) renderChips(chips.id, sections, selected);

    const countTicked = () => {
      const ticked = chips.querySelectorAll("input:checked").length;
      title.textContent = `${station.emoji} ${station.name}${ticked ? ` · ${ticked} ticked` : ""}`;
      return ticked;
    };
    chips.addEventListener("change", countTicked);
    group.open = !folded || countTicked() > 0;
    countTicked();
  }
}

const checkedSectionIds = () =>
  [...document.querySelectorAll("#ingredient-section-chips input:checked")].map((box) =>
    Number(box.value),
  );

/** A suggestion was chosen: that ingredient is the one being added. */
function choose(item) {
  const ingredient = storedIngredient(item.id);
  if (!adding.station && !adding.section) {
    openIngredientDialog(ingredient); // every station's chips: that's editing it
    return;
  }
  chosen = ingredient;
  nameInput().value = ingredient.name;
  if (adding.station) {
    renderSectionChips([adding.station], new Set(ingredient.section_ids));
  }
}

/** The existing ingredient being added, if any: the one chosen, or one with that name. */
function existingIngredient(name) {
  if (chosen) return chosen;
  const wanted = name.trim().toLowerCase();
  return catalog.ingredients().find((i) => i.name.toLowerCase() === wanted) ?? null;
}

/**
 * Where an existing ingredient ends up: added to the section, set to this
 * station's ticks, or (on All ingredients) added to whatever is ticked.
 */
function placedSectionIds(existing) {
  const ids = new Set(existing.section_ids);
  if (adding.section) ids.add(adding.section.id);
  if (adding.station) {
    for (const s of ingredientSections(adding.station)) ids.delete(s.id);
  }
  for (const id of checkedSectionIds()) ids.add(id);
  return [...ids];
}

/** "Protein, Topping": the sections it's being added to here. */
function placesHere() {
  if (adding.section) return [adding.section.name];
  const ticked = new Set(checkedSectionIds());
  const stations = adding.station ? [adding.station] : catalog.stations();
  return stations.flatMap((station) =>
    ingredientSections(station)
      .filter((s) => ticked.has(s.id))
      .map((s) => (adding.station ? s.name : `${station.name} · ${s.name}`)),
  );
}

async function save() {
  const name = nameInput().value;
  if (editing) {
    await catalog.changeIngredient(editing.id, { name, section_ids: checkedSectionIds() });
    return;
  }
  const existing = existingIngredient(name);
  if (!existing) {
    const sectionIds = adding.section ? [adding.section.id] : checkedSectionIds();
    await catalog.createIngredient({ name, section_ids: sectionIds });
    return;
  }
  const places = placesHere();
  await catalog.changeIngredient(existing.id, { section_ids: placedSectionIds(existing) });
  showToast(
    places.length
      ? `${existing.name} was already in the catalog, added to ${places.join(", ")}`
      : `${existing.name} is already in the catalog`,
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
  nameInput().addEventListener("input", () => {
    if (chosen && nameInput().value !== chosen.name) chosen = null;
  });
  document.getElementById("ingredient-form").addEventListener("submit", submit);
  document.getElementById("ingredient-delete").addEventListener("click", deleteIngredient);
  document
    .getElementById("ingredient-cancel")
    .addEventListener("click", () => document.getElementById("ingredient-dialog").close());
}
