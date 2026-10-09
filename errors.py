"""The one error a broken rule raises, in any module; app.py turns it into HTTP."""

INVALID = "invalid"
NOT_FOUND = "not_found"
DUPLICATE = "duplicate"


class RuleError(Exception):
    """A rule a change broke; kind is INVALID, NOT_FOUND or DUPLICATE."""

    def __init__(self, message, kind=INVALID):
        super().__init__(message)
        self.message = message
        self.kind = kind
