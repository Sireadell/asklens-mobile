# AskLens PC companion

Copy a link or a wallet address on your PC, and your phone buzzes. Tap it and AskLens Guard runs the real check, so you know before you click or paste.

## Set it up (about 2 minutes)

You need Node 20 or newer and Windows PowerShell. Open PowerShell and run these one at a time:

```powershell
cd C:\Users\DELL\asklens-mobile\pc-companion
npm install
node companion.js --tray
```

1. A small green **A** icon appears near the clock (click the little arrow if it is hidden), and a pairing window opens in your browser.
2. On your phone, open AskLens Guard, go to **Copy on PC**, then scan the square or type the 8 character code. The code works once and lasts 10 minutes.
3. Done. The window says "Paired with your phone". Close it. The icon keeps working.

Prefer a plain text window instead of the tray? Run `node companion.js` and the code and square appear in PowerShell.

## The tray icon

Right click the green **A**:

| Menu item | What it does |
|---|---|
| Open pairing window | Shows the code and square again, or lets you pair a new phone or unpair |
| Send to phone (tick) | Untick to pause. Nothing you copy is sent until you tick it again |
| Start when I sign in (tick) | Starts the companion by itself every time you sign in to Windows. Untick to stop that |
| Quit | Closes the companion |

## What it sends, and what it ignores

It looks at everything you copy but sends only when the whole copied text is one of these:

- a web link starting with `http://` or `https://`
- an Ethereum style address (`0x` and 40 characters)
- a Solana address or token mint (it must really be a valid one, so a long word or password is not mistaken for it)

Anything else is ignored and goes nowhere: passwords, normal sentences, a paragraph with a link buried inside it. What was already on the clipboard when you started is skipped. Copying the same thing twice within 30 seconds sends it once.

## Safety checks on this PC, before anything is sent

| Check | What happens |
|---|---|
| A link that is on your blocklist | Not sent. A Windows message tells you why |
| A link that looks like a fake of a popular site (for example `phantomm.app`) | Not sent. A Windows message tells you why |
| A link that hides its real site behind an `@` sign | Not sent |
| An address that looks almost the same as one you copied in the last 5 minutes but is different | Still sent, but you get a warning. This is a common trick to make you paste the wrong address |

Your own blocklist is a plain text file you can edit: `%APPDATA%\asklens-companion\blocklist.txt`. One site (like `bad-site.example`) or full link per line. Lines starting with `#` are notes.

## Other commands

| Command | What it does |
|---|---|
| `node companion.js --pause` | Stops sending until you resume |
| `node companion.js --resume` | Sends again |
| `node companion.js --repair` | Makes a fresh code to pair a new phone |
| `node companion.js --unpair` | Forgets your phone and deletes the saved pairing |
| `node companion.js --relay https://...` | Uses a different relay. You can also set `RELAY_URL`. The built in default is the `DEFAULT_RELAY` line at the top of `companion.js` |
| `npm test` | Runs the checks on the link and address rules (17 checks) |

## Where things are stored

The pairing is saved in `%APPDATA%\asklens-companion\pairing.json` in your user profile, never inside this folder. The pairing window runs only on this PC (127.0.0.1) and is not reachable from the network. The relay keeps copied items for 10 minutes and then forgets them, see `../relay/README.md`.
