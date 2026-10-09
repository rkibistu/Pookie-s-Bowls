// Type-ahead over every item in the ingredient list: the recipe filter, the
// new recipe dialog and the recipe dialog each add items with it.

import { el } from "./dom.js";
import { catalogItems } from "./ingredients.js";
import { itemKey, itemLabel } from "./items.js";

const FILTER_SUGGESTIONS = 6;

/**
 * Type-ahead over catalogItems(): typing shows matches under the input,
 * tapping one (or Enter for the first) calls onPick(item). Items whose key
 * excluded(key) says are already taken aren't suggested.
 */
export function initItemSearch(inputId, listId, excluded, onPick) {
  closeSuggestionsOnOutsideTap();
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);

  /** Show items matching what's typed; returns the matches. */
  function render() {
    const query = input.value.trim().toLowerCase();
    list.replaceChildren();
    const matches = query
      ? catalogItems()
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
