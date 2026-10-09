// Pookie's Bowls — app shell (identity, theme, views), ingredient catalog,
// the recipe builder, and the recipes page.
// State that must survive reloads lives in localStorage (per device).

const IDENTITY_KEY = "pookie-identity"; // "me" | "her"
const VIEW_KEY = "pookie-view"; // "ingredients" | "recipes"

// Each person's favorite heart.
const HEARTS = { me: "💜", her: "💚" };

/** Apply the chosen identity: drives the color theme and button state. */
function setIdentity(who) {
  document.documentElement.dataset.identity = who;
  localStorage.setItem(IDENTITY_KEY, who);
  document.querySelectorAll(".identity-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.who === who);
  });
  // The favorite toggles act for the current identity, so redraw them.
  document.getElementById("fav-hint").textContent =
    `Double-tap to ${HEARTS[who]}`;
  renderIngredients();
}

function currentIdentity() {
  return document.documentElement.dataset.identity;
}

/** Show one view and highlight its nav button. */
function setView(view) {
  localStorage.setItem(VIEW_KEY, view);
  document.querySelectorAll(".view").forEach((section) => {
    section.hidden = section.id !== `view-${view}`;
  });
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  // Recipes show ingredient names, which may have changed since the last load.
  if (view === "recipes") loadRecipes();
}

/** fetch() wrapper for the JSON API; throws an Error with the server's message. */
async function api(method, url, body) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

/** Small DOM helper: el("div", "class-name", "text"). */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---- Ingredients ----------------------------------------------------------

let categories = []; // last loaded list, also used for the dialog's chips
let recipeSections = []; // recipe categories shown in the list (e.g. sauces)

// Ingredients and listed recipes are both "items": {type, id, name, favorites}.
const asItems = (list, type) => list.map((x) => ({ ...x, type }));
const itemKey = (item) => `${item.type}:${item.id}`;

async function loadIngredients() {
  const errorBox = document.getElementById("ingredients-error");
  try {
    const data = await api("GET", "/api/ingredients");
    categories = data.categories.map((c) => ({
      ...c,
      ingredients: asItems(c.ingredients, "ingredient"),
    }));
    recipeSections = data.recipe_sections.map((s) => ({
      ...s,
      recipes: asItems(s.recipes, "recipe"),
    }));
    errorBox.hidden = true;
    renderIngredients();
  } catch (err) {
    errorBox.textContent = `Couldn't load ingredients: ${err.message}`;
    errorBox.hidden = false;
  }
}

/** One card per ingredient category, then one per listed recipe category. */
function renderIngredients() {
  const container = document.getElementById("ingredient-sections");
  container.replaceChildren();
  for (const category of categories) {
    container.append(renderCategoryCard(category.name, category.ingredients));
  }
  for (const section of recipeSections) {
    container.append(renderCategoryCard(`${section.emoji} ${section.name}`, section.recipes));
  }
}

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

/** One ingredient or recipe row: name + hearts, favorite toggle, edit. */
function renderItemRow(item) {
  const row = el("li", "ingredient-row");
  const key = itemKey(item);
  // A recipe being edited can't be picked into itself.
  const pickable = !(builder && builder.recipe && key === `recipe:${builder.recipe.id}`);
  if (builder && builder.picks.has(key)) row.classList.add("picked");
  if (!pickable) row.classList.add("unpickable");

  const edit = el("button", "icon-btn", "✏️");
  edit.type = "button";
  edit.title = `Edit ${item.name}`;
  edit.setAttribute("aria-label", `Edit ${item.name}`);
  edit.addEventListener("click", () => {
    if (item.type === "recipe") openRecipe(item.id);
    else openIngredientDialog(item);
  });
  row.append(renderIngredientLabel(item), renderFavoriteToggle(item), edit);
  row.addEventListener("click", (event) => {
    if (builder) {
      if (pickable) togglePick(item);
    } else {
      handleRowTap(event, row, item);
    }
  });
  return row;
}

// Touch screens have no hover, so the toggle is hidden there and a double-tap
// on the row adds/removes the current identity's heart instead.
const touchOnly = window.matchMedia("(hover: none)");
const DOUBLE_TAP_MS = 350;
let lastTap = null; // {row, time} of the previous tap

