// The app shell: who is using it (identity → color theme) and which view is
// shown. Both survive reloads in localStorage (per device).

const IDENTITY_KEY = "pookie-identity"; // "me" | "her"
const VIEW_KEY = "pookie-view"; // "station" | "recipes"
const VIEWS = ["station", "recipes"];

const identityListeners = [];

/** Call listener whenever the identity changes. */
export function onIdentityChange(listener) {
  identityListeners.push(listener);
}

/** Apply the chosen identity: drives the color theme and button state. */
function setIdentity(who) {
  document.documentElement.dataset.identity = who;
  localStorage.setItem(IDENTITY_KEY, who);
  document.querySelectorAll(".identity-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.who === who);
  });
  identityListeners.forEach((listener) => listener());
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
}

/** The view being shown: "station" | "recipes". */
export function currentView() {
  const view = localStorage.getItem(VIEW_KEY);
  return VIEWS.includes(view) ? view : "station";
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
