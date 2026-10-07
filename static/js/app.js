// Pookie's Bowls — app shell (identity, theme, views), ingredient catalog,
// and the bowl builder.
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

async function loadIngredients() {
  const errorBox = document.getElementById("ingredients-error");
  try {
    categories = (await api("GET", "/api/ingredients")).categories;
    errorBox.hidden = true;
    renderIngredients();
  } catch (err) {
    errorBox.textContent = `Couldn't load ingredients: ${err.message}`;
    errorBox.hidden = false;
  }
}

/** One card per category, each listing its ingredients. */
function renderIngredients() {
  const container = document.getElementById("ingredient-sections");
  container.replaceChildren();

  for (const category of categories) {
    const card = el("section", "category-card");
    const header = el("header", "category-header");
    header.append(
      el("h2", "category-title", category.name),
      el("span", "category-count", String(category.ingredients.length)),
    );
    card.append(header);

    if (category.ingredients.length === 0) {
      card.append(el("p", "category-empty", "Nothing here yet"));
    } else {
      const list = el("ul", "ingredient-list");
      for (const ingredient of category.ingredients) {
        const row = el("li", "ingredient-row");
        if (bowlPicks && bowlPicks.has(ingredient.id)) row.classList.add("picked");
        const edit = el("button", "icon-btn", "✏️");
        edit.type = "button";
        edit.title = `Edit ${ingredient.name}`;
        edit.setAttribute("aria-label", `Edit ${ingredient.name}`);
        edit.addEventListener("click", () => openIngredientDialog(ingredient));
        row.append(
          renderIngredientLabel(ingredient),
          renderFavoriteToggle(ingredient),
          edit,
        );
        row.addEventListener("click", (event) => {
          if (bowlPicks) toggleBowlPick(ingredient);
          else handleRowTap(event, row, ingredient);
        });
        list.append(row);
      }
      card.append(list);
    }
    container.append(card);
  }
}

// Touch screens have no hover, so the toggle is hidden there and a double-tap
// on the row adds/removes the current identity's heart instead.
const touchOnly = window.matchMedia("(hover: none)");
const DOUBLE_TAP_MS = 350;
let lastTap = null; // {row, time} of the previous tap

function handleRowTap(event, row, ingredient) {
  if (!touchOnly.matches || event.target.closest("button")) return;
  const now = Date.now();
  if (lastTap && lastTap.row === row && now - lastTap.time < DOUBLE_TAP_MS) {
    lastTap = null;
    toggleFavorite(ingredient, ingredient.favorites.includes(currentIdentity()));
  } else {
    lastTap = { row, time: now };
  }
}

let justFavorited = null; // {id, person} of the heart just added, to animate it

/** Name followed by the hearts of whoever favorited it. */
function renderIngredientLabel(ingredient) {
  const label = el("span", "ingredient-label");
  label.append(el("span", "ingredient-name", ingredient.name));
  if (ingredient.favorites.length) {
    const badges = el("span", "fav-badges");
    for (const person of ingredient.favorites) {
      const heart = el("span", "fav-badge", HEARTS[person]);
      heart.title = person === "me" ? "Me" : "Her";
      if (justFavorited && justFavorited.id === ingredient.id && justFavorited.person === person) {
        heart.classList.add("pop");
      }
      badges.append(heart);
    }
    label.append(badges);
  }
  return label;
}

/** Add/remove the current identity's heart. */
function renderFavoriteToggle(ingredient) {
  const who = currentIdentity();
  const isFavorite = ingredient.favorites.includes(who);
  const btn = el("button", "icon-btn fav-btn", isFavorite ? "💔" : HEARTS[who]);
  btn.type = "button";
  btn.classList.toggle("is-favorite", isFavorite);
  btn.setAttribute("aria-pressed", String(isFavorite));
  const action = isFavorite ? "Remove from favorites" : "Add to favorites";
  btn.title = action;
  btn.setAttribute("aria-label", `${action}: ${ingredient.name}`);
  btn.addEventListener("click", () => toggleFavorite(ingredient, isFavorite));
  return btn;
}

