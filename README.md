# AskLens Guard

I got tired of wondering whether a link or wallet address someone sent me was safe. AskLens Guard is an Android app that tells me in a few seconds.

In Telegram, X or my browser I tap Share, pick AskLens Guard, and a big green, amber or red answer comes back. Links are checked by three live checkers at once. Wallet addresses (Ethereum and Solana) are checked too. I can connect a Solana wallet, see a wallet profile, and save a signed receipt of any check on Solana.

## What keeps me coming back
- A daily streak and a count of risky things caught
- A history of everything I checked
- A share card I can post after catching something

## Run it
It needs a development build (not Expo Go) because of the wallet connection.

    npm install
    npx expo prebuild
    npx expo run:android

Cloud build of an APK: `eas build --platform android --profile preview`

Checks run against the live AskLens service. See .env.example for the two settings you can change.

## Credits

The scam site list on the phone is built from two public lists: the ScamSniffer scam-database (GPL v3) and the MetaMask eth-phishing-detect list. I keep only the entries that copy Solana and wallet names, and I do not claim the list is complete. You can rebuild it with `node scripts/make-blocklist.mjs`. Site age comes from the public RDAP registry.
