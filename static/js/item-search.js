// Type-ahead over every item that can be picked: the recipe filter, the new
// recipe dialog and the recipe dialog each add items with it, and the
// ingredient dialog suggests existing ingredients with it.

import { el } from "./dom.js";
import { catalog } from "./catalog.js";
import { itemLabel, suggestions } from "./items.js";

/**
 * Type-ahead over items() (catalog.items() unless given): typing shows
 * matches under the input, tapping one (or Enter for the first, unless
 * pickOnEnter is false) calls onPick(item). Items whose key excluded(key)
 * says are already taken aren't suggested; noMatch is what shows when
 * nothing matches (null: nothing). With takenNames (() => names already in
 * the recipe), a name nothing has is offered last as a new ingredient, picked
 * as {type: "ingredient", id: null, name}.
 */
export function initItemSearch(
  inputId,
  listId,
  excluded,
  onPick,
  { items = catalog.items, pickOnEnter = true, noMatch = "No match", takenNames = null } = {},
) {
  closeSuggestionsOnOutsideTap();
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);

  /** Show the rows for what's typed; returns the items they pick, in order. */
  function render() {
    // "branza" finds Brânză
    const { matches, newName } = suggestions(items(), input.value, {
      excluded,
      offerNew: takenNames !== null,
      takenNames: takenNames ? takenNames() : [],
    });
    const rows = matches.map((item) => [itemLabel(item), item]);
    if (newName) {
      rows.push([`➕ Add “${newName}” as a new ingredient`, { type: "ingredient", id: null, name: newName }]);
    }
    list.replaceChildren();
    for (const [label, item] of rows) {
      const option = el("button", "filter-suggestion", label);
      option.type = "button";
      option.addEventListener("click", () => pick(item));
      const li = el("li");
      li.append(option);
      list.append(li);
    }
    if (input.value.trim() && rows.length === 0 && noMatch && takenNames === null) {
      list.append(el("li", "filter-no-match", noMatch));
    }
    list.hidden = list.children.length === 0;
    return rows.map(([, item]) => item);
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
      if (!pickOnEnter) {
        list.hidden = true;
        return; // Enter does what it does in the form (e.g. Save)
      }
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

let outsideTapWired = false;

/** Tapping anywhere else closes any open suggestions. */
function closeSuggestionsOnOutsideTap() {
  if (outsideTapWired) return;
  outsideTapWired = true;
  document.addEventListener("click", (event) => {
    const search = event.target.closest(".filter-search");
    document.querySelectorAll(".filter-suggestions").forEach((list) => {
      if (!search || !search.contains(list)) list.hidden = true;
    });
  });
}
