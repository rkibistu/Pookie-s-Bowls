# Pookie-s-Bowls
Very simple app to manage poke bowls recipies that is gonna be extented to all kind of recipies.


## Dev

```
docker compose up --build
```

Opens on http://localhost:5000 with live reload. A brand-new dev database gets the 🥣 Poke station and its recipe categories (`SEED=1`); to start over, stop the app and delete `data/pookie.db`.

Tests: `python -m pytest` and `npm test`.

## Prod

Prod runs on a laptop at home, from `docker-compose.prod.yml`: gunicorn, no debug, no seed (it starts empty), the database in `data/pookie.db`. Changing the database is always a new migration (see `migrations/README.md`); the app applies it when it starts.

### Set up the prod laptop (once)

1. Install Linux and [Docker Engine](https://docs.docker.com/engine/install/), then start Docker on every boot and let your user run it (log out and back in after):
   ```
   sudo systemctl enable --now docker
   sudo usermod -aG docker $USER
   ```
2. Keep it awake with the lid closed: in `/etc/systemd/logind.conf` set `HandleLidSwitch=ignore` (and `HandleLidSwitchExternalPower=ignore`), then `sudo systemctl restart systemd-logind`.
3. Get the app and start it:
   ```
   git clone <this repo> pookies-bowls && cd pookies-bowls
   docker compose -f docker-compose.prod.yml up -d --build
   ```
4. Find the laptop's address with `hostname -I` and open `http://<address>:5000` from a phone or laptop on the same Wi-Fi. Give the laptop a fixed address in the router so the link keeps working.

It comes back by itself after a reboot or a crash. While the laptop is off, the app is simply not there.

### Deploy

```
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f
```

The logs show `[db] Applying migration …` for each new migration and where the database was copied first (`data/backups/pre-NNNN-<time>.db`, the newest 10 are kept). If a migration fails, it's rolled back, the log says which one and why, and the app doesn't start (Docker keeps retrying; nothing changes until it's fixed). Then roll back, below.

### Rehearse a migration (before deploying it)

1. Download a backup from prod: on a laptop, scroll to the bottom of any page and click 💾 in the bottom-right corner. To restore one on prod, stop the app and copy it to `data/pookie.db`.
2. On the dev machine, stop dev, copy the file over `data/pookie.db`, and start dev with the new code (`docker compose up --build`).
3. Check the logs show the migration applied, and look through the app: stations, recipes, favorites.

### Roll back

```
docker compose -f docker-compose.prod.yml down
git log --oneline                        # find the commit before the bad one
git checkout <that commit>
sudo cp data/backups/pre-NNNN-<time>.db data/pookie.db   # the copy from just before
docker compose -f docker-compose.prod.yml up -d --build
```

Once a fix is on `main`, `git checkout main` and deploy as usual.
