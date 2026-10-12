# Putting the relay online (Render, free plan)

You only do this once. It takes about 5 minutes. The relay folder is already set up for it.

1. Make sure the code is on GitHub (the `relay` folder must be in your repo).
2. Go to https://dashboard.render.com and sign in.
3. Click **New +**, then **Web Service**.
4. Pick **Build and deploy from a Git repository**, connect GitHub if it asks, and choose the AskLens Guard repo.
5. Fill in the form like this:

| Field | Put this |
|---|---|
| Name | `asklens-relay` |
| Root Directory | `relay` |
| Runtime / Language | Node |
| Build Command | `npm install` |
| Start Command | `node server.js` |
| Instance Type | Free |

6. Open **Advanced** and set **Health Check Path** to `/health`.
7. Click **Create Web Service** and wait for it to say **Live**. The first build takes a couple of minutes.
8. Copy the address at the top of the page. It looks like `https://asklens-relay.onrender.com` (yours may have extra letters).
9. Check it: open `https://YOUR-ADDRESS/health` in a browser. You should see `{"ok":true}`.
10. Tell the PC companion and the phone app the address:
    - PC: edit the line `const DEFAULT_RELAY = ...` at the top of `pc-companion/companion.js`, or run with `node companion.js --relay https://YOUR-ADDRESS`, or set the `RELAY_URL` variable.
    - Phone: the app session needs the same address in its relay setting.

## Good to know

- On the free plan Render puts the service to sleep after about 15 minutes with no visits. The first request after that takes up to a minute to wake it. Before a demo, open the `/health` address once so it is awake.
- Sleeping or restarting wipes the in-memory pairings. If that happens, run `node companion.js --unpair` and start again to get a new code.
- You do not need any environment variables. Render sets `PORT` for you.
