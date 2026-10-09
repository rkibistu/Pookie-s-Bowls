// Pookie's Bowls — entry point: wires every view once the page has loaded.

import { initAllIngredients } from "./all-ingredients.js";
import { initCategoriesDialog } from "./categories-dialog.js";
import { catalog } from "./catalog.js";
import { initIngredientDialog } from "./ingredient-dialog.js";
import { initNewRecipe } from "./new-recipe.js";
import { pickSession } from "./pick-session.js";
import { initRecipeDialog } from "./recipe-dialog.js";
import { initRecipes } from "./recipes.js";
import { initShell } from "./shell.js";
import { initStation } from "./station.js";
import { initStationDialog } from "./station-dialog.js";

function init() {
  initShell();
  initStation();
  initIngredientDialog();
  pickSession.init();
  initNewRecipe();
  initRecipes();
  initRecipeDialog();
  initCategoriesDialog();
  initStationDialog();
  initAllIngredients();
  catalog.reload();
}

document.addEventListener("DOMContentLoaded", init);
