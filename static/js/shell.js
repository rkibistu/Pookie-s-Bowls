// The app shell: who is using it (identity → color theme) and which view is
// shown. Both survive reloads in localStorage (per device).

import { renderIngredients } from "./ingredients.js";
import { loadRecipes } from "./recipes.js";

const IDENTITY_KEY = "pookie-identity"; // "me" | "her"
const VIEW_KEY = "pookie-view"; // "ingredients" | "recipes"

// Each person's favorite heart.
export const HEARTS = { me: "💜", her: "💚" };

/** Apply the chosen identity: drives the color theme and button state. */
function setIdentity(who) {
  document.documentElement.dataset.identity = who;
  localStorage.setItem(IDENTITY_KEY, who);
  document.querySelectorAll(".identity-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.who === who);
  });
  renderIngredients(); // hearts hint and double-click target follow the identity
}

export function currentIdentity() {
  return document.documentElement.dataset.identity;
}

/** Show one view and highlight its nav button. */
export function setView(view) {
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

/** The view being shown: "ingredients" | "recipes". */
export function currentView() {
  return localStorage.getItem(VIEW_KEY) || "ingredients";
}

/** Restore the saved identity (default: "me") and view, and wire their buttons. */
export function initShell() {
  setIdentity(localStorage.getItem(IDENTITY_KEY) || "me");
  document.querySelectorAll(".identity-btn").forEach((btn) => {
    btn.addEventListener("click", () => setIdentity(btn.dataset.who));
  });

  setView(currentView());
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });
}
