// The station view: one card per section, in the station's order (ingredient
// sections and listed recipe categories, e.g. sauces), favorites and the ⋯
// row menu. Its rows are where a pick session picks.

import { catalog } from "./catalog.js";
import { el } from "./dom.js";
import { openAddIngredient, openIngredientDialog } from "./ingredient-dialog.js";
import { HEARTS, itemKey, renderItemLabel } from "./items.js";
import { pickNewRecipe } from "./new-recipe.js";
import { pickSession } from "./pick-session.js";
import { openRecipe } from "./recipe-dialog.js";
import {
  currentIdentity,
  currentView,
  onIdentityChange,
  onViewChange,
  saveStationId,
  savedStationId,
  setView,
} from "./shell.js";

/** After the catalog reloads: its error, if any, the station buttons, then the list. */
function catalogChanged() {
  const errorBox = document.getElementById("station-error");
  errorBox.textContent = catalog.loadError() || "";
  errorBox.hidden = !catalog.loadError();
  renderStationNav();
  renderStation();
}

/** One nav button per station; the one shown is highlighted while on the station view. */
function renderStationNav() {
  const nav = document.getElementById("station-nav");
  nav.replaceChildren();
  const current = catalog.currentStation();
  for (const station of catalog.stations()) {
    const btn = el("button", "nav-btn", `${station.emoji} ${station.name}`);
    btn.type = "button";
    btn.classList.toggle("active", currentView() === "station" && station === current);
    btn.addEventListener("click", () => showStation(station.id));
    nav.append(btn);
  }
}

/** Show this station (remembered on this device); a pick session keeps its picks. */
export function showStation(id) {
  saveStationId(id);
  catalog.selectStation(id);
  setView("station");
}

/** One card per section of the station, in its order. */
function renderStation() {
  // Double-clicking a row toggles the current identity's heart.
  document.getElementById("fav-hint").textContent =
    `${touchOnly.matches ? "Double-tap" : "Double-click"} to ${HEARTS[currentIdentity()]}`;
  const container = document.getElementById("station-sections");
  container.replaceChildren();
  const station = catalog.currentStation();
  if (!station) return;
  if (station.sections.length === 0) {
    container.append(el("p", "placeholder", "No sections yet — add some with ✏️ Station"));
  }
  for (const section of station.sections) {
    const card = renderCategoryCard(sectionTitle(section), section.items);
    if (section.kind === "ingredients") {
      const add = rowButton("section-add", "+", `Add to ${section.name}`, () =>
        openAddIngredient({ section }),
      );
      card.querySelector(".category-header").append(add);
    }
    container.append(card);
  }
}

/** "Protein", or "🥫 Sauce" for a listed recipe category. */
const sectionTitle = (section) =>
  section.kind === "recipes" ? `${section.emoji} ${section.name}` : section.name;

function renderCategoryCard(title, items) {
  const card = el("section", "category-card");
  const header = el("header", "category-header");
  header.append(
    el("h2", "category-title", title),
    el("span", "category-count", String(items.length)),
  );
  card.append(header);

  if (items.length === 0) {
    card.append(el("p", "category-empty", "Nothing here yet"));
  } else {
    const list = el("ul", "ingredient-list");
    for (const item of items) list.append(renderItemRow(item));
    card.append(list);
  }
  return card;
}

/** A row's small round button: el("button") with a label for screen readers. */
function rowButton(className, text, label, onClick) {
  const btn = el("button", `icon-btn ${className}`, text);
  btn.type = "button";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.addEventListener("click", onClick);
  return btn;
}

/**
 * One ingredient or recipe row: name + hearts (and detail, if given, e.g.
 * where it appears), then ✏️ and ＋ (start a recipe with it) with a mouse, or
 * ⋯ (a menu with both) on touch screens. ＋ sits at the end, where picking
 * mode shows its ＋ too. The All ingredients page uses these rows as well.
 */
