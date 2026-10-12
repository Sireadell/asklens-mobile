# AskLens PC companion

Copy a link or a wallet address on your PC, and your phone buzzes. Tap it and AskLens Guard runs the real check, so you know before you click or paste.

## Start it

You need Node 20 or newer and Windows PowerShell.

```powershell
cd pc-companion
npm install
node companion.js
```

The first time it prints an 8 character pairing code and a QR square. On the phone, open AskLens Guard, go to **Copy on PC**, and type the code (or scan the square). The code works once and lasts 10 minutes. After that it remembers the pairing and just starts watching.

## What it sends, and what it ignores

It looks at everything you copy but sends only when the whole copied text is one of these:

- a web link starting with `http://` or `https://`
- an Ethereum style address (`0x` and 40 characters)
- a Solana address (32 to 44 characters)

Anything else is ignored and goes nowhere: passwords, normal sentences, a paragraph with a link buried inside it. Whatever was already on the clipboard when you started is also skipped.

Each send prints one line, for example `sent to your phone: example.com`.

## Options

| Command | What it does |
|---|---|
| `node companion.js --pause` | Stops sending (even in a window that is already running) until you resume |
| `node companion.js --resume` | Sends again |
| `node companion.js --unpair` | Forgets your phone and deletes the saved pairing |
| `node companion.js --relay https://...` | Uses a different relay. You can also set `RELAY_URL`. The built in default is the `DEFAULT_RELAY` line at the top of `companion.js` |

## Where things are stored

The pairing is saved in `%APPDATA%\asklens-companion\pairing.json` in your user profile, never inside this folder. The relay keeps copied items for 10 minutes and then forgets them, see `../relay/README.md`.
