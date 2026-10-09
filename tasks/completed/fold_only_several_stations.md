# Station groups fold only when there are several

Status: done

The ingredient dialog groups section chips by station, and every group folds open and shut. Adding from a station's **+** shows just that station's group, so folding it does nothing useful.

## Decisions

- A group folds only when more than one station's group is shown: Add on the All ingredients page (starts folded, as now) and Edit ingredient (starts open, as now).
- A single group (Add from a station) is a plain heading with no fold arrow.