export function renderItemRow(item, detail = null) {
  const row = el("li", "ingredient-row");
  const pickState = pickSession.state(item);
  const pop = justFavorited && justFavorited.key === itemKey(item) ? justFavorited.person : null;
  if (pickState === "picked") row.classList.add("picked");
  if (pickState === "blocked") row.classList.add("unpickable");

  const label = renderItemLabel(item, pop);
  if (detail) label.append(el("span", "ingredient-where", detail));
  row.append(
    label,
    rowButton("row-edit", "✏️", `Edit ${item.name}`, () => editItem(item)),
    rowButton("row-start", "＋", `Start a recipe with ${item.name}`, () => startRecipeWith(item)),
    rowButton("row-more", "⋯", `More for ${item.name}`, () => toggleRowMenu(row, item)),
  );
  row.addEventListener("click", (event) => {
    // The row's own buttons and menu do their own thing (＋ even starts picking).
    if (event.target.closest("button, .row-menu")) return;
    if (pickSession.active()) pickSession.toggle(item);
    else handleRowTap(event, row, item);
  });
  row.addEventListener("dblclick", (event) => {
    if (pickSession.active() || touchOnly.matches || event.target.closest("button, .row-menu")) return;
    toggleFavorite(item, item.favorites.includes(currentIdentity()));
  });
  return row;
}

function editItem(item) {
  if (item.type === "recipe") openRecipe(item.id);
  else openIngredientDialog(item);
}

/** Start a new recipe with this item already picked. */
function startRecipeWith(item) {
  pickNewRecipe([item]);
}

let openMenu = null; // the open ⋯ menu, if any

function closeRowMenu() {
  if (openMenu) openMenu.remove();
  openMenu = null;
}

/** The ⋯ menu under a row: start a recipe with it, or edit it. */
function toggleRowMenu(row, item) {
  const wasOpen = openMenu && row.contains(openMenu);
  closeRowMenu();
  if (wasOpen) return;
  const menu = el("div", "row-menu");
  menu.setAttribute("role", "menu");
  const option = (text, action) => {
    const btn = el("button", "row-menu-item", text);
    btn.type = "button";
    btn.setAttribute("role", "menuitem");
    btn.addEventListener("click", () => {
      closeRowMenu();
      action();
    });
    return btn;
  };
  menu.append(
    option("＋ Start recipe", () => startRecipeWith(item)),
    option("✏️ Edit", () => editItem(item)),
  );
  row.append(menu);
  openMenu = menu;
}

// Touch screens: a double-tap on the row adds/removes the current identity's
// heart (with a mouse it's a double-click, see renderItemRow).
const touchOnly = window.matchMedia("(hover: none)");
const DOUBLE_TAP_MS = 350;
let lastTap = null; // {row, time} of the previous tap

function handleRowTap(event, row, item) {
  if (!touchOnly.matches) return;
  const now = Date.now();
  if (lastTap && lastTap.row === row && now - lastTap.time < DOUBLE_TAP_MS) {
    lastTap = null;
    toggleFavorite(item, item.favorites.includes(currentIdentity()));
  } else {
    lastTap = { row, time: now };
  }
}

let justFavorited = null; // {key, person} of the heart just added, to animate it

async function toggleFavorite(item, isFavorite) {
  const who = currentIdentity();
  const errorBox = document.getElementById("station-error");
  // The list redraws as soon as the heart is saved; a new one pops in.
  justFavorited = isFavorite ? null : { key: itemKey(item), person: who };
  try {
    await catalog.setFavorite(item, who, !isFavorite);
  } catch (err) {
    errorBox.textContent = `Couldn't update favorite: ${err.message}`;
    errorBox.hidden = false;
  } finally {
    justFavorited = null;
  }
}

export function initStation() {
  document
    .getElementById("add-ingredient-btn")
    .addEventListener("click", () => openAddIngredient({ station: catalog.currentStation() }));
  // A tap outside an open ⋯ menu (or Escape) closes it.
  document.addEventListener("click", (event) => {
    if (openMenu && !event.target.closest(".row-menu, .row-more")) closeRowMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeRowMenu();
  });
  catalog.selectStation(savedStationId());
  catalog.onChange(catalogChanged);
  onViewChange(renderStationNav);
  // Rows show picks, and the hint shows whose heart a double-tap adds.
  pickSession.onChange(renderStation);
  onIdentityChange(renderStation);
}
