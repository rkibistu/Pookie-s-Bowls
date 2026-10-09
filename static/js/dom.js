// Small DOM pieces shared by every view: elements, chips, dialog errors, the
// two-tap Delete button and the toast.

/** Small DOM helper: el("div", "class-name", "text"). */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Fill a .chips box with one checkbox per {id, name} option. */
export function renderChips(containerId, options, selected) {
  const chips = document.getElementById(containerId);
  chips.replaceChildren();
  for (const option of options) {
    const label = el("label", "chip");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.value = option.id;
    box.checked = selected.has(option.id);
    label.append(box, el("span", null, option.name));
    chips.append(label);
  }
}

export function checkedChipIds(containerId) {
  return [...document.querySelectorAll(`#${containerId} input:checked`)].map((box) =>
    Number(box.value),
  );
}

/** Show (or with no message, hide) the error line in a dialog. */
export function showDialogError(message, boxId) {
  const box = document.getElementById(boxId);
  box.textContent = message || "";
  box.hidden = !message;
}

/** Disarm a two-tap Delete button (see deleteIngredient, deleteRecipe). */
export function resetDeleteButton(id) {
  const del = document.getElementById(id);
  delete del.dataset.armed;
  del.textContent = "Delete";
}

/** A removable chip: the label and a ✕ that calls onRemove. */
export function pickChip(label, removeLabel, onRemove) {
  const chip = el("li", "build-pick");
  const remove = el("button", "build-pick-remove", "✕");
  remove.type = "button";
  remove.setAttribute("aria-label", removeLabel);
  remove.addEventListener("click", onRemove);
  chip.append(el("span", null, label), remove);
  return chip;
}

let toastTimer = null;

/** Briefly show a message at the bottom of the screen. */
export function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
}
