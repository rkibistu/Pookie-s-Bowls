# Reach the app from outside home, with Cloudflare

Status: needs-info

Blocked by: 02

See `../spec.md` and ADR 0003. Not now: pick this up once prod is stable and we want it.

## The idea

- Cloudflare Tunnel from the prod laptop, so no router ports are opened.
- Cloudflare Access in front of it, letting in only our two emails. No login screen in the app.
- Then: map each email to 💜 me / 💚 her (a prod setting), so favorites know who's using the app. Without an email (dev, or before Access), the browser's switch stays.

## Open before starting

- Domain to use, the two emails, and whether to grill the email → person mapping (and whether me/her becomes named people) then.
