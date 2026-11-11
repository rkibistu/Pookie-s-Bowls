# Reach the app from outside home, with Cloudflare

Status: ready-for-human

Blocked by: 02

See `../spec.md` and ADR 0003. Not now: pick this up once prod is stable and we want it.

## The idea

- Cloudflare Tunnel from the prod laptop, so no router ports are opened.
  - **One tunnel for the whole server**, not one per app: the server will host several apps. cloudflared runs on the server as a system service (`cloudflared service install <token>`), not inside this app's compose file, and each app gets its own public hostname on that tunnel, pointing at its local port (this one: `http://localhost:5000`). Nothing in this repo changes for it.
  - Each app gets its own Access application, with its own list of who gets in.
  - Later, optional: once everything goes through the tunnel, bind the port to `127.0.0.1:5000:5000` in `docker-compose.prod.yml`, so only the tunnel reaches it.
- Cloudflare Access in front of it, letting in only our two emails. No login screen in the app.
- Then: map each email to 💜 me / 💚 her (a prod setting), so favorites know who's using the app. Without an email (dev, or before Access), the browser's switch stays.

## Decided

- Domain: `07082020.xyz` (the subdomain for this app is still to pick).
- The two emails are known, one for 💜 me and one for 💚 her. They're kept out of this repo (it's public): they live in the Access policy in Cloudflare and, for the app, in a `.env` file on the server that is never committed.
- Me/her stays me/her: no named people.

## Left to do

- On the server (by hand): install cloudflared as a system service, add this app's hostname on the tunnel, and put an Access application with the two emails in front of it.
- Then, in the app: read the email Access passes along and map it to me/her (a prod setting, read from the server's `.env`, e.g. one variable per person), with the browser's switch as the fallback when there's no email.
