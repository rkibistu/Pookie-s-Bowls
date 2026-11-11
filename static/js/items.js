// Items: ingredients and listed recipes (e.g. sauces), told apart by type —
// {type: "ingredient" | "recipe", id, name, favorites?}. A recipe's components
// and a pick session's picks are items too.

import { el } from "./dom.js";

// Each person's favorite heart.
export const HEARTS = { me: "💜", her: "💚" };

/**
 * The same name (see CONTEXT.md): names differing only in case, accents or
 * extra spaces have the same key, "branza" and "Brânză". Same rule as the
 * server's names.py.
 */
export const nameKey = (name) =>
  name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .trim()
    .split(/\s+/)
    .join(" ");

/**
 * The name as the server saves it: trimmed, first letter capitalised, the
 * rest as typed ("spicy mayo" is "Spicy mayo", "BBQ sauce" stays). Same rule
 * as the server's names.py (capitalised).
 */
export const capitalisedName = (name) => {
  const [first = "", ...rest] = name.trim(); // by code point, so an emoji stays whole
  return first.toUpperCase() + rest.join("");
};

const SUGGESTIONS = 6;

/**
 * What the type-ahead offers for query: {matches, newName}. matches are the
 * items whose name contains it (not excluded(itemKey), at most 6); newName,
 * when offerNew, is the query as a new ingredient's saved name, offered only
 * if nothing in items or takenNames has the Same name; otherwise null.
 */
export function suggestions(items, query, { excluded = () => false, offerNew = false, takenNames = [] } = {}) {
  const key = nameKey(query);
  if (!key) return { matches: [], newName: null };
  const matches = items
    .filter((item) => !excluded(itemKey(item)))
    .filter((item) => nameKey(item.name).includes(key))
    .slice(0, SUGGESTIONS);
  const taken = [...items.map((item) => item.name), ...takenNames].some((name) => nameKey(name) === key);
  return { matches, newName: offerNew && !taken ? capitalisedName(query) : null };
}

/** "ingredient:3" or "recipe:7": tells items apart across both kinds. */
export const itemKey = (item) => `${item.type}:${item.id}`;

/** The name, marked 📖 for a recipe. */
export const itemLabel = (item) => (item.type === "recipe" ? `${SUB_RECIPE} ${item.name}` : item.name);

const SUB_RECIPE = "📖"; // marks a recipe used inside another recipe

/**
 * Tells picks apart: itemKey for an item in the catalog; a new ingredient
 * (no id yet, created when the recipe is saved) by its name, so two new
 * picks with the Same name are one.
 */
export const pickKey = (pick) => (pick.id == null ? `new:${nameKey(pick.name)}` : itemKey(pick));

/** Picks as a Map<pickKey, pick>, the way the draft keeps them; the first of the same pick wins. */
export const picksByKey = (picks) => {
  const byKey = new Map();
  for (const pick of picks) if (!byKey.has(pickKey(pick))) byKey.set(pickKey(pick), pick);
  return byKey;
};

/**
 * These items as a draft's picks, in their order: one in before (the picks
 * it had) keeps its quantity, a new one starts at 0 in lastUnit(item).
 */
export const draftPicks = (items, before, lastUnit) =>
  picksByKey(items.map((item) => before.get(pickKey(item)) ?? { ...item, quantity: 0, unit: lastUnit(item) }));

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
 * tap, if given; quantity (its amount box and unit, see quantities.js) goes
 * on the right, if given; onRemove, if given, adds a ✕ after it.
 */
export function renderComponentRow(
  component,
  { onOpen = null, quantity = null, onRemove = null } = {},
) {
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
    const label = renderItemLabel(component);
    // Not in the catalog until the recipe is saved: a typo can still be caught.
    if (component.id == null) label.append(el("span", "new-tag", "new"));
    item.append(label);
  }
  if (quantity) item.append(quantity);
  if (!onRemove) return item;

  const remove = el("button", "recipe-ingredient-remove", "✕");
  remove.type = "button";
  remove.setAttribute("aria-label", `Remove ${component.name}`);
  remove.addEventListener("click", onRemove);
  item.append(remove);
  return item;
}
