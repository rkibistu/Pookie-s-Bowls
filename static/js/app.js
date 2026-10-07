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
    if (item.type === "recipe") editRecipe(item.id);
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
  if (item.favorites.length) {
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

// null outside selection mode; otherwise {picks, recipe, returnTo}:
// picks is Map<itemKey, {type, id, name}> in pick order, recipe is the
// recipe being edited (null for a new one), returnTo the view to go back to.
let builder = null;
let recipeCategories = []; // every recipe category, for the dialogs' chips

async function loadRecipeCategories() {
  try {
    recipeCategories = (await api("GET", "/api/recipe-categories")).categories;
  } catch (err) {
    showToast(`Couldn't load recipe categories: ${err.message}`);
  }
}

/** Display names like "🥫 Sauce" for the category chips. */
const categoryChipOptions = () =>
  recipeCategories.map((c) => ({ id: c.id, name: `${c.emoji} ${c.name}` }));

/** A recipe's category ids; a new recipe starts as a poke bowl. */
function selectedCategoryIds(recipe) {
  const selected = recipe ? recipe.categories : recipeCategories.filter((c) => c.slug === "bowl");
  return new Set(selected.map((c) => c.id));
}

/** Enter selection mode; pass a manual recipe to edit it. */
function startBuilder(recipe = null, returnTo = null) {
  builder = { picks: new Map(), recipe, returnTo };
  for (const c of recipe ? recipe.components : []) {
    builder.picks.set(itemKey(c), { type: c.type, id: c.id, name: c.name });
  }

  // Fill the name dialog now, so going Back and forth keeps what was typed.
  document.getElementById("build-form").reset();
  document.getElementById("build-dialog-title").textContent = recipe
    ? "Edit recipe ✏️"
    : "Name your recipe ✨";
  document.getElementById("build-name").value = recipe ? recipe.name : "";
  document.getElementById("build-notes").value = recipe ? recipe.notes || "" : "";
  renderChips("build-categories", categoryChipOptions(), selectedCategoryIds(recipe));
  document.getElementById("build-create").textContent = recipe ? "Save" : "Create";

  document.body.classList.add("selecting");
  document.getElementById("build-tray").hidden = false;
  renderTray();
  renderIngredients();
}

/** Leave selection mode, dropping every pick. */
function endBuilder() {
  const returnTo = builder && builder.returnTo;
  builder = null;
  document.body.classList.remove("selecting");
  document.getElementById("build-tray").hidden = true;
  document.getElementById("build-form").reset();
  renderIngredients();
  if (returnTo) setView(returnTo);
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
    const chip = el("li", "build-pick");
    const remove = el("button", "build-pick-remove", "✕");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${pick.name}`);
    remove.addEventListener("click", () => {
      builder.picks.delete(key);
      renderTray();
      renderIngredients();
    });
    chip.append(el("span", null, pick.name), remove);
    list.append(chip);
  }
  document.getElementById("build-count").textContent = String(builder.picks.size);
  document.getElementById("build-create").disabled = builder.picks.size === 0;
}

function openBuildDialog() {
  document.getElementById("build-summary").textContent = [...builder.picks.values()]
    .map((pick) => pick.name)
    .join(", ");
  showDialogError(null, "build-error");
  document.getElementById("build-dialog").showModal();
  document.getElementById("build-name").focus();
}

async function saveBuilt(event) {
  event.preventDefault();
  const body = {
    kind: "manual",
    name: document.getElementById("build-name").value,
    notes: document.getElementById("build-notes").value,
    category_ids: checkedChipIds("build-categories"),
    components: [...builder.picks.values()].map((pick) =>
      pick.type === "recipe" ? { recipe_id: pick.id } : { ingredient_id: pick.id },
    ),
  };
  const save = document.getElementById("build-save");
  save.disabled = true;
  try {
    const recipe = builder.recipe
      ? await api("PUT", `/api/recipes/${builder.recipe.id}`, body)
      : await api("POST", "/api/recipes", body);
    document.getElementById("build-dialog").close();
    endBuilder();
    await loadIngredients(); // a new or renamed sauce shows up in the list
    showToast(`“${recipe.name}” saved! ${recipeEmoji(recipe)}`);
  } catch (err) {
    showDialogError(err.message, "build-error");
  } finally {
    save.disabled = false;
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
  document.getElementById("build-cancel").addEventListener("click", endBuilder);
  document.getElementById("build-create").addEventListener("click", openBuildDialog);
  document.getElementById("build-form").addEventListener("submit", saveBuilt);
  document
    .getElementById("build-dialog-cancel")
    .addEventListener("click", () => document.getElementById("build-dialog").close());
  loadRecipeCategories();
}

// ---- Recipes --------------------------------------------------------------

const CARD_CHIPS = 6; // component chips shown on a card before "+N"
const SUB_RECIPE = "📖"; // marks a recipe used inside another recipe

let recipes = []; // last loaded list
let openRecipeId = null; // recipe shown in the detail dialog

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

/** Category badges like "🥫 Sauce", into a new or the given box. */
function renderCategoryBadges(recipe, badges = el("div", "recipe-badges")) {
  badges.replaceChildren();
  for (const category of recipe.categories) {
    badges.append(el("span", "recipe-kind", `${category.emoji} ${category.name}`));
  }
  return badges;
}

/** One card per recipe; tapping a card opens its details. */
function renderRecipes() {
  const container = document.getElementById("recipe-list");
  container.replaceChildren();

  if (recipes.length === 0) {
    container.append(el("p", "placeholder", "No recipes yet — create one 🥣 or add a link 🔗"));
    return;
  }

  for (const recipe of recipes) {
    const card = el("button", `recipe-card kind-${recipe.kind}`);
    card.type = "button";
    card.addEventListener("click", () => openRecipe(recipe.id));

    const header = el("header", "recipe-card-header");
    header.append(
      el("span", "recipe-card-emoji", recipeEmoji(recipe)),
      el("h2", "recipe-card-title", recipe.name),
    );
    card.append(header, renderCategoryBadges(recipe));

    if (recipe.kind === "link") {
      card.append(el("p", "recipe-card-host", `🔗 ${hostname(recipe.url)}`));
    } else if (recipe.components.length) {
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

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Fetch a recipe and show it in the detail dialog. */
async function openRecipe(id) {
  const errorBox = document.getElementById("recipes-error");
  let recipe;
  try {
    recipe = await api("GET", `/api/recipes/${id}`);
  } catch (err) {
    errorBox.textContent = `Couldn't open recipe: ${err.message}`;
    errorBox.hidden = false;
    return;
  }
  openRecipeId = recipe.id;

  renderCategoryBadges(recipe, document.getElementById("recipe-badges"));
  document.getElementById("recipe-title").textContent = recipe.name;

  const link = document.getElementById("recipe-url");
  link.hidden = recipe.kind !== "link";
  if (recipe.kind === "link") link.href = recipe.url; // server only accepts http(s)
  else link.removeAttribute("href");

  const list = document.getElementById("recipe-ingredients");
  list.replaceChildren();
  for (const component of recipe.components) {
    const item = el("li", "recipe-ingredient");
    if (component.type === "recipe") {
      // A recipe inside this one (e.g. a sauce): tap to read it.
      const open = el("button", "sub-recipe-btn");
      open.type = "button";
      open.append(
        el("span", null, SUB_RECIPE),
        renderIngredientLabel(component),
        el("span", "sub-recipe-arrow", "›"),
      );
      open.addEventListener("click", () => openRecipe(component.id));
      item.append(open);
    } else {
      item.append(renderIngredientLabel(component));
    }
    list.append(item);
  }
  document.getElementById("recipe-ingredients-field").hidden = recipe.components.length === 0;

  const notes = document.getElementById("recipe-notes");
  notes.textContent = recipe.notes || "No notes";
  notes.classList.toggle("empty", !recipe.notes);

  resetDeleteButton("recipe-delete");
  showDialogError(null, "recipe-error");
  const dialog = document.getElementById("recipe-dialog");
  if (!dialog.open) dialog.showModal(); // already open when following a sub-recipe
}