async function toggleFavorite(ingredient, isFavorite) {
  const who = currentIdentity();
  const errorBox = document.getElementById("ingredients-error");
  try {
    await api(isFavorite ? "DELETE" : "PUT", `/api/ingredients/${ingredient.id}/favorites/${who}`);
    justFavorited = isFavorite ? null : { id: ingredient.id, person: who };
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

  const chips = document.getElementById("ingredient-categories");
  chips.replaceChildren();
  for (const category of categories) {
    const label = el("label", "chip");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.value = category.id;
    box.checked = selected.has(category.id);
    label.append(box, el("span", null, category.name));
    chips.append(label);
  }

  const del = document.getElementById("ingredient-delete");
  del.hidden = !ingredient;
  resetDeleteButton();
  showDialogError(null);

  document.getElementById("ingredient-dialog").showModal();
  if (!ingredient) document.getElementById("ingredient-name").focus();
}

function showDialogError(message, boxId = "ingredient-error") {
  const box = document.getElementById(boxId);
  box.textContent = message || "";
  box.hidden = !message;
}

function resetDeleteButton() {
  const del = document.getElementById("ingredient-delete");
  delete del.dataset.armed;
  del.textContent = "Delete";
}

async function saveIngredient(event) {
  event.preventDefault();
  const body = {
    name: document.getElementById("ingredient-name").value,
    category_ids: [...document.querySelectorAll("#ingredient-categories input:checked")].map(
      (box) => Number(box.value),
    ),
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

// ---- Bowl builder ---------------------------------------------------------

// null outside selection mode; otherwise the picks as Map<id, name> (pick order).
let bowlPicks = null;

function startBowl() {
  bowlPicks = new Map();
  document.body.classList.add("selecting");
  document.getElementById("bowl-tray").hidden = false;
  renderBowlTray();
  renderIngredients();
}

/** Leave selection mode, dropping every pick. */
function endBowl() {
  bowlPicks = null;
  document.body.classList.remove("selecting");
  document.getElementById("bowl-tray").hidden = true;
  renderIngredients();
}

function toggleBowlPick(ingredient) {
  if (bowlPicks.has(ingredient.id)) bowlPicks.delete(ingredient.id);
  else bowlPicks.set(ingredient.id, ingredient.name);
  renderBowlTray();
  renderIngredients();
}

/** The floating tray: one chip per pick, each removable. */
function renderBowlTray() {
  const list = document.getElementById("bowl-picks");
  list.replaceChildren();
  if (bowlPicks.size === 0) {
    list.append(el("li", "bowl-empty", "Tap ingredients to add them"));
  }
  for (const [id, name] of bowlPicks) {
    const chip = el("li", "bowl-pick");
    const remove = el("button", "bowl-pick-remove", "✕");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${name}`);
    remove.addEventListener("click", () => {
      bowlPicks.delete(id);
      renderBowlTray();
      renderIngredients();
    });
    chip.append(el("span", null, name), remove);
    list.append(chip);
  }
  document.getElementById("bowl-count").textContent = String(bowlPicks.size);
  document.getElementById("bowl-create").disabled = bowlPicks.size === 0;
}

function openBowlDialog() {
  document.getElementById("bowl-summary").textContent = [...bowlPicks.values()].join(", ");
  showDialogError(null, "bowl-error");
  document.getElementById("bowl-dialog").showModal();
  document.getElementById("bowl-name").focus();
}

async function saveBowl(event) {
  event.preventDefault();
  const body = {
    kind: "bowl",
    name: document.getElementById("bowl-name").value,
    notes: document.getElementById("bowl-notes").value,
    ingredient_ids: [...bowlPicks.keys()],
  };
  const save = document.getElementById("bowl-save");
  save.disabled = true;
  try {
    const bowl = await api("POST", "/api/recipes", body);
    document.getElementById("bowl-dialog").close();
    document.getElementById("bowl-form").reset();
    endBowl();
    showToast(`“${bowl.name}” saved! 🥣`);
  } catch (err) {
    showDialogError(err.message, "bowl-error");
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

function initBowlBuilder() {
  document.getElementById("create-bowl-btn").addEventListener("click", startBowl);
  document.getElementById("bowl-cancel").addEventListener("click", () => {
    document.getElementById("bowl-form").reset();
    endBowl();
  });
  document.getElementById("bowl-create").addEventListener("click", openBowlDialog);
  document.getElementById("bowl-form").addEventListener("submit", saveBowl);
  document
    .getElementById("bowl-dialog-cancel")
    .addEventListener("click", () => document.getElementById("bowl-dialog").close());
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
  initBowlBuilder();
}

document.addEventListener("DOMContentLoaded", init);
