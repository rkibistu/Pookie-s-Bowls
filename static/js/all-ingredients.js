// The All ingredients page: every ingredient A→Z, orphans included, each
// with where it appears ("Poke · Protein"). Its rows work like a station's:
// edit, favorites, and picking during a pick session.

import { catalog } from "./catalog.js";
import { el } from "./dom.js";
import { pickSession } from "./pick-session.js";
import { onIdentityChange } from "./shell.js";
import { openIngredientDialog, renderItemRow } from "./station.js";

const ORPHAN = "on no station";

/** "Station · Section" for every ingredient section, by id. */
function sectionPlaces() {
  const places = new Map();
  for (const station of catalog.stations()) {
    for (const section of station.sections) {
      if (section.kind === "ingredients") {
        places.set(section.id, `${station.emoji} ${station.name} · ${section.name}`);
      }
    }
  }
  return places;
}

function render() {
  const errorBox = document.getElementById("all-error");
  errorBox.textContent = catalog.loadError() || "";
  errorBox.hidden = !catalog.loadError();

  const onlyOrphans = document.getElementById("only-orphans").checked;
  const places = sectionPlaces();
  const ingredients = catalog
    .ingredients()
    .filter((ingredient) => !onlyOrphans || ingredient.section_ids.length === 0);

  const card = document.getElementById("all-ingredients");
  card.replaceChildren();
  const header = el("header", "category-header");
  header.append(
    el("h2", "category-title", onlyOrphans ? "Orphans" : "All ingredients"),
    el("span", "category-count", String(ingredients.length)),
  );
  card.append(header);

  if (ingredients.length === 0) {
    card.append(
      el("p", "category-empty", onlyOrphans ? "No orphans — every ingredient has a place 🎉" : "No ingredients yet"),
    );
    return;
  }
  const list = el("ul", "ingredient-list");
  for (const ingredient of ingredients) {
    const where = ingredient.section_ids.map((id) => places.get(id)).filter(Boolean);
    list.append(renderItemRow(ingredient, where.length ? where.join(", ") : ORPHAN));
  }
  card.append(list);
}

export function initAllIngredients() {
  catalog.onChange(render);
  pickSession.onChange(render);
  onIdentityChange(render);
  document.getElementById("only-orphans").addEventListener("change", render);
  // A new ingredient from here has no sections until you give it some.
  document
    .getElementById("all-add-ingredient-btn")
    .addEventListener("click", () => openIngredientDialog());
}