function handleRowTap(event, row, item) {
  if (!touchOnly.matches || event.target.closest("button")) return;
  const now = Date.now();
  if (lastTap && lastTap.row === row && now - lastTap.time < DOUBLE_TAP_MS) {
    lastTap = null;
    toggleFavorite(item, item.favorites.includes(currentIdentity()));
  } else {
    lastTap = { row, time: now };
  }
}

let justFavorited = null; // {key, person} of the heart just added, to animate it

/** Name followed by the hearts of whoever favorited it. */
function renderIngredientLabel(item) {
  const label = el("span", "ingredient-label");
  label.append(el("span", "ingredient-name", item.name));
  if (item.favorites && item.favorites.length) {
    const badges = el("span", "fav-badges");
    for (const person of item.favorites) {
      const heart = el("span", "fav-badge", HEARTS[person]);
      heart.title = person === "me" ? "Me" : "Her";
      if (justFavorited && justFavorited.key === itemKey(item) && justFavorited.person === person) {
        heart.classList.add("pop");
      }
      badges.append(heart);
    }
    label.append(badges);
  }
  return label;
}

/** Add/remove the current identity's heart. */
function renderFavoriteToggle(item) {
  const who = currentIdentity();
  const isFavorite = item.favorites.includes(who);
  const btn = el("button", "icon-btn fav-btn", isFavorite ? "💔" : HEARTS[who]);
  btn.type = "button";
  btn.classList.toggle("is-favorite", isFavorite);
  btn.setAttribute("aria-pressed", String(isFavorite));
  const action = isFavorite ? "Remove from favorites" : "Add to favorites";
  btn.title = action;
  btn.setAttribute("aria-label", `${action}: ${item.name}`);
  btn.addEventListener("click", () => toggleFavorite(item, isFavorite));
  return btn;
}

async function toggleFavorite(item, isFavorite) {
  const who = currentIdentity();
  const errorBox = document.getElementById("ingredients-error");
  const base = item.type === "recipe" ? "recipes" : "ingredients";
  try {
    await api(isFavorite ? "DELETE" : "PUT", `/api/${base}/${item.id}/favorites/${who}`);
    justFavorited = isFavorite ? null : { key: itemKey(item), person: who };
    await loadIngredients();
  } catch (err) {
    errorBox.textContent = `Couldn't update favorite: ${err.message}`;
    errorBox.hidden = false;
  } finally {
    justFavorited = null;
  }
}

let editingIngredient = null; // null while adding, the ingredient while editing

/** Open the add/edit dialog; pass an ingredient to edit it. */
function openIngredientDialog(ingredient = null) {
  editingIngredient = ingredient;
  const selected = new Set(ingredient ? ingredient.category_ids : []);

  document.getElementById("ingredient-dialog-title").textContent = ingredient
    ? "Edit ingredient"
    : "Add ingredient";
  document.getElementById("ingredient-name").value = ingredient ? ingredient.name : "";

  renderChips("ingredient-categories", categories, selected);

  const del = document.getElementById("ingredient-delete");
  del.hidden = !ingredient;
  resetDeleteButton();
  showDialogError(null);

  document.getElementById("ingredient-dialog").showModal();
  if (!ingredient) document.getElementById("ingredient-name").focus();
}

/** Fill a .chips box with one checkbox per {id, name} option. */
function renderChips(containerId, options, selected) {
  const chips = document.getElementById(containerId);
  chips.replaceChildren();
  for (const option of options) {
    const label = el("label", "chip");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.value = option.id;
    box.checked = selected.has(option.id);
    label.append(box, el("span", null, option.name));
    chips.append(label);
  }
}

function checkedChipIds(containerId) {
  return [...document.querySelectorAll(`#${containerId} input:checked`)].map((box) =>
    Number(box.value),
  );
}

function showDialogError(message, boxId = "ingredient-error") {
  const box = document.getElementById(boxId);
  box.textContent = message || "";
  box.hidden = !message;
}

function resetDeleteButton(id = "ingredient-delete") {
  const del = document.getElementById(id);
  delete del.dataset.armed;
  del.textContent = "Delete";
}

