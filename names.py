"""The same name: what makes two names the same (see CONTEXT.md).

Names differing only in case, accents or extra spaces are the same: "branza"
is "Brânză", "Spring  onion" is "Spring onion". Every unique name is stored
with its key, and the unique indexes are on the key. static/js/items.js has
the same rule for the browser (nameKey).
"""

import unicodedata


def key(name):
    """The name with accents dropped, case folded and spaces collapsed."""
    decomposed = unicodedata.normalize("NFKD", name)
    unaccented = "".join(c for c in decomposed if not unicodedata.combining(c))
    return " ".join(unaccented.casefold().split())
