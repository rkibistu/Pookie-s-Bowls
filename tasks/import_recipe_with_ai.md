# Import a recipe from a pasted page, with AI

Status: needs-triage

Type: grilling. This task is for deciding, not implementing: grill it, record the answers here, then turn it into implementation tasks.

Depends on: the AI service (a separate project, not started yet), and probably `tasks/new_ingredient_from_recipe.md`.

## The idea

Copy and paste the content of a web page where someone posted a recipe; an AI reads it and gives back the recipe as JSON that Pookie knows how to save as a recipe.

## Decided so far

- **Pasted page content, not a link.** A link can get the AI blocked by the site; pasting the text avoids that.
- **The AI answers with JSON** that Pookie turns into a recipe; Pookie's code does the saving, not the AI.
- **The AI runs in a separate service**, its own project, shared by several apps (Pookie and CaloriiLog for now). Pookie only talks to it; it doesn't run Claude itself.
- **The import runs in the background, on Pookie's server.** After starting it, you can move around the app, refresh, lock the phone or close it; the import keeps going and the result waits on the server.

## Open questions

Ideas raised in discussion are listed as options, not decisions.

### The result

- Is the AI's answer saved as a recipe directly, or does it open as a Draft in the New recipe dialog to review first? (Raised: always review, never save directly.)
- Which recipe fields does the AI fill in: name, notes (the steps?), link, categories, ingredients with quantities?
- Ingredients: how are the AI's ingredient names matched to the catalog? Should the existing ingredient (and category) names be sent with the page, so the AI reuses *Ceapă* instead of inventing *Onion*?
- Units: the AI must use the app's units (g, kg, ml, l, tsp, tbsp, cup, pcs, pinch). What happens to "2 cloves", "a handful", "salt to taste"?
- Language: keep the recipe's language, or something else?
- A pasted page that isn't a recipe, or holds several recipes: what then?
- Can the AI's answer contain recipes inside the recipe (e.g. a sauce made separately)?

### The background import

- What is kept for an import (the pasted text, its status, the answer or the error), and for how long? What happens to it after Save or Discard?
- Its states, e.g. waiting / reading / ready / failed, and whether a failed one can be retried.
- How you learn it's ready: a badge, a message, both? Where in the app?
- Shared or per person: does she see your imports, and can she review them?
- Can several imports wait at once, and in what order are they sent?
- What runs it: a worker container next to the web app, a thread inside it, something else?
- Does the background part need a new migration (an imports table)?

### Talking to the AI service

- How Pookie finds and authenticates to it (raised: an address and a per-app token in the compose file).
- What Pookie sends (raised: its own prompt and the JSON shape it expects, with the service staying generic).
- What Pookie does when the service is off, busy, out of usage, or too slow: what you see, and whether the import retries later by itself.
- Where the prompt lives in Pookie, and how it's changed.
- How the tests avoid calling the real AI (raised: one small module that talks to the service, replaced by a fake in tests).

### In the UI

- Where "Import a recipe" starts: the Recipes page, a station, both?
- What the paste box looks like, and whether the page's link is asked for too (for the recipe's link field).