async function saveIngredient(event) {
  event.preventDefault();
  const body = {
    name: document.getElementById("ingredient-name").value,
    category_ids: checkedChipIds("ingredient-categories"),
  };
  const save = document.getElementById("ingredient-save");
  save.disabled = true;
  try {
    if (editingIngredient) {
      await api("PUT", `/api/ingredients/${editingIngredient.id}`, body);
    } else {
      await api("POST", "/api/ingredients", body);
    }
    document.getElementById("ingredient-dialog").close();
    await loadIngredients();
  } catch (err) {
    showDialogError(err.message);
  } finally {
    save.disabled = false;
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
    await api("DELETE", `/api/ingredients/${editingIngredient.id}`);
    document.getElementById("ingredient-dialog").close();
    await loadIngredients();
  } catch (err) {
    resetDeleteButton();
    showDialogError(err.message);
  }
}

function initIngredients() {
  document
    .getElementById("add-ingredient-btn")
    .addEventListener("click", () => openIngredientDialog());
  document.getElementById("ingredient-form").addEventListener("submit", saveIngredient);
  document.getElementById("ingredient-delete").addEventListener("click", deleteIngredient);
  document
    .getElementById("ingredient-cancel")
    .addEventListener("click", () => document.getElementById("ingredient-dialog").close());
  loadIngredients();
}

// ---- Recipe builder -------------------------------------------------------

// null outside selection mode; otherwise {picks, recipe, returnTo, fromDialog}:
// picks is Map<itemKey, {type, id, name}> in pick order, recipe is the
// recipe whose ingredients are being changed (null for a new one), returnTo
// the view to go back to, fromDialog whether Done goes back to the new
// recipe dialog.
let builder = null;
// The new recipe being written in the build dialog: {picks}, or null. Its
// other fields live in the dialog's form until it's saved or cancelled.
let draft = null;
let recipeCategories = []; // every recipe category, for the dialogs' chips

async function loadRecipeCategories() {
  try {
    recipeCategories = (await api("GET", "/api/recipe-categories")).categories;
    renderFilterCategories();
  } catch (err) {
    showToast(`Couldn't load recipe categories: ${err.message}`);
  }
}

/** Display names like "🥫 Sauce" for the category chips. */
const categoryChipOptions = () =>
  recipeCategories.map((c) => ({ id: c.id, name: `${c.emoji} ${c.name}` }));

/** A new recipe starts as a poke bowl. */
const defaultCategoryIds = () =>
  new Set(recipeCategories.filter((c) => c.slug === "bowl").map((c) => c.id));

/** Picks or components as the API's [{ingredient_id} | {recipe_id}]. */
const componentsBody = (items) =>
  [...items].map((x) => (x.type === "recipe" ? { recipe_id: x.id } : { ingredient_id: x.id }));

/** A removable chip: the label and a ✕ that calls onRemove. */
function pickChip(label, removeLabel, onRemove) {
  const chip = el("li", "build-pick");
  const remove = el("button", "build-pick-remove", "✕");
  remove.type = "button";
  remove.setAttribute("aria-label", removeLabel);
  remove.addEventListener("click", onRemove);
  chip.append(el("span", null, label), remove);
  return chip;
}

/** Start a new recipe: empty form and no picks. */
function startDraft() {
  draft = { picks: new Map() };
  document.getElementById("build-form").reset();
  document.getElementById("build-add-suggestions").hidden = true;
  renderChips("build-categories", categoryChipOptions(), defaultCategoryIds());
}

/**
 * Enter selection mode. Without a recipe it picks the new recipe's
 * ingredients (a fresh one, or the open draft when fromDialog); with a
 * recipe it only changes that recipe's ingredients.
 */
function startBuilder(recipe = null, returnTo = null, fromDialog = false) {
  let picks;
  if (recipe) {
    picks = new Map(
      recipe.components.map((c) => [itemKey(c), { type: c.type, id: c.id, name: c.name }]),
    );
  } else if (fromDialog) {
    picks = new Map(draft.picks); // a copy, so Cancel keeps the draft's picks
  } else {
    startDraft();
    picks = draft.picks; // shared: the dialog's Back returns to these
  }
  builder = { picks, recipe, returnTo, fromDialog };

  document.getElementById("build-title").textContent = recipe
    ? `🥣 ${recipe.name}`
    : "🥣 Your recipe";
  document.getElementById("build-create").textContent =
    recipe || fromDialog ? "Done ✓" : "Create";

  document.body.classList.add("selecting");
  document.getElementById("build-tray").hidden = false;
  renderTray();
  renderIngredients();
}

