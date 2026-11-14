# Prod: using the app for real

Status: done

We start using the app for real, the two of us, from a second laptop running at home. From now on the prod database holds data we care about: every schema change must carry the existing data forward.

## Decisions

### Prod

- Prod runs on a separate Linux laptop with Docker Engine as a system service, so the app comes back by itself when the laptop restarts. The laptop is off from time to time; while it's off, the app is simply unavailable.
- Deploying is `git pull` on `main`, then `docker compose -f docker-compose.prod.yml up -d --build`. `main` must always be deployable.
- Prod uses its own compose file: gunicorn instead of the Flask dev server, debug off, no source mount, the database in the mounted `data/` folder, `restart: unless-stopped`. Dev stays as it is (live reload, debug).
- Until Cloudflare is set up, prod is reachable only on the home network.

### Database

- See ADR 0002. `schema.sql` becomes migration `0001_baseline`. Each later change is a new numbered migration, applied at startup in its own transaction and tracked with `PRAGMA user_version`. Migrations only go forward.
- Before applying any migration, the app copies the database to `data/backups/pre-NNNN-<time>.db` and keeps the last 10.
- If a migration fails, the app refuses to start and logs why.
- Prod starts completely empty: no stations, no recipe categories.
- The seed (Poke station, Poke bowl / Sauce / Soup) stays for dev only: it runs only on a brand-new database and only when `SEED=1` (set in `docker-compose.yml`, never in prod). Deleting things on dev no longer brings them back; to reseed, delete `data/pookie.db`.
- Tests never depend on the seed: they create their own data.
- The current dev database and its `.bak` files are junk: delete them and start dev fresh from the migrations.

### Testing a migration before prod

1. Automated: every migration builds a working database from nothing, and each new migration comes with a test that builds a database at the previous version, fills it with typical rows, migrates it, and checks every row survived.
2. Rehearsal: before deploying a migration, download a backup from prod, drop it into dev's `data/pookie.db`, start dev with the new code, and look through the app.
3. Safety net on prod: the copy taken before migrating, and refusing to start on failure. Rolling back is: check out the previous commit, copy the backup back to `data/pookie.db`, `up -d --build`.

### Backups

- A backup page: a button that downloads a consistent snapshot of the database to whichever laptop clicked it. Download only; restoring is copying the file into `data/` by hand on the prod laptop.

### Later

- See ADR 0003. Cloudflare Tunnel and Cloudflare Access let us in from outside the home network, our two emails only. No login screen in the app.
- Then the app reads the logged-in email to know who is 💜 and who is 💚. Me/her stays as it is today until then.

## Tickets

1. `issues/01-migrations.md`
2. `issues/02-prod_deploy.md`
3. `issues/03-backup_page.md` (must be done before any migration after the baseline goes to prod)
4. `issues/04-cloudflare_access.md` (later)
