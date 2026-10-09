// Pookie's Bowls — entry point: wires every view once the page has loaded.

import { catalog } from "./catalog.js";
import { initIngredients } from "./ingredients.js";
import { initNewRecipe } from "./new-recipe.js";
import { pickSession } from "./pick-session.js";
import { initRecipeDialog } from "./recipe-dialog.js";
import { initRecipes } from "./recipes.js";
import { initShell } from "./shell.js";

function init() {
  initShell();
  initIngredients();
  pickSession.init();
  initNewRecipe();
  initRecipes();
  initRecipeDialog();
  catalog.reload();
}

document.addEventListener("DOMContentLoaded", init);
