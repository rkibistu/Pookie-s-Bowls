// Pookie's Bowls — entry point: wires every view once the page has loaded.

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
}

document.addEventListener("DOMContentLoaded", init);
