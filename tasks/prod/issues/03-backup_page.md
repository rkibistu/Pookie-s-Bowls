# Backup page

Status: ready-for-agent

Blocked by: 01

See `../spec.md`. This must be done before any migration after the baseline goes to prod: it's how a migration is rehearsed on real data.

## What to do

- A place in the app (e.g. in the side menu) with a button that downloads a consistent snapshot of the database to the laptop or phone that clicked it, named like `pookies-bowls-2026-11-08.db`. Make the snapshot with SQLite's backup API, so it's consistent even while the app is in use.
- Download only, no restore. A short line on the page says how to restore: copy the file to `data/pookie.db` on the prod laptop while the app is stopped.

## Done when

- The downloaded file opens as a working database: dropped into dev's `data/pookie.db`, dev shows the same stations, recipes and favorites.