/**
 * Leave selection mode, back to where it started: the recipe being edited,
 * or the new recipe dialog (keeping the picks if keep is true).
 */
function endBuilder(keep = false) {
  const { returnTo, recipe, fromDialog, picks } = builder || {};
  builder = null;
  document.body.classList.remove("selecting");
  document.getElementById("build-tray").hidden = true;
  renderIngredients();
  if (returnTo) setView(returnTo);
  if (recipe) openRecipe(recipe.id);
  if (fromDialog) {
    if (keep) draft.picks = picks;
    openBuildDialog();
  } else if (!recipe) {
    draft = null;
  }
}

function togglePick(item) {
  const key = itemKey(item);
  if (builder.picks.has(key)) builder.picks.delete(key);
  else builder.picks.set(key, { type: item.type, id: item.id, name: item.name });
  renderTray();
  renderIngredients();
}

/** The floating tray: one chip per pick, each removable. */
function renderTray() {
  const list = document.getElementById("build-picks");
  list.replaceChildren();
  if (builder.picks.size === 0) {
    list.append(el("li", "build-empty", "Tap ingredients to add them"));
  }
  for (const [key, pick] of builder.picks) {
    list.append(
      pickChip(pick.name, `Remove ${pick.name}`, () => {
        builder.picks.delete(key);
        renderTray();
        renderIngredients();
      }),
    );
  }
  document.getElementById("build-count").textContent = String(builder.picks.size);
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
          draftPicksChanged();
        },
      }),
    );
  }
}

/** Redraw what shows the draft's picks, including the tray behind the dialog. */
function draftPicksChanged() {
  renderDialogPicks();
  if (builder) {
    renderTray();
    renderIngredients();
  }
}

/** Show the build dialog for the draft; Back returns to picking if picking. */
function openBuildDialog() {
  renderDialogPicks();
  document.getElementById("build-dialog-cancel").textContent = builder ? "Back" : "Cancel";
  showDialogError(null, "build-error");
  document.getElementById("build-dialog").showModal();
  document.getElementById("build-name").focus();
}

/** From the Recipes page: a new recipe, with or without link and ingredients. */
function openNewRecipe() {
  startDraft();
  openBuildDialog();
}

/** The dialog's ☰: go pick ingredients, then come back to the dialog. */
function pickFromDialog() {
  document.getElementById("build-dialog").close();
  if (builder) return; // already picking behind the dialog
  const returnTo = localStorage.getItem(VIEW_KEY) || "recipes";
  setView("ingredients");
  startBuilder(null, returnTo, true);
}

async function saveBuilt(event) {
  event.preventDefault();
  const body = {
    name: document.getElementById("build-name").value,
    url: document.getElementById("build-url").value,
    notes: document.getElementById("build-notes").value,
    category_ids: checkedChipIds("build-categories"),
    components: componentsBody(draft.picks.values()),
  };
  const save = document.getElementById("build-save");
  save.disabled = true;
  try {
    const recipe = await api("POST", "/api/recipes", body);
    document.getElementById("build-dialog").close();
    if (builder) endBuilder();
    draft = null;
    // A new sauce shows up in the ingredient list too.
    await Promise.all([loadRecipes(), loadIngredients()]);
    showToast(`“${recipe.name}” saved! ${recipeEmoji(recipe)}`);
  } catch (err) {
    showDialogError(err.message, "build-error");
  } finally {
    save.disabled = false;
  }
}

/** Done while changing a recipe's ingredients: save them and go back to it. */
async function savePickedComponents() {
  const done = document.getElementById("build-create");
  done.disabled = true;
  try {
    await api("PATCH", `/api/recipes/${builder.recipe.id}`, {
      components: componentsBody(builder.picks.values()),
    });
    endBuilder();
    showToast("Saved ✓");
  } catch (err) {
    showToast(`Couldn't save: ${err.message}`);
  } finally {
    done.disabled = false;
  }
}

