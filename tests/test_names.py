import pytest

import names


@pytest.mark.parametrize(
    "typed, saved",
    [
        ("spicy mayo", "Spicy mayo"),
        ("nduja", "Nduja"),
        ("ăluna", "Ăluna"),
        ("BBQ sauce", "BBQ sauce"),
        ("iPhone", "IPhone"),
        ("00 flour", "00 flour"),
        ("🥑 mash", "🥑 mash"),
        ("  tofu ", "Tofu"),
    ],
)
def test_a_name_is_saved_trimmed_with_only_its_first_letter_capitalised(typed, saved):
    assert names.capitalised(typed) == saved
