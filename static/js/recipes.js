// The Recipes view: one card per recipe, newest first, narrowed by the
// filter panel (categories and the items a recipe contains).

import { catalog } from "./catalog.js";
import { checkedChipIds, el, pickChip, renderChips } from "./dom.js";
import { initItemSearch } from "./item-search.js";
import { itemKey, itemLabel } from "./items.js";
import { openRecipe } from "./recipe-dialog.js";
import { categoryChipOptions, recipeEmoji } from "./recipe-categories.js";

const CARD_CHIPS = 6; // component chips shown on a card before "+N"

/** After the catalog reloads: its error, if any, the filter's chips and the list. */
function catalogChanged() {
  const errorBox = document.getElementById("recipes-error");
  errorBox.textContent = catalog.loadError() || "";
  errorBox.hidden = !catalog.loadError();
  renderFilterCategories();
  renderRecipes();
}

/** Category badges like "🥫 Sauce". */
function renderCategoryBadges(recipe) {
  const badges = el("div", "recipe-badges");
  for (const category of recipe.categories) {
    badges.append(el("span", "recipe-kind", `${category.emoji} ${category.name}`));
  }
  return badges;
}

/** One card per recipe that passes the filter; tapping a card opens its details. */
function renderRecipes() {
  const container = document.getElementById("recipe-list");
  container.replaceChildren();
  const recipes = catalog.recipes();
  const shown = recipes.filter(matchesFilter);
  renderFilterState(shown.length);

  if (recipes.length === 0) {
    container.append(el("p", "placeholder", "No recipes yet — tap + New recipe 🥣"));
    return;
  }
  if (shown.length === 0) {
    container.append(el("p", "placeholder", "No recipes match — try removing a filter 🔍"));
    return;
  }

  for (const recipe of shown) {
    const card = el("button", recipe.url ? "recipe-card has-link" : "recipe-card");
    card.type = "button";
    card.addEventListener("click", () => openRecipe(recipe.id));

    const header = el("header", "recipe-card-header");
    header.append(
      el("span", "recipe-card-emoji", recipeEmoji(recipe)),
      el("h2", "recipe-card-title", recipe.name),
    );
    card.append(header, renderCategoryBadges(recipe));

    if (recipe.url) {
      card.append(el("p", "recipe-card-host", `🔗 ${hostname(recipe.url)}`));
    }
    if (recipe.components.length) {
      const chips = el("div", "recipe-card-chips");
      for (const c of recipe.components.slice(0, CARD_CHIPS)) {
        chips.append(el("span", "recipe-chip", itemLabel(c)));
      }
      const extra = recipe.components.length - CARD_CHIPS;
      if (extra > 0) chips.append(el("span", "recipe-chip more", `+${extra}`));
      card.append(chips);
    }

    if (recipe.notes) card.append(el("p", "recipe-card-notes", recipe.notes));
    container.append(card);
  }
}

// ---- Filter

// What the Recipes page is filtered by; kept while switching views. A recipe
// must be in ANY of the categories and directly contain ALL of the items.
const recipeFilter = { categoryIds: new Set(), items: new Map() }; // items: Map<itemKey, item>

const filterActive = () => recipeFilter.categoryIds.size > 0 || recipeFilter.items.size > 0;

function matchesFilter(recipe) {
  const { categoryIds, items } = recipeFilter;
  if (categoryIds.size && !recipe.categories.some((c) => categoryIds.has(c.id))) return false;
  const keys = new Set(recipe.components.map(itemKey));
  return [...items.keys()].every((key) => keys.has(key));
}

function renderFilterCategories() {
  renderChips("recipe-filter-categories", categoryChipOptions(), recipeFilter.categoryIds);
}

/** Picked-item chips, the "3 of 12" count and Clear, after the list changes. */
function renderFilterState(shownCount) {
  const recipes = catalog.recipes();
  document.getElementById("recipe-filter").hidden = recipes.length === 0;
  const picks = document.getElementById("recipe-filter-picks");
  picks.replaceChildren();
  for (const [key, item] of recipeFilter.items) {
    picks.append(
      pickChip(itemLabel(item), `Stop filtering by ${item.name}`, () => {
        recipeFilter.items.delete(key);
        renderRecipes();
      }),
    );
  }
  document.getElementById("recipe-filter-count").textContent = filterActive()
    ? `${shownCount} of ${recipes.length}`
    : "";
  document.getElementById("recipe-filter-clear").hidden = !filterActive();
}

function clearFilter() {
  recipeFilter.categoryIds.clear();
  recipeFilter.items.clear();
  renderFilterCategories();
  renderRecipes();
}

export function initRecipes() {
  catalog.onChange(catalogChanged);
  initItemSearch(
    "recipe-filter-input",
    "recipe-filter-suggestions",
    (key) => recipeFilter.items.has(key),
    (item) => {
      recipeFilter.items.set(itemKey(item), item);
      renderRecipes();
    },
  );
  document.getElementById("recipe-filter-categories").addEventListener("change", () => {
    recipeFilter.categoryIds.clear();
    for (const id of checkedChipIds("recipe-filter-categories")) recipeFilter.categoryIds.add(id);
    renderRecipes();
  });
  document.getElementById("recipe-filter-clear").addEventListener("click", clearFilter);
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
