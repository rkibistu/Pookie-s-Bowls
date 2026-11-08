# Cloudflare Access is the login, not the app

The app has no login screen of its own. In prod it is reachable only on the home network until Cloudflare Tunnel and Cloudflare Access are set up; from then on Access decides who gets in (our two emails), and the app may read the logged-in email Access passes along to tell 💜 me from 💚 her. We chose this because two people don't justify building and securing passwords, sessions and resets ourselves.

## Consequences

- Don't add app-level auth; anything that needs to know "who is this" reads it from Access.
- Without Access (dev, or before it's set up) there is no email, so the browser's me/her switch stays as the fallback.
