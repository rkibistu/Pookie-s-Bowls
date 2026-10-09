// The app shell: who is using it (identity → color theme), which view is
// shown, and on phones the side menu holding the nav. Identity and view
// survive reloads in localStorage (per device).

const IDENTITY_KEY = "pookie-identity"; // "me" | "her"
const VIEW_KEY = "pookie-view"; // "station" | "recipes" | "all"
const STATION_KEY = "pookie-station"; // the id of the station used last
const VIEWS = ["station", "recipes", "all"];

const identityListeners = [];
const viewListeners = [];

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

/** Call listener whenever the view changes (station buttons highlight themselves). */
export function onViewChange(listener) {
  viewListeners.push(listener);
}

/** Show one view and highlight its nav button. */
export function setView(view) {
  localStorage.setItem(VIEW_KEY, view);
  document.querySelectorAll(".view").forEach((section) => {
    section.hidden = section.id !== `view-${view}`;
  });
  document.querySelectorAll(".nav-btn[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  viewListeners.forEach((listener) => listener());
  syncPageTitle();
}

/** Phones show the page's name in the header: the highlighted nav button's. */
export function syncPageTitle() {
  const active = document.querySelector(".app-nav .nav-btn.active");
  document.getElementById("page-title").textContent = active ? active.textContent : "";
}

/** Open or close the side menu (phones only; wider screens show the nav as a row). */
function setMenuOpen(open) {
  document.body.classList.toggle("menu-open", open);
  document.getElementById("menu-btn").setAttribute("aria-expanded", String(open));
}

/** The id of the station used last on this device, or null. */
export function savedStationId() {
  return Number(localStorage.getItem(STATION_KEY)) || null;
}

export function saveStationId(id) {
  localStorage.setItem(STATION_KEY, String(id));
}

/** The view being shown: "station" | "recipes" | "all" (All ingredients). */
export function currentView() {
  const view = localStorage.getItem(VIEW_KEY);
  return VIEWS.includes(view) ? view : "station";
}

/** Restore the saved identity (default: "me") and view, and wire their buttons.
 * Station buttons come and go with the stations; station.js draws them. */
export function initShell() {
  setIdentity(localStorage.getItem(IDENTITY_KEY) || "me");
  document.querySelectorAll(".identity-btn").forEach((btn) => {
    btn.addEventListener("click", () => setIdentity(btn.dataset.who));
  });

  setView(currentView());
  document.querySelectorAll(".nav-btn[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  // Any choice in the menu, the ✕, a tap beside it or Escape closes it.
  document.getElementById("menu-btn").addEventListener("click", () => setMenuOpen(true));
  document.getElementById("menu-close").addEventListener("click", () => setMenuOpen(false));
  document.getElementById("menu-backdrop").addEventListener("click", () => setMenuOpen(false));
  document.getElementById("app-nav").addEventListener("click", (event) => {
    if (event.target.closest(".nav-btn")) setMenuOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenuOpen(false);
  });
}
