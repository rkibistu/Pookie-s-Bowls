# Backup page

Status: done

Blocked by: 01

See `../spec.md`. This must be done before any migration after the baseline goes to prod: it's how a migration is rehearsed on real data.

## What to do

- A place in the app (e.g. in the side menu) with a button that downloads a consistent snapshot of the database to the laptop or phone that clicked it, named like `pookies-bowls-2026-11-08.db`. Make the snapshot with SQLite's backup API, so it's consistent even while the app is in use.
- Download only, no restore. A short line on the page says how to restore: copy the file to `data/pookie.db` on the prod laptop while the app is stopped.

## Done when

- The downloaded file opens as a working database: dropped into dev's `data/pookie.db`, dev shows the same stations, recipes and favorites.

## Comments

- Done. Not a page in the end: a 💾 button in the bottom-right corner, laptops only, shown once the page is scrolled to the bottom (or has nothing to scroll), hidden while picking. It downloads `/backup` (`db.snapshot`: SQLite's backup API into memory, then its bytes). How to restore is in its comment in `index.html` and in the README. Checked from a prod container: the downloaded file, opened by dev, shows prod's stations and ingredients and isn't reseeded.
