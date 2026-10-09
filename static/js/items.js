// Items: ingredients and listed recipes (e.g. sauces), told apart by type —
// {type: "ingredient" | "recipe", id, name, favorites?}. A recipe's components
// and a pick session's picks are items too.

import { el } from "./dom.js";
import { HEARTS } from "./shell.js";

/** "ingredient:3" or "recipe:7": tells items apart across both kinds. */
export const itemKey = (item) => `${item.type}:${item.id}`;

/** The name, marked 📖 for a recipe. */
export const itemLabel = (item) => (item.type === "recipe" ? `${SUB_RECIPE} ${item.name}` : item.name);

const SUB_RECIPE = "📖"; // marks a recipe used inside another recipe

/** Picks as a Map<itemKey, pick>, the way the draft keeps them. */
export const picksByKey = (picks) => new Map(picks.map((p) => [itemKey(p), p]));

/** Name followed by the hearts of whoever favorited it; pop's heart animates in. */
export function renderItemLabel(item, pop = null) {
  const label = el("span", "ingredient-label");
  label.append(el("span", "ingredient-name", item.name));
  if (item.favorites && item.favorites.length) {
    const badges = el("span", "fav-badges");
    for (const person of item.favorites) {
      const heart = el("span", "fav-badge", HEARTS[person]);
      heart.title = person === "me" ? "Me" : "Her";
      if (person === pop) heart.classList.add("pop");
      badges.append(heart);
    }
    label.append(badges);
  }
  return label;
}

/**
 * One ingredient row. A recipe inside (e.g. a sauce) opens with onOpen on
 * tap, if given; onRemove, if given, adds a ✕.
 */
export function renderComponentRow(component, { onOpen = null, onRemove = null } = {}) {
  const item = el("li", "recipe-ingredient");
  if (component.type === "recipe" && onOpen) {
    const open = el("button", "sub-recipe-btn");
    open.type = "button";
    open.append(
      el("span", null, SUB_RECIPE),
      renderItemLabel(component),
      el("span", "sub-recipe-arrow", "›"),
    );
    open.addEventListener("click", onOpen);
    item.append(open);
  } else {
    if (component.type === "recipe") item.append(el("span", null, SUB_RECIPE));
    item.append(renderItemLabel(component));
  }
  if (!onRemove) return item;

  const remove = el("button", "recipe-ingredient-remove", "✕");
  remove.type = "button";
  remove.setAttribute("aria-label", `Remove ${component.name}`);
  remove.addEventListener("click", onRemove);
  item.append(remove);
  return item;
}