let toastTimer = null;

/** Briefly show a message at the bottom of the screen. */
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
}

function initBuilder() {
  document.getElementById("new-recipe-btn").addEventListener("click", () => startBuilder());
  document.getElementById("new-recipe-link-btn").addEventListener("click", openNewRecipe);
  document.getElementById("build-cancel").addEventListener("click", () => endBuilder());
  document.getElementById("build-create").addEventListener("click", () => {
    if (builder.recipe) savePickedComponents();
    else if (builder.fromDialog) endBuilder(true);
    else openBuildDialog();
  });
  document.getElementById("build-form").addEventListener("submit", saveBuilt);
  document.getElementById("build-pick").addEventListener("click", pickFromDialog);
  initItemSearch(
    "build-add-input",
    "build-add-suggestions",
    (key) => draft.picks.has(key),
    (item) => {
      draft.picks.set(itemKey(item), item);
      draftPicksChanged();
    },
  );
  document.getElementById("build-dialog-cancel").addEventListener("click", () => {
    document.getElementById("build-dialog").close();
    if (!builder) draft = null; // Back keeps picking; Cancel drops the draft
  });
  loadRecipeCategories();
}

// ---- Recipes --------------------------------------------------------------

const CARD_CHIPS = 6; // component chips shown on a card before "+N"
const SUB_RECIPE = "📖"; // marks a recipe used inside another recipe

let recipes = []; // last loaded list
let shownRecipe = null; // recipe shown in the recipe dialog
let recipeChanged = false; // saved something since the dialog opened
let editingIngredients = false; // ingredient list shows ✕, add box and picker link
let recipeSaving = Promise.resolve(); // saves run one after another

/** A recipe's emoji: its first category's. */
function recipeEmoji(recipe) {
  return recipe.categories.length ? recipe.categories[0].emoji : "🥣";
}

async function loadRecipes() {
  const errorBox = document.getElementById("recipes-error");
  try {
    recipes = (await api("GET", "/api/recipes")).recipes;
    errorBox.hidden = true;
    renderRecipes();
  } catch (err) {
    errorBox.textContent = `Couldn't load recipes: ${err.message}`;
    errorBox.hidden = false;
  }
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
        const name = c.type === "recipe" ? `${SUB_RECIPE} ${c.name}` : c.name;
        chips.append(el("span", "recipe-chip", name));
      }
      const extra = recipe.components.length - CARD_CHIPS;
      if (extra > 0) chips.append(el("span", "recipe-chip more", `+${extra}`));
      card.append(chips);
    }

    if (recipe.notes) card.append(el("p", "recipe-card-notes", recipe.notes));
    container.append(card);
  }
}

// ---- Recipe filter --------------------------------------------------------

// What the Recipes page is filtered by; kept while switching views. A recipe
// must be in ANY of the categories and directly contain ALL of the items.
const recipeFilter = { categoryIds: new Set(), items: new Map() }; // items: Map<itemKey, item>
const FILTER_SUGGESTIONS = 6;

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

const itemLabel = (item) => (item.type === "recipe" ? `${SUB_RECIPE} ${item.name}` : item.name);

/** Everything that can be filtered by: ingredients and listed recipes, once each. */
function filterableItems() {
  const all = new Map();
  for (const category of categories) {
    for (const item of category.ingredients) all.set(itemKey(item), item);
  }
  for (const section of recipeSections) {
    for (const item of section.recipes) all.set(itemKey(item), item);
  }
  return [...all.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Type-ahead over filterableItems(): typing shows matches under the input,
 * tapping one (or Enter for the first) calls onPick(item). Items whose key
 * excluded(key) says are already taken aren't suggested.
 */
function initItemSearch(inputId, listId, excluded, onPick) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);

  /** Show items matching what's typed; returns the matches. */
  function render() {
    const query = input.value.trim().toLowerCase();
    list.replaceChildren();
    const matches = query
      ? filterableItems()
          .filter((item) => !excluded(itemKey(item)))
          .filter((item) => item.name.toLowerCase().includes(query))
          .slice(0, FILTER_SUGGESTIONS)
      : [];
    for (const item of matches) {
      const option = el("button", "filter-suggestion", itemLabel(item));
      option.type = "button";
      option.addEventListener("click", () => pick(item));
      const li = el("li");
      li.append(option);
      list.append(li);
    }
    if (query && matches.length === 0) list.append(el("li", "filter-no-match", "No match"));
    list.hidden = !query;
    return matches;
  }

  function pick(item) {
    input.value = "";
    render();
    input.focus();
    onPick({ type: item.type, id: item.id, name: item.name });
  }

  input.addEventListener("input", render);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const [first] = render();
      if (first) pick(first);
    } else if (event.key === "Escape" && input.value) {
      event.preventDefault(); // inside a dialog, don't close it
      input.value = "";
      render();
    }
  });
}

