// The app shell: who is using it (identity → color theme) and which view is
// shown. Both survive reloads in localStorage (per device).

const IDENTITY_KEY = "pookie-identity"; // "me" | "her"
const VIEW_KEY = "pookie-view"; // "station" | "recipes"
const STATION_KEY = "pookie-station"; // the id of the station used last
const VIEWS = ["station", "recipes"];

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
}

/** The id of the station used last on this device, or null. */
export function savedStationId() {
  return Number(localStorage.getItem(STATION_KEY)) || null;
}

export function saveStationId(id) {
  localStorage.setItem(STATION_KEY, String(id));
}

/** The view being shown: "station" | "recipes". */
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
}
