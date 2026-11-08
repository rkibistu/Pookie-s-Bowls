# Prod compose file and deploy guide

Status: ready-for-agent

Blocked by: 01

See `../spec.md`.

## What to do

- Add `docker-compose.prod.yml`: gunicorn serving `app:app`, debug off, no source mount, `./data:/data` for the database and backups, `restart: unless-stopped`, no `SEED`. Add gunicorn to `requirements.txt`. Dev's `docker-compose.yml` stays as it is (plus `SEED=1` from 01).
- Run migrations once, before gunicorn starts its workers, not once per worker.
- Write a deploy guide in the README:
  - **Set up the prod laptop:** Linux, Docker Engine enabled as a service so it starts on boot, clone the repo, first `up -d --build`, how to open it from another device on the home network.
  - **Deploy:** `git pull`, then `docker compose -f docker-compose.prod.yml up -d --build`; how to check the logs.
  - **Rehearse a migration:** download a backup from prod, put it in dev's `data/pookie.db`, start dev with the new code, look through the app.
  - **Roll back:** check out the previous commit, copy `data/backups/pre-NNNN-….db` to `data/pookie.db`, `up -d --build`.

## Done when

- `docker compose -f docker-compose.prod.yml up -d --build` serves the app with gunicorn, starting from an empty database, and it comes back after `docker restart` or a reboot.