/** Edit any recipe: manual ones in the builder, links in the link dialog. */
async function editRecipe(id, returnTo = null) {
  let recipe;
  try {
    recipe = await api("GET", `/api/recipes/${id}`);
  } catch (err) {
    showToast(`Couldn't open recipe: ${err.message}`);
    return;
  }
  if (recipe.kind === "link") {
    openLinkDialog(recipe);
  } else {
    setView("ingredients");
    startBuilder(recipe, returnTo);
  }
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
    await api("DELETE", `/api/recipes/${openRecipeId}`);
    document.getElementById("recipe-dialog").close();
    await Promise.all([loadRecipes(), loadIngredients()]);
  } catch (err) {
    resetDeleteButton("recipe-delete");
    showDialogError(err.message, "recipe-error");
  }
}

let editingLink = null; // null while adding, the link recipe while editing

/** Open the link dialog; pass a link recipe to edit it. */
function openLinkDialog(recipe = null) {
  editingLink = recipe;
  document.getElementById("link-form").reset();
  document.getElementById("link-dialog-title").textContent = recipe
    ? "Edit link recipe 🔗"
    : "Add link recipe 🔗";
  if (recipe) {
    document.getElementById("link-name").value = recipe.name;
    document.getElementById("link-url").value = recipe.url;
    document.getElementById("link-notes").value = recipe.notes || "";
  }
  renderChips("link-categories", categoryChipOptions(), selectedCategoryIds(recipe));
  showDialogError(null, "link-error");
  document.getElementById("link-dialog").showModal();
  document.getElementById("link-name").focus();
}

async function saveLink(event) {
  event.preventDefault();
  const body = {
    kind: "link",
    name: document.getElementById("link-name").value,
    url: document.getElementById("link-url").value,
    notes: document.getElementById("link-notes").value,
    category_ids: checkedChipIds("link-categories"),
  };
  const save = document.getElementById("link-save");
  save.disabled = true;
  try {
    const recipe = editingLink
      ? await api("PUT", `/api/recipes/${editingLink.id}`, body)
      : await api("POST", "/api/recipes", body);
    document.getElementById("link-dialog").close();
    await Promise.all([loadRecipes(), loadIngredients()]);
    showToast(`“${recipe.name}” saved! 🔗`);
  } catch (err) {
    showDialogError(err.message, "link-error");
  } finally {
    save.disabled = false;
  }
}

function initRecipes() {
  document.getElementById("add-link-btn").addEventListener("click", () => openLinkDialog());
  document.getElementById("link-form").addEventListener("submit", saveLink);
  document
    .getElementById("link-cancel")
    .addEventListener("click", () => document.getElementById("link-dialog").close());
  document.getElementById("recipe-edit").addEventListener("click", () => {
    document.getElementById("recipe-dialog").close();
    editRecipe(openRecipeId, "recipes"); // come back here once saved
  });
  document.getElementById("recipe-delete").addEventListener("click", deleteRecipe);
  document
    .getElementById("recipe-close")
    .addEventListener("click", () => document.getElementById("recipe-dialog").close());
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
}

document.addEventListener("DOMContentLoaded", init);
