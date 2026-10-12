# AskLens Guard

Here is a scam that works on careful people. A stranger sends you a tiny payment from an address that starts and ends exactly like one you really use. Later you go to pay a friend, copy the address from your history, and send your money to the stranger. It is called address poisoning, and the address looks right because the first and last characters match.

AskLens Guard is an Android app for Solana Mobile that catches this. You save the people you pay as contacts. When you check an address, the app compares it with your contacts and with the addresses your wallet dealt with lately, and tells you in plain words if it is a lookalike. It also does the everyday version of the same job: in Telegram, X or the browser I tap Share on a link or address, pick AskLens Guard, and a big green, amber or red answer comes back in a few seconds.

## Try it in one minute
1. Install the APK (see "Run it" below) and open the app.
2. Tap the address poisoning demo on the Contacts screen. It checks a lookalike of a saved contact and warns you before you send.
3. Tap the scam demo button on the first screen. It checks a link that is on a public malware list right now. It only checks the link, it never opens it. The answer turns red, with the reasons listed under it.
4. In any app, tap Share on a link and pick AskLens Guard. Same answer, without leaving the app you were in.
5. Optional: connect a Solana wallet and save the result as a signed receipt on Solana. The Verify screen in History reads the receipt back from the chain.

## What it checks
| You give it | What happens |
|---|---|
| A link | Three live checkers run at once: NetWire URL Scan, URL Sentinel and PREFLIGHT Infrastructure Signals. The phone adds its own evidence: the ScamSniffer and MetaMask scam lists, how old the site is, and whether the name copies a known wallet or app. |
| A 0x (Ethereum style) address | The AskLens Telegraph checker and GoPlus Security answer side by side. |
| A Solana address | The app first works out what it is: a wallet, a token, a token account or a program. A token gets liquidity, holder and risk facts from Jupiter, DexScreener and RugCheck. A wallet gets its age, activity and holdings. |
| A QR code | Scanned, then checked like the above. |

The live checks come from Telegraph, a network of independent intelligence providers, through the AskLens service I built earlier (the `asklens` repo on my GitHub). Extra sources on the phone can only make an answer worse, never better. A green coin answer waits until every source has answered.

## More than a checker
- **Send guard and trusted contacts.** An exact match shows the contact's name. A lookalike gets a warning. This can only make an answer worse, never better.
- **Wallet checkup.** A score for your own wallet, the apps that can move your tokens, and a way to remove that access.
- **Signed receipts.** Save any check as a small note on Solana, signed by your wallet through Mobile Wallet Adapter. Test network or real network, your choice.
- **Link your PC.** Copy a link on your Windows computer and the verdict shows up on your phone. The code is in `pc-companion` and `relay`.
- **Daily habit.** A daily pledge with a goal ring, a streak, a count of risky things caught, a history, and a share card to post after catching something.
- **SKR holders.** Holding SKR gives a Holder badge on the share card and more daily checks.

## What this is not
- It is not a guarantee. Green means the sources I ask found nothing wrong, not that something is safe.
- No scam list covers Solana addresses, so a Solana address never gets a green stamp from the lists. It gets facts and a "Not sure" at best.
- It does not hold or move your money. The only thing the wallet signs is a receipt note, and only when you tap save.
- It is not complete. The on-phone scam list is built from two public lists and I do not claim it covers everything.
- The wallet connection, share-to-check and receipts need a real Android phone, so the automated tests do not cover them.

## Built in one day
I built the app on October 12, 2026, the day before the deadline. The first commit is at 2:54 PM and the 39 commits in the app itself run to 7:49 PM, with the GoPlus check and the final build added that night. Some corners are rougher than I would like, and the "What this is not" list above is my honest list of them.

## What I would add next
- GoPlus phishing site checks as one more opinion on links (I tested the free GoPlus endpoint live, but have not read its rate limits and terms yet).
- GoPlus Solana token checks next to RugCheck.
- Testing on more phones. The Share menu entry and the wallet connection have only been tried on one Android phone.
- A scam list for Solana addresses, once a public one exists.

## Run it
Cloud build of an APK (needs an Expo account):

    npm install
    npx eas-cli build --platform android --profile preview

Or run it on a connected phone from source. It needs a development build, not Expo Go, because of the wallet connection:

    npm install
    npx expo prebuild
    npx expo run:android

Checks run against the live AskLens service. `.env.example` lists the two settings you can change. Push notifications need a Firebase `google-services.json`, either in the project folder or as the EAS file variable `GOOGLE_SERVICES_JSON`.

## Tests

    npm test
    npm run typecheck

136 tests cover the answer logic, link and address reading, the GoPlus and token risk reading, contacts and the send guard, and proof reading.

## Built with
Expo and React Native, Solana Mobile Wallet Adapter, `@solana/web3.js`, the Solana memo program, and EAS Build.

## Credits
The scam site list on the phone is built from the ScamSniffer scam-database (GPL v3) and the MetaMask eth-phishing-detect list. I keep only the entries that copy Solana and wallet names. You can rebuild it with `node scripts/make-blocklist.mjs`. Site age comes from the public RDAP registry. 0x address second opinions come from GoPlus Security, token facts from Jupiter, DexScreener and RugCheck.
