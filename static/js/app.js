// Pookie's Bowls — app shell (identity, theme, views) + ingredient catalog.
// State that must survive reloads lives in localStorage (per device).

const IDENTITY_KEY = "pookie-identity"; // "me" | "her"
const VIEW_KEY = "pookie-view"; // "ingredients" | "recipes"

/** Apply the chosen identity: drives the color theme and button state. */
function setIdentity(who) {
  document.documentElement.dataset.identity = who;
  localStorage.setItem(IDENTITY_KEY, who);
  document.querySelectorAll(".identity-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.who === who);
  });
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
        const edit = el("button", "icon-btn", "✏️");
        edit.type = "button";
        edit.title = `Edit ${ingredient.name}`;
        edit.setAttribute("aria-label", `Edit ${ingredient.name}`);
        edit.addEventListener("click", () => openIngredientDialog(ingredient));
        row.append(el("span", "ingredient-name", ingredient.name), edit);
        list.append(row);
      }
      card.append(list);
    }
    container.append(card);
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

function showDialogError(message) {
  const box = document.getElementById("ingredient-error");
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
}

document.addEventListener("DOMContentLoaded", init);
