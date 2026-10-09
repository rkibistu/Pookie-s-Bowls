import { el, pickChip } from "./dom.js";
import { itemKey } from "./items.js";
import { currentView, setView } from "./shell.js";

/**
 * Picking ingredients and listed recipes on a station, with the
 * tray showing the picks. Callers say what the picks start as and what Done
 * does with them; the session handles the view and the tray, and onChange
 * tells the list to redraw.
 */
export const pickSession = (() => {
  // null when not picking; otherwise {picks, blocked, onDone, onCancel,
  // returnTo}: picks is Map<itemKey, {type, id, name}> in pick order, blocked
  // the item keys that can't be picked, returnTo the view to go back to.
  let session = null;
  const listeners = [];
  const notify = () => listeners.forEach((listener) => listener());

  /**
   * Start picking from a copy of picks ([{type, id, name}]). Done hands the
   * picks to onDone; if that returns a promise that rejects, picking goes on.
   */
  function start({
    picks = [],
    blocked = [],
    title = "🥣 Your recipe",
    doneLabel,
    onDone,
    onCancel = null,
  }) {
    session = {
      picks: new Map([...picks].map((p) => [itemKey(p), { type: p.type, id: p.id, name: p.name }])),
      blocked: new Set(blocked),
      onDone,
      onCancel,
      returnTo: currentView(),
    };
    document.getElementById("build-title").textContent = title;
    document.getElementById("build-create").textContent = doneLabel;
    document.body.classList.add("selecting");
    document.getElementById("build-tray").hidden = false;
    setView("station");
    changed();
  }

  const active = () => session !== null;

  /** "picked", "free" or "blocked" (e.g. a recipe can't go inside itself). */
  function state(item) {
    const key = itemKey(item);
    if (!session) return "free";
    if (session.blocked.has(key)) return "blocked";
    return session.picks.has(key) ? "picked" : "free";
  }

  function toggle(item) {
    const key = itemKey(item);
    if (state(item) === "blocked") return;
    if (session.picks.has(key)) session.picks.delete(key);
    else session.picks.set(key, { type: item.type, id: item.id, name: item.name });
    changed();
  }

  function changed() {
    renderTray();
    notify();
  }

  /** The floating tray: one chip per pick, each removable. */
  function renderTray() {
    const list = document.getElementById("build-picks");
    list.replaceChildren();
    if (session.picks.size === 0) {
      list.append(el("li", "build-empty", "Tap ingredients to add them"));
    }
    for (const [key, pick] of session.picks) {
      list.append(
        pickChip(pick.name, `Remove ${pick.name}`, () => {
          session.picks.delete(key);
          changed();
        }),
      );
    }
    document.getElementById("build-count").textContent = String(session.picks.size);
  }

  /** Leave picking mode, back to the view it started from. */
  function end() {
    const { returnTo } = session;
    session = null;
    document.body.classList.remove("selecting");
    document.getElementById("build-tray").hidden = true;
    notify();
    setView(returnTo);
  }

  /** While Done is saving, neither Done nor Cancel can be pressed again. */
  function setSaving(saving) {
    document.getElementById("build-create").disabled = saving;
    document.getElementById("build-cancel").disabled = saving;
  }

  async function done() {
    setSaving(true);
    try {
      await session.onDone([...session.picks.values()]);
    } catch {
      return; // onDone has said what went wrong; keep picking
    } finally {
      setSaving(false);
    }
    end();
  }

  function cancel() {
    const { onCancel } = session;
    end();
    if (onCancel) onCancel();
  }

  function init() {
    document.getElementById("build-create").addEventListener("click", done);
    document.getElementById("build-cancel").addEventListener("click", cancel);
  }

  /** Call listener whenever what state() says may have changed. */
  const onChange = (listener) => listeners.push(listener);

  return { start, active, state, toggle, onChange, init };
})();