function clearFilter() {
  recipeFilter.categoryIds.clear();
  recipeFilter.items.clear();
  renderFilterCategories();
  renderRecipes();
}

function initRecipeFilter() {
  initItemSearch(
    "recipe-filter-input",
    "recipe-filter-suggestions",
    (key) => recipeFilter.items.has(key),
    (item) => {
      recipeFilter.items.set(itemKey(item), item);
      renderRecipes();
    },
  );
  // Tapping anywhere else closes any open suggestions.
  document.addEventListener("click", (event) => {
    const search = event.target.closest(".filter-search");
    document.querySelectorAll(".filter-suggestions").forEach((list) => {
      if (!search || !search.contains(list)) list.hidden = true;
    });
  });
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

/** Fetch a recipe and show it in the recipe dialog. */
async function openRecipe(id) {
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
            components: componentsBody(shownRecipe.components.filter((c) => itemKey(c) !== key)),
          })
      : null,
  });
}

/**
 * One ingredient row. A recipe inside (e.g. a sauce) opens with onOpen on
 * tap, if given; onRemove, if given, adds a ✕.
 */
function renderComponentRow(component, { onOpen = null, onRemove = null } = {}) {
  const item = el("li", "recipe-ingredient");
  if (component.type === "recipe" && onOpen) {
    const open = el("button", "sub-recipe-btn");
    open.type = "button";
    open.append(
      el("span", null, SUB_RECIPE),
      renderIngredientLabel(component),
      el("span", "sub-recipe-arrow", "›"),
    );
    open.addEventListener("click", onOpen);
    item.append(open);
  } else {
    if (component.type === "recipe") item.append(el("span", null, SUB_RECIPE));
    item.append(renderIngredientLabel(component));
  }
  if (!onRemove) return item;

  const remove = el("button", "recipe-ingredient-remove", "✕");
  remove.type = "button";
  remove.setAttribute("aria-label", `Remove ${component.name}`);
  remove.addEventListener("click", onRemove);
  item.append(remove);
  return item;
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

function initRecipes() {
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
    (item) => saveRecipePatch({ components: componentsBody([...shownRecipe.components, item]) }),
  );
  document.getElementById("recipe-pick").addEventListener("click", () => {
    const recipe = shownRecipe;
    const returnTo = localStorage.getItem(VIEW_KEY) || "recipes";
    document.getElementById("recipe-dialog").close();
    setView("ingredients");
    startBuilder(recipe, returnTo);
  });

  document.getElementById("recipe-delete").addEventListener("click", deleteRecipe);
  const dialog = document.getElementById("recipe-dialog");
  document.getElementById("recipe-close").addEventListener("click", () => dialog.close());
  // Once closed (and any last save is done), refresh what the change shows up in.
  dialog.addEventListener("close", async () => {
    await recipeSaving;
    if (!recipeChanged) return;
    recipeChanged = false;
    await Promise.all([loadRecipes(), loadIngredients()]);
  });
}

function init() {
  // Restore saved identity (default: "me") and wire the toggle.
  setIdentity(localStorage.getItem(IDENTITY_KEY) || "me");
  document.querySelectorAll(".identity-btn").forEach((btn) => {
    btn.addEventListener("click", () => setIdentity(btn.dataset.who));
  });

  // Restore saved view (default: ingredients) and wire the nav.
  setView(localStorage.getItem(VIEW_KEY) || "ingredients");
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  initIngredients();
  initBuilder();
  initRecipes();
  initRecipeFilter();
}

document.addEventListener("DOMContentLoaded", init);
