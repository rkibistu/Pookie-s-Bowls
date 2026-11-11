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


def capitalised(name):
    """The name trimmed, with its first letter capitalised and the rest as typed.

    "spicy mayo" is saved as "Spicy mayo", "BBQ sauce" stays as it is, and a
    name starting with no letter ("00 flour") is unchanged. Every saved name
    goes through this; static/js/items.js has the same rule (capitalisedName).
    """
    name = name.strip()
    return name[:1].upper() + name[1:]
