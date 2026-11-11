// The question a Merge asks before it happens (see CONTEXT.md): renaming an
// ingredient to the name of another folds it into that one, and can't be
// undone, so it's always asked, with counts of what changes.

const counted = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/**
 * {question, consequence, confirm} for merging ingredient into `into`:
 * counts of the recipes it's in and of sectionIds (the sections it will be
 * in, ticks included), or that it isn't used anywhere.
 */
export function mergeQuestion(recipes, ingredient, into, sectionIds) {
  const recipeCount = recipes.filter((r) =>
    r.components.some((c) => c.type === "ingredient" && c.id === ingredient.id),
  ).length;
  const sectionCount = sectionIds.length;
  const places = [
    recipeCount && counted(recipeCount, "recipe"),
    sectionCount && counted(sectionCount, "section"),
  ].filter(Boolean);
  const consequence = places.length
    ? `${ingredient.name} is used in ${places.join(" and ")}; ` +
      `${recipeCount + sectionCount === 1 ? "it'll" : "they'll all"} use ${into.name}, ` +
      `and ${ingredient.name} will be gone.`
    : `${ingredient.name} isn't used anywhere; it will be gone.`;
  return {
    question: `${into.name} already exists. Merge ${ingredient.name} into ${into.name}?`,
    consequence,
    confirm: `Merge ${ingredient.name} into ${into.name}`,
  };
}
