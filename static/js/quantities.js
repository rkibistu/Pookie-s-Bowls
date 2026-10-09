// Quantities (see CONTEXT.md): how much of an item goes into a recipe, an
// amount (0 until filled in, shown empty) and a unit. A new row starts in the
// item's last unit; a recipe shows them when one of its categories does.

import { catalog } from "./catalog.js";
import { el } from "./dom.js";

// The same units as the server's recipes.UNITS.
export const UNITS = ["g", "kg", "ml", "l", "tsp", "tbsp", "cup", "pcs", "pinch"];

/** The unit an item starts with in a new recipe row. */
export function lastUnit(item) {
  const items = item.type === "recipe" ? catalog.recipes() : catalog.ingredients();
  return items.find((i) => i.id === item.id)?.last_unit ?? "g";
}

/** Whether a recipe in these categories shows its quantities. */
export const showsQuantities = (categoryIds) =>
  catalog.recipeCategories().some((c) => c.shows_quantities && categoryIds.includes(c.id));

/** An amount as its box shows it: empty for 0. */
export const formatAmount = (quantity) => (quantity ? String(quantity) : "");

/** What was typed as an amount: empty is 0, "0,5" is 0.5; null if it isn't one. */
export function parseAmount(text) {
  const trimmed = text.trim().replace(",", ".");
  if (!trimmed) return 0;
  const amount = Number(trimmed);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

/**
 * A row's amount box and unit dropdown. A changed amount (on leaving the box
 * or Enter) calls onChange({quantity}); a unit chosen, onChange({unit}).
 * Something that isn't an amount goes back to what it was.
 */
export function quantityControls(component, onChange) {
  const box = el("span", "quantity");
  let shown = component.quantity; // what the box stands for, as last changed

  const amount = document.createElement("input");
  amount.type = "text";
  amount.inputMode = "decimal";
  amount.className = "quantity-amount";
  amount.autocomplete = "off";
  amount.value = formatAmount(shown);
  amount.placeholder = "–"; // 0: nothing filled in yet
  amount.setAttribute("aria-label", `${component.name}: how much`);
  amount.addEventListener("keydown", (event) => {
    // Enter saves this box, not the form it's in.
    if (event.key === "Enter") {
      event.preventDefault();
      amount.blur();
    }
  });
  amount.addEventListener("change", () => {
    const quantity = parseAmount(amount.value);
    if (quantity === null) {
      amount.value = formatAmount(shown);
      return;
    }
    amount.value = formatAmount(quantity);
    if (quantity === shown) return;
    shown = quantity;
    onChange({ quantity });
  });

  const unit = document.createElement("select");
  unit.className = "quantity-unit";
  unit.setAttribute("aria-label", `${component.name}: unit`);
  for (const name of UNITS) unit.append(new Option(name, name));
  unit.value = component.unit;
  unit.addEventListener("change", () => onChange({ unit: unit.value }));

  box.append(amount, unit);
  return box;
}
